import type { ActiveEvent } from "./events";
import type { GameState } from "./types";

/**
 * Efectos de los eventos aleatorios sobre la economía. Solo leen `s.events`, sin depender de
 * economy.ts, para que economy.ts pueda usarlos sin importaciones circulares.
 */

export type BuffId =
  | "frenzy"
  | "perfectRepair"
  | "oiled"
  | "unstable"
  | "resonance"
  | "elixir"
  | "mystery"
  | "bell"
  | "storm";

export interface Buff {
  id: BuffId;
  /** Multiplicador de ingresos (1 si el efecto es otro, como la campanada o la tormenta). */
  mult: number;
  timeLeft: number;
  duration: number;
}

export interface EventsState {
  active: ActiveEvent | null;
  /** Segundos hasta el próximo evento. */
  cooldown: number;
  buffs: Buff[];
  /** Eventos resueltos seguidos. */
  streak: number;
  /** Fragmentos de recuerdo de Anselmo recogidos (permanente). */
  fragments: number;
}

/** El primer evento llega pronto, para enseñar que existen. */
export const FIRST_EVENT_DELAY = 60;

export function newEventsState(): EventsState {
  return { active: null, cooldown: FIRST_EVENT_DELAY, buffs: [], streak: 0, fragments: 0 };
}

/** Cada fragmento de recuerdo da este bonus permanente de ingresos. */
export const FRAGMENT_BONUS = 0.05;
/** La racha de atención da este bonus por evento resuelto seguido, hasta el tope. */
export const STREAK_BONUS = 0.05;
export const STREAK_CAP = 10;
export const BELL_CRANK_MULT = 50;
/** Una paloma posada frena su etapa a esta fracción. */
export const PIGEON_FACTOR = 0.5;

export function hasBuff(s: GameState, id: BuffId): boolean {
  return s.events.buffs.some((b) => b.id === id);
}

export function streakMult(s: GameState): number {
  return 1 + STREAK_BONUS * Math.min(s.events.streak, STREAK_CAP);
}

export function fragmentMult(s: GameState): number {
  return 1 + FRAGMENT_BONUS * s.events.fragments;
}

/** Multiplicador de ingresos de todo lo relacionado con eventos: mejoras activas, racha y fragmentos. */
export function eventIncomeMult(s: GameState): number {
  let m = streakMult(s) * fragmentMult(s);
  for (const b of s.events.buffs) m *= b.mult;
  return m;
}

/** Factor sobre la relación de una etapa: un atasco la deja en ×1 y una paloma la frena. */
export function stageFactor(s: GameState, stage: number, ratio: number): number {
  const a = s.events.active;
  if (!a || a.stage !== stage) return 1;
  if (a.kind === "jam") return 1 / ratio;
  if (a.kind === "pigeon") return PIGEON_FACTOR;
  return 1;
}

export function crankMult(s: GameState): number {
  return hasBuff(s, "bell") ? BELL_CRANK_MULT : 1;
}

/** Con tormenta, la sobremarcha no calienta. */
export function heatFactor(s: GameState): number {
  return hasBuff(s, "storm") ? 0 : 1;
}
