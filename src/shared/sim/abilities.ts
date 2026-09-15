import {
  EYE_CROUCH,
  EYE_STAND,
  GRAPPLE_COOLDOWN_MS,
  GRAPPLE_JUMP_BOOST,
  GRAPPLE_MAX_MS,
  GRAPPLE_MAX_PULL_SPEED,
  GRAPPLE_PULL_ACCEL,
  GRAPPLE_RANGE,
  GRAPPLE_RELEASE_DIST,
  GRAPPLE_SPEED,
  INK_CLOUD_COOLDOWN_MS,
  INK_CLOUD_SPEED,
} from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import type { MapData, Vec3Tuple } from "../maps/types.ts";
import type { PlayerSim } from "./movement.ts";

export type GrappleEvent = {
  type: "grapple";
  x: number; y: number; z: number;
  anchorX: number; anchorY: number; anchorZ: number;
  yaw: number; pitch: number; speed: number;
};

export type InkEvent = {
  type: "ink";
  x: number; y: number; z: number;
  yaw: number; pitch: number; speed: number;
};

export type AbilityEvent = GrappleEvent | InkEvent;

export type VisionSphere = { x: number; y: number; z: number; radius: number };

function held(buttons: number, button: number): boolean { return (buttons & button) !== 0; }
function pressed(buttons: number, previous: number, button: number): boolean { return held(buttons, button) && !held(previous, button); }

function rayBoxDistance(x: number, y: number, z: number, dx: number, dy: number, dz: number, min: Vec3Tuple, max: Vec3Tuple): number | null {
  let near = 0;
  let far = GRAPPLE_RANGE;
  for (let axis = 0; axis < 3; axis += 1) {
    const origin = axis === 0 ? x : axis === 1 ? y : z;
    const direction = axis === 0 ? dx : axis === 1 ? dy : dz;
    if (Math.abs(direction) < Number.EPSILON) {
      if (origin < min[axis]! || origin > max[axis]!) return null;
      continue;
    }
    const a = (min[axis]! - origin) / direction;
    const b = (max[axis]! - origin) / direction;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return near >= 0 && near <= GRAPPLE_RANGE ? near : null;
}

export function tryAttachGrapple(state: PlayerSim, input: PlayerInputFrame, map: MapData): GrappleEvent | null {
  const cosPitch = Math.cos(input.pitch);
  const dx = -Math.sin(input.yaw) * cosPitch;
  const dy = Math.sin(input.pitch);
  const dz = -Math.cos(input.yaw) * cosPitch;
  const eyeY = state.y + (state.crouched ? EYE_CROUCH : EYE_STAND);
  let distance = Number.POSITIVE_INFINITY;
  for (const box of map.boxes) {
    if (!box.tags.includes("grapple")) continue;
    const hit = rayBoxDistance(state.x, eyeY, state.z, dx, dy, dz, box.min, box.max);
    if (hit !== null && hit < distance) distance = hit;
  }
  if (!Number.isFinite(distance)) return null;
  state.grappleActive = true;
  state.grappleX = state.x + dx * distance;
  state.grappleY = eyeY + dy * distance;
  state.grappleZ = state.z + dz * distance;
  state.grappleMs = 0;
  return {
    type: "grapple", x: state.x, y: state.y, z: state.z,
    anchorX: state.grappleX, anchorY: state.grappleY, anchorZ: state.grappleZ,
    yaw: input.yaw, pitch: input.pitch, speed: GRAPPLE_SPEED,
  };
}

export function releaseGrapple(state: PlayerSim, jump: boolean): void {
  if (!state.grappleActive) return;
  state.grappleActive = false;
  state.grappleMs = 0;
  if (jump) state.vy += GRAPPLE_JUMP_BOOST;
}

export function stepAbilityInput(state: PlayerSim, input: PlayerInputFrame, map: MapData, tickMs: number): AbilityEvent[] {
  const events: AbilityEvent[] = [];
  state.grappleCooldownMs = Math.max(0, state.grappleCooldownMs - tickMs);
  state.inkCooldownMs = Math.max(0, state.inkCooldownMs - tickMs);
  const grapplePressed = pressed(input.buttons, state.prevButtons, BTN.GRAPPLE);
  if (grapplePressed && state.grappleActive) releaseGrapple(state, false);
  else if (grapplePressed && state.grappleCooldownMs <= 0) {
    state.grappleCooldownMs = GRAPPLE_COOLDOWN_MS;
    const event = tryAttachGrapple(state, input, map);
    if (event) events.push(event);
  }
  if (state.grappleActive && pressed(input.buttons, state.prevButtons, BTN.JUMP)) releaseGrapple(state, true);
  if (pressed(input.buttons, state.prevButtons, BTN.INK) && state.inkCooldownMs <= 0) {
    state.inkCooldownMs = INK_CLOUD_COOLDOWN_MS;
    events.push({ type: "ink", x: state.x, y: state.y, z: state.z, yaw: input.yaw, pitch: input.pitch, speed: INK_CLOUD_SPEED });
  }
  return events;
}

export function stepGrapplePull(state: PlayerSim, dt: number, dtMs: number): void {
  if (!state.grappleActive) return;
  state.grappleMs += dtMs;
  let dx = state.grappleX - state.x, dy = state.grappleY - (state.y + state.height * 0.5), dz = state.grappleZ - state.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= 0 || distance <= GRAPPLE_RELEASE_DIST || state.grappleMs >= GRAPPLE_MAX_MS) { releaseGrapple(state, false); return; }
  dx /= distance; dy /= distance; dz /= distance;
  const toward = state.vx * dx + state.vy * dy + state.vz * dz;
  const added = Math.min(GRAPPLE_PULL_ACCEL * dt, Math.max(0, GRAPPLE_MAX_PULL_SPEED - toward));
  state.vx += dx * added; state.vy += dy * added; state.vz += dz * added;
}

export function sphereBlocksSight(from: VisionSphere, to: VisionSphere, cloud: VisionSphere): boolean {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  if (lengthSq <= 0) return false;
  const t = Math.max(0, Math.min(1, ((cloud.x - from.x) * dx + (cloud.y - from.y) * dy + (cloud.z - from.z) * dz) / lengthSq));
  const x = from.x + dx * t - cloud.x, y = from.y + dy * t - cloud.y, z = from.z + dz * t - cloud.z;
  return x * x + y * y + z * z <= cloud.radius * cloud.radius;
}
