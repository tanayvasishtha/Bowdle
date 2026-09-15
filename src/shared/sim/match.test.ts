import { describe, expect, it } from "vitest";
import { END_SCREEN_MS, SCORE_LIMIT, SPAWN_PROTECT_MS, TIME_LIMIT_S } from "../constants.ts";
import type { MapData } from "../maps/types.ts";
import { createPlayerSim } from "./movement.ts";
import { chooseSpawn, respawnPlayer, scoreKill, updateMatchPhase, type MatchCore } from "./match.ts";

function live(): MatchCore { return { phase: "live", phaseEndsAtMs: TIME_LIMIT_S * 1000, scoreSun: 0, scoreMoon: 0 }; }
function emptyMap(): MapData { return { id: "test", name: "Test", bounds: { min: [-20, 0, -20], max: [20, 10, 20] }, boxes: [], ramps: [], volumes: [], zipLines: [], boulders: [], props: [], spawns: { sun: [], moon: [] }, waypoints: [], decor: [], notes: [], look: { sunShafts: false, stainSeed: 0 } }; }

describe("team deathmatch rules", () => {
  it("scores kills and ends at the score limit", () => {
    const match = live();
    for (let kill = 1; kill < SCORE_LIMIT; kill += 1) expect(scoreKill(match, 0, kill)).toBe(false);
    expect(scoreKill(match, 0, SCORE_LIMIT)).toBe(true);
    expect(match).toMatchObject({ scoreSun: SCORE_LIMIT, phase: "end", phaseEndsAtMs: SCORE_LIMIT + END_SCREEN_MS });
  });

  it("ends on time and records a draw", () => {
    const match = live(); match.scoreSun = 4; match.scoreMoon = 4;
    expect(updateMatchPhase(match, match.phaseEndsAtMs)).toBe("end");
    expect(match.scoreSun).toBe(match.scoreMoon);
  });

  it("respawns with protection at the safest team spawn", () => {
    const map = emptyMap();
    map.spawns.sun = [{ pos: [-10, 0, 0], yaw: 0 }, { pos: [10, 0, 0], yaw: 0 }];
    const enemy = createPlayerSim(-9, 0, 0); enemy.team = 1;
    const player = createPlayerSim(); player.alive = false; player.hp = 0;
    respawnPlayer(player, chooseSpawn(map, 0, [enemy]));
    expect(player.x).toBe(10); expect(player.hp).toBe(100); expect(player.spawnProtectMs).toBe(SPAWN_PROTECT_MS);
  });
});
