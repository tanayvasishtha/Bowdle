/** Summarize matchFinished lines from a log file or stdin. No personal data. */
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";

type Row = { mode?: string; mapId?: string; region?: string; humans?: number; bots?: number; durationS?: number };

async function main(): Promise<void> {
  const path = process.argv[2];
  const input = path ? createReadStream(path, "utf8") : process.stdin;
  const lines = createInterface({ input, crlfDelay: Infinity });
  const rows: Row[] = [];
  for await (const line of lines) {
    const start = line.indexOf("{");
    if (start < 0) continue;
    try {
      const parsed = JSON.parse(line.slice(start)) as { event?: string } & Row;
      if (parsed.event === "matchFinished") rows.push(parsed);
    } catch { /* skip */ }
  }
  const byMode = new Map<string, number>();
  const byMap = new Map<string, number>();
  let duration = 0;
  let bots = 0;
  for (const row of rows) {
    byMode.set(row.mode ?? "?", (byMode.get(row.mode ?? "?") ?? 0) + 1);
    byMap.set(row.mapId ?? "?", (byMap.get(row.mapId ?? "?") ?? 0) + 1);
    duration += row.durationS ?? 0;
    bots += row.bots ?? 0;
  }
  console.log(JSON.stringify({
    matches: rows.length,
    avgDurationS: rows.length ? duration / rows.length : 0,
    avgBots: rows.length ? bots / rows.length : 0,
    byMode: Object.fromEntries(byMode),
    byMap: Object.fromEntries(byMap),
  }, null, 2));
}

void main();
