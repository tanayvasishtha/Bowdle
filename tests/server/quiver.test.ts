import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";
import { ArrowState } from "../../src/net/schema.ts";
import { MAX_HP, MELEE_COOLDOWN_MS, QUIVER } from "../../src/shared/constants.ts";
import { BTN } from "../../src/shared/input.ts";
import type { MatchStats } from "../../src/shared/matchStats.ts";

const step = { dt: 1 / 30, dtMs: 1000 / 30, tick: 1, subSteps: 2, subDt: 1 / 60, subDtMs: 1000 / 60 };
type Internals = { arrowOrigins: Map<string, { x: number; y: number; z: number }>; humanStats: Map<string, MatchStats>; simulationNowMs: number };

describe("quiver online", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); });

  it("a dagger swing swats an enemy arrow in front and nothing hits the swatter", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Swatter", test: true });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId); room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    const swats: Array<{ swatter: string; shooter: string }> = [];
    client.onMessage("swat", (message: { swatter: string; shooter: string }) => swats.push(message));
    const swatter = room.addStationaryPlayer("swatter", 1, 0, 20, 0);
    swatter.yaw = 0; swatter.meleeCooldownMs = MELEE_COOLDOWN_MS;
    const arrow = new ArrowState(); arrow.x = 0; arrow.y = 21.2; arrow.z = -2.5; arrow.vz = 60; arrow.owner = client.sessionId; arrow.team = 0; arrow.damage = 50; arrow.ageMs = 200;
    room.state.arrows.set("incoming", arrow);
    room.simulateTick(step, 100);
    expect(room.state.arrows.has("incoming")).toBe(false);
    expect(swatter.hp).toBe(MAX_HP);
    expect(room.xpEvents).toContainEqual({ type: "swat", player: "swatter" });

    // A point-blank arrow and an arrow late in the swing both go through.
    const pointBlank = new ArrowState(); Object.assign(pointBlank, { x: 0, y: 21.2, z: -2.5, vz: 60, owner: client.sessionId, team: 0, damage: 10 });
    room.state.arrows.set("point-blank", pointBlank);
    swatter.meleeCooldownMs = MELEE_COOLDOWN_MS;
    room.simulateTick(step, 110); room.simulateTick(step, 120);
    expect(swatter.hp).toBe(MAX_HP - 10);
    swatter.hp = MAX_HP;

    // Late in the swing the same arrow goes through.
    swatter.meleeCooldownMs = 100;
    const late = new ArrowState(); Object.assign(late, { x: 0, y: 21.2, z: -2.5, vz: 60, owner: client.sessionId, team: 0, damage: 50, ageMs: 200 });
    room.state.arrows.set("late", late);
    room.simulateTick(step, 133); room.simulateTick(step, 166);
    expect(swatter.hp).toBeLessThan(MAX_HP);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(swats).toContainEqual(expect.objectContaining({ swatter: "swatter", shooter: client.sessionId }));
    await client.leave();
  }, 15_000);

  it("a tether arrow makes a line that players ride until it expires", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Rider", test: true, mapId: "kit" });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId); room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    const internals = room as unknown as Internals;
    const now = internals.simulationNowMs;
    const tetherArrow = new ArrowState(); Object.assign(tetherArrow, { x: -14, y: 1.6, z: 8, vx: 80, owner: client.sessionId, team: 0, damage: 60, kind: "tether", bornMs: now });
    room.state.arrows.set("tether-shot", tetherArrow); internals.arrowOrigins.set("tether-shot", { x: -15, y: 0, z: 8 });
    for (let tick = 0; tick < 10 && room.state.tethers.size === 0; tick += 1) room.simulateTick(step, now + tick);
    expect(room.state.tethers.size).toBe(1);
    const [tetherId, tether] = [...room.state.tethers.entries()][0]!;
    expect([tether.fromX, tether.fromY, tether.fromZ]).toEqual([-15, QUIVER.tether.liftM, 8]);
    expect(tether.toX).toBeGreaterThan(-2); expect(tether.owner).toBe(client.sessionId);

    const rider = room.state.players.get(client.sessionId)!;
    rider.x = -15; rider.y = 0; rider.z = 8; rider.vx = 0; rider.vy = 0; rider.vz = 0;
    const wire = client.input({ mode: "reliable" });
    for (let frame = 0; frame < 20 && !rider.zipId; frame += 1) {
      wire.data.buttons = frame % 2 === 0 ? BTN.USE : 0; wire.send(); await room.waitForNextTimestep();
    }
    expect(rider.zipId).toBe(tetherId);
    expect(internals.humanStats.get(client.sessionId)?.tetherRides).toBe(1);

    wire.data.buttons = 0; wire.send();
    tether.expiresAtMs = 0;
    await room.waitForNextTimestep(); await room.waitForNextTimestep();
    expect(room.state.tethers.size).toBe(0);
    expect(rider.zipId).toBe("");
    await client.leave();
  }, 20_000);
});
