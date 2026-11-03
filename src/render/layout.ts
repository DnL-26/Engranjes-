import { pinionTeeth, stageCount, wheelTeeth } from "../sim/economy";
import type { GameState } from "../sim/types";

/** Unidades de mundo por diente (el "módulo" del engranaje): radio primitivo = dientes × MODULE / 2. */
export const MODULE = 4;
export const FLYWHEEL_RADIUS = 30;
/** El tren sube por la torre: cada eje se coloca hacia arriba, desviado este ángulo de la vertical. */
const ZIGZAG = 0.55;
const UP = -Math.PI / 2;

export interface ShaftLayout {
  x: number;
  y: number;
  /** Dientes de la rueda que mueve al eje siguiente; null en el último eje. */
  wheelTeeth: number | null;
  /** El eje 0 (motor) no tiene piñón. */
  pinion: boolean;
  /** El último eje lleva un volante en lugar de rueda. */
  flywheel: boolean;
  /** Radio que ocupa el eje en pantalla, para la cámara. */
  extent: number;
  /** Ángulo de la línea que une este eje con el anterior. */
  link: number;
}

export function pitchRadius(teeth: number): number {
  return (teeth * MODULE) / 2;
}

/** Centro y semiancho de la torre que envuelve al tren (las ruedas crecen con los dientes). */
export function towerBounds(layout: ShaftLayout[]): { cx: number; half: number } {
  let cx = 0;
  for (const l of layout) cx += l.x;
  cx /= layout.length;
  let half = 0;
  for (const l of layout) half = Math.max(half, Math.abs(l.x - cx) + l.extent);
  return { cx, half: half + 70 };
}

export function computeLayout(s: GameState): ShaftLayout[] {
  const n = stageCount(s);
  const out: ShaftLayout[] = [];
  const pinionR = pitchRadius(pinionTeeth(s));
  let x = 0;
  let y = 0;
  for (let i = 0; i <= n; i++) {
    const wheel = i < n ? wheelTeeth(s.shafts[i + 1].teethLevel) : null;
    let link = 0;
    if (i > 0) {
      link = UP + (i % 2 === 1 ? -ZIGZAG : ZIGZAG);
      const d = pitchRadius(out[i - 1].wheelTeeth!) + pinionR;
      x += Math.cos(link) * d;
      y += Math.sin(link) * d;
    }
    const extent = Math.max(
      wheel ? pitchRadius(wheel) + MODULE : 0,
      i > 0 ? pinionR + MODULE : 0,
      i === n ? FLYWHEEL_RADIUS : 0,
    );
    out.push({ x, y, wheelTeeth: wheel, pinion: i > 0, flywheel: i === n, extent, link });
  }
  return out;
}
