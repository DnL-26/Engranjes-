/** Piezas básicas de síntesis compartidas por la música, el ambiente y los efectos. */

/** Toda la música y los efectos van en re mayor: así nunca desafinan entre sí. */
export const KEY_ROOT = 62;

/** Nota MIDI → frecuencia (la4 = 69 = 440 Hz). */
export function mtof(m: number): number {
  return 440 * 2 ** ((m - 69) / 12);
}

export class Synth {
  constructor(
    readonly ctx: AudioContext,
    readonly noise: AudioBuffer,
  ) {}

  gain(value: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    return g;
  }

  /** Envolvente de ataque rápido y caída exponencial. */
  envelope(node: GainNode, t: number, attack: number, peak: number, decay: number): void {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /** Un oscilador con envolvente percusiva. Devuelve su ganancia, por si hay que mandarlo a un eco. */
  tone(type: OscillatorType, freq: number, t: number, decay: number, peak: number, out: AudioNode, attack = 0.005): GainNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const e = this.ctx.createGain();
    this.envelope(e, t, attack, peak, decay);
    o.connect(e).connect(out);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
    return e;
  }

  /** Ráfaga de ruido filtrado: tics, golpes, soplidos. */
  burst(t: number, decay: number, freq: number, peak: number, out: AudioNode, type: BiquadFilterType = "bandpass", q = 1.5): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const e = this.ctx.createGain();
    this.envelope(e, t, 0.002, peak, decay);
    src.connect(f).connect(e).connect(out);
    src.start(t, Math.max(0, Math.random() * (this.noise.duration - decay - 0.1)));
    src.stop(t + decay + 0.05);
  }

  /** Campana: parciales inarmónicos que se apagan despacio. */
  bell(t: number, freq: number, level: number, out: AudioNode): void {
    for (const [ratio, amp] of [[1, 1], [2.4, 0.4], [3.9, 0.2], [5.4, 0.1]] as const) {
      this.tone("sine", freq * ratio, t, 3 / ratio + 0.4, 0.12 * amp * level, out, 0.002);
    }
  }
}
