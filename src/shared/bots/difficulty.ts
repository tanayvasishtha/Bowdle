import { BOT_DIFFICULTY_LEVELS, NEW_PLAYER_MATCHES } from "../constants.ts";

export type BotDifficulty = "easy" | "normal" | "hard";
export type HumanSkill = { level: number; matches: number };

/** Bots match the room: new players always get easy bots, otherwise the average human level decides. */
export function botDifficultyFor(humans: readonly HumanSkill[]): BotDifficulty {
  if (humans.length === 0) return "normal";
  if (humans.some((human) => human.matches < NEW_PLAYER_MATCHES)) return "easy";
  const average = humans.reduce((sum, human) => sum + human.level, 0) / humans.length;
  if (average < BOT_DIFFICULTY_LEVELS.normal) return "easy";
  if (average < BOT_DIFFICULTY_LEVELS.hard) return "normal";
  return "hard";
}
