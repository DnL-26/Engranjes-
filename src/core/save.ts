import { newGame, SAVE_VERSION } from "../sim/economy";
import type { GameState } from "../sim/types";

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export function deserialize(json: string): GameState {
  const f = JSON.parse(json) as Partial<GameState>;
  if (typeof f !== "object" || f === null || typeof f.version !== "number") {
    throw new Error("El guardado no es válido.");
  }
  if (f.version > SAVE_VERSION) throw new Error("El guardado es de una versión más nueva del juego.");
  if (!Array.isArray(f.shafts) || f.shafts.length === 0) throw new Error("El tren del guardado está corrupto.");
  // Los campos ausentes (guardados v1, sin latón ni historia) toman su valor inicial.
  const base = newGame();
  return {
    ...base,
    ...f,
    settings: { ...base.settings, ...f.settings, volume: { ...base.settings.volume, ...f.settings?.volume } },
    story: { ...base.story, ...f.story },
    events: { ...base.events, ...f.events },
    stats: { ...base.stats, ...f.stats },
    brassUpgrades: { ...f.brassUpgrades },
    version: SAVE_VERSION,
  } as GameState;
}

export function encodeExport(s: GameState): string {
  return btoa(serialize(s));
}

export function decodeExport(text: string): GameState {
  let json: string;
  try {
    json = atob(text.trim());
  } catch {
    throw new Error("El texto no es un guardado exportado.");
  }
  return deserialize(json);
}
