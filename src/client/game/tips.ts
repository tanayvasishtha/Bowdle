import { ONBOARDING } from "../../shared/constants.ts";

export type TipId = "reel" | "vineHop" | "dodge" | "scatter" | "slide";

export const TIP_TEXT: Record<TipId, string> = {
  reel: "Hold E at a gold edge to reel in",
  vineHop: "Press Space again in the air to vine hop",
  dodge: "Left Shift dodges an arrow",
  scatter: "Press 2 for scatter arrows up close",
  slide: "Run and press C to slide",
};

const MATCHES_KEY = "bowdle.matchesStarted";

/** Counts matches started on this device; tips only run for the first few. */
export function startedMatches(): number {
  try { return Number(localStorage.getItem(MATCHES_KEY)) || 0; } catch { return 0; }
}
export function countMatchStart(): number {
  const next = startedMatches() + 1;
  try { localStorage.setItem(MATCHES_KEY, String(next)); } catch { /* storage blocked: tips stay on */ }
  return next;
}

export function tipsActive(enabled: boolean, matchesStarted: number): boolean {
  return enabled && matchesStarted <= ONBOARDING.tipMatches;
}

/**
 * Picks at most one tip per interval: a move that is available right now and has not been used for a while.
 * Each tip shows once per match.
 */
export class TipScheduler {
  private lastShownAt = Number.NEGATIVE_INFINITY;
  private readonly shown = new Set<TipId>();
  private readonly lastUsed = new Map<TipId, number>();
  private readonly startedAt: number;

  constructor(startedAt: number) { this.startedAt = startedAt; }

  used(tip: TipId, nowMs: number): void { this.lastUsed.set(tip, nowMs); }

  next(nowMs: number, available: Iterable<TipId>): TipId | null {
    if (nowMs - this.lastShownAt < ONBOARDING.tipIntervalMs) return null;
    for (const tip of available) {
      if (this.shown.has(tip)) continue;
      if (nowMs - (this.lastUsed.get(tip) ?? this.startedAt) < ONBOARDING.tipIdleMs) continue;
      this.shown.add(tip);
      this.lastShownAt = nowMs;
      return tip;
    }
    return null;
  }
}
