import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import { closeGameDatabase, gameDatabase } from "../../src/server/db/GameDatabase.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";
import { AFK_PROMPT_MS, AFK_REMOVE_MS, PING_RATE_LIMIT } from "../../src/shared/pings.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("G11 social safety", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); await closeGameDatabase(); });

  it("rate-limits pings and only delivers them to teammates", async () => {
    const ana = await colyseus.sdk.joinOrCreate("tdm", { name: "Ana", test: true });
    const ben = await colyseus.sdk.joinOrCreate("tdm", { name: "Ben", test: true });
    expect(ben.roomId).toBe(ana.roomId);
    const room = colyseus.getRoomById<TdmRoom>(ana.roomId);
    const anaPlayer = room.state.players.get(ana.sessionId)!;
    const benPlayer = room.state.players.get(ben.sessionId)!;

    benPlayer.team = anaPlayer.team;
    const matePings: unknown[] = [];
    ben.onMessage("pingEvent", (message) => matePings.push(message));
    ana.send("ping", { kind: "enemy", x: 1, y: 1, z: 1 });
    await wait(150);
    expect(matePings.length).toBe(1);

    matePings.length = 0;
    benPlayer.team = anaPlayer.team === 0 ? 1 : 0;
    (room as unknown as { pingStamps: Map<string, number[]> }).pingStamps.set(ana.sessionId, []);
    ana.send("ping", { kind: "location", x: 0, y: 1, z: 0 });
    await wait(150);
    expect(matePings.length).toBe(0);

    const stamps = (room as unknown as { pingStamps: Map<string, number[]> }).pingStamps;
    stamps.set(ana.sessionId, []);
    for (let i = 0; i < PING_RATE_LIMIT + 2; i += 1) {
      ana.send("ping", { kind: "location", x: i, y: 1, z: 0 });
    }
    await wait(150);
    expect((stamps.get(ana.sessionId) ?? []).length).toBe(PING_RATE_LIMIT);

    await ana.leave();
    await ben.leave();
  });

  it("prompts at 60s idle and removes at 90s", async () => {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Idle", test: true });
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    const roomAny = room as unknown as {
      testMode: boolean;
      simulationNowMs: number;
      lastInputAtMs: Map<string, number>;
      afkPrompted: Set<string>;
      checkAfk: (nowMs: number) => void;
    };
    roomAny.testMode = false;
    room.state.phase = "live";
    const prompts: unknown[] = [];
    const removed: unknown[] = [];
    client.onMessage("afkPrompt", (message) => prompts.push(message));
    client.onMessage("afkRemoved", (message) => removed.push(message));
    const now = roomAny.simulationNowMs || 100_000;
    roomAny.lastInputAtMs.set(client.sessionId, now - AFK_PROMPT_MS - 50);
    roomAny.checkAfk(now);
    await wait(150);
    expect(roomAny.afkPrompted.has(client.sessionId)).toBe(true);
    expect(prompts.length).toBe(1);

    // Stub leave so AFK kick does not sit in allowReconnection for RECONNECT_WINDOW_S.
    const gameClient = room.clients.find((entry) => entry.sessionId === client.sessionId)!;
    const leaveCodes: number[] = [];
    const originalLeave = gameClient.leave.bind(gameClient);
    gameClient.leave = ((code?: number) => { leaveCodes.push(code ?? 0); }) as typeof gameClient.leave;

    roomAny.lastInputAtMs.set(client.sessionId, now - AFK_REMOVE_MS - 50);
    roomAny.checkAfk(now + 1);
    await wait(150);
    expect(removed.length).toBe(1);
    expect(leaveCodes).toEqual([4000]);

    gameClient.leave = originalLeave;
    roomAny.testMode = true;
    // cleanup() tears the room down; avoid a second leave after the stubbed kick.
  });

  it("resets a name after three distinct offensive-name reports", async () => {
    const db = await gameDatabase();
    const r1 = await db.createGuest("R1");
    const r2 = await db.createGuest("R2");
    const r3 = await db.createGuest("R3");
    const target = await db.createGuest("ToxicName");
    const targetId = target.profile.id;
    expect(await db.fileReport(r1.profile.id, targetId, "offensiveName")).toEqual({});
    expect(await db.fileReport(r2.profile.id, targetId, "offensiveName")).toEqual({});
    const third = await db.fileReport(r3.profile.id, targetId, "offensiveName");
    expect(third?.resetName).toMatch(/^Explorer\d{4}$/);
    const profile = await db.profile(targetId);
    expect(profile?.name).toBe(third!.resetName);
  });
});
