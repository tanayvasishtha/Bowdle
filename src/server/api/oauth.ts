import { randomBytes } from "node:crypto";
import type { Provider } from "../db/GameDatabase.ts";

type ProviderSpec = { authorize: string; token: string; profile: string; scope: string; idKey: string; nameKeys: readonly string[] };

const SPECS: Record<Provider, ProviderSpec> = {
  discord: {
    authorize: "https://discord.com/oauth2/authorize", token: "https://discord.com/api/oauth2/token",
    profile: "https://discord.com/api/users/@me", scope: "identify", idKey: "id", nameKeys: ["global_name", "username"],
  },
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token",
    profile: "https://openidconnect.googleapis.com/v1/userinfo", scope: "openid profile", idKey: "sub", nameKeys: ["given_name", "name"],
  },
};

const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING = 5000;

export type OAuthEnv = Partial<Record<"PUBLIC_URL" | "DISCORD_CLIENT_ID" | "DISCORD_CLIENT_SECRET" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET", string>>;
export type OAuthIdentity = { providerId: string; displayName: string };
type Pending = { provider: Provider; accountId?: string; expiresAt: number };

function credentials(provider: Provider, env: OAuthEnv): { id: string; secret: string } | undefined {
  const id = provider === "discord" ? env.DISCORD_CLIENT_ID : env.GOOGLE_CLIENT_ID;
  const secret = provider === "discord" ? env.DISCORD_CLIENT_SECRET : env.GOOGLE_CLIENT_SECRET;
  return id && secret && env.PUBLIC_URL ? { id, secret } : undefined;
}

/** Discord and Google sign-in. A provider is offered only when its client id, secret and PUBLIC_URL are all set. */
export class OAuth {
  private readonly env: OAuthEnv;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly pending = new Map<string, Pending>();

  constructor(env: OAuthEnv, fetcher: typeof fetch = fetch, now: () => number = Date.now) { this.env = env; this.fetcher = fetcher; this.now = now; }

  enabled(provider: Provider): boolean { return credentials(provider, this.env) !== undefined; }

  redirectUri(provider: Provider): string { return `${this.env.PUBLIC_URL!.replace(/\/$/, "")}/api/auth/${provider}/callback`; }

  start(provider: Provider, accountId: string | undefined): string | undefined {
    const client = credentials(provider, this.env);
    if (!client) return undefined;
    this.prune();
    const state = randomBytes(18).toString("base64url");
    this.pending.set(state, { provider, accountId, expiresAt: this.now() + STATE_TTL_MS });
    const url = new URL(SPECS[provider].authorize);
    url.search = new URLSearchParams({ client_id: client.id, redirect_uri: this.redirectUri(provider), response_type: "code", scope: SPECS[provider].scope, state, prompt: "consent" }).toString();
    return url.toString();
  }

  /** Consumes the state once and trades the code for the provider identity. */
  async finish(provider: Provider, code: string, state: string): Promise<{ identity: OAuthIdentity; accountId?: string } | undefined> {
    const pending = this.pending.get(state);
    this.pending.delete(state);
    const client = credentials(provider, this.env);
    if (!pending || !client || pending.provider !== provider || pending.expiresAt < this.now() || !code) return undefined;
    const spec = SPECS[provider];
    const tokenResponse = await this.fetcher(spec.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, grant_type: "authorization_code", code, redirect_uri: this.redirectUri(provider) }),
    });
    if (!tokenResponse.ok) return undefined;
    const accessToken = ((await tokenResponse.json()) as { access_token?: unknown }).access_token;
    if (typeof accessToken !== "string") return undefined;
    const profileResponse = await this.fetcher(spec.profile, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    if (!profileResponse.ok) return undefined;
    const profile = (await profileResponse.json()) as Record<string, unknown>;
    const providerId = profile[spec.idKey];
    if (typeof providerId !== "string" || !providerId) return undefined;
    const displayName = spec.nameKeys.map((key) => profile[key]).find((value): value is string => typeof value === "string" && value.length > 0) ?? "Explorer";
    return { identity: { providerId, displayName }, accountId: pending.accountId };
  }

  private prune(): void {
    const now = this.now();
    for (const [state, entry] of this.pending) if (entry.expiresAt < now) this.pending.delete(state);
    while (this.pending.size >= MAX_PENDING) this.pending.delete(this.pending.keys().next().value!);
  }
}
