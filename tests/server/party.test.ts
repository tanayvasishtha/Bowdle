import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import { closeGameDatabase, gameDatabase } from "../../src/server/db/GameDatabase.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";
import { createMatchStats } from "../../src/shared/matchStats.ts";

describe("parties and bot difficulty", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); await closeGameDatabase(); });

  it("puts two friends with the same code in one room on one team", async () => {
    const a = await colyseus.sdk.joinOrCreate("party", { name: "Ana", party: "K7P2QX" });
    const b = await colyseus.sdk.joinOrCreate("party", { name: "Ben", party: "K7P2QX" });
    expect(b.roomId).toBe(a.roomId);
    const room = colyseus.getRoomById<TdmRoom>(a.roomId);
    expect(room.partyCode).toBe("K7P2QX");
    const teamA = room.state.players.get(a.sessionId)!.team, teamB = room.state.players.get(b.sessionId)!.team;
    expect(teamB).toBe(teamA);
    await a.leave(); await b.leave();
  });

  it("keeps public players out of party rooms and parties out of public rooms", async () => {
    const party = await colyseus.sdk.joinOrCreate("party", { name: "Ana", party: "K7P2QX" });
    const stranger = await colyseus.sdk.joinOrCreate("tdm", { name: "Cat" });
    expect(stranger.roomId).not.toBe(party.roomId);
    const other = await colyseus.sdk.joinOrCreate("party", { name: "Dan", party: "ZZ2345" });
    expect(other.roomId).not.toBe(party.roomId);
    expect(other.roomId).not.toBe(stranger.roomId);
    await party.leave(); await stranger.leave(); await other.leave();
  });

  it("refuses malformed codes", async () => {
    await expect(colyseus.sdk.joinOrCreate("party", { name: "Eve", party: "bad" })).rejects.toThrow();
    await expect(colyseus.sdk.joinOrCreate("party", { name: "Eve", party: "ABCDE0" })).rejects.toThrow();
    await expect(colyseus.sdk.joinOrCreate("party", { name: "Eve" })).rejects.toThrow();
    await expect(colyseus.sdk.joinOrCreate("tdm", { name: "Eve", party: "K7P2QX" })).rejects.toThrow();
  });


  async function veteran(name: string, level: number): Promise<string> {
    const db = await gameDatabase();
    const { token, profile } = await db.createGuest(name);
    const xp = 250 * level * (level - 1);
    await db.grantXp(profile.id, xp);
    for (let match = 0; match < 3; match += 1) await db.recordMatch(`${name}:${match}`, [{ accountId: profile.id, kills: 0, assists: 0, won: false, stats: createMatchStats(), medals: [] }]);
    return token;
  }

  it("uses easy bots for new players and harder bots for veterans", async () => {
    const newcomer = await colyseus.sdk.joinOrCreate("party", { name: "New", party: "NEW222" });
    const room = colyseus.getRoomById<TdmRoom>(newcomer.roomId);
    await room.skillsLoaded;
    expect(room.currentBotDifficulty).toBe("easy");
    await newcomer.leave();

    const token = await veteran("Vet", 20);
    const vet = await colyseus.sdk.joinOrCreate("party", { name: "Vet", token, party: "VET222" });
    const vetRoom = colyseus.getRoomById<TdmRoom>(vet.roomId);
    await vetRoom.skillsLoaded;
    expect(vetRoom.currentBotDifficulty).toBe("hard");

    const guest = await colyseus.sdk.joinOrCreate("party", { name: "Guest", party: "VET222" });
    expect(guest.roomId).toBe(vet.roomId);
    expect(vetRoom.currentBotDifficulty).toBe("easy");
    await guest.leave();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(vetRoom.currentBotDifficulty).toBe("hard");
    await vet.leave();
  });
});
