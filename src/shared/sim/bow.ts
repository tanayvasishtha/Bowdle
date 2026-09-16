import {
  ARROW_SPEED_MAX,
  ARROW_SPEED_MIN,
  DMG_BODY_MAX,
  DMG_BODY_MIN,
  DRAW_FULL_MS,
  DRAW_MIN_MS,
  MELEE_COOLDOWN_MS,
  QUIVER,
  RELEASE_COOLDOWN_MS,
} from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import { clamp } from "../math/angles.ts";
import type { PlayerSim } from "./movement.ts";

/** Quiver slots in order. The broadhead keeps the v1 kind name "arrow". */
export const ARROW_SLOTS = ["arrow", "scatter", "tether"] as const;
export type ArrowKind = typeof ARROW_SLOTS[number];

export type FireEvent = {
  type: "fire";
  kind: ArrowKind;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  fraction: number; speed: number; damage: number;
};

export type MeleeEvent = { type: "melee"; x: number; y: number; z: number; yaw: number; pitch: number };
export type CombatEvent = FireEvent | MeleeEvent;

export function drawFraction(drawMs: number, fullMs: number = DRAW_FULL_MS): number {
  return clamp((drawMs - DRAW_MIN_MS) / (fullMs - DRAW_MIN_MS), 0, 1);
}

export function fullDrawMs(slot: number): number { return ARROW_SLOTS[slot] === "scatter" ? QUIVER.scatter.drawFullMs : DRAW_FULL_MS; }

const SLOT_BUTTONS = [BTN.SLOT1, BTN.SLOT2, BTN.SLOT3] as const;

/** Slot keys, wheel steps, scatter charge regain and the tether cooldown. */
export function stepQuiver(state: PlayerSim, buttons: number, previous: number, tickMs: number): void {
  state.tetherCooldownMs = Math.max(0, state.tetherCooldownMs - tickMs);
  if (state.scatterCharges < QUIVER.scatter.charges) {
    state.scatterRechargeMs -= tickMs;
    if (state.scatterRechargeMs <= 0) { state.scatterCharges += 1; state.scatterRechargeMs = state.scatterCharges < QUIVER.scatter.charges ? QUIVER.scatter.rechargeMs : 0; }
  }
  for (let slot = 0; slot < SLOT_BUTTONS.length; slot += 1) if (isPressed(buttons, previous, SLOT_BUTTONS[slot]!)) state.arrowSlot = slot;
  if (isPressed(buttons, previous, BTN.SLOT_NEXT)) state.arrowSlot = (state.arrowSlot + 1) % ARROW_SLOTS.length;
  if (isPressed(buttons, previous, BTN.SLOT_PREV)) state.arrowSlot = (state.arrowSlot + ARROW_SLOTS.length - 1) % ARROW_SLOTS.length;
}

/**
 * What a release shoots. A scatter volley uses a charge and falls back to a broadhead without one.
 * A tether needs a full draw and a finished cooldown; otherwise nothing is shot.
 */
function releaseKind(state: PlayerSim): ArrowKind | null {
  const kind = ARROW_SLOTS[state.arrowSlot] ?? "arrow";
  if (kind === "scatter") {
    if (state.scatterCharges <= 0) return "arrow";
    if (state.scatterCharges === QUIVER.scatter.charges) state.scatterRechargeMs = QUIVER.scatter.rechargeMs;
    state.scatterCharges -= 1;
    return "scatter";
  }
  if (kind === "tether") {
    if (state.drawMs < DRAW_FULL_MS || state.tetherCooldownMs > 0 || state.relicCarrier) return null;
    state.tetherCooldownMs = QUIVER.tether.cooldownMs;
    return "tether";
  }
  return "arrow";
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
  stepQuiver(state, input.buttons, state.prevButtons, tickMs);
  state.releaseCooldownMs = Math.max(0, state.releaseCooldownMs - tickMs);
  state.meleeCooldownMs = Math.max(0, state.meleeCooldownMs - tickMs);
  const fireWasHeld = isHeld(state.prevButtons, BTN.FIRE);
  const fireHeld = isHeld(input.buttons, BTN.FIRE);
  if (isPressed(input.buttons, state.prevButtons, BTN.CANCEL)) state.drawMs = 0;
  else if (fireHeld && state.releaseCooldownMs <= 0) state.drawMs += tickMs;
  else if (!fireHeld && fireWasHeld) {
    if (state.drawMs >= DRAW_MIN_MS && state.releaseCooldownMs <= 0) {
      const kind = releaseKind(state);
      if (kind) {
        const fraction = drawFraction(state.drawMs, kind === "scatter" ? QUIVER.scatter.drawFullMs : DRAW_FULL_MS);
        const damage = bodyDamage(fraction) * (kind === "scatter" ? QUIVER.scatter.damageMult : 1);
        events.push({ type: "fire", kind, x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: state.pitch, fraction, speed: arrowSpeed(fraction), damage });
        state.releaseCooldownMs = RELEASE_COOLDOWN_MS;
      }
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
