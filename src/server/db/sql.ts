/** The small slice of SQL both PGlite (dev and tests) and postgres.js (production) provide. */
export type SqlQuery = <Row>(text: string, params?: readonly unknown[]) => Promise<Row[]>;

export type SqlClient = {
  query: SqlQuery;
  exec(text: string): Promise<void>;
  transaction<Result>(work: (query: SqlQuery) => Promise<Result>): Promise<Result>;
  close(): Promise<void>;
};

type PgValue = string | number | boolean | null | Date;

/** Opens Postgres when DATABASE_URL is set, otherwise PGlite. PGLITE_DIR persists the dev database; tests stay in memory. */
export async function openSql(env: NodeJS.ProcessEnv = process.env): Promise<SqlClient> {
  if (env.DATABASE_URL) return openPostgres(env.DATABASE_URL);
  if (env.NODE_ENV === "production" && !env.PGLITE_DIR) console.warn(JSON.stringify({ event: "databaseInMemory", message: "Set DATABASE_URL so accounts survive restarts" }));
  return openPglite(env.PGLITE_DIR);
}

async function openPglite(dataDir: string | undefined): Promise<SqlClient> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  return {
    query: async <Row>(text: string, params: readonly unknown[] = []) => (await db.query<Row>(text, [...params])).rows,
    exec: async (text) => { await db.exec(text); },
    transaction: (work) => db.transaction((tx) => work(async <Row>(text: string, params: readonly unknown[] = []) => (await tx.query<Row>(text, [...params])).rows)),
    close: () => db.close(),
  };
}

async function openPostgres(url: string): Promise<SqlClient> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 10, idle_timeout: 30, onnotice: () => undefined });
  type Unsafe = { unsafe(text: string, params?: PgValue[]): Promise<unknown> };
  const run = (target: Unsafe): SqlQuery => async <Row>(text: string, params: readonly unknown[] = []) => (await target.unsafe(text, params as PgValue[])) as Row[];
  return {
    query: run(sql),
    exec: async (text) => { await sql.unsafe(text); },
    transaction: async <Result>(work: (query: SqlQuery) => Promise<Result>) => (await sql.begin((tx) => work(run(tx as unknown as Unsafe)))) as Result,
    close: () => sql.end({ timeout: 5 }),
  };
}
