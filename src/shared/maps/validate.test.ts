import { describe, expect, it } from "vitest";
import { kitMap } from "./fixtures/kit.ts";
import { sunTempleMap } from "./sunTemple.ts";
import { canopyMap } from "./canopy.ts";
import { campMap } from "./camp.ts";
import { lostRiverMap } from "./lostRiver.ts";
import { skyBridgesMap } from "./skyBridges.ts";
import { sunkenRuinsMap } from "./sunkenRuins.ts";
import { wildCrossingMap } from "./wildCrossing.ts";
import { homeGroveMap } from "./homeGrove.ts";
import type { MapData } from "./types.ts";
import { validateMap } from "./validate.ts";

function changed(change: Partial<MapData>): MapData {
  return { ...sunTempleMap, id: "test", ...change };
}

describe("map validation", () => {
  it("accepts the jungle map kit", () => expect(validateMap(kitMap)).toEqual([]));
  it("accepts Sun Temple", () => expect(validateMap(sunTempleMap)).toEqual([]));
  it("accepts Canopy Village", () => expect(validateMap(canopyMap)).toEqual([]));
  it("accepts Lost River", () => expect(validateMap(lostRiverMap)).toEqual([]));
  it("accepts Sky Bridges", () => expect(validateMap(skyBridgesMap)).toEqual([]));
  it("accepts Sunken Ruins", () => expect(validateMap(sunkenRuinsMap)).toEqual([]));
  it("accepts Wild Crossing", () => expect(validateMap(wildCrossingMap)).toEqual([]));
  it("accepts Home Grove", () => expect(validateMap(homeGroveMap)).toEqual([]));
  it("accepts Practice Camp", () => expect(validateMap(campMap)).toEqual([]));

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

  it("rejects a mirrored-pair miss on an anchor", () => {
    const anchors = [{ id: "sun-only", pos: [-5, 8, 0] as const, sway: { axis: "x" as const, amplitude: 1, periodS: 4 } }];
    expect(validateMap({ ...skyBridgesMap, anchors }).some((error) => error.startsWith("mirror symmetry"))).toBe(true);
  });

  it("checks mirror symmetry for every map-kit type", () => {
    expect(validateMap({ ...kitMap, ramps: [kitMap.ramps[0]!] }).some((error) => error.startsWith("mirror symmetry"))).toBe(true);
    expect(validateMap({ ...kitMap, volumes: [kitMap.volumes[0]!] }).some((error) => error.startsWith("mirror symmetry"))).toBe(true);
    expect(validateMap({ ...kitMap, zipLines: [kitMap.zipLines[0]!] }).some((error) => error.startsWith("mirror symmetry"))).toBe(true);
    expect(validateMap({ ...kitMap, boulders: [{ ...kitMap.boulders[0]!, lever: [1, 1, -3] }] }).some((error) => error.startsWith("mirror symmetry"))).toBe(true);
    expect(validateMap({ ...kitMap, props: [kitMap.props[0]!] }).some((error) => error.startsWith("mirror symmetry"))).toBe(true);
  });

  it("rejects inverted boxes", () => {
    const boxes = [...sunTempleMap.boxes, { id: "bad", min: [1, 0, 0], max: [0, 1, 1], material: "stone", tags: ["solid"] } as const];
    expect(validateMap(changed({ boxes }))).toContain("box dimensions: bad");
  });

  it("rejects boxes outside bounds", () => {
    const boxes = [...sunTempleMap.boxes, { id: "bad", min: [40, 0, 0], max: [41, 1, 1], material: "stone", tags: ["solid"] } as const];
    expect(validateMap(changed({ boxes }))).toContain("box bounds: bad");
  });

  it("rejects asymmetric arena solids", () => {
    const boxes = sunTempleMap.boxes.filter((box) => box.id !== "moon-courtyard-wall");
    expect(validateMap({ ...sunTempleMap, boxes }).some((error) => error.startsWith("mirror symmetry"))).toBe(true);
  });

  it("rejects an obstructed spawn", () => {
    const spawn = sunTempleMap.spawns.sun[0]!.pos;
    const blocker = { id: "bad", min: [spawn[0] - 0.2, 0, spawn[2] - 0.2], max: [spawn[0] + 0.2, 2, spawn[2] + 0.2], material: "stone", tags: ["solid"] } as const;
    expect(validateMap(changed({ boxes: [...sunTempleMap.boxes, blocker] })).some((error) => error.startsWith("spawn overlap"))).toBe(true);
  });

  it("rejects a spawn without ground", () => {
    const spawns = { ...sunTempleMap.spawns, sun: [{ pos: [0, 10, 0], yaw: 0 }] } as const;
    expect(validateMap(changed({ spawns })).some((error) => error.startsWith("spawn ground"))).toBe(true);
  });

  it("rejects stairs above step height", () => {
    const bad = { id: "bad-stair-2", min: [20, 0, 15], max: [21, 1, 16], material: "stone", tags: ["solid", "stairs"] } as const;
    const first = { ...bad, id: "bad-stair-1", max: [21, 0.1, 16] } as const;
    expect(validateMap(changed({ boxes: [...sunTempleMap.boxes, first, bad] }))).toContain("stair height: bad-stair");
  });

  it("rejects mutually visible spawns", () => {
    const empty: MapData = { id: "test", name: "bad", bounds: { min: [-10, -1, -10], max: [10, 10, 10] }, boxes: [{ id: "floor", min: [-10, -1, -10], max: [10, 0, 10], material: "stone", tags: ["solid"] }], ramps: [], volumes: [], zipLines: [], boulders: [], props: [], spawns: { sun: [{ pos: [-5, 0, 0], yaw: 0 }], moon: [{ pos: [5, 0, 0], yaw: 0 }] }, waypoints: [], decor: [], notes: [], look: { sunShafts: false, stainSeed: 0 } };
    expect(validateMap(empty).some((error) => error.startsWith("spawn line of sight"))).toBe(true);
  });

  it("rejects a disconnected waypoint graph", () => {
    const waypoints = [...sunTempleMap.waypoints, { id: "island", pos: [0, 0, 19], links: [] } as const];
    expect(validateMap(changed({ waypoints }))).toContain("waypoint graph: disconnected");
  });

  it("rejects a blocked walk link", () => {
    const waypoints = [{ id: "a", pos: [-29, 0, 0], links: [{ to: "b", kind: "walk" }] }, { id: "b", pos: [-21, 0, 0], links: [{ to: "a", kind: "walk" }] }] as const;
    const blocker = { id: "walk-blocker", min: [-26, 0, -1], max: [-24, 3, 1], material: "stone", tags: ["solid"] } as const;
    expect(validateMap(changed({ boxes: [...sunTempleMap.boxes, blocker], waypoints })).some((error) => error.startsWith("waypoint walk"))).toBe(true);
  });

  it("rejects a spawn without a nearby visible waypoint", () => {
    expect(validateMap(changed({ waypoints: sunTempleMap.waypoints.filter((point) => !point.id.startsWith("sun-spawn")) })).some((error) => error.startsWith("spawn waypoint"))).toBe(true);
  });
});
