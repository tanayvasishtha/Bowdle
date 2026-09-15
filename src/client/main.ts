import { Renderer, type SnapshotFractions } from "./render/Renderer.ts";
import { InputSampler } from "./game/InputSampler.ts";
import { OfflineSession } from "./game/OfflineSession.ts";
import { PracticeSession, type PracticeShotResult } from "./game/PracticeSession.ts";
import { practiceTargets, rangeMap } from "../shared/maps/range.ts";
import { OnlineSession, type RenderedPlayer } from "./game/OnlineSession.ts";

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
    };
  }
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

const params = new URLSearchParams(location.search);
if (params.get("scene") === "online") {
  const loading = document.createElement("h1");
  loading.textContent = "Joining match…";
  loading.style.cssText = "position:absolute;inset:35% 0 auto;text-align:center;color:#233c9b;font:48px 'Permanent Marker',cursive";
  app.append(loading);
  const renderer = new Renderer(app, params.has("debug"));
  const sampler = new InputSampler(renderer.canvas);
  void OnlineSession.connect(renderer, sampler, "Player", params.has("test")).then((session) => {
    loading.remove();
    session.start();
    if (params.has("test")) window.__bowdleTest = {
      snapshot: () => renderer.snapshot(),
      players: () => session.players(),
      sessionId: session.sessionId,
      aimAt: (sessionId: string) => session.aimAt(sessionId),
      drawMs: () => session.drawMs(),
      killFeed: () => session.killFeed(),
    };
  }).catch((error: unknown) => {
    loading.textContent = error instanceof Error ? `Connection failed: ${error.message}` : "Connection failed";
  });
} else if (params.get("scene") === "map" || params.get("scene") === "range") {
  const isRange = params.get("scene") === "range";
  const renderer = new Renderer(app, params.has("debug"), isRange ? rangeMap : undefined, isRange ? practiceTargets : undefined);
  const sampler = new InputSampler(renderer.canvas, isRange ? 0 : -Math.PI / 2);
  const session = isRange ? new PracticeSession(renderer, sampler, app) : new OfflineSession(renderer, sampler);
  session.start();
  if (params.has("test")) window.__bowdleTest = {
    snapshot: () => renderer.snapshot(),
    ...(session instanceof PracticeSession ? { fireAt: (targetId: string, drawMs: number) => session.fireAt(targetId, drawMs) } : {}),
  };
} else {
  app.innerHTML = `<main style="position:absolute;inset:24% 0 auto;text-align:center;color:#233c9b;font-family:'Gochi Hand',cursive">
    <h1 style="margin:0 0 28px;font:76px 'Permanent Marker',cursive">Bowdle</h1>
    <button id="practice" style="font:30px inherit;margin:8px;padding:10px 28px">Practice</button>
    <button id="play-online" style="font:30px inherit;margin:8px;padding:10px 28px">Play online</button>
  </main>`;
  document.querySelector("#practice")?.addEventListener("click", () => { location.search = "?scene=range"; });
  document.querySelector("#play-online")?.addEventListener("click", () => { location.search = "?scene=online"; });
}
