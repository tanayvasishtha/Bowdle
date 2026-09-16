import { describe, expect, it } from "vitest";
import { blockerRects, expandRect, rect, rectContains, scatterProps, treeLineProps, type ScatterKind } from "./scatter.ts";
import type { Box, SpawnPoint } from "./types.ts";

const kinds: readonly ScatterKind[] = [
  { kind: "fernClump", weight: 3, minScale: 0.8, maxScale: 1.4 },
  { kind: "rockPile", weight: 1, minScale: 0.6, maxScale: 1 },
];

const area = rect(-20, -20, 20, 20);

describe("scatterProps", () => {
  it("is deterministic for a seed", () => {
    const first = scatterProps({ seed: 7, area, count: 40, kinds, blockers: [] });
    const second = scatterProps({ seed: 7, area, count: 40, kinds, blockers: [] });
    expect(first).toEqual(second);
    expect(scatterProps({ seed: 8, area, count: 40, kinds, blockers: [] })).not.toEqual(first);
  });

  it("places props inside the area and never inside a blocker", () => {
    const blocker = rect(-6, -6, 6, 6);
    const props = scatterProps({ seed: 3, area, count: 60, kinds, blockers: [blocker], clearance: 1.5 });
    expect(props.length).toBeGreaterThan(30);
    for (const prop of props) {
      expect(rectContains(area, prop.pos[0], prop.pos[2])).toBe(true);
      expect(rectContains(expandRect(blocker, 1.5), prop.pos[0], prop.pos[2])).toBe(false);
    }
  });

  it("keeps props apart by the spacing", () => {
    const props = scatterProps({ seed: 11, area, count: 50, kinds, blockers: [], spacing: 3 });
    for (let a = 0; a < props.length; a += 1) {
      for (let b = a + 1; b < props.length; b += 1) {
        const left = props[a]!, right = props[b]!;
        expect(Math.hypot(left.pos[0] - right.pos[0], left.pos[2] - right.pos[2])).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("uses every kind and respects the scale range", () => {
    const props = scatterProps({ seed: 5, area, count: 80, kinds, blockers: [] });
    expect(new Set(props.map((prop) => prop.kind)).size).toBe(2);
    for (const prop of props) {
      const match = kinds.find((entry) => entry.kind === prop.kind)!;
      expect(prop.scale).toBeGreaterThanOrEqual(match.minScale);
      expect(prop.scale).toBeLessThanOrEqual(match.maxScale);
    }
  });
});

describe("blockerRects", () => {
  const floor: Box = { id: "floor", min: [-20, -1, -20], max: [20, 0, 20], material: "earth", tags: ["solid"] };
  const wall: Box = { id: "wall", min: [-2, 0, -2], max: [2, 4, 2], material: "stone", tags: ["solid"] };
  const ceiling: Box = { id: "ceiling", min: [-20, 12, -20], max: [20, 13, 20], material: "canopy", tags: ["solid", "invisible"] };
  const spawns: readonly SpawnPoint[] = [{ pos: [-16, 0, 0], yaw: 0 }];

  it("blocks standing geometry and spawns but not the floor", () => {
    const blockers = blockerRects({ boxes: [floor, wall, ceiling], spawns, spawnRadius: 3 });
    expect(blockers).toHaveLength(2);
    expect(blockers.some((blocker) => rectContains(blocker, 0, 0))).toBe(true);
    expect(blockers.some((blocker) => rectContains(blocker, -16, 0))).toBe(true);
    expect(blockers.some((blocker) => rectContains(blocker, 18, 18))).toBe(false);
  });

  it("keeps scattered props out of a boulder path", () => {
    const blockers = blockerRects({
      boulders: [{ id: "b", path: [[-10, 0, 0], [10, 0, 0]], lever: [0, 1, 0], alcoves: [] }],
      boulderRadius: 2.6,
    });
    const props = scatterProps({ seed: 2, area, count: 60, kinds, blockers });
    for (const prop of props) expect(Math.abs(prop.pos[2]) > 3.8 || Math.abs(prop.pos[0]) > 13.8).toBe(true);
  });
});

describe("treeLineProps", () => {
  it("rings the map with trees and stays deterministic", () => {
    const options = { seed: 21, outer: rect(-34, -26, 34, 26), depth: 6, spacing: 4 };
    const props = treeLineProps(options);
    expect(props.length).toBeGreaterThan(90);
    expect(treeLineProps(options)).toEqual(props);
    for (const prop of props) {
      const outside = Math.max(Math.abs(prop.pos[0]) - 34, Math.abs(prop.pos[2]) - 26);
      expect(outside).toBeGreaterThan(2.4);
      expect(outside).toBeLessThan(10.5);
    }
    expect(props.some((prop) => prop.kind === "giantTree")).toBe(true);
  });
});
