import type { Game, OfflineSummary } from "../core/game";
import { decodeExport, encodeExport } from "../core/save";
import { ACHIEVEMENTS, achievement, achievementBonusText } from "../sim/achievements";
import { BRASS, brassCost, brassLevel, brassMaxed } from "../sim/brass";
import { CONFIG } from "../sim/config";
import {
  brassForReset,
  gearboxCost,
  gearboxHeat,
  gearboxUnlocked,
  gearOf,
  globalMult,
  MAX_TIER,
  material,
  motorBaseRps,
  motorBulk,
  motorCount,
  overdriveMax,
  overdriveUnlocked,
  pinionTeeth,
  stageCost,
  stageCount,
  stageRatio,
  teethBulk,
  teethCost,
  teethMaxed,
  tierOf,
  wheelTeeth,
} from "../sim/economy";
import { STORY } from "../sim/dialogue";
import { clockProgress } from "../sim/story";
import { heatOf, heatRgb } from "../render/renderer";
import { EVENTS } from "../sim/events";
import { fmt, fmtDuration, fmtRpm } from "../util/format";
import { byId, h, setText, showModal } from "./dom";

interface HudActions {
  load(json: string): void;
  wipe(): void;
  setMuted(muted: boolean): void;
  toggleView(): boolean;
  /** Anselmo vuelve a contar una parte de la historia. */
  retell(id: string): void;
  setReduceMotion(on: boolean): void;
}

interface StageRow {
  shaft: number;
  chip: HTMLElement;
  meta: HTMLElement;
  fill: HTMLElement;
  next: HTMLElement;
  btn: HTMLButtonElement;
  label: HTMLElement;
  cost: HTMLElement;
  /** Caja de cambios: instalar, o elegir marcha. */
  gearRow: HTMLElement;
  install: HTMLButtonElement;
  installCost: HTMLElement;
  short: HTMLButtonElement;
  long: HTMLButtonElement;
}

/** Un botón de la barra inferior: título, una línea de detalle y un precio. */
interface ActionButton {
  btn: HTMLButtonElement;
  sub: HTMLElement;
  cost: HTMLElement;
  badge: HTMLElement;
}

const AMOUNTS = [1, 10, Infinity];

export class Hud {
  private amount = 1;
  /** Actualiza la ventana abierta (taller, fundición) cada frame; null si no hay ninguna. */
  private live: (() => void) | null = null;

  private coins = byId("coins");
  private income = byId("income");
  private rpm = byId("rpm");
  private mult = byId("mult");
  private goalPct = byId("goal-pct");
  private goalFill = byId("goal-fill");
  private goalMeta = byId("goal-meta");
  private odBtn = byId<HTMLButtonElement>("od-btn");
  private odLabel = byId("od-label");
  private heatFill = byId("heat-fill");
  private toastEl = byId("toast");
  private toastTimer = 0;
  private achievementEl = byId("achievement-toast");
  private achievementQueue: string[] = [];
  private achievementTimer = 0;

  private motor = this.action("Mejorar motor", () => this.game.buyMotor(this.amount));
  private gears = this.action("Engranajes", () => this.openWorkshop());
  private stage = this.action("Añadir engranaje", () => this.game.buyStage());
  private foundry = this.action("Renacer", () => this.openFoundry());

  constructor(
    private game: Game,
    private actions: HudActions,
  ) {
    this.foundry.btn.classList.add("foundry");
    byId("actions").replaceChildren(this.motor.btn, this.gears.btn, this.stage.btn, this.foundry.btn);
    byId("view-btn").addEventListener("click", (e) => {
      const all = this.actions.toggleView();
      setText(e.currentTarget as HTMLElement, all ? "Seguir la salida" : "Ver todo el tren");
    });
    byId("memories-btn").addEventListener("click", () => this.openMemories());
    byId("settings-btn").addEventListener("click", () => this.openSettings());
    byId("achievements-btn").addEventListener("click", () => this.openAchievements());
  }

  /** Atajos de teclado (sin ventanas abiertas). Devuelve true si la tecla hizo algo. */
  handleKey(key: string): boolean {
    switch (key.toLowerCase()) {
      case "m":
        this.game.buyMotor(this.amount);
        return true;
      case "e":
        this.game.buyStage();
        return true;
      case "t":
        this.openWorkshop();
        return true;
      case "f":
        this.openFoundry();
        return true;
      case "l":
        this.openAchievements();
        return true;
      case "r":
        this.openMemories();
        return true;
      case "v":
        byId("view-btn").click();
        return true;
      case "1":
      case "2":
      case "3":
        this.amount = AMOUNTS[Number(key) - 1];
        this.toast(`Comprar ${this.amount === Infinity ? "al máximo" : `×${this.amount}`}`, 1200);
        return true;
      default:
        return false;
    }
  }

  /** Aviso de logro conseguido: arriba, de uno en uno. */
  showAchievement(id: string): void {
    this.achievementQueue.push(id);
    if (this.achievementTimer === 0) this.nextAchievement();
  }

  private nextAchievement(): void {
    const id = this.achievementQueue.shift();
    const a = id ? achievement(id) : undefined;
    if (!a) {
      this.achievementEl.hidden = true;
      this.achievementTimer = 0;
      return;
    }
    this.achievementEl.replaceChildren(
      h("span", { class: "ach-star" }, "★"),
      h("span", {}, h("span", { class: "ach-label" }, "Logro: "), a.name),
      h("span", { class: "ach-bonus" }, `+${Math.round(CONFIG.achievementBonus * 100)}%`),
    );
    this.achievementEl.hidden = false;
    this.achievementEl.classList.remove("show");
    void this.achievementEl.offsetWidth;
    this.achievementEl.classList.add("show");
    this.achievementTimer = window.setTimeout(() => this.nextAchievement(), 3200);
  }

  private action(title: string, onClick: () => void): ActionButton {
    const sub = h("span", { class: "a-sub" });
    const cost = h("span", { class: "a-cost" });
    const badge = h("span", { class: "a-badge" });
    const btn = h("button", { class: "action", onclick: onClick },
      h("span", { class: "a-title" }, title, badge), sub, cost);
    return { btn, sub, cost, badge };
  }

  /** Selector ×1 / ×10 / Máx; se comparte entre el motor y el taller. */
  private amountBar(): HTMLElement {
    const buttons = AMOUNTS.map((a) =>
      h("button", {
        class: a === this.amount ? "active" : "",
        onclick: () => {
          this.amount = a;
          buttons.forEach((b, i) => b.classList.toggle("active", AMOUNTS[i] === a));
        },
      }, a === Infinity ? "Máx" : `×${a}`),
    );
    return h("div", { class: "amounts" }, h("span", { class: "muted" }, "Comprar"), ...buttons);
  }

  // --- Ventanas ---

  /** Abre una ventana cuyo contenido se actualiza cada frame mientras está abierta. */
  private openLive(title: string, build: (root: HTMLElement) => () => void, extra: HTMLElement[] = []): void {
    const root = h("div", { class: "live" });
    const update = build(root);
    showModal(title, [...extra, root], [{ label: "Cerrar", primary: true }], {
      wide: true,
      onClose: () => {
        if (this.live === update) this.live = null;
      },
    });
    this.live = update;
    update();
  }

  private openWorkshop(): void {
    const g = this.game;
    const buyAll = h("button", { class: "buy wide-btn", onclick: () => g.buyAllTeeth() }, "Mejorar todo lo que alcance (lo más barato primero)");
    const heatInfo = h("span", { class: "muted" });
    const gearBar = h("div", { class: "gear-bar" },
      h("span", { class: "gear-bar-title" }, "Marchas"),
      h("button", { class: "buy gear-short", onclick: () => g.setGear(0, 1) }, "Todas cortas"),
      h("button", { class: "buy gear-long", onclick: () => g.setGear(0, 2) }, "Todas largas"),
      heatInfo,
    );
    this.openLive("Taller de engranajes", (root) => {
      let rows: StageRow[] = [];
      let built = -1;
      return () => {
        const s = g.state;
        if (built !== s.shafts.length) {
          built = s.shafts.length;
          rows = [];
          root.replaceChildren();
          if (stageCount(s) === 0) root.append(h("p", { class: "muted" }, "Aún no hay engranajes. Añade el primero con el botón «Añadir engranaje»."));
          for (let i = stageCount(s); i >= 1; i--) {
            const row = this.stageRow(i);
            rows.push(row);
            root.append(row.btn.parentElement!);
          }
        }
        for (const r of rows) this.updateStageRow(r);
        buyAll.classList.toggle("affordable", this.affordableTeethCount() > 0);
        gearBar.hidden = !gearboxUnlocked(s);
        const heat = gearboxHeat(s);
        const cool = CONFIG.overdrive.coolPerSec;
        setText(heatInfo, heat > cool
          ? `Calor de las marchas: +${heat.toFixed(2)}/s. ¡El motor no da abasto!`
          : `Calor de las marchas: ${heat >= 0 ? "+" : ""}${heat.toFixed(2)}/s (el motor enfría ${cool.toFixed(2)}/s)`);
        heatInfo.classList.toggle("danger-text", heat > cool);
      };
    }, [
      h("p", { class: "muted" }, "Más dientes en una rueda = el piñón que mueve gira más rápido. La relación de cada etapa multiplica todo lo que viene detrás."),
      this.amountBar(),
      buyAll,
      gearBar,
    ]);
  }

  private stageRow(i: number): StageRow {
    const row: StageRow = {
      shaft: i,
      chip: h("span", { class: "chip" }),
      meta: h("div", { class: "meta" }),
      fill: h("div", { class: "fill" }),
      next: h("span", { class: "next muted" }),
      label: h("span", {}),
      cost: h("span", { class: "cost" }),
      btn: h("button", { class: "buy" }),
      gearRow: h("div", { class: "gear-row" }),
      install: h("button", { class: "buy" }),
      installCost: h("span", { class: "cost" }),
      short: h("button", { class: "gear-btn gear-short" }, `Corta ×${CONFIG.gearbox.short}`),
      long: h("button", { class: "gear-btn gear-long" }, `Larga ×${CONFIG.gearbox.long}`),
    };
    row.btn.append(row.label, row.cost);
    row.btn.onclick = () => this.game.buyTeeth(i, this.amount);
    row.install.append(h("span", {}, "Instalar caja de cambios"), row.installCost);
    row.install.onclick = () => this.game.buyGearbox(i);
    row.short.onclick = () => this.game.setGear(i, 1);
    row.long.onclick = () => this.game.setGear(i, 2);
    row.gearRow.append(row.install, row.short, row.long);
    h("div", { class: "card stage-row" },
      h("div", { class: "card-head" }, h("span", { class: "title" }, `Etapa ${i}`), row.chip),
      row.meta,
      h("div", { class: "tier-row" }, h("div", { class: "bar" }, row.fill), row.next),
      row.btn,
      row.gearRow,
    );
    return row;
  }

  private updateStageRow(c: StageRow): void {
    const g = this.game;
    const s = g.state;
    const sh = s.shafts[c.shaft];
    if (!sh) return;
    const tier = tierOf(sh.revs);
    const m = material(tier);
    setText(c.chip, m.name);
    c.chip.style.setProperty("--c", m.color);
    const p = pinionTeeth(s);
    setText(c.meta, `×${stageRatio(s, c.shaft).toFixed(2)} · ${wheelTeeth(sh.teethLevel)}:${p} dientes · ${fmtRpm(g.speeds[c.shaft] ?? 0)}`);
    if (tier >= MAX_TIER) {
      c.fill.style.width = "100%";
      setText(c.next, "Máximo");
    } else {
      const lo = tier === 0 ? 0 : 10 ** tier;
      const hi = 10 ** (tier + 1);
      c.fill.style.width = `${Math.min(100, ((sh.revs - lo) / (hi - lo)) * 100).toFixed(1)}%`;
      setText(c.next, material(tier + 1).name);
    }
    c.fill.style.background = m.color;
    if (teethMaxed(s, c.shaft)) {
      setText(c.label, "Dientes al máximo");
      setText(c.cost, "");
      c.btn.classList.remove("affordable");
      c.btn.disabled = true;
    } else {
      const b = teethBulk(s, c.shaft, this.amount);
      const levels = Math.max(1, b.count);
      setText(c.label, `+${levels * CONFIG.teethPerLevel} dientes → ×${(wheelTeeth(sh.teethLevel + levels) / p).toFixed(2)}`);
      setText(c.cost, fmt(b.cost));
      c.btn.disabled = false;
      c.btn.classList.toggle("affordable", b.cost <= s.coins);
    }
    const gear = gearOf(s, c.shaft);
    c.gearRow.hidden = !gearboxUnlocked(s);
    c.install.hidden = gear !== 0;
    c.short.hidden = gear === 0;
    c.long.hidden = gear === 0;
    if (gear === 0) {
      const cost = gearboxCost(c.shaft);
      setText(c.installCost, fmt(cost));
      c.install.classList.toggle("affordable", cost <= s.coins);
    } else {
      c.short.classList.toggle("active", gear === 1);
      c.long.classList.toggle("active", gear === 2);
    }
  }

  private affordableTeethCount(): number {
    const s = this.game.state;
    let n = 0;
    for (let i = 1; i < s.shafts.length; i++) {
      if (!teethMaxed(s, i) && teethCost(i, s.shafts[i].teethLevel) <= s.coins) n++;
    }
    return n;
  }

  /** Fundición: renacer arriba y la tienda de latón debajo, en una sola ventana. */
  private openFoundry(): void {
    const g = this.game;
    const brass = h("div", { class: "brass-amount big" });
    const info = h("p", { class: "muted" });
    const gainEl = h("p", { class: "big-gain" });
    const meltLabel = h("span", {});
    const melt = h("button", { class: "buy wide-btn", onclick: () => this.confirmRebirth() }, meltLabel);
    const shopTitle = h("h3", { class: "section-title" }, "Tienda de latón");
    this.openLive("Fundición", (root) => {
      const rows = BRASS.map((d) => {
        const level = h("span", { class: "muted" });
        const now = h("div", { class: "meta" });
        const next = h("div", { class: "meta next-effect" });
        const cost = h("span", { class: "cost" });
        const btn = h("button", { class: "buy", onclick: () => g.buyBrass(d.id) }, h("span", {}, "Mejorar"), cost);
        const extra = h("div", {});
        if (d.id === "automaton") {
          const toggle = h("label", { class: "toggle" });
          const box = h("input", { type: "checkbox", checked: g.state.settings.automaton });
          box.onchange = () => {
            g.state.settings.automaton = box.checked;
          };
          toggle.append(box, " Autómata encendido");
          extra.append(toggle);
        }
        root.append(h("div", { class: "card" }, h("div", { class: "card-head" }, h("span", { class: "title" }, d.name), level), now, next, btn, extra));
        return { d, level, now, next, cost, btn, extra };
      });
      return () => {
        const s = g.state;
        const gain = brassForReset(s);
        setText(brass, `${fmt(s.brass)} de latón`);
        setText(info, s.freeStages > 0
          ? `Cada engranaje que construyas en este ciclo vale 1 de latón (los ${s.freeStages} de los Planos no cuentan). Puedes renacer cuando quieras.`
          : "Cada engranaje que construyas en este ciclo vale 1 de latón. Puedes renacer cuando quieras: pierdes el tren, pero el latón compra mejoras permanentes.");
        setText(gainEl, `+${fmt(gain)} de latón`);
        setText(meltLabel, "Fundir el tren y renacer");
        melt.classList.toggle("affordable", gain > 0);
        for (const r of rows) {
          const lvl = brassLevel(s, r.d.id);
          setText(r.level, r.d.max === Infinity ? `nivel ${lvl}` : `${lvl}/${r.d.max}`);
          setText(r.now, r.d.effect(lvl));
          r.extra.hidden = lvl === 0;
          if (brassMaxed(s, r.d.id)) {
            setText(r.next, "");
            setText(r.cost, "Al máximo");
            r.btn.disabled = true;
            r.btn.classList.remove("affordable");
          } else {
            setText(r.next, `→ ${r.d.effect(lvl + 1)}`);
            const c = brassCost(s, r.d.id);
            setText(r.cost, `${fmt(c)} latón`);
            r.btn.disabled = false;
            r.btn.classList.toggle("affordable", c <= s.brass);
          }
        }
      };
    }, [brass, info, gainEl, melt, shopTitle]);
  }

  private confirmRebirth(): void {
    const s = this.game.state;
    const gain = brassForReset(s);
    const keep = s.brassUpgrades.blueprints ? ` Los Planos te devuelven ${brassLevel(s, "blueprints")} etapas al empezar.` : "";
    showModal("Fundir el tren", [
      h("p", {}, `Echarás al horno el tren entero: monedas, motor, etapas y materiales de este ciclo.${keep}`),
      h("p", {}, "Conservas el latón, sus mejoras, los recuerdos de Anselmo y tu récord de velocidad."),
      h("p", { class: "big-gain" }, `+${fmt(gain)} de latón`),
      ...(gain > 0 ? [] : [h("p", { class: "muted" }, "Aún no has construido ningún engranaje en este ciclo: no ganarás latón.")]),
    ], [
      { label: "Todavía no", onClick: () => this.openFoundry() },
      {
        label: "Fundir",
        primary: true,
        onClick: () => {
          this.game.rebirth();
          this.openFoundry();
        },
      },
    ]);
  }

  private openSettings(): void {
    const s = this.game.state;
    const mute = h("button", {}, s.settings.muted ? "Activar sonido" : "Silenciar");
    mute.onclick = () => {
      s.settings.muted = !s.settings.muted;
      this.actions.setMuted(s.settings.muted);
      setText(mute, s.settings.muted ? "Activar sonido" : "Silenciar");
    };
    const exportBtn = h("button", {
      onclick: () => {
        const area = h("textarea", { readOnly: true, value: encodeExport(this.game.state), rows: 6 });
        showModal("Exportar partida", [h("p", {}, "Copia este texto para guardar tu partida:"), area], [{ label: "Cerrar", primary: true }]);
        area.select();
      },
    }, "Exportar partida");
    const importBtn = h("button", {
      onclick: () => {
        const area = h("textarea", { rows: 6, placeholder: "Pega aquí una partida exportada" });
        showModal("Importar partida", area, [
          { label: "Cancelar" },
          {
            label: "Importar",
            primary: true,
            onClick: () => {
              try {
                const state = decodeExport(area.value);
                this.actions.load(JSON.stringify(state));
              } catch (err) {
                this.toast(err instanceof Error ? err.message : "No se pudo importar.");
              }
            },
          },
        ]);
        area.focus();
      },
    }, "Importar partida");
    const wipe = h("button", {
      class: "danger",
      onclick: () =>
        showModal("¿Borrar la partida?", h("p", {}, "Perderás todo el progreso, también el latón y los recuerdos de Anselmo. No se puede deshacer."), [
          { label: "Cancelar", primary: true },
          { label: "Borrar", onClick: () => this.actions.wipe() },
        ]),
    }, "Borrar partida");
    const motion = h("button", {}, s.settings.reduceMotion ? "Destellos y temblores: reducidos" : "Destellos y temblores: normales");
    motion.onclick = () => {
      s.settings.reduceMotion = !s.settings.reduceMotion;
      this.actions.setReduceMotion(s.settings.reduceMotion);
      setText(motion, s.settings.reduceMotion ? "Destellos y temblores: reducidos" : "Destellos y temblores: normales");
    };
    const keys: [string, string][] = [
      ["Clic / Espacio", "Manivela"],
      ["Shift (mantener)", "Sobremarcha"],
      ["M", "Mejorar motor"],
      ["E", "Añadir engranaje"],
      ["T", "Taller de engranajes"],
      ["F", "Fundición"],
      ["L", "Logros y estadísticas"],
      ["R", "Recuerdos de Anselmo"],
      ["V", "Ver todo / seguir la salida"],
      ["1 · 2 · 3", "Comprar ×1 · ×10 · Máx"],
      ["Esc", "Cerrar ventana"],
    ];
    const shortcuts = h("div", { class: "shortcuts" }, ...keys.map(([k, d]) => h("div", {}, h("kbd", {}, k), h("span", {}, d))));
    showModal("Ajustes", [
      h("div", { class: "settings-list" }, mute, motion, exportBtn, importBtn, wipe),
      h("h3", { class: "section-title" }, "Atajos de teclado"),
      shortcuts,
    ], [{ label: "Cerrar", primary: true }], { wide: true });
  }

  /** Recuerdos: lo que Anselmo ya ha contado. Elegir uno hace que lo vuelva a contar. */
  private openMemories(): void {
    const s = this.game.state;
    const list = h("div", { class: "notebook" });
    let close = () => {};
    for (const page of STORY) {
      const seen = s.story.seen.includes(page.id);
      list.append(
        h("button", {
          class: seen ? "page" : "page locked",
          disabled: !seen,
          onclick: () => {
            close();
            this.actions.retell(page.id);
          },
        }, seen ? page.title : "· · ·"),
      );
    }
    close = showModal("Recuerdos de Anselmo", [h("p", { class: "muted" }, "Elige un recuerdo y Anselmo te lo volverá a contar."), list], [{ label: "Cerrar", primary: true }]);
  }

  /** Logros (con su bonus) y estadísticas de la partida. */
  private openAchievements(): void {
    const s = this.game.state;
    const st = s.stats;
    const stats: [string, string][] = [
      ["Tiempo de juego", fmtDuration(s.timeAll)],
      ["Monedas totales", fmt(s.totalAll)],
      ["Récord de salida", fmtRpm(s.bestRps)],
      ["Etapas máximas", String(s.maxStages)],
      ["Fundiciones", String(s.rebirths)],
      ["Clics de manivela", fmt(st.crankClicks)],
      ["Dientes comprados", fmt(st.teethBought)],
      ["Engranajes añadidos", fmt(st.stagesBought)],
      ["Gripados", fmt(st.stalls)],
      ["Sobremarcha más larga", `${st.maxHold.toFixed(1)} s`],
      ["Eventos resueltos", fmt(st.eventsResolved)],
      ["Mejor racha", String(st.maxStreak)],
      ["Engranajes dorados", fmt(st.goldenCaught)],
      ["Pedidos cumplidos", fmt(st.requestsDone)],
      ["Recuerdos de Anselmo", `${s.events.fragments}/${EVENTS.maxFragments}`],
      ["Cambios de marcha", fmt(st.gearShifts)],
    ];
    const done = s.achievements.length;
    const grid = h("div", { class: "ach-grid" },
      ...ACHIEVEMENTS.map((a) => {
        const got = s.achievements.includes(a.id);
        return h("div", { class: got ? "ach got" : "ach" },
          h("span", { class: "ach-star" }, got ? "★" : "☆"),
          h("span", { class: "ach-text" }, h("span", { class: "ach-name" }, a.name), h("span", { class: "ach-desc" }, a.desc)),
        );
      }),
    );
    showModal("Logros y estadísticas", [
      h("div", { class: "stats-grid" }, ...stats.map(([k, v]) => h("div", {}, h("span", { class: "muted" }, k), h("span", {}, v)))),
      h("h3", { class: "section-title" }, `Logros: ${done}/${ACHIEVEMENTS.length} · ${achievementBonusText(s)}`),
      grid,
    ], [{ label: "Cerrar", primary: true }], { wide: true });
  }

  /** Pantalla de fin, cuando Anselmo termina de contar el final. */
  showEnding(): void {
    const s = this.game.state;
    showModal("FIN", [
      h("p", { class: "quote" }, "El Gran Reloj de Valdehierro vuelve a dar la hora."),
      h("div", { class: "stats" },
        h("div", {}, h("span", { class: "muted" }, "Tiempo de juego"), fmtDuration(s.story.endTime || s.timeAll)),
        h("div", {}, h("span", { class: "muted" }, "Fundiciones"), String(s.rebirths)),
        h("div", {}, h("span", { class: "muted" }, "Etapas máximas"), String(s.maxStages)),
      ),
      h("p", { class: "muted" }, "El taller sigue abierto: puedes seguir fundiendo y batiendo tu récord."),
    ], [{ label: "Seguir girando", primary: true }], { wide: true });
  }

  // --- Cada frame ---

  update(): void {
    const g = this.game;
    const s = g.state;

    setText(this.coins, fmt(s.coins));
    setText(this.income, `+${fmt(g.income)}/s`);
    const out = g.speeds[g.speeds.length - 1] ?? 0;
    setText(this.rpm, fmtRpm(out));
    this.rpm.style.color = out >= 10 ? heatRgb(heatOf(out)) : "";
    setText(this.mult, `Materiales ×${fmt(globalMult(s))}`);

    // Gran Reloj.
    const progress = clockProgress(s);
    setText(this.goalPct, s.story.ended ? "En marcha" : `${Math.floor(progress * 100)}%`);
    this.goalFill.style.width = `${(progress * 100).toFixed(2)}%`;
    setText(this.goalMeta, s.story.ended ? `Récord: ${fmtRpm(s.bestRps)}` : `Meta: ${fmtRpm(CONFIG.story.targetRps)}`);

    // Motor.
    const mb = motorBulk(s, this.amount);
    const levels = Math.max(1, mb.count);
    const motors = motorCount(s);
    setText(this.motor.sub, s.motorLevel === 0
      ? "Instalar: gira solo"
      : `Nv ${s.motorLevel} → ${s.motorLevel + levels} · ${fmt(motorBaseRps(s.motorLevel + levels) * motors)} v/s`);
    setText(this.motor.badge, motors > 1 ? `×${motors}` : "");
    setText(this.motor.cost, fmt(mb.cost));
    this.motor.btn.classList.toggle("affordable", mb.cost <= s.coins);

    // Taller de engranajes.
    const n = stageCount(s);
    let total = 1;
    for (let i = 1; i <= n; i++) total *= stageRatio(s, i);
    setText(this.gears.sub, n === 0 ? "Sin engranajes aún" : `${n} etapas · ×${fmt(total)}`);
    const affordable = this.affordableTeethCount();
    setText(this.gears.badge, affordable > 0 ? String(affordable) : "");
    setText(this.gears.cost, "Abrir taller");
    this.gears.btn.classList.toggle("affordable", affordable > 0);

    // Engranaje nuevo.
    const sc = stageCost(n + 1);
    setText(this.stage.sub, `Etapa ${n + 1} · ×${(CONFIG.baseWheelTeeth / pinionTeeth(s)).toFixed(2)}`);
    setText(this.stage.cost, fmt(sc));
    this.stage.btn.classList.toggle("affordable", s.coins >= sc);

    // Renacer.
    const gain = brassForReset(s);
    setText(this.foundry.sub, `+${fmt(gain)} latón al fundir`);
    setText(this.foundry.badge, s.brass > 0 ? `${fmt(s.brass)}` : "");
    setText(this.foundry.cost, s.rebirths > 0 || s.brass > 0 ? "Fundición y tienda" : "Fundición");
    this.foundry.btn.classList.toggle("affordable", gain > 0 || BRASS.some((d) => !brassMaxed(s, d.id) && brassCost(s, d.id) <= s.brass));

    // Sobremarcha.
    const unlocked = overdriveUnlocked(s);
    this.odBtn.disabled = !unlocked || s.stall > 0;
    this.odBtn.classList.toggle("engaged", s.overdrive > 0.05);
    if (!unlocked) setText(this.odLabel, `Sobremarcha (etapa ${CONFIG.overdrive.unlockStages})`);
    else if (s.stall > 0) setText(this.odLabel, `Gripado · ${Math.ceil(s.stall)} s`);
    else setText(this.odLabel, s.overdrive > 0.05 ? `Sobremarcha ×${(1 + (overdriveMax(s) - 1) * s.overdrive).toFixed(1)}` : "Sobremarcha (mantén)");
    this.heatFill.style.width = `${(s.heat * 100).toFixed(1)}%`;
    this.heatFill.classList.toggle("hot", s.heat > 0.75);

    this.live?.();
  }

  toast(text: string, ms = 3500): void {
    setText(this.toastEl, text);
    this.toastEl.hidden = false;
    this.toastEl.classList.remove("show");
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.hidden = true;
    }, ms);
  }

  showOfflineSummary(o: OfflineSummary): void {
    const tiers = o.tiers > 0 ? ` y ${o.tiers} materiales nuevos` : "";
    this.toast(`Mientras no estabas (${fmtDuration(o.seconds)}): +${fmt(o.gained)} monedas${tiers}.`, 6000);
  }
}
