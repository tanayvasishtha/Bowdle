/**
 * Cosmetic catalog. Cosmetics never change hitboxes, speed or damage, and team colors stay reserved
 * for shirts and sleeves so a skin can never make a player read as the other crew.
 * Colors are ink palette entries so every item keeps the journal look.
 */
import { LEVEL_INK, LEVEL_ITEM_LEVELS as L, MAX_LEVEL } from "./constants.ts";
export type CosmeticCategory = "bow" | "trail" | "outfit" | "effect";
export const COSMETIC_CATEGORIES: readonly CosmeticCategory[] = ["bow", "trail", "outfit", "effect"];

/** Palette entries a cosmetic may use. Team washes are deliberately absent. */
export type CosmeticPaint = "stone" | "carvedStone" | "wood" | "canopy" | "fern" | "earth" | "water" | "rope" | "gold" | "hazard" | "canvas" | "foliageDark";

export type BowOrnament = "none" | "leaves" | "prongs" | "sunDisc" | "fins" | "crystals";
export type TrailStyle = "none" | "dots" | "zigzag" | "ribbon" | "dashes";
export type Headgear = "crew" | "brim" | "goggles" | "bandana" | "headdress" | "aviator" | "crown";
export type Accessory = "crew" | "feather" | "satchel" | "pauldron" | "beads" | "scarf" | "mask";
export type BurstShape = "splat" | "leaf" | "feather" | "star" | "spark" | "wing" | "cube";

export type Price = { ink: number } | { sku: string; usd: number } | { free: true } | { level: number };

type Base<C extends CosmeticCategory> = { id: `${C}.${string}`; category: C; name: string; blurb: string; price: Price };
export type BowSkin = Base<"bow"> & { paint: CosmeticPaint; grip: CosmeticPaint; ornament: BowOrnament };
export type ArrowTrail = Base<"trail"> & { paint: CosmeticPaint; style: TrailStyle };
export type Outfit = Base<"outfit"> & { hat: CosmeticPaint | "crew"; trim: CosmeticPaint | "crew"; headgear: Headgear; accessory: Accessory };
export type KillEffect = Base<"effect"> & { paint: CosmeticPaint | "team"; shape: BurstShape };
export type Cosmetic = BowSkin | ArrowTrail | Outfit | KillEffect;

export const BOW_SKINS: readonly BowSkin[] = [
  { id: "bow.default", category: "bow", name: "Camp Bow", blurb: "Ash wood and waxed cord.", price: { free: true }, paint: "wood", grip: "rope", ornament: "none" },
  { id: "bow.explorer", category: "bow", name: "Explorer's Longbow", blurb: "A seasoned explorer's companion.", price: { level: L.explorer }, paint: "earth", grip: "gold", ornament: "fins" },
  { id: "bow.carved", category: "bow", name: "Carved Stone Bow", blurb: "Shaped from ancient temple stone.", price: { level: L.carved }, paint: "carvedStone", grip: "rope", ornament: "prongs" },
  { id: "bow.jade", category: "bow", name: "Jade Vine", blurb: "Grown, not carved.", price: { ink: 300 }, paint: "fern", grip: "wood", ornament: "leaves" },
  { id: "bow.bone", category: "bow", name: "Bone Hunter", blurb: "Antler tips from the high ridge.", price: { ink: 450 }, paint: "canvas", grip: "earth", ornament: "prongs" },
  { id: "bow.river", category: "bow", name: "River Fin", blurb: "Balanced for shots over water.", price: { ink: 450 }, paint: "water", grip: "rope", ornament: "fins" },
  { id: "bow.ember", category: "bow", name: "Ember Idol", blurb: "Still warm from the temple fire.", price: { ink: 600 }, paint: "hazard", grip: "gold", ornament: "sunDisc" },
  { id: "bow.gilded", category: "bow", name: "Gilded Relic", blurb: "Found under the altar. Probably cursed.", price: { sku: "bow-gilded-relic", usd: 2.99 }, paint: "gold", grip: "carvedStone", ornament: "crystals" },
  { id: "bow.obsidian", category: "bow", name: "Night Canopy", blurb: "Cut from the darkest tree in the jungle.", price: { sku: "bow-night-canopy", usd: 2.99 }, paint: "foliageDark", grip: "gold", ornament: "prongs" },
];

export const ARROW_TRAILS: readonly ArrowTrail[] = [
  { id: "trail.default", category: "trail", name: "No Trail", blurb: "Quiet flight.", price: { free: true }, paint: "canvas", style: "none" },
  { id: "trail.chalk", category: "trail", name: "Chalk Line", blurb: "Mark your route through the jungle.", price: { level: L.chalk }, paint: "canvas", style: "dashes" },
  { id: "trail.fern", category: "trail", name: "Fern Wake", blurb: "A green path through the air.", price: { level: L.fern }, paint: "canopy", style: "zigzag" },
  { id: "trail.rope", category: "trail", name: "Pencil Dash", blurb: "Like a route on the map.", price: { ink: 250 }, paint: "rope", style: "dashes" },
  { id: "trail.leaves", category: "trail", name: "Leaf Drift", blurb: "Each shot rustles the canopy.", price: { ink: 250 }, paint: "fern", style: "dots" },
  { id: "trail.embers", category: "trail", name: "Ember Zigzag", blurb: "Crackles all the way down range.", price: { ink: 400 }, paint: "hazard", style: "zigzag" },
  { id: "trail.river", category: "trail", name: "River Ribbon", blurb: "A clean line of blue.", price: { ink: 400 }, paint: "water", style: "ribbon" },
  { id: "trail.gold", category: "trail", name: "Gold Leaf", blurb: "Shows everyone who paid for the expedition.", price: { sku: "trail-gold-leaf", usd: 1.99 }, paint: "gold", style: "ribbon" },
  { id: "trail.shadow", category: "trail", name: "Shadow Vine", blurb: "A dark ribbon that curls behind the arrow.", price: { sku: "trail-shadow-vine", usd: 1.99 }, paint: "foliageDark", style: "zigzag" },
];

export const OUTFITS: readonly Outfit[] = [
  { id: "outfit.default", category: "outfit", name: "Crew Kit", blurb: "Pith helmet for Sun, knit cap for Moon.", price: { free: true }, hat: "crew", trim: "crew", headgear: "crew", accessory: "crew" },
  { id: "outfit.cartographer", category: "outfit", name: "Cartographer", blurb: "Every expedition needs a mapmaker.", price: { level: L.cartographer }, hat: "canvas", trim: "water", headgear: "brim", accessory: "satchel" },
  { id: "outfit.veteran", category: "outfit", name: "Veteran Guide", blurb: "Knows every trail and every danger.", price: { level: L.veteran }, hat: "foliageDark", trim: "gold", headgear: "aviator", accessory: "pauldron" },
  { id: "outfit.ranger", category: "outfit", name: "Trail Ranger", blurb: "Wide brim and a lucky feather.", price: { ink: 500 }, hat: "wood", trim: "fern", headgear: "brim", accessory: "feather" },
  { id: "outfit.scholar", category: "outfit", name: "Field Scholar", blurb: "Brass goggles and a notes satchel.", price: { ink: 500 }, hat: "earth", trim: "gold", headgear: "goggles", accessory: "satchel" },
  { id: "outfit.raider", category: "outfit", name: "Tomb Raider", blurb: "Red bandana, one shoulder guard.", price: { ink: 700 }, hat: "hazard", trim: "stone", headgear: "bandana", accessory: "pauldron" },
  { id: "outfit.pilot", category: "outfit", name: "Lost Pilot", blurb: "Survived the wreck, kept the scarf.", price: { ink: 700 }, hat: "earth", trim: "canvas", headgear: "aviator", accessory: "scarf" },
  { id: "outfit.shaman", category: "outfit", name: "Canopy Shaman", blurb: "Feathers from every bird in the valley.", price: { sku: "outfit-canopy-shaman", usd: 4.99 }, hat: "fern", trim: "gold", headgear: "headdress", accessory: "beads" },
  { id: "outfit.idol", category: "outfit", name: "Golden Idol", blurb: "The treasure wears you.", price: { sku: "outfit-golden-idol", usd: 4.99 }, hat: "gold", trim: "carvedStone", headgear: "crown", accessory: "mask" },
];

export const KILL_EFFECTS: readonly KillEffect[] = [
  { id: "effect.default", category: "effect", name: "Ink Splat", blurb: "Your crew color, everywhere.", price: { free: true }, paint: "team", shape: "splat" },
  { id: "effect.dust", category: "effect", name: "Dust Devil", blurb: "A swirl of expedition dust.", price: { level: L.dust }, paint: "earth", shape: "spark" },
  { id: "effect.goldrush", category: "effect", name: "Gold Rush", blurb: "Treasure scatters across the journal.", price: { level: L.goldrush }, paint: "gold", shape: "cube" },
  { id: "effect.leaves", category: "effect", name: "Leaf Storm", blurb: "The jungle takes them back.", price: { ink: 300 }, paint: "fern", shape: "leaf" },
  { id: "effect.feathers", category: "effect", name: "Pillow Fight", blurb: "A puff of white feathers.", price: { ink: 300 }, paint: "canvas", shape: "feather" },
  { id: "effect.stars", category: "effect", name: "Seeing Stars", blurb: "Gold stars spin out of the hit.", price: { ink: 500 }, paint: "gold", shape: "star" },
  { id: "effect.embers", category: "effect", name: "Torch Sparks", blurb: "A shower of red sparks.", price: { ink: 500 }, paint: "hazard", shape: "spark" },
  { id: "effect.butterflies", category: "effect", name: "Blue Morpho", blurb: "A flutter of river-blue wings.", price: { sku: "effect-blue-morpho", usd: 1.99 }, paint: "water", shape: "wing" },
  { id: "effect.idol", category: "effect", name: "Relic Rubble", blurb: "Tiny temple blocks tumble out.", price: { sku: "effect-relic-rubble", usd: 1.99 }, paint: "carvedStone", shape: "cube" },
];

export const CATALOG: readonly Cosmetic[] = [...BOW_SKINS, ...ARROW_TRAILS, ...OUTFITS, ...KILL_EFFECTS];
export type LevelReward = { level: number; ink: number; itemId?: string };
export const LEVEL_TRACK: readonly LevelReward[] = Array.from({ length: MAX_LEVEL - LEVEL_INK.firstLevel + 1 }, (_, index) => {
  const level = index + LEVEL_INK.firstLevel;
  const item = CATALOG.find((entry) => "level" in entry.price && entry.price.level === level);
  return item ? { level, itemId: item.id, ink: 0 } : { level, ink: LEVEL_INK.base + LEVEL_INK.perLevel * level };
});
export function nextUnlock(level: number): LevelReward | undefined { return LEVEL_TRACK.find((reward) => reward.level > level); }

export type Loadout = { bow: BowSkin["id"]; trail: ArrowTrail["id"]; outfit: Outfit["id"]; effect: KillEffect["id"] };
export const DEFAULT_LOADOUT: Loadout = { bow: "bow.default", trail: "trail.default", outfit: "outfit.default", effect: "effect.default" };

const byId = new Map<string, Cosmetic>(CATALOG.map((item) => [item.id, item]));
const bySku = new Map<string, Cosmetic>(CATALOG.flatMap((item) => "sku" in item.price ? [[item.price.sku, item] as const] : []));

export function cosmeticById(id: string): Cosmetic | undefined { return byId.get(id); }
export function cosmeticBySku(sku: string): Cosmetic | undefined { return bySku.get(sku); }
export function isFree(item: Cosmetic): boolean { return "free" in item.price; }

export function bowSkin(id: string): BowSkin { const item = byId.get(id); return item?.category === "bow" ? item : BOW_SKINS[0]!; }
export function arrowTrail(id: string): ArrowTrail { const item = byId.get(id); return item?.category === "trail" ? item : ARROW_TRAILS[0]!; }
export function outfit(id: string): Outfit { const item = byId.get(id); return item?.category === "outfit" ? item : OUTFITS[0]!; }
export function killEffect(id: string): KillEffect { const item = byId.get(id); return item?.category === "effect" ? item : KILL_EFFECTS[0]!; }

/** Keeps only owned items in their own slot; anything else falls back to the default for that slot. */
export function sanitizeLoadout(requested: Partial<Record<keyof Loadout, string>>, owned: ReadonlySet<string>): Loadout {
  const pick = <K extends keyof Loadout>(slot: K, category: CosmeticCategory): Loadout[K] => {
    const id = requested[slot];
    const item = id ? byId.get(id) : undefined;
    return (item && item.category === category && (isFree(item) || owned.has(item.id)) ? item.id : DEFAULT_LOADOUT[slot]) as Loadout[K];
  };
  return { bow: pick("bow", "bow"), trail: pick("trail", "trail"), outfit: pick("outfit", "outfit"), effect: pick("effect", "effect") };
}
