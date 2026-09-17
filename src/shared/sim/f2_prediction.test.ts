import { describe, expect, it } from "vitest";
import { createPlayerSim, stepPlayer } from "./movement.ts";
import { createBreakables, mergeBreakablesIntoMap } from "./mapFeatures.ts";
import { anchorPosAt } from "../maps/kit.ts";
import type { MapData } from "../maps/types.ts";
import { BTN } from "../input.ts";

const geyserMap = {
  id: "f2-geyser",
  name: "F2",
  bounds: { min: [-10, -2, -10], max: [10, 10, 10] },
  boxes: [],
  ramps: [],
  volumes: [],
  zipLines: [],
  boulders: [],
  props: [],
  geysers: [{ id: "g1", pos: [0, 0, 0], radius: 2, launch: 16 }],
  anchors: [],
  herbs: [],
  breakables: [],
} as unknown as MapData;

const wallMap = {
  id: "f2-wall",
  name: "F2 Wall",
  bounds: { min: [-20, -2, -20], max: [20, 12, 20] },
  boxes: [{ id: "floor", min: [-20, -1, -20], max: [20, 0, 20], material: "stone", tags: ["solid"] }],
  ramps: [],
  volumes: [],
  zipLines: [],
  boulders: [],
  props: [],
  geysers: [],
  anchors: [],
  herbs: [],
  breakables: [{ id: "plank", hp: 40, box: { min: [-1, 0, 2], max: [1, 3, 2.4] } }],
} as unknown as MapData;

const bridgeMap = {
  id: "f2-bridge",
  name: "F2 Bridge",
  bounds: { min: [-20, -2, -20], max: [20, 20, 20] },
  boxes: [],
  ramps: [],
  volumes: [],
  zipLines: [],
  boulders: [],
  props: [],
  geysers: [],
  herbs: [],
  breakables: [],
  anchors: [{ id: "swing", pos: [0, 8, 0], sway: { axis: "x", amplitude: 3, periodS: 2 } }],
} as unknown as MapData;

describe("F2 prediction parity", () => {
  it("launches from a geyser inside stepPlayer with a shared launch map", () => {
    const launches = new Map<string, number>();
    const server = createPlayerSim(0, 0.1, 0);
    const client = createPlayerSim(0, 0.1, 0);
    const input = { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0, prevButtons: 0 } as never;
    stepPlayer(server, input, geyserMap, { nowMs: 1000, matchTimeMs: 1000, geyserLaunches: launches, geyserPlayerId: "p1" });
    const serverVy = server.vy;
    const launches2 = new Map<string, number>();
    stepPlayer(client, input, geyserMap, { nowMs: 1000, matchTimeMs: 1000, geyserLaunches: launches2, geyserPlayerId: "p1" });
    expect(serverVy).toBeGreaterThanOrEqual(14);
    expect(client.vy).toBe(serverVy);
  });

  it("keeps unbroken breakables in the shared collision map with grapple tags", () => {
    const items = createBreakables(wallMap);
    const play = mergeBreakablesIntoMap(wallMap, items);
    expect(play.boxes.some((box) => box.id.startsWith("breakable-solid-"))).toBe(true);
    expect(play.boxes.some((box) => box.tags.includes("grapple"))).toBe(true);
    items[0]!.broken = true;
    const open = mergeBreakablesIntoMap(wallMap, items);
    expect(open.boxes.some((box) => box.id.startsWith("breakable-solid-"))).toBe(false);
  });

  it("resamples a swinging anchor each tick while grappled", () => {
    const player = createPlayerSim(0, 1, 0);
    player.grappleActive = true;
    player.grappleAnchorId = "swing";
    player.grappleLen = 8;
    player.grappleX = 0; player.grappleY = 8; player.grappleZ = 0;
    const [x0] = anchorPosAt(bridgeMap.anchors![0]!, 0);
    const held = { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: BTN.GRAPPLE, prevButtons: BTN.GRAPPLE } as never;
    stepPlayer(player, held, bridgeMap, { nowMs: 500, matchTimeMs: 500 });
    const [x1] = anchorPosAt(bridgeMap.anchors![0]!, 500);
    expect(player.grappleX).toBeCloseTo(x1, 3);
    expect(Math.abs(x1 - x0)).toBeGreaterThan(0.2);
  });
});
