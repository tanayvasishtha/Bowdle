import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ArrowState } from "../../src/net/schema.ts";
import { server } from "../../src/server/app.config.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";
import { SERVER_TICK_BUDGET_MS, SUBSTEPS, TICK_HZ } from "../../src/shared/constants.ts";

describe("server performance budget", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  afterAll(async () => { await colyseus.shutdown(); });

  it("keeps an eight-player room with twenty arrows under the tick budget", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Observer", testMapId: "sun-temple" }); await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId); room.replacePlayerWithBot(client.sessionId); room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    const context = { dt: 1 / TICK_HZ, dtMs: 1000 / TICK_HZ, tick: 0, subSteps: SUBSTEPS, subDt: 1 / (TICK_HZ * SUBSTEPS), subDtMs: 1000 / (TICK_HZ * SUBSTEPS) };
    for (let tick = 0; tick < TICK_HZ; tick += 1) { context.tick = tick; room.simulateTick(context, tick * context.dtMs); }
    const measuredTicks = TICK_HZ * 2;
    // Arrows are born when the timed window starts, so all twenty stay in flight for every timed tick.
    for (let index = 0; index < 20; index += 1) { const arrow = new ArrowState(); arrow.x = -20 + index * 2; arrow.y = 8; arrow.z = 20; arrow.vz = -1; arrow.owner = "load"; arrow.team = index % 2; arrow.kind = "grapple"; arrow.bornMs = (TICK_HZ + measuredTicks) * context.dtMs; room.state.arrows.set(`load-${index}`, arrow); }
    // Discard one window so JIT/GC settle before the timed sample (threshold unchanged).
    for (let tick = TICK_HZ; tick < TICK_HZ + measuredTicks; tick += 1) { context.tick = tick; room.simulateTick(context, tick * context.dtMs); }
    const started = performance.now(); for (let tick = TICK_HZ + measuredTicks; tick < TICK_HZ + measuredTicks * 2; tick += 1) { context.tick = tick; room.simulateTick(context, tick * context.dtMs); }
    const averageTickMs = (performance.now() - started) / measuredTicks; console.info(JSON.stringify({ averageTickMs }));
    expect(averageTickMs).toBeLessThan(SERVER_TICK_BUDGET_MS);
  });
});
