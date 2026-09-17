import express, { type Request, type Response, type Router } from "express";
import { z } from "zod";
import { DEV_GRANT_MAX, FUNNEL_EVENTS, MAX_NAME_LENGTH, ONBOARDING } from "../../shared/constants.ts";
import { PROVIDERS, type GameDatabase, type Provider } from "../db/GameDatabase.ts";
import { OAuth } from "./oauth.ts";
import { Xsolla } from "./xsolla.ts";

const GUESTS_PER_WINDOW = 20;
const GUEST_WINDOW_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

type Window = { count: number; resetAt: number };
/** Counts a call in a fixed window per key and says whether it is still allowed. */
function allow(windows: Map<string, Window>, key: string, limit: number, windowMs: number, at: number): boolean {
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= at) { windows.set(key, { count: 1, resetAt: at + windowMs }); return true; }
  entry.count += 1;
  return entry.count <= limit;
}

const NameBody = z.object({ name: z.string().max(MAX_NAME_LENGTH * 2) });
const ItemBody = z.object({ itemId: z.string().max(64) });
const SkuBody = z.object({ sku: z.string().max(64) });
const LoadoutBody = z.object({ bow: z.string().max(64), trail: z.string().max(64), outfit: z.string().max(64), effect: z.string().max(64) }).partial();

export type ApiOptions = { database: () => Promise<GameDatabase>; oauth?: OAuth; xsolla?: Xsolla; now?: () => number };

function bearer(request: Request): string | undefined {
  const header = request.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
}

function isProvider(value: string | undefined): value is Provider { return PROVIDERS.includes(value as Provider); }

/** Fragment values never reach a server log, which keeps the fresh token out of access logs. */
function fragmentRedirect(response: Response, values: Record<string, string>): void {
  response.redirect(302, `/#${new URLSearchParams(values).toString()}`);
}

export function apiRouter(options: ApiOptions): Router {
  const router = express.Router();
  const oauth = options.oauth ?? new OAuth(process.env);
  const xsolla = options.xsolla ?? new Xsolla(process.env);
  const now = options.now ?? Date.now;
  const guestsByIp = new Map<string, { count: number; resetAt: number }>();
  const tutorialCalls = new Map<string, Window>();
  const funnelCalls = new Map<string, Window>();
  // The webhook signature covers the exact bytes, so this route reads the raw body before JSON parsing is installed.
  router.post("/xsolla/webhook", express.raw({ type: () => true, limit: "256kb" }), async (request, response) => {
    const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    const reply = await xsolla.handleWebhook(await options.database(), raw, request.get("authorization"));
    if (reply.body) response.status(reply.status).json(reply.body); else response.status(reply.status).end();
  });
  router.use(express.json({ limit: "8kb" }));
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });

  const signedIn = async (request: Request, response: Response): Promise<{ db: GameDatabase; accountId: string } | undefined> => {
    const db = await options.database();
    const accountId = await db.authenticate(bearer(request));
    if (!accountId) { response.status(401).json({ error: "signed_out" }); return undefined; }
    return { db, accountId };
  };

  router.post("/auth/guest", async (request, response) => {
    const ip = request.ip ?? "unknown";
    const entry = guestsByIp.get(ip);
    const at = now();
    if (entry && entry.resetAt > at && entry.count >= GUESTS_PER_WINDOW) { response.status(429).json({ error: "slow_down" }); return; }
    if (!entry || entry.resetAt <= at) guestsByIp.set(ip, { count: 1, resetAt: at + GUEST_WINDOW_MS }); else entry.count += 1;
    const body = NameBody.safeParse(request.body);
    const db = await options.database();
    response.status(201).json(await db.createGuest(body.success ? body.data.name : ""));
  });

  router.post("/tutorial/done", async (request, response) => {
    const auth = await signedIn(request, response); if (!auth) return;
    if (!allow(tutorialCalls, auth.accountId, ONBOARDING.courseCallsPerMinute, MINUTE_MS, now())) { response.status(429).json({ error: "slow_down" }); return; }
    const result = await auth.db.completeTutorial(auth.accountId);
    if (!result) { response.status(404).json({ error: "no_account" }); return; }
    response.json(result);
  });

  /** Client funnel steps the server cannot see itself. Only known events are logged. */
  router.post("/funnel", (request, response) => {
    const body = z.object({ event: z.enum(FUNNEL_EVENTS) }).safeParse(request.body);
    if (!body.success || body.data.event !== "menuOpened") { response.status(400).json({ error: "bad_event" }); return; }
    if (!allow(funnelCalls, request.ip ?? "unknown", ONBOARDING.funnelPerHour, GUEST_WINDOW_MS, now())) { response.status(429).json({ error: "slow_down" }); return; }
    console.log(JSON.stringify({ event: body.data.event }));
    response.status(204).end();
  });

  router.get("/auth/providers", (_request, response) => {
    response.json(Object.fromEntries(PROVIDERS.map((provider) => [provider, oauth.enabled(provider)])));
  });

  router.get("/challenges", async (request, response) => {
    const auth = await signedIn(request, response); if (!auth) return;
    response.json(await auth.db.challenges(auth.accountId));
  });
  router.post("/challenges/reroll", async (request, response) => {
    const auth = await signedIn(request, response); if (!auth) return;
    const body = z.object({ id: z.string() }).safeParse(request.body);
    if (!body.success) { response.status(400).json({ error: "bad_challenge" }); return; }
    const result = await auth.db.rerollDaily(auth.accountId, body.data.id);
    if (!result) { response.status(409).json({ error: "reroll_unavailable" }); return; }
    response.json(result);
  });

  router.post("/auth/:provider/start", async (request, response) => {
    const provider = request.params.provider;
    if (!isProvider(provider) || !oauth.enabled(provider)) { response.status(404).json({ error: "provider_off" }); return; }
    const token = bearer(request);
    const accountId = token ? await (await options.database()).authenticate(token) : undefined;
    response.json({ url: oauth.start(provider, accountId) });
  });

  router.get("/auth/:provider/callback", async (request, response) => {
    const provider = request.params.provider;
    const code = typeof request.query.code === "string" ? request.query.code : "";
    const state = typeof request.query.state === "string" ? request.query.state : "";
    if (!isProvider(provider)) { response.status(404).end(); return; }
    const result = await oauth.finish(provider, code, state).catch(() => undefined);
    if (!result) { fragmentRedirect(response, { linkError: provider }); return; }
    const db = await options.database();
    const signIn = await db.signInWithProvider(provider, result.identity.providerId, result.identity.displayName, result.accountId);
    fragmentRedirect(response, signIn.token ? { linked: provider, token: signIn.token } : { linked: provider });
  });

  router.get("/profile", async (request, response) => {
    const session = await signedIn(request, response); if (!session) return;
    response.json(await session.db.profile(session.accountId));
  });

  router.patch("/profile", async (request, response) => {
    const session = await signedIn(request, response); if (!session) return;
    const body = NameBody.safeParse(request.body);
    if (!body.success || !(await session.db.rename(session.accountId, body.data.name))) { response.status(400).json({ error: "bad_name" }); return; }
    response.json(await session.db.profile(session.accountId));
  });

  router.delete("/profile", async (request, response) => {
    const session = await signedIn(request, response); if (!session) return;
    await session.db.deleteAccount(session.accountId);
    response.status(204).end();
  });

  router.get("/locker", async (request, response) => {
    const session = await signedIn(request, response); if (!session) return;
    response.json(await session.db.locker(session.accountId));
  });

  router.put("/loadout", async (request, response) => {
    const session = await signedIn(request, response); if (!session) return;
    const body = LoadoutBody.safeParse(request.body);
    if (!body.success) { response.status(400).json({ error: "bad_loadout" }); return; }
    response.json(await session.db.setLoadout(session.accountId, body.data));
  });

  router.post("/shop/ink", async (request, response) => {
    const session = await signedIn(request, response); if (!session) return;
    const body = ItemBody.safeParse(request.body);
    if (!body.success) { response.status(400).json({ ok: false, reason: "unknown_item" }); return; }
    const result = await session.db.buyWithInk(session.accountId, body.data.itemId);
    response.status(result.ok ? 200 : 409).json(result);
  });

  router.get("/shop/config", (_request, response) => {
    response.json({ paid: xsolla.enabled, sandbox: xsolla.sandbox });
  });

  router.post("/shop/checkout", async (request, response) => {
    const session = await signedIn(request, response); if (!session) return;
    const body = SkuBody.safeParse(request.body);
    if (!xsolla.enabled) { response.status(404).json({ error: "shop_off" }); return; }
    const profile = await session.db.profile(session.accountId);
    // A guest token lives in one browser; a purchase must survive clearing it, so money needs a linked sign-in.
    if (profile && profile.linked.length === 0) { response.status(403).json({ error: "link_required" }); return; }
    const sku = body.success ? body.data.sku : "";
    const checkout = sku && profile ? await xsolla.checkout(session.accountId, profile.name, sku) : undefined;
    if (!checkout) { response.status(502).json({ error: "checkout_failed" }); return; }
    await session.db.createOrder(checkout.orderId, session.accountId, sku);
    response.json({ url: checkout.url });
  });

  // Test-only Ink grants for browser tests. Needs an explicit flag and never runs in production.
  if (process.env.BOWDLE_DEV_GRANTS === "1" && process.env.NODE_ENV !== "production") {
    router.post("/dev/grant-xp", async (request, response) => {
      const session = await signedIn(request, response); if (!session) return;
      const body = z.object({ xp: z.number().int().nonnegative().max(DEV_GRANT_MAX) }).safeParse(request.body);
      if (!body.success) { response.status(400).json({ error: "bad_xp" }); return; }
      response.json(await session.db.grantXp(session.accountId, body.data.xp));
    });
    router.post("/dev/grant-ink", async (request, response) => {
      const session = await signedIn(request, response); if (!session) return;
      const amount = Math.max(0, Math.min(100_000, Number((request.body as { ink?: unknown }).ink) || 0));
      await session.db.grantInk(session.accountId, amount);
      response.json(await session.db.locker(session.accountId));
    });
  }

  router.get("/expedition/leaderboard", async (_request, response) => {
    response.json({ rows: await (await options.database()).expeditionLeaderboard() });
  });

  
  router.get("/ranked/leaderboard", async (request, response) => {
    const db = await options.database();
    const season = typeof request.query.season === "string" ? request.query.season : db.currentSeason();
    response.json({ season, rows: await db.rankedLeaderboard(season, 50) });
  });
  router.get("/leaderboard", async (request, response) => {
    const season = typeof request.query.season === "string" && /^\d{4}-S[1-4]$/.test(request.query.season) ? request.query.season : undefined;
    const db = await options.database();
    const rows = await db.leaderboard(season, 50);
    response.json({ season: season ?? (db.currentSeason()), rows });
  });

  router.use((error: unknown, _request: Request, response: Response, _next: express.NextFunction) => {
    console.error(JSON.stringify({ event: "apiError", message: error instanceof Error ? error.message : String(error) }));
    if (!response.headersSent) response.status(500).json({ error: "server" });
  });

  
  router.post("/report", async (request, response) => {
    const auth = await signedIn(request, response); if (!auth) return;
    const body = z.object({
      targetId: z.string().min(1).max(64),
      reason: z.enum(["offensiveName", "cheating", "afk"]),
    }).safeParse(request.body);
    if (!body.success) { response.status(400).json({ error: "bad_request" }); return; }
    const result = await auth.db.fileReport(auth.accountId, body.data.targetId, body.data.reason);
    if (!result) { response.status(400).json({ error: "bad_report" }); return; }
    response.json(result);
  });

  return router;
}

