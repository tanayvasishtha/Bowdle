import { Renderer, type SnapshotFractions } from "./render/Renderer.ts";
import { InputSampler } from "./game/InputSampler.ts";
import { OfflineSession } from "./game/OfflineSession.ts";
import { PracticeSession, type PracticeShotResult } from "./game/PracticeSession.ts";
import { practiceTargets, rangeMap } from "../shared/maps/range.ts";

declare global {
  interface Window {
    __bowdleTest?: { snapshot(): SnapshotFractions; fireAt?(targetId: string, drawMs: number): PracticeShotResult };
  }
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

const params = new URLSearchParams(location.search);
if (params.get("scene") === "map" || params.get("scene") === "range") {
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
  const title = document.createElement("h1");
  title.textContent = "Bowdle";
  title.style.cssText =
    "margin:0;position:absolute;top:40%;width:100%;text-align:center;" +
    "font:64px 'Permanent Marker','Comic Sans MS','Chalkboard SE',cursive;color:#233c9b";
  app.append(title);
}
