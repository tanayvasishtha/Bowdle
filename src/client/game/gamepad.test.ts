import { describe, expect, it } from "vitest";
import { BTN } from "../../shared/input.ts";
import { PAD, TrackpadToggles, emptyPad, menuActions, readPad, stickCurve } from "./gamepad.ts";

type Pad = { buttons: Array<{ pressed: boolean; value: number }>; axes: number[] };
function pad(pressed: number[] = [], axes: number[] = [0, 0, 0, 0]): Pad {
  return { buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: pressed.includes(index), value: pressed.includes(index) ? 1 : 0 })), axes };
}

describe("stick curve", () => {
  it("ignores small stick travel inside the deadzone", () => {
    expect(stickCurve(PAD.deadzone * 0.9, 0)).toEqual({ x: 0, y: 0 });
    expect(stickCurve(0.08, 0.08)).toEqual({ x: 0, y: 0 });
    expect(stickCurve(PAD.deadzone + 0.02, 0).x).toBeGreaterThan(0);
  });

  it("rescales the rest of the travel and applies the exponent, keeping direction", () => {
    expect(stickCurve(1, 0)).toEqual({ x: 1, y: 0 });
    const half = stickCurve(0.56, 0).x;
    expect(half).toBeCloseTo(Math.pow((0.56 - PAD.deadzone) / (1 - PAD.deadzone), PAD.exponent), 9);
    expect(half).toBeLessThan(0.5);
    const diagonal = stickCurve(-0.6, 0.6);
    expect(diagonal.x).toBeCloseTo(-diagonal.y, 9);
    expect(Math.hypot(stickCurve(2, 2).x, stickCurve(2, 2).y)).toBeCloseTo(1, 9);
  });
});

describe("pad mapping", () => {
  it("maps the standard layout to game input", () => {
    const out = readPad(pad([7, 6, 0, 1, 2, 3, 5, 4, 11, 10, 13, 9], [0, -1, 1, 0]), emptyPad());
    const all = BTN.FIRE | BTN.AIM | BTN.JUMP | BTN.CROUCH | BTN.SLOT_PREV | BTN.SLOT_NEXT | BTN.GRAPPLE | BTN.INK | BTN.MELEE | BTN.DODGE | BTN.USE;
    expect(out.buttons).toBe(all);
    expect(out.start).toBe(true);
    expect(out.moveZ).toBeCloseTo(1, 9);
    expect(out.lookX).toBe(1);
    expect(readPad(null, out)).toEqual(emptyPad());
  });

  it("moves linearly outside the deadzone and treats half-pulled triggers as pressed", () => {
    const out = readPad(pad([], [0.56, 0, 0, 0]), emptyPad());
    expect(out.moveX).toBeCloseTo((0.56 - PAD.deadzone) / (1 - PAD.deadzone), 9);
    const trigger = pad(); trigger.buttons[7] = { pressed: false, value: 0.5 };
    expect(readPad(trigger, emptyPad()).buttons & BTN.FIRE).toBe(BTN.FIRE);
  });

  it("navigates menus with the D-pad, stick, A and B", () => {
    expect([...menuActions(pad([12, 0]))].sort()).toEqual(["select", "up"]);
    expect([...menuActions(pad([1], [0.9, 0.9, 0, 0]))].sort()).toEqual(["back", "down", "right"]);
    expect(menuActions(null).size).toBe(0);
  });
});

describe("trackpad mode", () => {
  it("draws on the first press and releases on the second; aim flips each press", () => {
    const toggles = new TrackpadToggles();
    expect(toggles.held("draw")).toBe(false);
    toggles.press("draw"); expect(toggles.held("draw")).toBe(true);
    toggles.press("draw"); expect(toggles.held("draw")).toBe(false);
    toggles.press("aim"); expect(toggles.held("aim")).toBe(true);
    expect(toggles.held("draw")).toBe(false);
    toggles.reset(); expect(toggles.held("aim")).toBe(false);
  });
});
