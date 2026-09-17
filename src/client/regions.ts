import { formatPingMs, parseRegions, pickBestRegion, type RegionInfo } from "../shared/regions.ts";
import { loadSettings } from "./settings.ts";

export type RegionPing = RegionInfo & { pingMs: number | null };

const PROBE_PATH = "/health";
const PROBE_TIMEOUT_MS = 2500;

export function configuredRegions(): RegionInfo[] {
  return parseRegions(import.meta.env.VITE_REGIONS as string | undefined);
}

async function probe(url: string): Promise<number | null> {
  const target = url.replace(/\/$/, "") + PROBE_PATH;
  const started = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    await fetch(target, { method: "GET", mode: "cors", cache: "no-store", signal: controller.signal });
    clearTimeout(timer);
    return Math.max(1, Math.round(performance.now() - started));
  } catch {
    return null;
  }
}

export async function probeRegions(regions = configuredRegions()): Promise<RegionPing[]> {
  return Promise.all(regions.map(async (region) => ({
    ...region,
    pingMs: await probe(region.url),
  })));
}

export function chooseRegion(pings: RegionPing[]): RegionInfo | null {
  const settings = loadSettings();
  const preferred = settings.preferredRegion || null;
  const map: Record<string, number> = {};
  for (const row of pings) if (row.pingMs != null) map[row.id] = row.pingMs;
  return pickBestRegion(pings, map, preferred);
}

export function regionEndpoint(region: RegionInfo | null): string {
  if (region?.url) return region.url.replace(/\/$/, "");
  return (import.meta.env.VITE_SERVER_URL as string | undefined) || location.origin;
}

export { formatPingMs };
