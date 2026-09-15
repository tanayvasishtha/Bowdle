import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";
import { BTN } from "../../src/shared/input.ts";
import { notebookMap } from "../../src/shared/maps/notebook.ts";
import { createPlayerSim, stepPlayer } from "../../src/shared/sim/movement.ts";

describe("authoritative online abilities", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); });

  it("matches a predicted grapple for 60 frames", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Hook", test: true });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId); room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    const serverPlayer = room.state.players.get(client.sessionId)!;
    serverPlayer.x = -20; serverPlayer.y = 0; serverPlayer.z = 5;
    const direct = createPlayerSim(serverPlayer.x, serverPlayer.y, serverPlayer.z);
    const yaw = Math.atan2(-1.5, -4);
    const pitch = Math.atan2(1, Math.hypot(1.5, 4));
    const wire = client.input({ mode: "reliable" });
    for (let frame = 0; frame < 60; frame += 1) {
      const buttons = frame === 0 ? BTN.GRAPPLE : 0;
      wire.data.moveX = 0; wire.data.moveZ = 0; wire.data.yaw = yaw; wire.data.pitch = pitch; wire.data.buttons = buttons;
      wire.send(); await room.waitForNextTimestep();
      stepPlayer(direct, { moveX: 0, moveZ: 0, yaw, pitch, buttons }, notebookMap, { nowMs: frame * 1000 / 30 });
    }
    expect(Math.abs(serverPlayer.x - direct.x)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(serverPlayer.y - direct.y)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(serverPlayer.z - direct.z)).toBeLessThanOrEqual(1e-6);
    expect(serverPlayer.grappleMs).toBe(direct.grappleMs);
  }, 15_000);

  it("spawns an expiring cloud when an ink lob hits the world", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Inker", test: true });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId); room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    const wire = client.input({ mode: "reliable" });
    wire.data.pitch = -0.6; wire.data.buttons = BTN.INK; wire.send(); await room.waitForNextTimestep();
    wire.data.buttons = 0;
    for (let frame = 0; frame < 20 && room.state.inkClouds.size === 0; frame += 1) { wire.send(); await room.waitForNextTimestep(); }
    expect(room.state.inkClouds.size).toBe(1);
    const cloud = [...room.state.inkClouds.values()][0]!;
    expect(cloud.expiresAtMs).toBeGreaterThan(room.clock.elapsedTime);
  });
});
