import { describe, expect, it } from "vitest";
import { JUMP_VELOCITY, MAX_HORIZONTAL_SPEED, RUN_SPEED, SLIDE_BOOST, STEP_HEIGHT } from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import type { MapData } from "../maps/types.ts";
import { createPlayerSim, stepPlayer, type PlayerSim } from "./movement.ts";

const idle: PlayerInputFrame = { moveX: 0, moveZ: 0, yaw: -Math.PI / 2, pitch: 0, buttons: 0 };

function arena(obstacleHeight = 0, obstacleX = 2, wallX = 100): MapData {
  const boxes: MapData["boxes"] = [
    { id: "floor", min: [-120, -1, -20], max: [120, 0, 20], ink: "blue", tags: ["solid"] },
    { id: "wall", min: [wallX, 0, -20], max: [wallX + 0.1, 10, 20], ink: "blue", tags: ["solid"] },
    ...(obstacleHeight > 0 ? [{ id: "step", min: [obstacleX, 0, -2] as const, max: [obstacleX + 3, obstacleHeight, 2] as const, ink: "blue" as const, tags: ["solid"] as const }] : []),
  ];
  return { id: "test", name: "test", bounds: { min: [-120, -1, -20], max: [120, 10, 20] }, boxes, spawns: { red: [], green: [] }, waypoints: [], decor: [] };
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
    run(climb, { ...idle, moveZ: 1 }, 10, arena(STEP_HEIGHT));
    expect(climb.x).toBeGreaterThan(2);
    expect(climb.y).toBeCloseTo(STEP_HEIGHT, 5);
    const blocked = createPlayerSim();
    run(blocked, { ...idle, moveZ: 1 }, 10, arena(0.5));
    expect(blocked.x).toBeLessThan(2);
    expect(blocked.y).toBe(0);
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
