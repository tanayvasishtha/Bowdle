import { Room, ServerError, type Client, type Rewind, type StepContext as RoomStepContext } from "@colyseus/core";
import {
  ARROW_LIFETIME_MS,
  ARROW_MAX_PER_PLAYER,
  ARROW_RADIUS,
  ASSIST_MIN_DAMAGE,
  ASSIST_WINDOW_MS,
  HEAD_MULT,
  INK_CLOUD_GRAVITY,
  INK_CLOUD_MS,
  INK_CLOUD_RADIUS,
  MAX_NAME_LENGTH,
  MAX_HP,
  MAX_REWIND_MS,
  BOULDER_RADIUS,
  PLAYER_WIDTH,
  RESPAWN_MS,
  RECONNECT_WINDOW_S,
  STAND_HEIGHT,
  SUBSTEPS,
  TEAM_SIZE,
  TEAM_COUNT,
  TEST_DUEL_HALF_DISTANCE,
  TEST_DUEL_LANE_Z,
  TICK_HZ,
  WARMUP_MS,
  USE_DIST,
} from "../../shared/constants.ts";
import { BTN, type PlayerInputFrame } from "../../shared/input.ts";
import { kitMap } from "../../shared/maps/fixtures/kit.ts";
import type { MapData } from "../../shared/maps/types.ts";
import { defaultMatchMap, mapById, matchMaps, nextMatchMap } from "../../shared/maps/registry.ts";
import { PITCH_LIMIT } from "../../shared/math/angles.ts";
import { ArrowState, BoulderHazardState, InkCloudState, MatchState, PlayerInput, PlayerState } from "../../net/schema.ts";
import { MapVoteMessage, SetNameMessage, type DamagedMessage, type HitConfirmMessage, type KillMessage, type MatchEndMessage, type RewardMessage, type RobinHoodMessage } from "../../net/messages.ts";
import { gameDatabase, type MatchResultLine } from "../db/GameDatabase.ts";
import { DEFAULT_LOADOUT } from "../../shared/cosmetics.ts";
import { botDifficultyFor, type BotDifficulty, type HumanSkill } from "../../shared/bots/difficulty.ts";
import { isPartyCode } from "../../shared/party.ts";
import { spawnArrow, stepArrow, sweepArrowVsTarget } from "../../shared/sim/arrows.ts";
import { applyDamage, stepRegen } from "../../shared/sim/health.ts";
import { chooseSpawn, respawnPlayer, scoreKill, updateMatchPhase } from "../../shared/sim/match.ts";
import { meleeHit } from "../../shared/sim/melee.ts";
import { stepPlayer } from "../../shared/sim/movement.ts";
import { segmentDistance } from "../../shared/math/segments.ts";
import { BotController } from "../bots/BotController.ts";
import { spawnAbilityProjectile, type GrappleEvent, type InkEvent } from "../../shared/sim/abilities.ts";
import { resetBoulderHazard, segmentHitsBoulder, stepBoulderHazard, triggerBoulder } from "../../shared/sim/hazards.ts";
import { nameError } from "../../shared/name.ts";
import { serverMetrics } from "../metrics.ts";
import { createMatchStats, recordDeath, recordKill, recordRobinHood, type MatchStats } from "../../shared/matchStats.ts";
import { medalsFor } from "../../shared/medals.ts";
import type { MatchStatsMessage } from "../../net/messages.ts";

export const PARTY_ROOM = "party";

type JoinOptions = { name?: string; token?: string; party?: string; test?: boolean; mapId?: string; testMapId?: string; testBotSeed?: number };
type ServerMessages = { kill: KillMessage; hitConfirm: HitConfirmMessage; damaged: DamagedMessage; matchEnd: MatchEndMessage; robinHood: RobinHoodMessage; rewards: RewardMessage; matchStats: MatchStatsMessage };
type GameClient = Client<{ messages: ServerMessages }>;
type DamageRecord = { attacker: string; damage: number; atMs: number };
type ArrowOrigin = { x: number; z: number };

export class TdmRoom extends Room<{ state: MatchState; input: PlayerInput; client: GameClient }> {
  maxClients = TEAM_SIZE * 2;
  maxMessagesPerSecond = TICK_HZ;
  state = new MatchState();
  private map: MapData = defaultMatchMap;
  private fixedMap = false;
  inputs = this.defineInput(PlayerInput, {
    bufferMaxSize: 32,
    sanitize: { moveX: [-1, 1], moveZ: [-1, 1], pitch: [-PITCH_LIMIT, PITCH_LIMIT] },
    idle: ({ latest }) => latest ?? true,
  });
  private readonly pending = new Map<string, Iterable<PlayerInputFrame>>();
  private readonly damage = new Map<string, Map<string, DamageRecord>>();
  private readonly arrowOrigins = new Map<string, ArrowOrigin>();
  private readonly removeArrows: string[] = [];
  private readonly arrowFrom = { x: 0, y: 0, z: 0 };
  private readonly arrowTo = { x: 0, y: 0, z: 0 };
  private readonly hitTarget = { x: 0, y: 0, z: 0, height: STAND_HEIGHT, crouched: false };
  private readonly clashA0 = { x: 0, y: 0, z: 0 }; private readonly clashA1 = { x: 0, y: 0, z: 0 };
  private readonly clashB0 = { x: 0, y: 0, z: 0 }; private readonly clashB1 = { x: 0, y: 0, z: 0 };
  readonly xpEvents: Array<{ type: "robinHood"; player: string }> = [];
  zipRideCount = 0;
  private rewindState!: Rewind;
  private arrowSerial = 0;
  private cloudSerial = 0;
  private botSerial = 0;
  private simulationNowMs = 0;
  private matchLiveAtMs = WARMUP_MS;
  private testMode = false;
  private readonly bots = new Map<string, BotController>();
  private readonly mapVotes = new Map<string, string>();
  private reportedPlayers = 0;
  private botSeedBase = 0;
  private readonly accounts = new Map<string, Promise<string | undefined>>();
  private readonly skills = new Map<string, HumanSkill>();
  private botDifficulty: BotDifficulty = "normal";
  partyCode = "";
  private readonly humanStats = new Map<string, MatchStats>();
  private readonly killStatsEvent: Parameters<typeof recordKill>[1] = { weapon: "arrow", headshot: false, distance: 0, onZip: false };
  private matchSerial = 0;
  private rewardedSerial = -1;
  rewardsSettled: Promise<void> = Promise.resolve();
  loadoutsApplied: Promise<void> = Promise.resolve();
  skillsLoaded: Promise<void> = Promise.resolve();

  onCreate(options: JoinOptions): void {
    this.partyCode = isPartyCode(options.party) ? options.party : "";
    this.botSeedBase = Number.isFinite(options.testBotSeed) ? options.testBotSeed! : 0;
    const selected = options.mapId === kitMap.id ? kitMap : options.testMapId ? mapById(options.testMapId) : undefined;
    this.fixedMap = selected !== undefined;
    this.loadMap(selected ?? defaultMatchMap, 0);
    this.state.phase = "warmup";
    this.state.phaseEndsAtMs = WARMUP_MS;
    this.rewindState = this.allowRewindState({ maxRewindMs: MAX_REWIND_MS });
    this.rewindState.attachAll(this.state.players, { fields: ["x", "y", "z", "height", "yaw"], mode: "snapshot" });
    this.fillBots();
    this.reportedPlayers = this.state.players.size; serverMetrics.roomOpened(this.reportedPlayers);
    this.onMessage("setName", SetNameMessage, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (player && !nameError(message.name)) player.name = message.name;
    });
    this.onMessage("mapVote", MapVoteMessage, (client, message) => this.voteMap(client.sessionId, message.mapId));
    this.setFixedTimestep((context) => this.simulateTick(context, this.clock.elapsedTime), TICK_HZ, { subSteps: SUBSTEPS });
  }

  simulateTick(context: RoomStepContext, nowMs: number): void {
    const tickStarted = performance.now();
    try {
    this.simulationNowMs = nowMs;
    this.pending.clear();
    for (const [sessionId, player] of this.state.players) if (!player.isBot) this.pending.set(sessionId, this.inputs.get(sessionId));
    if (this.state.phase !== "live") {
      for (const frames of this.pending.values()) for (const _frame of frames) { /* consume during warmup */ }
      const changed = updateMatchPhase(this.state, nowMs);
      if (changed === "restart") this.resetPlayers();
      return;
    }
    if (updateMatchPhase(this.state, nowMs) === "end") this.sendMatchEnd();
    if (this.state.phase !== "live") return;
    for (const [sessionId, frames] of this.pending) {
      const player = this.state.players.get(sessionId);
      if (!player) continue;
      for (const frame of frames) {
        if (!player.alive) continue;
        player.spawnProtectMs = Math.max(0, player.spawnProtectMs - context.dtMs);
        this.tryLever(sessionId, player, frame, nowMs);
        const beforeZip = player.zipId; this.applyEvents(sessionId, player, stepPlayer(player, frame, this.map, { nowMs })); if (!beforeZip && player.zipId) this.zipRideCount += 1;
      }
    }
    for (const [id, controller] of this.bots) {
      const player = this.state.players.get(id); if (!player?.alive) continue;
      player.spawnProtectMs = Math.max(0, player.spawnProtectMs - context.dtMs);
      const frame = controller.update(player, this.state.players, this.map, nowMs, this.state.inkClouds.values(), this.state.hazards);
      const beforeZip = player.zipId; this.applyEvents(id, player, stepPlayer(player, frame, this.map, { nowMs })); if (!beforeZip && player.zipId) this.zipRideCount += 1;
    }
    this.updateHazards(nowMs, context.dt);
    this.stepArrows(context);
    for (const [id, cloud] of this.state.inkClouds) if (cloud.expiresAtMs <= nowMs) this.state.inkClouds.delete(id);
    for (const player of this.state.players.values()) {
      if (player.alive) stepRegen(player, nowMs, context.dt);
      else if (nowMs >= player.respawnAtMs) respawnPlayer(player, chooseSpawn(this.map, player.team, this.state.players.values(), player));
    }
    } finally { serverMetrics.tick(performance.now() - tickStarted); }
  }

  private applyEvents(sessionId: string, player: PlayerState, events: ReturnType<typeof stepPlayer>): void {
    for (const event of events) {
      player.spawnProtectMs = 0;
      if (event.type === "fire") this.createArrow(sessionId, player.team, event);
      else if (event.type === "melee") this.resolveMelee(sessionId, event.x, event.y, event.z, event.yaw);
      else this.createAbilityArrow(sessionId, player.team, player.crouched, event);
    }
  }

  private createAbilityArrow(owner: string, team: number, crouched: boolean, event: GrappleEvent | InkEvent): void {
    const sim = spawnAbilityProjectile(event, crouched);
    const arrow = new ArrowState(); Object.assign(arrow, sim);
    arrow.prevX = arrow.x; arrow.prevY = arrow.y; arrow.prevZ = arrow.z;
    arrow.owner = owner; arrow.team = team; arrow.bornMs = this.simulationNowMs; arrow.kind = event.type;
    this.state.arrows.set(`${owner}-${this.arrowSerial += 1}`, arrow);
  }

  private createArrow(owner: string, team: number, event: Parameters<typeof spawnArrow>[0]): void {
    const sim = spawnArrow(event, this.state.players.get(owner)?.crouched);
    const arrow = new ArrowState(); Object.assign(arrow, sim);
    arrow.prevX = arrow.x; arrow.prevY = arrow.y; arrow.prevZ = arrow.z;
    arrow.owner = owner; arrow.team = team; arrow.bornMs = this.simulationNowMs;
    const id = `${owner}-${this.arrowSerial += 1}`;
    this.state.arrows.set(id, arrow); this.arrowOrigins.set(id, { x: event.x, z: event.z });
    let owned = 0;
    for (const [arrowId, other] of this.state.arrows) if (other.owner === owner && ++owned > ARROW_MAX_PER_PLAYER) this.deleteArrow(arrowId);
  }

  private stepArrows(context: RoomStepContext): void {
    this.removeArrows.length = 0;
    for (let substep = 0; substep < context.subSteps; substep += 1) {
      for (const [id, arrow] of this.state.arrows) {
        const fromX = arrow.x, fromY = arrow.y, fromZ = arrow.z;
        arrow.prevX = fromX; arrow.prevY = fromY; arrow.prevZ = fromZ;
        const gravity = arrow.kind === "grapple" ? 0 : arrow.kind === "ink" ? INK_CLOUD_GRAVITY : undefined;
        const world = stepArrow(arrow, this.map, context.subDt, gravity, this.simulationNowMs);
        let boulderBlocked = false;
        for (const hazard of this.state.hazards.values()) if (hazard.phase === "roll" && segmentHitsBoulder(fromX, fromY, fromZ, arrow.x, arrow.y, arrow.z, hazard, BOULDER_RADIUS + ARROW_RADIUS)) { boulderBlocked = true; break; }
        let targetId = "", headshot = false, earliest = Number.POSITIVE_INFINITY;
        if (arrow.kind === "arrow" && !boulderBlocked) {
          const seen = this.rewindState.lastSeenBy(arrow.owner);
          for (const [candidateId, target] of this.state.players) {
            if (candidateId === arrow.owner || target.team === arrow.team || !target.alive || target.spawnProtectMs > 0) continue;
            this.arrowFrom.x = fromX; this.arrowFrom.y = fromY; this.arrowFrom.z = fromZ;
            this.arrowTo.x = arrow.x; this.arrowTo.y = arrow.y; this.arrowTo.z = arrow.z;
            this.hitTarget.x = seen.value(target, "x"); this.hitTarget.y = seen.value(target, "y"); this.hitTarget.z = seen.value(target, "z");
            this.hitTarget.height = seen.value(target, "height"); this.hitTarget.crouched = this.hitTarget.height < STAND_HEIGHT;
            const hit = sweepArrowVsTarget(this.arrowFrom, this.arrowTo, this.hitTarget);
            if (hit && hit.t < earliest) { earliest = hit.t; targetId = candidateId; headshot = hit.kind === "head"; }
          }
        }
        if (targetId) {
          this.dealDamage(arrow.owner, targetId, arrow.damage * (headshot ? HEAD_MULT : 1), "arrow", headshot, fromX, fromZ, this.arrowOrigins.get(id));
          this.removeArrows.push(id);
        } else if (world.worldHit || boulderBlocked || this.simulationNowMs - arrow.bornMs >= ARROW_LIFETIME_MS) {
          if (world.worldHit && arrow.kind === "ink") this.createInkCloud(arrow.x, arrow.y, arrow.z);
          this.removeArrows.push(id);
        }
      }
      for (const id of this.removeArrows) this.deleteArrow(id);
      this.removeArrows.length = 0;
      this.resolveArrowClashes();
    }
  }

  private resolveArrowClashes(): void {
    for (const [idA, arrowA] of this.state.arrows) for (const [idB, arrowB] of this.state.arrows) {
      if (idA >= idB || arrowA.kind !== "arrow" || arrowB.kind !== "arrow" || arrowA.team === arrowB.team || this.removeArrows.includes(idA) || this.removeArrows.includes(idB)) continue;
      this.clashA0.x = arrowA.prevX; this.clashA0.y = arrowA.prevY; this.clashA0.z = arrowA.prevZ; this.clashA1.x = arrowA.x; this.clashA1.y = arrowA.y; this.clashA1.z = arrowA.z;
      this.clashB0.x = arrowB.prevX; this.clashB0.y = arrowB.prevY; this.clashB0.z = arrowB.prevZ; this.clashB1.x = arrowB.x; this.clashB1.y = arrowB.y; this.clashB1.z = arrowB.z;
      if (segmentDistance(this.clashA0, this.clashA1, this.clashB0, this.clashB1) >= ARROW_RADIUS * 2) continue;
      this.removeArrows.push(idA, idB); this.xpEvents.push({ type: "robinHood", player: arrowA.owner }, { type: "robinHood", player: arrowB.owner });
      const firstStats = this.humanStats.get(arrowA.owner), secondStats = this.humanStats.get(arrowB.owner); if (firstStats) recordRobinHood(firstStats); if (secondStats) recordRobinHood(secondStats);
      this.broadcast("robinHood", { shooterA: arrowA.owner, shooterB: arrowB.owner, x: (arrowA.x + arrowB.x) / 2, y: (arrowA.y + arrowB.y) / 2, z: (arrowA.z + arrowB.z) / 2 });
    }
    for (const id of this.removeArrows) this.deleteArrow(id); this.removeArrows.length = 0;
  }

  private createInkCloud(x: number, y: number, z: number): void {
    const cloud = new InkCloudState(); cloud.x = x; cloud.y = y; cloud.z = z; cloud.radius = INK_CLOUD_RADIUS; cloud.expiresAtMs = this.simulationNowMs + INK_CLOUD_MS;
    this.state.inkClouds.set(`cloud-${this.cloudSerial += 1}`, cloud);
  }

  private resolveMelee(attackerId: string, x: number, y: number, z: number, yaw: number): void {
    const attacker = this.state.players.get(attackerId); if (!attacker) return;
    const seen = this.rewindState.lastSeenBy(attackerId);
    for (const [targetId, target] of this.state.players) {
      if (targetId === attackerId || target.team === attacker.team || !target.alive || target.spawnProtectMs > 0) continue;
      const hit = meleeHit({ x, y, z, yaw }, { x: seen.value(target, "x"), y: seen.value(target, "y"), z: seen.value(target, "z"), yaw: seen.value(target, "yaw") });
      if (hit) { this.dealDamage(attackerId, targetId, hit.damage, "dagger", false, x, z); return; }
    }
  }

  private dealDamage(attackerId: string, targetId: string, damage: number, weapon: "arrow" | "dagger" | "boulder", headshot: boolean, fromX: number, fromZ: number, origin?: ArrowOrigin): void {
    const attacker = this.state.players.get(attackerId), target = this.state.players.get(targetId);
    if (!attacker || !target || attacker.team === target.team || target.spawnProtectMs > 0) return;
    const actual = Math.min(target.hp, damage);
    let ledger = this.damage.get(targetId); if (!ledger) { ledger = new Map(); this.damage.set(targetId, ledger); }
    ledger.set(attackerId, { attacker: attackerId, damage: (ledger.get(attackerId)?.damage ?? 0) + actual, atMs: this.simulationNowMs });
    const killed = applyDamage(target, damage, this.simulationNowMs);
    this.clientById(attackerId)?.send("hitConfirm", { target: targetId, damage: actual, headshot });
    this.clientById(targetId)?.send("damaged", { fromX, fromZ, damage: actual });
    if (!killed) return;
    target.deaths += 1; target.respawnAtMs = this.simulationNowMs + RESPAWN_MS; attacker.kills += 1;
    for (const record of ledger.values()) if (record.attacker !== attackerId && record.damage >= ASSIST_MIN_DAMAGE && this.simulationNowMs - record.atMs <= ASSIST_WINDOW_MS) this.state.players.get(record.attacker)!.assists += 1;
    this.damage.delete(targetId);
    const distance = origin ? Math.hypot(target.x - origin.x, target.z - origin.z) : Math.hypot(target.x - attacker.x, target.z - attacker.z);
    const attackerStats = this.humanStats.get(attackerId), victimStats = this.humanStats.get(targetId);
    if (attackerStats) {
      this.killStatsEvent.weapon = weapon; this.killStatsEvent.headshot = headshot;
      this.killStatsEvent.distance = distance; this.killStatsEvent.onZip = attacker.zipId !== "";
      recordKill(attackerStats, this.killStatsEvent);
    }
    if (victimStats) recordDeath(victimStats);
    this.broadcast("kill", { killer: attackerId, victim: targetId, weapon, headshot, distance });
    if (scoreKill(this.state, attacker.team, this.simulationNowMs)) this.sendMatchEnd();
  }

  private clientById(sessionId: string): GameClient | undefined { return this.clients.find((client) => client.sessionId === sessionId); }
  private deleteArrow(id: string): void { this.state.arrows.delete(id); this.arrowOrigins.delete(id); }
  private sendMatchEnd(): void {
    const winner = this.state.scoreSun === this.state.scoreMoon ? "draw" : this.state.scoreSun > this.state.scoreMoon ? "sun" : "moon";
    let mvp = "", kills = -1; for (const [id, player] of this.state.players) if (player.kills > kills) { kills = player.kills; mvp = id; }
    if (this.rewardedSerial === this.matchSerial) return;
    this.rewardedSerial = this.matchSerial;
    this.broadcast("matchEnd", { winner, mvp });
    let humans = 0; for (const [id, player] of this.state.players) { const stats = this.humanStats.get(id); if (!stats || player.isBot) continue; humans += 1; stats.kills = player.kills; stats.deaths = player.deaths; stats.assists = player.assists; stats.won = winner !== "draw" && player.team === (winner === "sun" ? 0 : 1); this.clientById(id)?.send("matchStats", { stats: { ...stats }, medals: medalsFor(stats, kills) }); }
    console.log(JSON.stringify({ event: "matchFinished", mapId: this.map.id, humans, bots: this.state.players.size - humans, durationS: Math.max(0, (this.simulationNowMs - this.matchLiveAtMs) / 1000), scoreSun: this.state.scoreSun, scoreMoon: this.state.scoreMoon }));
    this.rewardsSettled = this.grantRewards(`${this.roomId}:${this.matchSerial}`, winner).catch((error: unknown) => {
      console.error(JSON.stringify({ event: "rewardError", roomId: this.roomId, message: error instanceof Error ? error.message : String(error) }));
    });
  }

  /** Signed-in players still in the room get XP and Ink once per match. Guests and bots get nothing stored. */
  private async grantRewards(matchId: string, winner: "sun" | "moon" | "draw"): Promise<void> {
    const lines: MatchResultLine[] = [];
    const sessionsByAccount = new Map<string, string>();
    // Copy the scoreboard before any await: the next match resets it.
    const snapshot = [...this.accounts].flatMap(([sessionId, pending]) => {
      const player = this.state.players.get(sessionId);
      const stats = this.humanStats.get(sessionId); let bestKills = 0; for (const other of this.state.players.values()) bestKills = Math.max(bestKills, other.kills);
      return player && !player.isBot && stats ? [{ sessionId, pending, mapId: this.map.id, stats: { ...stats }, medals: medalsFor(stats, bestKills), kills: player.kills, assists: player.assists, won: winner !== "draw" && player.team === (winner === "sun" ? 0 : 1) }] : [];
    });
    for (const entry of snapshot) {
      const accountId = await entry.pending;
      if (!accountId || sessionsByAccount.has(accountId)) continue;
      sessionsByAccount.set(accountId, entry.sessionId);
      lines.push({ accountId, kills: entry.kills, assists: entry.assists, won: entry.won, stats: entry.stats, medals: entry.medals, mapId: entry.mapId });
    }
    if (lines.length === 0) return;
    const granted = await (await gameDatabase()).recordMatch(matchId, lines);
    for (const reward of granted) {
      const sessionId = sessionsByAccount.get(reward.accountId)!;
      this.clientById(sessionId)?.send("rewards", { xp: reward.xp, ink: reward.ink, breakdown: reward.breakdown, before: reward.before, challenges: reward.challenges, streakDays: reward.streakDays, unlocked: reward.unlocked, level: reward.after.level, intoLevel: reward.after.intoLevel, levelSize: reward.after.levelSize, levelUp: reward.after.level > reward.before.level });
    }
  }
  private resetPlayers(): void {
    this.matchSerial += 1;
    this.matchLiveAtMs = this.simulationNowMs + WARMUP_MS;
    for (const id of this.humanStats.keys()) this.humanStats.set(id, createMatchStats());
    this.state.arrows.clear(); this.state.inkClouds.clear(); this.arrowOrigins.clear(); this.damage.clear();
    if (!this.fixedMap) this.loadMap(this.votedMap(), this.simulationNowMs);
    else for (const hazard of this.state.hazards.values()) resetBoulderHazard(hazard, this.simulationNowMs);
    for (const player of this.state.players.values()) { player.kills = 0; player.deaths = 0; player.assists = 0; respawnPlayer(player, chooseSpawn(this.map, player.team, this.state.players.values(), player)); player.spawnProtectMs = 0; }
    this.mapVotes.clear();
  }

  private votedMap(): MapData {
    const rotation = nextMatchMap(this.map.id); let winner = rotation.id, high = 0, tied = false;
    for (const candidate of matchMaps) {
      let count = 0; for (const vote of this.mapVotes.values()) if (vote === candidate.id) count += 1;
      if (count > high) { high = count; winner = candidate.id; tied = false; } else if (count === high && count > 0) tied = true;
    }
    return tied || high === 0 ? rotation : mapById(winner) ?? rotation;
  }

  voteMap(sessionId: string, mapId: string): void { if (this.state.phase === "end" && mapById(mapId)) this.mapVotes.set(sessionId, mapId); }

  private loadMap(map: MapData, nowMs: number): void {
    this.map = map;
    this.state.mapId = map.id;
    this.state.hazards.clear();
    for (const boulder of map.boulders) {
      const hazard = new BoulderHazardState(); resetBoulderHazard(hazard, nowMs);
      const start = boulder.path[0]!; hazard.x = start[0]; hazard.y = start[1]; hazard.z = start[2]; this.state.hazards.set(boulder.id, hazard);
    }
  }

  private tryLever(sessionId: string, player: PlayerState, frame: PlayerInputFrame, nowMs: number): void {
    if ((frame.buttons & BTN.USE) === 0 || (player.prevButtons & BTN.USE) !== 0) return;
    this.useLever(sessionId, nowMs);
  }

  useLever(sessionId: string, nowMs: number): boolean {
    const player = this.state.players.get(sessionId); if (!player) return false;
    for (const boulder of this.map.boulders) {
      if (Math.hypot(player.x - boulder.lever[0], player.y - boulder.lever[1], player.z - boulder.lever[2]) > USE_DIST) continue;
      const hazard = this.state.hazards.get(boulder.id); if (hazard && triggerBoulder(hazard, sessionId, nowMs)) return true;
    }
    return false;
  }

  updateHazards(nowMs: number, dt: number): void {
    for (const boulder of this.map.boulders) {
      const hazard = this.state.hazards.get(boulder.id); if (!hazard) continue;
      stepBoulderHazard(hazard, boulder, nowMs, dt);
      if (hazard.phase !== "roll") continue;
      for (const [targetId, target] of this.state.players) {
        if (!target.alive || Math.hypot(target.x - hazard.x, target.z - hazard.z) > BOULDER_RADIUS + PLAYER_WIDTH / 2 || hazard.y + BOULDER_RADIUS < target.y || hazard.y - BOULDER_RADIUS > target.y + target.height) continue;
        if (hazard.puller && this.state.players.has(hazard.puller)) this.dealDamage(hazard.puller, targetId, MAX_HP, "boulder", false, hazard.x, hazard.z);
        else this.killByWildBoulder(targetId, hazard.x, hazard.z);
      }
    }
  }

  private killByWildBoulder(targetId: string, fromX: number, fromZ: number): void {
    const target = this.state.players.get(targetId); if (!target || !applyDamage(target, MAX_HP, this.simulationNowMs)) return;
    target.deaths += 1; target.respawnAtMs = this.simulationNowMs + RESPAWN_MS;
    const stats = this.humanStats.get(targetId); if (stats) recordDeath(stats);
    this.broadcast("kill", { killer: "Jungle", victim: targetId, weapon: "boulder", headshot: false, distance: Math.hypot(target.x - fromX, target.z - fromZ) });
  }


  private addBot(team: number, source?: PlayerState): void {
    const id = `bot-${this.botSerial += 1}`; const spawn = chooseSpawn(this.map, team, this.state.players.values());
    const player = source ?? new PlayerState(); player.name = `Doodle ${this.botSerial}`; player.team = team; player.isBot = true;
    if (!source) respawnPlayer(player, spawn);
    else { player.bowSkin = DEFAULT_LOADOUT.bow; player.arrowTrail = DEFAULT_LOADOUT.trail; player.outfit = DEFAULT_LOADOUT.outfit; player.killEffect = DEFAULT_LOADOUT.effect; }
    this.state.players.set(id, player); this.bots.set(id, new BotController(id, this.botSeedBase + this.botSerial, this.botDifficulty));
  }

  private fillBots(): void {
    for (let team = 0; team < TEAM_COUNT; team += 1) {
      let count = 0; for (const player of this.state.players.values()) if (player.team === team) count += 1;
      while (count < TEAM_SIZE) { this.addBot(team); count += 1; }
    }
  }

  addStationaryPlayer(id: string, team: number, x: number, y: number, z: number): PlayerState {
    const player = new PlayerState(); player.name = id; player.team = team; player.isBot = true; player.x = x; player.y = y; player.z = z; this.state.players.set(id, player); return player;
  }

  replacePlayerWithBot(id: string): void {
    const player = this.state.players.get(id); if (!player || player.isBot) return;
    this.humanStats.delete(id); this.skills.delete(id); this.state.players.delete(id); this.updateBotDifficulty(); this.addBot(player.team, player);
  }

  /** Cosmetics come from the database, never from the client, so nobody can wear an item they do not own. */
  private async applyLoadout(sessionId: string, account: Promise<string | undefined>): Promise<void> {
    try {
      const accountId = await account;
      if (!accountId) return;
      const loadout = await (await gameDatabase()).loadout(accountId);
      const player = this.state.players.get(sessionId);
      if (!player || player.isBot) return;
      player.bowSkin = loadout.bow; player.arrowTrail = loadout.trail; player.outfit = loadout.outfit; player.killEffect = loadout.effect;
    } catch (error) {
      console.error(JSON.stringify({ event: "loadoutError", message: error instanceof Error ? error.message : String(error) }));
    }
  }

  /** Party rooms need a well-formed code; public rooms never take one. */
  onAuth(_client: GameClient, options?: JoinOptions): boolean {
    const partyRoom = this.roomName === PARTY_ROOM;
    if (partyRoom && !isPartyCode(options?.party)) throw new ServerError(400, "invalid party code");
    if (!partyRoom && options?.party !== undefined) throw new ServerError(400, "party codes join the party room");
    return true;
  }

  get currentBotDifficulty(): BotDifficulty { return this.botDifficulty; }

  private updateBotDifficulty(): void {
    const next = botDifficultyFor([...this.skills.values()]);
    if (next === this.botDifficulty) return;
    this.botDifficulty = next;
    for (const bot of this.bots.values()) bot.setDifficulty(next);
  }

  private async loadSkill(sessionId: string, account: Promise<string | undefined>): Promise<void> {
    try {
      const accountId = await account;
      const profile = accountId ? await (await gameDatabase()).profile(accountId) : undefined;
      if (!profile || !this.skills.has(sessionId)) return;
      this.skills.set(sessionId, { level: profile.progress.level, matches: profile.career.matches });
      this.updateBotDifficulty();
    } catch (error) {
      console.error(JSON.stringify({ event: "skillError", message: error instanceof Error ? error.message : String(error) }));
    }
  }

  onJoin(client: GameClient, options?: JoinOptions): void {
    if (options?.test && !this.testMode) {
      this.testMode = true;
      for (const id of this.bots.keys()) this.state.players.delete(id);
      this.bots.clear();
    }
    let sun = 0;
    let moon = 0;
    for (const player of this.state.players.values()) if (!player.isBot) player.team === 0 ? sun += 1 : moon += 1;
    let team = sun <= moon ? 0 : 1;
    // Friends in a party share a team while it has room for another human.
    if (this.partyCode) {
      const first = [...this.state.players.values()].find((player) => !player.isBot);
      if (first) team = (first.team === 0 ? sun : moon) < TEAM_SIZE ? first.team : 1 - first.team;
    }
    const replaced = [...this.state.players].find(([, player]) => player.isBot && player.team === team);
    if (replaced) { this.state.players.delete(replaced[0]); this.bots.delete(replaced[0]); }
    const spawn = team === 0 ? this.map.spawns.sun[sun % this.map.spawns.sun.length]! : this.map.spawns.moon[moon % this.map.spawns.moon.length]!;
    const player = new PlayerState();
    const requestedName = options?.name?.trim().slice(0, MAX_NAME_LENGTH) || "Player";
    player.name = nameError(requestedName) ? "Player" : requestedName;
    player.team = team;
    player.x = spawn.pos[0]; player.y = spawn.pos[1]; player.z = spawn.pos[2]; player.yaw = spawn.yaw;
    if (options?.test) {
      player.x = team === 0 ? -TEST_DUEL_HALF_DISTANCE : TEST_DUEL_HALF_DISTANCE;
      player.y = 0; player.z = TEST_DUEL_LANE_Z; player.yaw = team === 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    this.state.players.set(client.sessionId, player);
    this.humanStats.set(client.sessionId, createMatchStats());
    // Until the account loads, a player counts as new, which keeps first matches gentle.
    this.skills.set(client.sessionId, { level: 1, matches: 0 });
    this.updateBotDifficulty();
    if (options?.token) {
      const sessionId = client.sessionId;
      const account = gameDatabase().then((db) => db.authenticate(options.token)).catch(() => undefined);
      this.accounts.set(sessionId, account);
      this.loadoutsApplied = this.loadoutsApplied.then(() => this.applyLoadout(sessionId, account));
      this.skillsLoaded = this.skillsLoaded.then(() => this.loadSkill(sessionId, account));
    }
    this.reportPlayers();
    if (this.testMode && sun + moon + 1 >= TEAM_COUNT) this.lock();
  }

  async onDrop(client: GameClient): Promise<void> {
    await this.allowReconnection(client, RECONNECT_WINDOW_S);
  }

  onLeave(client: GameClient): void {
    const player = this.state.players.get(client.sessionId); this.state.players.delete(client.sessionId); this.accounts.delete(client.sessionId); this.humanStats.delete(client.sessionId); this.skills.delete(client.sessionId);
    this.updateBotDifficulty();
    if (player && !this.testMode) this.addBot(player.team, player);
    this.reportPlayers();
  }

  onDispose(): void { serverMetrics.roomClosed(this.reportedPlayers); this.reportedPlayers = 0; }

  private reportPlayers(): void { const count = this.state.players.size; serverMetrics.playerDelta(count - this.reportedPlayers); this.reportedPlayers = count; }
}
