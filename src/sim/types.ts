import type { BrassId } from "./brass";
import type { EventsState } from "./modifiers";

/**
 * Un eje del tren. El eje 0 es el motor; el eje i ≥ 1 lleva un piñón movido por la rueda del eje
 * anterior, y `teethLevel` define cuántos dientes tiene esa rueda (la relación de la etapa i).
 */
export interface Shaft {
  teethLevel: number;
  /** Vueltas acumuladas en este ciclo; deciden el material. */
  revs: number;
}

export interface GameState {
  version: number;

  // --- Ciclo actual (se reinicia al fundir) ---
  coins: number;
  totalRun: number;
  motorLevel: number;
  shafts: Shaft[];
  /** Etapas regaladas por los Planos en este ciclo: no cuentan para el latón. */
  freeStages: number;
  /** Velocidad del motor tras la inercia (sin manivela ni sobremarcha), en vueltas/s. */
  motorSpeed: number;
  /** Impulso de la manivela, en vueltas/s; decae solo. */
  crank: number;
  /** Cuánto está metida la sobremarcha, de 0 a 1. */
  overdrive: number;
  /** Calor del motor, de 0 a 1. A 1 se gripa. */
  heat: number;
  /** Segundos que le quedan al motor gripado. */
  stall: number;
  timeRun: number;

  // --- Permanente ---
  totalAll: number;
  timeAll: number;
  brass: number;
  brassUpgrades: Partial<Record<BrassId, number>>;
  rebirths: number;
  /** Mayor velocidad de salida alcanzada nunca, en vueltas/s: mide el avance hacia el final. */
  bestRps: number;
  maxStages: number;
  story: {
    /** Partes de la historia desbloqueadas, en orden. */
    seen: string[];
    /** Desbloqueadas que el jugador aún no ha leído (pueden llegar durante el progreso offline). */
    unread: string[];
    /** Reacciones de Anselmo que solo se dicen una vez y ya se dijeron. */
    reactions: string[];
    ended: boolean;
    /** Tiempo total de juego cuando el Gran Reloj volvió a andar. */
    endTime: number;
  };

  /** Eventos aleatorios: el activo, las mejoras temporales, la racha y los fragmentos. */
  events: EventsState;

  lastSaved: number;
  settings: { muted: boolean; automaton: boolean };
}

/** Lo que el jugador está haciendo en este instante y no se guarda. */
export interface Input {
  overdriveHeld: boolean;
  /** Hay una ventana abierta: no se lanzan eventos que el jugador no vería. */
  uiBusy?: boolean;
}
