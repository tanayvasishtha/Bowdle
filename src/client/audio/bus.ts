import { AUDIO_MIX } from "../render/look.ts";

/** Every AudioContext the game opens, so ad breaks can silence all of them at once. */
const contexts = new Set<AudioContext>();
let suspended = false;

export function registerAudioContext(context: AudioContext): void {
  contexts.add(context);
  if (suspended) void context.suspend().catch(() => undefined);
}

export function setAudioSuspended(value: boolean): void {
  suspended = value;
  for (const context of contexts) void (value ? context.suspend() : context.resume()).catch(() => undefined);
}

export function audioSuspended(): boolean { return suspended; }

export type BusName = "music" | "effects" | "ambience";
export type AudioBuses = { context: AudioContext; master: GainNode } & Record<BusName, GainNode>;
export type MixSettings = { masterVolume: number; musicVolume: number; effectsVolume: number; ambienceVolume: number; music: boolean };

let shared: AudioBuses | null = null;
/** The gains the buses are heading for, readable at once (the audio nodes ramp over a moment). */
const targets: Record<"master" | BusName, number> = { master: 1, music: 1, effects: 1, ambience: 1 };
let pendingMix: MixSettings | null = null;

/** One shared context: master, then music, effects and ambience buses under it. Created on first use. */
export function audioBuses(): AudioBuses | null {
  if (shared) return shared;
  if (typeof AudioContext === "undefined") return null;
  const context = new AudioContext();
  registerAudioContext(context);
  const master = context.createGain(); master.connect(context.destination);
  const bus = (): GainNode => { const gain = context.createGain(); gain.connect(master); return gain; };
  shared = { context, master, music: bus(), effects: bus(), ambience: bus() };
  if (pendingMix) applyMix(pendingMix);
  const resume = (): void => { if (!suspended && context.state === "suspended") void context.resume().catch(() => undefined); };
  window.addEventListener("pointerdown", resume);
  window.addEventListener("keydown", resume);
  return shared;
}

/** Sets every bus from the settings; music is silent while it is switched off. */
export function applyMix(settings: MixSettings): void {
  targets.master = settings.masterVolume;
  targets.music = settings.music ? settings.musicVolume : 0;
  targets.effects = settings.effectsVolume;
  targets.ambience = settings.ambienceVolume;
  pendingMix = settings;
  if (!shared) return;
  const now = shared.context.currentTime;
  shared.master.gain.setTargetAtTime(targets.master, now, AUDIO_MIX.busRampS);
  for (const name of ["music", "effects", "ambience"] as const) shared[name].gain.setTargetAtTime(targets[name], now, AUDIO_MIX.busRampS);
}

export function busTarget(name: "master" | BusName): number { return targets[name]; }
