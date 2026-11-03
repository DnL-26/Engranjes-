/** Efectos visuales efímeros, en coordenadas de mundo. No afectan a la simulación ni se guardan. */

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  /** Tamaño de letra en píxeles de pantalla. */
  size: number;
  age: number;
  life: number;
  /** Un floater nuevo con la misma clave sustituye al anterior (cascadas de materiales). */
  key?: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  age: number;
  life: number;
  kind: "spark" | "smoke";
}

export interface Ring {
  x: number;
  y: number;
  r: number;
  color: string;
  age: number;
  life: number;
}

const MAX_PARTICLES = 500;
const MAX_FLOATERS = 60;
const GRAVITY = 260;

export class Fx {
  floaters: Floater[] = [];
  particles: Particle[] = [];
  rings: Ring[] = [];

  floater(x: number, y: number, text: string, color: string, size = 16, life = 1.2, key?: string): void {
    if (key) this.floaters = this.floaters.filter((f) => f.key !== key);
    if (this.floaters.length >= MAX_FLOATERS) this.floaters.shift();
    this.floaters.push({ x, y, text, color, size, age: 0, life, key });
  }

  ring(x: number, y: number, r: number, color: string, life = 0.7): void {
    this.rings.push({ x, y, r, color, age: 0, life });
  }

  spark(x: number, y: number, vx: number, vy: number, color: string, size = 1.6, life = 0.5): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({ x, y, vx, vy, color, size, age: 0, life, kind: "spark" });
  }

  burst(x: number, y: number, color: string, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.spark(x, y, Math.cos(a) * v, Math.sin(a) * v, color, 2.2, 0.6 + Math.random() * 0.5);
    }
  }

  smoke(x: number, y: number): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({
      x: x + (Math.random() - 0.5) * 12,
      y,
      vx: (Math.random() - 0.5) * 20,
      vy: -30 - Math.random() * 30,
      color: "#6b645c",
      size: 6 + Math.random() * 6,
      age: 0,
      life: 1.4 + Math.random() * 0.8,
      kind: "smoke",
    });
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "spark") p.vy += GRAVITY * dt;
      else p.size += 10 * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < f.life);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < r.life);
  }

  clear(): void {
    this.floaters = [];
    this.particles = [];
    this.rings = [];
  }
}
