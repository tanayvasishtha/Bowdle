import { describe, expect, it } from "vitest";
import { AUDIO_MIX } from "../render/look.ts";
import { cueAngle, footstepGain, layerMix, musicIntensity, strideLength } from "./spatial.ts";

describe("music intensity", () => {
  it("is calm in menus, low while exploring and full in a fight", () => {
    expect(musicIntensity("menu", true, 0)).toBe(0);
    expect(musicIntensity("practice", false, Number.POSITIVE_INFINITY)).toBe(AUDIO_MIX.exploreIntensity);
    expect(musicIntensity("match", false, Number.POSITIVE_INFINITY)).toBe(AUDIO_MIX.exploreIntensity);
    expect(musicIntensity("match", true, Number.POSITIVE_INFINITY)).toBe(1);
    expect(musicIntensity("match", false, AUDIO_MIX.combatAfterDamageMs - 1)).toBe(1);
    expect(musicIntensity("match", false, AUDIO_MIX.combatAfterDamageMs)).toBe(AUDIO_MIX.exploreIntensity);
  });

  it("adds percussion while exploring and the melody only in a fight", () => {
    const menu = layerMix(0), explore = layerMix(AUDIO_MIX.exploreIntensity), fight = layerMix(1);
    expect(menu).toEqual({ pad: AUDIO_MIX.padFloor, percussion: 0, melody: 0 });
    expect(explore.pad).toBe(1);
    expect(explore.percussion).toBeGreaterThan(0);
    expect(explore.melody).toBe(0);
    expect(fight).toEqual({ pad: 1, percussion: 1, melody: 1 });
    expect(layerMix(5)).toEqual(fight);
  });
});

describe("enemy footsteps", () => {
  const range = AUDIO_MIX.footstepRangeM, run = AUDIO_MIX.footstepRunSpeed;

  it("are silent for crouched, slow or far enemies", () => {
    expect(footstepGain(3, run + 1, true)).toBe(0);
    expect(footstepGain(3, 3, true)).toBe(0);
    expect(footstepGain(3, AUDIO_MIX.footstepMinSpeed - 0.1, false)).toBe(0);
    expect(footstepGain(range + 0.1, run + 1, false)).toBe(0);
  });

  it("are louder running than walking and fade with distance", () => {
    const running = footstepGain(6, run, false), walking = footstepGain(6, run - 1, false);
    expect(running).toBeCloseTo(1 - 6 / range, 9);
    expect(walking).toBeCloseTo(running * AUDIO_MIX.footstepWalkGain, 9);
    expect(footstepGain(12, run, false)).toBeLessThan(running);
    expect(strideLength(run)).toBeGreaterThan(strideLength(run - 1));
  });
});

describe("sound cue direction", () => {
  it("measures the angle from the view direction, positive to the right", () => {
    expect(cueAngle(0, 0, 0, 0, -10)).toBeCloseTo(0, 9);
    expect(cueAngle(0, 0, 0, 10, 0)).toBeCloseTo(Math.PI / 2, 9);
    expect(cueAngle(0, 0, 0, -10, 0)).toBeCloseTo(-Math.PI / 2, 9);
    expect(Math.abs(cueAngle(0, 0, 0, 0, 10))).toBeCloseTo(Math.PI, 9);
    expect(cueAngle(0, 0, Math.PI / 2, -10, 0)).toBeCloseTo(0, 9);
  });
});
