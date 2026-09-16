import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GameDatabase } from "../../src/server/db/GameDatabase.ts";
import { apiRouter } from "../../src/server/api/routes.ts";
import { createMatchStats } from "../../src/shared/matchStats.ts";

describe("level rewards and career", () => {
  let db: GameDatabase;
  beforeAll(async () => { db = await GameDatabase.open({ now: () => new Date("2026-05-23") }); });
  afterAll(async () => { await db.close(); });
  it("grants every level crossed from 1 to 11 once including all six Ink rewards", async () => {
    const { profile } = await db.createGuest("Explorer");
    const line = { accountId: profile.id, kills: 548, assists: 0, won: false };
    const reward = (await db.recordMatch("levels:jump", [line]))[0]!;
    expect(reward.after).toEqual({ level: 11, intoLevel: 0, levelSize: 5500 });
    expect(reward.unlocked).toEqual(["trail.chalk", "bow.explorer", "effect.dust", "outfit.cartographer"]);
    expect(reward.breakdown.filter((entry) => entry.label.startsWith("Level "))).toEqual([2, 4, 6, 8, 9, 11].map((level) => ({ label: `Level ${level} reward`, xp: 0, ink: 50 + 5 * level })));
    expect(reward.ink).toBe(25 + 60 + 70 + 80 + 90 + 95 + 105);
    const before = await db.locker(profile.id);
    expect(await db.recordMatch("levels:jump", [line])).toEqual([]); expect(await db.locker(profile.id)).toEqual(before);
    expect(await db.buyWithInk(profile.id, "trail.chalk")).toEqual({ ok: false, reason: "not_for_ink" });
    expect(await db.setLoadout(profile.id, { trail: "trail.chalk" })).toMatchObject({ trail: "trail.chalk" });
  });
  it("adds career totals over three matches and keeps best streak and distance", async () => {
    const { profile } = await db.createGuest("Career");
    for (const [index, stats] of [
      { ...createMatchStats(), kills: 3, headshots: 1, bestStreak: 3, longestShotM: 35, won: true },
      { ...createMatchStats(), kills: 2, headshots: 2, bestStreak: 2, longestShotM: 45 },
      { ...createMatchStats(), kills: 4, headshots: 0, bestStreak: 4, longestShotM: 20, won: true },
    ].entries()) await db.recordMatch(`career:${index}`, [{ accountId: profile.id, kills: stats.kills, assists: 0, won: stats.won, stats }]);
    expect(await db.profile(profile.id)).toMatchObject({ career: { matches: 3, wins: 2, kills: 9, headshots: 3, bestStreak: 4, longestShotM: 45 } });
  });
  it("dev XP grants award level items without counting a match and cannot double-pay old levels", async () => {
    const { profile } = await db.createGuest("Dev");
    expect(await db.grantXp(profile.id, 1500)).toMatchObject({ progress: { level: 3 }, ink: 60, career: { matches: 0 }, nextUnlock: { level: 4, ink: 70 } });
    expect((await db.locker(profile.id))?.owned).toEqual(["trail.chalk"]);
    expect(await db.grantXp(profile.id, 0)).toMatchObject({ ink: 60 });
    expect(await db.grantXp("missing-account", 1500)).toBeUndefined();
    await expect(db.grantXp(profile.id, Number.NaN)).rejects.toThrow("Invalid XP grant");
    expect((await db.profile(profile.id))?.xp).toBe(1500);
  });
  it("exposes XP grants only with the dev flag and never in production", async () => {
    const savedFlag = process.env.BOWDLE_DEV_GRANTS; const savedMode = process.env.NODE_ENV;
    const { token } = await db.createGuest("Route");
    let http: Server | undefined;
    try {
      process.env.BOWDLE_DEV_GRANTS = "1"; process.env.NODE_ENV = "test";
      const app = express(); app.use("/api", apiRouter({ database: async () => db }));
      http = await new Promise<Server>((resolve) => { const listening = app.listen(0, () => resolve(listening)); });
      const base = `http://localhost:${(http.address() as AddressInfo).port}/api`;
      expect((await fetch(`${base}/dev/grant-xp`, { method: "POST" })).status).toBe(401);
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      const response = await fetch(`${base}/dev/grant-xp`, { method: "POST", headers, body: JSON.stringify({ xp: 1500 }) });
      expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ progress: { level: 3 } });
      await new Promise<void>((resolve) => http!.close(() => resolve())); http = undefined;
      process.env.NODE_ENV = "production";
      const production = express(); production.use("/api", apiRouter({ database: async () => db }));
      http = await new Promise<Server>((resolve) => { const listening = production.listen(0, () => resolve(listening)); });
      expect((await fetch(`http://localhost:${(http.address() as AddressInfo).port}/api/dev/grant-xp`, { method: "POST", headers, body: JSON.stringify({ xp: 1500 }) })).status).toBe(404);
    } finally {
      if (http) await new Promise<void>((resolve) => http!.close(() => resolve()));
      if (savedFlag === undefined) delete process.env.BOWDLE_DEV_GRANTS; else process.env.BOWDLE_DEV_GRANTS = savedFlag;
      if (savedMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedMode;
    }
  });
});
