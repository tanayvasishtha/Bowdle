/* Bowdle app-shell service worker (F3). Never caches API or WebSocket traffic. */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const SHELL = `bowdle-shell-${VERSION}`;
const SHELL_URLS = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/og.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

function isApiOrSocket(url) {
  const path = url.pathname;
  if (path.startsWith("/api") || path.startsWith("/colyseus") || path.startsWith("/matchmake")) return true;
  if (url.protocol === "ws:" || url.protocol === "wss:") return true;
  return false;
}

function isHtmlNavigation(request, url) {
  if (request.mode === "navigate") return true;
  if (url.pathname === "/" || url.pathname.endsWith(".html")) return true;
  return false;
}

function isHashedAsset(url) {
  return url.pathname.startsWith("/assets/");
}

async function networkFirst(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("offline");
  }
}

async function cacheFirst(request, cache) {
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || isApiOrSocket(url)) return;
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.open(SHELL).then(async (cache) => {
    if (isHtmlNavigation(event.request, url)) return networkFirst(event.request, cache);
    if (isHashedAsset(url)) return cacheFirst(event.request, cache);
    return networkFirst(event.request, cache);
  }));
});
