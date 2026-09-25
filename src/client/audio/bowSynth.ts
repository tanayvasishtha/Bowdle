/**
 * Bow and hit sounds built from layers: a plucked string (harmonics that fade faster the higher they are), struck wood
 * and bell modes (a few inharmonic partials), thumps (falling sines) and filtered noise for air and impacts.
 * Everything is generated; nothing is sampled. Times in seconds, gains 0 to 1 before the effects bus.
 */
export type SynthKit = { context: AudioContext; out: AudioNode; noise: AudioBuffer };
export type BowSound = "draw" | "release" | "twang" | "hit" | "headshot" | "body" | "kill" | "wood";

const FLOOR = 0.0001;
/** Stiff strings run slightly sharp in their upper harmonics; this is what makes a pluck sound like a string. */
const STRING_STIFFNESS = 0.0004;
const PLUCK_HARMONICS = 6;

function envelope(kit: SynthKit, t: number, peak: number, attackS: number, decayS: number): GainNode {
  const gain = kit.context.createGain();
  gain.gain.setValueAtTime(FLOOR, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attackS);
  gain.gain.exponentialRampToValueAtTime(FLOOR, t + attackS + decayS);
  gain.connect(kit.out);
  return gain;
}

/** One oscillator gliding from `from` to `to` Hz while it fades. */
function tone(kit: SynthKit, t: number, wave: OscillatorType, from: number, to: number, decayS: number, peak: number, attackS = 0.003): void {
  const oscillator = kit.context.createOscillator();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(from, t);
  oscillator.frequency.exponentialRampToValueAtTime(to, t + attackS + decayS);
  oscillator.connect(envelope(kit, t, peak, attackS, decayS));
  oscillator.start(t); oscillator.stop(t + attackS + decayS + 0.02);
}

/** Filtered noise; the filter sweeps from `from` to `to` Hz. Starts at a random point so no two plays match. */
function hiss(kit: SynthKit, t: number, type: BiquadFilterType, from: number, to: number, q: number, decayS: number, peak: number, attackS = 0.003): void {
  const source = kit.context.createBufferSource();
  source.buffer = kit.noise;
  const filter = kit.context.createBiquadFilter();
  filter.type = type; filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + attackS + decayS);
  source.connect(filter).connect(envelope(kit, t, peak, attackS, decayS));
  const length = attackS + decayS + 0.02;
  source.start(t, Math.random() * Math.max(0, kit.noise.duration - length)); source.stop(t + length);
}

/** A plucked string at `freq` Hz. */
function pluck(kit: SynthKit, t: number, freq: number, decayS: number, peak: number): void {
  for (let n = 1; n <= PLUCK_HARMONICS; n += 1) {
    const partial = freq * n * Math.sqrt(1 + STRING_STIFFNESS * n * n);
    tone(kit, t, "sine", partial, partial * 0.985, decayS / Math.pow(n, 0.8), peak / n, 0.002);
  }
}

/** Struck wood or metal: each mode rings at its own pitch for its own time. */
function modes(kit: SynthKit, t: number, freqs: readonly number[], decays: readonly number[], gains: readonly number[], scale: number): void {
  for (let index = 0; index < freqs.length; index += 1) {
    const freq = freqs[index]! * scale;
    tone(kit, t, "sine", freq, freq * 0.99, decays[index]!, gains[index]!, 0.001);
  }
}

/** The hit tick: a short high knock over a low thud. Heavier hits knock a little higher. */
function impact(kit: SynthKit, t: number, scale: number, damage: number): void {
  const knock = (1500 + Math.min(120, damage) * 3) * scale;
  tone(kit, t, "sine", knock, knock * 0.78, 0.05, 0.07, 0.001);
  tone(kit, t, "sine", 170 * scale, 70, 0.08, 0.1);
  hiss(kit, t, "lowpass", 1200, 400, 0.7, 0.03, 0.05);
}

/** `scale` is a small random pitch change per play; `amount` is damage for hit sounds. */
export const BOW_SOUNDS: Record<BowSound, (kit: SynthKit, t: number, scale: number, amount: number) => void> = {
  // The limbs creak as the string comes back: a rising band of noise and three small ticks.
  draw: (kit, t, scale) => {
    // Narrow bands pass little of the noise's energy, hence the high gains.
    hiss(kit, t, "bandpass", 350 * scale, 900 * scale, 3, 0.45, 0.3, 0.15);
    for (const at of [0.08, 0.19, 0.31]) hiss(kit, t + at, "bandpass", 1300 * scale, 1100 * scale, 8, 0.015, 0.2, 0.002);
  },
  // String twang, the bow's thump, the string slapping the guard, then the arrow's whoosh.
  release: (kit, t, scale) => {
    pluck(kit, t, 196 * scale, 0.28, 0.045);
    tone(kit, t, "sine", 130 * scale, 48, 0.1, 0.14);
    hiss(kit, t, "highpass", 3000, 3000, 0.7, 0.012, 0.03, 0.001);
    hiss(kit, t + 0.01, "bandpass", 2200 * scale, 500, 1.4, 0.24, 0.04, 0.02);
  },
  // Someone else's shot, heard from where it was fired.
  twang: (kit, t, scale) => {
    pluck(kit, t, 180 * scale, 0.22, 0.04);
    hiss(kit, t + 0.01, "bandpass", 2000 * scale, 500, 1.4, 0.22, 0.04, 0.02);
  },
  hit: (kit, t, scale, amount) => impact(kit, t, scale, amount),
  body: (kit, t, scale, amount) => impact(kit, t, scale, amount),
  // The hit tick plus a small bell.
  headshot: (kit, t, scale, amount) => {
    impact(kit, t, scale, amount);
    modes(kit, t, [1320, 3040, 4490], [0.4, 0.2, 0.1], [0.05, 0.02, 0.01], scale);
  },
  // Two plucked notes a fifth apart over a low thump.
  kill: (kit, t, scale) => {
    pluck(kit, t, 523 * scale, 0.35, 0.03);
    pluck(kit, t + 0.09, 784 * scale, 0.45, 0.03);
    tone(kit, t, "sine", 90, 45, 0.2, 0.12);
  },
  // An arrow sinking into wood: a dull knock, a click of splinters, and the shaft humming for a moment.
  wood: (kit, t, scale) => {
    modes(kit, t, [190, 440, 910], [0.12, 0.06, 0.035], [0.14, 0.06, 0.03], scale);
    hiss(kit, t, "lowpass", 2000, 600, 0.7, 0.02, 0.08, 0.001);
    tone(kit, t + 0.01, "triangle", 105 * scale, 100 * scale, 0.25, 0.025, 0.01);
  },
};
