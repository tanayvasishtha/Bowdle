import { describe, expect, it } from "vitest";
import { BACKSTAB_DAMAGE, MELEE_DAMAGE, MELEE_RANGE } from "../constants.ts";
import { meleeHit } from "./melee.ts";

describe("melee", () => {
  const attacker = { x: 0, y: 0, z: 0, yaw: 0 };

  it("respects range", () => {
    expect(meleeHit(attacker, { x: 0, y: 0, z: -MELEE_RANGE - 0.01, yaw: 0 })).toBeNull();
  });

  it("respects the attack arc", () => {
    expect(meleeHit(attacker, { x: 0, y: 0, z: 2, yaw: 0 })).toBeNull();
    expect(meleeHit(attacker, { x: 0, y: 0, z: -2, yaw: Math.PI })).toEqual({ damage: MELEE_DAMAGE, backstab: false });
  });

  it("kills from directly behind", () => {
    expect(meleeHit(attacker, { x: 0, y: 0, z: -2, yaw: 0 })).toEqual({ damage: BACKSTAB_DAMAGE, backstab: true });
  });
});
