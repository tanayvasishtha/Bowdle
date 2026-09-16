import { describe, expect, it } from "vitest";
import { jungleDressing } from "./dressing.ts";
import { mirrorX } from "./helpers.ts";
import { rect, rectContains } from "./scatter.ts";
import type { Box, SpawnPoint } from "./types.ts";

const floor: Box = { id: "floor", min: [-34, -1, -26], max: [34, 0, 26], material: "earth", tags: ["solid"] };
const tower: Box = { id: "tower", min: [-6, 0, -6], max: [6, 8, 6], material: "stone", tags: ["solid"] };
const spawns: readonly SpawnPoint[] = [{ pos: [-29, 0, 0], yaw: 0 }, { pos: [29, 0, 0], yaw: Math.PI }];
const bounds = rect(-34, -26, 34, 26);

function dress() {
  return jungleDressing({ idPrefix: "test", seed: 900, bounds, blockers: { boxes: [floor, tower], spawns } });
}

describe("jungleDressing", () => {
  it("fills a map with scenery", () => {
    const { props, patches } = dress();
    expect(props.length).toBeGreaterThanOrEqual(120);
    expect(patches.length).toBeGreaterThan(0);
    expect(props.some((prop) => prop.kind === "giantTree")).toBe(true);
    expect(props.some((prop) => prop.kind === "fernClump" || prop.kind === "grassPatch")).toBe(true);
  });

  it("mirrors every prop and patch across x = 0", () => {
    const { props, patches } = dress();
    for (const prop of props) {
      const mirrored = mirrorX(prop);
      expect(props.some((candidate) => candidate.kind === mirrored.kind
        && Math.abs(candidate.pos[0] - mirrored.pos[0]) < 1e-9
        && Math.abs(candidate.pos[2] - mirrored.pos[2]) < 1e-9
        && Math.abs(candidate.yaw - mirrored.yaw) < 1e-9
        && candidate.scale === mirrored.scale && candidate.seed === mirrored.seed)).toBe(true);
    }
    for (const patch of patches) {
      const mirrored = mirrorX(patch, "check");
      expect(patches.some((candidate) => candidate.min[0] === mirrored.min[0] && candidate.max[0] === mirrored.max[0]
        && candidate.min[2] === mirrored.min[2] && candidate.material === mirrored.material)).toBe(true);
    }
  });

  it("keeps undergrowth out of buildings and spawns, and patches flush with the ground", () => {
    const { props, patches } = dress();
    const inside = props.filter((prop) => rectContains(bounds, prop.pos[0], prop.pos[2]));
    for (const prop of inside) {
      expect(rectContains(rect(-7, -7, 7, 7), prop.pos[0], prop.pos[2])).toBe(false);
      for (const spawn of spawns) expect(Math.hypot(prop.pos[0] - spawn.pos[0], prop.pos[2] - spawn.pos[2])).toBeGreaterThan(3);
    }
    for (const patch of patches) {
      expect(patch.max[1]).toBe(0);
      expect(patch.min[1]).toBeCloseTo(-0.06, 6);
      expect(patch.tags).toEqual([]);
      expect(rectContains(bounds, patch.min[0], patch.min[2])).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(dress()).toEqual(dress());
  });
});
