/** Daily featured shop rotation from the catalog (N2). Cosmetic only; no loot boxes. */
import { CATALOG, type Cosmetic } from "./cosmetics.ts";

const FEATURED_COUNT = 4;

/** Stable UTC day key YYYY-MM-DD. */
export function utcDayKey(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

function hashDay(dayKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < dayKey.length; i += 1) {
    h ^= dayKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function featuredEligible(catalog: readonly Cosmetic[] = CATALOG): Cosmetic[] {
  return catalog.filter((item) => "ink" in item.price || "sku" in item.price);
}

export function featuredForDay(dayKey: string, catalog: readonly Cosmetic[] = CATALOG): Cosmetic[] {
  const pool = featuredEligible(catalog);
  if (pool.length === 0) return [];
  const seed = hashDay(dayKey);
  const ranked = pool.map((item, index) => {
    let h = seed ^ Math.imul(index + 1, 0x9e3779b1);
    h ^= Math.imul(item.id.length, 0x85ebca6b);
    for (let i = 0; i < item.id.length; i += 1) h = Math.imul(h ^ item.id.charCodeAt(i), 0x27d4eb2d);
    return { item, rank: h >>> 0 };
  });
  ranked.sort((a, b) => a.rank - b.rank || a.item.id.localeCompare(b.item.id));
  return ranked.slice(0, FEATURED_COUNT).map((entry) => entry.item);
}
