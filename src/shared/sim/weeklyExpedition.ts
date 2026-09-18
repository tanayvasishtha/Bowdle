import { matchMaps } from "../maps/registry.ts";

/** ISO week key YYYY-Www in UTC. */
export function isoWeekKey(at = new Date()): string {
  const date = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Stable unsigned 32-bit seed from the week key. */
export function weeklySeed(at = new Date()): number {
  const key = isoWeekKey(at);
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function weeklyMapId(seed = weeklySeed()): string {
  return matchMaps[seed % matchMaps.length]!.id;
}
