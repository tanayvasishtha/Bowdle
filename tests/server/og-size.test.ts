import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("G13 og.png", () => {
  it("is 1200x630", () => {
    const png = readFileSync("public/og.png");
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});
