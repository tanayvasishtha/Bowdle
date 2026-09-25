import { BREAKABLE, GEYSER, MAP_HERB, MAX_HP, PLAYER_WIDTH } from "../constants.ts";
import type { Breakable, Geyser, Herb, MapData } from "../maps/types.ts";
import type { PlayerSim } from "./movement.ts";

export type BreakableRuntime = { id: string; hp: number; maxHp: number; broken: boolean; rebuildAtMs: number; box: Breakable["box"]; burnOnly: boolean };
export type HerbRuntime = { id: string; pos: Herb["pos"]; readyAtMs: number };

export function createBreakables(map: MapData): BreakableRuntime[] {
  return (map.breakables ?? []).map((item) => ({ id: item.id, hp: item.hp, maxHp: item.hp, broken: false, rebuildAtMs: 0, box: item.box, burnOnly: item.burnOnly ?? false }));
}

export function createHerbs(map: MapData): HerbRuntime[] {
  return (map.herbs ?? []).map((item) => ({ id: item.id, pos: item.pos, readyAtMs: 0 }));
}

function insideBox(x: number, y: number, z: number, box: Breakable["box"]): boolean {
  const pad = PLAYER_WIDTH * 0.5;
  return x >= box.min[0] - pad && x <= box.max[0] + pad && y >= box.min[1] && y <= box.max[1] && z >= box.min[2] - pad && z <= box.max[2] + pad;
}

/** Damage a breakable hit by an arrow or melee. Returns true when it just broke. */
export function damageBreakable(items: BreakableRuntime[], id: string, damage: number, nowMs: number): boolean {
  const item = items.find((entry) => entry.id === id);
  if (!item || item.broken) return false;
  item.hp -= damage;
  if (item.hp > 0) return false;
  item.broken = true;
  item.rebuildAtMs = nowMs + BREAKABLE.rebuildMs;
  item.hp = 0;
  return true;
}

export function solidBreakableBoxes(items: readonly BreakableRuntime[]): Breakable["box"][] {
  return items.filter((item) => !item.broken).map((item) => item.box);
}

export function stepBreakables(items: BreakableRuntime[], players: readonly PlayerSim[], nowMs: number): void {
  if (!items.some((item) => item.broken)) return;
  for (const item of items) {
    if (!item.broken || nowMs < item.rebuildAtMs) continue;
    let blocked = false;
    for (const player of players) {
      if (!player.alive) continue;
      if (insideBox(player.x, player.y + player.height * 0.5, player.z, item.box)) { blocked = true; break; }
    }
    if (blocked) { item.rebuildAtMs = nowMs + 500; continue; }
    item.broken = false;
    item.hp = item.maxHp;
    item.rebuildAtMs = 0;
  }
}

export function tryPickHerb(herbs: HerbRuntime[], player: PlayerSim, nowMs: number): HerbRuntime | null {
  if (!player.alive || player.hp >= MAX_HP) return null;
  for (const herb of herbs) {
    if (nowMs < herb.readyAtMs) continue;
    if (Math.hypot(player.x - herb.pos[0], player.y - herb.pos[1], player.z - herb.pos[2]) > MAP_HERB.touchM) continue;
    player.hp = Math.min(MAX_HP, player.hp + MAP_HERB.heal);
    herb.readyAtMs = nowMs + MAP_HERB.respawnMs;
    return herb;
  }
  return null;
}

export function tryGeyserLaunch(geysers: readonly Geyser[], player: PlayerSim, playerId: string, lastLaunchAt: Map<string, number>, nowMs: number): boolean {
  if (!player.alive) return false;
  for (const geyser of geysers) {
    const dist = Math.hypot(player.x - geyser.pos[0], player.z - geyser.pos[2]);
    if (dist > geyser.radius) continue;
    if (player.y + 0.2 < geyser.pos[1] || player.y > geyser.pos[1] + 2.5) continue;
    const stampKey = `${playerId}:${geyser.id}`;
    const prev = lastLaunchAt.get(stampKey) ?? 0;
    if (nowMs - prev < GEYSER.cooldownMs) continue;
    lastLaunchAt.set(stampKey, nowMs);
    player.vy = Math.max(player.vy, geyser.launch);
    player.grounded = false;
    return true;
  }
  return false;
}

/** Find the first unbroken breakable whose box is hit by a segment. */
export function breakableHitBySegment(items: readonly BreakableRuntime[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): { item: BreakableRuntime; t: number } | null {
  let best: BreakableRuntime | null = null;
  let bestT = 1;
  for (const item of items) {
    if (item.broken) continue;
    const t = segmentBoxEnter(x0, y0, z0, x1, y1, z1, item.box);
    if (t !== null && t < bestT) { bestT = t; best = item; }
  }
  return best ? { item: best, t: bestT } : null;
}

function segmentBoxEnter(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, box: Breakable["box"]): number | null {
  let near = 0; let far = 1;
  const origin = [x0, y0, z0]; const delta = [x1 - x0, y1 - y0, z1 - z0];
  for (let axis = 0; axis < 3; axis += 1) {
    const d = delta[axis]!; const o = origin[axis]!; const min = box.min[axis]!; const max = box.max[axis]!;
    if (Math.abs(d) < 1e-9) { if (o < min || o > max) return null; continue; }
    let a = (min - o) / d; let b = (max - o) / d; if (a > b) [a, b] = [b, a];
    near = Math.max(near, a); far = Math.min(far, b); if (near > far) return null;
  }
  return near >= 0 && near <= 1 ? near : null;
}

/** Collision map with unbroken breakables merged as solid+grapple wood boxes. */
export function mergeBreakablesIntoMap(map: MapData, items: readonly BreakableRuntime[]): MapData {
  const extras = solidBreakableBoxes(items);
  if (extras.length === 0) return map;
  return {
    ...map,
    boxes: [
      ...map.boxes,
      ...extras.map((box, index) => ({
        id: `breakable-solid-${index}`,
        min: box.min,
        max: box.max,
        material: "wood" as const,
        tags: ["solid", "grapple"] as const,
      })),
    ],
  };
}
