// Balance matrix: N bot matches per PvP mode x launch map (default N=20). Skips expedition.
// Prints kills by weapon and arrow kind, average TTK, headshot rate, movement verb samples,
// relic capture times. Flags weapons above 45% of kills and team win rates above 60% of seeds.
// Usage: node scripts/balance-report.ts [seeds]
import { boot } from "@colyseus/testing";
import { server } from "../src/server/app.config.ts";
import type { TdmRoom } from "../src/server/rooms/TdmRoom.ts";
import { SUBSTEPS, TICK_HZ } from "../src/shared/constants.ts";
import { matchMaps } from "../src/shared/maps/registry.ts";
import { matchWinner, modeRules } from "../src/shared/sim/modes.ts";

const seeds = Math.max(1, Number(process.argv[2] ?? 20) || 20);
const MODES = ["tdm", "ffa", "relic"] as const;

type Cell = {
  mode: string;
  mapId: string;
  seeds: number;
  sunWins: number;
  moonWins: number;
  draws: number;
  ffaTopShare: number;
  kills: number;
  byWeapon: Record<string, number>;
  byArrow: Record<string, number>;
  headshots: number;
  ttkSum: number;
  ttkCount: number;
  movement: { grapple: number; swing: number; zip: number; tether: number; samples: number; zipRides: number; tetherRides: number };
  captureCarryMs: number[];
  captureAtMs: number[];
};

function emptyCell(mode: string, mapId: string): Cell {
  return {
    mode, mapId, seeds: 0, sunWins: 0, moonWins: 0, draws: 0, ffaTopShare: 0, kills: 0,
    byWeapon: {}, byArrow: {}, headshots: 0, ttkSum: 0, ttkCount: 0,
    movement: { grapple: 0, swing: 0, zip: 0, tether: 0, samples: 0, zipRides: 0, tetherRides: 0 },
    captureCarryMs: [], captureAtMs: [],
  };
}

function bump(map: Record<string, number>, key: string, n = 1): void {
  map[key] = (map[key] ?? 0) + n;
}

const colyseus = await boot(server);
const cells: Cell[] = [];
const flags: string[] = [];
const startedAll = performance.now();

for (const mode of MODES) {
  const timeLimitS = modeRules(mode).timeLimitS;
  for (const map of matchMaps) {
    const cell = emptyCell(mode, map.id);
    for (let seed = 1; seed <= seeds; seed += 1) {
      const client = await colyseus.sdk.joinOrCreate(mode, { name: "Observer", testMapId: map.id, testBotSeed: seed * 101 });
      await client.waitForInitialState();
      client.onMessage("*", () => undefined);
      const room = colyseus.getRoomById<TdmRoom>(client.roomId);
      room.replacePlayerWithBot(client.sessionId);
      room.state.phase = "live";
      room.state.phaseEndsAtMs = timeLimitS * 1000;
      room.clearBalanceAudit();
      const context = { dt: 1 / TICK_HZ, dtMs: 1000 / TICK_HZ, tick: 0, subSteps: SUBSTEPS, subDt: 1 / (TICK_HZ * SUBSTEPS), subDtMs: 1000 / (TICK_HZ * SUBSTEPS) };
      let tick = 0;
      for (; tick <= timeLimitS * TICK_HZ && room.state.phase === "live"; tick += 1) {
        context.tick = tick;
        room.simulateTick(context, tick * context.dtMs);
      }
      cell.seeds += 1;
      for (const kill of room.auditKills) {
        cell.kills += 1;
        bump(cell.byWeapon, kill.weapon);
        if (kill.weapon === "arrow") bump(cell.byArrow, kill.arrowKind || "arrow");
        if (kill.headshot) cell.headshots += 1;
        if (kill.ttkMs > 0) { cell.ttkSum += kill.ttkMs; cell.ttkCount += 1; }
      }
      const mov = room.auditMovement;
      cell.movement.grapple += mov.grapple;
      cell.movement.swing += mov.swing;
      cell.movement.zip += mov.zip;
      cell.movement.tether += mov.tether;
      cell.movement.samples += mov.samples;
      cell.movement.zipRides += mov.zipRides;
      cell.movement.tetherRides += mov.tetherRides;
      for (const capture of room.auditCaptures) {
        cell.captureCarryMs.push(capture.carryMs);
        cell.captureAtMs.push(capture.atMs);
      }
      const winner = matchWinner(mode, room.state.scoreSun, room.state.scoreMoon);
      if (mode === "ffa") {
        let top = 0, total = 0;
        for (const player of room.state.players.values()) { total += player.kills; if (player.kills > top) top = player.kills; }
        cell.ffaTopShare += total > 0 ? top / total : 0;
      } else if (winner === "sun") cell.sunWins += 1;
      else if (winner === "moon") cell.moonWins += 1;
      else cell.draws += 1;
      await client.leave().catch(() => undefined);
      room.disconnect();
    }
    cells.push(cell);
  }
}

await colyseus.shutdown();

function pct(n: number, d: number): string {
  return d <= 0 ? "—" : `${((100 * n) / d).toFixed(1)}%`;
}

function avg(sum: number, n: number): string {
  return n <= 0 ? "—" : `${(sum / n / 1000).toFixed(2)}s`;
}

function mean(values: number[]): string {
  if (values.length === 0) return "—";
  return `${(values.reduce((a, b) => a + b, 0) / values.length / 1000).toFixed(2)}s`;
}

console.log(`\nBowdle balance report — ${seeds} seed(s) per mode×map (PvP only)\n`);

for (const cell of cells) {
  console.log(`=== ${cell.mode} / ${cell.mapId} (${cell.seeds} seeds) ===`);
  console.log(`  kills ${cell.kills}  headshot ${pct(cell.headshots, cell.kills)}  avg TTK ${avg(cell.ttkSum, cell.ttkCount)}`);
  const weapons = Object.entries(cell.byWeapon).sort((a, b) => b[1] - a[1]);
  console.log(`  weapons: ${weapons.map(([k, v]) => `${k} ${v} (${pct(v, cell.kills)})`).join(", ") || "none"}`);
  const arrows = Object.entries(cell.byArrow).sort((a, b) => b[1] - a[1]);
  if (arrows.length) console.log(`  arrow kinds: ${arrows.map(([k, v]) => `${k} ${v} (${pct(v, cell.kills)})`).join(", ")}`);
  const m = cell.movement;
  const verbTotal = m.grapple + m.swing + m.zip + m.tether || 1;
  console.log(`  movement samples/s-players: grapple ${m.grapple} (${pct(m.grapple, verbTotal)}) swing ${m.swing} (${pct(m.swing, verbTotal)}) zip ${m.zip} (${pct(m.zip, verbTotal)}) tether ${m.tether} (${pct(m.tether, verbTotal)})  (over ${m.samples} seconds)`);
  console.log(`  ride starts: zip ${m.zipRides}  tether ${m.tetherRides}`);
  if (cell.mode === "relic") {
    console.log(`  relic captures ${cell.captureCarryMs.length}  avg carry ${mean(cell.captureCarryMs)}  avg match-time ${mean(cell.captureAtMs)}`);
  }
  if (cell.mode === "ffa") {
    console.log(`  FFA kill-leader share (avg across seeds) ${pct(cell.ffaTopShare, cell.seeds)}`);
  } else {
    console.log(`  team wins sun ${cell.sunWins} moon ${cell.moonWins} draw ${cell.draws}  (sun ${pct(cell.sunWins, cell.seeds)} moon ${pct(cell.moonWins, cell.seeds)})`);
    if (cell.sunWins / cell.seeds > 0.6) flags.push(`${cell.mode}/${cell.mapId}: Sun wins ${pct(cell.sunWins, cell.seeds)} of seeds`);
    if (cell.moonWins / cell.seeds > 0.6) flags.push(`${cell.mode}/${cell.mapId}: Moon wins ${pct(cell.moonWins, cell.seeds)} of seeds`);
  }
  for (const [weapon, count] of weapons) {
    if (count / Math.max(1, cell.kills) > 0.45) flags.push(`${cell.mode}/${cell.mapId}: weapon ${weapon} is ${pct(count, cell.kills)} of kills`);
  }
  console.log("");
}

// Aggregate weapon share across all cells
const allWeapons: Record<string, number> = {};
let allKills = 0;
for (const cell of cells) {
  allKills += cell.kills;
  for (const [w, n] of Object.entries(cell.byWeapon)) bump(allWeapons, w, n);
}
console.log("=== Aggregate ===");
console.log(`  total kills ${allKills}`);
for (const [w, n] of Object.entries(allWeapons).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${w}: ${n} (${pct(n, allKills)})`);
  if (n / Math.max(1, allKills) > 0.45) flags.push(`aggregate: weapon ${w} is ${pct(n, allKills)} of kills`);
}

console.log(`\nWall time ${((performance.now() - startedAll) / 1000).toFixed(1)} s`);
if (flags.length === 0) console.log("\nNo balance flags (no weapon >45% of kills, no team >60% of seeds).");
else {
  console.log("\nFLAGS:");
  for (const flag of flags) console.log(`  ! ${flag}`);
}
