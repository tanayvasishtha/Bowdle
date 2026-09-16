import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GameDatabase } from "../../src/server/db/GameDatabase.ts";
import { apiRouter } from "../../src/server/api/routes.ts";
import { ONBOARDING } from "../../src/shared/constants.ts";
import { createMatchStats } from "../../src/shared/matchStats.ts";

describe("field course reward and funnel", () => {
  let db: GameDatabase; let http: Server; let base: string; let clock = 0;
  beforeAll(async () => {
    db = await GameDatabase.open({ now: () => new Date("2033-10-22") });
    const app = express(); app.use("/api", apiRouter({ database: async () => db, now: () => clock }));
    http = await new Promise<Server>((resolve) => { const listening = app.listen(0, () => resolve(listening)); });
    base = `http://localhost:${(http.address() as AddressInfo).port}/api`;
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => http.close((error) => error ? reject(error) : resolve())); await db.close(); });

  const done = (token?: string) => fetch(`${base}/tutorial/done`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });

  it("grants the course Ink once per account and marks the profile", async () => {
    const { token, profile } = await db.createGuest("Learner");
    expect(profile.tutorialDone).toBe(false);
    expect((await done()).status).toBe(401);
    const first = await done(token);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ granted: true, ink: profile.ink + ONBOARDING.courseInk });
    expect(await (await done(token)).json()).toEqual({ granted: false, ink: profile.ink + ONBOARDING.courseInk });
    const again = await db.completeTutorial(profile.id);
    expect(again).toEqual({ granted: false, ink: profile.ink + ONBOARDING.courseInk });
    expect((await db.profile(profile.id))?.tutorialDone).toBe(true);
    expect(await db.completeTutorial("missing")).toBeUndefined();
  });

  it("rate limits course calls per account", async () => {
    const { token } = await db.createGuest("Spammer");
    const statuses: number[] = [];
    for (let call = 0; call < ONBOARDING.courseCallsPerMinute + 2; call += 1) statuses.push((await done(token)).status);
    expect(statuses.slice(0, ONBOARDING.courseCallsPerMinute).every((status) => status === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    clock += 61_000;
    expect((await done(token)).status).toBe(200);
  });

  it("logs funnel steps: menu opened from the client, course and first two matches from the server", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const post = (event: string) => fetch(`${base}/funnel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event }) });
      expect((await post("menuOpened")).status).toBe(204);
      expect((await post("firstMatch")).status).toBe(400);
      expect((await post("anything")).status).toBe(400);
      const { profile } = await db.createGuest("Newcomer");
      await db.completeTutorial(profile.id);
      const line = { accountId: profile.id, kills: 0, assists: 0, won: false, stats: createMatchStats() };
      for (const match of ["f1", "f2", "f3"]) await db.recordMatch(match, [line]);
      const events = log.mock.calls.map(([text]) => { try { return (JSON.parse(String(text)) as { event?: string }).event; } catch { return undefined; } });
      expect(events.filter((event) => event && ["menuOpened", "tutorialDone", "firstMatch", "secondMatch"].includes(event))).toEqual(["menuOpened", "tutorialDone", "firstMatch", "secondMatch"]);
    } finally { log.mockRestore(); }
  });
});
