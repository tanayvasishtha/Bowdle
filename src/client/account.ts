import type { BuyResult, GuestSession, Leaderboard, Locker, Profile, Provider, ShopConfig } from "../shared/api.ts";
import type { Loadout } from "../shared/cosmetics.ts";

const TOKEN_KEY = "bowdle.token";

function apiBase(): string { return `${import.meta.env.VITE_SERVER_URL || location.origin}/api`; }

export function loadToken(): string | undefined {
  try { return localStorage.getItem(TOKEN_KEY) ?? undefined; } catch { return undefined; }
}

function saveToken(token: string | undefined): void {
  try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode: play as a guest */ }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T | undefined> {
  const token = loadToken();
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (response.status === 401) { saveToken(undefined); return undefined; }
  if (!response.ok || response.status === 204) return undefined;
  return await response.json() as T;
}

/** Reads a provider sign-in result from the URL fragment, stores any new token and clears the fragment. */
export function consumeSignInFragment(): { linked?: Provider; failed?: Provider } {
  if (!location.hash.startsWith("#")) return {};
  const values = new URLSearchParams(location.hash.slice(1));
  const token = values.get("token"), linked = values.get("linked"), failed = values.get("linkError");
  if (!linked && !failed) return {};
  if (token) saveToken(token);
  history.replaceState(null, "", location.pathname + location.search);
  return { linked: (linked ?? undefined) as Provider | undefined, failed: (failed ?? undefined) as Provider | undefined };
}

/** Makes sure this browser has an account. Returns undefined when the server is unreachable; play still works as a guest. */
export async function ensureAccount(name: string): Promise<Profile | undefined> {
  try {
    if (loadToken()) {
      const profile = await request<Profile>("/profile");
      if (profile) return profile;
    }
    const created = await request<GuestSession>("/auth/guest", { method: "POST", body: JSON.stringify({ name }) });
    if (!created) return undefined;
    saveToken(created.token);
    return created.profile;
  } catch { return undefined; }
}

export async function fetchProfile(): Promise<Profile | undefined> {
  try { return loadToken() ? await request<Profile>("/profile") : undefined; } catch { return undefined; }
}

export async function fetchChallenges(): Promise<Challenges | undefined> {
  try { return await request<Challenges>("/challenges"); } catch { return undefined; }
}
export async function rerollChallenge(id: string): Promise<Challenges | undefined> {
  try { return await request<Challenges>("/challenges/reroll", { method: "POST", body: JSON.stringify({ id }) }); } catch { return undefined; }
}

export async function renameAccount(name: string): Promise<Profile | undefined> {
  try { return await request<Profile>("/profile", { method: "PATCH", body: JSON.stringify({ name }) }); } catch { return undefined; }
}

export async function deleteAccount(): Promise<void> {
  try { await request("/profile", { method: "DELETE" }); } finally { saveToken(undefined); }
}

export async function fetchLeaderboard(): Promise<Leaderboard | undefined> {
  try { return await request<Leaderboard>("/leaderboard"); } catch { return undefined; }
}

export async function enabledProviders(): Promise<Provider[]> {
  try {
    const flags = await request<Record<Provider, boolean>>("/auth/providers");
    return flags ? (Object.keys(flags) as Provider[]).filter((provider) => flags[provider]) : [];
  } catch { return []; }
}

export async function startProviderSignIn(provider: Provider): Promise<void> {
  const result = await request<{ url?: string }>(`/auth/${provider}/start`, { method: "POST" });
  if (result?.url) location.assign(result.url);
}

export async function fetchLocker(): Promise<Locker | undefined> {
  try { return loadToken() ? await request<Locker>("/locker") : undefined; } catch { return undefined; }
}

export async function saveLoadout(loadout: Partial<Loadout>): Promise<Loadout | undefined> {
  try { return await request<Loadout>("/loadout", { method: "PUT", body: JSON.stringify(loadout) }); } catch { return undefined; }
}

/** Ink purchases answer 409 with a reason, so this reads the body for any status. */
export async function buyWithInk(itemId: string): Promise<BuyResult | undefined> {
  const token = loadToken();
  if (!token) return undefined;
  try {
    const response = await fetch(`${apiBase()}/shop/ink`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ itemId }) });
    return response.status === 200 || response.status === 409 ? await response.json() as BuyResult : undefined;
  } catch { return undefined; }
}

export async function fetchShopConfig(): Promise<ShopConfig> {
  try { return await request<ShopConfig>("/shop/config") ?? { paid: false, sandbox: false }; } catch { return { paid: false, sandbox: false }; }
}

export type CheckoutResult = { url: string } | { error: "link_required" | "failed" };

export async function startCheckout(sku: string): Promise<CheckoutResult> {
  const token = loadToken();
  if (!token) return { error: "failed" };
  try {
    const response = await fetch(`${apiBase()}/shop/checkout`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ sku }) });
    if (response.status === 403) return { error: "link_required" };
    const body = response.ok ? await response.json() as { url?: string } : {};
    return body.url ? { url: body.url } : { error: "failed" };
  } catch { return { error: "failed" }; }
}
import type { Challenges } from "../shared/challenges.ts";
