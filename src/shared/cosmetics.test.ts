import { describe, expect, it } from "vitest";
import { ARROW_TRAILS, BOW_SKINS, CATALOG, COSMETIC_CATEGORIES, DEFAULT_LOADOUT, KILL_EFFECTS, OUTFITS, bowSkin, cosmeticById, cosmeticBySku, isFree, sanitizeLoadout } from "./cosmetics.ts";

describe("cosmetic catalog", () => {
  it("has 24 items plus one free default per category", () => {
    expect(CATALOG.filter((item) => !isFree(item))).toHaveLength(24);
    for (const category of COSMETIC_CATEGORIES) {
      const items = CATALOG.filter((item) => item.category === category);
      expect(items.filter(isFree).map((item) => item.id)).toEqual([`${category}.default`]);
      expect(items.length).toBe(7);
    }
    expect(DEFAULT_LOADOUT).toEqual({ bow: BOW_SKINS[0]!.id, trail: ARROW_TRAILS[0]!.id, outfit: OUTFITS[0]!.id, effect: KILL_EFFECTS[0]!.id });
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
