import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";
import { FLOOD_MS, SUBSTEPS, TICK_HZ, TIME_LIMIT_S } from "../../src/shared/constants.ts";
import { lostRiverMap } from "../../src/shared/maps/lostRiver.ts";
import { createPlayerSim, stepPlayer } from "../../src/shared/sim/movement.ts";

const context = { dt: 1 / TICK_HZ, dtMs: 1000 / TICK_HZ, tick: 0, subSteps: SUBSTEPS, subDt: 1 / (TICK_HZ * SUBSTEPS), subDtMs: 1000 / (TICK_HZ * SUBSTEPS) };

describe("jungle map rotation", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); });

  it("rotates Sun Temple, Canopy Village and Lost River", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Observer" }); await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    expect(room.state.mapId).toBe("sun-temple");
    for (const expected of ["canopy", "lost-river", "sun-temple"]) {
      room.state.phase = "end"; room.state.phaseEndsAtMs = 0; room.simulateTick(context, 0);
      expect(room.state.mapId).toBe(expected);
    }
  });

  it("uses a clear end-screen map vote and falls back to rotation on a tie", async () => {
    const first = await colyseus.sdk.joinOrCreate("tdm", { name: "One", test: true }); await first.waitForInitialState();
    const second = await colyseus.sdk.joinOrCreate("tdm", { name: "Two", test: true }); await second.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(first.roomId); room.state.phase = "end"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    room.voteMap(first.sessionId, "lost-river"); room.voteMap(second.sessionId, "lost-river");
    room.state.phaseEndsAtMs = 0; room.simulateTick(context, 0); expect(room.state.mapId).toBe("lost-river");
    room.state.phase = "end"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    room.voteMap(first.sessionId, "sun-temple"); room.voteMap(second.sessionId, "canopy");
    room.state.phaseEndsAtMs = 0; room.simulateTick(context, 0); expect(room.state.mapId).toBe("sun-temple");
  });

  it("finishes an eight-player Lost River match", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Observer", testMapId: lostRiverMap.id }); await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId); room.replacePlayerWithBot(client.sessionId);
    room.state.phase = "live"; room.state.phaseEndsAtMs = TIME_LIMIT_S * 1000;
    for (let tick = 0; tick <= TIME_LIMIT_S * TICK_HZ && room.state.phase === "live"; tick += 1) { context.tick = tick; room.simulateTick(context, tick * context.dtMs); }
    expect(room.state.players.size).toBe(8);
    expect([...room.state.players.values()].every((player) => player.isBot)).toBe(true);
    expect(room.state.phase).toBe("end");
  }, 35_000);
});

describe("Lost River flood", () => {
  it("slows a player caught in the river during the flood window", () => {
    const river = createPlayerSim(0, -1, 7); const land = createPlayerSim(-10, 0, 7);
    for (let frame = 0; frame < TICK_HZ; frame += 1) {
      const input = { moveX: 1, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 };
      stepPlayer(river, input, lostRiverMap, { nowMs: frame * 1000 / TICK_HZ });
      stepPlayer(land, input, lostRiverMap, { nowMs: FLOOD_MS + frame * 1000 / TICK_HZ });
    }
    expect(Math.hypot(river.vx, river.vz)).toBeLessThan(Math.hypot(land.vx, land.vz));
  });
});
