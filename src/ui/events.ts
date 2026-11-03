import type { Game, GameEvent } from "../core/game";
import type { Renderer } from "../render/renderer";
import { EVENTS, type ActiveEvent, type Request } from "../sim/events";
import { fragmentMult, streakMult, type BuffId } from "../sim/modifiers";
import { fmt, fmtRpm } from "../util/format";
import { byId, h, setText } from "./dom";

const BUFF_NAMES: Record<BuffId, string> = {
  frenzy: "Frenesí",
  perfectRepair: "Reparación perfecta",
  oiled: "Recién engrasado",
  unstable: "Rueda estabilizada",
  resonance: "Resonancia",
  elixir: "Elixir de vapor",
  mystery: "Engranaje misterioso",
  bell: "Campanada: manivela ×50",
  storm: "Tormenta: sin calor",
};

const GEAR_ICON = `<svg viewBox="0 0 40 40" width="100%" height="100%"><circle cx="20" cy="20" r="13" fill="#ffd36b" stroke="#a87a1a" stroke-width="7" stroke-dasharray="5 4"/><circle cx="20" cy="20" r="9" fill="#ffe7a0"/><circle cx="20" cy="20" r="3.5" fill="#a87a1a"/></svg>`;
const WISP_ICON = `<svg viewBox="0 0 40 40" width="100%" height="100%"><path d="M20 4 C30 10 32 20 26 28 C22 34 14 34 12 28 C9 21 16 18 14 10 C18 14 20 8 20 4 Z" fill="#b9d2ff" fill-opacity="0.85"/><circle cx="20" cy="24" r="4" fill="#eef4ff"/></svg>`;
const PIGEON_ICON = `<svg viewBox="0 0 48 40" width="100%" height="100%"><ellipse cx="24" cy="25" rx="14" ry="10" fill="#9aa3b0"/><path d="M14 22 Q24 10 36 20 Q28 24 14 22 Z" fill="#7d8694"/><circle cx="35" cy="14" r="7" fill="#a9b2bf"/><circle cx="37" cy="13" r="1.6" fill="#1b1f26"/><path d="M41 15 L46 16 L41 17 Z" fill="#e8a33a"/><path d="M33 19 Q36 21 34 23" fill="none" stroke="#6fb38a" stroke-width="2"/><path d="M18 34 L18 38 M26 34 L26 38" stroke="#e8a33a" stroke-width="2"/></svg>`;
const OIL_ICON = `<svg viewBox="0 0 48 40" width="100%" height="100%"><path d="M8 18 H30 L34 36 H6 Z" fill="#6a6f78" stroke="#3c4048" stroke-width="2"/><path d="M30 20 L44 10" stroke="#6a6f78" stroke-width="4" stroke-linecap="round"/><path d="M14 18 Q18 8 26 18" fill="none" stroke="#3c4048" stroke-width="3"/><ellipse cx="45" cy="15" rx="2" ry="3" fill="#e8c23a"/></svg>`;

/** Botones, tarjetas y avisos de los eventos aleatorios, superpuestos al taller. */
export class EventsUI {
  private layer = byId("events");
  private buffsEl = byId("buffs");
  private banner = h("div", { class: "ev-banner", hidden: true });
  private shown: ActiveEvent | null = null;
  private el: HTMLElement | null = null;
  private update: (() => void) | null = null;

  constructor(
    private game: Game,
    private renderer: Renderer,
  ) {
    this.layer.append(this.banner);
  }

  /** Textos que suben desde donde ocurrió algo: el premio de cada evento. */
  handle(events: GameEvent[]): void {
    for (const e of events) {
      if (e.type !== "event") continue;
      const n = e.news;
      if (n.type === "resolve") this.popResult(n.kind, n.outcome, n.amount);
      else if (n.type === "miss" && n.kind === "unstable") this.notify("¡La rueda ha reventado!", "#ff6a4a");
      else if (n.type === "progress" && n.kind === "resonance") {
        this.notify(n.amount === -1 ? "Fuera de compás" : "¡Al compás!", n.amount === -1 ? "#8f8573" : "#9cc0ff");
      }
    }
  }

  frame(): void {
    const s = this.game.state;
    const a = s.events.active;
    if (a !== this.shown) {
      this.shown = a;
      this.el?.remove();
      this.el = null;
      this.update = null;
      if (a) this.build(a);
    }
    this.update?.();
    this.renderBuffs();
  }

  private build(a: ActiveEvent): void {
    const act = (action = "click") => () => this.game.actOnEvent(action);
    switch (a.kind) {
      case "golden": {
        const btn = h("button", { class: "ev-icon ev-golden", ariaLabel: "Engranaje dorado", onclick: act() });
        btn.innerHTML = GEAR_ICON;
        const y = 0.25 + Math.random() * 0.3;
        this.mount(btn, () => {
          const t = a.elapsed / a.duration;
          const w = this.layer.clientWidth;
          const hgt = this.layer.clientHeight;
          btn.style.left = `${-60 + (w + 120) * t}px`;
          btn.style.top = `${hgt * y + Math.sin(t * Math.PI * 6) * 18}px`;
          btn.style.transform = `translate(-50%, -50%) rotate(${t * 1440}deg)`;
        });
        break;
      }
      case "fragment": {
        const btn = h("button", { class: "ev-icon ev-wisp", ariaLabel: "Fragmento de recuerdo", onclick: act() });
        btn.innerHTML = WISP_ICON;
        btn.style.left = `${20 + Math.random() * 60}%`;
        btn.style.top = `${25 + Math.random() * 30}%`;
        this.mount(btn, () => {
          btn.style.opacity = String(Math.min(1, a.timeLeft / 2));
        });
        break;
      }
      case "jam": {
        const count = h("span", {});
        const btn = h("button", { class: "ev-tag ev-jam", onclick: act() }, h("span", { class: "ev-tag-icon" }, "⚒"), count);
        this.mount(btn, () => {
          this.placeOnShaft(btn, a.stage!, 0);
          setText(count, `¡Atasco! ${a.hits} golpes`);
        });
        break;
      }
      case "pigeon": {
        const btn = h("button", { class: "ev-icon ev-pigeon", ariaLabel: "Espantar la paloma", onclick: act() });
        btn.innerHTML = PIGEON_ICON;
        this.mount(btn, () => this.placeOnShaft(btn, a.stage!, -0.6));
        break;
      }
      case "oil": {
        const btn = h("button", { class: "ev-icon ev-oil", ariaLabel: "Engrasar el tren", onclick: act() });
        btn.innerHTML = OIL_ICON;
        this.mount(btn, () => {
          this.placeOnShaft(btn, 0, -0.9);
          btn.style.opacity = String(Math.min(1, a.timeLeft / 2));
        });
        break;
      }
      case "unstable": {
        const mult = h("span", { class: "ev-mult" });
        const btn = h("button", { class: "ev-tag ev-unstable", onclick: act("stabilize") }, mult, h("span", {}, "Estabilizar"));
        this.mount(btn, () => {
          this.placeOnShaft(btn, a.stage!, 0);
          setText(mult, `×${a.mult!.toFixed(1)}`);
          btn.style.setProperty("--shake", `${Math.min(6, (a.mult! - 1) * 1.2)}px`);
        });
        break;
      }
      case "peddler":
        this.buildPeddler(a);
        break;
      case "request":
        this.buildRequest(a);
        break;
      case "resonance": {
        const ring = h("span", { class: "ev-ring" });
        const label = h("span", { class: "ev-res-label" });
        const btn = h("button", { class: "ev-resonance", ariaLabel: "Pulsar al compás", onclick: act() }, ring, label);
        this.mount(btn, () => {
          const { period } = EVENTS.resonance;
          // El anillo se cierra sobre el botón justo en el compás.
          const phase = (a.elapsed % period) / period;
          ring.style.transform = `scale(${1 + 1.2 * (1 - phase)})`;
          ring.style.opacity = String(0.3 + 0.7 * phase);
          setText(label, `${a.hits ?? 0}/${EVENTS.resonance.minHits}+`);
        });
        break;
      }
      default:
        break;
    }
  }

  private buildPeddler(a: ActiveEvent): void {
    const o = a.offer!;
    const s = this.game.state;
    const desc = {
      brass: `Te cambia ${o.brass} de latón por ${fmt(o.cost)} monedas.`,
      elixir: "Elixir de vapor gratis: ingresos ×3 durante 45 s… pero el motor se pone al rojo.",
      mystery: `Un engranaje misterioso por ${fmt(o.cost)} monedas. ¿Funcionará?`,
    }[o.kind];
    const accept = h("button", { class: "buy", onclick: () => this.game.actOnEvent("accept") }, "Aceptar");
    const reject = h("button", { class: "buy", onclick: () => this.game.actOnEvent("reject") }, "No, gracias");
    const fill = h("div", { class: "fill" });
    const card = h("div", { class: "ev-card ev-peddler" },
      h("div", { class: "ev-card-title" }, "El chatarrero"),
      h("p", {}, desc),
      h("div", { class: "ev-card-actions" }, reject, accept),
      h("div", { class: "bar" }, fill),
    );
    this.mount(card, () => {
      accept.classList.toggle("affordable", o.cost <= s.coins);
      accept.disabled = o.cost > s.coins;
      fill.style.width = `${(a.timeLeft / a.duration) * 100}%`;
    });
  }

  private buildRequest(a: ActiveEvent): void {
    const r = a.request!;
    const goal = h("p", {});
    const progress = h("div", { class: "ev-progress" });
    const fill = h("div", { class: "fill" });
    const time = h("span", { class: "muted" });
    const reward = r.reward.brass > 0
      ? `Premio: ${fmt(r.reward.coins)} monedas y ${r.reward.brass} de latón`
      : `Premio: ${fmt(r.reward.coins)} monedas`;
    const card = h("div", { class: "ev-card ev-request" },
      h("div", { class: "ev-card-title" }, `Pedido de ${r.who}`),
      goal,
      h("div", { class: "bar ev-req-bar" }, fill),
      h("div", { class: "ev-req-foot" }, progress, time),
      h("div", { class: "muted ev-reward" }, reward),
    );
    this.mount(card, () => {
      setText(goal, requestGoal(r));
      setText(progress, requestProgress(r));
      setText(time, `${Math.ceil(a.timeLeft)} s`);
      fill.style.width = `${Math.min(100, (r.progress / r.target) * 100)}%`;
    });
  }

  private mount(el: HTMLElement, update: () => void): void {
    this.el = el;
    this.update = update;
    this.layer.append(el);
    update();
  }

  /** Coloca un elemento sobre un eje; `dy` desplaza en radios (negativo = encima). */
  private placeOnShaft(el: HTMLElement, shaft: number, dy: number): void {
    const p = this.renderer.shaftScreen(shaft);
    if (!p) return;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y + dy * p.r}px`;
  }

  private renderBuffs(): void {
    const s = this.game.state;
    const chips: HTMLElement[] = [];
    let bannerText = "";
    for (const b of s.events.buffs) {
      const pct = (b.timeLeft / b.duration) * 100;
      const label = b.mult !== 1 ? `${BUFF_NAMES[b.id]} ×${fmt(b.mult)}` : BUFF_NAMES[b.id];
      const bar = h("div", { class: "buff-bar" });
      bar.style.width = `${pct.toFixed(1)}%`;
      chips.push(h("div", { class: `buff buff-${b.id}` }, h("span", {}, `${label} · ${Math.ceil(b.timeLeft)} s`), bar));
      if (b.id === "bell") bannerText = "¡Campanada! Gira la manivela: cada vuelta vale ×50";
      if (b.id === "storm") bannerText = "¡Tormenta! La sobremarcha no calienta";
    }
    if (s.events.streak > 0) chips.push(h("div", { class: "buff buff-streak" }, `Racha ${s.events.streak} · ×${streakMult(s).toFixed(2)}`));
    if (s.events.fragments > 0) {
      chips.push(h("div", { class: "buff buff-fragments" }, `Recuerdos ${s.events.fragments}/${EVENTS.maxFragments} · ×${fragmentMult(s).toFixed(2)}`));
    }
    // Reconstruir los chips cada frame es barato (son pocos) y evita llevar la cuenta de cuáles cambian.
    this.buffsEl.replaceChildren(...chips);
    this.banner.hidden = bannerText === "";
    setText(this.banner, bannerText);
  }

  private popResult(kind: string, outcome: string, amount?: number): void {
    const texts: Record<string, string> = {
      "golden:coins": `+${fmt(amount ?? 0)} monedas`,
      "golden:frenzy": "¡Frenesí ×7!",
      "golden:cool": "¡Motor frío!",
      "fragment:fragment": `Recuerdo ${amount}/${EVENTS.maxFragments}`,
      "jam:perfect": "¡Reparación perfecta! ×2",
      "jam:fixed": "Desatascado",
      "pigeon:brass": "+1 latón",
      "pigeon:coins": `+${fmt(amount ?? 0)} monedas`,
      "pigeon:shooed": "¡Fuera, paloma!",
      "oil:oiled": "Recién engrasado ×1.25",
      "unstable:stabilized": `¡Estabilizada! ×${(amount ?? 1).toFixed(1)}`,
      "peddler:brass": `+${amount} latón`,
      "peddler:elixir": "Elixir ×3",
      "peddler:mystery": "¡Funciona! ×5",
      "peddler:junk": "Era chatarra…",
      "request:done": `¡Pedido cumplido! +${fmt(amount ?? 0)}`,
      "resonance:tuned": `¡Resonancia ×${(amount ?? 1).toFixed(1)}!`,
    };
    const text = texts[`${kind}:${outcome}`];
    if (text) this.notify(text, outcome === "junk" ? "#8f8573" : "#ffd36b");
  }

  private notify(text: string, color: string): void {
    const el = h("div", { class: "ev-notify" }, text);
    el.style.color = color;
    this.layer.append(el);
    setTimeout(() => el.remove(), 1800);
  }
}

function requestGoal(r: Request): string {
  switch (r.kind) {
    case "speed":
      return `«¿Puedes hacer que la salida llegue a ${fmtRpm(r.target)}?»`;
    case "buys":
      return `«Necesito que hagas ${r.target} mejoras para la feria.»`;
    case "stage":
      return "«¿Podrías añadir un engranaje nuevo al tren?»";
    case "hold":
      return `«Mantén la sobremarcha ${r.target} segundos seguidos sin gripar.»`;
    case "earn":
      return `«Hacen falta ${fmt(r.target)} monedas para arreglar el puente.»`;
  }
}

function requestProgress(r: Request): string {
  switch (r.kind) {
    case "speed":
      return `${fmtRpm(r.progress)} / ${fmtRpm(r.target)}`;
    case "hold":
      return `${r.progress.toFixed(1)} / ${r.target} s`;
    case "stage":
      return r.progress >= 1 ? "¡Hecho!" : "Pendiente";
    default:
      return `${fmt(r.progress)} / ${fmt(r.target)}`;
  }
}
