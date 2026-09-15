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
    const boxes = [...notebookMap.boxes, { id: "bad", min: [1, 0, 0], max: [0, 1, 1], material: "stone", tags: ["solid"] } as const];
    expect(validateMap(changed({ boxes }))).toContain("box dimensions: bad");
  });

  it("rejects boxes outside bounds", () => {
    const boxes = [...notebookMap.boxes, { id: "bad", min: [40, 0, 0], max: [41, 1, 1], material: "stone", tags: ["solid"] } as const];
    expect(validateMap(changed({ boxes }))).toContain("box bounds: bad");
  });

  it("rejects asymmetric journal solids", () => {
    const boxes = notebookMap.boxes.filter((box) => box.id !== "moon-mug");
    expect(validateMap({ ...notebookMap, boxes }).some((error) => error.startsWith("mirror symmetry"))).toBe(true);
  });

  it("rejects an obstructed spawn", () => {
    const blocker = { id: "bad", min: [-27.2, 0, -4.7], max: [-26.8, 2, -4.3], material: "stone", tags: ["solid"] } as const;
    expect(validateMap(changed({ boxes: [...notebookMap.boxes, blocker] })).some((error) => error.startsWith("spawn overlap"))).toBe(true);
  });

  it("rejects a spawn without ground", () => {
    const spawns = { ...notebookMap.spawns, sun: [{ pos: [0, 10, 0], yaw: 0 }] } as const;
    expect(validateMap(changed({ spawns })).some((error) => error.startsWith("spawn ground"))).toBe(true);
  });

  it("rejects stairs above step height", () => {
    const bad = { id: "bad-stair-2", min: [20, 0, 15], max: [21, 1, 16], material: "stone", tags: ["solid", "stairs"] } as const;
    const first = { ...bad, id: "bad-stair-1", max: [21, 0.1, 16] } as const;
    expect(validateMap(changed({ boxes: [...notebookMap.boxes, first, bad] }))).toContain("stair height: bad-stair");
  });

  it("rejects mutually visible spawns", () => {
    const empty: MapData = { id: "test", name: "bad", bounds: { min: [-10, -1, -10], max: [10, 10, 10] }, boxes: [{ id: "floor", min: [-10, -1, -10], max: [10, 0, 10], material: "stone", tags: ["solid"] }], spawns: { sun: [{ pos: [-5, 0, 0], yaw: 0 }], moon: [{ pos: [5, 0, 0], yaw: 0 }] }, waypoints: [], decor: [] };
    expect(validateMap(empty).some((error) => error.startsWith("spawn line of sight"))).toBe(true);
  });

  it("rejects a disconnected waypoint graph", () => {
    const waypoints = [...notebookMap.waypoints, { id: "island", pos: [0, 0, 19], links: [] } as const];
    expect(validateMap(changed({ waypoints }))).toContain("waypoint graph: disconnected");
  });

  it("rejects a blocked walk link", () => {
    const waypoints = [{ id: "a", pos: [-29, 0, 0], links: [{ to: "b", kind: "walk" }] }, { id: "b", pos: [-21, 0, 0], links: [{ to: "a", kind: "walk" }] }] as const;
    expect(validateMap(changed({ waypoints })).some((error) => error.startsWith("waypoint walk"))).toBe(true);
  });

  it("rejects a spawn without a nearby visible waypoint", () => {
    expect(validateMap(changed({ waypoints: notebookMap.waypoints.filter((point) => !point.id.startsWith("sun-spawn")) })).some((error) => error.startsWith("spawn waypoint"))).toBe(true);
  });
});
