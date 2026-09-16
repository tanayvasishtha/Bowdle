import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GameDatabase } from "../../src/server/db/GameDatabase.ts";
import { openSql } from "../../src/server/db/sql.ts";
import { createMatchStats } from "../../src/shared/matchStats.ts";

// Production talks to Postgres through postgres.js. PGlite's socket server speaks the Postgres wire
// protocol, so this runs the real production client, migrations and queries without Docker.
const PORT = 55432;

describe("GameDatabase over the Postgres wire protocol", () => {
  let pglite: PGlite;
  let server: PGLiteSocketServer;
  let db: GameDatabase;

  beforeAll(async () => {
    pglite = await PGlite.create();
    server = new PGLiteSocketServer({ db: pglite, port: PORT, host: "127.0.0.1" });
    await server.start();
    const sql = await openSql({ DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres` });
    db = await GameDatabase.open({ sql, now: () => new Date("2026-05-23") });
  });

  afterAll(async () => {
    await db.close();
    await server.stop();
    await pglite.close();
  });

  it("grants the field course Ink once through postgres.js", async () => {
    const { profile } = await db.createGuest("Course");
    expect(await db.completeTutorial(profile.id)).toEqual({ granted: true, ink: profile.ink + 100 });
    expect(await db.completeTutorial(profile.id)).toEqual({ granted: false, ink: profile.ink + 100 });
    expect((await db.profile(profile.id))?.tutorialDone).toBe(true);
  });

  it("runs accounts, rewards, the shop and deletion through postgres.js", async () => {
    const { token, profile } = await db.createGuest("Wire");
    expect(await db.authenticate(token)).toBe(profile.id);
    const granted = await db.recordMatch("wire:1", [{ accountId: profile.id, kills: 10, assists: 0, won: true }]);
    expect(granted[0]).toMatchObject({ xp: 900, ink: 115, streakDays: 1 });
    expect(await db.recordMatch("wire:1", [{ accountId: profile.id, kills: 10, assists: 0, won: true }])).toEqual([]);
    for (let match = 2; match <= 12; match += 1) await db.recordMatch(`wire:${match}`, [{ accountId: profile.id, kills: 10, assists: 0, won: true }]);
    expect(await db.buyWithInk(profile.id, "bow.jade")).toMatchObject({ ok: true, locker: { ink: 295 } });
    expect(await db.setLoadout(profile.id, { bow: "bow.jade" })).toMatchObject({ bow: "bow.jade" });
    expect(await db.fulfillOrder("wire-order", profile.id, ["trail-gold-leaf"])).toEqual(["trail.gold"]);
    expect(await db.fulfillOrder("wire-order", profile.id, ["trail-gold-leaf"])).toEqual([]);
    expect(await db.cancelOrder("wire-order")).toEqual(["trail.gold"]);
    expect((await db.leaderboard())[0]).toMatchObject({ name: "Wire", kills: 120 });
    expect(await db.signInWithProvider("discord", "wire-discord", "Wire", profile.id)).toEqual({ accountId: profile.id });
    expect(await db.deleteAccount(profile.id)).toBe(true);
    expect(await db.authenticate(token)).toBeUndefined();
  });
  it("stores medal and precision XP once through postgres.js", async () => {
    const { profile } = await db.createGuest("Precision");
    const stats = { ...createMatchStats(), kills: 3, headshots: 3, longShots: 2, longestShotM: 45, won: true };
    const line = { accountId: profile.id, kills: 3, assists: 0, won: true, stats, medals: ["headhunter", "eagleEye"] };
    const result = await db.recordMatch("wire:precision", [line]);
    expect(result[0]).toMatchObject({ xp: 875, ink: 138 });
    expect(result[0]!.breakdown.find((row) => row.label === "Headshots")).toEqual({ label: "Headshots", xp: 75, ink: 0 });
    expect(await db.recordMatch("wire:precision", [line])).toEqual([]);
    expect(await db.profile(profile.id)).toMatchObject({ xp: 875, ink: 138 });
    expect((await db.challenges(profile.id)).daily.find((entry) => entry.id === "d.longshots")).toMatchObject({ progress: 2, done: true });
    expect(await db.rerollDaily(profile.id, "d.longshots")).toBeUndefined();
    expect((await db.rerollDaily(profile.id, "d.zip"))?.rerollAvailable).toBe(false);
    expect(await db.rerollDaily(profile.id, "d.streak")).toBeUndefined();
    const next = (await db.recordMatch("wire:precision:2", [line]))[0]!;
    expect(next.unlocked).toEqual(["trail.chalk"]);
    expect(next.breakdown.some((entry) => entry.label.startsWith("Daily:"))).toBe(false);
    expect(next.breakdown.some((entry) => entry.label === "First win of the day")).toBe(false);
  });
  it("grants every crossed level, career totals and dev XP through postgres.js", async () => {
    const { profile } = await db.createGuest("Levels");
    const line = { accountId: profile.id, kills: 548, assists: 0, won: false };
    const reward = (await db.recordMatch("wire:levels", [line]))[0]!;
    expect(reward.unlocked).toEqual(["trail.chalk", "bow.explorer", "effect.dust", "outfit.cartographer"]);
    expect(reward).toMatchObject({ ink: 525, after: { level: 11 } });
    expect(await db.recordMatch("wire:levels", [line])).toEqual([]);
    expect(await db.profile(profile.id)).toMatchObject({ career: { matches: 1, kills: 548, wins: 0, headshots: 0, bestStreak: 0, longestShotM: 0 } });
    expect(await db.buyWithInk(profile.id, "trail.chalk")).toEqual({ ok: false, reason: "not_for_ink" });
    const dev = await db.createGuest("Devlevel");
    expect(await db.grantXp(dev.profile.id, 1500)).toMatchObject({ ink: 60, progress: { level: 3 }, career: { matches: 0 } });
    expect((await db.locker(dev.profile.id))?.owned).toEqual(["trail.chalk"]);
    expect(await db.grantXp(dev.profile.id, 0)).toMatchObject({ ink: 60 });
  });
});
