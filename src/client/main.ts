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
import { loadName } from "./settings.ts";
import { installMenuStyles, showDesktopOnly, showMainMenu } from "./ui/menu.ts";
import { attachPauseMenu } from "./ui/pause.ts";

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
      stats?(): { drawCalls: number; triangles: number; renderScale: number };
      cameraAt?(x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number): void;
    };
  }
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

const params = new URLSearchParams(location.search);
installMenuStyles(app);
const touchOnly = navigator.maxTouchPoints > 0 && matchMedia("(pointer: coarse)").matches;
if (touchOnly) showDesktopOnly(app);
else if (params.get("scene") === "online") {
  const loading = document.createElement("section"); loading.className = "bowdle-panel bowdle-loading";
  loading.innerHTML = `<h2>Opening the field journal…</h2><p>Finding a match in the jungle.</p>`;
  app.append(loading);
  const requestedMapId = params.get("map") ?? undefined;
  const renderer = new Renderer(app, params.has("debug"), requestedMapId ? mapById(requestedMapId) ?? defaultMatchMap : defaultMatchMap);
  const sampler = new InputSampler(renderer.canvas);
  void OnlineSession.connect(renderer, sampler, loadName() || "Player", params.has("test"), requestedMapId).then((session) => {
    loading.remove();
    attachPauseMenu(app, sampler);
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
      stats: () => renderer.stats(),
    };
  }).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : "Connection failed";
    loading.innerHTML = `<h2>The trail went cold.</h2><p>${reason}</p><button>Retry</button>`;
    loading.querySelector("button")!.addEventListener("click", () => location.reload());
  });
} else if (params.get("scene") === "map" || params.get("scene") === "camp" || params.get("scene") === "kit" || params.get("scene") === "props") {
  const isCamp = params.get("scene") === "camp";
  const mapId = params.get("map");
  const map = params.get("scene") === "kit" ? kitMap : params.get("scene") === "props" ? propsGalleryMap : isCamp ? campMap : mapId ? mapById(mapId) ?? defaultMatchMap : defaultMatchMap;
  const renderer = new Renderer(app, params.has("debug"), map, isCamp ? campTargets : undefined);
  const sampler = new InputSampler(renderer.canvas, isCamp ? 0 : map.spawns.sun[0]?.yaw ?? -Math.PI / 2);
  const session = isCamp ? new PracticeSession(renderer, sampler, app) : new OfflineSession(renderer, sampler, map);
  if (isCamp) attachPauseMenu(app, sampler);
  session.start();
  if (params.has("test")) window.__bowdleTest = {
    snapshot: () => renderer.snapshot(),
    stats: () => renderer.stats(),
    cameraAt: (x, y, z, lookX, lookY, lookZ) => renderer.setTestCamera(x, y, z, lookX, lookY, lookZ),
    ...(session instanceof PracticeSession ? { fireAt: (targetId: string, drawMs: number) => session.fireAt(targetId, drawMs) } : {}),
  };
} else {
  showMainMenu(app);
}
