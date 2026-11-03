import { brassLevel } from "./brass";
import { CONFIG, MATERIALS } from "./config";
import { crankMult, eventIncomeMult, heatFactor, newEventsState, stageFactor } from "./modifiers";
import type { Gear, GameState, Input, Stats } from "./types";

export const SAVE_VERSION = 2;

export function newStats(): Stats {
  return {
    crankClicks: 0, stalls: 0, goldenCaught: 0, eventsResolved: 0, perfectRepairs: 0, requestsDone: 0,
    maxStreak: 0, bestUnstable: 0, peddlerJunk: 0, bestResonance: 0, holdNow: 0, maxHold: 0,
    lastRebirthGain: 0, teethBought: 0, stagesBought: 0, gearShifts: 0,
  };
}

export function newGame(): GameState {
  return {
    version: SAVE_VERSION,
    coins: 0,
    totalRun: 0,
    motorLevel: 0,
    shafts: [{ teethLevel: 0, revs: 0 }],
    freeStages: 0,
    motorSpeed: 0,
    crank: 0,
    overdrive: 0,
    heat: 0,
    stall: 0,
    timeRun: 0,
    totalAll: 0,
    timeAll: 0,
    brass: 0,
    brassUpgrades: {},
    rebirths: 0,
    bestRps: 0,
    maxStages: 0,
    story: { seen: [], unread: [], reactions: [], ended: false, endTime: 0 },
    events: newEventsState(),
    achievements: [],
    stats: newStats(),
    lastSaved: Date.now(),
    settings: { muted: false, automaton: true, reduceMotion: false, volume: { music: 0.7, sfx: 0.8, ambient: 0.6 } },
  };
}

// --- Tren ---

export function wheelTeeth(level: number): number {
  return CONFIG.baseWheelTeeth + CONFIG.teethPerLevel * level;
}

export function pinionTeeth(s: GameState): number {
  return CONFIG.pinionTeeth - brassLevel(s, "pinion");
}

/** Relación de la etapa que mueve al eje `i` (i ≥ 1). */
export function stageRatio(s: GameState, i: number): number {
  return wheelTeeth(s.shafts[i].teethLevel) / pinionTeeth(s);
}

export function stageCount(s: GameState): number {
  return s.shafts.length - 1;
}

/** Velocidad nominal de un motor de nivel `level`. */
export function motorBaseRps(level: number): number {
  return level * CONFIG.motor.rpsPerLevel * 2 ** Math.floor(level / CONFIG.motor.doubleEvery);
}

export function motorCount(s: GameState): number {
  return 1 + brassLevel(s, "motors");
}

/** Velocidad nominal de todos los motores juntos. */
export function motorRps(s: GameState): number {
  return motorBaseRps(s.motorLevel) * motorCount(s);
}

export function overdriveUnlocked(s: GameState): boolean {
  return stageCount(s) >= CONFIG.overdrive.unlockStages;
}

export function overdriveMax(s: GameState): number {
  return CONFIG.overdrive.maxMult + brassLevel(s, "turbo");
}

export function overdriveMult(s: GameState): number {
  return 1 + (overdriveMax(s) - 1) * s.overdrive;
}

// --- Cajas de cambios ---

export function gearboxUnlocked(s: GameState): boolean {
  return s.rebirths > 0;
}

export function gearOf(s: GameState, stage: number): Gear {
  return s.shafts[stage]?.gear ?? 0;
}

/** Factor de la marcha sobre la relación de una etapa. */
export function gearFactor(s: GameState, stage: number): number {
  const g = gearOf(s, stage);
  return g === 2 ? CONFIG.gearbox.long : g === 1 ? CONFIG.gearbox.short : 1;
}

/** Calor por segundo que suman (o restan) las marchas, aunque no haya sobremarcha. */
export function gearboxHeat(s: GameState): number {
  let n = 0;
  for (let i = 1; i < s.shafts.length; i++) n += gearOf(s, i) === 2 ? 1 : gearOf(s, i) === 1 ? -1 : 0;
  return n * CONFIG.gearbox.heatPerSec * (1 - 0.2 * brassLevel(s, "radiator"));
}

export function gearboxCost(stage: number): number {
  return stageCost(stage) * CONFIG.gearbox.costFactor;
}

export function buyGearbox(s: GameState, stage: number): boolean {
  if (!gearboxUnlocked(s) || stage < 1 || stage >= s.shafts.length || gearOf(s, stage) !== 0) return false;
  const cost = gearboxCost(stage);
  if (cost > s.coins) return false;
  s.coins -= cost;
  s.shafts[stage].gear = 2;
  return true;
}

/** Cambia de marcha una etapa con caja, o todas con stage = 0. Devuelve cuántas cambiaron. */
export function setGear(s: GameState, stage: number, gear: 1 | 2): number {
  const from = stage === 0 ? 1 : stage;
  const to = stage === 0 ? s.shafts.length - 1 : stage;
  let changed = 0;
  for (let i = from; i <= to; i++) {
    const g = gearOf(s, i);
    if (g !== 0 && g !== gear) {
      s.shafts[i].gear = gear;
      changed++;
    }
  }
  s.stats.gearShifts += changed;
  return changed;
}

/** Vueltas por segundo de cada eje en este instante. */
export function shaftSpeeds(s: GameState): number[] {
  const out = new Array<number>(s.shafts.length);
  let v = (s.motorSpeed + s.crank) * overdriveMult(s);
  out[0] = v;
  for (let i = 1; i < s.shafts.length; i++) {
    const ratio = stageRatio(s, i) * gearFactor(s, i);
    v = Math.min(CONFIG.maxNumber, v * ratio * stageFactor(s, i, ratio));
    out[i] = v;
  }
  return out;
}

// --- Materiales ---

export const MAX_TIER = MATERIALS.length - 1;

/** Nivel de material según las vueltas: 10 → 1, 100 → 2, 1000 → 3… hasta el último material. */
export function tierOf(revs: number): number {
  return revs < 10 ? 0 : Math.min(MAX_TIER, Math.floor(Math.log10(revs)));
}

export function material(tier: number) {
  return MATERIALS[tier];
}

export function totalTiers(s: GameState): number {
  let t = 0;
  for (const sh of s.shafts) t += tierOf(sh.revs);
  return t;
}

export function tierMult(s: GameState): number {
  return CONFIG.tierMult + 0.02 * brassLevel(s, "alloy");
}

export function globalMult(s: GameState): number {
  return tierMult(s) ** totalTiers(s);
}

export function achievementMult(s: GameState): number {
  return 1 + CONFIG.achievementBonus * s.achievements.length;
}

export function incomePerSecond(s: GameState, speeds = shaftSpeeds(s)): number {
  let sum = 0;
  for (const v of speeds) sum += v;
  return Math.min(CONFIG.maxNumber, sum * CONFIG.payoutPerRev * globalMult(s) * eventIncomeMult(s) * achievementMult(s));
}

// --- Costes ---

export function motorCost(level: number): number {
  return CONFIG.motor.baseCost * CONFIG.motor.costGrowth ** level;
}

/** Coste de la etapa n (la primera es la 1). */
export function stageCost(n: number): number {
  const { baseCost, costGrowth, quadGrowth } = CONFIG.stage;
  // En escala logarítmica: el término cuadrático desborda mucho antes que el resultado.
  const log = Math.log10(baseCost) + (n - 1) * Math.log10(costGrowth) + (((n - 1) * (n - 2)) / 2) * Math.log10(quadGrowth);
  return 10 ** log;
}

export function teethCost(stage: number, level: number): number {
  return stageCost(stage) * CONFIG.teeth.costFactor * CONFIG.teeth.costGrowth ** level;
}

export function maxTeethLevel(s: GameState): number {
  return CONFIG.maxTeethLevel + CONFIG.millLevels * brassLevel(s, "mill");
}

export function teethMaxed(s: GameState, stage: number): boolean {
  return s.shafts[stage].teethLevel >= maxTeethLevel(s);
}

/**
 * Cuántos niveles se compran y cuánto cuestan. `want` = Infinity compra todos los asequibles
 * (al menos uno, para poder mostrar el precio del siguiente aunque no alcance).
 */
export function bulk(
  costAt: (level: number) => number,
  level: number,
  want: number,
  budget: number,
  maxLevel = Infinity,
): { count: number; cost: number } {
  let count = 0;
  let cost = 0;
  while (count < want && level + count < maxLevel) {
    const next = costAt(level + count);
    if (want === Infinity && count > 0 && cost + next > budget) break;
    cost += next;
    count++;
  }
  return { count, cost };
}

export function motorBulk(s: GameState, want: number) {
  return bulk(motorCost, s.motorLevel, want, s.coins);
}

export function teethBulk(s: GameState, stage: number, want: number) {
  return bulk((l) => teethCost(stage, l), s.shafts[stage].teethLevel, want, s.coins, maxTeethLevel(s));
}

export function buyMotor(s: GameState, want: number): number {
  const b = motorBulk(s, want);
  if (b.count === 0 || b.cost > s.coins) return 0;
  s.coins -= b.cost;
  s.motorLevel += b.count;
  return b.count;
}

export function buyTeeth(s: GameState, stage: number, want: number): number {
  const b = teethBulk(s, stage, want);
  if (b.count === 0 || b.cost > s.coins) return 0;
  s.coins -= b.cost;
  s.shafts[stage].teethLevel += b.count;
  s.stats.teethBought += b.count;
  return b.count;
}

export function buyStage(s: GameState): boolean {
  const cost = stageCost(stageCount(s) + 1);
  if (cost > s.coins) return false;
  s.coins -= cost;
  s.shafts.push({ teethLevel: 0, revs: 0 });
  s.maxStages = Math.max(s.maxStages, stageCount(s));
  s.stats.stagesBought++;
  return true;
}

export interface UpgradeOption {
  kind: "motor" | "teeth" | "stage";
  stage: number;
  cost: number;
  /** Aumento relativo de ingresos por moneda gastada (aproximado). */
  value: number;
}

/** Todas las compras posibles con su rendimiento: lo que usa el autómata para decidir. */
export function upgradeOptions(s: GameState): UpgradeOption[] {
  const speeds = shaftSpeeds({ ...s, motorSpeed: motorRps(s), crank: 0, overdrive: 0 });
  const total = speeds.reduce((a, b) => a + b, 0) || 1e-300;
  const out: UpgradeOption[] = [];

  const lvl = s.motorLevel;
  const motorGain = lvl === 0 ? 1e9 : motorBaseRps(lvl + 1) / motorBaseRps(lvl) - 1;
  out.push({ kind: "motor", stage: 0, cost: motorCost(lvl), value: motorGain / motorCost(lvl) });

  // Parte de los ingresos que viene de cada eje en adelante: una mejora de dientes la multiplica.
  let downstream = total;
  for (let i = 1; i < s.shafts.length; i++) {
    downstream -= speeds[i - 1];
    if (teethMaxed(s, i)) continue;
    const w = wheelTeeth(s.shafts[i].teethLevel);
    const gain = (CONFIG.teethPerLevel / w) * (downstream / total);
    const cost = teethCost(i, s.shafts[i].teethLevel);
    out.push({ kind: "teeth", stage: i, cost, value: gain / cost });
  }

  // Una etapa nueva añade un eje más rápido que sube varios materiales en segundos.
  const vNew = speeds[speeds.length - 1] * (CONFIG.baseWheelTeeth / pinionTeeth(s));
  const stageGain = ((total + vNew) / total) * tierMult(s) ** tierOf(vNew * 10) - 1;
  const sc = stageCost(stageCount(s) + 1);
  out.push({ kind: "stage", stage: stageCount(s) + 1, cost: sc, value: stageGain / sc });
  return out;
}

/**
 * Compra lo que más rinde mientras alcance. Si lo mejor es una etapa y `buyStages` es falso, ahorra
 * para ella en vez de gastar en lo demás. Devuelve cuántas compras hizo.
 */
export function automatonStep(s: GameState, buyStages: boolean, limit = 200): number {
  let n = 0;
  while (n < limit) {
    let best: UpgradeOption | null = null;
    for (const o of upgradeOptions(s)) if (!best || o.value > best.value) best = o;
    if (!best || best.cost > s.coins) break;
    if (best.kind === "stage") {
      if (!buyStages) break;
      buyStage(s);
    } else if (best.kind === "motor") buyMotor(s, 1);
    else buyTeeth(s, best.stage, 1);
    n++;
  }
  return n;
}

/** "Mejorar todo" de la ventana de engranajes: dientes del más barato al más caro mientras alcance. */
export function buyAllTeeth(s: GameState): number {
  let n = 0;
  for (;;) {
    let stage = 0;
    let cost = Infinity;
    for (let i = 1; i < s.shafts.length; i++) {
      if (teethMaxed(s, i)) continue;
      const c = teethCost(i, s.shafts[i].teethLevel);
      if (c < cost) {
        cost = c;
        stage = i;
      }
    }
    if (stage === 0 || cost > s.coins) return n;
    buyTeeth(s, stage, 1);
    n++;
  }
}

// --- Manivela ---

export function crankImpulse(s: GameState): number {
  return Math.max(CONFIG.crank.impulse, motorRps(s) * CONFIG.crank.motorShare) * crankMult(s);
}

/** Un clic en la manivela. No hace nada con el motor gripado. */
export function crank(s: GameState): boolean {
  if (s.stall > 0) return false;
  const imp = crankImpulse(s);
  s.crank = Math.min(s.crank + imp, imp * CONFIG.crank.maxImpulses);
  s.stats.crankClicks++;
  return true;
}

// --- Fundición ---

/** Latón al fundir: uno por cada engranaje construido en este ciclo (los de los Planos no cuentan). */
export function brassForReset(s: GameState): number {
  return Math.max(0, stageCount(s) - s.freeStages) * CONFIG.brassPerStage;
}

/**
 * Funde el tren: se pierde el ciclo, se gana latón y se conserva todo lo permanente. Se puede
 * fundir en cualquier momento, aunque sin engranajes construidos no da nada.
 */
export function rebirth(s: GameState): number {
  const gain = brassForReset(s);
  const fresh = newGame();
  Object.assign(s, {
    coins: fresh.coins,
    totalRun: 0,
    motorLevel: fresh.motorLevel,
    shafts: fresh.shafts,
    freeStages: 0,
    // Los eventos en curso dependen del tren que se funde; la racha y los fragmentos se conservan.
    events: { ...s.events, active: null, buffs: [] },
    motorSpeed: 0,
    crank: 0,
    overdrive: 0,
    heat: 0,
    stall: 0,
    timeRun: 0,
  });
  s.brass += gain;
  s.rebirths++;
  s.stats.lastRebirthGain = gain;
  applyBlueprints(s);
  return gain;
}

/** Los Planos regalan etapas al empezar un ciclo (también recién compradas). */
export function applyBlueprints(s: GameState): void {
  while (stageCount(s) < brassLevel(s, "blueprints")) {
    s.shafts.push({ teethLevel: 0, revs: 0 });
    s.freeStages++;
  }
  // Con etapas regaladas y sin motor el tren no arrancaría: el primer motor también va incluido.
  if (stageCount(s) > 0 && s.motorLevel === 0) s.motorLevel = 1;
  s.maxStages = Math.max(s.maxStages, stageCount(s));
}

// --- Paso de simulación ---

export interface TickResult {
  /** Ejes que han subido de material en este paso, con su material nuevo. */
  tierUps: { shaft: number; tier: number }[];
  stalled: boolean;
  income: number;
  /** Compras del autómata en este paso. */
  autoBought: number;
}

let automatonClock = 0;

export function tick(s: GameState, input: Input, dt: number): TickResult {
  const od = CONFIG.overdrive;
  let stalled = false;

  s.crank *= Math.exp(-dt / CONFIG.crank.decaySeconds);
  if (s.crank < 1e-4) s.crank = 0;

  if (s.stall > 0) {
    s.stall = Math.max(0, s.stall - dt);
    s.crank = 0;
  }

  const held = input.overdriveHeld && s.stall === 0 && overdriveUnlocked(s);
  s.overdrive = held
    ? Math.min(1, s.overdrive + od.rampPerSec * dt)
    : Math.max(0, s.overdrive - od.releasePerSec * dt);
  const heatRate = od.heatPerSec * (1 - 0.2 * brassLevel(s, "radiator")) * heatFactor(s);
  // Las marchas largas calientan el motor aunque no haya sobremarcha; las cortas ayudan a enfriarlo.
  const passive = s.stall > 0 ? Math.min(0, gearboxHeat(s)) : gearboxHeat(s);
  s.heat = Math.min(1, Math.max(0, s.heat + (heatRate * s.overdrive + passive - od.coolPerSec * (1 - s.overdrive)) * dt));
  if (s.heat >= 1 && s.stall === 0) {
    s.stall = od.stallSeconds;
    s.overdrive = 0;
    s.crank = 0;
    stalled = true;
    s.stats.stalls++;
  }
  if (s.overdrive > 0.9 && s.stall === 0) {
    s.stats.holdNow += dt;
    s.stats.maxHold = Math.max(s.stats.maxHold, s.stats.holdNow);
  } else {
    s.stats.holdNow = 0;
  }

  const target = s.stall > 0 ? 0 : motorRps(s);
  s.motorSpeed += (target - s.motorSpeed) * (1 - Math.exp(-dt / CONFIG.inertiaSeconds));

  const speeds = shaftSpeeds(s);
  const income = incomePerSecond(s, speeds);
  const gained = income * dt;
  s.coins = Math.min(CONFIG.maxNumber, s.coins + gained);
  s.totalRun = Math.min(CONFIG.maxNumber, s.totalRun + gained);
  s.totalAll = Math.min(CONFIG.maxNumber, s.totalAll + gained);
  s.bestRps = Math.max(s.bestRps, speeds[speeds.length - 1]);

  const tierUps: TickResult["tierUps"] = [];
  for (let i = 0; i < s.shafts.length; i++) {
    const sh = s.shafts[i];
    const before = tierOf(sh.revs);
    sh.revs = Math.min(CONFIG.maxNumber, sh.revs + speeds[i] * dt);
    const after = tierOf(sh.revs);
    if (after > before) tierUps.push({ shaft: i, tier: after });
  }

  let autoBought = 0;
  const auto = brassLevel(s, "automaton");
  if (auto > 0 && s.settings.automaton) {
    automatonClock += dt;
    if (automatonClock >= CONFIG.automatonInterval) {
      automatonClock = 0;
      autoBought = automatonStep(s, auto >= 2);
    }
  }

  s.timeRun += dt;
  s.timeAll += dt;
  return { tierUps, stalled, income, autoBought };
}

// --- Gran Reloj ---

/** Avance hacia el final (0–1), en escala logarítmica de la velocidad máxima de salida. */
export function clockProgress(s: GameState): number {
  const target = Math.log10(CONFIG.story.targetRps);
  return Math.min(1, Math.max(0, Math.log10(Math.max(1, s.bestRps)) / target));
}
