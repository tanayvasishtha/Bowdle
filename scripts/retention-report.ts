// Prints day 1 and day 7 return rates, activity and challenge completion from the game database.
// Reads DATABASE_URL (Postgres) or PGLITE_DIR (a dev PGlite folder). Usage: npm run retention
import { computeRetention, dayString, formatRetention, loadRetentionInput } from "../src/server/analytics/retention.ts";
import { migrate } from "../src/server/db/migrations.ts";
import { openSql } from "../src/server/db/sql.ts";

if (!process.env.DATABASE_URL && !process.env.PGLITE_DIR) {
  console.error("Set DATABASE_URL or PGLITE_DIR to the database to report on.");
  process.exit(1);
}

const sql = await openSql();
try {
  await migrate(sql);
  console.log(formatRetention(computeRetention(await loadRetentionInput(sql), dayString(Date.now()))));
} finally {
  await sql.close();
}
