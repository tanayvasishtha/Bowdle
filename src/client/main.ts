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
import { loadName, loadSettings, saveSettings } from "./settings.ts";
import { platform } from "./platform/sdk.ts";
import { ensureAccount, fetchLocker } from "./account.ts";
import { installMenuStyles, showMainMenu } from "./ui/menu.ts";
import { showLeaderboard, showProfile } from "./ui/profile.ts";
import { showPartyPanel } from "./ui/party.ts";
import { runGraphicsBenchmark } from "./graphicsBenchmark.ts";
import { wantsTouchControls, TouchControls, ensureTouchSettingDefault } from "./ui/touchControls.ts";
import { loadRejoinTicket, showRejoinBanner, clearRejoinTicket } from "./ui/rejoin.ts";
import { attachPauseMenu } from "./ui/pause.ts";
import { attachControlsHelp } from "./ui/controls.ts";
import { installAudioMix } from "./audio/mixer.ts";
import { isGameMode, onlineSearch, type GameMode } from "../shared/sim/modes.ts";
import { attachPadNavigation } from "./ui/padNav.ts";
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
      placeNear?(sessionId: string, distance?: number): void;
      drawMs?(): number;
      spawnProtectMsForTest?(): number;
      releaseForTest?(): void;
      setLookForTest?(yaw: number, pitch?: number): void;
      killFeed?(): string;
      cloudCount?(): number;
      grappleActive?(): boolean;
      courseState?(): import("./game/PracticeSession.ts").CourseState;
      courseSignal?(signal: import("./game/course.ts").CourseSignal): void;
      grappleReeling?(): boolean;
      ropeSnaps?(): number;
      showRopeCut?(message: import("../net/messages.ts").RopeCutMessage): void;
      showSwat?(message: import("../net/messages.ts").SwatMessage): void;
      audioState?(): { musicBus: number; layers: { pad: number; percussion: number; melody: number }; cues: number };
      showCue?(kind: "footstep" | "shot" | "boulder", x: number, z: number): void;
      aimAtRelic?(): void;
      relicState?(): { mode: string; home: boolean; carrier: string; carrying: boolean; relicDrawn: boolean; x: number; y: number; z: number };
      quiver?(): { slot: string; charges: number; tetherCooldownMs: number; tethers: number };
      aimAtGrapple?(minDistance?: number): void;
      stats?(): { drawCalls: number; triangles: number; renderScale: number };
      cameraAt?(x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number): void;
      locker?: LockerTestHooks;
      showEndScreen?(): void; setPlayOfTheMatch?(playOf: { killerId: string; victimId: string; distance: number; streak: number; kind: "longShot" | "streak" }): void; openPingWheel?(): void; closePingWheel?(): void; pingWheelOpen?(): boolean; pingMarkerCount?(): number; forcePing?(kind?: "enemy" | "location" | "relic" | "anchor"): void; showAfkPrompt?(secondsLeft?: number): void; afkPromptVisible?(): boolean; startSpectate?(killerId: string, killerName?: string): void; isSpectating?(): boolean; mutePingsFrom?(id: string): void; reportPlayer?(id: string, reason: "offensiveName" | "cheating" | "afk"): Promise<void>;
      showKill?(message: import("../net/messages.ts").KillMessage, atMs: number): void;
      showHitConfirm?(message: import("../net/messages.ts").HitConfirmMessage): void;
      cameraFeel?(): { fov: number; offsetY: number; offsetX: number; rollDeg: number; hurt: number; streaks: number };
      forceFeel?(hurt: number, streaks: number): void;
      showMatchRewards?(stats: import("../net/messages.ts").MatchStatsMessage, reward: import("../net/messages.ts").RewardMessage): void;
      expedition?(): import("./game/OnlineSession.ts").ExpeditionView;
    };
  }
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

const params = new URLSearchParams(location.search);
// Starts the portal SDK (a no-op on the web build) before anything else loads.
platform();
installAudioMix();
attachPadNavigation();
installMenuStyles(app);
attachUiSounds();
ensureTouchSettingDefault();
const enableTouch = wantsTouchControls();
if (params.get("scene") === "online") {
  const loading = document.createElement("section"); loading.className = "bowdle-panel bowdle-loading";
  loading.dataset.testid = "match-loading";
  loading.innerHTML = `<h2>Opening the field journal…</h2><p data-stage>Finding a match in the jungle.</p><progress data-progress max="100" value="8"></progress>`;
  app.append(loading);
  const setLoad = (label: string, value: number): void => {
    loading.querySelector("[data-stage]")!.textContent = label;
    loading.querySelector<HTMLProgressElement>("[data-progress]")!.value = value;
  };
  const requestedMapId = params.get("map") ?? undefined;
  setLoad("Building the map…", 20);
  const renderer = new Renderer(app, params.has("debug"), requestedMapId ? mapById(requestedMapId) ?? defaultMatchMap : defaultMatchMap);
  const sampler = new InputSampler(renderer.canvas);
  if (enableTouch) sampler.attachTouch(new TouchControls(app));
  const requestedParty = normalizePartyCode(params.get("party") ?? "");
  const party = isPartyCode(requestedParty) ? requestedParty : undefined;
  if (party) setLoad(`Joining party ${party}…`, 30);
  void renderer.warmShaders().then(() => {
    setLoad("Joining the match…", 70);
    return (params.get("rejoin") === "1" && params.get("token")
    ? OnlineSession.reconnect(renderer, sampler, params.get("token")!)
    : OnlineSession.connect(renderer, sampler, loadName() || "Player", params.has("test"), requestedMapId, party, params.get("room") ?? undefined, isGameMode(params.get("mode")) ? params.get("mode") as GameMode : "tdm", params.has("checkpoint"), params.has("startWave") ? Number(params.get("startWave")) : undefined, params.has("ranked"), params.has("weekly"), (params.get("handicaps") ?? "").split(",").filter(Boolean), params.has("spectator"), params.has("seed") ? Number(params.get("seed")) : undefined)
  ).then((session) => {
    loading.remove();
    attachPauseMenu(app, sampler, party);
    attachControlsHelp(app, renderer.canvas);
    session.start();
    if (params.has("test")) window.__bowdleTest = {
      snapshot: () => renderer.snapshot(),
      players: () => session.players(),
      sessionId: session.sessionId,
      aimAt: (sessionId: string) => session.aimAt(sessionId),
      placeNear: (sessionId, distance) => session.placeNear(sessionId, distance),
      drawMs: () => session.drawMs(),
      spawnProtectMsForTest: () => session.spawnProtectMsForTest(),
      releaseForTest: () => session.releaseForTest(),
      setLookForTest: (yaw, pitch) => session.setLookForTest(yaw, pitch),
      killFeed: () => session.killFeed(),
      cloudCount: () => session.cloudCount(),
      grappleActive: () => session.grappleActive(),
      grappleReeling: () => session.grappleReeling(),
      ropeSnaps: () => renderer.snapCount(),
      showRopeCut: (message) => session.showRopeCut(message),
      showSwat: (message) => session.showSwat(message),
      audioState: () => session.audioState(),
      showCue: (kind, x, z) => session.showCue(kind, x, z),
      relicState: () => session.relicState(),
      aimAtRelic: () => session.aimAtRelic(),
      quiver: () => session.quiverState(),
      aimAtGrapple: (minDistance) => session.aimAtGrapple(minDistance),
      stats: () => renderer.stats(),
      cameraAt: (x, y, z, lookX, lookY, lookZ) => renderer.setTestCamera(x, y, z, lookX, lookY, lookZ),
      showEndScreen: () => session.showEndScreen(),
      setPlayOfTheMatch: (playOf) => session.setPlayOfTheMatch(playOf),
      openPingWheel: () => session.openPingWheel(),
      closePingWheel: () => session.closePingWheel(),
      pingWheelOpen: () => session.pingWheelOpen(),
      pingMarkerCount: () => session.pingMarkerCount(),
      forcePing: (kind) => session.forcePing(kind as "enemy" | "location" | "relic" | "anchor" | undefined),
      showAfkPrompt: (secondsLeft) => session.showAfkPrompt(secondsLeft),
      afkPromptVisible: () => session.afkPromptVisible(),
      startSpectate: (killerId, killerName) => session.startSpectate(killerId, killerName),
      isSpectating: () => session.isSpectating(),
      mutePingsFrom: (id) => session.mutePingsFrom(id),
      reportPlayer: (id, reason) => session.reportPlayer(id, reason),
      showKill: (message, atMs) => session.showKill(message, atMs),
      showHitConfirm: (message) => session.showHitConfirm(message),
      cameraFeel: () => session.cameraFeel(),
      forceFeel: (hurt, streaks) => renderer.forceFeel(hurt, streaks),
      showMatchRewards: (stats, reward) => session.showMatchRewards(stats, reward),
      expedition: () => session.expeditionState(),
    };
  }).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : "Connection failed";
    loading.innerHTML = `<h2>The trail went cold.</h2><p>${reason}</p><button>Retry</button>`;
    loading.querySelector("button")!.addEventListener("click", () => location.reload());
  });
  });
} else if (params.get("scene") === "map" || params.get("scene") === "camp" || params.get("scene") === "kit" || params.get("scene") === "props") {
  const isCamp = params.get("scene") === "camp";
  const mapId = params.get("map");
  const map = params.get("scene") === "kit" ? kitMap : params.get("scene") === "props" ? propsGalleryMap : isCamp ? campMap : mapId ? mapById(mapId) ?? defaultMatchMap : defaultMatchMap;
  const renderer = new Renderer(app, params.has("debug"), map, isCamp ? campTargets : undefined);
  const sampler = new InputSampler(renderer.canvas, isCamp ? 0 : map.spawns.sun[0]?.yaw ?? -Math.PI / 2);
  const courseMode = params.get("course") === "first" ? "first" : params.has("course") ? "replay" : "auto";
  const session = isCamp ? new PracticeSession(renderer, sampler, app, courseMode) : new OfflineSession(renderer, sampler, map);
  if (isCamp) attachControlsHelp(app, renderer.canvas);
  if (isCamp) attachPauseMenu(app, sampler);
  if (session instanceof PracticeSession) void fetchLocker().then((locker) => { if (locker) session.setLoadout(locker.loadout); });
  session.start();
  if (params.has("test")) window.__bowdleTest = {
    snapshot: () => renderer.snapshot(),
    stats: () => renderer.stats(),
    cameraAt: (x, y, z, lookX, lookY, lookZ) => renderer.setTestCamera(x, y, z, lookX, lookY, lookZ),
    ...(session instanceof PracticeSession ? { fireAt: (targetId: string, drawMs: number) => session.fireAt(targetId, drawMs), courseState: () => session.courseState(), courseSignal: (signal) => session.courseSignal(signal) } : {}),
  };
} else if (params.get("scene") === "locker") {
  startLocker(app);
} else if (params.get("scene") === "profile") {
  void showProfile(app, () => location.assign("/"));
} else if (params.get("scene") === "leaderboard") {
  void showLeaderboard(app, () => location.assign("/"));
} else if (params.get("scene") === "party") {
  const playerName = loadName() || "Explorer";
  void ensureAccount(playerName);
  showPartyPanel(app, (code, mode) => { location.search = onlineSearch(mode ?? "tdm", code); });
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
  const bootMenu = (): void => {
    const ticket = loadRejoinTicket();
    if (ticket) {
      showRejoinBanner(app, () => {
        location.assign(`/?scene=online&rejoin=1&token=${encodeURIComponent(ticket.reconnectionToken)}&mode=${encodeURIComponent(ticket.mode)}`);
      }, () => { clearRejoinTicket(); showMainMenu(app); });
    } else {
      showMainMenu(app);
    }
  };
  const settings = loadSettings();
  // Automated scenes skip the 5s first-launch sample so tests and deep-links stay snappy.
  if (!settings.graphicsBenchmarked && !params.has("test")) {
    const banner = document.createElement("section");
    banner.className = "bowdle-panel bowdle-loading";
    banner.dataset.testid = "graphics-benchmark";
    banner.innerHTML = `<h2>Tuning the look…</h2><p>Sampling a few seconds of frames for this device.</p>`;
    app.append(banner);
    void runGraphicsBenchmark(app).then((preset) => {
      saveSettings({ ...loadSettings(), graphicsPreset: preset, graphicsBenchmarked: true });
      banner.remove();
      bootMenu();
    }).catch(() => {
      saveSettings({ ...loadSettings(), graphicsPreset: "medium", graphicsBenchmarked: true });
      banner.remove();
      bootMenu();
    });
  } else {
    bootMenu();
  }
}

const swPlatform = import.meta.env.VITE_PLATFORM ?? "web";
if (import.meta.env.PROD && swPlatform === "web" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const version = import.meta.env.VITE_BUILD_ID ?? import.meta.env.VITE_APP_VERSION ?? "1";
    void navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(String(version))}`);
  });
}
