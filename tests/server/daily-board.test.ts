import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import { closeGameDatabase, gameDatabase } from "../../src/server/db/GameDatabase.ts";
import { createMatchStats } from "../../src/shared/matchStats.ts";

describe("Village Defense daily board", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  afterAll(async () => { await colyseus.shutdown(); await closeGameDatabase(); });

  it("lists today's best wave per player, best first", async () => {
    const db = await gameDatabase();
    const run = async (name: string, match: string, wave: number): Promise<void> => {
      const { profile } = await db.createGuest(name);
      await db.recordMatch(match, [{ accountId: profile.id, kills: 0, assists: 0, won: false, stats: { ...createMatchStats(), waveReached: wave }, expedition: { waves: wave, bosses: 0, reachedWave: wave } }]);
    };
    await run("Grove Warden", "daily-board-a", 7);
    await run("Totem Keeper", "daily-board-b", 14);
    const response = await colyseus.http.get("/api/expedition/daily");
    const rows = (response.data as { rows: Array<{ name: string; wave: number }> }).rows;
    const mine = rows.filter((row) => row.name === "Grove Warden" || row.name === "Totem Keeper");
    expect(mine).toEqual([{ name: "Totem Keeper", wave: 14 }, { name: "Grove Warden", wave: 7 }]);
  });
});
