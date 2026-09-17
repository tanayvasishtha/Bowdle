/* Bowdle app-shell service worker (G13). Never caches API or WebSocket traffic. */
const SHELL = "bowdle-shell-v1";
const SHELL_URLS = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/og.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
function isApiOrSocket(url) {
  const path = url.pathname;
  if (path.startsWith("/api") || path.startsWith("/colyseus") || path.startsWith("/matchmake")) return true;
  if (url.protocol === "ws:" || url.protocol === "wss:") return true;
  return false;
}
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || isApiOrSocket(url)) return;
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.open(SHELL).then(async (cache) => {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && (url.pathname === "/" || url.pathname.endsWith(".html") || url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname === "/og.png" || url.pathname === "/manifest.webmanifest")) {
      cache.put(event.request, response.clone());
    }
    return response;
  }));
});
