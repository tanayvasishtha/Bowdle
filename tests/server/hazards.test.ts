import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";

describe("authoritative jungle hazards", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); });

  it("kills in the boulder path, spares an alcove, and credits the puller", async () => {
    const pullerClient = await colyseus.sdk.joinOrCreate("tdm", { name: "Puller", test: true, mapId: "kit" });
    await pullerClient.waitForInitialState();
    const targetClient = await colyseus.sdk.joinById(pullerClient.roomId, { name: "Target", test: true });
    await targetClient.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(pullerClient.roomId); room.state.phase = "live";
    const puller = room.state.players.get(pullerClient.sessionId)!;
    const target = room.state.players.get(targetClient.sessionId)!;
    puller.x = 0; puller.y = 0; puller.z = -3;
    target.x = -7.5; target.y = 0; target.z = -6; target.spawnProtectMs = 0;
    const safe = room.addStationaryPlayer("safe", target.team, -2, 0, -1); safe.spawnProtectMs = 0;
    const hazard = room.state.hazards.get("center-boulder")!;
    expect(room.useLever(pullerClient.sessionId, 1)).toBe(true);
    expect(hazard.phase).toBe("telegraph"); expect(hazard.puller).toBe(pullerClient.sessionId);
    hazard.phase = "roll"; hazard.direction = 1; hazard.t = 0; hazard.puller = pullerClient.sessionId;
    room.updateHazards(1000, 0.05);
    expect(target.alive).toBe(false);
    expect(safe.alive).toBe(true);
    expect(puller.kills).toBe(1);
  });
});
