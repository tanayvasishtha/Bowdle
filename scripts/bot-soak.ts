// Release QA: bots-only matches on every launch map with several seeds.
// Reports scores, match length and bots that stopped moving. Usage: node scripts/bot-soak.ts [seeds]
import { boot } from "@colyseus/testing";
import { server } from "../src/server/app.config.ts";
import type { TdmRoom } from "../src/server/rooms/TdmRoom.ts";
import { SUBSTEPS, TICK_HZ, TIME_LIMIT_S } from "../src/shared/constants.ts";
import { matchMaps } from "../src/shared/maps/registry.ts";

const seeds = Number(process.argv[2] ?? 3);
const STUCK_WINDOW_S = 30;
const STUCK_DISTANCE_M = 2;

const colyseus = await boot(server);
let failures = 0;

for (const map of matchMaps) {
  for (let seed = 1; seed <= seeds; seed += 1) {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Observer", testMapId: map.id, testBotSeed: seed * 101 });
    await client.waitForInitialState();
    client.onMessage("*", () => undefined);
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    room.replacePlayerWithBot(client.sessionId);
    room.state.phase = "live";
    room.state.phaseEndsAtMs = TIME_LIMIT_S * 1000;
    const context = { dt: 1 / TICK_HZ, dtMs: 1000 / TICK_HZ, tick: 0, subSteps: SUBSTEPS, subDt: 1 / (TICK_HZ * SUBSTEPS), subDtMs: 1000 / (TICK_HZ * SUBSTEPS) };
    const window = STUCK_WINDOW_S * TICK_HZ;
    const history = new Map<string, Array<{ x: number; z: number; alive: boolean }>>();
    let stuckTicks = 0;
    let tick = 0;
    const started = performance.now();
    for (; tick <= TIME_LIMIT_S * TICK_HZ && room.state.phase === "live"; tick += 1) {
      context.tick = tick;
      room.simulateTick(context, tick * context.dtMs);
      if (tick % TICK_HZ !== 0) continue;
      for (const [id, player] of room.state.players) {
        const samples = history.get(id) ?? [];
        samples.push({ x: player.x, z: player.z, alive: player.alive });
        if (samples.length > STUCK_WINDOW_S) samples.shift();
        history.set(id, samples);
        if (samples.length === STUCK_WINDOW_S && samples.every((sample) => sample.alive)) {
          const first = samples[0]!;
          if (samples.every((sample) => Math.hypot(sample.x - first.x, sample.z - first.z) < STUCK_DISTANCE_M)) stuckTicks += 1;
        }
      }
    }
    const kills = [...room.state.players.values()].reduce((sum, player) => sum + player.kills, 0);
    const minutes = tick / TICK_HZ / 60;
    const finished = (room.state.phase as string) === "end";
    const ok = finished && kills > 0 && stuckTicks <= window;
    if (!ok) failures += 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${map.id.padEnd(11)} seed ${String(seed * 101).padStart(3)}  ${room.state.scoreSun}-${room.state.scoreMoon}  kills ${String(kills).padStart(3)}  ${minutes.toFixed(1)} min  stuck bot-seconds ${stuckTicks}  (${((performance.now() - started) / 1000).toFixed(1)} s wall)`);
    await client.leave().catch(() => undefined);
    room.disconnect();
  }
}

await colyseus.shutdown();
console.log(failures === 0 ? "bot soak passed" : `bot soak failed: ${failures} match(es)`);
process.exitCode = failures === 0 ? 0 : 1;
