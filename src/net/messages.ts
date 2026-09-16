import { z } from "zod";
import { MAX_NAME_LENGTH } from "../shared/constants.ts";

export const SetNameMessage = z.object({ name: z.string().trim().min(1).max(MAX_NAME_LENGTH).regex(/^[\x20-\x7e]+$/) });
export const KillMessage = z.object({ killer: z.string(), victim: z.string(), weapon: z.enum(["arrow", "dagger", "boulder"]), headshot: z.boolean(), distance: z.number().nonnegative() });
export const HitConfirmMessage = z.object({ target: z.string(), damage: z.number().positive(), headshot: z.boolean() });
export const DamagedMessage = z.object({ fromX: z.number(), fromZ: z.number(), damage: z.number().positive() });
export const RobinHoodMessage = z.object({ shooterA: z.string(), shooterB: z.string(), x: z.number(), y: z.number(), z: z.number() });
export const MatchEndMessage = z.object({ winner: z.enum(["sun", "moon", "draw"]), mvp: z.string() });
export const MapVoteMessage = z.object({ mapId: z.enum(["sun-temple", "canopy", "lost-river"]) });

export type SetNameMessage = z.infer<typeof SetNameMessage>;
export type KillMessage = z.infer<typeof KillMessage>;
export type HitConfirmMessage = z.infer<typeof HitConfirmMessage>;
export type DamagedMessage = z.infer<typeof DamagedMessage>;
export type RobinHoodMessage = z.infer<typeof RobinHoodMessage>;
export type MatchEndMessage = z.infer<typeof MatchEndMessage>;
export type MapVoteMessage = z.infer<typeof MapVoteMessage>;

export const RewardMessage = z.object({
  xp: z.number().int().nonnegative(), ink: z.number().int().nonnegative(),
  level: z.number().int().positive(), intoLevel: z.number().int().nonnegative(), levelSize: z.number().int().nonnegative(), levelUp: z.boolean(),
});
export type RewardMessage = z.infer<typeof RewardMessage>;
