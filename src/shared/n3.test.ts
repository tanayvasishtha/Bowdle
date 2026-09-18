import { describe, expect, it } from "vitest";
import { progressFrom } from "./challenges.ts";
import { createMatchStats } from "./matchStats.ts";

describe("N3 expedition challenges", () => {
  it("counts wave 10 and colossus kills", () => {
    const atWave = { ...createMatchStats(), waveReached: 10 };
    const shy = { ...createMatchStats(), waveReached: 9 };
    const boss = { ...createMatchStats(), colossusKills: 2 };
    expect(progressFrom(atWave, { id: "d.expedition", text: "", stat: "wave10", target: 1 })).toBe(1);
    expect(progressFrom(shy, { id: "d.expedition", text: "", stat: "wave10", target: 1 })).toBe(0);
    expect(progressFrom(boss, { id: "d.expeditionBoss", text: "", stat: "colossusKills", target: 1 })).toBe(2);
  });
});
