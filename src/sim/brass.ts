import type { GameState } from "./types";

/** Mejoras permanentes que se compran con latón y sobreviven a la fundición. */
export type BrassId =
  | "motors"
  | "pinion"
  | "mill"
  | "alloy"
  | "blueprints"
  | "radiator"
  | "turbo"
  | "automaton";

export interface BrassDef {
  id: BrassId;
  name: string;
  /** Qué hace el nivel `lvl` (el actual o el siguiente). */
  effect(lvl: number): string;
  max: number;
  cost(lvl: number): number;
}

const geometric = (base: number, growth: number) => (lvl: number) => Math.round(base * growth ** lvl);

export const BRASS: BrassDef[] = [
  {
    id: "motors",
    name: "Motores en paralelo",
    effect: (l) => `${l + 1} ${l === 0 ? "motor" : "motores"} empujando el eje: ×${l + 1} velocidad`,
    max: Infinity,
    cost: geometric(1, 2.6),
  },
  {
    id: "pinion",
    name: "Piñones finos",
    effect: (l) => `Piñones de ${8 - l} dientes: todas las relaciones ×${(8 / (8 - l)).toFixed(2)}`,
    max: 2,
    cost: (l) => [15, 150][l],
  },
  {
    id: "mill",
    name: "Fresadora",
    effect: (l) => `Ruedas de hasta ${52 + 8 * l} dientes`,
    max: Infinity,
    cost: geometric(2, 2.4),
  },
  {
    id: "alloy",
    name: "Aleaciones",
    effect: (l) => `Cada material da ×${(1.1 + 0.02 * l).toFixed(2)}`,
    max: Infinity,
    cost: geometric(3, 2.3),
  },
  {
    id: "blueprints",
    name: "Planos",
    effect: (l) => (l === 0 ? "Empiezas cada ciclo desde cero" : `Empiezas cada ciclo con ${l} ${l === 1 ? "etapa" : "etapas"}`),
    max: 6,
    cost: geometric(1, 2),
  },
  {
    id: "radiator",
    name: "Radiador",
    effect: (l) => `La sobremarcha calienta un ${20 * l}% menos`,
    max: 4,
    cost: geometric(1, 2.2),
  },
  {
    id: "turbo",
    name: "Turbocompresor",
    effect: (l) => `Sobremarcha hasta ×${3 + l}`,
    max: 3,
    cost: geometric(3, 3),
  },
  {
    id: "automaton",
    name: "Autómata",
    effect: (l) => ["Sin autómata", "Compra dientes y motor solo", "Además compra etapas solo"][l],
    max: 2,
    cost: (l) => [4, 25][l],
  },
];

export function brassDef(id: BrassId): BrassDef {
  return BRASS.find((d) => d.id === id)!;
}

export function brassLevel(s: GameState, id: BrassId): number {
  return s.brassUpgrades[id] ?? 0;
}

export function brassCost(s: GameState, id: BrassId): number {
  return brassDef(id).cost(brassLevel(s, id));
}

export function brassMaxed(s: GameState, id: BrassId): boolean {
  return brassLevel(s, id) >= brassDef(id).max;
}

export function buyBrass(s: GameState, id: BrassId): boolean {
  if (brassMaxed(s, id)) return false;
  const cost = brassCost(s, id);
  if (cost > s.brass) return false;
  s.brass -= cost;
  s.brassUpgrades[id] = brassLevel(s, id) + 1;
  return true;
}
