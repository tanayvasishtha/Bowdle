/** Village Defense (Play mode) on top of the Expedition director. */
export const TOTEM_ID = "__totem__";

export const VILLAGE = {
  totemMaxHp: 500,
  totemRadius: 1.4,
  /** Raiders prefer the totem when no living player is closer than this. */
  totemAggroM: 28,
  /** Runners ignore players for the totem unless one is this close. */
  runnerPlayerM: 8,
  shopMs: 10_000,
  coinKill: 3,
  coinWave: 12,
  coinBoss: 25,
  dailyBoardLimit: 20,
} as const;

export type VillageUpgradeId =
  | "fastDraw"
  | "doubleShot"
  | "fireArrows"
  | "moreHealth"
  | "fastGrapple"
  | "totemRepair";

export type VillageUpgrade = {
  id: VillageUpgradeId;
  name: string;
  blurb: string;
  cost: number;
};

export const VILLAGE_UPGRADES: readonly VillageUpgrade[] = [
  { id: "fastDraw", name: "Quick Draw", blurb: "Draw the bow faster.", cost: 18 },
  { id: "doubleShot", name: "Twin Shot", blurb: "Every fifth arrow fires twice.", cost: 22 },
  { id: "fireArrows", name: "Fire Tips", blurb: "Arrows burn for bonus damage.", cost: 20 },
  { id: "moreHealth", name: "Thick Hide", blurb: "More health for the run.", cost: 16 },
  { id: "fastGrapple", name: "Swift Vine", blurb: "Grapple reels in faster.", cost: 14 },
  { id: "totemRepair", name: "Totem Mend", blurb: "Restore the village totem.", cost: 15 },
] as const;

export type VillageBuffs = {
  drawMult: number;
  doubleEvery: number;
  fireBonus: number;
  hpMult: number;
  grappleMult: number;
};

export function emptyBuffs(): VillageBuffs {
  return { drawMult: 1, doubleEvery: 0, fireBonus: 0, hpMult: 1, grappleMult: 1 };
}

export function applyUpgrade(buffs: VillageBuffs, id: VillageUpgradeId): VillageBuffs {
  const next = { ...buffs };
  if (id === "fastDraw") next.drawMult *= 0.82;
  else if (id === "doubleShot") next.doubleEvery = next.doubleEvery > 0 ? next.doubleEvery : 5;
  else if (id === "fireArrows") next.fireBonus = Math.max(next.fireBonus, 8);
  else if (id === "moreHealth") next.hpMult *= 1.25;
  else if (id === "fastGrapple") next.grappleMult *= 1.3;
  return next;
}

/** Three random upgrades; never repeats the same id in one shop. */
export function rollShop(rng: () => number, owned: ReadonlySet<VillageUpgradeId>): VillageUpgradeId[] {
  const pool = VILLAGE_UPGRADES.filter((row) => row.id === "totemRepair" || !owned.has(row.id)).map((row) => row.id);
  const picks: VillageUpgradeId[] = [];
  const bag = [...pool];
  while (picks.length < 3 && bag.length > 0) {
    const index = Math.floor(rng() * bag.length);
    picks.push(bag.splice(index, 1)[0]!);
  }
  return picks;
}

export const RAIDER_LABELS: Record<string, string> = {
  beetle: "Runner",
  spitter: "Spear Thrower",
  guardian: "Shield Brute",
  mire: "Torch Bearer",
  wisp: "Scout",
  tender: "Healer",
  colossus: "Chief",
};
