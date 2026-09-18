import { describe, expect, it } from "vitest";
import { ARROW_SPEED_MAX, HEAD_RADIUS } from "../constants.ts";
import { aimPointFromLook, spawnArrow, stepArrow } from "./arrows.ts";
import type { MapData } from "../maps/types.ts";

const emptyMap: MapData = {
  id: "empty", name: "empty",
  bounds: { min: [-200, -5, -200], max: [200, 40, 200] },
  boxes: [{ id: "floor", min: [-200, -1, -200], max: [200, 0, 200], material: "earth", tags: ["solid"] }],
  ramps: [], volumes: [], zipLines: [], boulders: [], props: [],
  spawns: { sun: [], moon: [] }, waypoints: [], decor: [], notes: [],
  look: { sunShafts: false, stainSeed: 0 },
};

function closestMiss(distance: number): number {
  const event = {
    type: "fire" as const,
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
    fraction: 1, speed: ARROW_SPEED_MAX, damage: 60, aimRange: distance,
  };
  const aim = aimPointFromLook(0, 0, 0, 0, 0, false, distance);
  const arrow = spawnArrow(event, false);
  const dt = 1 / 120;
  let best = Infinity;
  for (let i = 0; i < 2000 && !arrow.stuck; i += 1) {
    stepArrow(arrow, emptyMap, dt);
    const miss = Math.hypot(arrow.x - aim.x, arrow.y - aim.y, arrow.z - aim.z);
    if (miss < best) best = miss;
    if (arrow.z < aim.z - 2) break;
  }
  return best;
}

describe("aim convergence", () => {
  for (const distance of [10, 25, 40]) {
    it(`full draw at ${distance} m lands within a head radius of the crosshair`, () => {
      expect(closestMiss(distance)).toBeLessThanOrEqual(HEAD_RADIUS + 0.05);
    });
  }

  it("aims along the look ray", () => {
    const aim = aimPointFromLook(0, 0, 0, 0, 0, false, 25);
    expect(aim.z).toBeCloseTo(-25, 5);
    expect(aim.y).toBeGreaterThan(1);
  });
});
