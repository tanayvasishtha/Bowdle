import { describe, expect, it } from "vitest";
import { CROUCH_HEIGHT, FLOOD_MS, FLOOD_PERIOD_MS, FLOOD_RISE } from "../constants.ts";
import { kitMap } from "../maps/fixtures/kit.ts";
import { isHiddenInTallGrass, volumeSurfaceY } from "./volumes.ts";

describe("map volumes", () => {
  it("computes flood height solely from match time", () => {
    const flood = kitMap.volumes.find((volume) => volume.flood)!;
    expect(volumeSurfaceY(flood, 0)).toBe(flood.max[1] + FLOOD_RISE);
    expect(volumeSurfaceY(flood, FLOOD_MS)).toBe(flood.max[1]);
    expect(volumeSurfaceY(flood, FLOOD_PERIOD_MS)).toBe(flood.max[1] + FLOOD_RISE);
  });

  it("only hides a crouched player fully inside tall grass", () => {
    expect(isHiddenInTallGrass(kitMap, 0, 0, 12, CROUCH_HEIGHT, true)).toBe(true);
    expect(isHiddenInTallGrass(kitMap, 0, 0, 12, CROUCH_HEIGHT, false)).toBe(false);
    expect(isHiddenInTallGrass(kitMap, 0, 0.5, 12, CROUCH_HEIGHT, true)).toBe(false);
  });
});
