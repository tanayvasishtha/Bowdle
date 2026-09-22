import { describe, expect, it } from "vitest";
import { setFeatureOverride } from "../features.ts";
import { GRAPPLE, GRAPPLE_COOLDOWN_MS, GRAPPLE_RANGE, INK_CLOUD_COOLDOWN_MS, VINE_HOP } from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import type { MapData } from "../maps/types.ts";
import { segmentDistance } from "../math/segments.ts";
import { createPlayerSim, stepPlayer, type PlayerSim } from "./movement.ts";
import { ropeSegment, sphereBlocksSight, stepAbilityInput, tryAttachGrapple } from "./abilities.ts";

const input: PlayerInputFrame = { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: BTN.GRAPPLE };

function mapAt(distance: number, grapple = true): MapData {
  return {
    id: "ability-test", name: "Ability test", bounds: { min: [-50, -5, -50], max: [50, 50, 50] },
    boxes: [{ id: "target", min: [-1, 0, -distance - 1], max: [1, 4, -distance], material: "gold", tags: grapple ? ["solid", "grapple"] : ["solid"] }],
    ramps: [], volumes: [], zipLines: [], boulders: [], props: [], spawns: { sun: [], moon: [] }, waypoints: [], decor: [], notes: [], look: { sunShafts: false, stainSeed: 0 },
  };
}

describe("grapple", () => {
  it("attaches only to tagged boxes in range, with a rope a little shorter than the distance", () => {
    const player = createPlayerSim();
    expect(tryAttachGrapple(player, input, mapAt(10, false))).toBeNull();
    expect(player.grappleActive).toBe(false);
    expect(tryAttachGrapple(player, input, mapAt(GRAPPLE_RANGE + 1))).toBeNull();
    const event = tryAttachGrapple(player, input, mapAt(10));
    expect(event?.type).toBe("grapple");
    expect(player.grappleActive).toBe(true);
    expect(player.grappleZ).toBeCloseTo(-10);
    const distance = Math.hypot(player.grappleY - player.height / 2, 10);
    expect(player.grappleLen).toBeCloseTo(distance * GRAPPLE.lengthFactor, 5);
    const near = createPlayerSim();
    tryAttachGrapple(near, input, mapAt(0.5));
    expect(near.grappleLen).toBe(GRAPPLE.minLength);
  });

  it("starts the cooldown on detach, a short one on a miss, and emits an ink lob", () => {
    const player = createPlayerSim();
    const grapple = stepAbilityInput(player, input, mapAt(10), 0);
    expect(grapple[0]?.type).toBe("grapple");
    expect(player.grappleCooldownMs).toBe(0);
    player.prevButtons = 0;
    stepAbilityInput(player, input, mapAt(10), 0);
    expect(player.grappleActive).toBe(true);
    stepAbilityInput(player, { ...input, buttons: BTN.CROUCH }, mapAt(10), 0);
    expect(player.grappleActive).toBe(false);
    expect(player.grappleCooldownMs).toBe(GRAPPLE_COOLDOWN_MS);
    const misser = createPlayerSim();
    expect(stepAbilityInput(misser, input, mapAt(10, false), 0)).toHaveLength(0);
    expect(misser.grappleCooldownMs).toBe(GRAPPLE.missCooldownMs);
    player.prevButtons = 0;
    setFeatureOverride("inkCloud", true);
    const ink = stepAbilityInput(player, { ...input, buttons: BTN.INK }, mapAt(10), 0);
    setFeatureOverride("inkCloud", undefined);
    expect(ink[0]?.type).toBe("ink");
    expect(player.inkCooldownMs).toBe(INK_CLOUD_COOLDOWN_MS);
  });
});

describe("swing", () => {
  const open: MapData = { ...mapAt(10, false), boxes: [{ id: "floor", min: [-50, -1, -50], max: [50, 0, 50], material: "earth", tags: ["solid"] }] };
  const idle: PlayerInputFrame = { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 };
  let clock = 0;
  function tick(state: PlayerSim, frame: PlayerInputFrame, world: MapData, ticks = 1): void {
    for (let index = 0; index < ticks; index += 1) { stepPlayer(state, frame, world, { nowMs: clock }); clock += 1000 / 30; }
  }
  function hang(x: number, y: number, vx = 0): PlayerSim {
    const state = createPlayerSim(x, y, 0);
    state.grounded = false; state.coyoteMs = 0; state.vx = vx;
    state.grappleActive = true; state.grappleX = 0; state.grappleY = 12; state.grappleZ = 0;
    state.grappleLen = ropeLength(state);
    return state;
  }
  const ropeLength = (state: PlayerSim): number => Math.hypot(state.x - state.grappleX, state.y + state.height / 2 - state.grappleY, state.z - state.grappleZ);

  it("never lets the body end farther from the anchor than the rope length", () => {
    const state = hang(6, 4, 12), length = state.grappleLen;
    for (let frame = 0; frame < 120 && state.grappleActive; frame += 1) {
      tick(state, idle, open);
      expect(ropeLength(state)).toBeLessThanOrEqual(length + 0.05);
    }
    expect(state.grappleActive).toBe(true);
  });

  it("swings through the bottom and up the other side", () => {
    const state = hang(6, 6);
    let lowest = Infinity, farthest = 0;
    for (let frame = 0; frame < 60; frame += 1) { tick(state, idle, open); lowest = Math.min(lowest, state.y); farthest = Math.min(farthest, state.x); }
    expect(lowest).toBeLessThan(4);
    expect(farthest).toBeLessThan(-3);
  });

  it("reels in at the reel speed while held and pulls toward the anchor", () => {
    const state = hang(0, 2), start = state.grappleLen;
    state.prevButtons = BTN.GRAPPLE;
    tick(state, { ...idle, buttons: BTN.GRAPPLE }, open, 15);
    expect(state.grappleReeling).toBe(true);
    expect(start - state.grappleLen).toBeGreaterThanOrEqual(GRAPPLE.reelSpeed * 0.5 - 1e-6);
    expect(state.vy).toBeGreaterThan(0);
    expect(Math.hypot(state.vx, state.vy, state.vz)).toBeLessThanOrEqual(GRAPPLE.maxPullSpeed + 1);
  });

  it("launches off the rope with a jump, keeps the vine hop and starts the cooldown", () => {
    const state = hang(0, 3, 8); state.airJumps = 0;
    tick(state, { ...idle, buttons: BTN.JUMP }, open);
    expect(state.grappleActive).toBe(false);
    expect(state.grappleCooldownMs).toBe(GRAPPLE_COOLDOWN_MS);
    expect(state.airJumps).toBe(VINE_HOP.perAirtime);
    expect(state.vx).toBeGreaterThan(8 + GRAPPLE.launchAlong - 0.5);
    expect(state.vy).toBeGreaterThan(GRAPPLE.launchUp - 1);
  });

  it("pays the rope out instead of letting go when a wall stops the pull", () => {
    const post: MapData = { ...open, boxes: [...open.boxes, { id: "post", min: [2, 0, -2], max: [2.6, 6, 2], material: "wood", tags: ["solid"] }] };
    const state = createPlayerSim(3, 0, 0);
    state.grappleActive = true; state.grappleX = -6; state.grappleY = 2; state.grappleZ = 0; state.grappleLen = 6; state.prevButtons = BTN.GRAPPLE;
    tick(state, { ...idle, buttons: BTN.GRAPPLE }, post, 3);
    expect(state.grappleActive).toBe(true);
    expect(state.x).toBeGreaterThanOrEqual(2.6 + 0.35 - 1e-6);
  });

  it("lets go after the time limit", () => {
    const state = hang(0, 3); state.grappleMs = GRAPPLE.maxMs - 10;
    tick(state, idle, open);
    expect(state.grappleActive).toBe(false);
  });

  it("lets go when something blocks the rope for a moment", () => {
    const slab: MapData = { ...open, boxes: [...open.boxes, { id: "slab", min: [-2, 7, -2], max: [2, 7.3, 2], material: "wood", tags: ["solid"] }] };
    const state = hang(0, 3);
    tick(state, idle, slab, 8);
    expect(state.grappleActive).toBe(true);
    tick(state, idle, slab, 2);
    expect(state.grappleActive).toBe(false);
  });
});

describe("rope cutting", () => {
  it("cuts only when an arrow step passes within the cut radius", () => {
    const owner = { x: 0, y: 0, z: 0, height: 1.8, grappleX: 0, grappleY: 10, grappleZ: 0 };
    const from = { x: 0, y: 0, z: 0 }, to = { x: 0, y: 0, z: 0 };
    ropeSegment(owner, from, to);
    expect(from.y).toBeCloseTo(0.9);
    expect(segmentDistance({ x: -1, y: 5, z: 0.2 }, { x: 1, y: 5, z: 0.2 }, from, to)).toBeLessThan(GRAPPLE.cutRadius);
    expect(segmentDistance({ x: -1, y: 5, z: 0.3 }, { x: 1, y: 5, z: 0.3 }, from, to)).toBeGreaterThanOrEqual(GRAPPLE.cutRadius);
    expect(segmentDistance({ x: -1, y: 11, z: 0 }, { x: 1, y: 11, z: 0 }, from, to)).toBeGreaterThanOrEqual(GRAPPLE.cutRadius);
  });
});

describe("ink vision", () => {
  it("blocks a line-of-sight ray through its center", () => {
    const from = { x: -10, y: 2, z: 0, radius: 0 };
    const to = { x: 10, y: 2, z: 0, radius: 0 };
    expect(sphereBlocksSight(from, to, { x: 0, y: 2, z: 0, radius: 4.5 })).toBe(true);
    expect(sphereBlocksSight(from, to, { x: 0, y: 8, z: 0, radius: 4.5 })).toBe(false);
  });
});
