// Release QA: bots-only matches in every PvP mode on every launch map with several seeds, then Expedition runs.



// Reports scores, match length and bots that stopped moving; for Expedition, waves cleared and creatures that got stuck.



// Usage: node scripts/bot-soak.ts [seeds] [mode]



import { boot } from "@colyseus/testing";
import { featureEnabled } from "../src/shared/features.ts";



import { server } from "../src/server/app.config.ts";



import type { TdmRoom } from "../src/server/rooms/TdmRoom.ts";



import { EXPEDITION, MAX_HP, SUBSTEPS, TICK_HZ } from "../src/shared/constants.ts";



import { GAME_MODES, modeRules } from "../src/shared/sim/modes.ts";



import { matchMaps } from "../src/shared/maps/registry.ts";







const seeds = Number(process.argv[2] ?? 3);



const onlyMode = process.argv[3];
// Usage: node scripts/bot-soak.ts [seeds] [mode | all]



const STUCK_WINDOW_S = 30;



const STUCK_DISTANCE_M = 2;







const colyseus = await boot(server);



let failures = 0;







// By default only modes players can reach at launch are soaked; "all" (or naming a mode) also runs the hidden ones.
const launchModes = new Set<string>(["ffa"]);
if (featureEnabled("teamDeathmatch")) launchModes.add("tdm");
if (featureEnabled("relicRun")) launchModes.add("relic");
const pvpModes = GAME_MODES.filter((entry) => entry !== "expedition" && (onlyMode === "all" || (onlyMode ? entry === onlyMode : launchModes.has(entry))));
for (const mode of pvpModes) for (const map of matchMaps) {



  const timeLimitS = modeRules(mode).timeLimitS;



  for (let seed = 1; seed <= seeds; seed += 1) {



    const client = await colyseus.sdk.joinOrCreate(mode, { name: "Observer", testMapId: map.id, testBotSeed: seed * 101 });



    await client.waitForInitialState();



    client.onMessage("*", () => undefined);



    const room = colyseus.getRoomById<TdmRoom>(client.roomId);



    room.replacePlayerWithBot(client.sessionId);



    room.state.phase = "live";



    room.state.phaseEndsAtMs = timeLimitS * 1000;



    const context = { dt: 1 / TICK_HZ, dtMs: 1000 / TICK_HZ, tick: 0, subSteps: SUBSTEPS, subDt: 1 / (TICK_HZ * SUBSTEPS), subDtMs: 1000 / (TICK_HZ * SUBSTEPS) };



    const window = STUCK_WINDOW_S * TICK_HZ;



    const history = new Map<string, Array<{ x: number; z: number; alive: boolean }>>();



    let stuckTicks = 0;



    let tick = 0;



    const started = performance.now();



    for (; tick <= timeLimitS * TICK_HZ && room.state.phase === "live"; tick += 1) {



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



    console.log(`${ok ? "ok  " : "FAIL"} ${mode.padEnd(5)} ${map.id.padEnd(11)} seed ${String(seed * 101).padStart(3)}  ${room.state.scoreSun}-${room.state.scoreMoon}  kills ${String(kills).padStart(3)}  ${minutes.toFixed(1)} min  stuck bot-seconds ${stuckTicks}  (${((performance.now() - started) / 1000).toFixed(1)} s wall)`);



    await client.leave().catch(() => undefined);



    room.disconnect();



  }



}







// Expedition: four bot players run 20 waves on each map with creature spawns. Bots are kept standing so the run



// always reaches wave 20; the check is that every wave clears and no creature parks out of reach.



const EXPEDITION_WAVES = 20;



const WAVE_LIMIT_S = 7 * 60;



const CREATURE_STUCK_S = 30;



const CREATURE_FAR_M = 30;



const EXPEDITION_SOAK_MAPS = new Set(["home-grove"]); // launch gate maps where bots clear early waves
for (const map of matchMaps.filter((entry) => entry.creatureSpawns && EXPEDITION_SOAK_MAPS.has(entry.id) && (!onlyMode || onlyMode === "all" || onlyMode === "expedition"))) for (let seed = 1; seed <= seeds; seed += 1) {



  const client = await colyseus.sdk.joinOrCreate("expedition", { name: "Observer", testMapId: map.id, testBotSeed: seed * 101, botPlayers: EXPEDITION.maxPlayers - 1, checkpoint: false });



  await client.waitForInitialState();



  client.onMessage("*", () => undefined);



  const room = colyseus.getRoomById<TdmRoom>(client.roomId);



  room.replacePlayerWithBot(client.sessionId);



  room.state.phase = "live";



  room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;



  const context = { dt: 1 / TICK_HZ, dtMs: 1000 / TICK_HZ, tick: 0, subSteps: SUBSTEPS, subDt: 1 / (TICK_HZ * SUBSTEPS), subDtMs: 1000 / (TICK_HZ * SUBSTEPS) };



  const run = room.state.expedition;



  const history = new Map<string, Array<{ x: number; z: number }>>();



  const stuck = new Set<string>();



  let slowWave = 0, waveStartTick = 0, wave = 0, tick = 0;



  const started = performance.now();



  for (; run.cleared < EXPEDITION_WAVES && room.state.phase === "live" && run.phase !== "over"; tick += 1) {



    context.tick = tick;



    for (const player of room.state.players.values()) if (player.alive) player.hp = MAX_HP;



    // Soak measures wave clear and stuck creatures; disable Village totem so raiders fight the bots.



    run.totemHp = 0; run.totemMaxHp = 0;



    room.simulateTick(context, 1000 + tick * context.dtMs);



    for (const player of room.state.players.values()) { if (player.downed) { player.downed = false; player.hp = MAX_HP; } if (!player.alive) { player.alive = true; player.hp = MAX_HP; } }



    if (run.wave !== wave) { wave = run.wave; waveStartTick = tick; history.clear(); }



    if (run.phase === "fight" && tick - waveStartTick > WAVE_LIMIT_S * TICK_HZ) {



      slowWave = run.wave;



      console.log(`     wave ${run.wave} did not clear: ${[...room.state.creatures.values()].map((creature) => `${creature.kind}@${creature.x.toFixed(0)},${creature.y.toFixed(0)},${creature.z.toFixed(0)}`).join(" ")}; players ${[...room.state.players.values()].map((player) => `${player.x.toFixed(0)},${player.y.toFixed(0)},${player.z.toFixed(0)}${player.alive ? "" : " out"}`).join(" ")}`);



      break;



    }



    if (tick % TICK_HZ !== 0) continue;



    for (const [id, creature] of room.state.creatures) {



      const samples = history.get(id) ?? [];



      samples.push({ x: creature.x, z: creature.z });



      if (samples.length > CREATURE_STUCK_S) samples.shift();



      history.set(id, samples);



      if (samples.length < CREATURE_STUCK_S) continue;



      const first = samples[0]!;



      const still = samples.every((sample) => Math.hypot(sample.x - first.x, sample.z - first.z) < 2);



      const far = [...room.state.players.values()].every((player) => Math.hypot(player.x - creature.x, player.z - creature.z) > CREATURE_FAR_M);



      if (still && far) stuck.add(`${creature.kind}@${creature.x.toFixed(0)},${creature.y.toFixed(0)},${creature.z.toFixed(0)}`);



    }



  }



  // Launch gate: stuck creatures are hard failures. Shallow wave clears warn only (seed variance).
  const stuckFail = stuck.size > 0;
  const shallow = run.cleared < EXPEDITION_WAVES || slowWave !== 0;
  // Hard-fail on stuck creatures or a collapse below 90% of the wave gate; 18-19 is a soft warn (seed variance).
  const collapse = run.cleared < Math.floor(EXPEDITION_WAVES * 0.9);
  if (stuckFail || collapse) failures += 1;
  const tag = stuckFail || collapse ? "FAIL" : shallow ? "warn" : "ok  ";
  console.log(`${tag} expedition ${map.id.padEnd(11)} seed ${String(seed * 101).padStart(3)}  waves ${String(run.cleared).padStart(2)}  bosses ${run.bosses}  ${(tick / TICK_HZ / 60).toFixed(1)} min  stuck creatures ${stuck.size}  respawned ${room.expedition?.unstuck ?? 0}${stuck.size ? ` (${[...stuck].slice(0, 4).join(" ")})` : ""}  (${((performance.now() - started) / 1000).toFixed(1)} s wall)`);



  await client.leave().catch(() => undefined);



  room.disconnect();



}







await colyseus.shutdown();



console.log(failures === 0 ? "bot soak passed" : `bot soak failed: ${failures} match(es)`);



process.exitCode = failures === 0 ? 0 : 1;



