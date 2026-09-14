import {
  ARROW_SPEED_MAX,
  ARROW_SPEED_MIN,
  DMG_BODY_MAX,
  DMG_BODY_MIN,
  DRAW_FULL_MS,
  DRAW_MIN_MS,
  MELEE_COOLDOWN_MS,
  RELEASE_COOLDOWN_MS,
} from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import { clamp } from "../math/angles.ts";
import type { PlayerSim } from "./movement.ts";

export type FireEvent = {
  type: "fire";
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  fraction: number; speed: number; damage: number;
};

export type MeleeEvent = { type: "melee"; x: number; y: number; z: number; yaw: number; pitch: number };
export type CombatEvent = FireEvent | MeleeEvent;

export function drawFraction(drawMs: number): number {
  return clamp((drawMs - DRAW_MIN_MS) / (DRAW_FULL_MS - DRAW_MIN_MS), 0, 1);
}

export function arrowSpeed(fraction: number): number {
  return ARROW_SPEED_MIN + (ARROW_SPEED_MAX - ARROW_SPEED_MIN) * clamp(fraction, 0, 1);
}

export function bodyDamage(fraction: number): number {
  return DMG_BODY_MIN + (DMG_BODY_MAX - DMG_BODY_MIN) * clamp(fraction, 0, 1);
}

function isHeld(buttons: number, button: number): boolean {
  return (buttons & button) !== 0;
}

function isPressed(buttons: number, previous: number, button: number): boolean {
  return isHeld(buttons, button) && !isHeld(previous, button);
}

export function stepCombat(state: PlayerSim, input: PlayerInputFrame, tickMs: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  state.releaseCooldownMs = Math.max(0, state.releaseCooldownMs - tickMs);
  state.meleeCooldownMs = Math.max(0, state.meleeCooldownMs - tickMs);
  const fireWasHeld = isHeld(state.prevButtons, BTN.FIRE);
  const fireHeld = isHeld(input.buttons, BTN.FIRE);
  if (isPressed(input.buttons, state.prevButtons, BTN.CANCEL)) state.drawMs = 0;
  else if (fireHeld && state.releaseCooldownMs <= 0) state.drawMs += tickMs;
  else if (!fireHeld && fireWasHeld) {
    if (state.drawMs >= DRAW_MIN_MS && state.releaseCooldownMs <= 0) {
      const fraction = drawFraction(state.drawMs);
      events.push({ type: "fire", x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: state.pitch, fraction, speed: arrowSpeed(fraction), damage: bodyDamage(fraction) });
      state.releaseCooldownMs = RELEASE_COOLDOWN_MS;
    }
    state.drawMs = 0;
  }
  if (isPressed(input.buttons, state.prevButtons, BTN.MELEE) && state.meleeCooldownMs <= 0) {
    state.drawMs = 0;
    state.meleeCooldownMs = MELEE_COOLDOWN_MS;
    events.push({ type: "melee", x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: state.pitch });
  }
  return events;
}
