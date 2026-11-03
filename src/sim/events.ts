import { brassLevel } from "./brass";
import { CONFIG } from "./config";
import {
  incomePerSecond,
  motorRps,
  overdriveUnlocked,
  shaftSpeeds,
  stageCost,
  stageCount,
} from "./economy";
import { hasBuff, STREAK_CAP, type BuffId } from "./modifiers";
import type { GameState } from "./types";

/**
 * Eventos aleatorios: cosas que pasan en el taller mientras juegas y premian estar atento. Nunca
 * ocurren en el progreso offline. Casi todos dan premio; los negativos solo frenan y se arreglan solos.
 */

export type EventKind =
  | "golden"
  | "bell"
  | "fragment"
  | "jam"
  | "pigeon"
  | "oil"
  | "unstable"
  | "peddler"
  | "storm"
  | "request"
  | "resonance";

export type RequestKind = "speed" | "buys" | "stage" | "hold" | "earn";

/** Pedido de un vecino: un objetivo con tiempo límite, escalado al progreso del jugador. */
export interface Request {
  kind: RequestKind;
  who: string;
  target: number;
  progress: number;
  /** Punto de partida (monedas totales del ciclo, etapas…) para medir el avance. */
  base: number;
  reward: { coins: number; brass: number };
}

export type OfferKind = "brass" | "elixir" | "mystery";

/** Oferta del chatarrero. */
export interface Offer {
  kind: OfferKind;
  cost: number;
  brass: number;
}

export interface ActiveEvent {
  kind: EventKind;
  timeLeft: number;
  duration: number;
  elapsed: number;
  /** Etapa afectada (atasco, paloma, engranaje inestable). */
  stage?: number;
  /** Atasco: golpes que faltan. Resonancia: aciertos. */
  hits?: number;
  /** Engranaje inestable: multiplicador actual. */
  mult?: number;
  /** Engranaje inestable: multiplicador al que revienta (oculto). */
  breakAt?: number;
  request?: Request;
  offer?: Offer;
}

export const EVENTS = {
  minGap: 120,
  maxGap: 240,
  maxFragments: 12,
  golden: { duration: 12, coinsSeconds: 300, frenzy: 7, frenzySeconds: 30 },
  bellSeconds: 10,
  stormSeconds: 15,
  fragmentDuration: 10,
  jam: { hits: 5, perfectWithin: 5, autoFix: 60, perfectMult: 2, perfectSeconds: 20 },
  pigeon: { duration: 45, brassChance: 0.4, coinsSeconds: 60 },
  oil: { duration: 20, mult: 1.25, seconds: 60 },
  unstable: { start: 1.5, growth: 0.35, minBreak: 3, maxBreak: 8, seconds: 30, teethLost: 2 },
  peddler: { duration: 30 },
  resonance: { duration: 12, period: 0.8, window: 0.16, minHits: 3 },
};

export const VILLAGERS = [
  "Doña Rosa, la panadera",
  "El alcalde Ramiro",
  "Tomás, el campanero",
  "La maestra Inés",
  "Los gemelos Ruiz",
  "Fermín, el herrero",
];

/** Lo que pasó con los eventos en este paso o por una acción del jugador. */
export type EventNews =
  | { type: "spawn"; kind: EventKind }
  | { type: "progress"; kind: EventKind; amount?: number }
  | { type: "resolve"; kind: EventKind; outcome: string; amount?: number }
  | { type: "miss"; kind: EventKind; outcome: string };

type Rng = () => number;

// --- Utilidades ---

function outputRps(s: GameState): number {
  const v = shaftSpeeds(s);
  return v[v.length - 1] ?? 0;
}

/** Ingresos de referencia para escalar premios: los nominales, sin manivela ni mejoras temporales. */
function baseIncome(s: GameState): number {
  const nominal = { ...s, motorSpeed: motorRps(s), crank: 0, overdrive: 0, events: { ...s.events, buffs: [] } };
  return Math.max(1, incomePerSecond(nominal));
}

export function addBuff(s: GameState, id: BuffId, mult: number, seconds: number): void {
  s.events.buffs = s.events.buffs.filter((b) => b.id !== id);
  s.events.buffs.push({ id, mult, timeLeft: seconds, duration: seconds });
}

function attended(s: GameState): void {
  s.events.streak = Math.min(s.events.streak + 1, STREAK_CAP * 10);
  s.stats.eventsResolved++;
  s.stats.maxStreak = Math.max(s.stats.maxStreak, s.events.streak);
}

function missed(s: GameState): void {
  s.events.streak = 0;
}

function pick<T>(rng: Rng, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function randomStage(s: GameState, rng: Rng): number {
  return 1 + Math.floor(rng() * stageCount(s));
}

// --- Pedidos ---

/** Genera un pedido a la medida del momento: objetivos y premios crecen con el progreso. */
export function makeRequest(s: GameState, rng: Rng = Math.random): { request: Request; duration: number } {
  const stages = stageCount(s);
  const income = baseIncome(s);
  const kinds: RequestKind[] = ["speed", "buys", "earn"];
  if (overdriveUnlocked(s)) kinds.push("hold");
  if (stageCost(stages + 1) <= s.coins + income * 90) kinds.push("stage");
  const kind = pick(rng, kinds);
  const who = pick(rng, VILLAGERS);
  // Premio: unos minutos de ingresos, más cuantas más etapas; latón si ya se ha renacido.
  const reward = {
    coins: income * (150 + 15 * stages),
    brass: s.rebirths > 0 ? Math.max(1, Math.round(stages / 6)) : 0,
  };
  switch (kind) {
    case "speed": {
      const factor = overdriveUnlocked(s) ? 4 + brassLevel(s, "turbo") : 2.5;
      const nominal = outputRps({ ...s, motorSpeed: motorRps(s), crank: 0, overdrive: 0 });
      return { request: { kind, who, target: Math.max(5, nominal * factor), progress: 0, base: 0, reward }, duration: 75 };
    }
    case "buys":
      return { request: { kind, who, target: 5 + Math.floor(stages / 2), progress: 0, base: 0, reward }, duration: 90 };
    case "stage":
      return { request: { kind, who, target: 1, progress: 0, base: stages, reward }, duration: 120 };
    case "hold": {
      // Un 70% de lo que aguanta el motor desde frío antes de griparse: exigente pero posible.
      const toStall = 1 / (CONFIG.overdrive.heatPerSec * (1 - 0.2 * brassLevel(s, "radiator")));
      return { request: { kind, who, target: Math.max(3, Math.floor(toStall * 0.7)), progress: 0, base: 0, reward }, duration: 60 };
    }
    case "earn":
      return { request: { kind, who, target: income * 60 * 1.6, progress: 0, base: s.totalRun, reward }, duration: 60 };
  }
}

function updateRequest(s: GameState, r: Request, dt: number): void {
  switch (r.kind) {
    case "speed":
      r.progress = Math.max(r.progress, outputRps(s));
      break;
    case "stage":
      r.progress = stageCount(s) - r.base;
      break;
    case "hold":
      // Seguidos: se reinicia si sueltas la palanca o se gripa.
      r.progress = s.overdrive > 0.9 && s.stall === 0 ? r.progress + dt : 0;
      break;
    case "earn":
      r.progress = s.totalRun - r.base;
      break;
    case "buys":
      break;
  }
}

/** Una compra cuenta para el pedido "compra N mejoras". */
export function countPurchase(s: GameState, n = 1): void {
  const r = s.events.active?.request;
  if (r?.kind === "buys") r.progress += n;
}

// --- Chatarrero ---

function makeOffer(s: GameState, rng: Rng): Offer {
  const income = baseIncome(s);
  const kinds: OfferKind[] = ["elixir", "mystery"];
  if (stageCount(s) >= 3) kinds.push("brass");
  const kind = pick(rng, kinds);
  switch (kind) {
    case "brass":
      return { kind, cost: income * 180, brass: Math.max(1, Math.floor(stageCount(s) / 4)) };
    case "elixir":
      return { kind, cost: 0, brass: 0 };
    case "mystery":
      return { kind, cost: income * 60, brass: 0 };
  }
}

// --- Aparición ---

interface Candidate {
  kind: EventKind;
  weight: number;
}

function candidates(s: GameState): Candidate[] {
  const stages = stageCount(s);
  const out: Candidate[] = [
    { kind: "golden", weight: 3 },
    { kind: "bell", weight: 2 },
    { kind: "oil", weight: 1.5 },
    { kind: "request", weight: 3 },
    { kind: "resonance", weight: 1.5 },
  ];
  if (s.events.fragments < EVENTS.maxFragments) out.push({ kind: "fragment", weight: 1 });
  if (stages >= 1) out.push({ kind: "pigeon", weight: 1.5 });
  if (stages >= 2) out.push({ kind: "jam", weight: 2 });
  if (stages >= 2 && s.shafts.some((sh, i) => i > 0 && sh.teethLevel >= EVENTS.unstable.teethLost)) {
    out.push({ kind: "unstable", weight: 1.5 });
  }
  if (stages >= 3) out.push({ kind: "peddler", weight: 1 });
  if (overdriveUnlocked(s) && !hasBuff(s, "storm")) out.push({ kind: "storm", weight: 1.5 });
  return out;
}

function chooseKind(s: GameState, rng: Rng): EventKind {
  const list = candidates(s);
  let r = rng() * list.reduce((a, c) => a + c.weight, 0);
  for (const c of list) {
    r -= c.weight;
    if (r <= 0) return c.kind;
  }
  return list[list.length - 1].kind;
}

/** Lanza un evento concreto (o uno al azar). Exportado para los tests y la consola de desarrollo. */
export function spawnEvent(s: GameState, kind: EventKind = chooseKind(s, Math.random), rng: Rng = Math.random): EventNews {
  const E = EVENTS;
  const ev = (duration: number, extra: Partial<ActiveEvent> = {}): ActiveEvent => ({
    kind, timeLeft: duration, duration, elapsed: 0, ...extra,
  });
  switch (kind) {
    // La campanada y la tormenta no se pulsan: son mejoras temporales que hay que aprovechar.
    case "bell":
      addBuff(s, "bell", 1, E.bellSeconds);
      break;
    case "storm":
      addBuff(s, "storm", 1, E.stormSeconds);
      break;
    case "golden":
      s.events.active = ev(E.golden.duration);
      break;
    case "fragment":
      s.events.active = ev(E.fragmentDuration);
      break;
    case "jam":
      s.events.active = ev(E.jam.autoFix, { stage: randomStage(s, rng), hits: E.jam.hits });
      break;
    case "pigeon":
      s.events.active = ev(E.pigeon.duration, { stage: randomStage(s, rng) });
      break;
    case "oil":
      s.events.active = ev(E.oil.duration);
      break;
    case "unstable": {
      const options = s.shafts.map((sh, i) => (i > 0 && sh.teethLevel >= E.unstable.teethLost ? i : 0)).filter((i) => i > 0);
      const breakAt = E.unstable.minBreak + rng() * (E.unstable.maxBreak - E.unstable.minBreak);
      // Sin límite de tiempo (no Infinity: no sobrevive al JSON del guardado): o lo estabilizas o revienta.
      s.events.active = ev(1e9, { stage: pick(rng, options), mult: E.unstable.start, breakAt });
      break;
    }
    case "peddler":
      s.events.active = ev(E.peddler.duration, { offer: makeOffer(s, rng) });
      break;
    case "request": {
      const { request, duration } = makeRequest(s, rng);
      s.events.active = ev(duration, { request });
      break;
    }
    case "resonance":
      s.events.active = ev(E.resonance.duration, { hits: 0 });
      break;
  }
  return { type: "spawn", kind };
}

// --- Paso de simulación ---

/**
 * Avanza los eventos. `canSpawn` es falso mientras hay una ventana abierta, para no lanzar nada que
 * el jugador no pueda ver.
 */
export function tickEvents(s: GameState, dt: number, canSpawn: boolean, rng: Rng = Math.random): EventNews[] {
  const news: EventNews[] = [];
  const E = EVENTS;

  for (const b of s.events.buffs) b.timeLeft -= dt;
  s.events.buffs = s.events.buffs.filter((b) => b.timeLeft > 0);

  const a = s.events.active;
  if (a) {
    a.elapsed += dt;
    a.timeLeft -= dt;
    switch (a.kind) {
      case "unstable":
        a.mult! += E.unstable.growth * dt;
        if (a.mult! >= a.breakAt!) {
          const sh = s.shafts[a.stage!];
          if (sh) sh.teethLevel = Math.max(0, sh.teethLevel - E.unstable.teethLost);
          s.events.active = null;
          missed(s);
          news.push({ type: "miss", kind: "unstable", outcome: "broke" });
        }
        break;
      case "request": {
        const r = a.request!;
        updateRequest(s, r, dt);
        if (r.progress >= r.target) {
          s.coins += r.reward.coins;
          s.brass += r.reward.brass;
          s.stats.requestsDone++;
          s.events.active = null;
          attended(s);
          news.push({ type: "resolve", kind: "request", outcome: "done", amount: r.reward.coins });
        }
        break;
      }
      case "resonance":
        break;
    }
    const still = s.events.active;
    if (still && still.timeLeft <= 0) {
      s.events.active = null;
      news.push(expire(s, still));
    }
  }

  // El primer evento espera a que haya motor: antes no hay nada que mejorar.
  if (!s.events.active && s.motorLevel > 0) {
    s.events.cooldown -= dt;
    if (s.events.cooldown <= 0 && canSpawn) {
      news.push(spawnEvent(s, chooseKind(s, rng), rng));
      s.events.cooldown = E.minGap + rng() * (E.maxGap - E.minGap);
    }
  }
  return news;
}

function expire(s: GameState, a: ActiveEvent): EventNews {
  switch (a.kind) {
    case "jam":
      missed(s);
      return { type: "miss", kind: "jam", outcome: "autofix" };
    case "pigeon":
      missed(s);
      return { type: "miss", kind: "pigeon", outcome: "left" };
    case "resonance":
      return finishResonance(s, a);
    case "peddler":
      // Ignorar al chatarrero no rompe la racha: también es una decisión.
      return { type: "miss", kind: "peddler", outcome: "left" };
    case "request":
      missed(s);
      return { type: "miss", kind: "request", outcome: "failed" };
    default:
      missed(s);
      return { type: "miss", kind: a.kind, outcome: "gone" };
  }
}

function finishResonance(s: GameState, a: ActiveEvent): EventNews {
  const hits = a.hits ?? 0;
  s.stats.bestResonance = Math.max(s.stats.bestResonance, hits);
  if (hits >= EVENTS.resonance.minHits) {
    const mult = Math.min(3, 1.5 + 0.3 * hits);
    addBuff(s, "resonance", mult, 30);
    attended(s);
    return { type: "resolve", kind: "resonance", outcome: "tuned", amount: mult };
  }
  missed(s);
  return { type: "miss", kind: "resonance", outcome: "offbeat" };
}

// --- Acciones del jugador ---

/**
 * El jugador actúa sobre el evento activo. `action` distingue las opciones del chatarrero
 * ("accept" / "reject") y del engranaje inestable ("stabilize"); el resto solo necesita un clic.
 */
export function actOnEvent(s: GameState, action = "click", rng: Rng = Math.random): EventNews | null {
  const a = s.events.active;
  if (!a) return null;
  const E = EVENTS;
  const income = baseIncome(s);
  const done = (outcome: string, amount?: number): EventNews => {
    s.events.active = null;
    attended(s);
    return { type: "resolve", kind: a.kind, outcome, amount };
  };

  switch (a.kind) {
    case "golden": {
      s.stats.goldenCaught++;
      const roll = rng();
      if (roll < 0.5 || (roll >= 0.85 && !overdriveUnlocked(s))) {
        const coins = income * E.golden.coinsSeconds;
        s.coins += coins;
        return done("coins", coins);
      }
      if (roll < 0.85) {
        addBuff(s, "frenzy", E.golden.frenzy, E.golden.frenzySeconds);
        return done("frenzy", E.golden.frenzy);
      }
      s.heat = 0;
      s.stall = 0;
      return done("cool");
    }
    case "fragment":
      s.events.fragments = Math.min(E.maxFragments, s.events.fragments + 1);
      return done("fragment", s.events.fragments);
    case "jam":
      a.hits!--;
      if (a.hits! > 0) return { type: "progress", kind: "jam", amount: a.hits };
      if (a.elapsed <= E.jam.perfectWithin) {
        addBuff(s, "perfectRepair", E.jam.perfectMult, E.jam.perfectSeconds);
        s.stats.perfectRepairs++;
        return done("perfect");
      }
      return done("fixed");
    case "pigeon": {
      if (rng() < E.pigeon.brassChance) {
        if (s.rebirths > 0) {
          s.brass += 1;
          return done("brass", 1);
        }
        const coins = income * E.pigeon.coinsSeconds;
        s.coins += coins;
        return done("coins", coins);
      }
      return done("shooed");
    }
    case "oil":
      addBuff(s, "oiled", E.oil.mult, E.oil.seconds);
      return done("oiled");
    case "unstable":
      addBuff(s, "unstable", a.mult!, E.unstable.seconds);
      s.stats.bestUnstable = Math.max(s.stats.bestUnstable, a.mult!);
      return done("stabilized", a.mult);
    case "peddler": {
      const o = a.offer!;
      if (action !== "accept") return done("rejected");
      if (o.cost > s.coins) return null;
      s.coins -= o.cost;
      if (o.kind === "brass") {
        s.brass += o.brass;
        return done("brass", o.brass);
      }
      if (o.kind === "elixir") {
        addBuff(s, "elixir", 3, 45);
        s.heat = Math.max(s.heat, 0.8);
        return done("elixir");
      }
      if (rng() < 0.6) {
        addBuff(s, "mystery", 5, 30);
        return done("mystery");
      }
      s.stats.peddlerJunk++;
      return done("junk");
    }
    case "resonance": {
      const { period, window } = E.resonance;
      const phase = a.elapsed % period;
      const off = Math.min(phase, period - phase);
      if (off <= window) {
        a.hits!++;
        return { type: "progress", kind: "resonance", amount: a.hits };
      }
      return { type: "progress", kind: "resonance", amount: -1 };
    }
    default:
      return null;
  }
}
