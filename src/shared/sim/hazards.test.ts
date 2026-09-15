import { describe, expect, it } from "vitest";
import { BOULDER_PERIOD_MS, BOULDER_TELEGRAPH_MS } from "../constants.ts";
import { kitMap } from "../maps/fixtures/kit.ts";
import { boulderPosition, resetBoulderHazard, segmentHitsBoulder, stepBoulderHazard, triggerBoulder, type BoulderHazardSim } from "./hazards.ts";

function state(): BoulderHazardSim { return { phase: "idle", direction: 1, t: 0, phaseEndsAtMs: 0, nextAtMs: 0, leverReadyAtMs: 0, puller: "", x: 0, y: 0, z: 0 }; }

describe("boulder hazards", () => {
  it("telegraphs, rolls, despawns, and alternates automatically", () => {
    const hazard = state(); resetBoulderHazard(hazard, 0);
    stepBoulderHazard(hazard, kitMap.boulders[0]!, BOULDER_PERIOD_MS, 0);
    expect(hazard.phase).toBe("telegraph");
    stepBoulderHazard(hazard, kitMap.boulders[0]!, BOULDER_PERIOD_MS + BOULDER_TELEGRAPH_MS, 0);
    expect(hazard.phase).toBe("roll");
    stepBoulderHazard(hazard, kitMap.boulders[0]!, BOULDER_PERIOD_MS + BOULDER_TELEGRAPH_MS, 10);
    expect(hazard.phase).toBe("despawn");
    stepBoulderHazard(hazard, kitMap.boulders[0]!, BOULDER_PERIOD_MS + BOULDER_TELEGRAPH_MS, 0);
    expect(hazard.phase).toBe("idle"); expect(hazard.direction).toBe(-1);
  });

  it("shares lever cooldown and traverses the authored path", () => {
    const hazard = state(); resetBoulderHazard(hazard, 0);
    expect(triggerBoulder(hazard, "puller", 1)).toBe(true);
    expect(triggerBoulder(hazard, "other", 2)).toBe(false);
    const point = { x: 0, y: 0, z: 0 }; boulderPosition(kitMap.boulders[0]!, 0.5, 1, point);
    expect(point.x).toBeCloseTo(0); expect(point.z).toBeCloseTo(-6);
    expect(segmentHitsBoulder(-3, 0, 0, 3, 0, 0, { x: 0, y: 0, z: 0 }, 1.5)).toBe(true);
    expect(segmentHitsBoulder(-3, 0, 3, 3, 0, 3, { x: 0, y: 0, z: 0 }, 1.5)).toBe(false);
  });
});
