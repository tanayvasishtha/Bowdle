import { describe, expect, it } from "vitest";
import { DynamicResolution } from "./dynamicResolution.ts";

describe("dynamic resolution", () => {
  it("keeps full resolution under the frame budget", () => {
    const resolution = new DynamicResolution(); for (let frame = 0; frame < 240; frame += 1) resolution.sample(10);
    expect(resolution.scale).toBe(1);
  });

  it("drops in ten-percent steps and never below sixty percent", () => {
    const resolution = new DynamicResolution(); for (let frame = 0; frame < 500; frame += 1) resolution.sample(25);
    expect(resolution.scale).toBe(0.6);
  });
});
