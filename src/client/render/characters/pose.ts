import { EYE_CROUCH, EYE_STAND } from "../../../shared/constants.ts";
import { CHARACTER_LOOK as C } from "../look.ts";

/** Everything the animation needs to know about one player on one frame. */
export type CharacterMotion = {
  speed: number;
  verticalSpeed: number;
  grounded: boolean;
  crouched: boolean;
  sliding: boolean;
  drawing: boolean;
  drawFraction: number;
  stabT: number;
  grappling: boolean;
  zipping: boolean;
  wading: boolean;
  alive: boolean;
  pitch: number;
};

export type Locomotion = "idle" | "run" | "crouch" | "crouchWalk" | "slide" | "jump" | "fall" | "wade" | "zip" | "dead";
export type UpperBody = "hold" | "draw" | "stab" | "grapple" | "hang" | "limp";

/** Angles in radians. Arm pitch > 0 swings the arm forward, roll > 0 lifts it away from the body,
 *  yaw turns it around the vertical axis, bend > 0 folds the elbow. Leg pitch > 0 swings the leg
 *  forward, bend > 0 folds the knee backward. Lean > 0 tips the torso forward, headPitch > 0 looks up. */
export type ArmPose = { pitch: number; yaw: number; roll: number; bend: number };
export type LegPose = { pitch: number; roll: number; bend: number };

export type Pose = {
  rootY: number;
  rootZ: number;
  lean: number;
  spineYaw: number;
  spineRoll: number;
  headPitch: number;
  leftArm: ArmPose;
  rightArm: ArmPose;
  leftLeg: LegPose;
  rightLeg: LegPose;
  gripPitch: number;
  bowPull: number;
  dagger: number;
};

const MOVING_SPEED = 0.6;
const RISING_SPEED = 0.5;
const TAU = Math.PI * 2;

export function createMotion(): CharacterMotion {
  return {
    speed: 0, verticalSpeed: 0, grounded: true, crouched: false, sliding: false, drawing: false,
    drawFraction: 0, stabT: 0, grappling: false, zipping: false, wading: false, alive: true, pitch: 0,
  };
}

export function createPose(): Pose {
  return {
    rootY: C.hipHeight, rootZ: 0, lean: 0, spineYaw: 0, spineRoll: 0, headPitch: 0,
    leftArm: { pitch: 0, yaw: 0, roll: 0, bend: 0 }, rightArm: { pitch: 0, yaw: 0, roll: 0, bend: 0 },
    leftLeg: { pitch: 0, roll: 0, bend: 0 }, rightLeg: { pitch: 0, roll: 0, bend: 0 },
    gripPitch: -Math.PI / 2 + C.carryTilt, bowPull: 0, dagger: 0,
  };
}

export function locomotionFor(motion: CharacterMotion): Locomotion {
  if (!motion.alive) return "dead";
  if (motion.zipping) return "zip";
  if (motion.sliding) return "slide";
  if (!motion.grounded) return motion.verticalSpeed > RISING_SPEED ? "jump" : "fall";
  if (motion.wading) return "wade";
  const moving = motion.speed > MOVING_SPEED;
  if (motion.crouched) return moving ? "crouchWalk" : "crouch";
  return moving ? "run" : "idle";
}

export function upperBodyFor(motion: CharacterMotion): UpperBody {
  if (!motion.alive) return "limp";
  if (motion.zipping) return "hang";
  if (motion.stabT > 0) return "stab";
  if (motion.grappling) return "grapple";
  if (motion.drawing) return "draw";
  return "hold";
}

export function isLowStance(locomotion: Locomotion): boolean {
  return locomotion === "crouch" || locomotion === "crouchWalk" || locomotion === "slide";
}

/** Height of the head hitbox center above the feet (see src/shared/sim/hitboxes.ts). */
export function headTargetY(locomotion: Locomotion): number {
  return (isLowStance(locomotion) ? EYE_CROUCH : EYE_STAND) + C.headAboveEye;
}

/** Head center relative to the feet, from the same chain the rig uses. forward > 0 is in front. */
export function headCenter(pose: Pose): { forward: number; up: number } {
  const neckTilt = pose.lean - pose.headPitch;
  const forward = C.torsoLength * Math.sin(pose.lean) + C.headRadius * Math.sin(neckTilt) - pose.rootZ;
  const up = pose.rootY + C.pelvisHeight + C.torsoLength * Math.cos(pose.lean) + C.headRadius * Math.cos(neckTilt);
  return { forward, up };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ease(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function setArm(arm: ArmPose, pitch: number, yaw: number, roll: number, bend: number): void {
  arm.pitch = pitch; arm.yaw = yaw; arm.roll = roll; arm.bend = bend;
}

function setLeg(leg: LegPose, pitch: number, roll: number, bend: number): void {
  leg.pitch = pitch; leg.roll = roll; leg.bend = bend;
}

/** Two-bone leg IK in the side view: put the foot at (forward, down) from the hip joint. */
function reach(leg: LegPose, forward: number, down: number): void {
  const a = C.thigh, b = C.shin;
  const distance = clamp(Math.hypot(forward, down), 0.05, a + b - 1e-4);
  const kneeInterior = Math.acos(clamp((a * a + b * b - distance * distance) / (2 * a * b), -1, 1));
  const thighOffset = Math.acos(clamp((a * a + distance * distance - b * b) / (2 * a * distance), -1, 1));
  leg.pitch = Math.atan2(forward, down) + thighOffset;
  leg.bend = Math.PI - kneeInterior;
  leg.roll = 0;
}

function strideHz(speed: number): number {
  return C.strideBaseHz + speed * C.strideHzPerMps;
}

function applyLegs(pose: Pose, locomotion: Locomotion, motion: CharacterMotion, time: number): void {
  const hipY = pose.rootY - C.hipDrop;
  const plant = (leg: LegPose, footForward: number, lift: number): void => reach(leg, footForward + pose.rootZ, Math.max(0.05, hipY - lift));
  switch (locomotion) {
    case "idle":
    case "crouch":
      plant(pose.leftLeg, 0.05, 0);
      plant(pose.rightLeg, -0.05, 0);
      return;
    case "run":
    case "crouchWalk":
    case "wade": {
      const scale = locomotion === "run" ? 1 : locomotion === "wade" ? C.wadeStrideScale : C.crouchStrideScale;
      const amount = clamp(motion.speed / 8, 0.25, 1.2) * scale;
      const phase = time * strideHz(motion.speed) * TAU;
      const left = Math.sin(phase), right = -left;
      plant(pose.leftLeg, left * C.strideLength * amount, Math.max(0, Math.cos(phase)) * C.strideLift * amount);
      plant(pose.rightLeg, right * C.strideLength * amount, Math.max(0, -Math.cos(phase)) * C.strideLift * amount);
      return;
    }
    case "slide":
      plant(pose.leftLeg, 0.75, 0.08);
      plant(pose.rightLeg, -0.1, 0);
      return;
    case "jump":
      setLeg(pose.leftLeg, 0.9, 0.05, 1.4);
      setLeg(pose.rightLeg, 0.3, 0.05, 0.9);
      return;
    case "fall":
      setLeg(pose.leftLeg, 0.35, 0.12, 0.35);
      setLeg(pose.rightLeg, -0.15, 0.12, 0.5);
      return;
    case "zip": {
      const swing = Math.sin(time * C.zipSwingHz * TAU) * 0.25;
      setLeg(pose.leftLeg, 0.25 + swing, 0.05, 0.45);
      setLeg(pose.rightLeg, 0.15 + swing, 0.05, 0.6);
      return;
    }
    case "dead":
      setLeg(pose.leftLeg, 0.3, 0.2, 0.3);
      setLeg(pose.rightLeg, -0.1, 0.2, 0.2);
      return;
  }
}

function applyArms(pose: Pose, upper: UpperBody, locomotion: Locomotion, motion: CharacterMotion, time: number): void {
  const running = locomotion === "run" || locomotion === "crouchWalk" || locomotion === "wade";
  const swing = running ? Math.sin(time * strideHz(motion.speed) * TAU) * clamp(motion.speed / 8, 0, 1) : 0;
  const breath = Math.sin(time * C.breathHz * TAU) * 0.03;
  // Arms hang from the spine, so they inherit the lean. Add it back to keep arm angles relative to the world.
  const lean = pose.lean;
  const look = clamp(motion.pitch, -1.2, 1.2);
  pose.bowPull = 0;
  pose.dagger = 0;
  const holdBow = (): void => setArm(pose.leftArm, 0.45 - swing * 0.35 + lean + breath, 0, 0.12, 0.6);
  switch (upper) {
    case "hold":
      holdBow();
      setArm(pose.rightArm, 0.1 + swing * 0.55 + lean - breath, 0, 0.12, 0.35 + Math.abs(swing) * 0.5);
      break;
    case "draw": {
      const pull = clamp(motion.drawFraction, 0, 1);
      pose.spineYaw = C.drawTwist;
      pose.gripPitch = 0;
      pose.bowPull = pull;
      setArm(pose.leftArm, Math.PI / 2 + look + lean, -C.drawTwist, 0, 0.05);
      setArm(pose.rightArm, Math.PI / 2 + look + lean - 0.1, -C.drawTwist - 0.35 - pull * 0.25, 0.25, 1.7 + pull * 0.7);
      return;
    }
    case "stab": {
      const thrust = ease(motion.stabT * 2) * (1 - ease((motion.stabT - 0.5) * 2) * 0.6);
      pose.dagger = 1;
      holdBow();
      setArm(pose.rightArm, 0.3 + thrust * 1.35 + lean, 0.1, 0.1, 1.5 - thrust * 1.4);
      break;
    }
    case "grapple":
      holdBow();
      setArm(pose.rightArm, 2.5 + lean, 0.1, 0.15, 0.2);
      break;
    case "hang":
      setArm(pose.leftArm, Math.PI + lean, 0, 0.15, 0.2);
      setArm(pose.rightArm, Math.PI + lean, 0, 0.15, 0.2);
      break;
    case "limp":
      setArm(pose.leftArm, 0.15 + lean, 0, 0.35, 0.4);
      setArm(pose.rightArm, 0.1 + lean, 0, 0.4, 0.5);
      break;
  }
  pose.gripPitch = carryGripPitch(pose.leftArm, lean);
}

/** Grip angle that keeps a carried bow upright beside the archer, whatever the bow arm is doing. */
export function carryGripPitch(bowArm: ArmPose, lean: number): number {
  const forearmPitch = bowArm.pitch - lean + bowArm.bend;
  return -Math.PI / 2 - forearmPitch + C.carryTilt;
}

function leanFor(locomotion: Locomotion, upper: UpperBody, motion: CharacterMotion): number {
  let lean = 0;
  if (locomotion === "run") lean = C.runLean * clamp(motion.speed / 8, 0, 1.2);
  else if (locomotion === "crouch" || locomotion === "crouchWalk") lean = C.crouchLean;
  else if (locomotion === "slide") lean = C.slideLean;
  else if (locomotion === "jump") lean = 0.1;
  else if (locomotion === "dead") lean = 0.25;
  if (upper === "draw") lean += C.drawLean;
  return lean;
}

/** Fill `out` with the pose for this motion at `time` seconds. Allocation-free after the first call. */
export function poseInto(out: Pose, motion: CharacterMotion, time: number): Pose {
  const locomotion = locomotionFor(motion);
  const upper = upperBodyFor(motion);
  out.spineYaw = 0;
  out.spineRoll = locomotion === "dead" ? 0.2 : 0;
  out.lean = leanFor(locomotion, upper, motion);
  const look = clamp(motion.pitch, -C.maxHeadPitch, C.maxHeadPitch);
  out.headPitch = locomotion === "dead" ? -0.3 : look * (upper === "draw" ? 0.4 : 0.6);
  // Settle the root so the drawn head lands on the head hitbox, whatever the lean.
  const neckTilt = out.lean - out.headPitch;
  out.rootZ = C.torsoLength * Math.sin(out.lean) + C.headRadius * Math.sin(neckTilt);
  const bob = locomotion === "run" ? Math.abs(Math.sin(time * strideHz(motion.speed) * TAU)) * 0.03 : 0;
  out.rootY = headTargetY(locomotion) - C.pelvisHeight - C.torsoLength * Math.cos(out.lean) - C.headRadius * Math.cos(neckTilt) - bob;
  applyLegs(out, locomotion, motion, time);
  applyArms(out, upper, locomotion, motion, time);
  return out;
}
