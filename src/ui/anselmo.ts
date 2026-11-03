import type { Game, GameEvent } from "../core/game";
import { EVENT_LINES, FRAGMENTS, pickTip, REACTIONS, SMALL_TALK, type Expr, type Line, type ReactionId } from "../sim/dialogue";
import { clockProgress, teethMaxed } from "../sim/economy";
import { claimReaction, storyPage } from "../sim/story";
import { anselmoSvg } from "./anselmoArt";
import { byId, h, setText } from "./dom";

type Kind = "story" | "reaction" | "tip";

interface Message {
  kind: Kind;
  lines: Line[];
  /** Solo en la historia: qué parte es, para avisar al terminar. */
  storyId?: string;
  /** Anuncio de un evento: deja de tener sentido cuando el evento termina. */
  eventKind?: string;
}

const CHARS_PER_SECOND = 45;
/** Un "bip" de voz cada tantas letras. */
const BLIP_EVERY = 3;
/** Reacciones y consejos se cierran solos: unos segundos más lo que tarda en leerse la frase. */
const LINGER_SECONDS = 2.5;
const READ_CHARS_PER_SECOND = 22;
/** Consejo automático tras tanto tiempo sin comprar, y nunca más seguido que el enfriamiento. */
const AUTO_TIP_IDLE = 40;
const TIP_COOLDOWN = 75;
const STALL_COOLDOWN = 120;
/** Como mucho tantas reacciones y consejos esperando: el resto se descarta, no se acumula. */
const MAX_PENDING_CHATTER = 2;

/**
 * Anselmo, el eco de vapor: un retrato abajo a la izquierda con un bocadillo que escribe letra a
 * letra. No bloquea el juego. Lleva una cola para que historia, reacciones y consejos no se pisen.
 */
export class AnselmoUI {
  /** Al terminar de contar una parte de la historia (el final abre la pantalla de fin). */
  onStoryDone: ((id: string) => void) | null = null;
  /** Cada pocas letras escritas, para el sonido de voz. */
  onBlip: (() => void) | null = null;

  private root = byId("anselmo");
  private portrait = h("button", { class: "anselmo-portrait", title: "Habla con Anselmo", ariaLabel: "Habla con Anselmo" });
  private bubble = h("div", { class: "anselmo-bubble", hidden: true });
  private textEl = h("span", { class: "anselmo-text" });
  private more = h("div", { class: "anselmo-more" });

  private queue: Message[] = [];
  private current: Message | null = null;
  private lineIndex = 0;
  private chars = 0;
  private linger = 0;
  private expr: Expr | null = null;
  /** Segundos sin comprar nada. */
  private idle = 0;
  private sinceTip = 0;
  private sinceStall = STALL_COOLDOWN;
  private lastTip: string | undefined;
  private smallTalk = 0;

  constructor(private game: Game) {
    this.bubble.append(h("div", { class: "anselmo-name" }, "Anselmo"), this.textEl, this.more);
    this.root.append(this.portrait, this.bubble);
    this.setExpr("normal");
    this.portrait.addEventListener("click", () => (this.current ? this.advance() : this.chat()));
    this.bubble.addEventListener("click", () => this.advance());
  }

  /** Vuelve a contar una parte de la historia (desde Recuerdos), interrumpiendo lo que diga. */
  retell(id: string): void {
    const page = storyPage(id);
    if (!page) return;
    this.queue = this.queue.filter((m) => m.kind === "story");
    this.queue.unshift({ kind: "story", lines: page.lines });
    this.current = null;
  }

  handle(events: GameEvent[]): void {
    const s = this.game.state;
    for (const e of events) {
      switch (e.type) {
        case "buy":
          this.idle = 0;
          if (e.what === "stage") this.react("firstStage");
          else if (e.what === "teeth" && s.shafts.some((_, i) => i > 0 && teethMaxed(s, i))) this.react("firstMaxTeeth");
          break;
        case "tier":
          if (e.tier >= 2) this.react("firstMaterial");
          break;
        case "stall":
          if (!this.react("firstStall") && this.sinceStall >= STALL_COOLDOWN) this.react("stallAgain");
          this.sinceStall = 0;
          break;
        case "brass":
          this.idle = 0;
          this.react("firstBrass");
          break;
        case "rebirth":
          this.idle = 0;
          // La primera fundición ya la comenta la historia.
          if (s.rebirths > 1) this.react("rebirthAgain");
          break;
        case "event": {
          const n = e.news;
          if (n.type === "progress") break;
          this.idle = 0;
          if (n.type === "resolve" && n.kind === "fragment") {
            // Los recuerdos se leen con calma: esperan al clic, como la historia.
            const line = FRAGMENTS[(n.amount ?? 1) - 1];
            if (line) this.enqueue({ kind: "story", lines: [line] });
            break;
          }
          if (n.type === "spawn") {
            const line = EVENT_LINES[`spawn:${n.kind}`];
            if (line) this.enqueue({ kind: "reaction", lines: [line], eventKind: n.kind });
            break;
          }
          // El evento ya terminó: su anuncio sobra, se corte o no haya empezado.
          this.queue = this.queue.filter((m) => m.eventKind !== n.kind);
          if (this.current?.eventKind === n.kind) this.finish();
          const line = EVENT_LINES[`${n.kind}:${n.outcome}`];
          if (line) this.enqueue({ kind: "reaction", lines: [line] });
          break;
        }
      }
    }
  }

  update(dt: number): void {
    const s = this.game.state;
    this.idle += dt;
    this.sinceTip += dt;
    this.sinceStall += dt;

    // La historia pendiente (también la desbloqueada offline) va de una en una.
    const storyBusy = this.current?.kind === "story" || this.queue.some((m) => m.kind === "story");
    if (!storyBusy && s.story.unread.length > 0) {
      const id = s.story.unread.shift()!;
      const page = storyPage(id);
      if (page) this.enqueue({ kind: "story", lines: page.lines, storyId: id });
    }

    if (s.overdrive > 0.6) this.react("firstOverdrive");

    if (!this.current && this.queue.length === 0 && this.idle >= AUTO_TIP_IDLE && this.sinceTip >= TIP_COOLDOWN) {
      const tip = pickTip(s, { idle: this.idle }, this.lastTip);
      if (tip) {
        this.lastTip = tip.id;
        this.enqueue({ kind: "tip", lines: tip.lines });
      }
      this.sinceTip = 0;
    }

    if (!this.current && this.queue.length > 0) this.start(this.queue.shift()!);
    if (this.current) this.type(dt);

    // Cuanto más cerca está el reloj de arrancar, más nítido se ve. Al hablar se condensa.
    const clarity = s.story.ended ? 1 : clockProgress(s);
    const opacity = this.current ? 0.5 + 0.5 * clarity : 0.2 + 0.35 * clarity;
    this.portrait.style.opacity = opacity.toFixed(2);
    this.portrait.classList.toggle("speaking", this.current !== null);
  }

  /** Pulsar a Anselmo sin que esté hablando: un consejo útil, o una charla si no hay ninguno. */
  private chat(): void {
    const tip = pickTip(this.game.state, { idle: this.idle });
    if (tip) {
      this.enqueue({ kind: "tip", lines: tip.lines });
    } else {
      this.enqueue({ kind: "tip", lines: [SMALL_TALK[this.smallTalk++ % SMALL_TALK.length]] });
    }
    this.sinceTip = 0;
  }

  /** Devuelve false si la reacción ya se dijo y es de una sola vez. */
  private react(id: ReactionId): boolean {
    if (!claimReaction(this.game.state, id)) return false;
    this.enqueue({ kind: "reaction", lines: REACTIONS[id].lines });
    return true;
  }

  private enqueue(m: Message): void {
    if (m.kind === "story") {
      // La historia va delante de cualquier charla pendiente, pero detrás de otra historia.
      const at = this.queue.findIndex((q) => q.kind !== "story");
      if (at < 0) this.queue.push(m);
      else this.queue.splice(at, 0, m);
      return;
    }
    if (this.queue.filter((q) => q.kind !== "story").length >= MAX_PENDING_CHATTER) return;
    this.queue.push(m);
  }

  private start(m: Message): void {
    this.current = m;
    this.lineIndex = 0;
    this.chars = 0;
    this.linger = 0;
    this.bubble.hidden = false;
    this.bubble.classList.remove("pop");
    void this.bubble.offsetWidth;
    this.bubble.classList.add("pop");
    this.showLine();
  }

  private showLine(): void {
    const line = this.current!.lines[this.lineIndex];
    this.setExpr(line.expr);
    setText(this.textEl, "");
    setText(this.more, "");
  }

  private type(dt: number): void {
    const m = this.current!;
    const line = m.lines[this.lineIndex];
    if (this.chars < line.text.length) {
      const before = Math.floor(this.chars);
      this.chars = Math.min(line.text.length, this.chars + CHARS_PER_SECOND * dt);
      const after = Math.floor(this.chars);
      if (Math.floor(after / BLIP_EVERY) > Math.floor(before / BLIP_EVERY)) this.onBlip?.();
      setText(this.textEl, line.text.slice(0, after));
      if (after >= line.text.length) setText(this.more, this.moreHint());
      return;
    }
    if (m.kind !== "story") {
      this.linger += dt;
      if (this.linger >= LINGER_SECONDS + line.text.length / READ_CHARS_PER_SECOND) this.nextLine();
    }
  }

  private moreHint(): string {
    const m = this.current!;
    if (m.kind !== "story") return "";
    return this.lineIndex < m.lines.length - 1 ? "clic para seguir ▸" : "clic para cerrar";
  }

  /** Clic: si está escribiendo, completa la frase; si no, pasa a la siguiente. */
  private advance(): void {
    const m = this.current;
    if (!m) return;
    const line = m.lines[this.lineIndex];
    if (this.chars < line.text.length) {
      this.chars = line.text.length;
      setText(this.textEl, line.text);
      setText(this.more, this.moreHint());
    } else {
      this.nextLine();
    }
  }

  private nextLine(): void {
    const m = this.current!;
    this.lineIndex++;
    this.chars = 0;
    this.linger = 0;
    if (this.lineIndex < m.lines.length) {
      this.showLine();
      return;
    }
    this.finish();
    if (m.storyId) this.onStoryDone?.(m.storyId);
  }

  /** Cierra el mensaje actual sin esperar a que termine. */
  private finish(): void {
    this.current = null;
    this.bubble.hidden = true;
    this.setExpr("normal");
  }

  private setExpr(expr: Expr): void {
    if (this.expr === expr) return;
    this.expr = expr;
    this.portrait.innerHTML = anselmoSvg(expr);
  }
}
