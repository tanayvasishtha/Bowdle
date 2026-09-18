import type { SqlClient } from "./sql.ts";

/** Append only. Each entry runs once, in order, inside its own transaction. */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    ink INTEGER NOT NULL DEFAULT 0,
    discord_id TEXT UNIQUE,
    google_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE account_tokens (
    secret_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE match_rewards (
    match_id TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    xp INTEGER NOT NULL,
    ink INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (match_id, account_id)
  );
  CREATE TABLE season_stats (
    season TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    kills INTEGER NOT NULL DEFAULT 0,
    matches INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (season, account_id)
  );
  CREATE INDEX season_stats_kills ON season_stats (season, kills DESC);
  `,
  `
  CREATE TABLE inventory (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    source TEXT NOT NULL,
    order_id TEXT,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, item_id)
  );
  CREATE TABLE orders (
    order_id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    sku TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE accounts ADD COLUMN loadout_bow TEXT NOT NULL DEFAULT 'bow.default';
  ALTER TABLE accounts ADD COLUMN loadout_trail TEXT NOT NULL DEFAULT 'trail.default';
  ALTER TABLE accounts ADD COLUMN loadout_outfit TEXT NOT NULL DEFAULT 'outfit.default';
  ALTER TABLE accounts ADD COLUMN loadout_effect TEXT NOT NULL DEFAULT 'effect.default'
  `,
  `
  CREATE TABLE account_challenges (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    period_key TEXT NOT NULL,
    challenge_id TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    done BOOLEAN NOT NULL DEFAULT false,
    maps TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (account_id, period_key, challenge_id)
  );
  ALTER TABLE accounts ADD COLUMN streak_days INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE accounts ADD COLUMN last_play_day TEXT NOT NULL DEFAULT '';
  ALTER TABLE accounts ADD COLUMN first_win_day TEXT NOT NULL DEFAULT '';
  ALTER TABLE accounts ADD COLUMN reroll_day TEXT NOT NULL DEFAULT ''
  `,
  `
  ALTER TABLE accounts ADD COLUMN total_matches INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE accounts ADD COLUMN total_wins INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE accounts ADD COLUMN total_kills INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE accounts ADD COLUMN total_headshots INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE accounts ADD COLUMN best_streak INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE accounts ADD COLUMN longest_shot_m DOUBLE PRECISION NOT NULL DEFAULT 0
  `,
  `
  ALTER TABLE accounts ADD COLUMN tutorial_done BOOLEAN NOT NULL DEFAULT false
  `,
  `
  CREATE TABLE expedition_runs (
    match_id TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    wave INTEGER NOT NULL,
    bosses INTEGER NOT NULL,
    week TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (match_id, account_id)
  );
  CREATE INDEX expedition_runs_week ON expedition_runs (week, wave DESC)
  `,
  `
  ALTER TABLE expedition_runs ADD COLUMN IF NOT EXISTS seed INTEGER;
  ALTER TABLE expedition_runs ADD COLUMN IF NOT EXISTS weekly BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE expedition_runs ADD COLUMN IF NOT EXISTS handicaps TEXT NOT NULL DEFAULT '[]';
  CREATE INDEX IF NOT EXISTS expedition_runs_weekly ON expedition_runs (weekly, week, wave DESC)
  `,
  `
  CREATE TABLE reports (
    id BIGSERIAL PRIMARY KEY,
    reporter_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX reports_target_reason_time ON reports (target_id, reason, created_at DESC)
  `,
  `
  CREATE TABLE ratings (
    season TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    rating DOUBLE PRECISION NOT NULL DEFAULT 1500,
    rd DOUBLE PRECISION NOT NULL DEFAULT 350,
    volatility DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    matches INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (season, account_id)
  );
  CREATE INDEX ratings_season_rating ON ratings (season, rating DESC)
  `
,
  `CREATE TABLE IF NOT EXISTS ranked_matches (
    match_id TEXT PRIMARY KEY,
    season TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS reports_reporter_target_reason ON reports (reporter_id, target_id, reason);
  `
];

export async function migrate(sql: SqlClient): Promise<number> {
  await sql.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const rows = await sql.query<{ version: number }>("SELECT version FROM schema_version");
  let version = rows[0]?.version ?? 0;
  if (rows.length === 0) await sql.query("INSERT INTO schema_version (version) VALUES (0)");
  while (version < MIGRATIONS.length) {
    const next = version + 1;
    await sql.transaction(async (query) => {
      for (const statement of MIGRATIONS[version]!.split(";").map((part) => part.trim()).filter(Boolean)) await query(statement);
      await query("UPDATE schema_version SET version = $1", [next]);
    });
    version = next;
  }
  return version;
}
