import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeGameDatabase, gameDatabase } from "../../src/server/db/GameDatabase.ts";
import { canQueueRanked, defaultRating, displayedSkill } from "../../src/shared/rating.ts";

describe("G12 ranked database", () => {
  beforeAll(async () => { await gameDatabase(); });
  afterAll(async () => { await closeGameDatabase(); });

  it("rejects ranked queue below level 10 or without a linked account", () => {
    expect(canQueueRanked(9, true)).toBe(false);
    expect(canQueueRanked(10, false)).toBe(false);
    expect(canQueueRanked(10, true)).toBe(true);
  });

  it("records leave-as-loss and moves rating", async () => {
    const db = await gameDatabase();
    const guest = await db.createGuest("RankedLeaver");
    const before = await db.getRating(guest.profile.id);
    expect(before.rating).toBe(defaultRating().rating);
    await db.recordRankedLeave(guest.profile.id);
    const after = await db.getRating(guest.profile.id);
    expect(after.matches).toBe(1);
    expect(after.rating).toBeLessThanOrEqual(before.rating);
    expect(displayedSkill(after)).toBeLessThan(displayedSkill(before) + 1);
  });

  it("applies a win/loss pair", async () => {
    const db = await gameDatabase();
    const a = await db.createGuest("RankedAna");
    const b = await db.createGuest("RankedBen");
    await db.applyRankedResults([
      { accountId: a.profile.id, won: true, team: 0 },
      { accountId: b.profile.id, won: false, team: 1 },
    ]);
    const ana = await db.getRating(a.profile.id);
    const ben = await db.getRating(b.profile.id);
    expect(ana.rating).toBeGreaterThan(ben.rating);
    expect(ana.matches).toBe(1);
    expect(ben.matches).toBe(1);
    const board = await db.rankedLeaderboard();
    expect(board.some((row) => row.name === "RankedAna")).toBe(true);
  });
});
