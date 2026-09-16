import { KILL_FEEDBACK as F, LONG_SHOT_M, MEDAL_LIMITS, RETENTION_XP } from "./constants.ts";

export type KillFeedback = { banner: string; ticker: string[]; streak: number; multikill: boolean; unstoppable: boolean; endedAt: number };
export class KillFeedbackTracker {
  streak = 0;
  bestStreak = 0;
  private chain = 0;
  private lastKillMs = Number.NEGATIVE_INFINITY;
  kill(event: { atMs: number; headshot: boolean; distance: number; weapon: "arrow" | "dagger" | "boulder" | "fall" }): KillFeedback {
    this.chain = event.atMs >= this.lastKillMs && event.atMs - this.lastKillMs <= F.windowMs ? this.chain + 1 : 1;
    this.lastKillMs = event.atMs; this.streak += 1; this.bestStreak = Math.max(this.bestStreak, this.streak);
    const ticker = [`+${RETENTION_XP.kill} Tagged`];
    if (event.weapon === "arrow" && event.headshot) ticker.push(`+${RETENTION_XP.headshot} Headshot`);
    if (event.weapon === "arrow" && event.distance >= LONG_SHOT_M) ticker.push(`+${RETENTION_XP.longShot} Long shot`);
    const unstoppable = this.streak === MEDAL_LIMITS.unstoppable;
    const banner = unstoppable ? "UNSTOPPABLE" : this.chain >= F.jungle ? "JUNGLE FEVER" : this.chain === F.triple ? "TRIPLE TAG" : this.chain === F.double ? "DOUBLE TAG" : this.streak === MEDAL_LIMITS.onARoll ? "ON A ROLL" : "";
    return { banner, ticker, streak: this.streak, multikill: this.chain >= F.double, unstoppable, endedAt: 0 };
  }
  death(_atMs: number): KillFeedback {
    const endedAt = this.streak; this.streak = 0; this.chain = 0; this.lastKillMs = Number.NEGATIVE_INFINITY;
    return { banner: "", ticker: [], streak: 0, multikill: false, unstoppable: false, endedAt };
  }
  reset(): void { this.streak = 0; this.bestStreak = 0; this.chain = 0; this.lastKillMs = Number.NEGATIVE_INFINITY; }
}
