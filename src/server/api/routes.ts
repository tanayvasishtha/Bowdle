import express, { type Request, type Response, type Router } from "express";
import { z } from "zod";
import { MAX_NAME_LENGTH } from "../../shared/constants.ts";
import { PROVIDERS, type GameDatabase, type Provider } from "../db/GameDatabase.ts";
import { OAuth } from "./oauth.ts";

const GUESTS_PER_WINDOW = 20;
const GUEST_WINDOW_MS = 60 * 60 * 1000;

const NameBody = z.object({ name: z.string().max(MAX_NAME_LENGTH * 2) });

export type ApiOptions = { database: () => Promise<GameDatabase>; oauth?: OAuth; now?: () => number };

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
  const now = options.now ?? Date.now;
  const guestsByIp = new Map<string, { count: number; resetAt: number }>();
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

  router.get("/auth/providers", (_request, response) => {
    response.json(Object.fromEntries(PROVIDERS.map((provider) => [provider, oauth.enabled(provider)])));
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

  return router;
}
