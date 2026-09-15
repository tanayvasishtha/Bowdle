import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import { SUBSTEPS, TICK_HZ, TIME_LIMIT_S } from "../../src/shared/constants.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";

describe("full computer-controlled match", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); });

  it("eight computer-controlled players finish within seven simulated minutes", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Observer" }); await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId); room.replacePlayerWithBot(client.sessionId);
    room.state.phase = "live"; room.state.phaseEndsAtMs = TIME_LIMIT_S * 1000;
    const context = { dt: 1 / TICK_HZ, dtMs: 1000 / TICK_HZ, tick: 0, subSteps: SUBSTEPS, subDt: 1 / (TICK_HZ * SUBSTEPS), subDtMs: 1000 / (TICK_HZ * SUBSTEPS) };
    const totalTicks = TIME_LIMIT_S * TICK_HZ;
    for (let tick = 0; tick <= totalTicks && room.state.phase === "live"; tick += 1) { context.tick = tick; room.simulateTick(context, tick * context.dtMs); }
    expect(room.state.players.size).toBe(8); expect([...room.state.players.values()].every((player) => player.isBot)).toBe(true);
    expect(room.state.scoreSun + room.state.scoreMoon).toBeGreaterThan(0); expect(room.state.phase).toBe("end");
  }, 20_000);
});
