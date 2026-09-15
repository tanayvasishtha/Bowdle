import { describe, expect, it } from "vitest";
import { notebookMap } from "./notebook.ts";
import { rangeMap } from "./range.ts";
import { kitMap } from "./fixtures/kit.ts";
import type { MapData } from "./types.ts";
import { validateMap } from "./validate.ts";

function changed(change: Partial<MapData>): MapData {
  return { ...notebookMap, id: "test", ...change };
}

describe("map validation", () => {
  it("accepts Notebook Page", () => expect(validateMap(notebookMap)).toEqual([]));
  it("accepts Practice Range", () => expect(validateMap(rangeMap)).toEqual([]));
  it("accepts the jungle map kit", () => expect(validateMap(kitMap)).toEqual([]));

  it("rejects a ramp over the slope limit", () => {
    const steep = { ...kitMap.ramps[0]!, max: [-7, 5, 2] as const };
    expect(validateMap({ ...kitMap, ramps: [steep] })).toContain(`ramp slope: ${steep.id}`);
  });

  it("rejects an unsupported ramp end", () => {
    const unsupported = { ...kitMap.ramps[0]!, min: [-8, 4, -2] as const, max: [-4, 6, 2] as const };
    expect(validateMap({ ...kitMap, ramps: [unsupported] })).toContain(`ramp end: ${unsupported.id}`);
  });

  it("rejects a floating volume", () => {
    expect(validateMap({ ...kitMap, volumes: [{ ...kitMap.volumes[0]!, min: [-13, 5, -13], max: [-9, 6, -9] }] }).some((error) => error.startsWith("volume ground"))).toBe(true);
  });

  it("rejects an uphill zip line", () => {
    expect(validateMap({ ...kitMap, zipLines: [{ id: "uphill", from: [-12, 3, -10], to: [-5, 7, -10] }] })).toContain("zip direction: uphill");
  });

  it("rejects a zip line without collider clearance", () => {
    expect(validateMap({ ...kitMap, zipLines: [{ id: "blocked", from: [0, 4, 8], to: [0, 2, 8] }] })).toContain("zip clearance: blocked");
  });

  it("rejects a boulder sweep through a collider", () => {
    expect(validateMap({ ...kitMap, boulders: [{ ...kitMap.boulders[0]!, path: [[-8, 0, -6], [8, 0, -6]] }] })).toContain("boulder collider: center-boulder");
  });

  it("rejects an alcove touched by the boulder sweep", () => {
    const unsafe = { ...kitMap.boulders[0]!, alcoves: [{ min: [-2, 0, -7], max: [2, 2, -5] }] as const };
    expect(validateMap({ ...kitMap, boulders: [unsafe] })).toContain("boulder alcove: center-boulder");
  });

  it("rejects a boulder path too close to a spawn", () => {
    const nearSpawn = { ...kitMap.boulders[0]!, path: [[-18, 1.51, 8], [-12, 1.51, 8]] as const };
    expect(validateMap({ ...kitMap, boulders: [nearSpawn] })).toContain("boulder spawn: center-boulder");
  });

  it("checks mirror symmetry for every map-kit type", () => {
    expect(validateMap({ ...kitMap, ramps: [kitMap.ramps[0]!] }).some((error) => error.startsWith("mirror symmetry"))).toBe(true);
    expect(validateMap({ ...kitMap, volumes: [kitMap.volumes[0]!] }).some((error) => error.startsWith("mirror symmetry"))).toBe(true);
    expect(validateMap({ ...kitMap, zipLines: [kitMap.zipLines[0]!] }).some((error) => error.startsWith("mirror symmetry"))).toBe(true);
    expect(validateMap({ ...kitMap, boulders: [{ ...kitMap.boulders[0]!, lever: [1, 1, -3] }] }).some((error) => error.startsWith("mirror symmetry"))).toBe(true);
    expect(validateMap({ ...kitMap, props: [kitMap.props[0]!] }).some((error) => error.startsWith("mirror symmetry"))).toBe(true);
  });

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
    const empty: MapData = { id: "test", name: "bad", bounds: { min: [-10, -1, -10], max: [10, 10, 10] }, boxes: [{ id: "floor", min: [-10, -1, -10], max: [10, 0, 10], material: "stone", tags: ["solid"] }], ramps: [], volumes: [], zipLines: [], boulders: [], props: [], spawns: { sun: [{ pos: [-5, 0, 0], yaw: 0 }], moon: [{ pos: [5, 0, 0], yaw: 0 }] }, waypoints: [], decor: [], notes: [], look: { sunShafts: false, stainSeed: 0 } };
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
