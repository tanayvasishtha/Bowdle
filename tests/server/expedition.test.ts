import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import { closeGameDatabase, gameDatabase } from "../../src/server/db/GameDatabase.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";
import { ArrowState } from "../../src/net/schema.ts";
import { CREATURE_TUNING, EXPEDITION, MAX_HP } from "../../src/shared/constants.ts";
import { BTN } from "../../src/shared/input.ts";
import { createMatchStats, type MatchStats } from "../../src/shared/matchStats.ts";
import { gravityMultiplier, waveCount } from "../../src/shared/sim/waves.ts";
import { createPlayerSim, stepPlayer } from "../../src/shared/sim/movement.ts";
import { sunTempleMap } from "../../src/shared/maps/sunTemple.ts";

const step = { dt: 1 / 30, dtMs: 1000 / 30, tick: 1, subSteps: 2, subDt: 1 / 60, subDtMs: 1000 / 60 };
type Internals = { humanStats: Map<string, MatchStats> };

describe("Expedition", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); await closeGameDatabase(); });

  async function openRun(name: string) {
    const client = await colyseus.sdk.joinOrCreate("expedition", { name, test: true, checkpoint: false });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    let now = 1000;
    const tick = (count = 1): void => { for (let index = 0; index < count; index += 1) { room.simulateTick(step, now); now += step.dtMs; } };
    return { client, room, tick, me: room.state.players.get(client.sessionId)!, now: () => now };
  }

  it("starts waves, spawns creatures under the cap and clears a wave when they fall to arrows", async () => {
    const { client, room, tick, me, now } = await openRun("Warden");
    expect(room.state.mode).toBe("expedition");
    expect([...room.state.players.values()].every((player) => player.team === 0)).toBe(true);
    const hits: Array<{ id: string; damage: number }> = [];
    client.onMessage("creatureHit", (message: { id: string; damage: number }) => hits.push(message));
    tick();
    const run = room.state.expedition;
    expect(run.wave).toBe(1);
    expect(run.phase).toBe("fight");
    expect(run.left).toBe(waveCount(1, 1));
    tick(90);
    expect(room.state.creatures.size).toBeGreaterThan(0);
    expect(room.state.creatures.size).toBeLessThanOrEqual(5);
    expect([...room.state.creatures.values()].every((creature) => creature.kind === "beetle")).toBe(true);

    // Keep the player safe and shoot every creature as it arrives.
    me.x = -29; me.y = 0; me.z = 0;
    for (let round = 0; round < 400 && run.phase === "fight"; round += 1) {
      me.hp = MAX_HP;
      for (const [id, creature] of room.state.creatures) {
        const arrow = new ArrowState();
        Object.assign(arrow, { x: creature.x - 3, y: creature.y + 0.4, z: creature.z, vx: 90, owner: client.sessionId, team: 0, damage: 60, bornMs: now() });
        room.state.arrows.set(`shot-${round}-${id}`, arrow);
      }
      tick();
    }
    expect(run.phase).toBe("break");
    expect(run.cleared).toBe(1);
    expect(room.state.herbs.size).toBe(EXPEDITION.herbs);
    expect((room as unknown as Internals).humanStats.get(client.sessionId)?.waveReached).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(hits.length).toBeGreaterThan(0);
    expect(me.kills).toBe(waveCount(1, 1));
    await client.leave();
  }, 30_000);

  it("runs a boss wave: the Colossus calls beetles at half health and counts as defeated", async () => {
    const { client, room, tick, now } = await openRun("Slayer");
    const run = room.state.expedition;
    run.wave = 4; run.phase = "break"; run.phaseEndsAtMs = 0;
    tick();
    expect(run.wave).toBe(5);
    const colossus = [...room.state.creatures].find(([, creature]) => creature.kind === "colossus")!;
    expect(colossus).toBeDefined();
    expect(colossus[1].maxHp).toBe(CREATURE_TUNING.colossus.hp);
    const before = room.state.creatures.size;
    colossus[1].hp = colossus[1].maxHp / 2;
    tick();
    expect([...room.state.creatures.values()].filter((creature) => creature.kind === "beetle").length).toBeGreaterThanOrEqual(CREATURE_TUNING.colossus.summons);
    expect(room.state.creatures.size).toBeGreaterThanOrEqual(before + CREATURE_TUNING.colossus.summons);
    const gemY = colossus[1].y + CREATURE_TUNING.colossus.gemHeightM;
    const gemX = colossus[1].x - Math.sin(colossus[1].yaw) * CREATURE_TUNING.colossus.radius * 0.6;
    const gemZ = colossus[1].z - Math.cos(colossus[1].yaw) * CREATURE_TUNING.colossus.radius * 0.6;
    colossus[1].hp = 1;
    const arrow = new ArrowState();
    Object.assign(arrow, { x: gemX - 1, y: gemY, z: gemZ, vx: 90, owner: client.sessionId, team: 0, damage: 60, bornMs: now() });
    room.state.arrows.set("gem-shot", arrow);
    tick();
    expect(room.state.creatures.has(colossus[0])).toBe(false);
    expect(run.bosses).toBe(1);
    expect((room as unknown as Internals).humanStats.get(client.sessionId)?.colossusKills).toBe(1);
    await client.leave();
  }, 30_000);

  it("downs players, lets a teammate revive them, bleeds out the rest and ends the run", async () => {
    const { client, room, tick, me } = await openRun("Medic");
    const run = room.state.expedition;
    const helper = room.addStationaryPlayer("helper", 0, me.x + 1, me.y, me.z);
    helper.alive = true; helper.hp = MAX_HP;
    const director = room.expedition!;
    run.phase = "fight"; run.phaseEndsAtMs = 0;
    director.hurt(client.sessionId, 500);
    expect(me.downed).toBe(true);
    expect(me.alive).toBe(true);
    helper.prevButtons = BTN.USE; helper.x = me.x + 1; helper.z = me.z;
    tick(Math.ceil(EXPEDITION.reviveMs / step.dtMs) + 2);
    expect(me.downed).toBe(false);
    expect(me.hp).toBeGreaterThan(1);

    helper.prevButtons = 0;
    director.hurt(client.sessionId, 500);
    director.hurt("helper", 500);
    expect([me.downed, helper.downed]).toEqual([true, true]);
    tick();
    expect(room.state.phase).toBe("end");
    expect(run.phase).toBe("over");
    await client.leave();
  }, 30_000);

  it("matches a predicted low gravity jump and a downed crawl for 60 frames", async () => {
    const client = await colyseus.sdk.joinOrCreate("expedition", { name: "Floaty", test: true, checkpoint: false, testMapId: "sun-temple" });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    // Hold the run in a break so no creatures slow the ticks down.
    const run = room.state.expedition;
    run.phase = "break"; run.phaseEndsAtMs = Number.MAX_SAFE_INTEGER; run.modifier = "lowGravity";
    await room.waitForNextTimestep();
    // A standing teammate keeps the run going while this player is down.
    room.addStationaryPlayer("helper", 0, -28, 0, 8).alive = true;
    const me = room.state.players.get(client.sessionId)!;
    me.x = -28; me.y = 0; me.z = 0; me.vx = 0; me.vy = 0; me.vz = 0;
    await room.waitForNextTimestep();
    const direct = createPlayerSim(me.x, me.y, me.z);
    Object.assign(direct, { vx: me.vx, vy: me.vy, vz: me.vz, grounded: me.grounded, yaw: me.yaw });
    // Stop the fixed timestep: when a tick has no new input the server replays the last one, so wall-clock waits run more steps than this loop.
    room.setTimestep();
    room.inputs.get(client.sessionId).clear();
    // Push frames into the room input buffer directly; with the clock stopped, client.input().send() never flushes.
    type InputClient = { sessionId: string; _input: { moveX: number; moveZ: number; yaw: number; pitch: number; buttons: number } };
    const seat = [...room.clients].find((entry) => entry.sessionId === client.sessionId) as unknown as InputClient;
    const capture = (room as unknown as { _inputController: { capture: (target: InputClient) => void } })._inputController;
    let peak = 0;
    let now = 1000;
    for (let frame = 0; frame < 60; frame += 1) {
      if (frame === 30) { me.downed = true; me.downedMs = EXPEDITION.downedMs; direct.downed = true; }
      const buttons = frame === 0 || frame === 35 ? BTN.JUMP : 0;
      seat._input.moveX = 0; seat._input.moveZ = 1; seat._input.yaw = -Math.PI / 2; seat._input.pitch = 0; seat._input.buttons = buttons;
      capture.capture(seat);
      room.simulateTick(step, now);
      stepPlayer(direct, { moveX: 0, moveZ: 1, yaw: -Math.PI / 2, pitch: 0, buttons }, sunTempleMap, { nowMs: now, gravityMult: gravityMultiplier("lowGravity") });
      now += step.dtMs;
      peak = Math.max(peak, direct.y);
    }
    expect(peak).toBeGreaterThan(1.8);
    expect(room.state.creatures.size).toBe(0);
    expect(me.downed).toBe(true);
    expect(Math.abs(me.x - direct.x)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(me.y - direct.y)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(me.z - direct.z)).toBeLessThanOrEqual(1e-6);
    await client.leave();
  }, 30_000);

  it("gives a solo player a spare life every five waves", async () => {
    const { client, room, tick, me } = await openRun("Loner");
    const run = room.state.expedition;
    run.wave = 5; run.phase = "fight"; run.phaseEndsAtMs = 0;
    room.state.creatures.clear();
    tick(40);
    expect(run.phase).toBe("break");
    expect(run.lives).toBe(1);
    room.expedition!.hurt(client.sessionId, 500);
    expect(me.downed).toBe(false);
    expect(me.hp).toBeGreaterThan(0);
    expect(run.lives).toBe(0);
    await client.leave();
  }, 30_000);

  it("starts a checkpoint run after the best checkpoint and caps the run reward", async () => {
    const db = await gameDatabase();
    const { token, profile } = await db.createGuest("Veteran");
    const line = { accountId: profile.id, kills: 0, assists: 0, won: false, stats: { ...createMatchStats(), waveReached: 12 }, expedition: { waves: 22, bosses: 4, reachedWave: 12 } };
    const [reward] = await db.recordMatch("expedition-seed", [line]);
    expect(reward!.breakdown).toContainEqual({ label: "Waves cleared", xp: 22 * EXPEDITION.xpPerWave, ink: EXPEDITION.inkCap });
    expect(reward!.breakdown).toContainEqual({ label: "Temple Colossus", xp: 4 * EXPEDITION.xpPerBoss, ink: 0 });
    expect(await db.expeditionBest(profile.id)).toBe(12);
    expect((await db.profile(profile.id))?.expeditionBest).toBe(12);
    expect((await db.expeditionLeaderboard()).find((row) => row.name === "Veteran")).toEqual({ name: "Veteran", wave: 12 });

    const client = await colyseus.sdk.joinOrCreate("expedition", { name: "Veteran", token, test: true, checkpoint: true });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    // The checkpoint comes from an async database lookup; wait for it instead of a fixed sleep that loses the race under load.
    const pending = room as unknown as { startWave: number };
    for (let wait = 0; wait < 300 && pending.startWave === 0; wait += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    room.state.phaseEndsAtMs = 0;
    room.simulateTick(step, 10);
    expect(room.state.phase).toBe("live");
    expect(room.state.expedition.startWave).toBe(10);
    room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    room.simulateTick(step, 10_000);
    expect(room.state.expedition.wave).toBe(11);
    const fresh = await colyseus.sdk.joinOrCreate("expedition", { name: "Rookie", test: true, checkpoint: false });
    expect(fresh.roomId).not.toBe(client.roomId);
    await fresh.leave();
    await client.leave();
  }, 30_000);
});
