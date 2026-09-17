/** Graphics quality presets (G13). */

export const GRAPHICS_PRESETS = ["low", "medium", "high"] as const;
export type GraphicsPreset = (typeof GRAPHICS_PRESETS)[number];

export const FPS_CAPS = [30, 60, 120, 0] as const;
export type FpsCap = (typeof FPS_CAPS)[number];

export type GraphicsQuality = {
  renderScale: number;
  propHideDistance: number;
  boil: boolean;
  hatch: boolean;
};

export const GRAPHICS_QUALITY: Record<GraphicsPreset, GraphicsQuality> = {
  low: { renderScale: 0.7, propHideDistance: 50, boil: false, hatch: false },
  medium: { renderScale: 0.85, propHideDistance: 70, boil: true, hatch: true },
  high: { renderScale: 1, propHideDistance: 90, boil: true, hatch: true },
};

/** Map a short benchmark average frame time (ms) to a preset. */
export function presetFromFrameMs(averageFrameMs: number): GraphicsPreset {
  if (averageFrameMs > 22) return "low";
  if (averageFrameMs > 14) return "medium";
  return "high";
}
