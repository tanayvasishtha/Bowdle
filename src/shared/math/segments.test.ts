import { describe, expect, it } from "vitest";
import { segmentDistance } from "./segments.ts";

describe("segment distance", () => {
  it("is zero for crossing segments", () => expect(segmentDistance({ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(0));
  it("handles parallel segments", () => expect(segmentDistance({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 2, y: 1, z: 0 })).toBeCloseTo(1));
  it("clamps to separated endpoints", () => expect(segmentDistance({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 4, y: 0, z: 0 })).toBeCloseTo(2));
});
