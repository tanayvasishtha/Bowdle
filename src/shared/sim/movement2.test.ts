import { describe, expect, it } from "vitest";
import { DODGE, FALL, RUN_SPEED, LANDING_GRACE, MANTLE, PLAYER_WIDTH, SLIDE_DECEL, SLIDE_JUMP_MULT, VINE_HOP, WALL_JUMP } from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import type { Box, MapData } from "../maps/types.ts";
import { fallCreditFor, isOutOfWorld } from "./fall.ts";
import { createPlayerSim, stepPlayer, type PlayerSim } from "./movement.ts";

/** Facing +x: yaw -90 degrees, so moveZ 1 runs toward +x. */
const east: PlayerInputFrame = { moveX: 0, moveZ: 0, yaw: -Math.PI / 2, pitch: 0, buttons: 0 };
const floor: Box = { id: "floor", min: [-60, -1, -20], max: [60, 0, 20], material: "earth", tags: ["solid"] };

function map(extra: Box[] = []): MapData {
  return {
    id: "m2", name: "m2", bounds: { min: [-60, -1, -20], max: [60, 20, 20] }, boxes: [floor, ...extra], ramps: [], volumes: [], zipLines: [], boulders: [], props: [],
    spawns: { sun: [], moon: [] }, waypoints: [], decor: [], notes: [], look: { sunShafts: false, stainSeed: 0 },
  };
}

let clock = 0;
function tick(state: PlayerSim, input: PlayerInputFrame, world: MapData, ticks = 1): void {
  for (let index = 0; index < ticks; index += 1) { stepPlayer(state, input, world, { nowMs: clock }); clock += 1000 / 30; }
}
const speedOf = (state: PlayerSim): number => Math.hypot(state.vx, state.vz);

describe("vine hop", () => {
  it("jumps once more in the air and comes back on landing", () => {
    const world = map(), state = createPlayerSim();
    tick(state, { ...east, buttons: BTN.JUMP }, world);
    tick(state, east, world, 8);
    expect(state.grounded).toBe(false);
    tick(state, { ...east, moveZ: 1, buttons: BTN.JUMP }, world);
    expect(state.airJumps).toBe(0);
    expect(state.vy).toBeGreaterThan(VINE_HOP.velocity - 1);
    expect(speedOf(state)).toBeGreaterThanOrEqual(VINE_HOP.minSpeed - 0.5);
    tick(state, east, world, 2);
    const falling = state.vy;
    tick(state, { ...east, buttons: BTN.JUMP }, world);
    expect(state.vy).toBeLessThan(falling);
    tick(state, east, world, 60);
    expect(state.grounded).toBe(true);
    expect(state.airJumps).toBe(VINE_HOP.perAirtime);
  });
});

describe("wall jump", () => {
  const wall: Box = { id: "wall", min: [2, 0, -5], max: [2.5, 6, 5], material: "stone", tags: ["solid"] };

  it("kicks off a wall touched a moment ago and restores the vine hop", () => {
    const world = map([wall]), state = createPlayerSim(0, 3, 0);
    state.grounded = false; state.coyoteMs = 0; state.vx = 8; state.airJumps = 0;
    tick(state, { ...east, moveZ: 1 }, world, 8);
    expect(state.wallTouchMs).toBeLessThanOrEqual(WALL_JUMP.touchMs);
    tick(state, { ...east, buttons: BTN.JUMP }, world);
    expect(state.wallJumps).toBe(1);
    expect(state.vx).toBeLessThan(-WALL_JUMP.push + 1);
    expect(state.airJumps).toBe(VINE_HOP.perAirtime);
    expect(state.wallJumpCooldownMs).toBeGreaterThan(0);
  });

  it("allows at most three before landing", () => {
    const world = map([wall]), state = createPlayerSim(1.6, 3, 0);
    state.grounded = false; state.coyoteMs = 0; state.wallJumps = WALL_JUMP.maxBeforeLanding; state.wallTouchMs = 0; state.wallNormalX = -1; state.airJumps = 0;
    tick(state, { ...east, buttons: BTN.JUMP }, world);
    expect(state.wallJumps).toBe(WALL_JUMP.maxBeforeLanding);
    expect(state.vy).toBeLessThan(0);
  });

  it("does nothing without a recent wall touch", () => {
    const world = map([wall]), state = createPlayerSim(-5, 3, 0);
    state.grounded = false; state.coyoteMs = 0; state.airJumps = 0;
    tick(state, { ...east, buttons: BTN.JUMP }, world);
    expect(state.wallJumps).toBe(0);
  });
});

describe("mantle", () => {
  function climb(height: number): PlayerSim {
    const ledge: Box = { id: "ledge", min: [1, 0, -3], max: [40, height, 3], material: "stone", tags: ["solid"] };
    const world = map([ledge]), state = createPlayerSim(0, 0, 0);
    tick(state, { ...east, moveZ: 1, buttons: BTN.JUMP }, world);
    tick(state, { ...east, moveZ: 1 }, world, 40);
    return state;
  }

  it("climbs ledges inside the height window", () => {
    const low = climb(MANTLE.minRise + 1);
    expect(low.y).toBeCloseTo(MANTLE.minRise + 1, 3);
    expect(low.x).toBeGreaterThan(1);
    const high = climb(2.2);
    expect(high.y).toBeCloseTo(2.2, 3);
    expect(high.x).toBeGreaterThan(1);
  });

  it("cannot climb a ledge too tall to reach", () => {
    const state = climb(3.6);
    expect(state.y).toBeLessThan(0.01);
    expect(state.x).toBeLessThan(1);
  });
});

describe("dodge", () => {
  it("bursts to at least the dodge speed and then waits out its cooldown", () => {
    const world = map(), state = createPlayerSim();
    tick(state, { ...east, moveZ: 1, buttons: BTN.DODGE }, world);
    expect(speedOf(state)).toBeGreaterThan(DODGE.minSpeed - 2);
    expect(state.dodgeCooldownMs).toBeGreaterThan(DODGE.cooldownMs - 100);
    tick(state, east, world, 20);
    tick(state, { ...east, moveZ: 1, buttons: BTN.DODGE }, world);
    expect(speedOf(state)).toBeLessThanOrEqual(RUN_SPEED + 1e-6);
  });

  it("dodges forward with no move input and lifts in the air", () => {
    const world = map(), state = createPlayerSim(0, 5, 0);
    state.grounded = false; state.coyoteMs = 0; state.yaw = -Math.PI / 2;
    tick(state, { ...east, buttons: BTN.DODGE }, world);
    expect(state.vx).toBeGreaterThan(DODGE.minSpeed - 1);
    expect(state.vy).toBeGreaterThan(0);
  });
});

describe("slide rework", () => {
  it("keeps sliding past the old time cap and slows at the decel rate", () => {
    const world = map(), state = createPlayerSim();
    state.vx = 8.5;
    tick(state, { ...east, buttons: BTN.CROUCH }, world);
    const start = speedOf(state);
    tick(state, { ...east, buttons: BTN.CROUCH }, world, 30);
    expect(state.sliding).toBe(true);
    expect(speedOf(state)).toBeCloseTo(start - SLIDE_DECEL * 1, 0);
    tick(state, { ...east, buttons: BTN.CROUCH }, world, 60);
    expect(state.sliding).toBe(false);
  });

  it("slide jumps carry a little extra speed", () => {
    const world = map(), state = createPlayerSim();
    state.vx = 8.5;
    tick(state, { ...east, buttons: BTN.CROUCH }, world, 3);
    const before = speedOf(state);
    tick(state, { ...east, buttons: BTN.CROUCH | BTN.JUMP }, world);
    expect(state.sliding).toBe(false);
    expect(speedOf(state)).toBeGreaterThan(before * (SLIDE_JUMP_MULT - 0.03));
  });
});

describe("landing grace", () => {
  it("keeps more speed after a fast landing", () => {
    const world = map();
    const fast = createPlayerSim(0, 0.2, 0); fast.grounded = false; fast.coyoteMs = 0; fast.vx = 12;
    let ticks = 0;
    while (!fast.grounded && ticks < 20) { tick(fast, east, world); ticks += 1; }
    expect(fast.landingGraceMs).toBeGreaterThan(0);
    tick(fast, east, world, 5);
    const slow = createPlayerSim(0, 0, 0); slow.vx = 12;
    tick(slow, east, world, 5 + 1);
    expect(speedOf(fast)).toBeGreaterThan(speedOf(slow) + 1);
    expect(LANDING_GRACE.frictionMult).toBeLessThan(1);
  });
});

describe("collision robustness", () => {
  it("never passes through a 0.1 m wall at 30 m/s", () => {
    const thin: Box = { id: "thin", min: [5, 0, -5], max: [5.1, 6, 5], material: "stone", tags: ["solid"] };
    const world = map([thin]), state = createPlayerSim(0, 1, 0);
    for (let index = 0; index < 5000; index += 1) {
      state.vx = 30; state.grounded = false;
      tick(state, east, world);
      expect(state.x).toBeLessThanOrEqual(5 - PLAYER_WIDTH / 2 + 1e-6);
    }
  });

  it("walks down a staircase without leaving the ground", () => {
    const steps: Box[] = [0, 1, 2, 3, 4].map((index) => ({ id: `step-${index}`, min: [index * 0.6, 0, -2], max: [index * 0.6 + 0.6, 1.5 - index * 0.3, 2], material: "stone", tags: ["solid"] }));
    const world = map(steps), state = createPlayerSim(0.3, 1.5, 0);
    let airborne = 0;
    for (let index = 0; index < 30; index += 1) { tick(state, { ...east, moveZ: 1 }, world); if (!state.grounded) airborne += 1; }
    expect(state.x).toBeGreaterThan(3);
    expect(airborne).toBe(0);
  });
});

describe("ramp sides", () => {
  const ramp = { id: "ramp", min: [0, 0, -1], max: [6, 4.8, 1], up: "+x", material: "wood", tags: ["solid"] } as const;
  const world = (): MapData => ({ ...map(), ramps: [ramp] });
  const north: PlayerInputFrame = { moveX: 0, moveZ: 1, yaw: Math.PI, pitch: 0, buttons: 0 };
  const south: PlayerInputFrame = { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 };

  it("stops a body walking into the side of a ramp", () => {
    const state = createPlayerSim(4, 0, -3);
    tick(state, north, world(), 30);
    expect(state.z).toBeLessThanOrEqual(-1 - PLAYER_WIDTH / 2 + 1e-6);
  });

  it("lets a body that landed overlapping the side walk back out", () => {
    const state = createPlayerSim(4, 0, -1.15);
    tick(state, south, world(), 15);
    expect(state.z).toBeLessThan(-2);
  });
});

describe("falling out of the world", () => {
  it("detects bodies below the kill depth and credits the latest recent attacker", () => {
    const world = map();
    expect(isOutOfWorld(world, world.bounds.min[1] - FALL.belowBoundsM + 0.1)).toBe(false);
    expect(isOutOfWorld(world, world.bounds.min[1] - FALL.belowBoundsM - 0.1)).toBe(true);
    const records = [{ attacker: "a", atMs: 1000 }, { attacker: "b", atMs: 3000 }];
    expect(fallCreditFor(records, 4000)).toBe("b");
    expect(fallCreditFor(records, 3000 + FALL.creditMs + 1)).toBeUndefined();
    expect(fallCreditFor([], 0)).toBeUndefined();
  });
});
