import { describe, expect, it } from "vitest";
import { notebookMap } from "./notebook.ts";
import { rangeMap } from "./range.ts";
import type { MapData } from "./types.ts";
import { validateMap } from "./validate.ts";

function changed(change: Partial<MapData>): MapData {
  return { ...notebookMap, id: "test", ...change };
}

describe("map validation", () => {
  it("accepts Notebook Page", () => expect(validateMap(notebookMap)).toEqual([]));
  it("accepts Practice Range", () => expect(validateMap(rangeMap)).toEqual([]));

  it("rejects inverted boxes", () => {
    const boxes = [...notebookMap.boxes, { id: "bad", min: [1, 0, 0], max: [0, 1, 1], ink: "blue", tags: ["solid"] } as const];
    expect(validateMap(changed({ boxes }))).toContain("box dimensions: bad");
  });

  it("rejects boxes outside bounds", () => {
    const boxes = [...notebookMap.boxes, { id: "bad", min: [40, 0, 0], max: [41, 1, 1], ink: "blue", tags: ["solid"] } as const];
    expect(validateMap(changed({ boxes }))).toContain("box bounds: bad");
  });

  it("rejects asymmetric Notebook Page solids", () => {
    const boxes = notebookMap.boxes.filter((box) => box.id !== "green-mug");
    expect(validateMap({ ...notebookMap, boxes }).some((error) => error.startsWith("mirror symmetry"))).toBe(true);
  });

  it("rejects an obstructed spawn", () => {
    const blocker = { id: "bad", min: [-27.2, 0, -4.7], max: [-26.8, 2, -4.3], ink: "blue", tags: ["solid"] } as const;
    expect(validateMap(changed({ boxes: [...notebookMap.boxes, blocker] })).some((error) => error.startsWith("spawn overlap"))).toBe(true);
  });

  it("rejects a spawn without ground", () => {
    const spawns = { ...notebookMap.spawns, red: [{ pos: [0, 10, 0], yaw: 0 }] } as const;
    expect(validateMap(changed({ spawns })).some((error) => error.startsWith("spawn ground"))).toBe(true);
  });

  it("rejects stairs above step height", () => {
    const bad = { id: "bad-stair-2", min: [20, 0, 15], max: [21, 1, 16], ink: "blue", tags: ["solid", "stairs"] } as const;
    const first = { ...bad, id: "bad-stair-1", max: [21, 0.1, 16] } as const;
    expect(validateMap(changed({ boxes: [...notebookMap.boxes, first, bad] }))).toContain("stair height: bad-stair");
  });

  it("rejects mutually visible spawns", () => {
    const empty: MapData = { id: "test", name: "bad", bounds: { min: [-10, -1, -10], max: [10, 10, 10] }, boxes: [{ id: "floor", min: [-10, -1, -10], max: [10, 0, 10], ink: "blue", tags: ["solid"] }], spawns: { red: [{ pos: [-5, 0, 0], yaw: 0 }], green: [{ pos: [5, 0, 0], yaw: 0 }] }, waypoints: [], decor: [] };
    expect(validateMap(empty).some((error) => error.startsWith("spawn line of sight"))).toBe(true);
  });
});
