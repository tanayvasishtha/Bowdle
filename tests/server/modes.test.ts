import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";
import type { PlayerState } from "../../src/net/schema.ts";
import { LOBBY_FILL_BOTS, MAX_HP, MODE_TUNING, RELIC } from "../../src/shared/constants.ts";
import type { MatchStats } from "../../src/shared/matchStats.ts";

const step = { dt: 1 / 30, dtMs: 1000 / 30, tick: 1, subSteps: 2, subDt: 1 / 60, subDtMs: 1000 / 60 };
type Internals = {
  dealDamage(attacker: string, target: string, damage: number, weapon: "arrow", headshot: boolean, fromX: number, fromZ: number): void;
  humanStats: Map<string, MatchStats>;
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Free for All and Relic Run rooms", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); });

  it("fills Free for All to the bot floor with unique teams and ends at 20 kills", async () => {
    const client = await colyseus.sdk.joinOrCreate("ffa", { name: "Loner" });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    expect(room.state.mode).toBe("ffa");
    expect(room.state.players.size).toBe(LOBBY_FILL_BOTS);
    expect(new Set([...room.state.players.values()].map((player) => player.team)).size).toBe(LOBBY_FILL_BOTS);
    const tdm = await colyseus.sdk.joinOrCreate("tdm", { name: "Teamer" });
    expect(tdm.roomId).not.toBe(client.roomId);
    expect(colyseus.getRoomById<TdmRoom>(tdm.roomId).state.mode).toBe("tdm");
    await tdm.leave();
    const party = await colyseus.sdk.joinOrCreate("party", { name: "Leader", party: "ABCDEF", mode: "relic" });
    expect(colyseus.getRoomById<TdmRoom>(party.roomId).state.mode).toBe("relic");
    await party.leave();

    room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    const ends: Array<{ winner: string; mvp: string }> = [];
    client.onMessage("matchEnd", (message: { winner: string; mvp: string }) => ends.push(message));
    const [attackerId, attacker] = [...room.state.players].find(([id]) => id !== client.sessionId)!;
    const [victimId, victim] = [...room.state.players].find(([id]) => id !== client.sessionId && id !== attackerId)!;
    attacker.kills = MODE_TUNING.ffaKillLimit - 1;
    victim.spawnProtectMs = 0;
    (room as unknown as Internals).dealDamage(attackerId, victimId, MAX_HP, "arrow", false, 0, 0);
    expect(attacker.kills).toBe(MODE_TUNING.ffaKillLimit);
    expect(room.state.phase).toBe("end");
    expect(room.state.scoreSun).toBe(MODE_TUNING.ffaKillLimit);
    await wait(150);
    expect(ends).toContainEqual(expect.objectContaining({ winner: "player", mvp: attackerId }));
    await client.leave();
  }, 20_000);

  it("carries the relic home for a capture, drops it on death and sends it home after a while", async () => {
    const client = await colyseus.sdk.joinOrCreate("relic", { name: "Runner", test: true });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    const events: Array<{ event: string; player: string }> = [];
    client.onMessage("relic", (message: { event: string; player: string }) => events.push(message));
    const relic = room.state.relic;
    expect(relic.home).toBe(true);
    const runner = room.addStationaryPlayer("runner", 0, relic.x, relic.y, relic.z);
    let now = 1000;
    const tick = (): void => { room.simulateTick(step, now); now += step.dtMs; };

    tick();
    expect(relic.carrier).toBe("runner");
    expect(runner.relicCarrier).toBe(true);
    runner.x = -29; runner.y = 0; runner.z = 0;
    tick();
    expect(room.state.scoreSun).toBe(1);
    expect(relic.home).toBe(true);
    expect(runner.relicCarrier).toBe(false);

    // Picked up again, then the carrier dies in the Moon half and drops it.
    runner.x = relic.x; runner.y = relic.y; runner.z = relic.z;
    tick();
    expect(relic.carrier).toBe("runner");
    const hunter = room.addStationaryPlayer("hunter", 1, 20, 0, 20) as PlayerState;
    runner.x = 10; runner.y = 0; runner.z = 12; runner.spawnProtectMs = 0;
    tick();
    (room as unknown as Internals).dealDamage("hunter", "runner", MAX_HP, "arrow", false, 20, 20);
    tick();
    expect(runner.alive).toBe(false);
    expect(relic.carrier).toBe("");
    expect(relic.home).toBe(false);
    expect([relic.x, relic.z]).toEqual([10, 12]);

    // Nobody touches it: it goes home after the ground timer.
    now += RELIC.returnMs;
    tick();
    expect(relic.home).toBe(true);

    // Dropped in the Moon half again: a Moon defender touching it sends it home at once.
    runner.alive = true; runner.hp = MAX_HP; runner.x = relic.x; runner.y = relic.y; runner.z = relic.z;
    tick();
    runner.x = 10; runner.y = 0; runner.z = 12; runner.alive = false;
    tick();
    expect(relic.home).toBe(false);
    hunter.x = relic.x; hunter.y = relic.y; hunter.z = relic.z;
    tick();
    expect(relic.home).toBe(true);

    await wait(150);
    expect(events.map((event) => event.event)).toEqual(["pickup", "capture", "pickup", "drop", "return", "pickup", "drop", "return"]);
    expect(events.at(-1)?.player).toBe("hunter");
    await client.leave();
  }, 20_000);

  it("records relic captures for human players", async () => {
    const client = await colyseus.sdk.joinOrCreate("relic", { name: "Capturer", test: true });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    const me = room.state.players.get(client.sessionId)!;
    const relic = room.state.relic;
    room.state.relic.carrier = client.sessionId; room.state.relic.home = false; me.relicCarrier = true;
    me.x = me.team === 0 ? -29 : 29; me.y = 0; me.z = 0;
    room.simulateTick(step, 2000);
    expect(relic.home).toBe(true);
    expect((room as unknown as Internals).humanStats.get(client.sessionId)?.relicCaptures).toBe(1);
    await client.leave();
  }, 20_000);
});
