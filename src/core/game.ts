import { checkAchievements } from "../sim/achievements";
import { buyBrass, type BrassId } from "../sim/brass";
import { CONFIG } from "../sim/config";
import {
  applyBlueprints,
  buyAllTeeth,
  buyGearbox,
  buyMotor,
  buyStage,
  buyTeeth,
  crank,
  incomePerSecond,
  rebirth,
  setGear,
  shaftSpeeds,
  stageCount,
  tick,
  totalTiers,
} from "../sim/economy";
import { actOnEvent, countPurchase, spawnEvent, tickEvents, type EventKind, type EventNews } from "../sim/events";
import { checkStory } from "../sim/story";
import type { GameState, Input } from "../sim/types";

export interface OfflineSummary {
  seconds: number;
  gained: number;
  tiers: number;
}

/** Lo que pasó en la simulación y la interfaz quiere celebrar (efectos, sonido). */
export type GameEvent =
  | { type: "buy"; what: "motor" | "teeth" | "stage"; shaft: number; count: number }
  | { type: "tier"; shaft: number; tier: number }
  | { type: "crank" }
  | { type: "stall" }
  | { type: "rebirth"; gain: number }
  | { type: "brass"; id: BrassId }
  | { type: "story"; id: string }
  | { type: "event"; news: EventNews }
  | { type: "achievement"; id: string }
  | { type: "gearbox"; stage: number; installed: boolean };

/** Cada cuánto se comprueban los hitos de la historia, en segundos de simulación. */
const STORY_INTERVAL = 0.5;

/** Fachada sobre la simulación: estado, entrada del jugador y cola de eventos para la interfaz. */
export class Game {
  state: GameState;
  input: Input = { overdriveHeld: false, uiBusy: false };
  income = 0;
  speeds: number[] = [];
  /** Sube con cada cambio "estructural" (compras, fundición); la interfaz lo usa para redibujar. */
  revision = 0;
  private events: GameEvent[] = [];
  /** Durante el progreso offline no se emiten eventos: nadie los vería. */
  private quiet = false;
  private storyClock = 0;

  constructor(state: GameState) {
    this.state = state;
    this.speeds = shaftSpeeds(state);
    this.income = incomePerSecond(state, this.speeds);
    checkStory(state);
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private emit(e: GameEvent): void {
    if (!this.quiet) this.events.push(e);
  }

  step(dt: number): void {
    const stagesBefore = stageCount(this.state);
    const r = tick(this.state, this.input, dt);
    this.income = r.income;
    this.speeds = shaftSpeeds(this.state);
    for (const u of r.tierUps) this.emit({ type: "tier", ...u });
    if (r.stalled) this.emit({ type: "stall" });
    if (r.autoBought > 0) {
      this.revision++;
      countPurchase(this.state, r.autoBought);
      for (let n = stagesBefore + 1; n <= stageCount(this.state); n++) {
        this.emit({ type: "buy", what: "stage", shaft: n, count: 1 });
      }
    }
    // Los eventos aleatorios solo existen mientras se juega: el progreso offline no los toca.
    if (!this.quiet) {
      for (const news of tickEvents(this.state, dt, !this.input.uiBusy)) this.eventNews(news);
    }
    this.storyClock += dt;
    if (this.storyClock >= STORY_INTERVAL) {
      this.storyClock = 0;
      for (const id of checkStory(this.state)) this.emit({ type: "story", id });
      for (const id of checkAchievements(this.state)) this.emit({ type: "achievement", id });
    }
  }

  runOffline(seconds: number): OfflineSummary {
    const s = this.state;
    const capped = Math.min(Math.max(0, seconds), CONFIG.offline.maxSeconds);
    const before = s.coins;
    const tiersBefore = totalTiers(s);
    const held = this.input.overdriveHeld;
    this.input.overdriveHeld = false;
    this.quiet = true;
    // Pasos largos: la inercia y la manivela usan exponenciales, estables con cualquier dt.
    const steps = Math.min(CONFIG.offline.maxSteps, Math.ceil(capped / CONFIG.tickSeconds));
    for (let i = 0; i < steps; i++) this.step(capped / steps);
    checkStory(s);
    checkAchievements(s);
    this.quiet = false;
    this.input.overdriveHeld = held;
    this.revision++;
    return { seconds: capped, gained: s.coins - before, tiers: totalTiers(s) - tiersBefore };
  }

  crank(): void {
    if (crank(this.state)) this.emit({ type: "crank" });
  }

  buyMotor(count: number): void {
    const n = buyMotor(this.state, count);
    if (n > 0) this.bought("motor", 0, n);
  }

  buyTeeth(shaft: number, count: number): void {
    const n = buyTeeth(this.state, shaft, count);
    if (n > 0) this.bought("teeth", shaft, n);
  }

  buyAllTeeth(): void {
    const n = buyAllTeeth(this.state);
    if (n > 0) this.bought("teeth", 0, n);
  }

  buyStage(): void {
    if (buyStage(this.state)) this.bought("stage", stageCount(this.state), 1);
  }

  buyGearbox(stage: number): void {
    if (!buyGearbox(this.state, stage)) return;
    this.revision++;
    this.speeds = shaftSpeeds(this.state);
    this.emit({ type: "gearbox", stage, installed: true });
  }

  /** Cambia de marcha una etapa, o todas con stage = 0. */
  setGear(stage: number, gear: 1 | 2): void {
    if (setGear(this.state, stage, gear) === 0) return;
    this.revision++;
    this.speeds = shaftSpeeds(this.state);
    this.emit({ type: "gearbox", stage, installed: false });
  }

  rebirth(): void {
    const gain = rebirth(this.state);
    this.revision++;
    this.speeds = shaftSpeeds(this.state);
    this.emit({ type: "rebirth", gain });
  }

  buyBrass(id: BrassId): void {
    if (!buyBrass(this.state, id)) return;
    if (id === "blueprints") applyBlueprints(this.state);
    this.revision++;
    this.speeds = shaftSpeeds(this.state);
    this.emit({ type: "brass", id });
  }

  /** El jugador actúa sobre el evento activo (clic, o aceptar/rechazar/estabilizar). */
  actOnEvent(action = "click"): void {
    const news = actOnEvent(this.state, action);
    if (news) this.eventNews(news);
  }

  /** Lanza un evento a mano (consola de desarrollo). */
  debugEvent(kind: EventKind): void {
    this.eventNews(spawnEvent(this.state, kind));
  }

  private eventNews(news: EventNews): void {
    // Algunos eventos cambian el tren (dientes perdidos, monedas, latón): la interfaz se redibuja.
    this.revision++;
    this.speeds = shaftSpeeds(this.state);
    this.emit({ type: "event", news });
  }

  private bought(what: "motor" | "teeth" | "stage", shaft: number, count: number): void {
    countPurchase(this.state, count);
    this.revision++;
    this.speeds = shaftSpeeds(this.state);
    this.emit({ type: "buy", what, shaft, count });
  }
}
