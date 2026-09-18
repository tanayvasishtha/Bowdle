import { describe, expect, it } from "vitest";
import { ARROW_TRAILS, BOW_SKINS, CATALOG, COSMETIC_CATEGORIES, DEFAULT_LOADOUT, KILL_EFFECTS, LEVEL_TRACK, OUTFITS, bowSkin, cosmeticById, cosmeticBySku, isFree, nextUnlock, sanitizeLoadout } from "./cosmetics.ts";

describe("cosmetic catalog", () => {
  it("has one default, six bought and two level items per category", () => {
    expect(CATALOG.filter((item) => !isFree(item) && !("level" in item.price) && !("reward" in item.price))).toHaveLength(24);
    for (const category of COSMETIC_CATEGORIES) {
      const items = CATALOG.filter((item) => item.category === category);
      expect(items.filter(isFree).map((item) => item.id)).toEqual([`${category}.default`]);
      expect(items.filter((item) => "level" in item.price)).toHaveLength(2);
      expect(items.filter((item) => "ink" in item.price || "sku" in item.price)).toHaveLength(6);
      expect(items.filter((item) => !("reward" in item.price)).length).toBe(9);
    }
    expect(DEFAULT_LOADOUT).toEqual({ bow: BOW_SKINS[0]!.id, trail: ARROW_TRAILS[0]!.id, outfit: OUTFITS[0]!.id, effect: KILL_EFFECTS[0]!.id });
  });
  it("lists every level reward with the exact eight earned items and Ink formula", () => {
    expect(LEVEL_TRACK).toHaveLength(99);
    expect(LEVEL_TRACK.filter((entry) => entry.itemId)).toEqual([
      { level: 3, itemId: "trail.chalk", ink: 0 }, { level: 5, itemId: "bow.explorer", ink: 0 }, { level: 7, itemId: "effect.dust", ink: 0 }, { level: 10, itemId: "outfit.cartographer", ink: 0 },
      { level: 15, itemId: "trail.fern", ink: 0 }, { level: 20, itemId: "bow.carved", ink: 0 }, { level: 30, itemId: "effect.goldrush", ink: 0 }, { level: 50, itemId: "outfit.veteran", ink: 0 },
    ]);
    for (const reward of LEVEL_TRACK) {
      if (reward.itemId) { const item = cosmeticById(reward.itemId)!; expect(isFree(item)).toBe(false); expect(item.price).toEqual({ level: reward.level }); expect(cosmeticBySku(reward.itemId)).toBeUndefined(); }
      else expect(reward.ink).toBe(50 + 5 * reward.level);
    }
    expect(nextUnlock(2)).toEqual({ level: 3, itemId: "trail.chalk", ink: 0 }); expect(nextUnlock(100)).toBeUndefined();
  });

  it("uses unique ids and SKUs, sane prices, and prefixes ids with their category", () => {
    expect(new Set(CATALOG.map((item) => item.id)).size).toBe(CATALOG.length);
    const skus = CATALOG.flatMap((item) => "sku" in item.price ? [item.price.sku] : []);
    expect(new Set(skus).size).toBe(skus.length);
    expect(skus.length).toBe(8);
    for (const item of CATALOG) {
      expect(item.id.startsWith(`${item.category}.`)).toBe(true);
      if ("ink" in item.price) expect(item.price.ink).toBeGreaterThanOrEqual(100);
      if ("sku" in item.price) { expect(item.price.sku).toMatch(/^[a-z0-9-]+$/); expect(item.price.usd).toBeGreaterThan(0); expect(cosmeticBySku(item.price.sku)).toBe(item); }
      expect(cosmeticById(item.id)).toBe(item);
    }
  });

  it("never uses team colors on a cosmetic", () => {
    const text = JSON.stringify(CATALOG);
    expect(text).not.toMatch(/teamSun|teamMoon|sunWash|moonWash/);
  });

  it("falls back to defaults for unknown, unowned or misplaced items", () => {
    const owned = new Set(["bow.jade", "trail.gold"]);
    expect(sanitizeLoadout({ bow: "bow.jade", trail: "trail.gold", outfit: "outfit.idol", effect: "bow.jade" }, owned))
      .toEqual({ bow: "bow.jade", trail: "trail.gold", outfit: "outfit.default", effect: "effect.default" });
    expect(sanitizeLoadout({ bow: "nope" }, owned)).toEqual(DEFAULT_LOADOUT);
    expect(bowSkin("trail.gold").id).toBe("bow.default");
  });
});
