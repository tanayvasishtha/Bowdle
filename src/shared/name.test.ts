import { describe, expect, it } from "vitest";
import { nameError } from "./name.ts";

describe("explorer names", () => {
  it("accepts a short printable name", () => expect(nameError("Arrow Finch")).toBe(""));
  it("rejects reserved and unfriendly variants", () => {
    expect(nameError("B_o_w_d_l_e")).not.toBe("");
    expect(nameError("site-admin")).not.toBe("");
  });
  it("rejects empty and oversized names", () => {
    expect(nameError("   ")).not.toBe("");
    expect(nameError("a".repeat(17))).not.toBe("");
  });
});
