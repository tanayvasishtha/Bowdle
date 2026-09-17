import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canQueueRanked } from "../../src/shared/rating.ts";
import { closeGameDatabase, gameDatabase } from "../../src/server/db/GameDatabase.ts";

describe("F1 ranked and reports", () => {
  beforeAll(async () => { await gameDatabase(); });
  afterAll(async () => { await closeGameDatabase(); });

  it("refuses ranked queue below level 10 or without a linked account", () => {
    expect(canQueueRanked(9, true)).toBe(false);
    expect(canQueueRanked(10, false)).toBe(false);
    expect(canQueueRanked(10, true)).toBe(true);
  });

  it("applies ranked results only against other teams and is idempotent by match id", async () => {
    const db = await gameDatabase();
    const a = await db.createGuest("F1SunA");
    const b = await db.createGuest("F1MoonB");
    const c = await db.createGuest("F1SunC");
    const matchId = `f1-${a.profile.id}`;
    const lines = [
      { accountId: a.profile.id, won: true, team: 0 },
      { accountId: c.profile.id, won: true, team: 0 },
      { accountId: b.profile.id, won: false, team: 1 },
    ];
    await db.applyRankedResults(lines, matchId);
    const afterFirst = await db.getRating(a.profile.id);
    await db.applyRankedResults(lines, matchId);
    const afterSecond = await db.getRating(a.profile.id);
    expect(afterSecond.matches).toBe(afterFirst.matches);
    expect(afterSecond.rating).toBe(afterFirst.rating);
    const teammate = await db.getRating(c.profile.id);
    // Teammates both won; they should not have played each other as 0.5 draws only — rating should still move vs the enemy.
    expect(teammate.matches).toBe(1);
  });

  it("stores a report between two accounts", async () => {
    const db = await gameDatabase();
    const a = await db.createGuest("F1Reporter");
    const b = await db.createGuest("F1Target");
    const result = await db.fileReport(a.profile.id, b.profile.id, "offensiveName", { matchId: `room:1` });
    expect(result).toBeTruthy();
  });

  it("hides rating numbers from the public profile payload", async () => {
    const db = await gameDatabase();
    const guest = await db.createGuest("F1Hidden");
    const profile = await db.profile(guest.profile.id);
    expect(profile).toBeTruthy();
    expect((profile as { rating?: number }).rating).toBeUndefined();
    expect((profile as { rd?: number }).rd).toBeUndefined();
    expect(profile!.tier).toBeTruthy();
  });
});
