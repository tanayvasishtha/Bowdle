import { audioBuses } from "./bus.ts";
import { AUDIO_MIX, MULTIKILL_CHIME } from "../render/look.ts";

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
    const buses = audioBuses(); if (!buses) return;
    this.context = buses.context;
    this.master = this.context.createGain();
    this.master.connect(buses.effects);
    this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
    const channel = this.noise.getChannelData(0);
    let seed = 0x51f15e;
    for (let index = 0; index < channel.length; index += 1) {
      seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      channel[index] = ((seed >>> 0) / 4294967296) * 2 - 1;
    }
  }

  /**
   * One voice of a recipe. It fades in over a few milliseconds instead of starting at full volume (which clicks), and
   * scale nudges the pitch so a sound never repeats exactly.
   */
  private voice(context: AudioContext, master: AudioNode, voice: Voice, now: number, pitch: number, scale = 1): void {
    const start = now + voice.delay, end = start + voice.duration;
    const attack = Math.min(AUDIO_MIX.attackS, voice.duration / 3);
    const gain = context.createGain();
    gain.gain.setValueAtTime(MIN_GAIN, start);
    gain.gain.exponentialRampToValueAtTime(voice.gain, start + attack);
    gain.gain.exponentialRampToValueAtTime(MIN_GAIN, end);
    gain.connect(master);
    if (voice.kind === "tone") {
      const oscillator = context.createOscillator();
      oscillator.type = voice.wave;
      oscillator.frequency.setValueAtTime((voice.from + pitch) * scale, start);
      oscillator.frequency.exponentialRampToValueAtTime((voice.to + pitch) * scale, end);
      oscillator.connect(gain); oscillator.start(start); oscillator.stop(end + 0.02);
      return;
    }
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = voice.filter;
    filter.frequency.setValueAtTime(voice.from * scale, start);
    filter.frequency.exponentialRampToValueAtTime(voice.to * scale, end);
    // A random point in the noise, so the same sound is never the same sample.
    source.connect(filter).connect(gain); source.start(start, Math.random() * 0.7); source.stop(end + 0.02);
  }

  /** A small random pitch change per play. */
  private jitter(): number { return 1 + (Math.random() * 2 - 1) * AUDIO_MIX.pitchJitter; }

  /** Moves the ear to the camera. Yaw 0 faces -z. */
  setListener(x: number, y: number, z: number, yaw: number): void {
    const context = this.context; if (!context) return;
    const listener = context.listener, forwardX = -Math.sin(yaw), forwardZ = -Math.cos(yaw);
    if (listener.positionX) {
      const now = context.currentTime;
      listener.positionX.setValueAtTime(x, now); listener.positionY.setValueAtTime(y, now); listener.positionZ.setValueAtTime(z, now);
      listener.forwardX.setValueAtTime(forwardX, now); listener.forwardY.setValueAtTime(0, now); listener.forwardZ.setValueAtTime(forwardZ, now);
      listener.upX.setValueAtTime(0, now); listener.upY.setValueAtTime(1, now); listener.upZ.setValueAtTime(0, now);
    } else {
      listener.setPosition(x, y, z); listener.setOrientation(forwardX, 0, forwardZ, 0, 1, 0);
    }
  }

  /** A recipe sound at a world position, panned around the listener. The caller decides the loudness. */
  playAt(name: RecipeName, x: number, y: number, z: number, loudness: number): void {
    this.ensureContext();
    const context = this.context, master = this.master;
    if (!context || !master || loudness <= 0) return;
    const panner = context.createPanner();
    panner.panningModel = "HRTF"; panner.distanceModel = "linear"; panner.rolloffFactor = 0; panner.refDistance = 1; panner.maxDistance = 10_000;
    panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z;
    const level = context.createGain(); level.gain.value = loudness;
    level.connect(panner).connect(master);
    const now = context.currentTime;
    const scale = this.jitter();
    for (const voice of RECIPES[name]) this.voice(context, level, voice, now, 0, scale);
    window.setTimeout(() => { level.disconnect(); panner.disconnect(); }, 1500);
  }

  /** `amount` is damage for "hit"; other sounds ignore it. */
  play(name: SoundName, amount = 0): void {
    this.ensureContext();
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const now = context.currentTime;
    if (name in RECIPES) {
      const pitch = name === "hit" ? amount * HIT_PITCH_PER_DAMAGE : 0;
      const scale = this.jitter();
      for (const voice of RECIPES[name as RecipeName]) this.voice(context, master, voice, now, pitch, scale);
      return;
    }
    if (name === "multikill") {
      for (let note = 0; note < MULTIKILL_CHIME.notes.length; note += 1) {
        const start = now + note * MULTIKILL_CHIME.stepS;
        const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(MULTIKILL_CHIME.notes[note]!, start);
        gain.gain.setValueAtTime(MULTIKILL_CHIME.floor, start); gain.gain.exponentialRampToValueAtTime(MULTIKILL_CHIME.peak, start + AUDIO_MIX.attackS); gain.gain.exponentialRampToValueAtTime(MULTIKILL_CHIME.floor, start + MULTIKILL_CHIME.decayS);
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
      gain.gain.setValueAtTime(MIN_GAIN, now);
      gain.gain.exponentialRampToValueAtTime(name === "draw" ? 0.05 : name === "paper" ? 0.12 : 0.12, now + AUDIO_MIX.attackS);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (name === "draw" ? 0.28 : name === "paper" ? 0.22 : 0.12));
      source.connect(filter).connect(gain).connect(master);
      source.start(now, Math.random() * 0.7);
      source.stop(now + 0.3);
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    // Headshot is a bright ding, but a filtered triangle rather than a raw square wave.
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(name === "headshot" ? 880 : 180, now);
    oscillator.frequency.exponentialRampToValueAtTime(name === "headshot" ? 1320 : 70, now + 0.12);
    gain.gain.setValueAtTime(MIN_GAIN, now);
    gain.gain.exponentialRampToValueAtTime(name === "headshot" ? 0.09 : 0.12, now + AUDIO_MIX.attackS);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    const soften = context.createBiquadFilter(); soften.type = "lowpass"; soften.frequency.value = 2500;
    oscillator.connect(soften).connect(gain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  }
}
