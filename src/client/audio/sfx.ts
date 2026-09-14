import { MASTER_VOLUME } from "../../shared/constants.ts";

type SoundName = "draw" | "release" | "wood" | "body" | "headshot" | "dagger";

export class SoundEffects {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  constructor() {
    window.addEventListener("pointerdown", () => this.ensureContext(), { once: true });
  }

  private ensureContext(): void {
    if (this.context) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = MASTER_VOLUME;
    this.master.connect(this.context.destination);
    this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
    const channel = this.noise.getChannelData(0);
    let seed = 0x51f15e;
    for (let index = 0; index < channel.length; index += 1) {
      seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      channel[index] = ((seed >>> 0) / 4294967296) * 2 - 1;
    }
  }

  play(name: SoundName): void {
    this.ensureContext();
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const now = context.currentTime;
    if (name === "draw" || name === "wood" || name === "body" || name === "dagger") {
      const source = context.createBufferSource();
      source.buffer = this.noise;
      const filter = context.createBiquadFilter();
      filter.type = name === "draw" ? "bandpass" : "lowpass";
      filter.frequency.setValueAtTime(name === "draw" ? 700 : name === "dagger" ? 1800 : 420, now);
      const gain = context.createGain();
      gain.gain.setValueAtTime(name === "draw" ? 0.06 : 0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (name === "draw" ? 0.28 : 0.12));
      source.connect(filter).connect(gain).connect(master);
      source.start(now);
      source.stop(now + 0.3);
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = name === "headshot" ? "square" : "triangle";
    oscillator.frequency.setValueAtTime(name === "headshot" ? 880 : 180, now);
    oscillator.frequency.exponentialRampToValueAtTime(name === "headshot" ? 1320 : 70, now + 0.12);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    oscillator.connect(gain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  }
}
