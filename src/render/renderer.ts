import type { Game, GameEvent } from "../core/game";
import { CONFIG } from "../sim/config";
import { clockProgress, globalMult, material, motorCount, motorRps, pinionTeeth, stageRatio, tierOf } from "../sim/economy";
import { fmt } from "../util/format";
import type { Fx } from "./fx";
import { computeLayout, FLYWHEEL_RADIUS, MODULE, pitchRadius, towerBounds, type ShaftLayout } from "./layout";
import { Scenery } from "./scenery";

const TAU = Math.PI * 2;
/** Por debajo de tantos pasos por segundo (dientes, radios) se distinguen; por encima se funden. */
const VISIBLE_HZ = 15;
const GONE_HZ = 60;
/** Hasta esta velocidad visual un eje gira en pantalla a su velocidad exacta (y sus dientes engranan). */
const BLUR_RPS = 6;
/** Tope del giro en pantalla de un borrón; por encima, solo crece la estela. */
const MAX_SPIN_RPS = 14;
const MAX_DRAWN_MOTORS = 6;
/** El primer eje en pantalla gira, como mucho, a tantas vueltas/s visuales (ver `timeScale`). */
const FIRST_VISIBLE_RPS = 0.3;
const HOLES = 5;
const FLY_SPOKES = 6;
const FOLLOW_SHAFTS = 4;
const MAX_SCALE = 3;
/** Por debajo de esta velocidad, cada vuelta suelta su "+monedas"; por encima, un flujo continuo. */
const SLOW_RPS = 2.5;
const STREAM_INTERVAL = 0.35;

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Giro en pantalla para una velocidad visual: exacto mientras se distinguen los dientes, y después
 * crece cada vez más despacio pero sin frenarse, de modo que cada eje gire más rápido que el
 * anterior, como en un tren de verdad.
 */
function spinRps(v: number): number {
  if (v <= BLUR_RPS) return v;
  return Math.min(MAX_SPIN_RPS, BLUR_RPS * (1 + 0.35 * Math.log(v / BLUR_RPS)));
}

/** Longitud (radianes) de la estela de un borrón: crece con la velocidad hasta casi cerrar el círculo. */
function smearAngle(v: number): number {
  return clamp((spinRps(v) * TAU) / 40 + Math.log10(Math.max(1, v / BLUR_RPS)) * 0.8, 0.4, TAU * 0.85);
}

/** Visibilidad (0–1) de un detalle que pasa `hz` veces por segundo. */
function fade(hz: number): number {
  return clamp((GONE_HZ - hz) / (GONE_HZ - VISIBLE_HZ), 0, 1);
}

/** Cuánto brilla un eje por su velocidad: 0 a 10 vueltas/s, 1 a 10¹². */
export function heatOf(rps: number): number {
  return clamp((Math.log10(Math.max(rps, 1e-9)) - 1) / 11, 0, 1);
}

const HEAT_STOPS: [number, [number, number, number]][] = [
  [0, [255, 70, 20]],
  [0.35, [255, 150, 40]],
  [0.65, [255, 240, 200]],
  [1, [140, 190, 255]],
];

export function heatRgb(t: number, alpha = 1): string {
  let i = 0;
  while (i < HEAT_STOPS.length - 2 && t > HEAT_STOPS[i + 1][0]) i++;
  const [t0, c0] = HEAT_STOPS[i];
  const [t1, c1] = HEAT_STOPS[i + 1];
  const k = clamp((t - t0) / (t1 - t0), 0, 1);
  const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

export class Renderer {
  layout: ShaftLayout[] = [];
  showAll = false;
  /** Llamado por cada vuelta completa de un eje lento visible (para el sonido). */
  onRev: ((shaft: number) => void) | null = null;
  /** Márgenes en píxeles que tapa la interfaz superpuesta. */
  insets = { top: 120, bottom: 150, left: 24, right: 24 };

  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private layoutRev = -1;
  private angles: number[] = [];
  private pops: number[] = [];
  private lastRevs: number[] = [];
  private sparkAcc: number[] = [];
  private streamTime = 0;
  private streamCoins = 0;
  private cam = { x: 0, y: 0, scale: 2 };
  private camReady = false;
  private shake = 0;
  /** Destello naranja a pantalla completa (fundición), de 1 a 0. */
  private flash = 0;
  /** Relámpago de la tormenta, de 1 a 0. */
  private lightning = 0;
  /**
   * Cámara lenta visual: todos los ejes giran en pantalla a su velocidad real × timeScale, de modo
   * que el primero visible siempre se ve nítido y el desenfoque crece a lo largo del tren. Al ser
   * un factor común, las relaciones (y el engrane de los dientes) se conservan.
   */
  private timeScale = 1;
  /** Sentido de giro del eje que se está dibujando (los ejes alternan). */
  private spinDir = 1;
  private gearPaths = new Map<number, Path2D>();
  private scenery = new Scenery();
  private tower = { cx: 0, half: 200 };
  private time = 0;
  /** Celebración del final (campanadas, la cámara se aleja), de 1 a 0. */
  private celebrate = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
    private fx: Fx,
  ) {
    this.ctx = canvas.getContext("2d")!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
  }

  // --- Eventos ---

  handle(events: GameEvent[]): void {
    this.syncLayout();
    for (const e of events) {
      switch (e.type) {
        case "tier": {
          const l = this.layout[e.shaft];
          if (!l) break;
          const m = material(e.tier);
          this.fx.ring(l.x, l.y, l.extent, m.color);
          this.fx.burst(l.x, l.y - l.extent * 0.5, m.color, 18, 160);
          this.fx.floater(l.x, l.y - l.extent - 6, `¡${m.name.toUpperCase()}!`, m.color, 20, 1.6, `tier${e.shaft}`);
          this.pops[e.shaft] = 1;
          break;
        }
        case "buy": {
          if (e.what === "motor") {
            this.pops[0] = 0.6;
          } else if (e.what === "teeth") {
            const i = e.shaft - 1;
            this.pops[i] = 1;
            const l = this.layout[i];
            if (l) this.fx.burst(l.x, l.y, "#ffd36b", 10, 120);
          } else {
            const l = this.layout[e.shaft];
            this.pops[e.shaft] = 1;
            if (l) {
              this.fx.ring(l.x, l.y, l.extent * 1.5, "#ffd36b", 0.9);
              this.fx.floater(l.x, l.y - l.extent - 10, `Etapa ${e.shaft}`, "#ffd36b", 22, 1.8);
            }
          }
          break;
        }
        case "stall": {
          // En la salida, que es lo que sigue la cámara; el humo sale del motor.
          const l = this.layout[this.layout.length - 1];
          this.shake = 10;
          this.fx.floater(l.x, l.y - l.extent - 10, "¡GRIPADO!", "#ff5a4a", 28, 2.2);
          this.fx.burst(l.x, l.y, "#ff8a3a", 30, 220);
          break;
        }
        case "rebirth":
          this.fx.clear();
          this.flash = 1;
          this.camReady = false;
          break;
        case "brass":
          this.flash = Math.max(this.flash, 0.25);
          break;
        case "story":
          if (e.id === "final") {
            this.celebrate = 1;
            this.flash = 0.6;
          }
          break;
        case "crank": {
          const l = this.layout[0];
          const a = this.angles[0] ?? 0;
          const r = this.crankLength();
          this.fx.burst(l.x + Math.cos(a) * r, l.y + Math.sin(a) * r, "#ffe7a8", 3, 80);
          this.pops[0] = Math.max(this.pops[0] ?? 0, 0.25);
          break;
        }
      }
    }
  }

  // --- Frame ---

  frame(dt: number): void {
    this.syncLayout();
    this.advance(dt);
    this.spawnContinuous(dt);
    this.fx.update(dt);
    this.updateCamera(dt);
    this.draw();
  }

  private syncLayout(): void {
    const s = this.game.state;
    if (this.layoutRev === this.game.revision && this.layout.length === s.shafts.length) return;
    this.layoutRev = this.game.revision;
    this.layout = computeLayout(s);
    this.tower = towerBounds(this.layout);
    // La torre también envuelve el banco de motores, al pie del primer engranaje.
    if (s.motorLevel > 0) {
      const m = this.motorBox();
      this.tower.half = Math.max(this.tower.half, Math.abs(m.x - this.tower.cx) + 40, Math.abs(m.x + m.w - this.tower.cx) + 40);
    }
    for (let i = 0; i < this.layout.length; i++) {
      this.angles[i] ??= 0;
      this.pops[i] ??= 0;
      this.sparkAcc[i] ??= 0;
      this.lastRevs[i] = Math.floor(s.shafts[i].revs);
    }
    this.angles.length = this.layout.length;
    this.realign();
  }

  /** Coloca cada piñón para que sus dientes encajen en los huecos de la rueda que lo mueve. */
  private realign(): void {
    const np = pinionTeeth(this.game.state);
    for (let i = 1; i < this.layout.length; i++) {
      const prev = this.layout[i - 1];
      const nw = prev.wheelTeeth!;
      const phi = this.layout[i].link;
      this.angles[i] = phi + Math.PI + Math.PI / np - (this.angles[i - 1] - phi) * (nw / np);
    }
  }

  /** Velocidad visual de un eje, en vueltas/s de pantalla. */
  private visualRps(i: number): number {
    return (this.game.speeds[i] ?? 0) * this.timeScale;
  }

  private updateTimeScale(dt: number): void {
    const s = this.game.state;
    const first = this.firstFollowed();
    // Con la velocidad nominal: la manivela y la sobremarcha sí deben notarse en pantalla.
    let base = motorRps(s);
    for (let i = 1; i <= first; i++) base *= stageRatio(s, i);
    const target = base > FIRST_VISIBLE_RPS ? FIRST_VISIBLE_RPS / base : 1;
    const k = 1 - Math.exp(-dt * 1.5);
    this.timeScale = Math.exp(Math.log(this.timeScale) + (Math.log(target) - Math.log(this.timeScale)) * k);
  }

  private firstFollowed(): number {
    // Durante la celebración del final la cámara se aleja para enseñar la torre entera.
    return this.showAll || this.celebrate > 0 ? 0 : Math.max(0, this.layout.length - FOLLOW_SHAFTS);
  }

  private advance(dt: number): void {
    this.updateTimeScale(dt);
    for (let i = 0; i < this.layout.length; i++) {
      const visual = spinRps(this.visualRps(i));
      const dir = i % 2 === 0 ? 1 : -1;
      this.angles[i] = (this.angles[i] + dir * visual * TAU * dt) % TAU;
      this.pops[i] = Math.max(0, this.pops[i] - dt * 4);
    }
    this.shake = Math.max(0, this.shake - dt * 20);
    this.flash = Math.max(0, this.flash - dt * 0.8);
    this.lightning = Math.max(0, this.lightning - dt * 4);
    this.celebrate = Math.max(0, this.celebrate - dt / 9);
    this.time += dt;
  }

  private spawnContinuous(dt: number): void {
    const s = this.game.state;
    const speeds = this.game.speeds;
    const n = this.layout.length - 1;
    const payout = CONFIG.payoutPerRev * globalMult(s);

    for (let i = 0; i <= n; i++) {
      const l = this.layout[i];
      const revs = Math.floor(s.shafts[i].revs);
      if (revs > this.lastRevs[i] && speeds[i] < SLOW_RPS && this.visible(l)) {
        this.fx.floater(l.x, l.y - l.extent * 0.6, `+${fmt(payout)}`, "#ffd36b", 15);
        this.onRev?.(i);
      }
      this.lastRevs[i] = revs;
    }

    // Flujo de monedas del último eje cuando ya gira demasiado rápido para contar vueltas.
    const last = this.layout[n];
    if (speeds[n] >= SLOW_RPS) {
      this.streamTime += dt;
      this.streamCoins += this.game.income * dt;
      if (this.streamTime >= STREAM_INTERVAL) {
        const size = clamp(14 + 1.2 * Math.log10(Math.max(1, this.streamCoins)), 14, 30);
        const jitter = (Math.random() - 0.5) * last.extent;
        this.fx.floater(last.x + jitter, last.y - last.extent, `+${fmt(this.streamCoins)}`, "#ffd36b", size);
        this.streamTime = 0;
        this.streamCoins = 0;
      }
    } else {
      this.streamTime = 0;
      this.streamCoins = 0;
    }

    // Chispas en los puntos de contacto de las etapas rápidas.
    const od = 1 + 2 * s.overdrive;
    for (let i = 1; i <= n; i++) {
      const rps = speeds[i];
      if (rps < 15) continue;
      const prev = this.layout[i - 1];
      if (!this.visible(this.layout[i])) continue;
      this.sparkAcc[i] += Math.min(60, 6 * Math.log10(rps)) * od * dt;
      const phi = this.layout[i].link;
      const r = pitchRadius(prev.wheelTeeth!);
      const cx = prev.x + Math.cos(phi) * r;
      const cy = prev.y + Math.sin(phi) * r;
      const dir = (i - 1) % 2 === 0 ? 1 : -1;
      const color = heatRgb(heatOf(rps));
      while (this.sparkAcc[i] >= 1) {
        this.sparkAcc[i]--;
        const v = 80 + Math.random() * 140;
        const spread = (Math.random() - 0.5) * 0.9;
        const a = phi + (Math.PI / 2) * dir + spread;
        this.fx.spark(cx, cy, Math.cos(a) * v, Math.sin(a) * v - 40, color);
      }
    }

    // Eventos: un atasco echa chispas rojas; un engranaje inestable tiembla.
    const ev = s.events.active;
    if (ev?.kind === "jam" && ev.stage !== undefined && this.layout[ev.stage]) {
      const l = this.layout[ev.stage];
      if (Math.random() < dt * 30) {
        const a = Math.random() * TAU;
        this.fx.spark(l.x, l.y, Math.cos(a) * 160, Math.sin(a) * 160 - 60, "#ff4a2a", 2.2, 0.5);
      }
    }
    if (ev?.kind === "unstable" && ev.stage !== undefined) {
      this.pops[ev.stage] = Math.max(this.pops[ev.stage] ?? 0, 0.3 + 0.1 * Math.sin(performance.now() / 30));
    }
    if (s.events.buffs.some((b) => b.id === "storm") && Math.random() < dt * 0.8) this.lightning = 1;

    if (s.stall > 0 && Math.random() < dt * 14) {
      const m = this.motorBox();
      this.fx.smoke(m.x + m.w / 2, m.y);
    }
    if (s.overdrive > 0) this.shake = Math.max(this.shake, s.overdrive * 2.5);
  }

  // --- Cámara ---

  private availArea() {
    const w = Math.max(50, this.w - this.insets.left - this.insets.right);
    const h = Math.max(50, this.h - this.insets.top - this.insets.bottom);
    return { w, h, cx: this.insets.left + w / 2, cy: this.insets.top + h / 2 };
  }

  private updateCamera(dt: number): void {
    const from = this.firstFollowed();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = from; i < this.layout.length; i++) {
      const l = this.layout[i];
      minX = Math.min(minX, l.x - l.extent);
      maxX = Math.max(maxX, l.x + l.extent);
      minY = Math.min(minY, l.y - l.extent);
      maxY = Math.max(maxY, l.y + l.extent);
    }
    if (from === 0 && this.game.state.motorLevel > 0) {
      const m = this.motorBox();
      minX = Math.min(minX, m.x);
      maxX = Math.max(maxX, m.x + m.w);
      maxY = Math.max(maxY, m.y + m.h);
    }
    const area = this.availArea();
    const pad = 30;
    const scale = Math.min(MAX_SCALE, area.w / (maxX - minX + pad * 2), area.h / (maxY - minY + pad * 2));
    const tx = (minX + maxX) / 2;
    const ty = (minY + maxY) / 2;
    if (!this.camReady) {
      this.cam = { x: tx, y: ty, scale };
      this.camReady = true;
      return;
    }
    const k = 1 - Math.exp(-dt * 3);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.scale = Math.exp(Math.log(this.cam.scale) + (Math.log(scale) - Math.log(this.cam.scale)) * k);
  }

  /** Posición en pantalla (px del escenario) de un eje y su radio, para colocar botones encima. */
  shaftScreen(i: number): { x: number; y: number; r: number } | null {
    const l = this.layout[i];
    if (!l) return null;
    const [x, y] = this.worldToScreen(l.x, l.y);
    return { x, y, r: l.extent * this.cam.scale };
  }

  private worldToScreen(x: number, y: number): [number, number] {
    const a = this.availArea();
    return [(x - this.cam.x) * this.cam.scale + a.cx, (y - this.cam.y) * this.cam.scale + a.cy];
  }

  private visible(l: ShaftLayout): boolean {
    const [sx, sy] = this.worldToScreen(l.x, l.y);
    const r = l.extent * this.cam.scale;
    return sx + r > 0 && sx - r < this.w && sy + r > 0 && sy - r < this.h;
  }

  // --- Dibujo ---

  private draw(): void {
    const ctx = this.ctx;
    const { dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    const a = this.availArea();
    // Con "reducir destellos" no hay temblor de cámara y los destellos se atenúan mucho.
    const calm = this.game.state.settings.reduceMotion;
    const shake = calm ? 0 : this.shake;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    const scale = this.cam.scale;
    const ox = a.cx - this.cam.x * scale + sx;
    const oy = a.cy - this.cam.y * scale + sy;

    const s = this.game.state;
    const l0 = this.layout[0];
    this.scenery.draw({
      ctx, dpr, w: this.w, h: this.h, scale,
      camX: this.cam.x, camY: this.cam.y, cx: a.cx + sx, cy: a.cy + sy,
      time: this.time,
      progress: clockProgress(s),
      ended: s.story.ended,
      tower: this.tower,
      ground: l0.y + l0.extent + 100,
      celebrate: this.celebrate,
    });

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    if (this.game.state.motorLevel > 0) this.drawMotor();
    for (let i = this.layout.length - 1; i >= 0; i--) {
      if (this.visible(this.layout[i])) this.drawShaft(i);
    }
    this.drawParticles(scale);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawFloaters(sx, sy);
    this.drawVignette();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 140, 50, ${this.flash * (calm ? 0.15 : 0.7)})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (this.lightning > 0 && !calm) {
      ctx.fillStyle = `rgba(200, 220, 255, ${this.lightning * this.lightning * 0.35})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  private drawVignette(): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(
      this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35,
      this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private crankLength(): number {
    const l = this.layout[0];
    return Math.max(18, (l.wheelTeeth ? pitchRadius(l.wheelTeeth) : FLYWHEEL_RADIUS) * 0.75);
  }

  /** Banco de motores al pie de la torre, bajo el eje 0: una fila con un motor por cada uno comprado. */
  private motorBox() {
    const l = this.layout[0];
    const count = Math.min(MAX_DRAWN_MOTORS, motorCount(this.game.state));
    const size = count === 1 ? 46 : 34;
    const gap = 8;
    const w = count * size + (count - 1) * gap;
    const x = l.x - w / 2;
    const y = l.y + l.extent + 24;
    const boxes = Array.from({ length: count }, (_, k) => ({ x: x + k * (size + gap), y, w: size, h: size }));
    return { x, y, w, h: size, boxes };
  }

  private drawMotor(): void {
    const ctx = this.ctx;
    const s = this.game.state;
    const l = this.layout[0];
    const m = this.motorBox();
    const glow = s.heat;
    // Ejes que salen de cada motor y convergen en el engranaje.
    ctx.strokeStyle = "#3b3631";
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (const b of m.boxes) {
      ctx.moveTo(b.x + b.w / 2, b.y);
      ctx.lineTo(l.x, l.y);
    }
    ctx.stroke();
    for (const b of m.boxes) {
      ctx.fillStyle = "#2a2622";
      ctx.strokeStyle = "#4d463e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 6);
      ctx.fill();
      ctx.stroke();
      // Aletas de refrigeración, que se ponen al rojo con el calor.
      const fins = 4;
      const pitch = (b.h - 12) / fins;
      for (let k = 0; k < fins; k++) {
        ctx.fillStyle = glow > 0.02 ? `rgba(${120 + 135 * glow}, ${70 + 40 * glow}, 40, 1)` : "#3e3832";
        ctx.fillRect(b.x + 6, b.y + 6 + k * pitch + pitch * 0.25, b.w - 12, pitch * 0.5);
      }
    }
    const count = motorCount(s);
    if (count > MAX_DRAWN_MOTORS) {
      ctx.fillStyle = "#d9c9a3";
      ctx.font = "700 14px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(`×${count}`, m.x + m.w / 2, m.y + m.h + 6);
    }
    if (glow > 0.3) {
      ctx.globalCompositeOperation = "lighter";
      const cx = m.x + m.w / 2;
      const cy = m.y + m.h / 2;
      const r = Math.max(m.w, m.h);
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
      g.addColorStop(0, `rgba(255, 90, 30, ${(glow - 0.3) * 0.8})`);
      g.addColorStop(1, "rgba(255, 90, 30, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  private drawShaft(i: number): void {
    const ctx = this.ctx;
    const s = this.game.state;
    const l = this.layout[i];
    const rps = this.visualRps(i);
    const real = this.game.speeds[i] ?? 0;
    const mat = material(tierOf(s.shafts[i].revs));
    const pop = this.pops[i];
    const angle = this.angles[i];
    this.spinDir = i % 2 === 0 ? 1 : -1;

    ctx.save();
    ctx.translate(l.x, l.y);
    const k = 1 + 0.12 * pop * pop;
    ctx.scale(k, k);

    const mainR = l.wheelTeeth ? pitchRadius(l.wheelTeeth) : FLYWHEEL_RADIUS;
    // Sombra: da profundidad entre capas de engranajes superpuestas.
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(4, 6, mainR + MODULE, 0, TAU);
    ctx.fill();

    if (l.wheelTeeth) this.drawGear(l.wheelTeeth, angle, mat, rps, true);
    if (l.flywheel) this.drawFlywheel(angle, mat, rps);
    if (l.pinion) this.drawGear(pinionTeeth(s), angle, mat, rps, false);

    // Caja de cambios: un aro alrededor del piñón, rojo en marcha larga y azul en corta.
    const gear = s.shafts[i].gear ?? 0;
    if (gear !== 0) {
      ctx.strokeStyle = gear === 2 ? "#ff6a3a" : "#6ab0ff";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, pitchRadius(pinionTeeth(s)) + MODULE * 2.2, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Brillo por velocidad real.
    const heat = heatOf(real);
    if (heat > 0 || mat.glow) {
      ctx.globalCompositeOperation = "lighter";
      const r = mainR + MODULE;
      const g = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.35);
      if (heat > 0) {
        g.addColorStop(0, heatRgb(heat, 0));
        g.addColorStop(0.55, heatRgb(heat, 0.3 * heat));
      } else {
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.6, hexAlpha(mat.glow!, 0.12));
      }
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.35, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }

    // Buje.
    ctx.fillStyle = mat.edge;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#1a1714";
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, TAU);
    ctx.fill();

    if (i === 0) this.drawCrank(angle, rps);
    ctx.restore();
  }

  private gearPath(teeth: number): Path2D {
    let p = this.gearPaths.get(teeth);
    if (p) return p;
    p = new Path2D();
    const r = pitchRadius(teeth);
    const ra = r + MODULE * 0.9;
    const rr = r - MODULE * 1.1;
    const step = TAU / teeth;
    for (let k = 0; k < teeth; k++) {
      const c = k * step;
      const a0 = c - step * 0.5;
      if (k === 0) p.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
      p.arc(0, 0, rr, a0, c - step * 0.28);
      p.lineTo(Math.cos(c - step * 0.16) * ra, Math.sin(c - step * 0.16) * ra);
      p.arc(0, 0, ra, c - step * 0.16, c + step * 0.16);
      p.lineTo(Math.cos(c + step * 0.28) * rr, Math.sin(c + step * 0.28) * rr);
      p.arc(0, 0, rr, c + step * 0.28, c + step * 0.5);
    }
    p.closePath();
    this.gearPaths.set(teeth, p);
    return p;
  }

  private drawGear(
    teeth: number,
    angle: number,
    mat: { color: string; edge: string },
    rps: number,
    holes: boolean,
  ): void {
    const ctx = this.ctx;
    const r = pitchRadius(teeth);
    const teethAlpha = fade(rps * teeth);
    const body = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r + MODULE);
    body.addColorStop(0, mat.color);
    body.addColorStop(1, mat.edge);

    ctx.save();
    ctx.rotate(angle);
    if (teethAlpha > 0) {
      ctx.globalAlpha = teethAlpha;
      ctx.fillStyle = body;
      ctx.fill(this.gearPath(teeth));
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 0.8;
      ctx.stroke(this.gearPath(teeth));
    }
    if (teethAlpha < 1) {
      // Dientes fundidos por la velocidad: un disco y una banda translúcida donde estaban.
      ctx.globalAlpha = 1 - teethAlpha;
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, r - MODULE * 1.1, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = (1 - teethAlpha) * 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, r + MODULE * 0.9, 0, TAU);
      ctx.arc(0, 0, r - MODULE * 1.1, 0, TAU, true);
      ctx.fill();
      // Estela que barre el disco: más larga cuanto más rápido gira.
      this.drawSmear(r * 0.7, MODULE * 0.6, rps, (1 - teethAlpha) * 0.5);
    }
    ctx.globalAlpha = 1;
    if (holes && r > 26) {
      const holeAlpha = fade(rps * HOLES);
      if (holeAlpha > 0) {
        ctx.globalAlpha = holeAlpha;
        ctx.fillStyle = "rgba(15,13,11,0.75)";
        const hr = r * 0.17;
        for (let k = 0; k < HOLES; k++) {
          const a = (k * TAU) / HOLES;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, hr, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  private drawFlywheel(angle: number, mat: { color: string; edge: string }, rps: number): void {
    const ctx = this.ctx;
    const r = FLYWHEEL_RADIUS;
    const spokeAlpha = fade(rps * FLY_SPOKES);
    ctx.save();
    ctx.rotate(angle);
    // Disco translúcido que aparece cuando los radios se funden.
    ctx.globalAlpha = 0.25 + 0.5 * (1 - spokeAlpha);
    ctx.fillStyle = mat.color;
    ctx.beginPath();
    ctx.arc(0, 0, r - 4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = mat.color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, r - 3, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = mat.edge;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    if (spokeAlpha > 0) {
      ctx.globalAlpha = spokeAlpha;
      ctx.strokeStyle = mat.color;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let k = 0; k < FLY_SPOKES; k++) {
        const a = (k * TAU) / FLY_SPOKES;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4));
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (spokeAlpha < 1) this.drawSmear(r * 0.65, 2.5, rps, 1 - spokeAlpha);
    ctx.restore();
  }

  private drawCrank(angle: number, rps: number): void {
    const ctx = this.ctx;
    const len = this.crankLength();
    const alpha = 0.25 + 0.75 * fade(rps * 4);
    ctx.save();
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#5a4630";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.fillStyle = "#c8a46a";
    ctx.beginPath();
    ctx.arc(len, 0, 6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** Arco que se desvanece hacia atrás, como la estela de un objeto que gira muy rápido. */
  private drawSmear(radius: number, width: number, rps: number, alpha: number): void {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    const len = smearAngle(rps);
    const segments = 6;
    ctx.save();
    // Reflejar en Y invierte el sentido de los ángulos: la estela queda detrás en ambos sentidos.
    ctx.scale(1, this.spinDir);
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    for (let k = 0; k < segments; k++) {
      // El extremo delantero (ángulo 0) es el más brillante; el giro va en sentido positivo.
      ctx.globalAlpha = alpha * (1 - k / segments);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.arc(0, 0, radius, -((k + 1) * len) / segments, -(k * len) / segments);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawParticles(scale: number): void {
    const ctx = this.ctx;
    for (const p of this.fx.particles) {
      const t = 1 - p.age / p.life;
      if (p.kind === "smoke") {
        ctx.globalAlpha = 0.35 * t;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const p of this.fx.particles) {
      if (p.kind !== "spark") continue;
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
    }
    for (const r of this.fx.rings) {
      const t = r.age / r.life;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 4 / scale + 3 * (1 - t);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (1 + t * 0.8), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  private drawFloaters(sx: number, sy: number): void {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const f of this.fx.floaters) {
      const t = f.age / f.life;
      const [x, y] = this.worldToScreen(f.x, f.y);
      // Entra con un pequeño rebote y se desvanece en el último 40% de su vida.
      const grow = Math.min(1, f.age / 0.12);
      const size = f.size * (0.6 + 0.4 * grow + 0.15 * Math.max(0, 1 - f.age / 0.25));
      ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      ctx.font = `800 ${size.toFixed(1)}px "Segoe UI", system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(10,8,6,0.85)";
      const yy = y - f.age * 42 + sy;
      ctx.strokeText(f.text, x + sx, yy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x + sx, yy);
    }
    ctx.globalAlpha = 1;
  }
}

function hexAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
