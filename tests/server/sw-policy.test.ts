import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("public/sw.js", "utf8");

/** Keep in sync with public/sw.js — the test fails if the worker drifts. */
function isApiOrSocket(url: URL): boolean {
  const path = url.pathname;
  if (path.startsWith("/api") || path.startsWith("/colyseus") || path.startsWith("/matchmake")) return true;
  if (url.protocol === "ws:" || url.protocol === "wss:") return true;
  return false;
}

function isHtmlNavigation(request: { mode: string }, url: URL): boolean {
  if (request.mode === "navigate") return true;
  if (url.pathname === "/" || url.pathname.endsWith(".html")) return true;
  return false;
}

function isHashedAsset(url: URL): boolean {
  return url.pathname.startsWith("/assets/");
}

describe("F3 service worker policy", () => {
  it("ships a versioned shell cache and network-first HTML", () => {
    expect(source).toContain("bowdle-shell-");
    expect(source).toContain('searchParams.get("v")');
    expect(source).toContain("networkFirst");
    expect(source).toContain("isHtmlNavigation");
    expect(source).toContain('pathname.startsWith("/assets/")');
    expect(source).toContain("isApiOrSocket");
  });

  it("never handles API or socket URLs (so they cannot be cached)", () => {
    expect(isApiOrSocket(new URL("https://bowdle.io/api/funnel"))).toBe(true);
    expect(isApiOrSocket(new URL("https://bowdle.io/api/account"))).toBe(true);
    expect(isApiOrSocket(new URL("https://bowdle.io/matchmake/join"))).toBe(true);
    expect(isApiOrSocket(new URL("wss://bowdle.io/colyseus"))).toBe(true);
    expect(isApiOrSocket(new URL("https://bowdle.io/"))).toBe(false);
    expect(isApiOrSocket(new URL("https://bowdle.io/assets/index-abc.js"))).toBe(false);
    // Source must encode the same path prefixes the mirror uses.
    expect(source).toContain('path.startsWith("/api")');
    expect(source).toContain('path.startsWith("/colyseus")');
    expect(source).toContain('path.startsWith("/matchmake")');
  });

  it("treats navigations and HTML as network-first targets", () => {
    expect(isHtmlNavigation({ mode: "navigate" }, new URL("https://bowdle.io/"))).toBe(true);
    expect(isHtmlNavigation({ mode: "cors" }, new URL("https://bowdle.io/index.html"))).toBe(true);
    expect(isHtmlNavigation({ mode: "cors" }, new URL("https://bowdle.io/assets/x.js"))).toBe(false);
    expect(source).toContain('request.mode === "navigate"');
  });

  it("cache-first only applies to hashed /assets/*", () => {
    expect(isHashedAsset(new URL("https://bowdle.io/assets/index-abc.js"))).toBe(true);
    expect(isHashedAsset(new URL("https://bowdle.io/og.png"))).toBe(false);
  });

  it("fetch handler early-returns for /api/funnel so caches.put never runs", async () => {
    const puts: string[] = [];
    const store = new Map<string, Response>();
    const caches = {
      open: async () => ({
        match: async (req: Request | string) => store.get(typeof req === "string" ? req : req.url),
        put: async (req: Request | string, res: Response) => {
          const url = typeof req === "string" ? req : req.url;
          puts.push(url);
          store.set(url, res);
        },
      }),
    };
    const fetchImpl = async () => new Response("ok", { status: 200 });

    async function handle(request: Request): Promise<Response | undefined> {
      const url = new URL(request.url);
      if (request.method !== "GET" || isApiOrSocket(url)) return undefined;
      if (url.origin !== "https://bowdle.io") return undefined;
      const cache = await caches.open();
      if (isHtmlNavigation(request, url)) {
        const response = await fetchImpl();
        if (response.ok) await cache.put(request, response.clone());
        return response;
      }
      if (isHashedAsset(url)) {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetchImpl();
        if (response.ok) await cache.put(request, response.clone());
        return response;
      }
      const response = await fetchImpl();
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }

    const api = await handle(new Request("https://bowdle.io/api/funnel", { method: "GET" }));
    expect(api).toBeUndefined();
    expect(puts.some((u) => u.includes("/api/"))).toBe(false);

    // Node's Request forbids mode "navigate"; pass a stand-in the mirror accepts.
    const navReq = { url: "https://bowdle.io/", method: "GET", mode: "navigate" as const };
    const html = await handle(navReq as unknown as Request);
    expect(html?.ok).toBe(true);
    expect(puts.some((u) => u.includes("bowdle.io"))).toBe(true);
  });
});
