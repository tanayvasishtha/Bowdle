import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";
import { BTN } from "../../src/shared/input.ts";
import { defaultMatchMap } from "../../src/shared/maps/registry.ts";
import { kitMap } from "../../src/shared/maps/fixtures/kit.ts";
import { createPlayerSim, stepPlayer } from "../../src/shared/sim/movement.ts";
import { ArrowState } from "../../src/net/schema.ts";
import { GRAPPLE_COOLDOWN_MS } from "../../src/shared/constants.ts";

describe("authoritative online abilities", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); });

  it("matches a predicted grapple swing for 60 frames", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Hook", test: true });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId); room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    const serverPlayer = room.state.players.get(client.sessionId)!;
    expect(serverPlayer.grappleActive).toBe(false);
    serverPlayer.x = -20; serverPlayer.y = 0; serverPlayer.z = 5;
    const direct = createPlayerSim(serverPlayer.x, serverPlayer.y, serverPlayer.z);
    // Aimed at the vine wall east of the spawn.
    const yaw = -Math.PI / 2;
    const pitch = 0.1;
    const wire = client.input({ mode: "reliable" });
    let attached = 0, swung = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      const buttons = frame === 0 ? BTN.GRAPPLE : 0;
      const moveZ = 0;
      wire.data.moveZ = moveZ;
      wire.data.moveX = 0; wire.data.yaw = yaw; wire.data.pitch = pitch; wire.data.buttons = buttons;
      wire.send(); await room.waitForNextTimestep();
      stepPlayer(direct, { moveX: 0, moveZ, yaw, pitch, buttons }, defaultMatchMap, { nowMs: frame * 1000 / 30 });
      if (direct.grappleActive && direct.grappleReeling) attached += 1;
      if (direct.grappleActive && !direct.grappleReeling) swung += 1;
    }
    expect(attached).toBe(1);
    expect(swung).toBeGreaterThan(5);
    expect(Math.abs(serverPlayer.x - direct.x)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(serverPlayer.y - direct.y)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(serverPlayer.z - direct.z)).toBeLessThanOrEqual(1e-6);
    expect(serverPlayer.grappleLen).toBeCloseTo(direct.grappleLen, 6);
  }, 15_000);

  it("matches a predicted zip ride for 60 frames", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Rider", test: true, mapId: "kit" });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId); room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    const serverPlayer = room.state.players.get(client.sessionId)!;
    const high = kitMap.zipLines[0]!.from;
    serverPlayer.x = high[0]; serverPlayer.y = high[1]; serverPlayer.z = high[2]; serverPlayer.vx = 0; serverPlayer.vy = 0; serverPlayer.vz = 0; serverPlayer.grounded = false;
    const direct = createPlayerSim(...high); direct.grounded = false;
    const wire = client.input({ mode: "reliable" });
    for (let frame = 0; frame < 60; frame += 1) {
      const buttons = frame === 0 ? BTN.USE : 0;
      wire.data.moveX = 0; wire.data.moveZ = 0; wire.data.yaw = 0; wire.data.pitch = 0; wire.data.buttons = buttons;
      wire.send(); await room.waitForNextTimestep();
      stepPlayer(direct, { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons }, kitMap, { nowMs: frame * 1000 / 30 });
    }
    expect(serverPlayer.zipId).toBe(direct.zipId);
    expect(serverPlayer.zipT).toBe(direct.zipT);
    const clientPlayer = client.state.players.get(client.sessionId)!;
    expect(clientPlayer.zipId).toBe(direct.zipId);
    expect(clientPlayer.zipT).toBe(direct.zipT);
    expect(Math.abs(serverPlayer.x - direct.x)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(serverPlayer.y - direct.y)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(serverPlayer.z - direct.z)).toBeLessThanOrEqual(1e-6);
  }, 15_000);

  it("an enemy arrow cuts a rope and the owner falls", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Snipper", test: true });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId); room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    const cuts: Array<{ cutter: string; owner: string }> = [];
    client.onMessage("ropeCut", (message: { cutter: string; owner: string }) => cuts.push(message));
    const hanger = room.addStationaryPlayer("hanger", 1, 0, 20, 0);
    hanger.grounded = false; hanger.grappleActive = true; hanger.grappleX = 0; hanger.grappleY = 26; hanger.grappleZ = 0; hanger.grappleLen = 5.1;
    const friendly = new ArrowState(); friendly.x = -1; friendly.y = 23; friendly.vx = 95; friendly.owner = "mate"; friendly.team = 1;
    room.state.arrows.set("friendly", friendly);
    room.simulateTick({ dt: 1 / 30, dtMs: 1000 / 30, tick: 1, subSteps: 2, subDt: 1 / 60, subDtMs: 1000 / 60 }, 100);
    expect(hanger.grappleActive).toBe(true);
    const enemy = new ArrowState(); enemy.x = -1; enemy.y = 23; enemy.vx = 95; enemy.owner = client.sessionId; enemy.team = 0;
    room.state.arrows.set("enemy", enemy);
    room.simulateTick({ dt: 1 / 30, dtMs: 1000 / 30, tick: 2, subSteps: 2, subDt: 1 / 60, subDtMs: 1000 / 60 }, 133);
    expect(hanger.grappleActive).toBe(false);
    expect(hanger.grappleCooldownMs).toBe(GRAPPLE_COOLDOWN_MS);
    expect(room.xpEvents).toContainEqual({ type: "ropeCut", player: client.sessionId });
    const startY = hanger.y;
    for (let frame = 0; frame < 10; frame += 1) stepPlayer(hanger, { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 }, defaultMatchMap, { nowMs: 200 + frame * 33 });
    expect(hanger.y).toBeLessThan(startY - 0.5);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(cuts).toContainEqual({ cutter: client.sessionId, owner: "hanger", x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) });
    await client.leave();
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
