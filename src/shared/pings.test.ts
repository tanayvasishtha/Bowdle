import { describe, expect, it } from "vitest";
import { allowPing, classifyPing, explorerName, PING_RATE_LIMIT, PING_RATE_WINDOW_MS } from "./pings.ts";

describe("classifyPing", () => {
  it("prefers enemy, then relic, then anchor, else location", () => {
    expect(classifyPing({ enemy: true, relic: true })).toBe("enemy");
    expect(classifyPing({ relic: true, anchor: true })).toBe("relic");
    expect(classifyPing({ anchor: true })).toBe("anchor");
    expect(classifyPing({})).toBe("location");
    expect(classifyPing(undefined)).toBe("location");
  });
});

describe("allowPing", () => {
  it("allows three pings in the window and blocks the fourth", () => {
    const stamps: number[] = [];
    expect(allowPing(stamps, 1000)).toBe(true);
    expect(allowPing(stamps, 1500)).toBe(true);
    expect(allowPing(stamps, 2000)).toBe(true);
    expect(allowPing(stamps, 2500)).toBe(false);
    expect(stamps).toHaveLength(PING_RATE_LIMIT);
  });

  it("frees a slot after the window", () => {
    const stamps: number[] = [];
    for (let i = 0; i < PING_RATE_LIMIT; i += 1) expect(allowPing(stamps, i * 10)).toBe(true);
    expect(allowPing(stamps, PING_RATE_WINDOW_MS + 50)).toBe(true);
  });
});

describe("explorerName", () => {
  it("returns Explorer plus four digits", () => {
    expect(explorerName("acct-1")).toMatch(/^Explorer\d{4}$/);
    expect(explorerName("acct-1")).toBe(explorerName("acct-1"));
  });
});
