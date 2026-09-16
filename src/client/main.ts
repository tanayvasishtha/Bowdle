import { Renderer, type SnapshotFractions } from "./render/Renderer.ts";
import { InputSampler } from "./game/InputSampler.ts";
import { OfflineSession } from "./game/OfflineSession.ts";
import { PracticeSession, type PracticeShotResult } from "./game/PracticeSession.ts";
import { campMap, campTargets } from "../shared/maps/camp.ts";
import { OnlineSession, type RenderedPlayer } from "./game/OnlineSession.ts";
import { kitMap } from "../shared/maps/fixtures/kit.ts";
import { propsGalleryMap } from "../shared/maps/fixtures/props.ts";
import { sunTempleMap } from "../shared/maps/sunTemple.ts";
import { canopyMap } from "../shared/maps/canopy.ts";
import { defaultMatchMap, mapById } from "../shared/maps/registry.ts";

declare global {
  interface Window {
    __bowdleTest?: {
      snapshot(): SnapshotFractions;
      fireAt?(targetId: string, drawMs: number): PracticeShotResult;
      players?(): RenderedPlayer[];
      sessionId?: string;
      aimAt?(sessionId: string): void;
      drawMs?(): number;
      killFeed?(): string;
      cloudCount?(): number;
      grappleActive?(): boolean;
      aimAtGrapple?(): void;
      stats?(): { drawCalls: number; triangles: number };
      cameraAt?(x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number): void;
    };
  }
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

const params = new URLSearchParams(location.search);
if (params.get("scene") === "online") {
  const loading = document.createElement("h1");
  loading.textContent = "Joining match…";
  loading.style.cssText = "position:absolute;inset:35% 0 auto;text-align:center;color:#4a3527;font:48px 'Permanent Marker',cursive";
  app.append(loading);
  const requestedMapId = params.get("map") ?? undefined;
  const renderer = new Renderer(app, params.has("debug"), requestedMapId ? mapById(requestedMapId) ?? defaultMatchMap : defaultMatchMap);
  const sampler = new InputSampler(renderer.canvas);
  void OnlineSession.connect(renderer, sampler, "Player", params.has("test"), requestedMapId).then((session) => {
    loading.remove();
    session.start();
    if (params.has("test")) window.__bowdleTest = {
      snapshot: () => renderer.snapshot(),
      players: () => session.players(),
      sessionId: session.sessionId,
      aimAt: (sessionId: string) => session.aimAt(sessionId),
      drawMs: () => session.drawMs(),
      killFeed: () => session.killFeed(),
      cloudCount: () => session.cloudCount(),
      grappleActive: () => session.grappleActive(),
      aimAtGrapple: () => session.aimAtGrapple(),
    };
  }).catch((error: unknown) => {
    loading.textContent = error instanceof Error ? `Connection failed: ${error.message}` : "Connection failed";
  });
} else if (params.get("scene") === "map" || params.get("scene") === "camp" || params.get("scene") === "kit" || params.get("scene") === "props") {
  const isCamp = params.get("scene") === "camp";
  const mapId = params.get("map");
  const map = params.get("scene") === "kit" ? kitMap : params.get("scene") === "props" ? propsGalleryMap : isCamp ? campMap : mapId ? mapById(mapId) ?? defaultMatchMap : defaultMatchMap;
  const renderer = new Renderer(app, params.has("debug"), map, isCamp ? campTargets : undefined);
  const sampler = new InputSampler(renderer.canvas, isCamp ? 0 : map.spawns.sun[0]?.yaw ?? -Math.PI / 2);
  const session = isCamp ? new PracticeSession(renderer, sampler, app) : new OfflineSession(renderer, sampler, map);
  session.start();
  if (params.has("test")) window.__bowdleTest = {
    snapshot: () => renderer.snapshot(),
    stats: () => renderer.stats(),
    cameraAt: (x, y, z, lookX, lookY, lookZ) => renderer.setTestCamera(x, y, z, lookX, lookY, lookZ),
    ...(session instanceof PracticeSession ? { fireAt: (targetId: string, drawMs: number) => session.fireAt(targetId, drawMs) } : {}),
  };
} else {
  app.innerHTML = `<main style="position:absolute;inset:24% 0 auto;text-align:center;color:#4a3527;font-family:'Gochi Hand',cursive">
    <h1 style="margin:0 0 28px;font:76px 'Permanent Marker',cursive">Bowdle</h1>
    <button id="practice" style="font:30px inherit;margin:8px;padding:10px 28px">Practice</button>
    <button id="play-online" style="font:30px inherit;margin:8px;padding:10px 28px">Play online</button>
  </main>`;
  document.querySelector("#practice")?.addEventListener("click", () => { location.search = "?scene=camp"; });
  document.querySelector("#play-online")?.addEventListener("click", () => { location.search = "?scene=online"; });
}
