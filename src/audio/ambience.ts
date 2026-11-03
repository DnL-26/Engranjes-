import type { Zone } from "./music";
import type { Synth } from "./synth";

/**
 * Sonido ambiente según la altura: murmullo y pájaros al pie de la torre, viento entre las nubes,
 * grillos de noche, un brillo casi inaudible en el cosmos y el pueblo celebrando en el final.
 */
export class Ambience {
  private bed: BiquadFilterNode;
  private level: GainNode;
  private zone: Zone = 0;
  private clock = 0;

  constructor(
    private syn: Synth,
    private out: AudioNode,
  ) {
    const ctx = syn.ctx;
    const src = ctx.createBufferSource();
    src.buffer = syn.noise;
    src.loop = true;
    this.bed = ctx.createBiquadFilter();
    this.bed.type = "bandpass";
    this.bed.Q.value = 0.6;
    this.bed.frequency.value = 450;
    this.level = syn.gain(0);
    src.connect(this.bed).connect(this.level).connect(out);
    src.start();
  }

  update(zone: Zone, dt: number): void {
    const ctx = this.syn.ctx;
    const t = ctx.currentTime;
    this.zone = zone;
    this.clock += dt;
    const [freq, gain] = [
      [450, 0.05],
      [700, 0.13 + 0.06 * Math.sin(this.clock * 0.7)],
      [600, 0.04],
      [5000, 0.015],
      [400, 0.07],
    ][this.zone];
    this.bed.frequency.setTargetAtTime(freq, t, 0.6);
    this.level.gain.setTargetAtTime(gain, t, 0.6);

    // Detalles sueltos: la probabilidad va por segundo, así no depende de los fps.
    if (this.zone === 0 && Math.random() < dt * 0.4) this.bird(t);
    if (this.zone === 2 && Math.random() < dt * 2) this.cricket(t);
    if (this.zone === 4 && Math.random() < dt * 0.6) this.syn.burst(t, 0.4, 900 + Math.random() * 600, 0.03, this.out, "bandpass", 3);
  }

  private bird(t: number): void {
    const ctx = this.syn.ctx;
    for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      const start = t + k * 0.12;
      o.frequency.setValueAtTime(2600 + Math.random() * 400, start);
      o.frequency.exponentialRampToValueAtTime(3800 + Math.random() * 600, start + 0.08);
      const e = ctx.createGain();
      this.syn.envelope(e, start, 0.005, 0.025, 0.09);
      o.connect(e).connect(this.out);
      o.start(start);
      o.stop(start + 0.15);
    }
  }

  private cricket(t: number): void {
    for (let k = 0; k < 3; k++) this.syn.tone("sine", 4600, t + k * 0.05, 0.03, 0.01, this.out, 0.002);
  }
}
