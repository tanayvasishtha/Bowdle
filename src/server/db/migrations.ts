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
