import { describe, expect, it } from "vitest";
import { EYE_CROUCH, EYE_STAND, HEAD_RADIUS } from "../../../shared/constants.ts";
import { CHARACTER_LOOK as C } from "../look.ts";
import { createMotion, createPose, headCenter, headTargetY, locomotionFor, poseInto, upperBodyFor, type CharacterMotion, type Locomotion } from "./pose.ts";

function motion(overrides: Partial<CharacterMotion>): CharacterMotion {
  return { ...createMotion(), ...overrides };
}

const LOCOMOTION: Record<Exclude<Locomotion, "dead">, Partial<CharacterMotion>> = {
  idle: {},
  run: { speed: 8 },
  crouch: { crouched: true },
  crouchWalk: { crouched: true, speed: 4 },
  slide: { sliding: true, speed: 10 },
  jump: { grounded: false, verticalSpeed: 5 },
  fall: { grounded: false, verticalSpeed: -3 },
  wade: { wading: true, speed: 5 },
  zip: { zipping: true, grounded: false },
};

const ACTIONS: readonly Partial<CharacterMotion>[] = [
  {},
  { drawing: true, drawFraction: 1, pitch: 0.5 },
  { drawing: true, drawFraction: 0.3, pitch: -0.9 },
  { stabT: 0.4 },
  { grappling: true },
];

const GROUNDED: readonly (keyof typeof LOCOMOTION)[] = ["idle", "run", "crouch", "crouchWalk", "slide", "wade"];

describe("character state", () => {
  it("picks locomotion from the motion", () => {
    for (const [name, overrides] of Object.entries(LOCOMOTION)) expect(locomotionFor(motion(overrides))).toBe(name);
    expect(locomotionFor(motion({ alive: false, speed: 8 }))).toBe("dead");
  });

  it("gives upper body actions a fixed priority", () => {
    expect(upperBodyFor(motion({}))).toBe("hold");
    expect(upperBodyFor(motion({ drawing: true }))).toBe("draw");
    expect(upperBodyFor(motion({ drawing: true, grappling: true }))).toBe("grapple");
    expect(upperBodyFor(motion({ drawing: true, stabT: 0.2 }))).toBe("stab");
    expect(upperBodyFor(motion({ drawing: true, zipping: true }))).toBe("hang");
    expect(upperBodyFor(motion({ alive: false, drawing: true }))).toBe("limp");
  });
});

describe("poseInto", () => {
  it("keeps the drawn head on the head hitbox in every living pose", () => {
    const pose = createPose();
    for (const [name, locomotion] of Object.entries(LOCOMOTION)) {
      for (const action of ACTIONS) {
        for (const time of [0, 0.13, 0.41, 0.77]) {
          const current = motion({ ...locomotion, ...action });
          poseInto(pose, current, time);
          const head = headCenter(pose);
          const error = Math.hypot(head.forward, head.up - headTargetY(locomotionFor(current)));
          expect(error, `${name} at ${time}s`).toBeLessThan(HEAD_RADIUS * 0.3);
        }
      }
    }
  });

  it("aims the head at the standing or crouched hitbox", () => {
    expect(headTargetY("idle")).toBeCloseTo(EYE_STAND + C.headAboveEye, 6);
    expect(headTargetY("crouch")).toBeCloseTo(EYE_CROUCH + C.headAboveEye, 6);
    expect(headTargetY("slide")).toBeCloseTo(EYE_CROUCH + C.headAboveEye, 6);
  });

  it("keeps grounded hips low enough for the feet to reach the floor", () => {
    const pose = createPose();
    for (const name of GROUNDED) {
      poseInto(pose, motion(LOCOMOTION[name]), 0.2);
      expect(pose.rootY - C.hipDrop, name).toBeLessThanOrEqual(C.thigh + C.shin + 0.02);
      expect(pose.rootY, name).toBeGreaterThan(0.15);
    }
  });

  it("swings the legs in opposition while running", () => {
    const pose = createPose();
    const halfStride = 1 / (2 * (C.strideBaseHz + 8 * C.strideHzPerMps));
    poseInto(pose, motion({ speed: 8 }), 0.1);
    const first = pose.leftLeg.pitch - pose.rightLeg.pitch;
    poseInto(pose, motion({ speed: 8 }), 0.1 + halfStride);
    const second = pose.leftLeg.pitch - pose.rightLeg.pitch;
    expect(Math.sign(first)).toBe(-Math.sign(second));
    expect(Math.abs(first)).toBeGreaterThan(0.2);
  });

  it("pulls the string with the draw and raises the bow to aim", () => {
    const pose = createPose();
    poseInto(pose, motion({ drawing: true, drawFraction: 0.25 }), 0);
    expect(pose.bowPull).toBeCloseTo(0.25, 6);
    expect(pose.gripPitch).toBe(0);
    poseInto(pose, motion({ drawing: true, drawFraction: 1 }), 0);
    expect(pose.bowPull).toBe(1);
    poseInto(pose, motion({}), 0);
    expect(pose.bowPull).toBe(0);
    const carried = pose.leftArm.pitch - pose.lean + pose.leftArm.bend + pose.gripPitch;
    expect(carried).toBeCloseTo(-Math.PI / 2 + C.carryTilt, 6);
  });

  it("raises the bow arm further when looking up", () => {
    const pose = createPose();
    poseInto(pose, motion({ drawing: true, drawFraction: 1, pitch: 0 }), 0);
    const level = pose.leftArm.pitch;
    poseInto(pose, motion({ drawing: true, drawFraction: 1, pitch: 0.6 }), 0);
    expect(pose.leftArm.pitch).toBeGreaterThan(level);
  });

  it("shows the dagger only while stabbing", () => {
    const pose = createPose();
    poseInto(pose, motion({ stabT: 0.5 }), 0);
    expect(pose.dagger).toBe(1);
    poseInto(pose, motion({}), 0);
    expect(pose.dagger).toBe(0);
  });

  it("fills the pose it was given", () => {
    const pose = createPose();
    expect(poseInto(pose, motion({ speed: 3 }), 1)).toBe(pose);
  });
});
