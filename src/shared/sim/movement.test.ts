import { describe, expect, it } from "vitest";
import { FLOOD_MS, JUMP_VELOCITY, MAX_HORIZONTAL_SPEED, RUN_SPEED, SLIDE_BOOST, WATER_SPEED_MULT } from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import type { MapData } from "../maps/types.ts";
import { createPlayerSim, stepPlayer, type PlayerSim } from "./movement.ts";

const idle: PlayerInputFrame = { moveX: 0, moveZ: 0, yaw: -Math.PI / 2, pitch: 0, buttons: 0 };

function arena(obstacleHeight = 0, obstacleX = 2, wallX = 100): MapData {
  const boxes: MapData["boxes"] = [
    { id: "floor", min: [-120, -1, -20], max: [120, 0, 20], material: "earth", tags: ["solid"] },
    { id: "wall", min: [wallX, 0, -20], max: [wallX + 0.1, 10, 20], material: "stone", tags: ["solid"] },
    ...(obstacleHeight > 0 ? [{ id: "step", min: [obstacleX, 0, -2] as const, max: [obstacleX + 3, obstacleHeight, 2] as const, material: "stone" as const, tags: ["solid"] as const }] : []),
  ];
  return { id: "test", name: "test", bounds: { min: [-120, -1, -20], max: [120, 10, 20] }, boxes, ramps: [], volumes: [], zipLines: [], boulders: [], props: [], spawns: { sun: [], moon: [] }, waypoints: [], decor: [], notes: [], look: { sunShafts: false, stainSeed: 0 } };
}

function run(state: PlayerSim, input: PlayerInputFrame, ticks: number, map = arena()): void {
  for (let tick = 0; tick < ticks; tick += 1) stepPlayer(state, input, map, { nowMs: tick * 1000 / 30 });
}

describe("movement", () => {
  it("ground acceleration reaches run speed", () => {
    const state = createPlayerSim();
    run(state, { ...idle, moveZ: 1 }, 60);
    expect(Math.hypot(state.vx, state.vz)).toBeCloseTo(RUN_SPEED, 6);
  });

  it("friction stops a grounded player", () => {
    const state = createPlayerSim();
    state.vx = RUN_SPEED;
    run(state, idle, 60);
    expect(Math.hypot(state.vx, state.vz)).toBe(0);
  });

  it("jump reaches the ballistic apex", () => {
    const state = createPlayerSim();
    stepPlayer(state, { ...idle, buttons: BTN.JUMP }, arena(), { nowMs: 0 });
    let apex = state.y;
    for (let tick = 1; tick < 45; tick += 1) {
      stepPlayer(state, idle, arena(), { nowMs: tick * 1000 / 30 });
      apex = Math.max(apex, state.y);
    }
    expect(apex).toBeGreaterThan(JUMP_VELOCITY * JUMP_VELOCITY / 40 - 0.08);
    expect(apex).toBeLessThan(JUMP_VELOCITY * JUMP_VELOCITY / 40 + 0.08);
  });

  it("air strafing gains speed but respects the cap", () => {
    const state = createPlayerSim();
    state.vx = RUN_SPEED;
    state.y = 8;
    state.grounded = false;
    run(state, { ...idle, moveX: 1 }, 20);
    expect(Math.hypot(state.vx, state.vz)).toBeGreaterThan(RUN_SPEED);
    expect(Math.hypot(state.vx, state.vz)).toBeLessThanOrEqual(MAX_HORIZONTAL_SPEED);
  });

  it("slide boosts then ends below its threshold", () => {
    const state = createPlayerSim();
    state.vx = RUN_SPEED;
    stepPlayer(state, { ...idle, buttons: BTN.CROUCH }, arena(), { nowMs: 0 });
    expect(Math.hypot(state.vx, state.vz)).toBeCloseTo(RUN_SPEED + SLIDE_BOOST, 1);
    expect(state.sliding).toBe(true);
    run(state, { ...idle, buttons: BTN.CROUCH }, 90);
    expect(state.sliding).toBe(false);
  });

  it("held jump preserves bunny-hop momentum", () => {
    const state = createPlayerSim();
    state.vx = RUN_SPEED;
    run(state, { ...idle, buttons: BTN.JUMP }, 90);
    expect(Math.hypot(state.vx, state.vz)).toBeGreaterThanOrEqual(RUN_SPEED - 0.01);
  });

  it("steps up 0.45 m and refuses 0.5 m", () => {
    const climb = createPlayerSim();
    run(climb, { ...idle, moveZ: 1 }, 10, arena(0.45));
    expect(climb.x).toBeGreaterThan(2);
    expect(climb.y).toBeCloseTo(0.45, 5);
    const blocked = createPlayerSim();
    run(blocked, { ...idle, moveZ: 1 }, 10, arena(0.5));
    expect(blocked.x).toBeLessThan(2);
    expect(blocked.y).toBe(0);
  });

  it("walks smoothly up and down ramps", () => {
    const map = { ...arena(), ramps: [{ id: "ramp", min: [1, 0, -2], max: [5, 2, 2], up: "+x", material: "earth", tags: ["solid"] }] } as MapData;
    const state = createPlayerSim();
    run(state, { ...idle, moveZ: 1 }, 25, map);
    expect(state.y).toBeGreaterThan(1);
    run(state, { ...idle, moveZ: -1 }, 25, map);
    expect(state.y).toBeCloseTo(0, 5);
    expect(state.grounded).toBe(true);
  });

  it("slows water movement, prevents slides, and applies flood only in its window", () => {
    const water = { ...arena(), volumes: [{ id: "water", min: [-20, 0, -20], max: [20, 1, 20], kind: "water", flood: true }] } as MapData;
    const flooded = createPlayerSim();
    run(flooded, { ...idle, moveZ: 1 }, 60, water);
    expect(Math.hypot(flooded.vx, flooded.vz)).toBeCloseTo(RUN_SPEED * WATER_SPEED_MULT, 5);
    flooded.vx = RUN_SPEED;
    stepPlayer(flooded, { ...idle, buttons: BTN.CROUCH }, water, { nowMs: 0 });
    expect(flooded.sliding).toBe(false);
    const raised = { ...water, boxes: [...water.boxes, { id: "raised-floor", min: [-20, 0, -20], max: [20, 1.2, 20], material: "earth", tags: ["solid"] }] } as MapData;
    const dryWindow = createPlayerSim(0, 1.2, 0);
    for (let tick = 0; tick < 60; tick += 1) stepPlayer(dryWindow, { ...idle, moveZ: 1 }, raised, { nowMs: FLOOD_MS });
    expect(Math.hypot(dryWindow.vx, dryWindow.vz)).toBeCloseTo(RUN_SPEED, 5);
    const floodWindow = createPlayerSim(0, 1.2, 0);
    for (let tick = 0; tick < 60; tick += 1) stepPlayer(floodWindow, { ...idle, moveZ: 1 }, raised, { nowMs: FLOOD_MS / 2 });
    expect(Math.hypot(floodWindow.vx, floodWindow.vz)).toBeCloseTo(RUN_SPEED * WATER_SPEED_MULT, 5);
  });

  it("never penetrates a thin wall after 10,000 substeps", () => {
    const state = createPlayerSim();
    state.vx = MAX_HORIZONTAL_SPEED;
    const input = { ...idle, moveZ: 1 };
    for (let tick = 0; tick < 5000; tick += 1) stepPlayer(state, input, arena(0, 2, 10), { nowMs: tick });
    expect(state.x).toBeLessThanOrEqual(10 - 0.7 / 2);
  });

  it("is deterministic across 600 input frames", () => {
    const first = createPlayerSim();
    const second = createPlayerSim();
    for (let tick = 0; tick < 600; tick += 1) {
      const input = { ...idle, moveZ: tick % 80 < 50 ? 1 : 0, moveX: tick % 120 < 60 ? 0.7 : -0.7, buttons: tick % 45 < 4 ? BTN.JUMP : 0 };
      stepPlayer(first, input, arena(), { nowMs: tick });
      stepPlayer(second, input, arena(), { nowMs: tick });
    }
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
