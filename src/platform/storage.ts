/**
 * Dónde vive el guardado. En web es localStorage; en la build de Steam se sustituirá por
 * archivos en disco sincronizados con Steam Cloud, sin tocar el resto del juego.
 */
export interface SaveStorage {
  load(): string | null;
  save(data: string): void;
  clear(): void;
}

const KEY = "engranajes.save";

export const localSaveStorage: SaveStorage = {
  load() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  save(data) {
    try {
      localStorage.setItem(KEY, data);
    } catch {
      // Almacenamiento bloqueado o lleno: el juego sigue, solo que sin guardar.
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignorado
    }
  },
};
