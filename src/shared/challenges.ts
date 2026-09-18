import { CHALLENGE_COUNT, CHALLENGE_REWARDS, DAILY_TARGETS as D, DAYS_PER_WEEK, ISO_THURSDAY, MEDAL_LIMITS, UTC_DAY_MS, WEEK_SEED_MULTIPLIER, WEEKLY_TARGETS as W } from "./constants.ts";
import { mulberry32 } from "./math/rng.ts";
import type { MatchStats } from "./matchStats.ts";

export type ChallengeStat = "kills" | "headshots" | "won" | "matches" | "longShots" | "daggerKills" | "assists" | "zipKills" | "streaks3" | "robinHoods" | "boulderKills" | "mapsWon" | "medals" | "scatterKills" | "tetherRides" | "relicCaptures" | "wave10" | "colossusKills";
export type Challenge = { id: string; text: string; stat: ChallengeStat; target: number };
export type ChallengeState = Omit<Challenge, "stat"> & { progress: number; done: boolean; reward: { ink: number; xp: number } };
export type ChallengeChange = { id: string; text: string; before: number; after: number; target: number; done: boolean };
export type Challenges = { daily: ChallengeState[]; weekly: ChallengeState[]; dailyResetAt: number; weeklyResetAt: number; rerollAvailable: boolean };
export const DAILY_POOL: readonly Challenge[] = [
  { id: "d.kills", text: "Tag 12 explorers", stat: "kills", target: D.kills },
  { id: "d.headshots", text: "Land 4 headshots", stat: "headshots", target: D.headshots },
  { id: "d.wins", text: "Win 2 matches", stat: "won", target: D.wins },
  { id: "d.matches", text: "Finish 3 matches", stat: "matches", target: D.matches },
  { id: "d.longshots", text: "Get 2 kills from 35 m or more", stat: "longShots", target: D.longshots },
  { id: "d.dagger", text: "Get 2 dagger kills", stat: "daggerKills", target: D.dagger },
  { id: "d.assists", text: "Earn 5 assists", stat: "assists", target: D.assists },
  { id: "d.zip", text: "Get a kill from a zip line", stat: "zipKills", target: D.zip },
  { id: "d.streak", text: "Get 3 kills without being tagged", stat: "streaks3", target: D.streak },
  { id: "d.scatter", text: "Get 3 kills with Scatter arrows", stat: "scatterKills", target: D.scatter },
  { id: "d.relic", text: "Capture a relic", stat: "relicCaptures", target: D.relic },
  { id: "d.expedition", text: "Reach wave 10 in Expedition", stat: "wave10", target: 1 },
  { id: "d.expeditionBoss", text: "Fell a Colossus", stat: "colossusKills", target: 1 },
];
export const WEEKLY_POOL: readonly Challenge[] = [
  { id: "w.kills", text: "Tag 80 explorers", stat: "kills", target: W.kills },
  { id: "w.headshots", text: "Land 25 headshots", stat: "headshots", target: W.headshots },
  { id: "w.wins", text: "Win 10 matches", stat: "won", target: W.wins },
  { id: "w.longshots", text: "Get 12 kills from 35 m or more", stat: "longShots", target: W.longshots },
  { id: "w.robin", text: "Split an arrow in mid-air", stat: "robinHoods", target: W.robin },
  { id: "w.boulder", text: "Crush an enemy with the boulder", stat: "boulderKills", target: W.boulder },
  { id: "w.maps", text: "Win on all three maps", stat: "mapsWon", target: W.maps },
  { id: "w.expedition", text: "Reach wave 10 in Expedition five times", stat: "wave10", target: 5 },
  { id: "w.expeditionBoss", text: "Fell 3 Colossi", stat: "colossusKills", target: 3 },
  { id: "w.medals", text: "Earn 15 medals", stat: "medals", target: W.medals },
  { id: "w.tether", text: "Ride 10 tether lines", stat: "tetherRides", target: W.tether },
  { id: "w.wave10", text: "Reach wave 10 in Expedition", stat: "wave10", target: W.wave10 },
  { id: "w.colossus", text: "Defeat a Temple Colossus", stat: "colossusKills", target: W.colossus },
];

function calendar(date: Date): { day: number; year: number; week: number; monday: number } {
  const day = Math.floor(date.getTime() / UTC_DAY_MS);
  const midnight = new Date(day * UTC_DAY_MS);
  const weekday = midnight.getUTCDay() || DAYS_PER_WEEK;
  const thursday = new Date((day + ISO_THURSDAY - weekday) * UTC_DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / UTC_DAY_MS + 1) / DAYS_PER_WEEK);
  return { day, year, week, monday: day - weekday + 1 };
}
export function periodKeys(date: Date): { daily: string; weekly: string } {
  const { year, week } = calendar(date);
  return { daily: `d:${date.toISOString().slice(0, 10)}`, weekly: `w:${year}-W${String(week).padStart(2, "0")}` };
}
export function resetTimes(date: Date): { dailyResetAt: number; weeklyResetAt: number } {
  const { day, monday } = calendar(date);
  return { dailyResetAt: (day + 1) * UTC_DAY_MS, weeklyResetAt: (monday + DAYS_PER_WEEK) * UTC_DAY_MS };
}
/** A stable number per challenge id, mixed into the period seed. */
function idHash(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return hash >>> 0;
}

/**
 * Ranks every challenge by a draw seeded from the period and its own id, and takes the first few.
 * Adding a challenge to a pool only changes the periods where the new one ranks among them.
 */
function picks(pool: readonly Challenge[], seed: number): Challenge[] {
  const ranked = pool.map((challenge) => ({ challenge, rank: mulberry32((seed ^ idHash(challenge.id)) >>> 0)() }));
  ranked.sort((left, right) => left.rank - right.rank);
  return ranked.slice(0, CHALLENGE_COUNT).map((entry) => entry.challenge);
}
export function dailyChallenges(date: Date): Challenge[] { return picks(DAILY_POOL, calendar(date).day); }
export function weeklyChallenges(date: Date): Challenge[] { const { year, week } = calendar(date); return picks(WEEKLY_POOL, week * WEEK_SEED_MULTIPLIER + year); }
export function challengeReward(id: string): { ink: number; xp: number } { return id.startsWith("d.") ? CHALLENGE_REWARDS.daily : CHALLENGE_REWARDS.weekly; }
export function progressFrom(stats: MatchStats & { medals?: readonly string[] }, challenge: Challenge): number {
  if (challenge.stat === "matches") return 1;
  if (challenge.stat === "won" || challenge.stat === "mapsWon") return stats.won ? 1 : 0;
  if (challenge.stat === "streaks3") return stats.bestStreak >= MEDAL_LIMITS.onARoll ? 1 : 0;
  if (challenge.stat === "medals") return stats.medals?.length ?? 0;
  if (challenge.stat === "wave10") return (stats.waveReached ?? 0) >= 10 ? 1 : 0;
  return Math.max(0, Math.floor(stats[challenge.stat]));
}
