import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import { closeGameDatabase } from "../../src/server/db/GameDatabase.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";

describe("N3 reach and retention", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); await closeGameDatabase(); });

  it("rejects a spectator outside a party", async () => {
    await expect(colyseus.sdk.joinOrCreate("tdm", { name: "Spy", spectator: true })).rejects.toThrow();
  });

  it("seats a party spectator without a player or score", async () => {
    const host = await colyseus.sdk.joinOrCreate("party", { name: "Host", party: "N3SPEC" });
    const room = colyseus.getRoomById<TdmRoom>(host.roomId);
    const spy = await colyseus.sdk.joinOrCreate("party", { name: "Spy", party: "N3SPEC", spectator: true });
    expect(spy.roomId).toBe(host.roomId);
    expect(room.state.players.has(host.sessionId)).toBe(true);
    expect(room.state.players.has(spy.sessionId)).toBe(false);
    expect((room as unknown as { spectators: Set<string> }).spectators.has(spy.sessionId)).toBe(true);
    await host.leave();
    await spy.leave();
  });

  it("reconnects into a held seat", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Runner", test: true, botPlayers: 0 });
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    const token = client.reconnectionToken;
    const sessionId = client.sessionId;
    expect(token).toBeTruthy();
    await client.leave(false);
    const again = await colyseus.sdk.reconnect(token!);
    expect(again.sessionId).toBe(sessionId);
    expect(again.roomId).toBe(room.roomId);
    expect(room.state.players.has(again.sessionId)).toBe(true);
    await again.leave();
  });
});
