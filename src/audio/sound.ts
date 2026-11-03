import { Ambience } from "./ambience";
import { Music, type Zone } from "./music";
import { KEY_ROOT, mtof, Synth } from "./synth";

/**
 * Todo el audio del juego, sintetizado con WebAudio (no hay archivos). Tres buses con su volumen
 * (música, efectos y ambiente) que se mezclan en el maestro. El contexto se crea en el primer gesto
 * del jugador, porque los navegadores no dejan sonar nada antes.
 */

export interface Volumes {
  music: number;
  sfx: number;
  ambient: number;
}

/** Lo que el juego le cuenta al audio cada frame. */
export interface AudioState {
  /** Velocidad de la salida, en vueltas/s (zumbido de la maquinaria). */
  rps: number;
  overdrive: number;
  stalled: boolean;
  zone: Zone;
}

const MASTER_LEVEL = 0.7;
/** Pentatónica de re: las monedas suben por ella al encadenarse. */
const PENTA = [74, 76, 78, 81, 83, 86, 88, 90, 93, 95, 98];
const COMBO_WINDOW = 1.2;

export class Sound {
  private ctx: AudioContext | null = null;
  private syn!: Synth;
  private master!: GainNode;
  private buses!: { music: GainNode; sfx: GainNode; ambient: GainNode };
  private music!: Music;
  private ambience!: Ambience;
  private humOsc: OscillatorNode[] = [];
  private humGain!: GainNode;
  private humFilter!: BiquadFilterNode;
  private volumes: Volumes = { music: 0.7, sfx: 0.8, ambient: 0.6 };
  private muted = false;
  private hidden = false;
  private lastTick = 0;
  private lastCoin = 0;
  private lastGear = 0;
  private combo = 0;

  /** Llamar desde un gesto del jugador (clic, tecla). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended" && !this.hidden) void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.syn = new Synth(ctx, noise);

    this.master = this.syn.gain(this.muted ? 0 : MASTER_LEVEL);
    this.master.connect(ctx.destination);
    this.buses = {
      music: this.syn.gain(this.volumes.music),
      sfx: this.syn.gain(this.volumes.sfx),
      ambient: this.syn.gain(this.volumes.ambient),
    };
    for (const b of Object.values(this.buses)) b.connect(this.master);

    this.music = new Music(this.syn, this.buses.music);
    this.ambience = new Ambience(this.syn, this.buses.ambient);
    this.music.start();

    // Zumbido de la maquinaria: dos sierras desafinadas por un paso bajo (va al ambiente).
    this.humFilter = ctx.createBiquadFilter();
    this.humFilter.type = "lowpass";
    this.humFilter.frequency.value = 600;
    this.humGain = this.syn.gain(0);
    this.humFilter.connect(this.humGain).connect(this.buses.ambient);
    for (const detune of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 55;
      o.detune.value = detune;
      o.connect(this.humFilter);
      o.start();
      this.humOsc.push(o);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, this.ctx.currentTime, 0.05);
  }

  setVolumes(v: Volumes): void {
    this.volumes = { ...v };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.buses.music.gain.setTargetAtTime(v.music, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.buses.ambient.gain.setTargetAtTime(v.ambient, t, 0.05);
  }

  /** Con la pestaña oculta se suspende todo: ni música ni ambiente sonando a escondidas. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  update(a: AudioState, dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.music.setTargets({ zone: a.zone, overdrive: a.overdrive, stalled: a.stalled });
    this.ambience.update(a.zone, dt);
    const octaves = Math.min(4.5, Math.max(0, Math.log10(Math.max(a.rps, 1e-3) + 1) * 0.55));
    const freq = 45 * 2 ** octaves * 2 ** ((a.overdrive * 5) / 12);
    for (const o of this.humOsc) o.frequency.setTargetAtTime(freq, t, 0.15);
    this.humFilter.frequency.setTargetAtTime(300 + freq * 4, t, 0.15);
    const level = a.rps > 0.3 && !a.stalled ? 0.03 + 0.02 * a.overdrive : 0;
    this.humGain.gain.setTargetAtTime(level, t, 0.2);
  }

  // --- Efectos (todos en re mayor) ---

  private get out(): GainNode {
    return this.buses.sfx;
  }

  /** Tic mecánico (manivela). Limitado para no saturar. */
  tick(pitch = 1): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastTick < 0.04) return;
    this.lastTick = t;
    this.syn.burst(t, 0.025, 2500 * pitch, 0.25, this.out);
  }

  /** Moneda: una nota de marimba que sube por la pentatónica si se encadenan. */
  coin(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastCoin < 0.06) return;
    if (t - this.lastCoin > COMBO_WINDOW) this.combo = 0;
    this.lastCoin = t;
    const f = mtof(PENTA[Math.min(this.combo++, PENTA.length - 1)]);
    this.syn.tone("sine", f, t, 0.25, 0.12, this.out, 0.002);
    this.syn.tone("sine", f * 4, t, 0.05, 0.03, this.out, 0.001);
  }

  /** Compra de dientes o motor: un trinquete. */
  ratchet(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let k = 0; k < 4; k++) this.syn.burst(t + k * 0.045, 0.02, 2400 - k * 200, 0.22, this.out);
    this.syn.tone("triangle", mtof(KEY_ROOT - 24), t + 0.2, 0.12, 0.22, this.out);
  }

  /** Engranaje nuevo: dos golpes de engrane y una subida de quinta. */
  stagePlaced(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.syn.burst(t, 0.05, 900, 0.32, this.out);
    this.syn.burst(t + 0.12, 0.05, 1100, 0.32, this.out);
    this.syn.tone("sine", mtof(81), t + 0.22, 0.5, 0.1, this.out);
    this.syn.tone("sine", mtof(86), t + 0.32, 0.7, 0.1, this.out);
  }

  /** Un eje sube de material: suena a ese material (madera, bronce, acero, cristal, plasma, cuántico). */
  gear(tier: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Las cascadas de materiales lanzan muchos a la vez: como mucho unos ocho por segundo.
    if (t - this.lastGear < 0.12) return;
    this.lastGear = t;
    const out = this.out;
    const syn = this.syn;
    if (tier <= 0) {
      syn.burst(t, 0.06, 380, 0.45, out, "lowpass", 0.7);
      syn.tone("sine", 150, t, 0.12, 0.22, out);
    } else if (tier <= 2) {
      for (const [r, a] of [[1, 1], [2.76, 0.4], [5.4, 0.15]] as const) syn.tone("sine", mtof(74) * r, t, 0.6 / r, 0.11 * a, out);
    } else if (tier <= 6) {
      for (const [r, a] of [[1, 1], [2.76, 0.5], [5.4, 0.25]] as const) syn.tone("sine", mtof(tier <= 4 ? 81 : 78) * r, t, 0.9 / r, 0.09 * a, out);
      syn.burst(t, 0.02, 6000, 0.07, out);
    } else if (tier === 7) {
      syn.tone("sine", mtof(98), t, 1.4, 0.09, out);
      syn.tone("sine", mtof(110), t, 0.8, 0.035, out);
      syn.tone("sine", mtof(105), t + 0.06, 1, 0.045, out);
    } else if (tier === 8) {
      this.plasma(t);
    } else {
      [74, 78, 81, 86, 90, 93].forEach((m, k) => syn.bell(t + k * 0.045, mtof(m), 0.6, out));
    }
  }

  private plasma(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = mtof(62);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 14;
    const depth = this.syn.gain(18);
    lfo.connect(depth).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 4;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.35);
    const e = ctx.createGain();
    this.syn.envelope(e, t, 0.01, 0.1, 0.45);
    o.connect(f).connect(e).connect(this.out);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.5);
    lfo.stop(t + 0.5);
  }

  /** Engranaje dorado: un arpegio brillante de re mayor. */
  golden(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [74, 78, 81, 86, 90, 93, 98].forEach((m, k) => {
      this.syn.tone("sine", mtof(m), t + k * 0.06, 0.5, 0.07, this.out, 0.002);
      this.syn.tone("sine", mtof(m) * 4, t + k * 0.06, 0.1, 0.018, this.out, 0.001);
    });
  }

  /** "Voz" de Anselmo: una sílaba de vapor (soplido con formante y un tono suave por debajo). */
  voice(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.syn.burst(t, 0.06, 900 + Math.random() * 500, 0.1, this.out, "bandpass", 5);
    this.syn.tone("sine", 260 + Math.random() * 60, t, 0.05, 0.02, this.out, 0.01);
  }

  /** Campanada de la torre. */
  bell(): void {
    if (!this.ctx) return;
    this.syn.bell(this.ctx.currentTime, mtof(KEY_ROOT - 12), 1.4, this.out);
  }

  /** Trueno: ruido grave que retumba. */
  thunder(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.syn.burst(t, 1.6, 120, 0.6, this.out);
    this.syn.burst(t + 0.15, 1.2, 260, 0.3, this.out);
  }

  /** Clac genérico (cajas de cambios). */
  clunk(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(mtof(57), t);
    o.frequency.exponentialRampToValueAtTime(mtof(33), t + 0.09);
    this.syn.envelope(g, t, 0.003, 0.3, 0.12);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.15);
    this.syn.burst(t, 0.03, 1200, 0.18, this.out);
  }

  /** Campanilla en la pentatónica de re: más aguda cuanto mayor es `k`. */
  chime(k: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [k, k + 2].forEach((n, j) => {
      const note = PENTA[Math.min(PENTA.length - 1, Math.max(0, n))];
      this.syn.tone("sine", mtof(note), t + j * 0.07, 0.5, 0.15, this.out, 0.01);
    });
  }

  /** Fundición: un rugido grave de horno que crece y una cascada de campanillas. */
  foundry(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.syn.burst(t, 1.4, 300, 0.45, this.out);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(mtof(26), t);
    o.frequency.exponentialRampToValueAtTime(mtof(38), t + 1.2);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 1.5);
    for (let k = 0; k < 5; k++) setTimeout(() => this.chime(k * 2), 900 + k * 110);
  }

  /** El motor se gripa: un chirrido que cae (la música hace el resto, como un tocadiscos). */
  stall(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(380, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.9);
    this.syn.envelope(g, t, 0.01, 0.2, 1);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 1.1);
    this.syn.burst(t, 0.6, 800, 0.35, this.out);
  }
}
