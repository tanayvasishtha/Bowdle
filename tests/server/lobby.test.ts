import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import { closeGameDatabase } from "../../src/server/db/GameDatabase.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";
import { LOBBY_FILL_BOTS, LOBBY_RESPAWN_MS, MAX_HP } from "../../src/shared/constants.ts";
import { MODE_NAMES, MODE_RULES } from "../../src/shared/sim/modes.ts";

type Internals = { dealDamage(attackerId: string, targetId: string, damage: number, weapon: "arrow", headshot: boolean, fromX: number, fromZ: number): void; simulationNowMs: number };

describe("Lobby (the free for all room)", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); await closeGameDatabase(); });

  const bots = (room: TdmRoom): number => [...room.state.players.values()].filter((player) => player.isBot).length;

  it("is called Lobby, plays 5 minute rounds on Wild Crossing and fills with bots to six", async () => {
    expect(MODE_NAMES.ffa).toBe("Lobby");
    expect(MODE_RULES.ffa.timeLimitS).toBe(300);
    const client = await colyseus.sdk.joinOrCreate("ffa", { name: "First" });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    expect(room.state.mapId).toBe("wild-crossing");
    expect(room.state.players.size).toBe(LOBBY_FILL_BOTS);
    expect(bots(room)).toBe(LOBBY_FILL_BOTS - 1);
    await client.leave();
  });

  it("gives each joining player a bot's seat, and opens a new room for the eleventh player", async () => {
    const clients: Array<{ roomId: string; leave(): Promise<unknown> }> = [];
    for (let index = 0; index < 10; index += 1) {
      const client = await colyseus.sdk.joinOrCreate("ffa", { name: `Explorer${index}` });
      await client.waitForInitialState();
      clients.push(client);
    }
    const room = colyseus.getRoomById<TdmRoom>(clients[0]!.roomId);
    expect(clients.every((client) => client.roomId === room.roomId)).toBe(true);
    // Six or more humans need no bots.
    expect(bots(room)).toBe(0);
    expect(room.state.players.size).toBe(10);
    const eleventh = await colyseus.sdk.joinOrCreate("ffa", { name: "Eleventh" });
    expect(eleventh.roomId).not.toBe(room.roomId);
    await Promise.all([...clients, eleventh].map((client) => client.leave()));
  });

  it("respawns a Lobby player after two seconds", async () => {
    const client = await colyseus.sdk.joinOrCreate("ffa", { name: "Target" });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    const [botId] = [...room.state.players].find(([, player]) => player.isBot)!;
    const me = room.state.players.get(client.sessionId)!;
    me.spawnProtectMs = 0;
    const internals = room as unknown as Internals;
    internals.dealDamage(botId, client.sessionId, MAX_HP * 2, "arrow", false, 0, 0);
    expect(me.alive).toBe(false);
    expect(me.respawnAtMs - internals.simulationNowMs).toBe(LOBBY_RESPAWN_MS);
    await client.leave();
  });
});
