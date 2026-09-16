import { describe, expect, it } from "vitest";
import { DRAW_FULL_MS, HEAD_MULT, MELEE_COOLDOWN_MS, QUIVER, SWAT, ZIP_SPEED } from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import type { MapData, Vec3Tuple } from "../maps/types.ts";
import { headMultiplier, spawnVolley } from "./arrows.ts";
import { bodyDamage, drawFraction, stepCombat, type FireEvent } from "./bow.ts";
import { inSwatWindow, swatHits } from "./melee.ts";
import { createPlayerSim, stepPlayer, type PlayerSim } from "./movement.ts";
import { tetherExpired, tetherLine } from "./tether.ts";

const TICK = 1000 / 30;
const idle: PlayerInputFrame = { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 };

function press(state: PlayerSim, buttons: number): void {
  stepCombat(state, { ...idle, buttons }, TICK); state.prevButtons = buttons;
  stepCombat(state, idle, TICK); state.prevButtons = 0;
}

/** Holds fire for drawMs and releases; returns what the release shot. */
function shoot(state: PlayerSim, drawMs: number): FireEvent[] {
  state.prevButtons = BTN.FIRE; state.drawMs = drawMs; state.releaseCooldownMs = 0;
  const events = stepCombat(state, idle, TICK).filter((event): event is FireEvent => event.type === "fire");
  state.prevButtons = 0;
  return events;
}

describe("quiver slots", () => {
  it("selects with the slot keys and steps with the wheel, wrapping around", () => {
    const state = createPlayerSim();
    press(state, BTN.SLOT3); expect(state.arrowSlot).toBe(2);
    press(state, BTN.SLOT_NEXT); expect(state.arrowSlot).toBe(0);
    press(state, BTN.SLOT_PREV); expect(state.arrowSlot).toBe(2);
    press(state, BTN.SLOT2); expect(state.arrowSlot).toBe(1);
    press(state, BTN.SLOT1); expect(state.arrowSlot).toBe(0);
  });
});

describe("scatter", () => {
  it("fires three arrows 4 degrees apart at 55 % damage, with a 1.5 headshot multiplier", () => {
    const event: FireEvent = { type: "fire", kind: "scatter", x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fraction: 1, speed: 80, damage: 33 };
    const volley = spawnVolley(event);
    expect(volley).toHaveLength(3);
    const yaws = volley.map((arrow) => Math.atan2(-arrow.vx, -arrow.vz) * 180 / Math.PI);
    expect(yaws[0]).toBeCloseTo(-QUIVER.scatter.spreadDeg, 6);
    expect(yaws[1]).toBeCloseTo(0, 6);
    expect(yaws[2]).toBeCloseTo(QUIVER.scatter.spreadDeg, 6);
    expect(volley.every((arrow) => arrow.kind === "scatter" && arrow.damage === 33)).toBe(true);
    expect(headMultiplier("scatter")).toBe(QUIVER.scatter.headMult);
    expect(headMultiplier("arrow")).toBe(HEAD_MULT);
    expect(spawnVolley({ ...event, kind: "arrow" })).toHaveLength(1);

    const state = createPlayerSim(); state.arrowSlot = 1;
    const [shot] = shoot(state, QUIVER.scatter.drawFullMs);
    expect(shot?.kind).toBe("scatter");
    expect(shot?.fraction).toBe(1);
    expect(shot?.damage).toBeCloseTo(bodyDamage(1) * QUIVER.scatter.damageMult, 9);
    expect(drawFraction(DRAW_FULL_MS, QUIVER.scatter.drawFullMs)).toBeLessThan(1);
  });

  it("spends charges, falls back to a broadhead when empty, and regains one charge every 6 s", () => {
    const state = createPlayerSim(); state.arrowSlot = 1;
    for (let charge = QUIVER.scatter.charges; charge > 0; charge -= 1) expect(shoot(state, 400)[0]?.kind).toBe("scatter");
    expect(state.scatterCharges).toBe(0);
    expect(shoot(state, 400)[0]?.kind).toBe("arrow");
    const ticksPerCharge = Math.ceil(QUIVER.scatter.rechargeMs / TICK);
    for (let tick = 0; tick < ticksPerCharge - 20; tick += 1) stepCombat(state, idle, TICK);
    expect(state.scatterCharges).toBe(0);
    for (let tick = 0; tick < 20; tick += 1) stepCombat(state, idle, TICK);
    expect(state.scatterCharges).toBe(1);
    for (let tick = 0; tick < ticksPerCharge * 2; tick += 1) stepCombat(state, idle, TICK);
    expect(state.scatterCharges).toBe(QUIVER.scatter.charges);
    expect(state.scatterRechargeMs).toBe(0);
  });
});

describe("tether", () => {
  it("needs a full draw and waits out its cooldown", () => {
    const state = createPlayerSim(); state.arrowSlot = 2;
    expect(shoot(state, DRAW_FULL_MS - 50)).toEqual([]);
    expect(shoot(state, DRAW_FULL_MS)[0]?.kind).toBe("tether");
    expect(state.tetherCooldownMs).toBe(QUIVER.tether.cooldownMs);
    expect(shoot(state, DRAW_FULL_MS)).toEqual([]);
    state.tetherCooldownMs = 0;
    expect(shoot(state, DRAW_FULL_MS)[0]?.kind).toBe("tether");
  });

  it("makes a line only for box hits 6 to 35 m away and no steeper than 35 degrees", () => {
    const release: Vec3Tuple = [0, 0, 0];
    const line = tetherLine("t", release, [20, 1.2, 0], true)!;
    expect(line.from).toEqual([0, QUIVER.tether.liftM, 0]);
    expect(line.to[0]).toBeCloseTo(20 - QUIVER.tether.endClearanceM, 9);
    expect(tetherLine("t", release, [20, 1.2, 0], false)).toBeNull();
    expect(tetherLine("t", release, [5.5, 1.2, 0], true)).toBeNull();
    expect(tetherLine("t", release, [36, 1.2, 0], true)).toBeNull();
    const rise = (degrees: number): Vec3Tuple => [10, QUIVER.tether.liftM + Math.tan(degrees * Math.PI / 180) * 10, 0];
    expect(tetherLine("t", release, rise(34), true)).not.toBeNull();
    expect(tetherLine("t", release, rise(36), true)).toBeNull();
    expect(tetherLine("t", release, [10, QUIVER.tether.liftM - Math.tan(36 * Math.PI / 180) * 10, 0], true)).toBeNull();
  });

  it("expires at its time", () => {
    expect(tetherExpired(10_000, 9_999)).toBe(false);
    expect(tetherExpired(10_000, 10_000)).toBe(true);
  });

  it("is ridden like a map zip line when the step context carries it", () => {
    const map: MapData = {
      id: "t", name: "t", bounds: { min: [-50, -1, -50], max: [50, 30, 50] }, boxes: [{ id: "floor", min: [-50, -1, -50], max: [50, 0, 50], material: "earth", tags: ["solid"] }],
      ramps: [], volumes: [], zipLines: [], boulders: [], props: [], spawns: { sun: [], moon: [] }, waypoints: [], decor: [], notes: [], look: { sunShafts: false, stainSeed: 0 },
    };
    const zip = tetherLine("tether-1", [0, 0, 0], [20, 3, 0], true)!;
    const state = createPlayerSim(0, 0, 0);
    stepPlayer(state, { ...idle, buttons: BTN.USE }, map, { nowMs: 0 });
    expect(state.zipId).toBe("");
    state.prevButtons = 0;
    stepPlayer(state, { ...idle, buttons: BTN.USE }, map, { nowMs: 0, zipLines: [zip] });
    expect(state.zipId).toBe("tether-1");
    for (let tick = 0; tick < 30; tick += 1) stepPlayer(state, idle, map, { nowMs: tick * TICK, zipLines: [zip] });
    expect(state.x).toBeGreaterThan(ZIP_SPEED * 0.8);
    stepPlayer(state, idle, map, { nowMs: 1000, zipLines: [] });
    expect(state.zipId).toBe("");
  });
});

describe("dagger swat", () => {
  const swinger = { x: 0, y: 0, z: 0, yaw: 0 };
  const chestY = 1.2;
  const crossing = (x: number, z: number) => [{ x: x - 0.5, y: chestY, z }, { x: x + 0.5, y: chestY, z }] as const;

  it("only swats during the start of the swing", () => {
    expect(inSwatWindow(MELEE_COOLDOWN_MS)).toBe(true);
    expect(inSwatWindow(MELEE_COOLDOWN_MS - SWAT.windowMs + 1)).toBe(true);
    expect(inSwatWindow(MELEE_COOLDOWN_MS - SWAT.windowMs)).toBe(false);
    expect(inSwatWindow(0)).toBe(false);
  });

  it("hits arrows close in front inside the arc and nothing else", () => {
    expect(swatHits(swinger, ...crossing(0, -1.5))).toBe(true);
    expect(swatHits(swinger, ...crossing(0, 1.5))).toBe(false);
    expect(swatHits(swinger, ...crossing(0, -SWAT.rangeM - 0.1))).toBe(false);
    const half = SWAT.arcDeg / 2 * Math.PI / 180, distance = 1.5;
    const inside = { x: Math.sin(half - 0.03) * distance, y: chestY, z: -Math.cos(half - 0.03) * distance };
    const outside = { x: Math.sin(half + 0.03) * distance, y: chestY, z: -Math.cos(half + 0.03) * distance };
    expect(swatHits(swinger, inside, inside)).toBe(true);
    expect(swatHits(swinger, outside, outside)).toBe(false);
  });
});
