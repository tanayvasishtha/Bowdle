import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";
import { SUBSTEPS, TICK_HZ, TIME_LIMIT_S } from "../../src/shared/constants.ts";
import { canopyMap } from "../../src/shared/maps/canopy.ts";

type Motion = { x: number; z: number; movedAtMs: number };

describe("Canopy Village full match", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); });

  it("finishes after bots traverse the canopy and ride zip lines", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Observer", testMapId: canopyMap.id });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    room.replacePlayerWithBot(client.sessionId);
    room.state.phase = "live";
    room.state.phaseEndsAtMs = TIME_LIMIT_S * 1000;
    const riders = [...room.state.players.values()].slice(0, canopyMap.zipLines.length);
    for (let index = 0; index < riders.length; index += 1) {
      const zip = canopyMap.zipLines[index]!;
      const rider = riders[index]!;
      rider.x = zip.from[0]; rider.y = zip.from[1]; rider.z = zip.from[2];
      rider.yaw = 0; rider.prevButtons = 0;
    }
    const context = { dt: 1 / TICK_HZ, dtMs: 1000 / TICK_HZ, tick: 0, subSteps: SUBSTEPS, subDt: 1 / (TICK_HZ * SUBSTEPS), subDtMs: 1000 / (TICK_HZ * SUBSTEPS) };
    const motion = new Map<string, Motion>();
    for (let tick = 0; tick <= TIME_LIMIT_S * TICK_HZ && room.state.phase === "live"; tick += 1) {
      context.tick = tick;
      const nowMs = tick * context.dtMs;
      room.simulateTick(context, nowMs);
      for (const [id, player] of room.state.players) {
        const prior = motion.get(id);
        if (!prior || Math.hypot(player.x - prior.x, player.z - prior.z) > 0.03) motion.set(id, { x: player.x, z: player.z, movedAtMs: nowMs });
        else if (player.alive && player.spawnProtectMs <= 0) expect(nowMs - prior.movedAtMs, `${id} stationary at ${player.x.toFixed(2)},${player.y.toFixed(2)},${player.z.toFixed(2)}`).toBeLessThanOrEqual(3000);
      }
    }
    expect(room.zipRideCount).toBeGreaterThanOrEqual(3);
    expect(room.state.phase).toBe("end");
  }, 25_000);
});
