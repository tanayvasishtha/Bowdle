import { describe, expect, it } from "vitest";
import { PARTY_ALPHABET } from "./constants.ts";
import { mulberry32 } from "./math/rng.ts";
import { createPartyCode, isPartyCode, normalizePartyCode } from "./party.ts";

describe("party codes", () => {
  it("creates valid six-character codes from the readable alphabet", () => {
    const rng = mulberry32(7);
    const codes = new Set<string>();
    for (let index = 0; index < 500; index += 1) {
      const code = createPartyCode(rng);
      expect(isPartyCode(code)).toBe(true);
      for (const char of code) expect(PARTY_ALPHABET).toContain(char);
      codes.add(code);
    }
    expect(codes.size).toBeGreaterThan(495);
  });

  it("rejects confusable characters, wrong lengths and non-strings", () => {
    for (const bad of ["ABCDE", "ABCDEFG", "ABCDE0", "ABCDEO", "ABCDE1", "ABCDEI", "abcdef", "", 123456, null, undefined]) expect(isPartyCode(bad)).toBe(false);
    expect(isPartyCode("K7P2QX")).toBe(true);
  });

  it("normalizes typed codes", () => {
    expect(normalizePartyCode(" k7p-2qx ")).toBe("K7P2QX");
  });
});
