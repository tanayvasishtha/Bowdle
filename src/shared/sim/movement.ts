import {
  AIM_SPEED_MULT,
  AIR_ACCEL,
  AIR_WISH_CAP,
  COYOTE_MS,
  CROUCH_HEIGHT,
  CROUCH_SPEED,
  FRICTION,
  GRAVITY,
  GROUND_ACCEL,
  JUMP_BUFFER_MS,
  JUMP_VELOCITY,
  MAX_HORIZONTAL_SPEED,
  MAX_HP,
  RUN_SPEED,
  SLIDE_BOOST,
  SLIDE_COOLDOWN_MS,
  SLIDE_END_SPEED,
  SLIDE_FRICTION,
  SLIDE_MAX_MS,
  SLIDE_MAX_SPEED,
  SLIDE_MIN_SPEED,
  SLIDE_STEER_ACCEL,
  STAND_HEIGHT,
  STOP_SPEED,
  SUBSTEPS,
  TICK_HZ,
  WATER_SPEED_MULT,
} from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import type { MapData } from "../maps/types.ts";
import { clamp } from "../math/angles.ts";
import { lengthXZ, normalizeXZ, type Vec3 } from "../math/vec3.ts";
import { canOccupy, movePlayer } from "./collision.ts";
import { stepCombat, type CombatEvent } from "./bow.ts";
import { stepAbilityInput, stepGrapplePull, type AbilityEvent } from "./abilities.ts";
import { isInWater } from "./volumes.ts";

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
  kills: number; deaths: number; assists: number;
  bowSkin: string; arrowTrail: string; outfit: string; killEffect: string;
};

export type StepContext = { nowMs: number };
export type PlayerEvent = CombatEvent | AbilityEvent;

const wish: Vec3 = { x: 0, y: 0, z: 0 };

export function createPlayerSim(x = 0, y = 0, z = 0): PlayerSim {
  return {
    name: "Player", team: 0, isBot: false,
    x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, height: STAND_HEIGHT,
    grounded: true, crouched: false, sliding: false, slideMs: 0, slideCooldownMs: 0, coyoteMs: COYOTE_MS, jumpBufferMs: 0,
    hp: MAX_HP, alive: true, drawMs: 0, releaseCooldownMs: 0, meleeCooldownMs: 0, prevButtons: 0, lastDamageAtMs: 0, spawnProtectMs: 0, respawnAtMs: 0,
    grappleCooldownMs: 0, grappleActive: false, grappleX: 0, grappleY: 0, grappleZ: 0, grappleMs: 0, inkCooldownMs: 0,
    kills: 0, deaths: 0, assists: 0, bowSkin: "bow.default", arrowTrail: "trail.default", outfit: "outfit.default", killEffect: "effect.default",
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

function capHorizontal(state: PlayerSim, cap: number): void {
  const speed = Math.hypot(state.vx, state.vz);
  if (speed <= cap) return;
  const scale = cap / speed;
  state.vx *= scale;
  state.vz *= scale;
}

function updateWish(input: PlayerInputFrame): number {
  wish.x = Math.cos(input.yaw) * input.moveX - Math.sin(input.yaw) * input.moveZ;
  wish.y = 0;
  wish.z = -Math.sin(input.yaw) * input.moveX - Math.cos(input.yaw) * input.moveZ;
  const magnitude = Math.min(1, Math.hypot(input.moveX, input.moveZ));
  normalizeXZ(wish);
  return magnitude;
}

export function stepPlayer(state: PlayerSim, input: PlayerInputFrame, map: MapData, ctx: StepContext): PlayerEvent[] {
  const dt = 1 / (TICK_HZ * SUBSTEPS);
  const dtMs = dt * 1000;
  const jumpPressed = pressed(input, state.prevButtons, BTN.JUMP);
  const crouchPressed = pressed(input, state.prevButtons, BTN.CROUCH);
  let startedSlide = false;
  if (jumpPressed) state.jumpBufferMs = JUMP_BUFFER_MS;
  const inputMagnitude = updateWish(input);
  state.yaw = input.yaw;
  state.pitch = input.pitch;
  const abilityEvents = stepAbilityInput(state, input, map, 1000 / TICK_HZ);

  for (let substep = 0; substep < SUBSTEPS; substep += 1) {
    const water = isInWater(map, state.x, state.y, state.z, ctx.nowMs);
    if (water) state.sliding = false;
    state.slideCooldownMs = Math.max(0, state.slideCooldownMs - dtMs);
    state.jumpBufferMs = Math.max(0, state.jumpBufferMs - dtMs);
    const startingSpeed = Math.hypot(state.vx, state.vz);
    if (substep === 0 && crouchPressed && state.grounded && state.slideCooldownMs <= 0 && startingSpeed >= SLIDE_MIN_SPEED) {
      const boosted = Math.min(SLIDE_MAX_SPEED, startingSpeed + SLIDE_BOOST);
      const scale = boosted / startingSpeed;
      state.vx *= scale;
      state.vz *= scale;
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
    if (state.grounded && !skipFriction && !startedSlide) friction(state, state.sliding ? SLIDE_FRICTION : FRICTION, dt);

    let speed = state.crouched && !state.sliding ? CROUCH_SPEED : RUN_SPEED;
    if (water) speed *= WATER_SPEED_MULT;
    if (held(input.buttons, BTN.AIM)) speed *= AIM_SPEED_MULT;
    if (inputMagnitude > 0) {
      if (state.sliding) accelerate(state, wish, speed * inputMagnitude, SLIDE_STEER_ACCEL, dt);
      else if (state.grounded) accelerate(state, wish, speed * inputMagnitude, GROUND_ACCEL, dt);
      else accelerate(state, wish, Math.min(speed * inputMagnitude, AIR_WISH_CAP), AIR_ACCEL, dt);
    }

    if (canJump) {
      state.vy = JUMP_VELOCITY;
      state.grounded = false;
      state.coyoteMs = 0;
      state.jumpBufferMs = 0;
    }

    state.vy -= GRAVITY * dt;
    stepGrapplePull(state, dt, dtMs);
    const wasGrounded = state.grounded;
    movePlayer(state, map, dt);
    if (state.grounded) state.coyoteMs = COYOTE_MS;
    else if (!wasGrounded) state.coyoteMs = Math.max(0, state.coyoteMs - dtMs);

    if (state.sliding) {
      state.slideMs += dtMs;
      if (state.slideMs >= SLIDE_MAX_MS || Math.hypot(state.vx, state.vz) < SLIDE_END_SPEED || !held(input.buttons, BTN.CROUCH)) state.sliding = false;
    }
    capHorizontal(state, water ? RUN_SPEED * WATER_SPEED_MULT : MAX_HORIZONTAL_SPEED);
  }
  const events: PlayerEvent[] = stepCombat(state, input, 1000 / TICK_HZ);
  events.push(...abilityEvents);
  state.prevButtons = input.buttons;
  return events;
}
