import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("G13 service worker policy", () => {
  const source = readFileSync("public/sw.js", "utf8");

  it("refuses to cache API and WebSocket traffic", () => {
    expect(source).toContain("isApiOrSocket");
    expect(source).toContain('path.startsWith("/api")');
    expect(source.includes('url.protocol === "ws:"') || source.includes('url.protocol === "wss:"')).toBe(true);
    expect(source).toContain('if (event.request.method !== "GET" || isApiOrSocket(url)) return;');
  });

  it("caches the app shell only", () => {
    expect(source).toContain("/manifest.webmanifest");
    expect(source).toContain("/og.png");
  });
});
