import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GameDatabase } from "../../src/server/db/GameDatabase.ts";
import { apiRouter } from "../../src/server/api/routes.ts";
import { createMatchStats } from "../../src/shared/matchStats.ts";
import { matchReward } from "../../src/shared/progression.ts";

describe("account challenges and daily rewards", () => {
  let db: GameDatabase; let clock = new Date("2026-09-16"); let http: Server; let base: string;
  beforeAll(async () => {
    db = await GameDatabase.open({ now: () => clock });
    const app = express(); app.use("/api", apiRouter({ database: async () => db }));
    http = await new Promise<Server>((resolve) => { const listening = app.listen(0, () => resolve(listening)); });
    base = `http://localhost:${(http.address() as AddressInfo).port}/api`;
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => http.close((error) => error ? reject(error) : resolve())); await db.close(); });
  it("progresses across matches and completed challenges are paid once", async () => {
    clock = new Date("2026-09-16");
    const { profile } = await db.createGuest("Daily");
    const line = (longShots: number) => ({ accountId: profile.id, kills: 1, assists: 0, won: false, stats: { ...createMatchStats(), kills: 1, longShots } });
    const first = (await db.recordMatch("daily:1", [line(1)]))[0]!;
    expect(first.challenges.find((entry) => entry.id === "d.longshots")).toMatchObject({ before: 0, after: 1, done: false });
    const second = (await db.recordMatch("daily:2", [line(1)]))[0]!;
    expect(second.breakdown.filter((entry) => entry.label.startsWith("Daily:"))).toEqual([{ label: "Daily: Get 2 kills from 35 m or more", xp: 150, ink: 30 }]);
    expect(second.challenges.find((entry) => entry.id === "d.longshots")).toMatchObject({ before: 1, after: 2, done: true });
    const third = (await db.recordMatch("daily:3", [line(1)]))[0]!;
    expect(third.breakdown.filter((entry) => entry.label.startsWith("Daily:"))).toEqual([]);
    expect(third.xp).toBe(matchReward(line(1).stats).xp);
    expect(await db.recordMatch("daily:2", [line(1)])).toEqual([]);
    expect((await db.challenges(profile.id)).daily.find((entry) => entry.id === "d.longshots")).toMatchObject({ progress: 2, done: true });
  });
  it("rerolls one unfinished daily once, refuses done and weekly challenges, and resets next day", async () => {
    clock = new Date("2026-09-16"); const { profile } = await db.createGuest("Reroll");
    await db.recordMatch("reroll:1", [{ accountId: profile.id, kills: 0, assists: 0, won: false, stats: { ...createMatchStats(), longShots: 2 } }]);
    expect(await db.rerollDaily(profile.id, "d.longshots")).toBeUndefined();
    const before = await db.challenges(profile.id);
    expect(await db.rerollDaily(profile.id, before.weekly[0]!.id)).toBeUndefined();
    const after = (await db.rerollDaily(profile.id, "d.zip"))!;
    expect(after.rerollAvailable).toBe(false); expect(after.daily).toHaveLength(3);
    expect(after.daily.filter((entry) => !before.daily.some((old) => old.id === entry.id))).toEqual([expect.objectContaining({ progress: 0, done: false })]);
    expect(after.daily.find((entry) => entry.id === "d.longshots")).toEqual(before.daily.find((entry) => entry.id === "d.longshots"));
    expect(await db.rerollDaily(profile.id, "d.streak")).toBeUndefined();
    expect(await db.challenges(profile.id)).toEqual(after);
    clock = new Date("2026-09-17"); expect((await db.challenges(profile.id)).rerollAvailable).toBe(true);
  });
  it("counts consecutive play days, gaps, daily bonus once and first win once per UTC day", async () => {
    clock = new Date("2026-09-16"); const { profile } = await db.createGuest("Streak");
    const line = { accountId: profile.id, kills: 0, assists: 0, won: true };
    const first = (await db.recordMatch("streak:1", [line]))[0]!;
    expect(first).toMatchObject({ xp: 400, ink: 45, streakDays: 1 });
    const second = (await db.recordMatch("streak:2", [line]))[0]!;
    expect(second).toMatchObject({ xp: 300, ink: 20, streakDays: 1 });
    clock = new Date("2026-09-17");
    const next = (await db.recordMatch("streak:3", [line]))[0]!;
    expect(next.streakDays).toBe(2);
    expect(next.breakdown).toContainEqual({ label: "Streak day 2", xp: 0, ink: 10 });
    expect(next.breakdown).toContainEqual({ label: "First win of the day", xp: 100, ink: 20 });
    clock = new Date("2026-09-19");
    expect((await db.recordMatch("streak:4", [line]))[0]!.streakDays).toBe(1);
    expect(await db.profile(profile.id)).toMatchObject({ streakDays: 1 });
  });
  it("counts distinct weekly maps, pays weekly completion once, and resets on Monday", async () => {
    clock = new Date("2026-09-16"); const { profile } = await db.createGuest("Maps");
    const line = (mapId: string) => ({ accountId: profile.id, kills: 0, assists: 0, won: true, mapId });
    await db.recordMatch("maps:1", [line("sun-temple")]); await db.recordMatch("maps:2", [line("sun-temple")]);
    expect((await db.challenges(profile.id)).weekly.find((entry) => entry.id === "w.maps")).toMatchObject({ progress: 1 });
    await db.recordMatch("maps:3", [line("canopy")]);
    const last = (await db.recordMatch("maps:4", [line("lost-river")]))[0]!;
    expect(last.breakdown).toContainEqual({ label: "Weekly: Win on all three maps", xp: 600, ink: 120 });
    expect((await db.recordMatch("maps:5", [line("lost-river")]))[0]!.breakdown.some((entry) => entry.label.startsWith("Weekly:"))).toBe(false);
    clock = new Date("2026-09-21"); expect((await db.challenges(profile.id)).weekly.every((entry) => entry.progress === 0)).toBe(true);
  });
  it("pays a first win after a loss and caps the play-day bonus at seven days", async () => {
    clock = new Date("2026-09-16"); const { profile } = await db.createGuest("Longstreak");
    const loss = { accountId: profile.id, kills: 0, assists: 0, won: false };
    expect((await db.recordMatch("cap:loss", [loss]))[0]).toMatchObject({ xp: 100, ink: 15 });
    const win = (await db.recordMatch("cap:win", [{ ...loss, won: true }]))[0]!;
    expect(win.breakdown).toContainEqual({ label: "First win of the day", xp: 100, ink: 20 });
    expect(win.breakdown.some((entry) => entry.label.startsWith("Streak day"))).toBe(false);
    for (let day = 17; day <= 24; day += 1) {
      clock = new Date(Date.UTC(2026, 8, day));
      const reward = (await db.recordMatch(`cap:${day}`, [loss]))[0]!;
      expect(reward.breakdown).toContainEqual({ label: `Streak day ${day - 15}`, xp: 0, ink: 5 * Math.min(day - 15, 7) });
    }
  });
  it("requires authentication and serves the challenge and reroll routes", async () => {
    clock = new Date("2026-09-16"); const { token } = await db.createGuest("Routes");
    expect((await fetch(`${base}/challenges`)).status).toBe(401);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const response = await fetch(`${base}/challenges`, { headers }); const state = await response.json() as { daily: { id: string }[]; weekly: unknown[] };
    expect(state.daily).toHaveLength(3); expect(state.weekly).toHaveLength(3);
    expect((await fetch(`${base}/challenges/reroll`, { method: "POST", headers, body: JSON.stringify({ id: state.daily[0]!.id }) })).status).toBe(200);
    expect((await fetch(`${base}/challenges/reroll`, { method: "POST", headers, body: JSON.stringify({ id: state.daily[1]!.id }) })).status).toBe(409);
  });
});
