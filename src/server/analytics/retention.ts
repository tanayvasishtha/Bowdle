import type { SqlClient } from "../db/sql.ts";

/** Days are UTC calendar days as `YYYY-MM-DD` strings. */
export type RetentionInput = {
  accounts: readonly { id: string; createdDay: string }[];
  plays: readonly { accountId: string; day: string; matches: number }[];
  challenges: readonly { challengeId: string; done: boolean }[];
};

export type RetentionReport = {
  signups: { day: string; count: number }[];
  day1: { cohort: number; returned: number; rate: number };
  day7: { cohort: number; returned: number; rate: number };
  matchesPerActive: { day: string; active: number; matches: number; perActive: number }[];
  multiMatchShare: number;
  challengeCompletion: { id: string; assigned: number; done: number; rate: number }[];
};

export const REPORT_DAYS = 14;
const DAY_MS = 86_400_000;

export function dayString(time: number): string { return new Date(time).toISOString().slice(0, 10); }
export function addDays(day: string, days: number): string { return dayString(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS); }

function returnRate(input: RetentionInput, today: string, offset: number): { cohort: number; returned: number; rate: number } {
  const playedOn = new Set(input.plays.map((play) => `${play.accountId}|${play.day}`));
  let cohort = 0, returned = 0;
  for (const account of input.accounts) {
    const target = addDays(account.createdDay, offset);
    // Only accounts old enough to have had the chance to come back count.
    if (target > today) continue;
    cohort += 1;
    if (playedOn.has(`${account.id}|${target}`)) returned += 1;
  }
  return { cohort, returned, rate: cohort === 0 ? 0 : returned / cohort };
}

export function computeRetention(input: RetentionInput, today: string): RetentionReport {
  const days = Array.from({ length: REPORT_DAYS }, (_, index) => addDays(today, index - REPORT_DAYS + 1));
  const signups = days.map((day) => ({ day, count: input.accounts.filter((account) => account.createdDay === day).length }));
  const matchesPerActive = days.map((day) => {
    const plays = input.plays.filter((play) => play.day === day);
    const matches = plays.reduce((sum, play) => sum + play.matches, 0);
    return { day, active: plays.length, matches, perActive: plays.length === 0 ? 0 : matches / plays.length };
  });
  const multiMatchShare = input.plays.length === 0 ? 0 : input.plays.filter((play) => play.matches >= 2).length / input.plays.length;
  const byChallenge = new Map<string, { assigned: number; done: number }>();
  for (const row of input.challenges) {
    const entry = byChallenge.get(row.challengeId) ?? { assigned: 0, done: 0 };
    entry.assigned += 1; if (row.done) entry.done += 1;
    byChallenge.set(row.challengeId, entry);
  }
  const challengeCompletion = [...byChallenge].map(([id, entry]) => ({ id, ...entry, rate: entry.done / entry.assigned })).sort((a, b) => a.id.localeCompare(b.id));
  return { signups, day1: returnRate(input, today, 1), day7: returnRate(input, today, 7), matchesPerActive, multiMatchShare, challengeCompletion };
}

/** A play day is a UTC day on which the account finished at least one rewarded match. */
export async function loadRetentionInput(sql: SqlClient): Promise<RetentionInput> {
  const accounts = await sql.query<{ id: string; created_day: string }>("SELECT id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS created_day FROM accounts");
  const plays = await sql.query<{ account_id: string; day: string; matches: number | string }>(
    "SELECT account_id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*) AS matches FROM match_rewards GROUP BY account_id, day",
  );
  const challenges = await sql.query<{ challenge_id: string; done: boolean }>("SELECT challenge_id, done FROM account_challenges");
  return {
    accounts: accounts.map((row) => ({ id: row.id, createdDay: row.created_day })),
    plays: plays.map((row) => ({ accountId: row.account_id, day: row.day, matches: Number(row.matches) })),
    challenges: challenges.map((row) => ({ challengeId: row.challenge_id, done: row.done })),
  };
}

const percent = (value: number): string => `${(value * 100).toFixed(1)} %`;

export function formatRetention(report: RetentionReport): string {
  const lines = ["Bowdle retention report", ""];
  lines.push(`Day 1 return: ${percent(report.day1.rate)} (${report.day1.returned} of ${report.day1.cohort})`);
  lines.push(`Day 7 return: ${percent(report.day7.rate)} (${report.day7.returned} of ${report.day7.cohort})`);
  lines.push(`Play days with 2+ matches: ${percent(report.multiMatchShare)}`, "", "Day         signups  active  matches  per active");
  for (let index = 0; index < report.signups.length; index += 1) {
    const signup = report.signups[index]!, activity = report.matchesPerActive[index]!;
    lines.push(`${signup.day}  ${String(signup.count).padStart(7)}  ${String(activity.active).padStart(6)}  ${String(activity.matches).padStart(7)}  ${activity.perActive.toFixed(2).padStart(10)}`);
  }
  lines.push("", "Challenge       assigned  done  rate");
  for (const row of report.challengeCompletion) lines.push(`${row.id.padEnd(14)}  ${String(row.assigned).padStart(8)}  ${String(row.done).padStart(4)}  ${percent(row.rate)}`);
  return lines.join("\n");
}
