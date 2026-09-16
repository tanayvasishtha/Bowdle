import {
  QUIVER,
  ABSOLUTE_SPEED_CAP,
  AIM_SPEED_MULT,
  AIR_ACCEL,
  AIR_WISH_CAP,
  COYOTE_MS,
  CROUCH_HEIGHT,
  CROUCH_SPEED,
  DODGE,
  FRICTION,
  GRAVITY,
  GROUND_ACCEL,
  JUMP_BUFFER_MS,
  JUMP_VELOCITY,
  LANDING_GRACE,
  MANTLE,
  MAX_HORIZONTAL_SPEED,
  MAX_HP,
  RUN_SPEED,
  SLIDE_AIR_MS,
  SLIDE_BOOST,
  SLIDE_COOLDOWN_MS,
  SLIDE_DECEL,
  SLIDE_END_SPEED,
  SLIDE_JUMP_MULT,
  SLIDE_MAX_SPEED,
  SLIDE_MIN_SPEED,
  SLIDE_STEER_ACCEL,
  STAND_HEIGHT,
  STOP_SPEED,
  SUBSTEPS,
  TICK_HZ,
  VINE_HOP,
  WALL_JUMP,
  WATER_SPEED_MULT,
} from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import type { MapData, ZipLine } from "../maps/types.ts";
import { normalizeXZ, type Vec3 } from "../math/vec3.ts";
import { canOccupy, findMantleLedge, movePlayer, moveResult } from "./collision.ts";
import { stepCombat, type CombatEvent } from "./bow.ts";
import { enforceRopeLength, stepAbilityInput, stepGrappleForces, stepRopeSight, type AbilityEvent } from "./abilities.ts";
import { isInWater } from "./volumes.ts";
import { stepZipInput, stepZipRide } from "./zip.ts";

export type PlayerSim = {
  name: string;
  team: number;
  isBot: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number; pitch: number; height: number;
  grounded: boolean; crouched: boolean; sliding: boolean;
  slideMs: number; slideCooldownMs: number; coyoteMs: number; jumpBufferMs: number;
  hp: number; alive: boolean; drawMs: number; releaseCooldownMs: number; meleeCooldownMs: number;
  prevButtons: number; lastDamageAtMs: number; spawnProtectMs: number; respawnAtMs: number;
  grappleCooldownMs: number; grappleActive: boolean; grappleX: number; grappleY: number; grappleZ: number; grappleMs: number; inkCooldownMs: number;
  grappleLen: number; grappleBlockedMs: number; grappleReeling: boolean;
  arrowSlot: number; scatterCharges: number; scatterRechargeMs: number; tetherCooldownMs: number;
  zipId: string; zipT: number;
  kills: number; deaths: number; assists: number;
  bowSkin: string; arrowTrail: string; outfit: string; killEffect: string;
  /** Movement 2.0 state. `slideMs` now counts time a slide has spent airborne. */
  airJumps: number; wallJumps: number; wallJumpCooldownMs: number; wallTouchMs: number; wallNormalX: number; wallNormalZ: number;
  mantleCooldownMs: number; dodgeCooldownMs: number; landingGraceMs: number;
};

/** zipLines are the zip lines that exist only for part of a match, such as tethers. */
export type StepContext = { nowMs: number; zipLines?: readonly ZipLine[] };
export type PlayerEvent = CombatEvent | AbilityEvent;

const wish: Vec3 = { x: 0, y: 0, z: 0 };
/** Long enough to mean "not touching a wall recently" without growing forever. */
const WALL_TOUCH_IDLE_MS = 10_000;

export function createPlayerSim(x = 0, y = 0, z = 0): PlayerSim {
  return {
    name: "Player", team: 0, isBot: false,
    x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, height: STAND_HEIGHT,
    grounded: true, crouched: false, sliding: false, slideMs: 0, slideCooldownMs: 0, coyoteMs: COYOTE_MS, jumpBufferMs: 0,
    hp: MAX_HP, alive: true, drawMs: 0, releaseCooldownMs: 0, meleeCooldownMs: 0, prevButtons: 0, lastDamageAtMs: 0, spawnProtectMs: 0, respawnAtMs: 0,
    grappleCooldownMs: 0, grappleActive: false, grappleX: 0, grappleY: 0, grappleZ: 0, grappleMs: 0, inkCooldownMs: 0,
    grappleLen: 0, grappleBlockedMs: 0, grappleReeling: false,
    arrowSlot: 0, scatterCharges: QUIVER.scatter.charges, scatterRechargeMs: 0, tetherCooldownMs: 0,
    zipId: "", zipT: 0,
    kills: 0, deaths: 0, assists: 0, bowSkin: "bow.default", arrowTrail: "trail.default", outfit: "outfit.default", killEffect: "effect.default",
    airJumps: VINE_HOP.perAirtime, wallJumps: 0, wallJumpCooldownMs: 0, wallTouchMs: WALL_TOUCH_IDLE_MS, wallNormalX: 0, wallNormalZ: 0,
    mantleCooldownMs: 0, dodgeCooldownMs: 0, landingGraceMs: 0,
  };
}

function held(buttons: number, button: number): boolean {
  return (buttons & button) !== 0;
}

function pressed(input: PlayerInputFrame, previous: number, button: number): boolean {
  return held(input.buttons, button) && !held(previous, button);
}

function accelerate(state: PlayerSim, direction: Vec3, wishSpeed: number, acceleration: number, dt: number): void {
  const currentSpeed = state.vx * direction.x + state.vz * direction.z;
  const addSpeed = wishSpeed - currentSpeed;
  if (addSpeed <= 0) return;
  const speed = Math.min(acceleration * dt * wishSpeed, addSpeed);
  state.vx += direction.x * speed;
  state.vz += direction.z * speed;
}

function friction(state: PlayerSim, amount: number, dt: number): void {
  const speed = Math.hypot(state.vx, state.vz);
  if (speed <= 0) return;
  const control = Math.max(speed, STOP_SPEED);
  const next = Math.max(0, speed - control * amount * dt);
  const scale = next / speed;
  state.vx *= scale;
  state.vz *= scale;
}

function setHorizontalSpeed(state: PlayerSim, speed: number): void {
  const current = Math.hypot(state.vx, state.vz);
  if (current <= 0) return;
  const scale = speed / current;
  state.vx *= scale;
  state.vz *= scale;
}

function capHorizontal(state: PlayerSim, cap: number): void {
  if (Math.hypot(state.vx, state.vz) > cap) setHorizontalSpeed(state, cap);
}

function capTotal(state: PlayerSim, cap: number): void {
  const speed = Math.hypot(state.vx, state.vy, state.vz);
  if (speed <= cap) return;
  const scale = cap / speed;
  state.vx *= scale; state.vy *= scale; state.vz *= scale;
}

function updateWish(input: PlayerInputFrame): number {
  wish.x = Math.cos(input.yaw) * input.moveX - Math.sin(input.yaw) * input.moveZ;
  wish.y = 0;
  wish.z = -Math.sin(input.yaw) * input.moveX - Math.cos(input.yaw) * input.moveZ;
  const magnitude = Math.min(1, Math.hypot(input.moveX, input.moveZ));
  normalizeXZ(wish);
  return magnitude;
}

/** Vine hop: one extra jump in the air that also turns the body toward the input. */
function vineHop(state: PlayerSim, inputMagnitude: number): void {
  state.airJumps -= 1;
  state.vy = VINE_HOP.velocity;
  if (inputMagnitude <= 0) return;
  const speed = Math.max(Math.hypot(state.vx, state.vz), VINE_HOP.minSpeed);
  state.vx = wish.x * speed;
  state.vz = wish.z * speed;
}

function wallJump(state: PlayerSim): void {
  const normalX = state.wallNormalX, normalZ = state.wallNormalZ;
  const along = state.vx * normalX + state.vz * normalZ;
  const tangentX = state.vx - along * normalX, tangentZ = state.vz - along * normalZ;
  state.vx = normalX * WALL_JUMP.push + tangentX * WALL_JUMP.keepAlongWall;
  state.vz = normalZ * WALL_JUMP.push + tangentZ * WALL_JUMP.keepAlongWall;
  state.vy = WALL_JUMP.velocity;
  state.wallJumps += 1;
  state.wallJumpCooldownMs = WALL_JUMP.cooldownMs;
  state.wallTouchMs = WALL_TOUCH_IDLE_MS;
  state.airJumps = VINE_HOP.perAirtime;
}

function dodge(state: PlayerSim, inputMagnitude: number): void {
  const directionX = inputMagnitude > 0 ? wish.x : -Math.sin(state.yaw);
  const directionZ = inputMagnitude > 0 ? wish.z : -Math.cos(state.yaw);
  const along = state.vx * directionX + state.vz * directionZ;
  const target = Math.max(along + DODGE.boost, DODGE.minSpeed);
  state.vx += directionX * (target - along);
  state.vz += directionZ * (target - along);
  if (!state.grounded) state.vy = Math.max(state.vy, DODGE.airLift);
  state.dodgeCooldownMs = DODGE.cooldownMs;
}

function tryMantle(state: PlayerSim, input: PlayerInputFrame, map: MapData): void {
  if (state.mantleCooldownMs > MANTLE.cooldownMs - MANTLE.pushMs) {
    const forwardX = -Math.sin(state.yaw), forwardZ = -Math.cos(state.yaw);
    if (state.vx * forwardX + state.vz * forwardZ < MANTLE.forwardSpeed) { state.vx = forwardX * MANTLE.forwardSpeed; state.vz = forwardZ * MANTLE.forwardSpeed; }
    return;
  }
  if (state.grounded || state.mantleCooldownMs > 0 || input.moveZ < MANTLE.minForwardInput || state.wallTouchMs > WALL_JUMP.touchMs) return;
  const forwardX = -Math.sin(state.yaw), forwardZ = -Math.cos(state.yaw);
  const ledge = findMantleLedge(state, map, forwardX, forwardZ);
  if (!ledge) return;
  const rise = ledge.top - state.y + MANTLE.clearance;
  state.vy = Math.max(state.vy, Math.sqrt(2 * GRAVITY * rise));
  state.vx = forwardX * MANTLE.forwardSpeed;
  state.vz = forwardZ * MANTLE.forwardSpeed;
  state.mantleCooldownMs = MANTLE.cooldownMs;
}

export function stepPlayer(state: PlayerSim, input: PlayerInputFrame, map: MapData, ctx: StepContext): PlayerEvent[] {
  const dt = 1 / (TICK_HZ * SUBSTEPS);
  const dtMs = dt * 1000;
  const jumpPressed = pressed(input, state.prevButtons, BTN.JUMP);
  const crouchPressed = pressed(input, state.prevButtons, BTN.CROUCH);
  const dodgePressed = pressed(input, state.prevButtons, BTN.DODGE);
  let startedSlide = false;
  if (jumpPressed) state.jumpBufferMs = JUMP_BUFFER_MS;
  const inputMagnitude = updateWish(input);
  state.yaw = input.yaw;
  state.pitch = input.pitch;
  stepZipInput(state, input, map, ctx.zipLines);
  const wasGrappling = state.grappleActive;
  const abilityEvents = stepAbilityInput(state, input, map, 1000 / TICK_HZ);
  // A jump that launched off the rope is used up by the launch.
  const launched = wasGrappling && !state.grappleActive && jumpPressed;

  for (let substep = 0; substep < SUBSTEPS; substep += 1) {
    state.wallJumpCooldownMs = Math.max(0, state.wallJumpCooldownMs - dtMs);
    state.mantleCooldownMs = Math.max(0, state.mantleCooldownMs - dtMs);
    state.dodgeCooldownMs = Math.max(0, state.dodgeCooldownMs - dtMs);
    state.landingGraceMs = Math.max(0, state.landingGraceMs - dtMs);
    if (stepZipRide(state, map, dt, ctx.zipLines)) continue;
    const water = isInWater(map, state.x, state.y, state.z, ctx.nowMs);
    if (water) state.sliding = false;
    state.slideCooldownMs = Math.max(0, state.slideCooldownMs - dtMs);
    state.jumpBufferMs = Math.max(0, state.jumpBufferMs - dtMs);
    const startingSpeed = Math.hypot(state.vx, state.vz);
    if (substep === 0 && crouchPressed && state.grounded && state.slideCooldownMs <= 0 && startingSpeed >= SLIDE_MIN_SPEED) {
      // A slide never slows a player who is already faster than the boost would make them.
      setHorizontalSpeed(state, Math.max(startingSpeed, Math.min(SLIDE_MAX_SPEED, startingSpeed + SLIDE_BOOST)));
      state.sliding = true;
      startedSlide = true;
      state.slideMs = 0;
      state.slideCooldownMs = SLIDE_COOLDOWN_MS;
    }

    const wantsCrouch = held(input.buttons, BTN.CROUCH) || state.sliding;
    if (wantsCrouch) {
      state.crouched = true;
      state.height = CROUCH_HEIGHT;
    } else if (canOccupy({ height: STAND_HEIGHT }, map, state.x, state.y, state.z)) {
      state.crouched = false;
      state.height = STAND_HEIGHT;
    }

    if (held(input.buttons, BTN.JUMP) && state.grounded) state.jumpBufferMs = JUMP_BUFFER_MS;
    const canJump = state.jumpBufferMs > 0 && (state.grounded || state.coyoteMs > 0);
    const skipFriction = canJump && held(input.buttons, BTN.JUMP);
    if (state.grounded && !skipFriction && !startedSlide) {
      if (state.sliding) setHorizontalSpeed(state, Math.max(0, Math.hypot(state.vx, state.vz) - SLIDE_DECEL * dt));
      else friction(state, FRICTION * (state.landingGraceMs > 0 ? LANDING_GRACE.frictionMult : 1), dt);
    }

    let speed = state.crouched && !state.sliding ? CROUCH_SPEED : RUN_SPEED;
    if (water) speed *= WATER_SPEED_MULT;
    if (held(input.buttons, BTN.AIM)) speed *= AIM_SPEED_MULT;
    if (inputMagnitude > 0) {
      if (state.sliding) accelerate(state, wish, speed * inputMagnitude, SLIDE_STEER_ACCEL, dt);
      else if (state.grounded) accelerate(state, wish, speed * inputMagnitude, GROUND_ACCEL, dt);
      else accelerate(state, wish, Math.min(speed * inputMagnitude, AIR_WISH_CAP), AIR_ACCEL, dt);
    }

    if (canJump) {
      if (state.sliding) {
        const current = Math.hypot(state.vx, state.vz);
        setHorizontalSpeed(state, Math.min(current * SLIDE_JUMP_MULT, Math.max(current, MAX_HORIZONTAL_SPEED)));
        state.sliding = false;
      }
      state.vy = JUMP_VELOCITY;
      state.grounded = false;
      state.coyoteMs = 0;
      state.jumpBufferMs = 0;
    } else if (substep === 0 && jumpPressed && !state.grounded && !state.zipId && !launched && !state.grappleActive) {
      // Air jumps: a wall jump when a wall was touched just now, otherwise the vine hop.
      if (state.wallTouchMs <= WALL_JUMP.touchMs && state.wallJumpCooldownMs <= 0 && state.wallJumps < WALL_JUMP.maxBeforeLanding) wallJump(state);
      else if (state.airJumps > 0) vineHop(state, inputMagnitude);
      state.jumpBufferMs = 0;
    }
    if (substep === 0 && dodgePressed && state.dodgeCooldownMs <= 0 && !state.zipId) dodge(state, inputMagnitude);

    state.vy -= GRAVITY * dt;
    stepGrappleForces(state, dt, dtMs, inputMagnitude > 0 ? wish.x : 0, inputMagnitude > 0 ? wish.z : 0);
    const wasGrounded = state.grounded;
    const landingSpeed = Math.hypot(state.vx, state.vz);
    movePlayer(state, map, dt);
    if (moveResult.hitWall && !state.grounded) {
      state.wallTouchMs = 0; state.wallNormalX = moveResult.wallNormalX; state.wallNormalZ = moveResult.wallNormalZ;
    } else {
      state.wallTouchMs = Math.min(WALL_TOUCH_IDLE_MS, state.wallTouchMs + dtMs);
    }
    enforceRopeLength(state, map);
    if (state.grounded) {
      state.coyoteMs = COYOTE_MS;
      state.airJumps = VINE_HOP.perAirtime;
      state.wallJumps = 0;
      if (!wasGrounded && landingSpeed > LANDING_GRACE.minSpeed) state.landingGraceMs = LANDING_GRACE.ms;
    } else if (!wasGrounded) state.coyoteMs = Math.max(0, state.coyoteMs - dtMs);
    tryMantle(state, input, map);

    if (state.sliding) {
      state.slideMs = state.grounded ? 0 : state.slideMs + dtMs;
      if (state.slideMs > SLIDE_AIR_MS || Math.hypot(state.vx, state.vz) < SLIDE_END_SPEED || !held(input.buttons, BTN.CROUCH)) state.sliding = false;
    }
    if (water) capHorizontal(state, RUN_SPEED * WATER_SPEED_MULT);
    else if (state.grounded) capHorizontal(state, MAX_HORIZONTAL_SPEED);
    else capTotal(state, ABSOLUTE_SPEED_CAP);
  }
  stepRopeSight(state, map, 1000 / TICK_HZ);
  const events: PlayerEvent[] = stepCombat(state, input, 1000 / TICK_HZ);
  events.push(...abilityEvents);
  state.prevButtons = input.buttons;
  return events;
}
