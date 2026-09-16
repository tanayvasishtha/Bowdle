import { registerAudioContext } from "./bus.ts";
import { MASTER_VOLUME } from "../../shared/constants.ts";
import { loadSettings } from "../settings.ts";
import { MULTIKILL_CHIME } from "../render/look.ts";

import { HIT_PITCH_PER_DAMAGE, RECIPES, type RecipeName, type Voice } from "./recipes.ts";

export type SoundName = "draw" | "release" | "wood" | "body" | "headshot" | "dagger" | "paper" | "multikill" | RecipeName;
const MIN_GAIN = 0.001;

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
    registerAudioContext(this.context);
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

  private voice(context: AudioContext, master: GainNode, voice: Voice, now: number, pitch: number): void {
    const start = now + voice.delay, end = start + voice.duration;
    const gain = context.createGain();
    gain.gain.setValueAtTime(voice.gain, start);
    gain.gain.exponentialRampToValueAtTime(MIN_GAIN, end);
    gain.connect(master);
    if (voice.kind === "tone") {
      const oscillator = context.createOscillator();
      oscillator.type = voice.wave;
      oscillator.frequency.setValueAtTime(voice.from + pitch, start);
      oscillator.frequency.exponentialRampToValueAtTime(voice.to + pitch, end);
      oscillator.connect(gain); oscillator.start(start); oscillator.stop(end + 0.02);
      return;
    }
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = voice.filter;
    filter.frequency.setValueAtTime(voice.from, start);
    filter.frequency.exponentialRampToValueAtTime(voice.to, end);
    source.connect(filter).connect(gain); source.start(start); source.stop(end + 0.02);
  }

  /** `amount` is damage for "hit"; other sounds ignore it. */
  play(name: SoundName, amount = 0): void {
    this.ensureContext();
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    master.gain.value = loadSettings().masterVolume;
    const now = context.currentTime;
    if (name in RECIPES) {
      const pitch = name === "hit" ? amount * HIT_PITCH_PER_DAMAGE : 0;
      for (const voice of RECIPES[name as RecipeName]) this.voice(context, master, voice, now, pitch);
      return;
    }
    if (name === "multikill") {
      for (let note = 0; note < MULTIKILL_CHIME.notes.length; note += 1) {
        const start = now + note * MULTIKILL_CHIME.stepS;
        const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(MULTIKILL_CHIME.notes[note]!, start);
        gain.gain.setValueAtTime(MULTIKILL_CHIME.peak, start); gain.gain.exponentialRampToValueAtTime(MULTIKILL_CHIME.floor, start + MULTIKILL_CHIME.decayS);
        oscillator.connect(gain).connect(master); oscillator.start(start); oscillator.stop(start + MULTIKILL_CHIME.tailS);
      }
      return;
    }
    if (name === "draw" || name === "wood" || name === "body" || name === "dagger" || name === "paper") {
      const source = context.createBufferSource();
      source.buffer = this.noise;
      const filter = context.createBiquadFilter();
      filter.type = name === "draw" ? "bandpass" : "lowpass";
      filter.frequency.setValueAtTime(name === "draw" ? 700 : name === "dagger" ? 1800 : name === "paper" ? 2400 : 420, now);
      const gain = context.createGain();
      gain.gain.setValueAtTime(name === "draw" ? 0.06 : name === "paper" ? 0.2 : 0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (name === "draw" ? 0.28 : name === "paper" ? 0.22 : 0.12));
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
