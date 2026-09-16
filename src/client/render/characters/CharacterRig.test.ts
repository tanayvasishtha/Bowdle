import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { MELEE_COOLDOWN_MS } from "../../../shared/constants.ts";
import { createPlayerSim } from "../../../shared/sim/movement.ts";
import { CharacterRig } from "./CharacterRig.ts";
import { motionFromSim, stabProgress } from "./motion.ts";
import { createMotion, headCenter, type CharacterMotion } from "./pose.ts";

const POSES: readonly Partial<CharacterMotion>[] = [
  {},
  { speed: 8 },
  { crouched: true },
  { sliding: true, speed: 10 },
  { drawing: true, drawFraction: 1, pitch: 0.4 },
  { zipping: true, grounded: false },
];

describe("CharacterRig", () => {
  it("builds every crew for a handful of draw calls", () => {
    for (const kind of ["sun", "moon", "dummy"] as const) {
      const rig = new CharacterRig(kind);
      expect(rig.drawCalls, kind).toBeGreaterThanOrEqual(5);
      expect(rig.drawCalls, kind).toBeLessThanOrEqual(7);
    }
  });

  it("places the drawn head exactly where the pose math puts it", () => {
    for (const kind of ["sun", "moon"] as const) {
      const rig = new CharacterRig(kind);
      const head = new Vector3();
      for (const overrides of POSES) {
        rig.setMotion({ ...createMotion(), ...overrides });
        rig.update(0.3);
        rig.headWorld(head);
        const expected = headCenter(rig.pose);
        expect(head.y).toBeCloseTo(expected.up, 3);
        expect(-head.z).toBeCloseTo(expected.forward, 3);
        expect(head.x).toBeCloseTo(0, 3);
      }
    }
  });

  it("follows the rig's world position and facing", () => {
    const rig = new CharacterRig("moon");
    rig.position.set(4, 1, -2);
    rig.rotation.y = Math.PI / 2;
    rig.update(0);
    const head = rig.headWorld(new Vector3());
    expect(head.x).toBeCloseTo(4, 2);
    expect(head.z).toBeCloseTo(-2, 2);
    expect(head.y).toBeGreaterThan(2.5);
  });
});

describe("motionFromSim", () => {
  it("reads animation state from a player simulation", () => {
    const sim = createPlayerSim();
    sim.vx = 3; sim.vz = 4; sim.drawMs = 10_000; sim.crouched = true; sim.zipId = "zip-a";
    const motion = motionFromSim(createMotion(), sim, true);
    expect(motion.speed).toBeCloseTo(5, 6);
    expect(motion.drawing).toBe(true);
    expect(motion.drawFraction).toBe(1);
    expect(motion.crouched).toBe(true);
    expect(motion.zipping).toBe(true);
    expect(motion.wading).toBe(true);
  });

  it("runs the stab animation right after a stab starts", () => {
    expect(stabProgress(0)).toBe(0);
    expect(stabProgress(MELEE_COOLDOWN_MS)).toBeGreaterThan(0);
    expect(stabProgress(MELEE_COOLDOWN_MS - 100)).toBeGreaterThan(stabProgress(MELEE_COOLDOWN_MS));
    expect(stabProgress(MELEE_COOLDOWN_MS - 400)).toBe(0);
  });
});
