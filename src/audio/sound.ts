/**
 * Sonido sintetizado con WebAudio: no hay archivos de audio. El contexto se crea en el primer gesto
 * del jugador, porque los navegadores no dejan sonar nada antes.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private humOsc: OscillatorNode[] = [];
  private humGain!: GainNode;
  private humFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private lastTick = 0;
  private muted = false;

  /** Llamar desde un gesto del jugador (clic, tecla). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Zumbido de fondo: dos sierras desafinadas por un paso bajo.
    this.humFilter = ctx.createBiquadFilter();
    this.humFilter.type = "lowpass";
    this.humFilter.frequency.value = 600;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humFilter.connect(this.humGain).connect(this.master);
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
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }

  /** Tono del zumbido según la velocidad del último eje (vueltas/s) y la sobremarcha (0–1). */
  updateHum(rps: number, overdrive: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const octaves = Math.min(4.5, Math.max(0, Math.log10(Math.max(rps, 1e-3) + 1) * 0.55));
    const freq = 45 * 2 ** octaves * 2 ** ((overdrive * 5) / 12);
    for (const o of this.humOsc) o.frequency.setTargetAtTime(freq, t, 0.15);
    this.humFilter.frequency.setTargetAtTime(300 + freq * 4, t, 0.15);
    const level = rps > 0.3 ? 0.035 + 0.02 * overdrive : 0;
    this.humGain.gain.setTargetAtTime(level, t, 0.2);
  }

  /** Tic mecánico (vuelta de un eje lento, manivela). Limitado para no saturar. */
  tick(pitch = 1): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastTick < 0.04) return;
    this.lastTick = t;
    this.noiseBurst(t, 0.025, 2500 * pitch, 0.25);
  }

  /** Campanada de la torre: un tañido grave con armónicos que se apaga despacio. */
  bell(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [ratio, gain] of [[1, 0.3], [2.4, 0.12], [3.9, 0.06]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 196 * ratio;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 2.6);
    }
  }

  /** Trueno: ruido grave que retumba. */
  thunder(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseBurst(t, 1.6, 120, 0.7);
    this.noiseBurst(t + 0.15, 1.2, 260, 0.35);
  }

  /** "Voz" de Anselmo: un soplido corto y aflautado, con el tono un poco al azar. */
  voice(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(380 + Math.random() * 120, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.06);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.08);
    this.noiseBurst(t, 0.05, 3000, 0.03);
  }

  /** Clac de compra. */
  clunk(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.09);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.13);
    this.noiseBurst(t, 0.03, 1200, 0.2);
  }

  /** Campanilla de material nuevo: más aguda cuanto mejor es el material. */
  chime(tier: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const scale = [0, 2, 4, 7, 9];
    const note = (k: number) => 523.25 * 2 ** ((Math.floor(k / 5) * 12 + scale[k % 5]) / 12);
    [tier, tier + 2].forEach((k, j) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = note(k);
      const start = t + j * 0.07;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.18, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      o.connect(g).connect(this.master);
      o.start(start);
      o.stop(start + 0.55);
    });
  }

  /** Fundición: un rugido grave de horno que crece y una cascada de campanillas. */
  foundry(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseBurst(t, 1.4, 300, 0.5);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(50, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 1.2);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1.5);
    for (let k = 0; k < 5; k++) setTimeout(() => this.chime(k * 2), 900 + k * 110);
  }

  /** El motor se gripa: un chirrido que cae y un golpe de ruido. */
  stall(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(400, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.9);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1);
    this.noiseBurst(t, 0.6, 800, 0.4);
  }

  private noiseBurst(t: number, duration: number, freq: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.4);
    src.stop(t + duration);
  }
}
