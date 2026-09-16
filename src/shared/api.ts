import type { LevelProgress } from "./progression.ts";

/** Shapes the account API returns. Shared so the client never imports server code. */
export type Provider = "discord" | "google";
export const PROVIDERS: readonly Provider[] = ["discord", "google"];

export type Profile = {
  id: string; name: string; xp: number; ink: number; progress: LevelProgress; season: string;
  seasonKills: number; seasonMatches: number; seasonWins: number; linked: Provider[];
};

export type LeaderboardRow = { rank: number; name: string; kills: number; wins: number; matches: number; level: number };
export type Leaderboard = { season: string; rows: LeaderboardRow[] };
export type GuestSession = { token: string; profile: Profile };
