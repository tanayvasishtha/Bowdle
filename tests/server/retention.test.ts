import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, computeRetention, formatRetention, loadRetentionInput } from "../../src/server/analytics/retention.ts";
import { migrate } from "../../src/server/db/migrations.ts";
import { openSql, type SqlClient } from "../../src/server/db/sql.ts";

describe("retention report", () => {
  let sql: SqlClient;
  beforeAll(async () => {
    sql = await openSql({});
    await migrate(sql);
    const account = (id: string, day: string) => sql.query("INSERT INTO accounts (id, name, created_at) VALUES ($1, $1, $2)", [id, `${day}T10:00:00Z`]);
    const play = (id: string, day: string, match: string) => sql.query("INSERT INTO match_rewards (match_id, account_id, xp, ink, created_at) VALUES ($1, $2, 100, 10, $3)", [match, id, `${day}T12:00:00Z`]);
    // Created 2026-09-01: a returns on day 1 and day 7, b only on day 1, c never.
    await account("a", "2026-09-01"); await account("b", "2026-09-01"); await account("c", "2026-09-01");
    // Created 2026-09-14: old enough for day 1 only; d returns.
    await account("d", "2026-09-14");
    // Created today: too new for either cohort.
    await account("e", "2026-09-16");
    await play("a", "2026-09-01", "m1"); await play("a", "2026-09-01", "m2"); await play("a", "2026-09-02", "m3"); await play("a", "2026-09-08", "m4");
    await play("b", "2026-09-01", "m5"); await play("b", "2026-09-02", "m6");
    await play("c", "2026-09-01", "m7");
    await play("d", "2026-09-14", "m8"); await play("d", "2026-09-15", "m9"); await play("d", "2026-09-15", "m10");
    await sql.query("INSERT INTO account_challenges (account_id, period_key, challenge_id, progress, done) VALUES ('a', 'd:2026-09-01', 'd.kills', 12, true), ('b', 'd:2026-09-01', 'd.kills', 4, false), ('a', 'd:2026-09-01', 'd.wins', 2, true)");
  });
  afterAll(async () => { await sql.close(); });

  it("computes day 1 and day 7 return rates from eligible cohorts only", async () => {
    const report = computeRetention(await loadRetentionInput(sql), "2026-09-16");
    expect(report.day1).toEqual({ cohort: 4, returned: 3, rate: 0.75 });
    expect(report.day7).toEqual({ cohort: 3, returned: 1, rate: 1 / 3 });
  });

  it("counts signups, activity, repeat play days and challenge completion", async () => {
    const report = computeRetention(await loadRetentionInput(sql), "2026-09-16");
    expect(report.signups).toHaveLength(14);
    expect(report.signups.at(-1)).toEqual({ day: "2026-09-16", count: 1 });
    expect(report.signups.find((row) => row.day === "2026-09-14")?.count).toBe(1);
    expect(report.matchesPerActive.find((row) => row.day === "2026-09-15")).toEqual({ day: "2026-09-15", active: 1, matches: 2, perActive: 2 });
    // Play days: a(09-01: 2), a(09-02), a(09-08), b(09-01), b(09-02), c(09-01), d(09-14), d(09-15: 2) => 2 of 8.
    expect(report.multiMatchShare).toBe(0.25);
    expect(report.challengeCompletion).toEqual([
      { id: "d.kills", assigned: 2, done: 1, rate: 0.5 },
      { id: "d.wins", assigned: 1, done: 1, rate: 1 },
    ]);
    expect(formatRetention(report)).toContain("Day 1 return: 75.0 % (3 of 4)");
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
