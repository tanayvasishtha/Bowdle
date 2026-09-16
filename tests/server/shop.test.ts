import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server as gameServer } from "../../src/server/app.config.ts";
import { apiRouter } from "../../src/server/api/routes.ts";
import { Xsolla } from "../../src/server/api/xsolla.ts";
import { closeGameDatabase, GameDatabase, gameDatabase } from "../../src/server/db/GameDatabase.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";

const SECRET = "webhook-secret";
const sign = (body: string): string => `Signature ${createHash("sha1").update(body + SECRET).digest("hex")}`;

describe("locker and Ink shop", () => {
  let db: GameDatabase;
  beforeAll(async () => { db = await GameDatabase.open({ now: () => new Date("2026-09-16") }); });
  afterAll(async () => { await db.close(); });

  it("buys with Ink once, refuses when poor, and equips only owned items", async () => {
    const { profile } = await db.createGuest("Shopper");
    await db.recordMatch("shop:1", [{ accountId: profile.id, kills: 10, assists: 0, won: true }]);
    expect((await db.locker(profile.id))?.ink).toBe(115);
    expect(await db.buyWithInk(profile.id, "bow.jade")).toEqual({ ok: false, reason: "poor" });
    for (let match = 2; match <= 12; match += 1) await db.recordMatch(`shop:${match}`, [{ accountId: profile.id, kills: 10, assists: 0, won: true }]);
    expect((await db.locker(profile.id))?.ink).toBe(595);
    const bought = await db.buyWithInk(profile.id, "bow.jade");
    expect(bought).toMatchObject({ ok: true, locker: { ink: 295, owned: ["trail.chalk", "bow.explorer", "bow.jade"] } });
    expect(await db.buyWithInk(profile.id, "bow.jade")).toEqual({ ok: false, reason: "owned" });
    expect(await db.buyWithInk(profile.id, "bow.gilded")).toEqual({ ok: false, reason: "not_for_ink" });
    expect(await db.buyWithInk(profile.id, "bow.nothing")).toEqual({ ok: false, reason: "unknown_item" });
    expect(await db.setLoadout(profile.id, { bow: "bow.jade", outfit: "outfit.idol" })).toEqual({ bow: "bow.jade", trail: "trail.default", outfit: "outfit.default", effect: "effect.default" });
    expect(await db.loadout(profile.id)).toMatchObject({ bow: "bow.jade" });
    expect((await db.locker(profile.id))?.ink).toBe(295);
  });

  it("grants paid orders once and removes them on refund", async () => {
    const { profile } = await db.createGuest("Payer");
    expect(await db.fulfillOrder("777", profile.id, ["outfit-golden-idol", "not-a-sku"])).toEqual(["outfit.idol"]);
    expect(await db.fulfillOrder("777", profile.id, ["outfit-golden-idol"])).toEqual([]);
    await db.setLoadout(profile.id, { outfit: "outfit.idol" });
    expect((await db.loadout(profile.id)).outfit).toBe("outfit.idol");
    expect(await db.cancelOrder("777")).toEqual(["outfit.idol"]);
    expect((await db.loadout(profile.id)).outfit).toBe("outfit.default");
    expect(await db.fulfillOrder("777", profile.id, ["outfit-golden-idol"])).toEqual([]);
    expect(await db.fulfillOrder("778", "nobody", ["outfit-golden-idol"])).toEqual([]);
  });
});

describe("Xsolla shop API", () => {
  let db: GameDatabase;
  let http: Server;
  let base = "";
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    requests.push({ url: String(input), init });
    return Response.json({ token: "pay-token", order_id: 9001 }, { status: 201 });
  }) as typeof fetch;

  beforeAll(async () => {
    db = await GameDatabase.open({ now: () => new Date("2026-09-16") });
    const xsolla = new Xsolla({ XSOLLA_MERCHANT_ID: "678", XSOLLA_PROJECT_ID: "12345", XSOLLA_API_KEY: "api-key", XSOLLA_WEBHOOK_SECRET_KEY: SECRET, XSOLLA_SANDBOX: "1" }, fakeFetch);
    const app = express();
    app.use("/api", apiRouter({ database: async () => db, xsolla }));
    http = app.listen(0);
    await new Promise((resolve) => http.once("listening", resolve));
    base = `http://127.0.0.1:${(http.address() as AddressInfo).port}/api`;
  });
  afterAll(async () => { http.close(); await db.close(); });

  const hook = (body: unknown, signature?: string): Promise<Response> => {
    const text = JSON.stringify(body);
    return fetch(`${base}/xsolla/webhook`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: signature ?? sign(text) }, body: text });
  };

  it("creates a sandbox Pay Station checkout for a paid SKU only, for linked accounts", async () => {
    const { token, profile } = await db.createGuest("Buyer");
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    expect(await (await fetch(`${base}/shop/config`)).json()).toEqual({ paid: true, sandbox: true });
    const guest = await fetch(`${base}/shop/checkout`, { method: "POST", headers, body: JSON.stringify({ sku: "trail-gold-leaf" }) });
    expect(guest.status).toBe(403);
    expect(await guest.json()).toEqual({ error: "link_required" });
    await db.signInWithProvider("google", "buyer-google", "Buyer", profile.id);
    const checkout = await fetch(`${base}/shop/checkout`, { method: "POST", headers, body: JSON.stringify({ sku: "trail-gold-leaf" }) });
    expect(await checkout.json()).toEqual({ url: "https://sandbox-secure.xsolla.com/paystation4/?token=pay-token" });
    const sent = requests.at(-1)!;
    expect(sent.url).toBe("https://store.xsolla.com/api/v3/project/12345/admin/payment/token");
    expect((sent.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("678:api-key").toString("base64")}`);
    expect(JSON.parse(String(sent.init.body))).toEqual({ user: { id: { value: profile.id }, name: { value: "Buyer" } }, purchase: { items: [{ sku: "trail-gold-leaf", quantity: 1 }] }, sandbox: true });
    const bad = await fetch(`${base}/shop/checkout`, { method: "POST", headers, body: JSON.stringify({ sku: "bow.jade" }) });
    expect(bad.status).toBe(502);
  });

  it("verifies signatures and handles user_validation, order_paid and order_canceled", async () => {
    const { token, profile } = await db.createGuest("Hooked");
    const unsigned = await hook({ notification_type: "user_validation", user: { id: profile.id } }, "Signature 0000000000000000000000000000000000000000");
    expect(unsigned.status).toBe(400);
    expect(await unsigned.json()).toEqual({ error: { code: "INVALID_SIGNATURE", message: "Invalid signature" } });
    expect((await hook({ notification_type: "user_validation", user: { id: profile.id } })).status).toBe(204);
    const unknown = await hook({ notification_type: "user_validation", user: { id: "ghost" } });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ error: { code: "INVALID_USER" } });

    const paid = { notification_type: "order_paid", user: { external_id: profile.id, email: "x@example.com" }, order: { id: 55501, status: "paid" }, items: [{ sku: "effect-blue-morpho", quantity: 1, type: "virtual_good" }], billing: { transaction: { id: 1 } } };
    expect((await hook(paid)).status).toBe(204);
    expect((await hook(paid)).status).toBe(204);
    const locker = await (await fetch(`${base}/locker`, { headers: { Authorization: `Bearer ${token}` } })).json() as { owned: string[] };
    expect(locker.owned).toEqual(["effect.butterflies"]);

    expect((await hook({ ...paid, items: [{ sku: "nope" }], order: { id: 55502 } })).status).toBe(400);
    expect((await hook({ notification_type: "order_canceled", order: { id: 55501 }, user: { external_id: profile.id }, billing: { refund_details: { code: 1 } } })).status).toBe(204);
    expect((await db.locker(profile.id))?.owned).toEqual([]);
    expect((await hook({ notification_type: "payment", transaction: { id: 1 } })).status).toBe(204);
  });

  it("buys and equips through the API", async () => {
    const { token, profile } = await db.createGuest("Equipper");
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    for (let match = 0; match < 12; match += 1) await db.recordMatch(`api:${match}`, [{ accountId: profile.id, kills: 10, assists: 0, won: true }]);
    const poor = await fetch(`${base}/shop/ink`, { method: "POST", headers, body: JSON.stringify({ itemId: "outfit.raider" }) });
    expect(poor.status).toBe(409);
    const bought = await fetch(`${base}/shop/ink`, { method: "POST", headers, body: JSON.stringify({ itemId: "trail.rope" }) });
    expect(await bought.json()).toMatchObject({ ok: true, locker: { ink: 345, owned: ["trail.chalk", "bow.explorer", "trail.rope"] } });
    const equipped = await fetch(`${base}/loadout`, { method: "PUT", headers, body: JSON.stringify({ trail: "trail.rope", bow: "bow.gilded" }) });
    expect(await equipped.json()).toEqual({ bow: "bow.default", trail: "trail.rope", outfit: "outfit.default", effect: "effect.default" });
  });
});

describe("loadouts in a match", () => {
  let colyseus: ColyseusTestServer<typeof gameServer>;
  beforeAll(async () => { colyseus = await boot(gameServer); });
  afterAll(async () => { await colyseus.shutdown(); await closeGameDatabase(); });

  it("puts the stored loadout on the player and ignores what the client claims", async () => {
    const db = await gameDatabase();
    const { token, profile } = await db.createGuest("Dressed");
    await db.fulfillOrder("room-order", profile.id, ["bow-night-canopy"]);
    await db.setLoadout(profile.id, { bow: "bow.obsidian" });
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Dressed", token, test: true, bowSkin: "bow.gilded" });
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    await room.loadoutsApplied;
    const player = room.state.players.get(client.sessionId)!;
    expect([player.bowSkin, player.arrowTrail, player.outfit, player.killEffect]).toEqual(["bow.obsidian", "trail.default", "outfit.default", "effect.default"]);
    room.replacePlayerWithBot(client.sessionId);
    const bot = [...room.state.players.values()].find((entry) => entry.isBot && entry.name.startsWith("Doodle"));
    expect(bot?.bowSkin).toBe("bow.default");
    await client.leave();
  });
});
