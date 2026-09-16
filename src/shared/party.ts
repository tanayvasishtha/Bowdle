import { PARTY_ALPHABET, PARTY_CODE_LENGTH } from "./constants.ts";
import type { SeededRng } from "./math/rng.ts";

const PARTY_PATTERN = new RegExp(`^[${PARTY_ALPHABET}]{${PARTY_CODE_LENGTH}}$`);

/** Party codes skip 0, O, 1 and I so they survive being read out loud. */
export function createPartyCode(rng: SeededRng): string {
  let code = "";
  for (let index = 0; index < PARTY_CODE_LENGTH; index += 1) code += PARTY_ALPHABET[Math.floor(rng() * PARTY_ALPHABET.length)]!;
  return code;
}

export function isPartyCode(value: unknown): value is string {
  return typeof value === "string" && PARTY_PATTERN.test(value);
}

/** Uppercases and strips spaces and dashes from a typed code. */
export function normalizePartyCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, "");
}
