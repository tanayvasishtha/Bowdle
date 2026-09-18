import { END_SCREEN_MS, EXPEDITION, MODE_TUNING, SCORE_LIMIT, TEAM_SIZE, TIME_LIMIT_S } from "../constants.ts";
import type { MapData, SpawnPoint } from "../maps/types.ts";
import { chooseSpawn, type MatchCore } from "./match.ts";
import type { PlayerSim } from "./movement.ts";

export const GAME_MODES = ["tdm", "ffa", "relic", "expedition"] as const;
export type GameMode = typeof GAME_MODES[number];

/**
 * What differs between modes. In Free for All every player has a team number of their own,
 * so the "different team" checks used for damage, arrows and ropes mean "anyone else".
 */
export type ModeRules = { teams: boolean; scoreLimit: number; timeLimitS: number; killsScore: boolean; maxPlayers: number };

export const MODE_RULES: Record<GameMode, ModeRules> = {
  tdm: { teams: true, scoreLimit: SCORE_LIMIT, timeLimitS: TIME_LIMIT_S, killsScore: true, maxPlayers: TEAM_SIZE * 2 },
  ffa: { teams: false, scoreLimit: MODE_TUNING.ffaKillLimit, timeLimitS: MODE_TUNING.ffaTimeLimitS, killsScore: true, maxPlayers: MODE_TUNING.ffaPlayers },
  relic: { teams: true, scoreLimit: MODE_TUNING.relicCaptureLimit, timeLimitS: MODE_TUNING.relicTimeLimitS, killsScore: false, maxPlayers: TEAM_SIZE * 2 },
  // Expedition runs end when every player is down, not on a clock; the limit only stops a forgotten room.
  expedition: { teams: true, scoreLimit: Number.POSITIVE_INFINITY, timeLimitS: 4 * 60 * 60, killsScore: false, maxPlayers: EXPEDITION.maxPlayers },
};

export function isGameMode(value: unknown): value is GameMode {
  return typeof value === "string" && (GAME_MODES as readonly string[]).includes(value);
}

export const MODE_NAMES: Record<GameMode, string> = { tdm: "Quick Play", ffa: "Free for All", relic: "Relic Run", expedition: "Expedition" };

/** The address of an online match in a mode; team deathmatch keeps the plain address. */
export type ExpeditionSearchOptions = {
  checkpoint?: boolean;
  weekly?: boolean;
  handicaps?: readonly string[];
};

/** The address of an online match in a mode; team deathmatch keeps the plain address. */
export function onlineSearch(mode: GameMode, party?: string, checkpointOrOptions: boolean | ExpeditionSearchOptions = false): string {
  const options: ExpeditionSearchOptions = typeof checkpointOrOptions === "boolean"
    ? { checkpoint: checkpointOrOptions }
    : checkpointOrOptions;
  const params = new URLSearchParams({ scene: "online" });
  if (party) params.set("party", party);
  if (mode !== "tdm") params.set("mode", mode);
  if (options.checkpoint && mode === "expedition" && !party) params.set("checkpoint", "1");
  if (options.weekly && mode === "expedition") params.set("weekly", "1");
  if (options.handicaps && options.handicaps.length > 0 && mode === "expedition") params.set("handicaps", options.handicaps.join(","));
  return `?${params.toString()}`;
}

export function modeRules(mode: string): ModeRules { return MODE_RULES[isGameMode(mode) ? mode : "tdm"]; }

/** Free for All: the lowest team number nobody holds. */
export function freeTeam(taken: Iterable<number>): number {
  const used = new Set(taken);
  let team = 0;
  while (used.has(team)) team += 1;
  return team;
}

/**
 * Scores a kill for the mode and says whether the match ended. Team modes count team kills; Free for All shows
 * the leader's kill count in the Sun score slot and ends when anyone reaches the limit; Relic Run scores captures only.
 */
export function scoreKillFor(match: MatchCore, mode: string, killerTeam: number, killerKills: number, nowMs: number): boolean {
  const rules = modeRules(mode);
  if (!rules.killsScore) return false;
  if (rules.teams) {
    if (killerTeam === 0) match.scoreSun += 1; else match.scoreMoon += 1;
    return endAt(match, rules, Math.max(match.scoreSun, match.scoreMoon), nowMs);
  }
  match.scoreSun = Math.max(match.scoreSun, killerKills);
  return endAt(match, rules, killerKills, nowMs);
}

export function scoreCapture(match: MatchCore, team: number, nowMs: number): boolean {
  if (team === 0) match.scoreSun += 1; else match.scoreMoon += 1;
  return endAt(match, MODE_RULES.relic, Math.max(match.scoreSun, match.scoreMoon), nowMs);
}

function endAt(match: MatchCore, rules: ModeRules, score: number, nowMs: number): boolean {
  if (score < rules.scoreLimit) return false;
  match.phase = "end"; match.phaseEndsAtMs = nowMs + END_SCREEN_MS;
  return true;
}

/** Free for All spawns at the point farthest from every living player; team modes keep their own spawns. */
export function chooseSpawnFor(mode: string, map: MapData, team: number, players: Iterable<PlayerSim>, self?: PlayerSim): SpawnPoint {
  if (modeRules(mode).teams) return chooseSpawn(map, team, players, self);
  const living = [...players].filter((player) => player.alive && player !== self);
  let best = map.spawns.sun[0]!, bestDistance = Number.NEGATIVE_INFINITY;
  for (const spawn of [...map.spawns.sun, ...map.spawns.moon]) {
    let closest = Number.POSITIVE_INFINITY;
    for (const other of living) closest = Math.min(closest, Math.hypot(spawn.pos[0] - other.x, spawn.pos[2] - other.z));
    if (closest > bestDistance) { bestDistance = closest; best = spawn; }
  }
  return best;
}

/** In Free for All the winner is the player with the most kills; team modes compare scores. */
export function matchWinner(mode: string, scoreSun: number, scoreMoon: number): "sun" | "moon" | "draw" | "player" {
  if (!modeRules(mode).teams) return "player";
  return scoreSun === scoreMoon ? "draw" : scoreSun > scoreMoon ? "sun" : "moon";
}
