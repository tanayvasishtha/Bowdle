import { describe, expect, it } from "vitest";
import { defaultSettings } from "./settings.ts";

describe("default settings", () => {
  it("gives new players a crosshair that stands out against the map's own brown wood and tan ground", () => {
    // sepia is the game's ink/outline color, used for walls, props and most of the map; a sepia crosshair reads as
    // camouflage against it. sunInk is a saturated accent color that contrasts with sky, ground and foliage alike.
    expect(defaultSettings().crosshairColor).toBe("sunInk");
  });
});
