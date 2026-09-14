import { describe, expect, it } from "vitest";
import { ARROW_SPEED_MAX, ARROW_SPEED_MIN, DMG_BODY_MAX, DMG_BODY_MIN, DRAW_FULL_MS, DRAW_MIN_MS, RELEASE_COOLDOWN_MS } from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import { arrowSpeed, bodyDamage, drawFraction, stepCombat } from "./bow.ts";
import { createPlayerSim } from "./movement.ts";

const input: PlayerInputFrame = { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 };

describe("bow", () => {
  it("calculates draw fraction at the table boundaries", () => {
    expect(drawFraction(DRAW_MIN_MS)).toBe(0);
    expect(drawFraction(DRAW_FULL_MS)).toBe(1);
    expect(drawFraction((DRAW_MIN_MS + DRAW_FULL_MS) / 2)).toBe(0.5);
  });

  it("cancels an early release", () => {
    const state = createPlayerSim();
    state.drawMs = DRAW_MIN_MS - 1;
    state.prevButtons = BTN.FIRE;
    expect(stepCombat(state, input, 1000 / 30)).toEqual([]);
    expect(state.drawMs).toBe(0);
  });

  it("fires once and enforces release cooldown", () => {
    const state = createPlayerSim();
    state.drawMs = DRAW_FULL_MS;
    state.prevButtons = BTN.FIRE;
    expect(stepCombat(state, input, 1000 / 30)).toHaveLength(1);
    expect(state.releaseCooldownMs).toBe(RELEASE_COOLDOWN_MS);
    state.prevButtons = BTN.FIRE;
    state.drawMs = DRAW_FULL_MS;
    expect(stepCombat(state, input, 1000 / 30)).toEqual([]);
  });

  it("matches speed and damage table values", () => {
    expect(arrowSpeed(0)).toBe(ARROW_SPEED_MIN);
    expect(arrowSpeed(1)).toBe(ARROW_SPEED_MAX);
    expect(bodyDamage(0)).toBe(DMG_BODY_MIN);
    expect(bodyDamage(1)).toBe(DMG_BODY_MAX);
  });
});
