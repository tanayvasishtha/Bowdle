import { describe, expect, it } from "vitest";
import { compositeFragmentShader } from "./composite.ts";

describe("composite shader", () => {
  it("has every look constant filled in", () => {
    expect(compositeFragmentShader).not.toMatch(/undefined|NaN/);
    expect(compositeFragmentShader).not.toMatch(/[^\w.]\.0\b|\(\s*,|,\s*\)|(?<!\+)[*+]\s*[),;]|<\s*;/);
  });

  it("draws the horizon band, birds and weighted silhouettes", () => {
    for (const name of ["uniform float horizon", "uniform float cameraYaw", "uniform float hurt", "uniform float streaks", "nearCrown", "bird", "depthEdge"]) expect(compositeFragmentShader).toContain(name);
  });
});
