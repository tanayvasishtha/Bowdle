import { describe, expect, it } from "vitest";
import { ARROW_SPEED_MAX, EYE_STAND, HEAD_RADIUS } from "../constants.ts";
import { aimPointFromLook, aimRangeAlongLook, predictLanding, spawnArrow, stepArrow, sweepArrowVsTarget } from "./arrows.ts";
import { arrowSpeed } from "./bow.ts";
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
  const look = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  const standing = (z: number) => ({ x: 0, y: 0, z, height: 1.8, crouched: false });
  const wallAt = (z: number): MapData => ({ ...emptyMap, boxes: [...emptyMap.boxes, { id: "wall", min: [-3, 0, z - 0.5], max: [3, 4, z], material: "stone", tags: ["solid"] }] });

  it("the crosshair raycast stops at the first wall, target or the 200 m cap", () => {
    expect(aimRangeAlongLook(look, false, emptyMap, [])).toBe(200);
    expect(aimRangeAlongLook(look, false, wallAt(-15), [])).toBeCloseTo(15, 0);
    expect(aimRangeAlongLook(look, false, emptyMap, [standing(-25)])).toBeCloseTo(25, 0);
    // A player behind a wall is not what the crosshair points at.
    expect(aimRangeAlongLook(look, false, wallAt(-15), [standing(-25)])).toBeCloseTo(15, 0);
  });

  it("an arrow aimed with the raycast range hits the target under the crosshair", () => {
    const target = standing(-25);
    // Look at the chest of the target from eye height.
    const pitch = Math.atan2(1.2 - 1.6, 25);
    const event = { type: "fire" as const, ...look, pitch, fraction: 1, speed: ARROW_SPEED_MAX, damage: 60 };
    const arrow = spawnArrow({ ...event, aimRange: aimRangeAlongLook(event, false, emptyMap, [target]) }, false);
    let hit = false;
    for (let i = 0; i < 400 && !hit && !arrow.stuck; i += 1) {
      const from = { x: arrow.x, y: arrow.y, z: arrow.z };
      stepArrow(arrow, emptyMap, 1 / 120);
      hit = sweepArrowVsTarget(from, { x: arrow.x, y: arrow.y, z: arrow.z }, target, "arrow") !== null;
    }
    expect(hit).toBe(true);
  });

  for (const distance of [10, 25, 40]) {
    it(`full draw at ${distance} m lands within a head radius of the crosshair`, () => {
      expect(closestMiss(distance)).toBeLessThanOrEqual(HEAD_RADIUS + 0.05);
    });
  }

  it("predicts the landing point on the wall under the crosshair, at full and partial draw", () => {
    const wall = wallAt(-20);
    for (const fraction of [1, 0.4]) {
      const event = { type: "fire" as const, ...look, pitch: 0, fraction, speed: arrowSpeed(fraction), damage: 60 };
      const landing = predictLanding({ ...event, aimRange: aimRangeAlongLook(event, false, wall, []) }, false, wall, [], { x: 0, y: 0, z: 0, kind: "none" });
      expect(landing.kind).toBe("world");
      // The crosshair ray from the eye (1.6 m up) meets the wall face at z = -20.
      expect(Math.hypot(landing.x, landing.y - EYE_STAND, landing.z + 20)).toBeLessThan(0.1);
    }
  });

  it("predicts a hit on the player under the crosshair", () => {
    const target = standing(-25);
    const pitch = Math.atan2(1.2 - EYE_STAND, 25);
    const event = { type: "fire" as const, ...look, pitch, fraction: 1, speed: ARROW_SPEED_MAX, damage: 60 };
    const landing = predictLanding({ ...event, aimRange: aimRangeAlongLook(event, false, emptyMap, [target]) }, false, emptyMap, [target], { x: 0, y: 0, z: 0, kind: "none" });
    expect(landing.kind).toBe("body");
    expect(landing.z).toBeGreaterThan(-25.5);
  });

  it("shows a shot with nothing under the crosshair dropping onto the ground, and none for one that outlives the arrow", () => {
    const shot = (pitch: number) => {
      const event = { type: "fire" as const, ...look, pitch, fraction: 1, speed: ARROW_SPEED_MAX, damage: 60 };
      return predictLanding({ ...event, aimRange: aimRangeAlongLook(event, false, emptyMap, []) }, false, emptyMap, [], { x: 0, y: 0, z: 0, kind: "none" });
    };
    const level = shot(0.01);
    expect(level.kind).toBe("world");
    expect(level.y).toBeLessThan(0.1);
    expect(level.z).toBeLessThan(-100);
    expect(shot(0.2).kind).toBe("none");
  });

  it("aims along the look ray", () => {
    const aim = aimPointFromLook(0, 0, 0, 0, 0, false, 25);
    expect(aim.z).toBeCloseTo(-25, 5);
    expect(aim.y).toBeGreaterThan(1);
  });
});
