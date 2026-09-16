import { BTN } from "../../shared/input.ts";

/** Standard-mapping gamepad settings (v2). */
export const PAD = { deadzone: 0.12, exponent: 1.8, lookRadPerS: 3.2, aimSlowdown: 0.6, aimSlowdownRangeM: 40, aimSlowdownPx: 70, triggerPressed: 0.35 } as const;

/** Standard mapping indexes. */
const BUTTON = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15 } as const;
const AXIS = { lx: 0, ly: 1, rx: 2, ry: 3 } as const;

/**
 * One stick after the radial deadzone and response curve: inside the deadzone it is still,
 * outside it the remaining travel is rescaled to 0..1 and raised to the curve exponent. The direction is kept.
 */
export function stickCurve(x: number, y: number, deadzone: number = PAD.deadzone, exponent: number = PAD.exponent): { x: number; y: number } {
  const magnitude = Math.min(1, Math.hypot(x, y));
  if (magnitude <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.pow((magnitude - deadzone) / (1 - deadzone), exponent);
  const length = Math.hypot(x, y);
  return { x: x / length * scaled, y: y / length * scaled };
}

export type PadSnapshot = { moveX: number; moveZ: number; lookX: number; lookY: number; buttons: number; start: boolean; connected: boolean };

export function emptyPad(): PadSnapshot {
  return { moveX: 0, moveZ: 0, lookX: 0, lookY: 0, buttons: 0, start: false, connected: false };
}

type PadLike = { buttons: ReadonlyArray<{ pressed: boolean; value: number }>; axes: ReadonlyArray<number>; mapping?: string };

function down(pad: PadLike, index: number): boolean {
  const button = pad.buttons[index];
  return !!button && (button.pressed || button.value > PAD.triggerPressed);
}

/**
 * Reads a standard-mapping pad into game input: left stick moves (deadzone only), right stick looks (deadzone and curve),
 * RT draw, LT aim, A jump, B slide, X and Y previous and next arrow, RB grapple, LB ink, R3 dagger, L3 dodge,
 * D-pad down use, Start menu.
 */
export function readPad(pad: PadLike | null | undefined, out: PadSnapshot): PadSnapshot {
  if (!pad) { Object.assign(out, emptyPad()); return out; }
  const move = stickCurve(pad.axes[AXIS.lx] ?? 0, pad.axes[AXIS.ly] ?? 0, PAD.deadzone, 1);
  const look = stickCurve(pad.axes[AXIS.rx] ?? 0, pad.axes[AXIS.ry] ?? 0);
  out.moveX = move.x; out.moveZ = -move.y; out.lookX = look.x; out.lookY = look.y; out.connected = true;
  let buttons = 0;
  if (down(pad, BUTTON.rt)) buttons |= BTN.FIRE;
  if (down(pad, BUTTON.lt)) buttons |= BTN.AIM;
  if (down(pad, BUTTON.a)) buttons |= BTN.JUMP;
  if (down(pad, BUTTON.b)) buttons |= BTN.CROUCH;
  if (down(pad, BUTTON.x)) buttons |= BTN.SLOT_PREV;
  if (down(pad, BUTTON.y)) buttons |= BTN.SLOT_NEXT;
  if (down(pad, BUTTON.rb)) buttons |= BTN.GRAPPLE;
  if (down(pad, BUTTON.lb)) buttons |= BTN.INK;
  if (down(pad, BUTTON.r3)) buttons |= BTN.MELEE;
  if (down(pad, BUTTON.l3)) buttons |= BTN.DODGE;
  if (down(pad, BUTTON.down)) buttons |= BTN.USE;
  out.buttons = buttons;
  out.start = down(pad, BUTTON.start);
  return out;
}

export type MenuPadAction = "up" | "down" | "left" | "right" | "select" | "back";

/** Menu navigation from a pad: D-pad or left stick moves focus, A selects, B goes back. */
export function menuActions(pad: PadLike | null | undefined): Set<MenuPadAction> {
  const actions = new Set<MenuPadAction>();
  if (!pad) return actions;
  const x = pad.axes[AXIS.lx] ?? 0, y = pad.axes[AXIS.ly] ?? 0;
  if (down(pad, BUTTON.up) || y < -0.6) actions.add("up");
  if (down(pad, BUTTON.down) || y > 0.6) actions.add("down");
  if (down(pad, BUTTON.left) || x < -0.6) actions.add("left");
  if (down(pad, BUTTON.right) || x > 0.6) actions.add("right");
  if (down(pad, BUTTON.a)) actions.add("select");
  if (down(pad, BUTTON.b)) actions.add("back");
  return actions;
}

/** The first connected pad, or null. */
export function firstPad(): PadLike | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  for (const pad of navigator.getGamepads()) if (pad?.connected) return pad;
  return null;
}

/**
 * Trackpad mode: draw and aim become toggles. The first press of draw starts drawing and the second releases;
 * aim flips on and off with each press.
 */
export class TrackpadToggles {
  private drawing = false;
  private aiming = false;

  press(action: "draw" | "aim"): void {
    if (action === "draw") this.drawing = !this.drawing; else this.aiming = !this.aiming;
  }

  held(action: "draw" | "aim"): boolean { return action === "draw" ? this.drawing : this.aiming; }

  reset(): void { this.drawing = false; this.aiming = false; }
}
