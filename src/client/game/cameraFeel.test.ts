import { describe, expect, it } from "vitest";
import { CAMERA_FEEL as F } from "../render/look.ts";
import { CameraFeel, type FeelInput, type FeelOutput } from "./cameraFeel.ts";

const base: FeelInput = { speed: 0, grounded: true, sliding: false, strafe: 0, dtMs: 16, reduceMotion: false };
function run(feel: CameraFeel, input: Partial<FeelInput>, frames: number): FeelOutput {
  let out = feel.update({ ...base, ...input });
  for (let frame = 1; frame < frames; frame += 1) out = feel.update({ ...base, ...input });
  return { ...out };
}

describe("camera feel", () => {
  it("widens the view with speed up to the cap and not at run speed", () => {
    expect(run(new CameraFeel(), { speed: 8 }, 120).fovOffset).toBeCloseTo(0, 5);
    expect(run(new CameraFeel(), { speed: 12 }, 240).fovOffset).toBeCloseTo(4.8, 1);
    expect(run(new CameraFeel(), { speed: 40 }, 240).fovOffset).toBeCloseTo(F.speedFovMax, 1);
  });

  it("bobs only while running on the ground", () => {
    const feel = new CameraFeel();
    let moved = 0;
    for (let frame = 0; frame < 120; frame += 1) moved = Math.max(moved, Math.abs(feel.update({ ...base, speed: 8 }).offsetY));
    expect(moved).toBeGreaterThan(0.01);
    expect(Math.abs(run(new CameraFeel(), { speed: 8, grounded: false }, 120).offsetY)).toBeLessThan(1e-6);
    expect(Math.abs(run(new CameraFeel(), { speed: 12, sliding: true }, 120).offsetY)).toBeLessThan(1e-6);
  });

  it("rolls away from the strafe direction and further while sliding", () => {
    expect(run(new CameraFeel(), { strafe: 1 }, 120).rollDeg).toBeCloseTo(-F.strafeRollDeg, 2);
    expect(run(new CameraFeel(), { strafe: -1 }, 120).rollDeg).toBeCloseTo(F.strafeRollDeg, 2);
    expect(run(new CameraFeel(), { sliding: true }, 120).rollDeg).toBeCloseTo(F.slideRollDeg, 2);
  });

  it("dips on landing and recovers within the recover time", () => {
    const feel = new CameraFeel();
    feel.land(10);
    expect(feel.update({ ...base, dtMs: 1 }).offsetY).toBeCloseTo(-0.12, 2);
    expect(run(feel, {}, Math.ceil(F.dipRecoverMs / 16) + 1).offsetY).toBeCloseTo(0, 5);
    feel.land(100);
    expect(feel.update({ ...base, dtMs: 1 }).offsetY).toBeCloseTo(-F.dipMax, 2);
  });

  it("kicks the FOV and decays the kick", () => {
    const feel = new CameraFeel();
    feel.kickFov("dodge");
    expect(feel.update({ ...base, dtMs: 1 }).fovOffset).toBeGreaterThan(3.9);
    expect(run(feel, {}, 30).fovOffset).toBeCloseTo(0, 5);
  });

  it("shakes only on hard landings and hits, capped, then settles", () => {
    const soft = new CameraFeel();
    soft.land(5);
    expect(run(soft, {}, 1).shakePitchDeg).toBe(0);
    const feel = new CameraFeel();
    feel.land(30); feel.hurt(100); feel.hurt(100);
    let peak = 0;
    for (let frame = 0; frame < 20; frame += 1) { const out = feel.update(base); peak = Math.max(peak, Math.abs(out.shakePitchDeg), Math.abs(out.shakeYawDeg)); }
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThanOrEqual(F.shakeMax * F.shakeAmplitudeDeg + 1e-9);
    const settled = run(feel, {}, 300);
    expect(Math.abs(settled.shakePitchDeg) + Math.abs(settled.shakeYawDeg)).toBe(0);
  });

  it("fades the hurt vignette and shows streaks only at high speed", () => {
    const feel = new CameraFeel();
    feel.hurt(50);
    expect(feel.update({ ...base, dtMs: 1 }).hurt).toBeCloseTo(0.3, 2);
    expect(run(feel, {}, 30).hurt).toBe(0);
    expect(run(new CameraFeel(), { speed: 12 }, 1).streaks).toBe(0);
    expect(run(new CameraFeel(), { speed: 25 }, 1).streaks).toBeCloseTo(F.streakAlpha, 5);
  });

  it("zeroes every motion effect with reduce motion but keeps the hurt tint", () => {
    const feel = new CameraFeel();
    feel.kickFov("jump"); feel.land(30); feel.hurt(80);
    const out = run(feel, { speed: 25, strafe: 1, sliding: true, reduceMotion: true }, 10);
    expect([out.fovOffset, out.offsetX, out.offsetY, out.rollDeg, out.shakePitchDeg, out.shakeYawDeg, out.streaks]).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(out.hurt).toBeGreaterThan(0);
  });
});
