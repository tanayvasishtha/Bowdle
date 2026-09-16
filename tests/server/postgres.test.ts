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
    db = await GameDatabase.open({ sql });
  });

  afterAll(async () => {
    await db.close();
    await server.stop();
    await pglite.close();
  });

  it("runs accounts, rewards, the shop and deletion through postgres.js", async () => {
    const { token, profile } = await db.createGuest("Wire");
    expect(await db.authenticate(token)).toBe(profile.id);
    const granted = await db.recordMatch("wire:1", [{ accountId: profile.id, kills: 10, assists: 0, won: true }]);
    expect(granted[0]).toMatchObject({ xp: 800, ink: 30 });
    expect(await db.recordMatch("wire:1", [{ accountId: profile.id, kills: 10, assists: 0, won: true }])).toEqual([]);
    for (let match = 2; match <= 12; match += 1) await db.recordMatch(`wire:${match}`, [{ accountId: profile.id, kills: 10, assists: 0, won: true }]);
    expect(await db.buyWithInk(profile.id, "bow.jade")).toMatchObject({ ok: true, locker: { ink: 60 } });
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
    expect(result[0]).toMatchObject({ xp: 625, ink: 23 });
    expect(result[0]!.breakdown.find((row) => row.label === "Headshots")).toEqual({ label: "Headshots", xp: 75, ink: 0 });
    expect(await db.recordMatch("wire:precision", [line])).toEqual([]);
    expect(await db.profile(profile.id)).toMatchObject({ xp: 625, ink: 23 });
  });
});
