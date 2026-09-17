/** Multi-region ping probe helpers (G12). */

export type RegionInfo = { id: string; url: string; label?: string };

export function parseRegions(raw: string | undefined): RegionInfo[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
      .map((entry) => ({
        id: String(entry.id ?? ""),
        url: String(entry.url ?? ""),
        label: entry.label != null ? String(entry.label) : undefined,
      }))
      .filter((entry) => entry.id && entry.url);
  } catch {
    return [];
  }
}

export function pickBestRegion(
  regions: RegionInfo[],
  pings: Record<string, number>,
  preferredId?: string | null,
): RegionInfo | null {
  if (regions.length === 0) return null;
  if (preferredId) {
    const preferred = regions.find((r) => r.id === preferredId);
    if (preferred) return preferred;
  }
  let best: RegionInfo | null = null;
  let bestPing = Number.POSITIVE_INFINITY;
  for (const region of regions) {
    const ping = pings[region.id];
    if (typeof ping === "number" && ping < bestPing) {
      bestPing = ping;
      best = region;
    }
  }
  return best ?? regions[0] ?? null;
}

export function formatPingMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "-";
  return `${Math.round(ms)} ms`;
}

