import { describe, expect, it } from "vitest";
import { ATTRACT_IDLE_MS } from "./attract.ts";

describe("LEFT-F3 attract idle", () => {
  it("uses a 30 second idle window", () => {
    expect(ATTRACT_IDLE_MS).toBe(30_000);
  });
});
