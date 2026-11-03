import "./style.css";
import { Sound } from "./audio/sound";
import { Game } from "./core/game";
import { startLoop } from "./core/loop";
import { deserialize, serialize } from "./core/save";
import { localSaveStorage } from "./platform/storage";
import { Fx } from "./render/fx";
import { Renderer } from "./render/renderer";
import { newGame } from "./sim/economy";
import type { GameState } from "./sim/types";
import { ENDING_ID } from "./sim/dialogue";
import type { EventNews } from "./sim/events";
import { AnselmoUI } from "./ui/anselmo";
import { EventsUI } from "./ui/events";
import { byId, isModalOpen } from "./ui/dom";
import { Hud } from "./ui/hud";

const AUTOSAVE_MS = 30_000;
const MIN_OFFLINE_SUMMARY_SECONDS = 60;

const storage = localSaveStorage;

function loadState(): GameState | null {
  const raw = storage.load();
  if (!raw) return null;
  try {
    return deserialize(raw);
  } catch (err) {
    console.error("No se pudo cargar el guardado:", err);
    return null;
  }
}

const loaded = loadState();
const game = new Game(loaded ?? newGame());
/** Tras borrar o importar se recarga la página; esto evita que el autoguardado pise el cambio. */
let saving = true;

const save = () => {
  if (!saving) return;
  game.state.lastSaved = Date.now();
  storage.save(serialize(game.state));
};

const sound = new Sound();
sound.setMuted(game.state.settings.muted);
const fx = new Fx();
const canvas = byId<HTMLCanvasElement>("world");
const renderer = new Renderer(canvas, game, fx);
renderer.onRev = (i) => sound.tick(1 + i * 0.15);

// La cámara encuadra el tren en el hueco que dejan libre la barra superior y la de botones.
const stage = byId("stage");
const dock = byId("dock");
const corner = byId("corner");
const fitInsets = () => {
  const box = stage.getBoundingClientRect();
  const dockTop = dock.getBoundingClientRect().top;
  renderer.insets.top = corner.getBoundingClientRect().bottom - box.top + 12;
  renderer.insets.bottom = box.bottom - dockTop + 12;
  // Anselmo flota justo encima de la barra de botones, a la izquierda; en pantallas anchas se le deja hueco.
  stage.style.setProperty("--dock-h", `${box.bottom - dockTop}px`);
  renderer.insets.left = box.width > 760 ? 150 : 24;
};
new ResizeObserver(fitInsets).observe(dock);
new ResizeObserver(fitInsets).observe(stage);

const hud = new Hud(game, {
  load: (json) => {
    saving = false;
    storage.save(json);
    location.reload();
  },
  wipe: () => {
    saving = false;
    storage.clear();
    location.reload();
  },
  setMuted: (m) => sound.setMuted(m),
  toggleView: () => (renderer.showAll = !renderer.showAll),
  retell: (id) => anselmo.retell(id),
});

const anselmo = new AnselmoUI(game);
const eventsUi = new EventsUI(game, renderer);
anselmo.onBlip = () => sound.voice();
anselmo.onStoryDone = (id) => {
  if (id === ENDING_ID) hud.showEnding();
};

// --- Entrada ---

const crankBtn = byId("crank-btn");
const odBtn = byId<HTMLButtonElement>("od-btn");

window.addEventListener("pointerdown", () => sound.unlock(), { capture: true });
canvas.addEventListener("pointerdown", () => game.crank());
crankBtn.addEventListener("pointerdown", () => game.crank());

const setOverdrive = (held: boolean) => {
  game.input.overdriveHeld = held;
};
odBtn.addEventListener("pointerdown", (e) => {
  odBtn.setPointerCapture(e.pointerId);
  setOverdrive(true);
});
for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) {
  odBtn.addEventListener(ev, () => setOverdrive(false));
}

window.addEventListener("keydown", (e) => {
  if (isModalOpen() || e.repeat) return;
  sound.unlock();
  if (e.code === "Space") {
    e.preventDefault();
    game.crank();
    crankBtn.classList.add("pressed");
  } else if (e.key === "Shift") {
    setOverdrive(true);
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") crankBtn.classList.remove("pressed");
  if (e.key === "Shift") setOverdrive(false);
});
window.addEventListener("blur", () => setOverdrive(false));

// --- Bucle ---

function playEventSound(n: EventNews): void {
  if (n.type === "spawn") {
    if (n.kind === "bell") sound.bell();
    else if (n.kind === "storm") sound.thunder();
    else sound.chime(7);
  } else if (n.type === "progress") {
    if (n.kind === "jam") sound.tick(1.6);
    else sound.chime(n.amount === -1 ? 0 : 3 + (n.amount ?? 0));
  } else if (n.type === "resolve") {
    sound.chime(9);
    sound.clunk();
  } else if (n.kind === "unstable") {
    sound.stall();
  }
}

const catchUp = (seconds: number) => {
  const summary = game.runOffline(seconds);
  if (summary.seconds >= MIN_OFFLINE_SUMMARY_SECONDS) hud.showOfflineSummary(summary);
};

if (loaded) catchUp((Date.now() - loaded.lastSaved) / 1000);

// Acceso desde la consola para depurar; no existe en el build de producción.
if (import.meta.env.DEV) Object.assign(window, { __game: game, __fx: fx, __renderer: renderer });

// En desarrollo, ?speed=10 acelera la simulación para probar el balance.
const speed = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("speed")) || 1 : 1;

let lastFrame = performance.now();
startLoop({
  step: (dt) => game.step(dt),
  render: (t) => {
    const dt = Math.min(0.1, (t - lastFrame) / 1000);
    lastFrame = t;
    const events = game.drainEvents();
    for (const e of events) {
      if (e.type === "buy") sound.clunk();
      else if (e.type === "tier") sound.chime(e.tier);
      else if (e.type === "stall") sound.stall();
      else if (e.type === "crank") sound.tick(0.7);
      else if (e.type === "rebirth") sound.foundry();
      else if (e.type === "brass") sound.chime(6);
      else if (e.type === "story") sound.chime(e.id === "final" ? 10 : 4);
      else if (e.type === "event") playEventSound(e.news);
    }
    renderer.handle(events);
    anselmo.handle(events);
    eventsUi.handle(events);
    renderer.frame(dt);
    game.input.uiBusy = isModalOpen();
    hud.update();
    anselmo.update(dt);
    eventsUi.frame();
    sound.updateHum(game.speeds[game.speeds.length - 1] ?? 0, game.state.overdrive);
  },
  catchUp,
}, speed);

setInterval(save, AUTOSAVE_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") save();
});
window.addEventListener("beforeunload", save);
