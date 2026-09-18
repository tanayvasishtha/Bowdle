import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeGameDatabase, GameDatabase, gameDatabase } from "../../src/server/db/GameDatabase.ts";
import { featuredForDay, utcDayKey } from "../../src/shared/featured.ts";
import { expeditionRewardIds, seasonRewardForTier } from "../../src/shared/n2Rewards.ts";
import { TIERS } from "../../src/shared/rating.ts";

describe("N2 progression identity shop and social", () => {
  let db: GameDatabase;
  beforeAll(async () => { db = await gameDatabase(); });
  afterAll(async () => { await closeGameDatabase(); });

  it("grants a season tier cosmetic only once per season", async () => {
    const guest = await db.createGuest("N2Season");
    const season = "2099-S1";
    const tier = TIERS[2]!.id;
    const itemId = seasonRewardForTier(tier);
    expect(await db.grantSeasonTierReward(guest.profile.id, season, tier)).toBe(true);
    expect((await db.locker(guest.profile.id))?.owned).toContain(itemId);
    expect(await db.grantSeasonTierReward(guest.profile.id, season, tier)).toBe(false);
    const owned = (await db.locker(guest.profile.id))?.owned.filter((id) => id === itemId) ?? [];
    expect(owned).toEqual([itemId]);
  });

  it("keeps recent player tokens private (no other account ids in the payload)", async () => {
    const ana = await db.createGuest("N2Ana");
    const ben = await db.createGuest("N2Ben");
    await db.rememberMatchPeers([ana.profile.id, ben.profile.id]);
    const recent = await db.recentPlayers(ana.profile.id);
    expect(recent.length).toBe(1);
    expect(recent[0]!.name).toBe("N2Ben");
    expect(recent[0]!.token).toMatch(/^[a-f0-9]{24}$/);
    expect(JSON.stringify(recent)).not.toContain(ben.profile.id);
    expect(JSON.stringify(recent)).not.toContain(ana.profile.id);
  });

  it("keeps featured rotation stable within a UTC day", () => {
    const day = utcDayKey(new Date("2033-10-22T12:00:00Z"));
    const morning = featuredForDay(day).map((item) => item.id);
    const evening = featuredForDay(utcDayKey(new Date("2033-10-22T23:59:00Z"))).map((item) => item.id);
    const next = featuredForDay(utcDayKey(new Date("2033-10-23T00:30:00Z"))).map((item) => item.id);
    expect(morning).toEqual(evening);
    expect(morning.length).toBeGreaterThan(0);
    expect(next).not.toEqual(morning);
    expect(expeditionRewardIds(10, 0)).toEqual(["trail.expedition.wave10"]);
    expect(expeditionRewardIds(20, 1)).toEqual([
      "trail.expedition.wave10",
      "trail.expedition.wave20",
      "effect.expedition.colossus",
    ]);
  });
});
