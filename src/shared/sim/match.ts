import { END_SCREEN_MS, MAX_HP, SCORE_LIMIT, SPAWN_PROTECT_MS, TIME_LIMIT_S, WARMUP_MS } from "../constants.ts";
import type { MapData, SpawnPoint } from "../maps/types.ts";
import type { PlayerSim } from "./movement.ts";

export type MatchPhase = "warmup" | "live" | "end";
export type MatchCore = { phase: MatchPhase; phaseEndsAtMs: number; scoreSun: number; scoreMoon: number };

const SPAWN_OCCUPIED_M = 1.5;
/** Past this distance every enemy counts as equally far, so teammates spread over the free spawns. */
const SPAWN_SAFE_M = 30;

/** Picks the spawn farthest from living enemies, skipping spawns a living teammate is standing on. */
export function chooseSpawn(map: MapData, team: number, players: Iterable<PlayerSim>, self?: PlayerSim): SpawnPoint {
  const spawns = team === 0 ? map.spawns.sun : map.spawns.moon;
  const living = [...players].filter((player) => player.alive && player !== self);
  let best = spawns[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const spawn of spawns) {
    let closest = SPAWN_SAFE_M;
    let occupied = false;
    for (const other of living) {
      const distance = Math.hypot(spawn.pos[0] - other.x, spawn.pos[2] - other.z);
      if (other.team === team) occupied ||= distance < SPAWN_OCCUPIED_M;
      else closest = Math.min(closest, distance);
    }
    const score = closest - (occupied ? SPAWN_SAFE_M * 2 : 0);
    if (score > bestScore) { bestScore = score; best = spawn; }
  }
  return best;
}

export function respawnPlayer(player: PlayerSim, spawn: SpawnPoint): void {
  player.x = spawn.pos[0]; player.y = spawn.pos[1]; player.z = spawn.pos[2]; player.yaw = spawn.yaw;
  player.vx = 0; player.vy = 0; player.vz = 0; player.hp = MAX_HP; player.alive = true;
  player.spawnProtectMs = SPAWN_PROTECT_MS; player.respawnAtMs = 0; player.drawMs = 0; player.prevButtons = 0;
}

export function scoreKill(match: MatchCore, team: number, nowMs: number): boolean {
  if (team === 0) match.scoreSun += 1; else match.scoreMoon += 1;
  if (match.scoreSun < SCORE_LIMIT && match.scoreMoon < SCORE_LIMIT) return false;
  match.phase = "end"; match.phaseEndsAtMs = nowMs + END_SCREEN_MS;
  return true;
}

export function updateMatchPhase(match: MatchCore, nowMs: number, timeLimitS: number = TIME_LIMIT_S): "live" | "end" | "restart" | null {
  if (nowMs < match.phaseEndsAtMs) return null;
  if (match.phase === "warmup") {
    match.phase = "live"; match.phaseEndsAtMs = nowMs + timeLimitS * 1000; return "live";
  }
  if (match.phase === "live") {
    match.phase = "end"; match.phaseEndsAtMs = nowMs + END_SCREEN_MS; return "end";
  }
  match.phase = "warmup"; match.phaseEndsAtMs = nowMs + WARMUP_MS; match.scoreSun = 0; match.scoreMoon = 0; return "restart";
}
