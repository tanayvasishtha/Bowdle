import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import { closeGameDatabase } from "../../src/server/db/GameDatabase.ts";
import { launchSafeOptions, type TdmRoom } from "../../src/server/rooms/TdmRoom.ts";

describe("production ignores test harness join options", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  const savedEnv = process.env.NODE_ENV;
  const savedAllow = process.env.ALLOW_TEST_JOINS;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterEach(() => {
    process.env.NODE_ENV = savedEnv;
    if (savedAllow === undefined) delete process.env.ALLOW_TEST_JOINS; else process.env.ALLOW_TEST_JOINS = savedAllow;
  });
  afterAll(async () => { await colyseus.shutdown(); await closeGameDatabase(); });

  it("strips every harness option in production and keeps them in tests", () => {
    const requested = { name: "Probe", test: true, testStartWave: 9, testMapId: "kit", testBotSeed: 4, seed: 77, botPlayers: 3 };
    process.env.NODE_ENV = "test";
    expect(launchSafeOptions(requested)).toEqual(requested);
    process.env.NODE_ENV = "production";
    expect(launchSafeOptions(requested)).toEqual({ name: "Probe", test: false, testStartWave: undefined, testMapId: undefined, testBotSeed: undefined, seed: undefined, botPlayers: undefined });
    process.env.ALLOW_TEST_JOINS = "1";
    expect(launchSafeOptions(requested)).toEqual(requested);
  });

  it("keeps the bots when a production client joins a public room with test: true", async () => {
    process.env.NODE_ENV = "production";
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Raw Socket", test: true });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    // In test mode the join would have removed every bot and left this player alone.
    expect([...room.state.players.values()].filter((player) => player.isBot).length).toBeGreaterThan(0);
    await client.leave();
  });
});
