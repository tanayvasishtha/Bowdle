import { describe, expect, it } from "vitest";
import { inkVertexShader } from "./ink.ts";

describe("ink vertex shader", () => {
  it("applies the instance matrix so scattered props keep their own position", () => {
    expect(inkVertexShader).toContain("USE_INSTANCING");
    expect(inkVertexShader).toContain("instanceMatrix * local");
    expect(inkVertexShader).toContain("modelMatrix * instanceMatrix");
  });
});
