import { audioBuses } from "./bus.ts";
import { ZIP_SPEED } from "../../shared/constants.ts";
import type { MapData } from "../../shared/maps/types.ts";
import { mulberry32, type SeededRng } from "../../shared/math/rng.ts";

const AUDIO = { noiseSeconds: 2, jungleGain: 0.035, windGain: 0.022, waterGain: 0.08, waterRange: 35, rumbleGain: 0.1, rollGain: 0.13, zipGain: 0.045, birdMinMs: 2000, birdRangeMs: 5000 } as const;

export class Ambience {
  private readonly map: MapData;
  private readonly rng: SeededRng;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private water: GainNode | null = null;
  private rumble: GainNode | null = null;
  private roll: GainNode | null = null;
  private zip: GainNode | null = null;
  private zipTone: OscillatorNode | null = null;
  private noise: AudioBuffer | null = null;
  private disposed = false;
  /** Everything this ambience started, stopped again on dispose because the audio context is shared. */
  private readonly running: AudioScheduledSourceNode[] = [];
  private readonly startOnPointer = (): void => { this.start(); };

  constructor(map: MapData) {
    this.map = map; this.rng = mulberry32(map.look.stainSeed ^ 0x71a9);
    window.addEventListener("pointerdown", this.startOnPointer, { once: true });
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener("pointerdown", this.startOnPointer);
    for (const source of this.running) { try { source.stop(); } catch { /* already stopped */ } }
    this.master?.disconnect();
  }

  updateListener(x: number, z: number): void {
    if (!this.context || !this.water) return;
    let distance = Number.POSITIVE_INFINITY;
    for (const volume of this.map.volumes) if (volume.kind === "water") {
      const nearestX = Math.max(volume.min[0], Math.min(volume.max[0], x)), nearestZ = Math.max(volume.min[2], Math.min(volume.max[2], z));
      distance = Math.min(distance, Math.hypot(x - nearestX, z - nearestZ));
    }
    const gain = Number.isFinite(distance) ? Math.max(0, 1 - distance / AUDIO.waterRange) * AUDIO.waterGain : 0;
    this.water.gain.setTargetAtTime(gain, this.context.currentTime, 0.2);
  }

  setBoulder(phase: "idle" | "telegraph" | "roll" | "despawn"): void {
    if (!this.context || !this.rumble || !this.roll) return;
    this.rumble.gain.setTargetAtTime(phase === "telegraph" ? AUDIO.rumbleGain : 0, this.context.currentTime, 0.08);
    this.roll.gain.setTargetAtTime(phase === "roll" ? AUDIO.rollGain : 0, this.context.currentTime, 0.08);
  }

  setZipSpeed(speed: number): void {
    if (!this.context || !this.zip || !this.zipTone) return;
    const fraction = Math.max(0, Math.min(1, speed / ZIP_SPEED));
    this.zip.gain.setTargetAtTime(fraction * AUDIO.zipGain, this.context.currentTime, 0.04);
    this.zipTone.frequency.setTargetAtTime(180 + fraction * 520, this.context.currentTime, 0.04);
  }

  leverClunk(): void {
    if (!this.context || !this.master || !this.noise) return;
    const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain(), now = this.context.currentTime;
    source.buffer = this.noise; filter.type = "lowpass"; filter.frequency.value = 240; gain.gain.setValueAtTime(0.18, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    source.connect(filter).connect(gain).connect(this.master); source.start(now); source.stop(now + 0.18);
  }

  private start(): void {
    if (this.context || this.disposed) return;
    const buses = audioBuses(); if (!buses) return;
    const context = buses.context; this.context = context; this.master = context.createGain(); this.master.connect(buses.ambience);
    this.noise = context.createBuffer(1, context.sampleRate * AUDIO.noiseSeconds, context.sampleRate); const samples = this.noise.getChannelData(0);
    let seed = this.map.look.stainSeed ^ 0x4f1bbcdc; for (let index = 0; index < samples.length; index += 1) { seed = Math.imul(seed ^ seed >>> 15, 1 | seed); samples[index] = (seed >>> 0) / 2147483648 - 1; }
    const jungle = this.loopNoise("bandpass", 3800), jungleGain = context.createGain(); jungleGain.gain.value = AUDIO.jungleGain; jungle.connect(jungleGain).connect(this.master);
    const tremolo = context.createOscillator(), tremoloDepth = context.createGain(); tremolo.frequency.value = 0.12; tremoloDepth.gain.value = AUDIO.jungleGain * 0.35; tremolo.connect(tremoloDepth).connect(jungleGain.gain); tremolo.start(); this.running.push(tremolo);
    const wind = this.loopNoise("lowpass", 520), windGain = context.createGain(); windGain.gain.value = AUDIO.windGain; wind.connect(windGain).connect(this.master);
    this.water = context.createGain(); this.water.gain.value = 0; this.loopNoise("lowpass", 900).connect(this.water).connect(this.master);
    this.rumble = context.createGain(); this.rumble.gain.value = 0; this.loopNoise("lowpass", 110).connect(this.rumble).connect(this.master);
    this.roll = context.createGain(); this.roll.gain.value = 0; this.loopNoise("bandpass", 280).connect(this.roll).connect(this.master);
    this.zip = context.createGain(); this.zip.gain.value = 0; this.zipTone = context.createOscillator(); this.zipTone.type = "triangle"; this.zipTone.connect(this.zip).connect(this.master); this.zipTone.start(); this.running.push(this.zipTone);
    this.scheduleBird();
  }

  private loopNoise(type: BiquadFilterType, frequency: number): BiquadFilterNode {
    const source = this.context!.createBufferSource(), filter = this.context!.createBiquadFilter(); source.buffer = this.noise; source.loop = true; filter.type = type; filter.frequency.value = frequency; source.connect(filter); source.start(); this.running.push(source); return filter;
  }

  private scheduleBird(): void {
    window.setTimeout(() => { if (!this.disposed) { this.chirp(); this.scheduleBird(); } }, AUDIO.birdMinMs + this.rng() * AUDIO.birdRangeMs);
  }

  private chirp(): void {
    if (!this.context || !this.master) return;
    const tone = this.context.createOscillator(), gain = this.context.createGain(), now = this.context.currentTime, start = 1700 + this.rng() * 900;
    tone.type = "sine"; tone.frequency.setValueAtTime(start, now); tone.frequency.exponentialRampToValueAtTime(start * 1.45, now + 0.11); gain.gain.setValueAtTime(0.035, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    tone.connect(gain).connect(this.master); tone.start(now); tone.stop(now + 0.22);
  }
}
