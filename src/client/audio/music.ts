import { mulberry32 } from "../../shared/math/rng.ts";
import { AUDIO_MIX } from "../render/look.ts";
import { audioBuses, type AudioBuses } from "./bus.ts";
import { layerMix, type LayerMix } from "./spatial.ts";

/** A minor pentatonic scale over two octaves, and four pad chords, all generated; no recorded music. */
const SCALE_HZ = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99];
const CHORDS_HZ = [[110, 164.81, 220], [98, 146.83, 196], [87.31, 130.81, 174.61], [98, 146.83, 196]];
const LOOKAHEAD_S = 0.3;
const TICK_MS = 100;

/**
 * Three music layers (pad, percussion, melody) whose gains follow one intensity value with slow crossfades.
 * Everything plays into the music bus, so the music setting and M silence it.
 */
export class MusicDirector {
  private buses: AudioBuses | null = null;
  private layers: Record<keyof LayerMix, GainNode> | null = null;
  private pads: OscillatorNode[] = [];
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private nextBeatS = 0;
  private beat = 0;
  private intensity = 0;
  private readonly rng = mulberry32(0x6d75);
  private readonly target: LayerMix = layerMix(0);

  /** Starts the layers once audio may play. Safe to call often. */
  start(): void {
    if (this.buses) return;
    const buses = audioBuses(); if (!buses) return;
    this.buses = buses;
    const { context } = buses;
    const layer = (): GainNode => { const gain = context.createGain(); gain.gain.value = 0; gain.connect(buses.music); return gain; };
    this.layers = { pad: layer(), percussion: layer(), melody: layer() };
    const padFilter = context.createBiquadFilter(); padFilter.type = "lowpass"; padFilter.frequency.value = 600; padFilter.connect(this.layers.pad);
    for (const frequency of CHORDS_HZ[0]!) {
      const oscillator = context.createOscillator(); oscillator.type = "triangle"; oscillator.frequency.value = frequency;
      const voice = context.createGain(); voice.gain.value = AUDIO_MIX.padGain;
      oscillator.connect(voice).connect(padFilter); oscillator.start(); this.pads.push(oscillator);
    }
    this.noise = context.createBuffer(1, context.sampleRate / 4, context.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) samples[index] = this.rng() * 2 - 1;
    this.nextBeatS = context.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
    this.setIntensity(this.intensity);
  }

  setIntensity(value: number): void {
    this.intensity = value;
    Object.assign(this.target, layerMix(value));
    if (!this.buses || !this.layers) return;
    const now = this.buses.context.currentTime, timeConstant = AUDIO_MIX.crossfadeS / 3;
    for (const name of ["pad", "percussion", "melody"] as const) this.layers[name].gain.setTargetAtTime(this.target[name], now, timeConstant);
  }

  /** The layer gains the director is fading toward. */
  mix(): LayerMix { return { ...this.target }; }

  stop(): void {
    window.clearInterval(this.timer);
    for (const pad of this.pads) pad.stop();
    this.pads = [];
    if (this.layers) for (const layer of Object.values(this.layers)) layer.disconnect();
    this.layers = null; this.buses = null;
  }

  private schedule(): void {
    if (!this.buses || !this.layers) return;
    const { context } = this.buses;
    const beatS = 60 / AUDIO_MIX.bpm;
    if (this.nextBeatS < context.currentTime) this.nextBeatS = context.currentTime + 0.05;
    while (this.nextBeatS < context.currentTime + LOOKAHEAD_S) {
      const at = this.nextBeatS, bar = Math.floor(this.beat / 4);
      if (this.beat % 8 === 0) {
        const chord = CHORDS_HZ[Math.floor(bar / 2) % CHORDS_HZ.length]!;
        this.pads.forEach((pad, index) => pad.frequency.setTargetAtTime(chord[index]!, at, 0.03));
      }
      if (this.beat % 2 === 0) this.kick(at);
      if (this.beat % 2 === 1) this.shaker(at + beatS / 2);
      if (this.rng() < AUDIO_MIX.melodyChance) this.note(at, SCALE_HZ[Math.floor(this.rng() * SCALE_HZ.length)]!, beatS * (this.rng() < 0.3 ? 2 : 1));
      this.beat += 1;
      this.nextBeatS += beatS;
    }
  }

  private kick(at: number): void {
    const { context } = this.buses!;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.frequency.setValueAtTime(120, at); oscillator.frequency.exponentialRampToValueAtTime(45, at + 0.18);
    gain.gain.setValueAtTime(AUDIO_MIX.kickGain, at); gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
    oscillator.connect(gain).connect(this.layers!.percussion); oscillator.start(at); oscillator.stop(at + 0.25);
  }

  private shaker(at: number): void {
    const { context } = this.buses!;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = this.noise; filter.type = "bandpass"; filter.frequency.value = 6000; filter.Q.value = 0.8;
    gain.gain.setValueAtTime(AUDIO_MIX.shakerGain, at); gain.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
    source.connect(filter).connect(gain).connect(this.layers!.percussion); source.start(at, this.rng() * 0.15); source.stop(at + 0.08);
  }

  private note(at: number, frequency: number, length: number): void {
    const { context } = this.buses!;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = "triangle"; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(AUDIO_MIX.melodyGain, at + 0.02); gain.gain.exponentialRampToValueAtTime(0.001, at + length);
    oscillator.connect(gain).connect(this.layers!.melody); oscillator.start(at); oscillator.stop(at + length + 0.05);
  }
}

let director: MusicDirector | null = null;
/** The page's one music director, started on the first click or key press. */
export function music(): MusicDirector {
  if (director) return director;
  const created = new MusicDirector();
  director = created;
  const begin = (): void => created.start();
  window.addEventListener("pointerdown", begin, { once: true });
  window.addEventListener("keydown", begin, { once: true });
  return created;
}
