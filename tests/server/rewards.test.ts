import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import { closeGameDatabase, gameDatabase } from "../../src/server/db/GameDatabase.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";
import { SCORE_LIMIT } from "../../src/shared/constants.ts";
import { RewardMessage } from "../../src/net/messages.ts";

describe("match rewards", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  afterAll(async () => { await colyseus.shutdown(); await closeGameDatabase(); });

  it("a signed-in winner gets XP, Ink and a season kill once", async () => {
    const db = await gameDatabase();
    const { token, profile } = await db.createGuest("Victor");
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Victor", token, test: true });
    const guest = await colyseus.sdk.joinOrCreate("tdm", { name: "Guest", test: true });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    const rewards: unknown[] = [];
    const rewardReceived = new Promise<void>((resolve) => client.onMessage("rewards", (message) => { rewards.push(message); resolve(); }));
    const guestRewards: unknown[] = [];
    guest.onMessage("rewards", (message) => guestRewards.push(message));
    const me = room.state.players.get(client.sessionId)!;
    me.kills = 3; me.assists = 1;
    room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    room.state.scoreSun = SCORE_LIMIT - 1; room.state.scoreMoon = 0;
    const victim = room.addStationaryPlayer("victim", 1, 0, 0, 0);
    victim.spawnProtectMs = 0;
    (room as unknown as { dealDamage(a: string, t: string, d: number, w: string, h: boolean, x: number, z: number, origin: { x: number; z: number }): void }).dealDamage(client.sessionId, "victim", 1000, "arrow", false, 0, 0, { x: 0, z: 0 });
    expect(room.state.phase).toBe("end");
    await room.rewardsSettled;
    await rewardReceived;
    expect(rewards).toHaveLength(1);
    const reward = RewardMessage.parse(rewards[0]);
    expect(reward).toMatchObject({ xp: 100 + 4 * 50 + 25 + 200 + 25 + 100, ink: 109, level: 2, levelUp: true, streakDays: 1 });
    expect(reward.breakdown.find((line) => line.label === "Medals")).toEqual({ label: "Medals", xp: 25, ink: 0 });
    expect(guestRewards).toEqual([]);
    expect(await db.profile(profile.id)).toMatchObject({ xp: 650, ink: 109, seasonKills: 4, seasonWins: 1, seasonMatches: 1 });
    await client.leave(); await guest.leave();
  });
});
