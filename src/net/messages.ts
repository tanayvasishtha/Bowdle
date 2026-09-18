import { z } from "zod";
import { MAX_NAME_LENGTH } from "../shared/constants.ts";

export const SetNameMessage = z.object({ name: z.string().trim().min(1).max(MAX_NAME_LENGTH).regex(/^[\x20-\x7e]+$/) });
export const KillMessage = z.object({ killer: z.string(), victim: z.string(), weapon: z.enum(["arrow", "dagger", "boulder", "fall"]), headshot: z.boolean(), distance: z.number().nonnegative() });
export const HitConfirmMessage = z.object({ target: z.string(), damage: z.number().positive(), headshot: z.boolean() });
export const DamagedMessage = z.object({ fromX: z.number(), fromZ: z.number(), damage: z.number().positive() });
export const RobinHoodMessage = z.object({ shooterA: z.string(), shooterB: z.string(), x: z.number(), y: z.number(), z: z.number() });
/** tether is set when the cut rope was a tether line, and names it. */
export const RopeCutMessage = z.object({ cutter: z.string(), owner: z.string(), x: z.number(), y: z.number(), z: z.number(), tether: z.string().optional() });
export const SwatMessage = z.object({ swatter: z.string(), shooter: z.string(), x: z.number(), y: z.number(), z: z.number() });
/** In Free for All the winner is "player" and mvp names them. */
export const MatchEndMessage = z.object({ winner: z.enum(["sun", "moon", "draw", "player"]), mvp: z.string(), playOf: z.object({ killerId: z.string(), victimId: z.string(), distance: z.number().nonnegative(), streak: z.number().int().nonnegative(), kind: z.enum(["longShot", "streak"]) }).optional() });
export const RelicMessage = z.object({ event: z.enum(["pickup", "drop", "return", "capture"]), player: z.string(), team: z.number().int() });
export const MapVoteMessage = z.object({ mapId: z.enum(["sun-temple", "canopy", "lost-river", "sky-bridges", "sunken-ruins"]) });

export type SetNameMessage = z.infer<typeof SetNameMessage>;
export type KillMessage = z.infer<typeof KillMessage>;
export type HitConfirmMessage = z.infer<typeof HitConfirmMessage>;
export type DamagedMessage = z.infer<typeof DamagedMessage>;
export type RobinHoodMessage = z.infer<typeof RobinHoodMessage>;
export type RopeCutMessage = z.infer<typeof RopeCutMessage>;
export type SwatMessage = z.infer<typeof SwatMessage>;
export type MatchEndMessage = z.infer<typeof MatchEndMessage>;
export type RelicMessage = z.infer<typeof RelicMessage>;
/** Expedition: an arrow hit a creature (to the shooter), a creature fell, a wave changed, a player went down or got up. */
export const CreatureHitMessage = z.object({ id: z.string(), damage: z.number().nonnegative(), gem: z.boolean(), blocked: z.boolean() });
export const CreatureDownMessage = z.object({ id: z.string(), kind: z.string(), killer: z.string() });
export const WaveMessage = z.object({ event: z.enum(["start", "clear", "over"]), wave: z.number().int(), modifier: z.string(), boss: z.boolean() });
export const DownedMessage = z.object({ player: z.string(), event: z.enum(["down", "revived", "out", "life"]) });
export type CreatureHitMessage = z.infer<typeof CreatureHitMessage>;
export type CreatureDownMessage = z.infer<typeof CreatureDownMessage>;
export type WaveMessage = z.infer<typeof WaveMessage>;
export type DownedMessage = z.infer<typeof DownedMessage>;
export type MapVoteMessage = z.infer<typeof MapVoteMessage>;

export const MatchStatsMessage = z.object({ stats: z.object({ kills: z.number(), deaths: z.number(), assists: z.number(), headshots: z.number(), longShots: z.number(), longestShotM: z.number(), daggerKills: z.number(), boulderKills: z.number(), zipKills: z.number(), robinHoods: z.number(), ropeCuts: z.number().default(0), swats: z.number().default(0), scatterKills: z.number().default(0), tetherRides: z.number().default(0), relicCaptures: z.number().default(0), waveReached: z.number().default(0), colossusKills: z.number().default(0), streak: z.number(), bestStreak: z.number(), won: z.boolean() }), medals: z.array(z.enum(["mvp", "unstoppable", "onARoll", "headhunter", "eagleEye", "robinHood", "upClose", "trapper", "zipline", "teamPlayer", "untouchable", "snip", "swatter", "relicRunner"])) });
export type MatchStatsMessage = z.infer<typeof MatchStatsMessage>;

export const RewardMessage = z.object({
  xp: z.number().int().nonnegative(), ink: z.number().int().nonnegative(),
  level: z.number().int().positive(), intoLevel: z.number().int().nonnegative(), levelSize: z.number().int().nonnegative(), levelUp: z.boolean(),
  breakdown: z.array(z.object({ label: z.string(), xp: z.number().nonnegative(), ink: z.number().nonnegative() })),
  before: z.object({ level: z.number().int().positive(), intoLevel: z.number().int().nonnegative(), levelSize: z.number().int().nonnegative() }),
  challenges: z.array(z.object({ id: z.string(), text: z.string(), before: z.number().nonnegative(), after: z.number().nonnegative(), target: z.number().positive(), done: z.boolean() })),
  streakDays: z.number().int().nonnegative(),
  unlocked: z.array(z.string()),
});
export type RewardMessage = z.infer<typeof RewardMessage>;

export const PingMessage = z.object({
  kind: z.enum(["enemy", "location", "relic", "anchor"]),
  x: z.number(), y: z.number(), z: z.number(),
  callout: z.enum(["enemyHere", "onMyWay", "needHelp", "grappleHere", "fallBack", "niceShot"]).optional(),
});
export const PingEventMessage = PingMessage.extend({
  from: z.string(),
  team: z.number().int(),
  atMs: z.number(),
});
export const MutePingMessage = z.object({ targetId: z.string().min(1).max(64) });
export const ReportMessage = z.object({
  targetId: z.string().min(1).max(64),
  reason: z.enum(["offensiveName", "cheating", "afk"]),
});
export const AfkPromptMessage = z.object({ secondsLeft: z.number().int().positive() });
export const AfkRemovedMessage = z.object({ reason: z.literal("afk") });
export const PlayOfTheMatchMessage = z.object({
  killerId: z.string(),
  victimId: z.string(),
  distance: z.number().nonnegative(),
  streak: z.number().int().nonnegative(),
  kind: z.enum(["longShot", "streak"]),
});
export type PingMessage = z.infer<typeof PingMessage>;
export type PingEventMessage = z.infer<typeof PingEventMessage>;
export type MutePingMessage = z.infer<typeof MutePingMessage>;
export type ReportMessage = z.infer<typeof ReportMessage>;
export type AfkPromptMessage = z.infer<typeof AfkPromptMessage>;
export type AfkRemovedMessage = z.infer<typeof AfkRemovedMessage>;
export type PlayOfTheMatchMessage = z.infer<typeof PlayOfTheMatchMessage>;

export const PickUpgradeMessage = z.object({ upgradeId: z.string().min(1).max(32) });
export type PickUpgradeMessage = z.infer<typeof PickUpgradeMessage>;
