import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiRouter } from "../../src/server/api/routes.ts";
import { OAuth } from "../../src/server/api/oauth.ts";
import { GameDatabase } from "../../src/server/db/GameDatabase.ts";

describe("game database", () => {
  let db: GameDatabase;
  let clock = new Date(Date.UTC(2026, 8, 16));
  beforeAll(async () => { db = await GameDatabase.open({ now: () => clock }); });
  afterAll(async () => { await db.close(); });

  it("creates guests with working tokens and rejects forged ones", async () => {
    const { token, profile } = await db.createGuest("Scout");
    expect(profile).toMatchObject({ name: "Scout", xp: 0, ink: 0, progress: { level: 1 }, season: "2026-S3", linked: [] });
    expect(await db.authenticate(token)).toBe(profile.id);
    const [id, secret] = token.split(".") as [string, string];
    expect(await db.authenticate(`${id}.${secret.slice(0, -2)}xx`)).toBeUndefined();
    expect(await db.authenticate(`${id}`)).toBeUndefined();
    expect(await db.authenticate(undefined)).toBeUndefined();
    const other = await db.createGuest("Other");
    expect(await db.authenticate(`${other.profile.id}.${secret}`)).toBeUndefined();
    expect((await db.createGuest("admin")).profile.name).toBe("Explorer");
  });

  it("grants match rewards once and levels up", async () => {
    const { profile } = await db.createGuest("Archer");
    const first = await db.recordMatch("room:1", [{ accountId: profile.id, kills: 6, assists: 2, won: true }, { accountId: "missing-account", kills: 1, assists: 0, won: false }]);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ xp: 650, ink: 26, before: { level: 1 }, after: { level: 2, intoLevel: 150 } });
    expect(await db.recordMatch("room:1", [{ accountId: profile.id, kills: 6, assists: 2, won: true }])).toEqual([]);
    await db.recordMatch("room:2", [{ accountId: profile.id, kills: 1, assists: 0, won: false }]);
    expect(await db.profile(profile.id)).toMatchObject({ xp: 800, ink: 37, seasonKills: 7, seasonMatches: 2, seasonWins: 1 });
  });

  it("ranks the season leaderboard by kills and starts fresh next season", async () => {
    const low = await db.createGuest("Lowkills"), high = await db.createGuest("Highkills");
    await db.recordMatch("board:1", [{ accountId: low.profile.id, kills: 1, assists: 0, won: false }, { accountId: high.profile.id, kills: 30, assists: 0, won: true }]);
    const board = await db.leaderboard();
    expect(board[0]).toMatchObject({ rank: 1, name: "Highkills", kills: 30, wins: 1 });
    expect(board.findIndex((row) => row.name === "Lowkills")).toBeGreaterThan(0);
    clock = new Date(Date.UTC(2026, 9, 1));
    expect(await db.leaderboard()).toEqual([]);
    expect((await db.profile(high.profile.id))?.seasonKills).toBe(0);
    expect((await db.leaderboard("2026-S3"))[0]?.name).toBe("Highkills");
    clock = new Date(Date.UTC(2026, 8, 16));
  });

  it("links providers, signs in on new devices and deletes everything", async () => {
    const guest = await db.createGuest("Linker");
    expect(await db.signInWithProvider("discord", "d-1", "Discordian", guest.profile.id)).toEqual({ accountId: guest.profile.id });
    expect((await db.profile(guest.profile.id))?.linked).toEqual(["discord"]);
    const device = await db.signInWithProvider("discord", "d-1", "Discordian");
    expect(device.accountId).toBe(guest.profile.id);
    expect(await db.authenticate(device.token)).toBe(guest.profile.id);
    expect(await db.authenticate(guest.token)).toBe(guest.profile.id);
    const fresh = await db.signInWithProvider("google", "g-9", "Googler");
    expect(fresh.accountId).not.toBe(guest.profile.id);
    expect((await db.profile(fresh.accountId))).toMatchObject({ name: "Googler", linked: ["google"] });
    await db.recordMatch("gone:1", [{ accountId: guest.profile.id, kills: 99, assists: 0, won: true }]);
    expect(await db.deleteAccount(guest.profile.id)).toBe(true);
    expect(await db.authenticate(guest.token)).toBeUndefined();
    expect(await db.profile(guest.profile.id)).toBeUndefined();
    expect((await db.leaderboard()).some((row) => row.kills === 99)).toBe(false);
    expect(await db.deleteAccount(guest.profile.id)).toBe(false);
  });
});

describe("account API", () => {
  let db: GameDatabase;
  let server: Server;
  let base = "";
  const calls: string[] = [];
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = String(input); calls.push(url);
    if (url.endsWith("/token")) return Response.json({ access_token: "provider-access" });
    return Response.json({ id: "discord-42", username: "raider", global_name: "Raider" });
  }) as typeof fetch;

  beforeAll(async () => {
    db = await GameDatabase.open();
    const oauth = new OAuth({ PUBLIC_URL: "https://bowdle.test", DISCORD_CLIENT_ID: "cid", DISCORD_CLIENT_SECRET: "secret" }, fakeFetch);
    const app = express();
    app.use("/api", apiRouter({ database: async () => db, oauth }));
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterAll(async () => { server.close(); await db.close(); });

  const call = (path: string, init: RequestInit = {}, token?: string): Promise<Response> => fetch(`${base}${path}`, {
    ...init, redirect: "manual",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });

  it("runs the guest, profile, rename and delete flow", async () => {
    const created = await call("/auth/guest", { method: "POST", body: JSON.stringify({ name: "Webby" }) });
    expect(created.status).toBe(201);
    const { token } = await created.json() as { token: string };
    expect((await call("/profile")).status).toBe(401);
    expect(await (await call("/profile", {}, token)).json()).toMatchObject({ name: "Webby", progress: { level: 1 } });
    expect((await call("/profile", { method: "PATCH", body: JSON.stringify({ name: "shit" }) }, token)).status).toBe(400);
    expect(await (await call("/profile", { method: "PATCH", body: JSON.stringify({ name: "Renamed" }) }, token)).json()).toMatchObject({ name: "Renamed" });
    expect((await call("/profile", { method: "DELETE" }, token)).status).toBe(204);
    expect((await call("/profile", {}, token)).status).toBe(401);
  });

  it("serves the leaderboard and reports which providers are on", async () => {
    expect(await (await call("/auth/providers")).json()).toEqual({ discord: true, google: false });
    expect((await call("/auth/google/start", { method: "POST" })).status).toBe(404);
    const board = await (await call("/leaderboard?season=bad")).json() as { season: string; rows: unknown[] };
    expect(board.season).toMatch(/^\d{4}-S[1-4]$/);
    expect(Array.isArray(board.rows)).toBe(true);
  });

  it("links Discord through the OAuth callback exactly once per state", async () => {
    const { token, profile } = await db.createGuest("Linkme");
    const start = await (await call("/auth/discord/start", { method: "POST" }, token)).json() as { url: string };
    const authorize = new URL(start.url);
    expect(authorize.origin + authorize.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(authorize.searchParams.get("redirect_uri")).toBe("https://bowdle.test/api/auth/discord/callback");
    const state = authorize.searchParams.get("state")!;
    const callback = await call(`/auth/discord/callback?code=abc&state=${state}`);
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/#linked=discord");
    expect((await db.profile(profile.id))?.linked).toEqual(["discord"]);
    expect(calls).toContain("https://discord.com/api/oauth2/token");
    const replay = await call(`/auth/discord/callback?code=abc&state=${state}`);
    expect(replay.headers.get("location")).toBe("/#linkError=discord");
  });

  it("signs a new device in with a token in the fragment", async () => {
    const start = await (await call("/auth/discord/start", { method: "POST" })).json() as { url: string };
    const state = new URL(start.url).searchParams.get("state")!;
    const location = (await call(`/auth/discord/callback?code=xyz&state=${state}`)).headers.get("location")!;
    const fragment = new URLSearchParams(location.slice(2));
    expect(fragment.get("linked")).toBe("discord");
    expect(await (await call("/profile", {}, fragment.get("token")!)).json()).toMatchObject({ name: "Linkme", linked: ["discord"] });
  });
});
