import { Renderer, type SnapshotFractions } from "./render/Renderer.ts";

declare global {
  interface Window {
    __bowdleTest?: { snapshot(): SnapshotFractions };
  }
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

const params = new URLSearchParams(location.search);
if (params.get("scene") === "map") {
  const renderer = new Renderer(app, params.has("debug"));
  const frame = (time: number) => {
    renderer.render(time);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  if (params.has("test")) window.__bowdleTest = { snapshot: () => renderer.snapshot() };
} else {
  const title = document.createElement("h1");
  title.textContent = "Bowdle";
  title.style.cssText =
    "margin:0;position:absolute;top:40%;width:100%;text-align:center;" +
    "font:64px 'Permanent Marker','Comic Sans MS','Chalkboard SE',cursive;color:#233c9b";
  app.append(title);
}
