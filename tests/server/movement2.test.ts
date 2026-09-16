import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";
import { BTN } from "../../src/shared/input.ts";
import { defaultMatchMap } from "../../src/shared/maps/registry.ts";
import { createPlayerSim, stepPlayer } from "../../src/shared/sim/movement.ts";
import { PlayerState } from "../../src/net/schema.ts";

describe("movement 2.0 online", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); });

  it("steps the synced player state exactly like the plain simulation through every new move", () => {
    // Prediction replays inputs on the synced schema state, so both must move identically.
    const synced = new PlayerState(); synced.x = -20; synced.y = 0; synced.z = 5;
    const direct = createPlayerSim(-20, 0, 5);
    const yaw = -Math.PI / 2;
    const buttonsAt = (frame: number): number => (frame === 0 || frame === 10 ? BTN.JUMP : 0) | (frame === 25 ? BTN.DODGE : 0) | (frame >= 40 && frame < 70 ? BTN.CROUCH : 0);
    let hopped = false, dodged = false;
    for (let frame = 0; frame < 120; frame += 1) {
      const input = { moveX: frame % 30 < 15 ? 1 : 0, moveZ: 1, yaw, pitch: 0, buttons: buttonsAt(frame) };
      stepPlayer(synced, input, defaultMatchMap, { nowMs: frame * 1000 / 30 });
      stepPlayer(direct, input, defaultMatchMap, { nowMs: frame * 1000 / 30 });
      if (frame === 10) hopped = direct.airJumps === 0;
      if (frame === 25) dodged = direct.dodgeCooldownMs > 0;
      for (const key of ["x", "y", "z", "vx", "vy", "vz", "airJumps", "wallJumps", "dodgeCooldownMs", "mantleCooldownMs", "landingGraceMs", "wallTouchMs"] as const) {
        expect(synced[key], `${key} at frame ${frame}`).toBe(direct[key]);
      }
    }
    expect(hopped).toBe(true);
    expect(dodged).toBe(true);
  });

  it("steps the synced player state exactly like the plain simulation through a reel, swing and launch", () => {
    const synced = new PlayerState(); synced.x = -20; synced.y = 0; synced.z = 5;
    const direct = createPlayerSim(-20, 0, 5);
    const buttonsAt = (frame: number): number => (frame < 12 ? BTN.GRAPPLE : 0) | (frame === 40 ? BTN.JUMP : 0);
    let swung = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      const input = { moveX: 0, moveZ: frame >= 12 ? 1 : 0, yaw: -Math.PI / 2, pitch: 0.1, buttons: buttonsAt(frame) };
      stepPlayer(synced, input, defaultMatchMap, { nowMs: frame * 1000 / 30 });
      stepPlayer(direct, input, defaultMatchMap, { nowMs: frame * 1000 / 30 });
      if (direct.grappleActive && !direct.grappleReeling) swung += 1;
      for (const key of ["x", "y", "z", "vx", "vy", "vz", "grappleActive", "grappleLen", "grappleMs", "grappleBlockedMs", "grappleReeling", "grappleCooldownMs", "airJumps"] as const) {
        expect(synced[key], `${key} at frame ${frame}`).toBe(direct[key]);
      }
    }
    expect(swung).toBeGreaterThan(0);
    expect(direct.grappleCooldownMs).toBeGreaterThan(0);
  });

  it("sends the new movement state to the client", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Hopper", test: true });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    const serverPlayer = room.state.players.get(client.sessionId)!;
    serverPlayer.airJumps = 0; serverPlayer.wallJumps = 2; serverPlayer.dodgeCooldownMs = 1234.5; serverPlayer.wallNormalX = -1;
    await room.waitForNextPatch();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const clientPlayer = client.state.players.get(client.sessionId)!;
    expect([clientPlayer.airJumps, clientPlayer.wallJumps, clientPlayer.wallNormalX]).toEqual([0, 2, -1]);
    expect(clientPlayer.dodgeCooldownMs).toBeGreaterThan(0);
    await client.leave();
  }, 15_000);

  it("kills a player who falls out of the world and credits a recent attacker", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Faller", test: true });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId); room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    const kills: Array<{ killer: string; victim: string; weapon: string }> = [];
    client.onMessage("kill", (message: { killer: string; victim: string; weapon: string }) => kills.push(message));
    const internals = room as unknown as { simulationNowMs: number; damage: Map<string, Map<string, { attacker: string; damage: number; atMs: number }>> };

    const drifter = room.addStationaryPlayer("drifter", 1, 0, -40, 0);
    await room.waitForNextTimestep(); await room.waitForNextTimestep();
    expect(drifter.alive).toBe(false);

    const pusher = room.addStationaryPlayer("pusher", 0, 10, 0, 10);
    const pushed = room.addStationaryPlayer("pushed", 1, 0, -40, 3);
    internals.damage.set("pushed", new Map([["pusher", { attacker: "pusher", damage: 20, atMs: internals.simulationNowMs }]]));
    await room.waitForNextTimestep(); await room.waitForNextTimestep();
    expect(pushed.alive).toBe(false);
    expect(pusher.kills).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(kills).toContainEqual(expect.objectContaining({ killer: "Ravine", victim: "drifter", weapon: "fall" }));
    expect(kills).toContainEqual(expect.objectContaining({ killer: "pusher", victim: "pushed", weapon: "fall" }));
    await client.leave();
  }, 15_000);
});
