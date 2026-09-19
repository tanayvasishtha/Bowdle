import { describe, expect, it } from "vitest";
import { matchMaps } from "./registry.ts";
import { validateMap } from "./validate.ts";

describe("N1 expedition map coverage", () => {
  for (const map of matchMaps) {
    it(`${map.id} validates`, () => {
      expect(validateMap(map)).toEqual([]);
    });
  }
  for (const map of matchMaps.filter((entry) => entry.creatureSpawns)) {
    it(`${map.id} has creature and herb spawns`, () => {
      expect(map.creatureSpawns?.length ?? 0).toBeGreaterThan(0);
      expect((map.herbSpawns?.length ?? 0) + (map.herbs?.length ?? 0)).toBeGreaterThan(0);
    });
  }
});
