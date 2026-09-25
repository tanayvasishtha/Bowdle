/** Generated sound recipes: every sound is a few tone or filtered-noise voices. Times in seconds, gains 0 to 1. */
export type ToneVoice = { kind: "tone"; wave: OscillatorType; from: number; to: number; delay: number; duration: number; gain: number };
export type NoiseVoice = { kind: "noise"; filter: BiquadFilterType; from: number; to: number; delay: number; duration: number; gain: number };
export type Voice = ToneVoice | NoiseVoice;

export type RecipeName = "dodge" | "doubleJump" | "wallJump" | "mantle" | "reel" | "ropeSnap" | "click" | "hover" | "footstep" | "zip";

const tone = (wave: OscillatorType, from: number, to: number, duration: number, gain: number, delay = 0): ToneVoice => ({ kind: "tone", wave, from, to, delay, duration, gain });
const noise = (filter: BiquadFilterType, from: number, to: number, duration: number, gain: number, delay = 0): NoiseVoice => ({ kind: "noise", filter, from, to, delay, duration, gain });

export const RECIPES: Record<RecipeName, readonly Voice[]> = {
  dodge: [noise("bandpass", 2000, 600, 0.18, 0.12)],
  doubleJump: [noise("bandpass", 1500, 1200, 0.1, 0.07), tone("triangle", 500, 800, 0.1, 0.05)],
  wallJump: [noise("lowpass", 700, 700, 0.08, 0.2), tone("triangle", 300, 600, 0.12, 0.1)],
  mantle: [noise("bandpass", 900, 500, 0.2, 0.1)],
  reel: [tone("triangle", 180, 260, 0.25, 0.04)],
  ropeSnap: [noise("bandpass", 1500, 900, 0.12, 0.1), tone("triangle", 900, 200, 0.15, 0.06)],
  footstep: [noise("lowpass", 520, 260, 0.07, 0.22), tone("sine", 90, 60, 0.05, 0.08)],
  zip: [noise("bandpass", 1200, 2000, 0.35, 0.06), tone("triangle", 300, 600, 0.35, 0.03)],
  click: [tone("sine", 880, 760, 0.05, 0.035)],
  hover: [tone("sine", 660, 660, 0.04, 0.012)],
};

