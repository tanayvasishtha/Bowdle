import { END_SCREEN_MS, MAX_HP, SCORE_LIMIT, SPAWN_PROTECT_MS, TIME_LIMIT_S, WARMUP_MS } from "../constants.ts";
import type { MapData, SpawnPoint } from "../maps/types.ts";
import type { PlayerSim } from "./movement.ts";

export type MatchPhase = "warmup" | "live" | "end";
export type MatchCore = { phase: MatchPhase; phaseEndsAtMs: number; scoreRed: number; scoreGreen: number };

export function chooseSpawn(map: MapData, team: number, players: Iterable<PlayerSim>): SpawnPoint {
  const spawns = team === 0 ? map.spawns.red : map.spawns.green;
  let best = spawns[0]!;
  let bestDistance = -1;
  for (const spawn of spawns) {
    let closest = Number.POSITIVE_INFINITY;
    for (const enemy of players) {
      if (!enemy.alive || enemy.team === team) continue;
      closest = Math.min(closest, Math.hypot(spawn.pos[0] - enemy.x, spawn.pos[2] - enemy.z));
    }
    if (closest > bestDistance) { bestDistance = closest; best = spawn; }
  }
  return best;
}

export function respawnPlayer(player: PlayerSim, spawn: SpawnPoint): void {
  player.x = spawn.pos[0]; player.y = spawn.pos[1]; player.z = spawn.pos[2]; player.yaw = spawn.yaw;
  player.vx = 0; player.vy = 0; player.vz = 0; player.hp = MAX_HP; player.alive = true;
  player.spawnProtectMs = SPAWN_PROTECT_MS; player.respawnAtMs = 0; player.drawMs = 0; player.prevButtons = 0;
}

export function scoreKill(match: MatchCore, team: number, nowMs: number): boolean {
  if (team === 0) match.scoreRed += 1; else match.scoreGreen += 1;
  if (match.scoreRed < SCORE_LIMIT && match.scoreGreen < SCORE_LIMIT) return false;
  match.phase = "end"; match.phaseEndsAtMs = nowMs + END_SCREEN_MS;
  return true;
}

export function updateMatchPhase(match: MatchCore, nowMs: number): "live" | "end" | "restart" | null {
  if (nowMs < match.phaseEndsAtMs) return null;
  if (match.phase === "warmup") {
    match.phase = "live"; match.phaseEndsAtMs = nowMs + TIME_LIMIT_S * 1000; return "live";
  }
  if (match.phase === "live") {
    match.phase = "end"; match.phaseEndsAtMs = nowMs + END_SCREEN_MS; return "end";
  }
  match.phase = "warmup"; match.phaseEndsAtMs = nowMs + WARMUP_MS; match.scoreRed = 0; match.scoreGreen = 0; return "restart";
}
