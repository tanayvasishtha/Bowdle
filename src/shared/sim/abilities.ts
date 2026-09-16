import {
  EYE_CROUCH,
  EYE_STAND,
  ARROW_SPAWN_FORWARD,
  GRAPPLE,
  GRAPPLE_COOLDOWN_MS,
  GRAPPLE_RANGE,
  GRAPPLE_SPEED,
  GRAVITY,
  INK_CLOUD_COOLDOWN_MS,
  INK_CLOUD_SPEED,
  VINE_HOP,
} from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import type { MapData, Vec3Tuple } from "../maps/types.ts";
import { movePlayer } from "./collision.ts";
import type { PlayerSim } from "./movement.ts";
import type { ArrowSim } from "./arrows.ts";

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
type VisionPoint = { x: number; y: number; z: number };

export function spawnAbilityProjectile(event: GrappleEvent | InkEvent, crouched: boolean): ArrowSim {
  const cosPitch = Math.cos(event.pitch);
  const dx = -Math.sin(event.yaw) * cosPitch, dy = Math.sin(event.pitch), dz = -Math.cos(event.yaw) * cosPitch;
  return {
    x: event.x + dx * ARROW_SPAWN_FORWARD,
    y: event.y + (crouched ? EYE_CROUCH : EYE_STAND) + dy * ARROW_SPAWN_FORWARD,
    z: event.z + dz * ARROW_SPAWN_FORWARD,
    vx: dx * event.speed, vy: dy * event.speed, vz: dz * event.speed,
    damage: 0, ageMs: 0, stuck: false,
  };
}

function held(buttons: number, button: number): boolean { return (buttons & button) !== 0; }
function pressed(buttons: number, previous: number, button: number): boolean { return held(buttons, button) && !held(previous, button); }

function rayBoxDistance(x: number, y: number, z: number, dx: number, dy: number, dz: number, min: Vec3Tuple, max: Vec3Tuple, length = GRAPPLE_RANGE): number | null {
  let near = 0;
  let far = length;
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
  return near >= 0 && near <= length ? near : null;
}

export function tryAttachGrapple(state: PlayerSim, input: PlayerInputFrame, map: MapData): GrappleEvent | null {
  const cosPitch = Math.cos(input.pitch);
  const dx = -Math.sin(input.yaw) * cosPitch;
  const dy = Math.sin(input.pitch);
  const dz = -Math.cos(input.yaw) * cosPitch;
  const eyeY = state.y + (state.crouched ? EYE_CROUCH : EYE_STAND);
  let distance = Number.POSITIVE_INFINITY;
  let grappleHit = false;
  for (const box of map.boxes) {
    if (!box.tags.includes("solid")) continue;
    const hit = rayBoxDistance(state.x, eyeY, state.z, dx, dy, dz, box.min, box.max);
    if (hit !== null && hit < distance) { distance = hit; grappleHit = box.tags.includes("grapple"); }
  }
  if (!Number.isFinite(distance) || !grappleHit) return null;
  state.grappleActive = true;
  state.grappleX = state.x + dx * distance;
  state.grappleY = eyeY + dy * distance;
  state.grappleZ = state.z + dz * distance;
  state.grappleMs = 0;
  state.grappleBlockedMs = 0;
  state.grappleReeling = true;
  state.grappleLen = Math.max(GRAPPLE.minLength, ropeDistance(state) * GRAPPLE.lengthFactor);
  return {
    type: "grapple", x: state.x, y: state.y, z: state.z,
    anchorX: state.grappleX, anchorY: state.grappleY, anchorZ: state.grappleZ,
    yaw: input.yaw, pitch: input.pitch, speed: GRAPPLE_SPEED,
  };
}

function ropeDistance(state: PlayerSim): number {
  return Math.hypot(state.grappleX - state.x, state.grappleY - (state.y + state.height * 0.5), state.grappleZ - state.z);
}

/** Detaches the rope. A launch adds speed along the current velocity and upward, and gives the vine hop back. */
export function releaseGrapple(state: PlayerSim, launch: boolean): void {
  if (!state.grappleActive) return;
  state.grappleActive = false;
  state.grappleReeling = false;
  state.grappleMs = 0;
  state.grappleBlockedMs = 0;
  state.grappleCooldownMs = GRAPPLE_COOLDOWN_MS;
  if (!launch) return;
  const speed = Math.hypot(state.vx, state.vy, state.vz);
  if (speed > 0.01) {
    const scale = (speed + GRAPPLE.launchAlong) / speed;
    state.vx *= scale; state.vy *= scale; state.vz *= scale;
  }
  state.vy += GRAPPLE.launchUp;
  state.airJumps = VINE_HOP.perAirtime;
  state.grounded = false;
}

export function stepAbilityInput(state: PlayerSim, input: PlayerInputFrame, map: MapData, tickMs: number): AbilityEvent[] {
  const events: AbilityEvent[] = [];
  if (!state.grappleActive) state.grappleCooldownMs = Math.max(0, state.grappleCooldownMs - tickMs);
  state.inkCooldownMs = Math.max(0, state.inkCooldownMs - tickMs);
  const grapplePressed = pressed(input.buttons, state.prevButtons, BTN.GRAPPLE);
  if (grapplePressed && state.zipId) { state.zipId = ""; state.zipT = 0; }
  if (state.grappleActive) {
    // Hold to reel, let go to swing. Jump launches off the rope, crouch just lets go.
    state.grappleReeling = held(input.buttons, BTN.GRAPPLE);
    if (pressed(input.buttons, state.prevButtons, BTN.JUMP)) releaseGrapple(state, true);
    else if (pressed(input.buttons, state.prevButtons, BTN.CROUCH)) releaseGrapple(state, false);
  } else if (grapplePressed && state.grappleCooldownMs <= 0 && !state.relicCarrier) {
    const event = tryAttachGrapple(state, input, map);
    if (event) events.push(event);
    else state.grappleCooldownMs = GRAPPLE.missCooldownMs;
  }
  if (pressed(input.buttons, state.prevButtons, BTN.INK) && state.inkCooldownMs <= 0) {
    state.inkCooldownMs = INK_CLOUD_COOLDOWN_MS;
    events.push({ type: "ink", x: state.x, y: state.y, z: state.z, yaw: input.yaw, pitch: input.pitch, speed: INK_CLOUD_SPEED });
  }
  return events;
}

/**
 * Rope forces for one substep, applied after gravity and before the body moves.
 * wishX and wishZ are the normalized horizontal input direction, zero when there is none.
 */
export function stepGrappleForces(state: PlayerSim, dt: number, dtMs: number, wishX: number, wishZ: number): void {
  if (!state.grappleActive) return;
  state.grappleMs += dtMs;
  let dx = state.grappleX - state.x, dy = state.grappleY - (state.y + state.height * 0.5), dz = state.grappleZ - state.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= GRAPPLE.releaseDist || state.grappleMs >= GRAPPLE.maxMs) { releaseGrapple(state, false); return; }
  dx /= distance; dy /= distance; dz /= distance;
  state.vy += GRAVITY * (1 - GRAPPLE.swingGravityMult) * dt;
  if (state.grappleReeling) {
    state.grappleLen = Math.max(GRAPPLE.releaseDist, Math.min(state.grappleLen, distance) - GRAPPLE.reelSpeed * dt);
    const toward = state.vx * dx + state.vy * dy + state.vz * dz;
    const added = Math.min(GRAPPLE.pullAccel * dt, Math.max(0, GRAPPLE.maxPullSpeed - toward));
    state.vx += dx * added; state.vy += dy * added; state.vz += dz * added;
  } else if (dy > 0) {
    state.vx += wishX * GRAPPLE.swingPushAccel * dt;
    state.vz += wishZ * GRAPPLE.swingPushAccel * dt;
  }
  if (distance >= state.grappleLen) removeOutward(state, dx, dy, dz);
}

function removeOutward(state: PlayerSim, towardX: number, towardY: number, towardZ: number): void {
  const radial = state.vx * towardX + state.vy * towardY + state.vz * towardZ;
  if (radial >= 0) return;
  state.vx -= towardX * radial; state.vy -= towardY * radial; state.vz -= towardZ * radial;
}

/**
 * Keeps the body within the rope length after it moves. The pull back moves through collision like any other move,
 * so it never passes through walls; where a wall stops it, the rope pays out instead.
 */
export function enforceRopeLength(state: PlayerSim, map: MapData): void {
  if (!state.grappleActive) return;
  const dx = state.x - state.grappleX, dy = state.y + state.height * 0.5 - state.grappleY, dz = state.z - state.grappleZ;
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= state.grappleLen || distance <= 0) return;
  const pull = state.grappleLen / distance - 1;
  const vx = state.vx, vy = state.vy, vz = state.vz, grounded = state.grounded;
  state.vx = dx * pull; state.vy = dy * pull; state.vz = dz * pull;
  movePlayer(state, map, 1);
  if (dy * pull <= 0 && grounded) state.grounded = true;
  state.vx = vx; state.vy = vy; state.vz = vz;
  removeOutward(state, -dx / distance, -dy / distance, -dz / distance);
  const after = Math.hypot(state.x - state.grappleX, state.y + state.height * 0.5 - state.grappleY, state.z - state.grappleZ);
  if (after > state.grappleLen) state.grappleLen = after;
}

const ROPE_ANCHOR_SKIP_M = 0.15;

/** True when a solid box sits between the body and its anchor. The anchor box is skipped by stopping just short of the anchor. */
export function ropeBlocked(state: PlayerSim, map: MapData): boolean {
  const fromY = state.y + state.height * 0.5;
  let dx = state.grappleX - state.x, dy = state.grappleY - fromY, dz = state.grappleZ - state.z;
  const distance = Math.hypot(dx, dy, dz);
  const length = distance - ROPE_ANCHOR_SKIP_M;
  if (length <= 0) return false;
  dx /= distance; dy /= distance; dz /= distance;
  for (const box of map.boxes) {
    if (!box.tags.includes("solid")) continue;
    if (rayBoxDistance(state.x, fromY, state.z, dx, dy, dz, box.min, box.max, length) !== null) return true;
  }
  return false;
}

/** Line-of-sight upkeep, once per tick: the rope lets go after it has been blocked for a moment. */
export function stepRopeSight(state: PlayerSim, map: MapData, tickMs: number): void {
  if (!state.grappleActive) return;
  state.grappleBlockedMs = ropeBlocked(state, map) ? state.grappleBlockedMs + tickMs : 0;
  if (state.grappleBlockedMs >= GRAPPLE.blockedMs) releaseGrapple(state, false);
}

type RopePoint = { x: number; y: number; z: number };
type RopeOwner = Pick<PlayerSim, "x" | "y" | "z" | "height" | "grappleX" | "grappleY" | "grappleZ">;
/** The rope runs from the owner's chest to the anchor. Writes its ends into from and to. */
export function ropeSegment(owner: RopeOwner, from: RopePoint, to: RopePoint): void {
  from.x = owner.x; from.y = owner.y + owner.height * 0.5; from.z = owner.z;
  to.x = owner.grappleX; to.y = owner.grappleY; to.z = owner.grappleZ;
}

export function sphereBlocksSight(from: VisionPoint, to: VisionPoint, cloud: VisionSphere): boolean {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  if (lengthSq <= 0) return false;
  const t = Math.max(0, Math.min(1, ((cloud.x - from.x) * dx + (cloud.y - from.y) * dy + (cloud.z - from.z) * dz) / lengthSq));
  const x = from.x + dx * t - cloud.x, y = from.y + dy * t - cloud.y, z = from.z + dz * t - cloud.z;
  return x * x + y * y + z * z <= cloud.radius * cloud.radius;
}
