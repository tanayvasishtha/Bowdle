/** Ping kinds and callouts for the G11 team marker system. */

export const PING_KINDS = ["enemy", "location", "relic", "anchor"] as const;
export type PingKind = (typeof PING_KINDS)[number];

export const CALLOUTS = [
  "enemyHere",
  "onMyWay",
  "needHelp",
  "grappleHere",
  "fallBack",
  "niceShot",
] as const;
export type CalloutId = (typeof CALLOUTS)[number];

export const CALLOUT_LABELS: Record<CalloutId, string> = {
  enemyHere: "Enemy here",
  onMyWay: "On my way",
  needHelp: "Need help",
  grappleHere: "Grapple here",
  fallBack: "Fall back",
  niceShot: "Nice shot",
};

export const PING_DURATION_MS = 6000;
export const PING_RATE_LIMIT = 3;
export const PING_RATE_WINDOW_MS = 5000;
export const AFK_PROMPT_MS = 60_000;
export const AFK_REMOVE_MS = 90_000;
export const PLAY_OF_MATCH_MS = 6000;
export const OFFENSIVE_NAME_REPORTS = 3;
export const OFFENSIVE_NAME_WINDOW_MS = 24 * 60 * 60 * 1000;

export type PingTarget = {
  kind: PingKind;
  x: number;
  y: number;
  z: number;
  label?: string;
};

/** Pick a ping kind from what sits under the aim point. */
export function classifyPing(hit: {
  enemy?: boolean;
  relic?: boolean;
  anchor?: boolean;
} | undefined): PingKind {
  if (!hit) return "location";
  if (hit.enemy) return "enemy";
  if (hit.relic) return "relic";
  if (hit.anchor) return "anchor";
  return "location";
}

/** Sliding window: true when another ping is allowed. */
export function allowPing(timestamps: number[], nowMs: number, limit = PING_RATE_LIMIT, windowMs = PING_RATE_WINDOW_MS): boolean {
  while (timestamps.length > 0 && timestamps[0]! <= nowMs - windowMs) timestamps.shift();
  if (timestamps.length >= limit) return false;
  timestamps.push(nowMs);
  return true;
}

export function explorerName(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  const digits = Math.abs(hash % 10000).toString().padStart(4, "0");
  return `Explorer${digits}`;
}
