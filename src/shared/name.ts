import { MAX_NAME_LENGTH } from "./constants.ts";

const BLOCKED = ["admin", "moderator", "bowdle", "fuck", "shit", "nigger"] as const;

export function nameError(value: string): string {
  const name = value.trim();
  if (name.length < 1) return "Write your explorer name.";
  if (name.length > MAX_NAME_LENGTH) return `Keep it to ${MAX_NAME_LENGTH} characters.`;
  const folded = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (BLOCKED.some((word) => folded.includes(word))) return "Choose a friendlier name.";
  return "";
}
