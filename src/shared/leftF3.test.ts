import { describe, expect, it } from "vitest";
import { presetFromFrameMs } from "./graphics.ts";

describe("LEFT-F3 graphics benchmark mapping", () => {
  it("maps frame times to presets", () => {
    expect(presetFromFrameMs(30)).toBe("low");
    expect(presetFromFrameMs(18)).toBe("medium");
    expect(presetFromFrameMs(10)).toBe("high");
  });
});
