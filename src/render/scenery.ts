/**
 * Fondo del juego: la torre del Gran Reloj por dentro y lo que se ve por sus arcos. El tren sube por
 * la torre; el cielo cambia con la altura (plaza al atardecer, nubes, noche, estrellas y un cosmos de
 * engranajes que se repite sin fin) y la esfera del reloj espera en lo alto, con las agujas marcando
 * el avance hacia el final.
 *
 * Todo es procedural: las capas se dibujan por baldosas con posiciones pseudoaleatorias deterministas,
 * así que la torre puede crecer sin límite sin guardar nada.
 */

const TAU = Math.PI * 2;

/** Lo que el renderer le pasa a la escena cada frame. */
export interface View {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  w: number;
  h: number;
  scale: number;
  /** Centro de la cámara en coordenadas de mundo. */
  camX: number;
  camY: number;
  /** Punto de pantalla al que va el centro de la cámara. */
  cx: number;
  cy: number;
  time: number;
  /** Avance hacia el final, 0–1. */
  progress: number;
  ended: boolean;
  tower: { cx: number; half: number };
  /** Altura del suelo (y de mundo), justo por debajo del motor. */
  ground: number;
  /** Celebración del final, de 1 a 0. */
  celebrate: number;
}

// --- Cielo por alturas (altura = −y en el mundo) ---

const SKY: [number, string][] = [
  [0, "#2b1d16"],
  [250, "#8a4a32"],
  [900, "#c9845a"],
  [1800, "#56689a"],
  [3200, "#25305a"],
  [5000, "#0f1432"],
  [8000, "#07081c"],
  [12000, "#0c0620"],
];
const SKY_TOP = 12000;

const FLOOR_H = 420;
const PILLAR_W = 46;

/** Número pseudoaleatorio estable en [0, 1) para una baldosa y un índice. */
function hash(a: number, b: number, c = 0): number {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function smooth(x: number, lo: number, hi: number): number {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

export class Scenery {
  draw(v: View): void {
    this.sky(v);
    this.stars(v);
    this.cosmos(v);
    this.clouds(v);
    this.town(v);
    this.clockFace(v);
    this.tower(v);
  }

  /** Transforma para una capa con paralaje `p` (1 = se mueve con el mundo, 0 = fija en pantalla). */
  private layer(v: View, p: number): { left: number; right: number; top: number; bottom: number } {
    const ox = v.cx - v.camX * v.scale * p;
    const oy = v.cy - v.camY * v.scale * p;
    v.ctx.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, v.dpr * ox, v.dpr * oy);
    return { left: -ox / v.scale, right: (v.w - ox) / v.scale, top: -oy / v.scale, bottom: (v.h - oy) / v.scale };
  }

  private sky(v: View): void {
    const { ctx } = v;
    const b = this.layer(v, 1);
    const g = ctx.createLinearGradient(0, -SKY_TOP, 0, 0);
    for (const [alt, color] of SKY) g.addColorStop(1 - alt / SKY_TOP, color);
    ctx.fillStyle = g;
    ctx.fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
  }

  private stars(v: View): void {
    const { ctx } = v;
    const p = 0.5;
    const b = this.layer(v, p);
    const tile = 300;
    // Las estrellas aparecen a partir de cierta altura (en coordenadas de esta capa).
    const fadeIn = (y: number) => smooth(-y, 2600 * p, 4200 * p);
    ctx.fillStyle = "#ffffff";
    for (let ty = Math.floor(b.top / tile); ty <= Math.floor(b.bottom / tile); ty++) {
      const vis = fadeIn(ty * tile);
      if (vis <= 0) continue;
      for (let tx = Math.floor(b.left / tile); tx <= Math.floor(b.right / tile); tx++) {
        for (let k = 0; k < 10; k++) {
          const x = (tx + hash(tx, ty, k)) * tile;
          const y = (ty + hash(ty, tx, k + 50)) * tile;
          const tw = 0.6 + 0.4 * Math.sin(v.time * (1 + hash(tx, k, 7) * 2) + k);
          ctx.globalAlpha = vis * tw * (0.4 + 0.6 * hash(k, tx, ty));
          const r = 1 + hash(tx, ty, k + 99) * 1.6;
          ctx.fillRect(x, y, r, r);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Muy arriba, constelaciones de engranajes: el "infinito" del modo libre. */
  private cosmos(v: View): void {
    const { ctx } = v;
    const p = 0.4;
    const b = this.layer(v, p);
    const tile = 900;
    ctx.lineWidth = 6;
    for (let ty = Math.floor(b.top / tile); ty <= Math.floor(b.bottom / tile); ty++) {
      const vis = smooth(-ty * tile, 6500 * p, 9500 * p);
      if (vis <= 0) continue;
      for (let tx = Math.floor(b.left / tile); tx <= Math.floor(b.right / tile); tx++) {
        const x = (tx + 0.2 + hash(tx, ty, 3) * 0.6) * tile;
        const y = (ty + 0.2 + hash(ty, tx, 4) * 0.6) * tile;
        const r = 60 + hash(tx, ty, 5) * 120;
        const teeth = 10 + Math.floor(hash(tx, ty, 6) * 14);
        const hue = hash(tx, ty, 8) < 0.5 ? "156, 192, 255" : "255, 211, 107";
        ctx.strokeStyle = `rgba(${hue}, ${0.18 * vis})`;
        ctx.setLineDash([(TAU * r) / teeth / 2, (TAU * r) / teeth / 2]);
        ctx.lineDashOffset = v.time * 12 * (hash(tx, ty, 9) < 0.5 ? 1 : -1);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  private clouds(v: View): void {
    const { ctx } = v;
    const p = 0.7;
    const b = this.layer(v, p);
    const tw = 700;
    const th = 380;
    for (let ty = Math.floor(b.top / th); ty <= Math.floor(b.bottom / th); ty++) {
      const alt = -ty * th / p;
      const vis = smooth(alt, 900, 1600) * (1 - smooth(alt, 3600, 5200));
      if (vis <= 0) continue;
      for (let tx = Math.floor(b.left / tw) - 1; tx <= Math.floor(b.right / tw) + 1; tx++) {
        if (hash(tx, ty, 1) < 0.35) continue;
        const drift = (v.time * (6 + hash(tx, ty, 2) * 6)) % tw;
        const x = (tx + hash(tx, ty, 3)) * tw + drift;
        const y = (ty + hash(ty, tx, 4)) * th;
        const s = 0.6 + hash(tx, ty, 5) * 0.8;
        ctx.globalAlpha = 0.35 * vis;
        ctx.fillStyle = alt > 2600 ? "#8c9cc8" : "#f3dcc8";
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.ellipse(x + (k - 1.5) * 50 * s, y + Math.sin(k * 2) * 10 * s, 70 * s, 26 * s, 0, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** El pueblo de Valdehierro al pie de la torre. Se encienden más ventanas cuanto más cerca está el final. */
  private town(v: View): void {
    const { ctx } = v;
    const p = 0.6;
    const b = this.layer(v, p);
    const base = v.ground * p + 40;
    if (b.top > base + 40 || b.bottom < base - 400) return;
    const tile = 120;
    for (let t = Math.floor(b.left / tile) - 1; t <= Math.floor(b.right / tile) + 1; t++) {
      const hgt = 70 + hash(t, 1) * 110;
      const wdt = tile * (0.7 + hash(t, 2) * 0.28);
      const x = t * tile;
      ctx.fillStyle = "#1c130e";
      ctx.fillRect(x, base - hgt, wdt, hgt + 400);
      // Tejado a dos aguas.
      ctx.beginPath();
      ctx.moveTo(x - 6, base - hgt);
      ctx.lineTo(x + wdt / 2, base - hgt - 30 - hash(t, 3) * 20);
      ctx.lineTo(x + wdt + 6, base - hgt);
      ctx.closePath();
      ctx.fillStyle = "#2a1912";
      ctx.fill();
      for (let k = 0; k < 6; k++) {
        const lit = hash(t, k, 11) < 0.15 + 0.75 * v.progress;
        if (!lit) continue;
        const wx = x + 10 + (k % 3) * (wdt - 26) / 2.2;
        const wy = base - hgt + 18 + Math.floor(k / 3) * 34;
        if (wy > base - 12) continue;
        ctx.fillStyle = `rgba(255, 196, 110, ${0.55 + 0.35 * Math.sin(v.time * 0.7 + k + t)})`;
        ctx.fillRect(wx, wy, 10, 14);
      }
    }
    ctx.fillStyle = "#140d09";
    ctx.fillRect(b.left, base, b.right - b.left, b.bottom - base + 10);
  }

  /** La esfera del Gran Reloj, en lo alto y a lo lejos. Crece al acercarse el final. */
  private clockFace(v: View): void {
    const { ctx } = v;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const p = v.ended ? 1 : v.progress;
    const r = Math.min(v.w, v.h) * (0.08 + 0.11 * p) * (1 + 0.08 * v.celebrate);
    // A la derecha de la torre si cabe, con un leve paralaje para que parezca lejana.
    const towerRight = v.cx + (v.tower.cx + v.tower.half + PILLAR_W - v.camX) * v.scale;
    const x = Math.min(v.w - r - 24, Math.max(v.w * 0.78, towerRight + r + 24)) + Math.sin(v.camX * 0.0004) * 12;
    const y = Math.max(v.h * 0.36, 150 + r) + Math.cos(v.camY * 0.0003) * 10;

    if (p > 0.6 || v.celebrate > 0) {
      const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 1.8);
      const a = Math.max(0.25 * smooth(p, 0.6, 1), 0.6 * v.celebrate);
      glow.addColorStop(0, `rgba(255, 220, 140, ${a})`);
      glow.addColorStop(1, "rgba(255, 220, 140, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.8, 0, TAU);
      ctx.fill();
    }

    ctx.globalAlpha = 0.55 + 0.45 * p;
    ctx.fillStyle = "#efe3c4";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#a8782e";
    ctx.lineWidth = Math.max(3, r * 0.09);
    ctx.stroke();
    ctx.strokeStyle = "#5a4630";
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      const big = k % 3 === 0;
      ctx.lineWidth = Math.max(1, r * (big ? 0.045 : 0.022));
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * (big ? 0.72 : 0.8), y + Math.sin(a) * r * (big ? 0.72 : 0.8));
      ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
      ctx.stroke();
    }

    // Parado, el reloj marca las once; al avanzar, el minutero da una vuelta hasta las doce. Al
    // final vuelve a dar la hora de verdad.
    let hour: number;
    let minute: number;
    if (v.ended) {
      const now = new Date();
      minute = (now.getMinutes() + now.getSeconds() / 60) / 60;
      hour = ((now.getHours() % 12) + minute) / 12;
    } else {
      minute = p;
      hour = (11 + p) / 12;
    }
    ctx.lineCap = "round";
    ctx.strokeStyle = "#2a2016";
    ctx.lineWidth = Math.max(2, r * 0.07);
    this.hand(ctx, x, y, hour, r * 0.5);
    ctx.lineWidth = Math.max(1.5, r * 0.045);
    this.hand(ctx, x, y, minute, r * 0.78);
    ctx.fillStyle = "#a8782e";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, r * 0.07), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private hand(ctx: CanvasRenderingContext2D, x: number, y: number, turn: number, len: number): void {
    const a = turn * TAU - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }

  /**
   * La torre: dos pilares de ladrillo, un arco por planta que deja ver el cielo y una viga de madera
   * en cada suelo. El interior se oscurece un poco para que los engranajes se lean bien.
   */
  private tower(v: View): void {
    const { ctx } = v;
    const b = this.layer(v, 1);
    const { cx, half } = v.tower;
    const left = cx - half;
    const right = cx + half;
    const top = Math.max(b.top, -1e7);
    const bottom = Math.min(b.bottom, v.ground);
    if (bottom <= top) return;

    const first = Math.floor((v.ground - bottom) / FLOOR_H);
    const last = Math.ceil((v.ground - top) / FLOOR_H);

    // Muro interior con un arco por planta (evenodd: el arco queda hueco y deja ver el cielo).
    const wall = new Path2D();
    wall.rect(left, top, right - left, bottom - top);
    for (let k = Math.max(0, first); k <= last; k++) {
      const yb = v.ground - k * FLOOR_H;
      const yt = yb - FLOOR_H;
      const wx0 = left + 26;
      const wx1 = right - 26;
      const rx = (wx1 - wx0) / 2;
      const ry = Math.min(rx, FLOOR_H * 0.32);
      const winTop = yt + 34 + ry;
      const winBottom = yb - 26;
      wall.moveTo(wx0, winBottom);
      wall.lineTo(wx0, winTop);
      wall.ellipse(wx0 + rx, winTop, rx, ry, 0, Math.PI, 0);
      wall.lineTo(wx1, winBottom);
      wall.closePath();
    }
    ctx.fillStyle = "rgba(34, 26, 19, 0.92)";
    ctx.fill(wall, "evenodd");
    // A través del arco, el cielo se ve atenuado: es el interior de la torre.
    ctx.fillStyle = "rgba(12, 9, 7, 0.38)";
    ctx.fillRect(left, top, right - left, bottom - top);

    for (let k = Math.max(0, first); k <= last; k++) {
      const yb = v.ground - k * FLOOR_H;
      if (yb < top - 20 || yb > bottom + 20) continue;
      ctx.fillStyle = "#3d2a1c";
      ctx.fillRect(left, yb - 16, right - left, 16);
      ctx.fillStyle = "#4e3624";
      ctx.fillRect(left, yb - 16, right - left, 4);
    }

    // Pilares de ladrillo.
    for (const px of [left - PILLAR_W, right]) {
      ctx.fillStyle = "#3a2a1e";
      ctx.fillRect(px, top, PILLAR_W, bottom - top);
      ctx.strokeStyle = "rgba(15, 10, 7, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const row = 22;
      for (let y = Math.floor(top / row) * row; y < bottom; y += row) {
        ctx.moveTo(px, y);
        ctx.lineTo(px + PILLAR_W, y);
        // Hiladas alternas; ojo con el resto negativo por encima del suelo (y < 0).
        const off = (((Math.round(y / row) % 2) + 2) % 2) * (PILLAR_W / 2);
        ctx.moveTo(px + off + PILLAR_W / 4, y);
        ctx.lineTo(px + off + PILLAR_W / 4, y + row);
      }
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 220, 160, 0.05)";
      ctx.fillRect(px, top, 6, bottom - top);
    }
  }
}
