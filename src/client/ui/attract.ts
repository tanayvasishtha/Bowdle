/** Idle attract loop: orbit a live map after 30s on the main menu (LEFT-F3). */
import { createMotion } from "../render/characters/pose.ts";
import { Renderer } from "../render/Renderer.ts";
import { matchMaps } from "../../shared/maps/registry.ts";

export const ATTRACT_IDLE_MS = 30_000;

export type AttractHandle = { stop: () => void };

/** Starts a slow orbit around a random match map with showcase explorers. */
export function startAttract(host: HTMLElement): AttractHandle {
  const map = matchMaps[Math.floor(Math.random() * matchMaps.length)] ?? matchMaps[0]!;
  const root = document.createElement("div");
  root.dataset.testid = "attract-root";
  root.style.cssText = "position:absolute;inset:0;z-index:1";
  host.append(root);

  const overlay = document.createElement("div");
  overlay.dataset.testid = "attract-overlay";
  overlay.style.cssText = "position:absolute;inset:0;z-index:2;display:grid;place-items:end center;padding:28px;pointer-events:none;font:28px 'Gochi Hand',cursive;color:#efe3c6;text-shadow:0 2px 0 #4a3527";
  overlay.innerHTML = `<span>Press any key or tap to return · ${map.name}</span>`;
  host.append(overlay);

  const renderer = new Renderer(root, false, map);
  renderer.setViewmodelVisible(false);
  const motions = [
    createMotion(),
    { ...createMotion(), speed: 7.5 },
    { ...createMotion(), crouched: true },
    { ...createMotion(), drawing: true, drawFraction: 1 },
  ] as const;
  motions.forEach((motion, index) => {
    const angle = (index / motions.length) * Math.PI * 2;
    const x = Math.cos(angle) * 6;
    const z = Math.sin(angle) * 6;
    renderer.addShowcase(index % 2 === 0 ? "sun" : "moon", x, 0, z, angle + Math.PI, motion);
  });

  let raf = 0;
  const origin = performance.now();
  const radius = 28;
  const tick = (now: number): void => {
    const t = (now - origin) * 0.00025;
    renderer.setTestCamera(Math.cos(t) * radius, 12, Math.sin(t) * radius, 0, 3, 0);
    renderer.render(now);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop: () => {
      cancelAnimationFrame(raf);
      root.remove();
      overlay.remove();
    },
  };
}

/** Arms a 30s idle timer; any input cancels attract and restarts the wait. */
export function armAttractIdle(host: HTMLElement, menu: HTMLElement): () => void {
  let timer = 0;
  let attract: AttractHandle | undefined;

  const clearTimer = (): void => { window.clearTimeout(timer); };
  const wake = (): void => {
    clearTimer();
    if (attract) {
      attract.stop();
      attract = undefined;
      menu.style.visibility = "";
    }
    timer = window.setTimeout(() => {
      menu.style.visibility = "hidden";
      attract = startAttract(host);
    }, ATTRACT_IDLE_MS);
  };

  const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "wheel", "touchstart"];
  for (const event of events) window.addEventListener(event, wake, { passive: true });
  wake();

  return () => {
    clearTimer();
    attract?.stop();
    for (const event of events) window.removeEventListener(event, wake);
  };
}
