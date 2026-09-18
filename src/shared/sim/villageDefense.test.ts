import { describe, expect, it } from "vitest";
import { applyUpgrade, emptyBuffs, rollShop, VILLAGE, VILLAGE_UPGRADES } from "./villageDefense.ts";

describe("villageDefense", () => {
  it("rolls three distinct shop offers", () => {
    let n = 0;
    const rng = () => { n += 0.17; return n % 1; };
    const picks = rollShop(rng, new Set());
    expect(picks).toHaveLength(3);
    expect(new Set(picks).size).toBe(3);
    for (const id of picks) expect(VILLAGE_UPGRADES.some((row) => row.id === id)).toBe(true);
  });

  it("keeps totemRepair available even when owned", () => {
    const owned = new Set(VILLAGE_UPGRADES.map((row) => row.id));
    const picks = rollShop(() => 0.1, owned);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((id) => id === "totemRepair")).toBe(true);
  });

  it("applies upgrades onto buffs", () => {
    let buffs = emptyBuffs();
    buffs = applyUpgrade(buffs, "fastDraw");
    buffs = applyUpgrade(buffs, "fireArrows");
    buffs = applyUpgrade(buffs, "doubleShot");
    buffs = applyUpgrade(buffs, "moreHealth");
    expect(buffs.drawMult).toBeLessThan(1);
    expect(buffs.fireBonus).toBeGreaterThan(0);
    expect(buffs.doubleEvery).toBe(5);
    expect(buffs.hpMult).toBeGreaterThan(1);
  });

  it("defines a sturdy totem", () => {
    expect(VILLAGE.totemMaxHp).toBeGreaterThanOrEqual(500);
    expect(VILLAGE.shopMs).toBeGreaterThanOrEqual(8_000);
  });
});
