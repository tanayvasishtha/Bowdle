import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import { sunTempleMap } from "../../src/shared/maps/sunTemple.ts";
import { createPlayerSim, stepPlayer } from "../../src/shared/sim/movement.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";

describe("online movement", () => {
  let colyseus: ColyseusTestServer<typeof server>;

  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); });

  it("joining creates a team player", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Archer" });
    await client.waitForInitialState();
    const player = client.state.players.get(client.sessionId);
    expect(player?.name).toBe("Archer");
    expect(player?.team).toBe(0);
    expect(client.state.players.size).toBe(8);
    expect([...client.state.players.values()].filter((entry) => entry.team === 0)).toHaveLength(4);
    expect([...client.state.players.values()].filter((entry) => entry.team === 1)).toHaveLength(4);
  });

  it("90 wire inputs match 90 direct shared steps", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Runner", testMapId: "sun-temple" });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    room.state.phase = "live";
    const serverPlayer = room.state.players.get(client.sessionId)!;
    const direct = createPlayerSim(serverPlayer.x, serverPlayer.y, serverPlayer.z);
    direct.yaw = serverPlayer.yaw;
    const wire = client.input({ mode: "reliable" });
    for (let frame = 0; frame < 90; frame += 1) {
      wire.data.moveX = 0;
      wire.data.moveZ = 1;
      wire.data.yaw = -Math.PI / 2;
      wire.data.pitch = 0;
      wire.data.buttons = 0;
      wire.send();
      await room.waitForNextTimestep();
      stepPlayer(direct, { moveX: 0, moveZ: 1, yaw: -Math.PI / 2, pitch: 0, buttons: 0 }, sunTempleMap, { nowMs: frame * 1000 / 30 });
    }
    expect(Math.abs(serverPlayer.x - direct.x)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(serverPlayer.y - direct.y)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(serverPlayer.z - direct.z)).toBeLessThanOrEqual(1e-6);
  }, 15_000);

  it("reconnects into the same player", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Returner" });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    const original = room.state.players.get(client.sessionId);
    client.reconnection.minUptime = 0;
    client.reconnection.delay = 0;
    client.reconnection.minDelay = 0;
    client.reconnection.maxDelay = 100;
    const reconnected = new Promise<void>((resolve) => client.onReconnect.once(resolve));
    client.connection.close();
    await reconnected;
    expect(room.state.players.get(client.sessionId)).toBe(original);
  }, 10_000);
});
