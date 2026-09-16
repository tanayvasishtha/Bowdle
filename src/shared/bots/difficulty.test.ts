import { describe, expect, it } from "vitest";
import { botDifficultyFor } from "./difficulty.ts";

describe("bot difficulty", () => {
  it("maps the average level to easy, normal and hard", () => {
    expect(botDifficultyFor([{ level: 1, matches: 10 }])).toBe("easy");
    expect(botDifficultyFor([{ level: 8, matches: 10 }])).toBe("normal");
    expect(botDifficultyFor([{ level: 20, matches: 10 }])).toBe("hard");
    expect(botDifficultyFor([{ level: 3, matches: 10 }, { level: 19, matches: 10 }])).toBe("normal");
    expect(botDifficultyFor([{ level: 11, matches: 10 }, { level: 13, matches: 10 }])).toBe("hard");
  });

  it("forces easy while any human is new, and defaults to normal with no humans", () => {
    expect(botDifficultyFor([{ level: 30, matches: 50 }, { level: 1, matches: 2 }])).toBe("easy");
    expect(botDifficultyFor([{ level: 30, matches: 3 }])).toBe("hard");
    expect(botDifficultyFor([])).toBe("normal");
  });
});
