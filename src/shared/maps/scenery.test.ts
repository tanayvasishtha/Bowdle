import { describe, expect, it } from "vitest";
import { campMap } from "./camp.ts";
import { matchMaps } from "./registry.ts";
import { rect } from "./scatter.ts";
import { canSeePoint, spawnsSeeingLandmark, unbackedTallProps } from "./scenery.ts";
import type { MapData } from "./types.ts";
import { validateMap } from "./validate.ts";

const LAUNCH_PLAY_AREA = rect(-34, -26, 34, 26);
function playAreaFor(map: MapData) {
  return rect(map.bounds.min[0] + 2, map.bounds.min[2] + 2, map.bounds.max[0] - 2, map.bounds.max[2] - 2);
}
const CAMP_PLAY_AREA = rect(-15.5, -81.5, 15.5, 9.5);

describe("launch map scenery", () => {
  for (const map of matchMaps) {
    it(`${map.id}: every tall prop inside the arena stands on a collider`, () => {
      expect(unbackedTallProps(map, playAreaFor(map))).toEqual([]);
    });

    it(`${map.id}: both teams can see the landmark from their spawn area`, () => {
      expect(map.landmark, "landmark defined").toBeDefined();
      expect(spawnsSeeingLandmark(map, map.spawns.sun)).toBeGreaterThanOrEqual(2);
      expect(spawnsSeeingLandmark(map, map.spawns.moon)).toBeGreaterThanOrEqual(2);
    });

    it(`${map.id}: still passes map validation`, () => {
      expect(validateMap(map)).toEqual([]);
    });
  }

  it("camp: tall props inside the trail stand on colliders", () => {
    expect(unbackedTallProps(campMap, CAMP_PLAY_AREA)).toEqual([]);
  });
});

describe("scenery rules", () => {
  const base: MapData = {
    id: "fixture", name: "Fixture", bounds: { min: [-10, -1, -10], max: [10, 10, 10] },
    boxes: [
      { id: "floor", min: [-10, -1, -10], max: [10, 0, 10], material: "earth", tags: ["solid"] },
      { id: "wall", min: [-1, 0, -1], max: [1, 3, 1], material: "stone", tags: ["solid"] },
    ],
    ramps: [], volumes: [], zipLines: [], boulders: [], waypoints: [], decor: [], notes: [],
    props: [
      { kind: "pillar", pos: [0, 0, 0], yaw: 0, scale: 1, seed: 1 },
      { kind: "giantTree", pos: [5, 0, 5], yaw: 0, scale: 1, seed: 2 },
      { kind: "fernClump", pos: [-5, 0, -5], yaw: 0, scale: 1, seed: 3 },
    ],
    spawns: { sun: [{ pos: [-8, 0, 0], yaw: 0 }], moon: [{ pos: [8, 0, 0], yaw: 0 }] },
    look: { sunShafts: false, stainSeed: 1 },
    landmark: [0, 6, 0],
  };

  it("flags tall props with nothing solid under them and ignores low ones", () => {
    expect(unbackedTallProps(base, rect(-10, -10, 10, 10))).toEqual(["giantTree at 5.0, 5.0"]);
  });

  it("ignores tall props outside the play area", () => {
    expect(unbackedTallProps(base, rect(-4, -4, 4, 4))).toEqual([]);
  });

  it("blocks sight lines through solid boxes only", () => {
    expect(canSeePoint(base, [-8, 1.6, 0], [8, 1.6, 0])).toBe(false);
    expect(canSeePoint(base, [-8, 1.6, 5], [8, 1.6, 5])).toBe(true);
    expect(spawnsSeeingLandmark(base, base.spawns.sun)).toBe(1);
  });
});
