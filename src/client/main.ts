import { lineupMap } from "../shared/maps/fixtures/lineup.ts";
import { createMotion, type CharacterMotion } from "./render/characters/pose.ts";
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
import { platform } from "./platform/sdk.ts";
import { fetchLocker } from "./account.ts";
import { installMenuStyles, showDesktopOnly, showMainMenu } from "./ui/menu.ts";
import { attachPauseMenu } from "./ui/pause.ts";
import { attachUiSounds } from "./audio/uiSounds.ts";
import { isPartyCode, normalizePartyCode } from "../shared/party.ts";
import { startLocker, type LockerTestHooks } from "./ui/locker.ts";

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
      locker?: LockerTestHooks;
      showEndScreen?(): void;
      showKill?(message: import("../net/messages.ts").KillMessage, atMs: number): void;
      showHitConfirm?(message: import("../net/messages.ts").HitConfirmMessage): void;
      cameraFeel?(): { fov: number; offsetY: number; offsetX: number; rollDeg: number; hurt: number; streaks: number };
      forceFeel?(hurt: number, streaks: number): void;
      showMatchRewards?(stats: import("../net/messages.ts").MatchStatsMessage, reward: import("../net/messages.ts").RewardMessage): void;
    };
  }
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

const params = new URLSearchParams(location.search);
// Starts the portal SDK (a no-op on the web build) before anything else loads.
platform();
installMenuStyles(app);
attachUiSounds();
const touchOnly = navigator.maxTouchPoints > 0 && matchMedia("(pointer: coarse)").matches;
if (touchOnly) showDesktopOnly(app);
else if (params.get("scene") === "online") {
  const loading = document.createElement("section"); loading.className = "bowdle-panel bowdle-loading";
  loading.innerHTML = `<h2>Opening the field journal…</h2><p>Finding a match in the jungle.</p>`;
  app.append(loading);
  const requestedMapId = params.get("map") ?? undefined;
  const renderer = new Renderer(app, params.has("debug"), requestedMapId ? mapById(requestedMapId) ?? defaultMatchMap : defaultMatchMap);
  const sampler = new InputSampler(renderer.canvas);
  const requestedParty = normalizePartyCode(params.get("party") ?? "");
  const party = isPartyCode(requestedParty) ? requestedParty : undefined;
  if (party) loading.querySelector("p")!.textContent = `Joining party ${party}.`;
  void OnlineSession.connect(renderer, sampler, loadName() || "Player", params.has("test"), requestedMapId, party).then((session) => {
    loading.remove();
    attachPauseMenu(app, sampler, party);
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
      showEndScreen: () => session.showEndScreen(),
      showKill: (message, atMs) => session.showKill(message, atMs),
      showHitConfirm: (message) => session.showHitConfirm(message),
      cameraFeel: () => session.cameraFeel(),
      forceFeel: (hurt, streaks) => renderer.forceFeel(hurt, streaks),
      showMatchRewards: (stats, reward) => session.showMatchRewards(stats, reward),
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
  if (session instanceof PracticeSession) void fetchLocker().then((locker) => { if (locker) session.setLoadout(locker.loadout); });
  session.start();
  if (params.has("test")) window.__bowdleTest = {
    snapshot: () => renderer.snapshot(),
    stats: () => renderer.stats(),
    cameraAt: (x, y, z, lookX, lookY, lookZ) => renderer.setTestCamera(x, y, z, lookX, lookY, lookZ),
    ...(session instanceof PracticeSession ? { fireAt: (targetId: string, drawMs: number) => session.fireAt(targetId, drawMs) } : {}),
  };
} else if (params.get("scene") === "locker") {
  startLocker(app);
} else if (params.get("scene") === "characters") {
  const renderer = new Renderer(app, params.has("debug"), lineupMap);
  const lineup: readonly Partial<CharacterMotion>[] = [
    {}, { speed: 7.5 }, { crouched: true }, { sliding: true, speed: 10 },
    { grounded: false, verticalSpeed: 4 }, { drawing: true, drawFraction: 1 }, { stabT: 0.45 }, { zipping: true, grounded: false },
  ];
  (["sun", "moon"] as const).forEach((kind, row) => {
    lineup.forEach((overrides, column) => {
      const x = (column - (lineup.length - 1) / 2) * 2.1;
      const yaw = Math.PI - (overrides.drawing ? 0.9 : 0.25);
      renderer.addShowcase(kind, row === 0 ? x : x + 1.05, overrides.zipping ? 0.6 : 0, row === 0 ? 0 : -2.4, yaw, { ...createMotion(), ...overrides });
    });
  });
  renderer.setViewmodelVisible(false);
  renderer.setTestCamera(0, 1.8, 6.4, 0, 1.0, -1.2);
  const loop = (time: number): void => { renderer.render(time); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  if (params.has("test")) window.__bowdleTest = {
    snapshot: () => renderer.snapshot(),
    stats: () => renderer.stats(),
    cameraAt: (x, y, z, lookX, lookY, lookZ) => renderer.setTestCamera(x, y, z, lookX, lookY, lookZ),
  };
} else {
  showMainMenu(app);
}
