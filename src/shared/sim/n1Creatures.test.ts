import { describe, expect, it } from "vitest";
import { CREATURE_TUNING } from "../constants.ts";
import { sunTempleMap } from "../maps/sunTemple.ts";
import { createCreature, stepCreature, type CreatureAlly } from "./creatures.ts";
import { unlockedKinds } from "./waves.ts";
import { isoWeekKey, weeklyMapId, weeklySeed } from "./weeklyExpedition.ts";

describe("N1 mire and tender", () => {
  it("unlocks mire from wave 5 and tender from wave 7", () => {
    expect(unlockedKinds(4)).not.toContain("mire");
    expect(unlockedKinds(5)).toContain("mire");
    expect(unlockedKinds(6)).not.toContain("tender");
    expect(unlockedKinds(7)).toContain("tender");
  });

  it("mire plants a slowing pool on cooldown", () => {
    const creature = createCreature("mire", 0, 0, 0);
    creature.cooldownMs = 0;
    const events = stepCreature(creature, {
      map: sunTempleMap,
      targets: [{ id: "p", x: 4, y: 0, z: 0, grounded: true }],
      dt: 0.05,
      gravityMult: 1,
    });
    expect(events.some((event) => event.type === "mire" && event.radius === CREATURE_TUNING.mire.mireRadiusM)).toBe(true);
  });

  it("tender heals nearby allies", () => {
    const creature = createCreature("tender", 0, 0, 0);
    creature.cooldownMs = 0;
    const allies: CreatureAlly[] = [{ id: "c1", x: 2, y: 0, z: 0 }];
    const events = stepCreature(creature, {
      map: sunTempleMap,
      targets: [],
      allies,
      dt: 0.05,
      gravityMult: 1,
    });
    expect(events).toContainEqual({ type: "heal", targets: ["c1"], amount: CREATURE_TUNING.tender.healAmount });
  });

  it("does not anchor to itself when it has no other creature nearby", () => {
    const creature = createCreature("tender", 0, 0, 0);
    const allies: CreatureAlly[] = [{ id: "self", x: 0, y: 0, z: 0 }];
    for (let tick = 0; tick < 30; tick += 1) {
      stepCreature(creature, {
        map: sunTempleMap,
        targets: [{ id: "p", x: 20, y: 0, z: 0, grounded: true }],
        allies,
        dt: 1 / 30,
        gravityMult: 1,
      });
    }
    expect(creature.x).toBeGreaterThan(0);
  });
});

describe("N1 weekly expedition seed", () => {
  it("is stable inside a UTC ISO week and changes across weeks", () => {
    const mid = new Date(Date.UTC(2026, 8, 16, 12));
    const sameWeek = new Date(Date.UTC(2026, 8, 18, 1));
    const nextWeek = new Date(Date.UTC(2026, 8, 21, 12));
    expect(isoWeekKey(mid)).toBe(isoWeekKey(sameWeek));
    expect(weeklySeed(mid)).toBe(weeklySeed(sameWeek));
    expect(weeklySeed(mid)).not.toBe(weeklySeed(nextWeek));
    expect(weeklyMapId(weeklySeed(mid))).toMatch(/wild-crossing|home-grove/);
  });
});
