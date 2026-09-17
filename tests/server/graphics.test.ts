import { describe, expect, it } from "vitest";
import { GRAPHICS_QUALITY, presetFromFrameMs } from "../../src/shared/graphics.ts";

describe("G13 graphics presets", () => {
  it("defines Low with scale 0.7, short props, no boil or hatch", () => {
    expect(GRAPHICS_QUALITY.low).toEqual({
      renderScale: 0.7,
      propHideDistance: 50,
      boil: false,
      hatch: false,
    });
    expect(GRAPHICS_QUALITY.high.boil).toBe(true);
  });

  it("maps benchmark frame times to presets", () => {
    expect(presetFromFrameMs(30)).toBe("low");
    expect(presetFromFrameMs(18)).toBe("medium");
    expect(presetFromFrameMs(10)).toBe("high");
  });
});
