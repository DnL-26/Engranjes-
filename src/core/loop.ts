import { CONFIG } from "../sim/config";

export interface LoopHooks {
  step(dt: number): void;
  render(timeMs: number): void;
  /** Hueco largo entre frames (pestaña oculta, equipo suspendido): se resuelve como progreso offline. */
  catchUp(seconds: number): void;
}

const LONG_GAP_SECONDS = 5;
const MAX_STEPS_PER_FRAME = 240;

/** Simulación a paso fijo desacoplada del render. `speed` > 1 solo para pruebas en desarrollo. */
export function startLoop(hooks: LoopHooks, speed = 1): void {
  const dt = CONFIG.tickSeconds;
  let last = performance.now();
  let acc = 0;

  const frame = (now: number) => {
    const elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > LONG_GAP_SECONDS) {
      hooks.catchUp(elapsed * speed);
    } else {
      acc += elapsed * speed;
      let steps = 0;
      while (acc >= dt && steps < MAX_STEPS_PER_FRAME) {
        hooks.step(dt);
        acc -= dt;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) acc = 0;
    }
    hooks.render(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
