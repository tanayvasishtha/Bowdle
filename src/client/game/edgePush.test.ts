import { describe, expect, it } from "vitest";
import { edgePush } from "./InputSampler.ts";

describe("free cursor edge turning", () => {
  it("is still in the middle and pushes harder the closer the cursor is to an edge", () => {
    expect(edgePush(0.5)).toBe(0);
    expect(edgePush(0.2)).toBe(0);
    expect(edgePush(0.06)).toBeCloseTo(-0.5);
    expect(edgePush(0)).toBe(-1);
    expect(edgePush(0.94)).toBeCloseTo(0.5);
    expect(edgePush(1)).toBe(1);
    expect(edgePush(1.3)).toBe(1);
  });
});
