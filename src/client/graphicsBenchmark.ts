/** First-launch frame-time sample that picks a graphics preset (LEFT-F3). */
import { presetFromFrameMs, type GraphicsPreset } from "../shared/graphics.ts";
import { defaultMatchMap } from "../shared/maps/registry.ts";
import { Renderer } from "./render/Renderer.ts";

const BENCH_MS = 5_000;

/**
 * Runs a short off-menu render loop and returns the preset that fits the
 * measured average frame time. The host element is removed when finished.
 */
export async function runGraphicsBenchmark(host: HTMLElement): Promise<GraphicsPreset> {
  const shell = document.createElement("div");
  shell.style.cssText = "position:absolute;inset:0;opacity:0;pointer-events:none;z-index:0";
  host.append(shell);
  const renderer = new Renderer(shell, false, defaultMatchMap);
  renderer.setViewmodelVisible(false);
  renderer.setTestCamera(24, 14, 24, 0, 4, 0);
  await renderer.warmShaders();

  const samples: number[] = [];
  let last = performance.now();
  const started = last;
  await new Promise<void>((resolve) => {
    const tick = (now: number): void => {
      const dt = now - last;
      last = now;
      if (dt > 0 && dt < 100) samples.push(dt);
      renderer.render(now);
      renderer.setTestCamera(
        24 * Math.cos((now - started) * 0.0004),
        14,
        24 * Math.sin((now - started) * 0.0004),
        0,
        4,
        0,
      );
      if (now - started >= BENCH_MS) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  shell.remove();
  const average = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 30;
  return presetFromFrameMs(average);
}
