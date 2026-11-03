import { mtof, type Synth } from "./synth";

/**
 * Música adaptativa: un vals de relojería (3/4, re mayor) generado nota a nota. Sube por capas
 * según la altura del tren en la torre, se acelera con la sobremarcha y se frena como un tocadiscos
 * al gripar el motor.
 */

/** 0 taller, 1 nubes, 2 noche, 3 cosmos, 4 final (el Gran Reloj da la hora). */
export type Zone = 0 | 1 | 2 | 3 | 4;

export interface MusicTargets {
  zone: Zone;
  /** Cuánto está metida la sobremarcha, 0–1. */
  overdrive: number;
  stalled: boolean;
}

const BPM = 132;
/** Planificación por adelantado (s) y cada cuánto se revisa (ms): evita cortes aunque haya tirones. */
const LOOKAHEAD = 0.2;
const INTERVAL_MS = 25;

/** Acordes del vals (bajo + tres notas): Re, Sim, Sol, La, Re, Sol, Mim, La. */
const CHORDS = [
  [50, 62, 66, 69], [47, 59, 62, 66], [43, 55, 59, 62], [45, 57, 61, 64],
  [50, 62, 66, 69], [43, 55, 59, 62], [40, 55, 59, 64], [45, 57, 61, 64],
];

type Bar = [beat: number, note: number][];

/** Dos frases que se alternan para que el bucle no canse. */
const MELODY_A: Bar[] = [
  [[0, 78], [1, 81], [2, 86]], [[0, 85], [2, 83]], [[0, 83], [1, 79], [2, 74]], [[0, 76]],
  [[0, 78], [1, 81], [2, 86]], [[0, 88], [2, 86]], [[0, 76], [1, 79], [2, 83]], [[0, 81]],
];
const MELODY_B: Bar[] = [
  [[0, 81], [2, 78]], [[0, 86], [1, 85], [2, 83]], [[0, 79], [2, 83]], [[0, 81], [1, 79], [2, 76]],
  [[0, 78], [1, 81], [2, 78]], [[0, 83], [2, 86]], [[0, 88], [1, 86], [2, 83]], [[0, 85], [2, 81]],
];

export class Music {
  private bus: GainNode;
  private filter: BiquadFilterNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private wet: GainNode;
  private send: GainNode;
  private timer = 0;
  private running = false;
  private beat = 0;
  private nextT = 0;
  private zone: Zone = 0;
  private pendingZone: Zone = 0;
  // Tempo, transposición y "velocidad de cinta" actuales y objetivo (se suavizan).
  private rate = 1;
  private targetRate = 1;
  private semis = 0;
  private targetSemis = 0;
  private tape = 1;
  private targetTape = 1;

  constructor(
    private syn: Synth,
    destination: AudioNode,
  ) {
    const ctx = syn.ctx;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 18000;
    this.filter.connect(destination);
    this.bus = syn.gain(1);
    this.bus.connect(this.filter);
    // Eco: da espacio a la caja de música y se alarga en el cosmos.
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.34;
    this.feedback = syn.gain(0.32);
    this.wet = syn.gain(0.22);
    this.send = syn.gain(1);
    this.send.connect(this.delay);
    this.delay.connect(this.feedback).connect(this.delay);
    this.delay.connect(this.wet).connect(this.filter);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.nextT = this.syn.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), INTERVAL_MS);
  }

  stop(): void {
    this.running = false;
    clearInterval(this.timer);
  }

  setTargets(t: MusicTargets): void {
    this.pendingZone = t.zone;
    const now = this.syn.ctx.currentTime;
    if (t.stalled) {
      // Tocadiscos que se apaga: tempo y tono caen y el sonido se apaga tras un filtro.
      this.targetRate = 0.06;
      this.targetTape = 0.35;
      this.targetSemis = 0;
      this.filter.frequency.setTargetAtTime(350, now, 0.35);
    } else {
      this.targetRate = 1 + 0.3 * t.overdrive;
      this.targetSemis = 3 * t.overdrive;
      this.targetTape = 1;
      this.filter.frequency.setTargetAtTime(18000, now, 0.5);
    }
  }

  private freq(m: number): number {
    return mtof(m + this.semis) * this.tape;
  }

  private schedule(): void {
    this.rate += (this.targetRate - this.rate) * 0.08;
    this.semis += (this.targetSemis - this.semis) * 0.08;
    this.tape += (this.targetTape - this.tape) * 0.08;
    const beatDur = 60 / BPM / Math.max(0.05, this.rate);
    const ctx = this.syn.ctx;
    // Tras una pausa larga (pestaña oculta) no se intenta recuperar el tiempo perdido.
    if (this.nextT < ctx.currentTime - 0.5) this.nextT = ctx.currentTime + 0.05;
    while (this.nextT < ctx.currentTime + LOOKAHEAD) {
      if (this.rate > 0.12) this.playBeat(this.nextT, beatDur);
      this.nextT += beatDur;
      this.beat++;
    }
  }

  private applyZone(z: Zone): void {
    this.zone = z;
    const now = this.syn.ctx.currentTime;
    this.delay.delayTime.setTargetAtTime(z === 3 ? 0.46 : 0.34, now, 0.3);
    this.feedback.gain.setTargetAtTime(z === 3 ? 0.55 : 0.32, now, 0.3);
    this.wet.gain.setTargetAtTime(z === 3 ? 0.5 : z >= 2 ? 0.3 : 0.22, now, 0.3);
  }

  private playBeat(t: number, bd: number): void {
    const bar = Math.floor(this.beat / 3) % 8;
    const b = this.beat % 3;
    // Los cambios de capa entran a principio de compás para que suenen musicales.
    if (b === 0 && this.pendingZone !== this.zone) this.applyZone(this.pendingZone);
    const z = this.zone;
    const phrase = Math.floor(this.beat / 24);
    const chord = CHORDS[bar];
    const melody = (phrase % 2 === 0 ? MELODY_A : MELODY_B)[bar];

    this.tick(t, b !== 0);

    // Melodía: caja de música; en la noche, cada cuarta frase la canta la celesta.
    const up = z === 3 ? 12 : 0;
    const celestaPhrase = z >= 2 && phrase % 4 === 3;
    for (const [beat, note] of melody) {
      if (beat !== b) continue;
      if (celestaPhrase) this.celesta(t, note + 12, 1);
      else this.musicBox(t, note + up, z === 4 ? 1.2 : 1, z >= 3 ? 0.7 : 0.35);
    }

    // Nubes: bajo de vals ("um-pa-pa") y adornos.
    if (z >= 1) {
      if (b === 0) this.pluck(t, chord[0]);
      else for (const m of chord.slice(1)) this.pizz(t, m);
      if (z !== 3 && b === 2 && bar % 2 === 1) this.musicBox(t + bd / 2, melody[0][1] + (z >= 2 ? 7 : 4), 0.5, 0.35);
    }

    // Noche: colchón de acordes y arpegios de celesta.
    if (z >= 2 && b === 0) this.pad(t, chord.slice(1).map((m) => m + 12), bd * 3, z === 4 ? 1.3 : 1);
    if (z >= 2 && (z >= 3 || bar % 2 === 0)) {
      const arp = [chord[1], chord[2], chord[3], chord[1] + 12, chord[2] + 12, chord[3] + 12].map((m) => m + 12 + (z === 3 ? 12 : 0));
      this.celesta(t, arp[b * 2], 0.9);
      this.celesta(t + bd / 2, arp[b * 2 + 1], 0.7);
    }

    // Final: las campanas del Gran Reloj.
    if (z === 4 && b === 0 && bar % 4 === 0) this.syn.bell(t, this.freq(chord[0] + 24), 1.2, this.bus);
  }

  // --- Instrumentos ---

  private tick(t: number, high: boolean): void {
    this.syn.burst(t, 0.035, (high ? 3200 : 1700) * this.tape, this.zone === 3 ? 0.04 : 0.13, this.bus);
  }

  private musicBox(t: number, m: number, level: number, echo: number): void {
    const f = this.freq(m);
    for (const [ratio, amp] of [[1, 1], [2, 0.32], [3, 0.1], [4.07, 0.05]] as const) {
      const e = this.syn.tone("sine", f * ratio, t, 1.5 / ratio + 0.3, 0.16 * amp * level, this.bus, 0.003);
      if (ratio === 1) e.connect(this.syn.gain(echo)).connect(this.send);
    }
  }

  private celesta(t: number, m: number, level: number): void {
    const f = this.freq(m);
    const e = this.syn.tone("sine", f, t, 0.7, 0.07 * level, this.bus, 0.002);
    this.syn.tone("sine", f * 4, t, 0.15, 0.02 * level, this.bus, 0.002);
    e.connect(this.syn.gain(0.8)).connect(this.send);
  }

  private pluck(t: number, m: number): void {
    this.syn.tone("triangle", this.freq(m), t, 0.55, 0.18, this.bus, 0.004);
  }

  private pizz(t: number, m: number): void {
    this.syn.tone("triangle", this.freq(m), t, 0.22, 0.05, this.bus, 0.003);
  }

  private pad(t: number, notes: number[], dur: number, level: number): void {
    const ctx = this.syn.ctx;
    for (const m of notes) {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = this.freq(m);
        o.detune.value = detune;
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = this.zone >= 3 ? 1800 : 900;
        const e = ctx.createGain();
        e.gain.setValueAtTime(0.0001, t);
        e.gain.linearRampToValueAtTime(0.012 * level, t + 0.5);
        e.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
        o.connect(f).connect(e).connect(this.bus);
        if (this.zone >= 3) e.connect(this.syn.gain(0.5)).connect(this.send);
        o.start(t);
        o.stop(t + dur + 0.9);
      }
    }
  }
}
