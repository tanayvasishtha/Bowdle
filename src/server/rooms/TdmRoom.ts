import { Room, ServerError, type Client, type Rewind, type StepContext as RoomStepContext } from "@colyseus/core";
import {
  ARROW_LIFETIME_MS,
  ARROW_MAX_PER_PLAYER,
  ARROW_RADIUS,
  ASSIST_MIN_DAMAGE,
  ASSIST_WINDOW_MS,
  QUIVER,
  INK_CLOUD_GRAVITY,
  INK_CLOUD_MS,
  INK_CLOUD_RADIUS,
  MAX_NAME_LENGTH,
  MAX_HP,
  MELEE_DAMAGE,
  MELEE_RANGE,
  END_SCREEN_MS,
  EXPEDITION,
  MAX_REWIND_MS,
  BOULDER_RADIUS,
  PLAYER_WIDTH,
  RESPAWN_MS,
  RECONNECT_WINDOW_S,
  STAND_HEIGHT,
  EYE_STAND,
  EYE_CROUCH,
  SUBSTEPS,
  TEAM_SIZE,
  TEAM_COUNT,
  TEST_DUEL_HALF_DISTANCE,
  TEST_DUEL_LANE_Z,
  TICK_HZ,
  WARMUP_MS,
  USE_DIST,
  GRAPPLE,
  SWAT,
} from "../../shared/constants.ts";
import { BTN, type PlayerInputFrame } from "../../shared/input.ts";
import { AFK_PROMPT_MS, AFK_REMOVE_MS, allowPing } from "../../shared/pings.ts";
import { kitMap } from "../../shared/maps/fixtures/kit.ts";
import type { MapData } from "../../shared/maps/types.ts";
import { defaultMatchMap, mapById, matchMaps, nextMatchMap } from "../../shared/maps/registry.ts";
import { PITCH_LIMIT } from "../../shared/math/angles.ts";
import { ArrowState, BoulderHazardState, InkCloudState, MatchState, PlayerInput, PlayerState, TetherState } from "../../net/schema.ts";
import { MapVoteMessage, SetNameMessage, PingMessage, MutePingMessage, ReportMessage, type DamagedMessage, type HitConfirmMessage, type KillMessage, type MatchEndMessage, type RewardMessage, type RelicMessage, type RobinHoodMessage, type RopeCutMessage, type SwatMessage, type PingEventMessage, type AfkPromptMessage, type AfkRemovedMessage, type PlayOfTheMatchMessage } from "../../net/messages.ts";
import { gameDatabase, type MatchResultLine } from "../db/GameDatabase.ts";
import { canQueueRanked } from "../../shared/rating.ts";
import { DEFAULT_LOADOUT } from "../../shared/cosmetics.ts";
import { botDifficultyFor, type BotDifficulty, type HumanSkill } from "../../shared/bots/difficulty.ts";
import { isPartyCode } from "../../shared/party.ts";
import { headMultiplier, spawnVolley, stepArrow, sweepArrowVsTarget } from "../../shared/sim/arrows.ts";
import type { FireEvent } from "../../shared/sim/bow.ts";
import { tetherLine } from "../../shared/sim/tether.ts";
import type { ZipLine } from "../../shared/maps/types.ts";
import { applyDamage, stepRegen } from "../../shared/sim/health.ts";
import { CREATURE_TEAM, ExpeditionDirector, type ExpeditionHost } from "./expedition.ts"
import { weeklyMapId, weeklySeed } from "../../shared/sim/weeklyExpedition.ts";
import { EXPEDITION_HANDICAPS, type ExpeditionHandicapId } from "../../shared/constants.ts";
import { checkpointFor } from "../../shared/sim/waves.ts";
import { createPlayerSim, type PlayerSim } from "../../shared/sim/movement.ts";
import { breakableHitBySegment, createBreakables, createHerbs, damageBreakable, mergeBreakablesIntoMap, solidBreakableBoxes, stepBreakables, tryPickHerb, type BreakableRuntime, type HerbRuntime } from "../../shared/sim/mapFeatures.ts";
import { BreakableState, MapHerbState } from "../../net/schema.ts";
import { tuning as creatureTuning } from "../../shared/sim/creatures.ts";
import type { CreatureDownMessage, CreatureHitMessage, DownedMessage, WaveMessage } from "../../net/messages.ts";
import { respawnPlayer, updateMatchPhase } from "../../shared/sim/match.ts";
import { chooseSpawnFor, freeTeam, isGameMode, matchWinner, modeRules, scoreCapture, scoreKillFor } from "../../shared/sim/modes.ts";
import { dropRelic, inCamp, relicExpired, relicTouch, resetRelic, touchesRelic } from "../../shared/sim/relic.ts";
import { inSwatWindow, meleeHit, swatHits } from "../../shared/sim/melee.ts";
import { stepPlayer } from "../../shared/sim/movement.ts";
import { segmentDistance } from "../../shared/math/segments.ts";
import { AIM_HEIGHTS, BotController, type RelicView } from "../bots/BotController.ts";
import { releaseGrapple, ropeSegment, spawnAbilityProjectile, type GrappleEvent, type InkEvent } from "../../shared/sim/abilities.ts";
import { resetBoulderHazard, segmentHitsBoulder, stepBoulderHazard, triggerBoulder } from "../../shared/sim/hazards.ts";
import { nameError } from "../../shared/name.ts";
import { fallCreditFor, isOutOfWorld } from "../../shared/sim/fall.ts";
import { serverMetrics } from "../metrics.ts";
import { createMatchStats, recordDeath, recordKill, recordRobinHood, recordRelicCapture, recordRopeCut, recordSwat, recordTetherRide, type MatchStats } from "../../shared/matchStats.ts";
import { medalsFor } from "../../shared/medals.ts";
import type { MatchStatsMessage } from "../../net/messages.ts";

export const PARTY_ROOM = "party";
/** The relic floats above its carrier's head. */
const RELIC_CARRY_HEIGHT_M = 2.1;
/** Falling out of the world in an Expedition costs this much health. */
const EXPEDITION_FALL_DAMAGE = 25;

type JoinOptions = { spectator?: boolean; mode?: string; checkpoint?: boolean; testStartWave?: number; botPlayers?: number; name?: string; token?: string; party?: string; test?: boolean; mapId?: string; testMapId?: string; testBotSeed?: number; ranked?: boolean ; weekly?: boolean; handicaps?: string | readonly string[]; seed?: number };
type ServerMessages = { kill: KillMessage; hitConfirm: HitConfirmMessage; damaged: DamagedMessage; matchEnd: MatchEndMessage; robinHood: RobinHoodMessage; ropeCut: RopeCutMessage; swat: SwatMessage; relic: RelicMessage; creatureHit: CreatureHitMessage; creatureDown: CreatureDownMessage; wave: WaveMessage; downed: DownedMessage; rewards: RewardMessage; matchStats: MatchStatsMessage ; pingEvent: PingEventMessage; afkPrompt: AfkPromptMessage; afkRemoved: AfkRemovedMessage; playOfTheMatch: PlayOfTheMatchMessage; spectator: { ok: boolean } };
type GameClient = Client<{ messages: ServerMessages }>;
type DamageRecord = { attacker: string; damage: number; atMs: number };
type ArrowOrigin = { x: number; y: number; z: number };

/** Arrows that hurt players, clash, cut ropes and can be swatted. Grapple hooks and ink lobs do none of that. */
function isDamaging(kind: string): boolean { return kind === "arrow" || kind === "scatter" || kind === "tether"; }

export class TdmRoom extends Room<{ state: MatchState; input: PlayerInput; client: GameClient }> {
  maxClients = TEAM_SIZE * 2;
  maxMessagesPerSecond = TICK_HZ;
  state = new MatchState();
  private map: MapData = defaultMatchMap;
  /** Collision map with unbroken breakables merged into boxes. */
  private playMap: MapData = defaultMatchMap;
  private breakables: BreakableRuntime[] = [];
  private mapHerbs: HerbRuntime[] = [];
  private readonly geyserLaunches = new Map<string, number>();
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
  readonly xpEvents: Array<{ type: "robinHood" | "ropeCut" | "swat"; player: string }> = [];
  /** Tethers as zip lines for the shared simulation; rebuilt whenever a tether comes or goes. */
  private tetherZips: ZipLine[] = [];
  private tetherSerial = 0;
  /** Expedition only: the wave director, the checkpoint the next run starts from, and bot players for the soak. */
  expedition: ExpeditionDirector | null = null;
  private expeditionWeekly = false;
  private expeditionSeed = 0;
  private expeditionHandicaps: ExpeditionHandicapId[] = [];
  private startWave = 0;
  private expeditionBots = 0;
  private readonly creatureEnemies = new Map<string, PlayerSim>();
  private readonly tetherFrom = { x: 0, y: 0, z: 0 };
  private readonly tetherTo = { x: 0, y: 0, z: 0 };
  private readonly ropeFrom = { x: 0, y: 0, z: 0 };
  private readonly ropeTo = { x: 0, y: 0, z: 0 };
  zipRideCount = 0;
  /** Public kill ledger for balance reports; cleared each match. Network messages stay unchanged. */
  auditKills: Array<{ weapon: string; arrowKind: string; headshot: boolean; atMs: number; killerTeam: number; victimTeam: number; ttkMs: number }> = [];
  /** Relic captures for balance: match time and how long the carrier held it. */
  auditCaptures: Array<{ atMs: number; team: number; carryMs: number }> = [];
  /** Per-second player samples of movement verbs during live play. */
  auditMovement = { grapple: 0, swing: 0, zip: 0, tether: 0, samples: 0, zipRides: 0, tetherRides: 0 };
  private readonly aliveSinceMs = new Map<string, number>();
  /** Earliest damage timestamp this life; used for true time-to-kill. */
  private readonly firstHitAtMs = new Map<string, number>();
  private relicPickedAtMs = 0;
  private rewindState!: Rewind;
  private arrowSerial = 0;
  private cloudSerial = 0;
  private botSerial = 0;
  private simulationNowMs = 0;
  private matchLiveAtMs = WARMUP_MS;
  private testMode = false;
  private rankedMode = false;
  private rankedLeft = new Set<string>();
  private readonly bots = new Map<string, BotController>();
  private readonly mapVotes = new Map<string, string>();
  private reportedPlayers = 0;
  private botSeedBase = 0;
  private readonly accounts = new Map<string, Promise<string | undefined>>();
  private readonly lastInputAtMs = new Map<string, number>();
  private readonly pingStamps = new Map<string, number[]>();
  private readonly spectators = new Set<string>();
  private readonly mutedPings = new Map<string, Set<string>>();
  private readonly afkPrompted = new Set<string>();
  private playOfTheMatch: PlayOfTheMatchMessage | undefined;
  private readonly skills = new Map<string, HumanSkill>();
  private botDifficulty: BotDifficulty = "normal";
  partyCode = "";
  private readonly humanStats = new Map<string, MatchStats>();
  private readonly killStatsEvent: Parameters<typeof recordKill>[1] = { weapon: "arrow", headshot: false, distance: 0, onZip: false, scatter: false };
  private matchSerial = 0;
  private rewardedSerial = -1;
  rewardsSettled: Promise<void> = Promise.resolve();
  loadoutsApplied: Promise<void> = Promise.resolve();
  skillsLoaded: Promise<void> = Promise.resolve();

  onCreate(options: JoinOptions): void {
    this.rankedMode = this.roomName === "ranked";
    this.partyCode = isPartyCode(options.party) ? options.party : "";
    // Public rooms are named after their mode; a party room takes the mode its leader picked.
    const named = isGameMode(this.roomName) ? this.roomName : undefined;
    this.state.mode = named ?? (this.roomName === PARTY_ROOM && isGameMode(options.mode) ? options.mode : "tdm");
    this.maxClients = modeRules(this.state.mode).maxPlayers;
    if (this.state.mode === "expedition") {
      this.expeditionWeekly = options.weekly === true;
      const rawHandicaps = typeof options.handicaps === "string" ? options.handicaps.split(",") : options.handicaps ?? [];
      this.expeditionHandicaps = [...rawHandicaps].filter((id): id is ExpeditionHandicapId => id in EXPEDITION_HANDICAPS);
      this.expeditionSeed = Number.isFinite(options.seed) ? Math.floor(options.seed!)
        : this.expeditionWeekly ? weeklySeed()
        : (Number.isFinite(options.testBotSeed) ? options.testBotSeed! : Date.now()) ^ 0x5eed;
      if (this.expeditionWeekly && !options.testMapId && !options.mapId) {
        options = { ...options, mapId: weeklyMapId(this.expeditionSeed) };
      }
      this.expedition = new ExpeditionDirector(this.expeditionHost(), this.expeditionSeed, this.expeditionHandicaps);

      // Tests may start a run later, for example right before a boss wave.
      if (options.test && Number.isFinite(options.testStartWave)) this.startWave = Math.max(0, Math.floor(options.testStartWave!));
      if (Number.isFinite(options.testBotSeed)) this.expeditionBots = Math.max(0, Math.min(EXPEDITION.maxPlayers, Math.floor(options.botPlayers ?? 0)));
    }
    this.botSeedBase = Number.isFinite(options.testBotSeed) ? options.testBotSeed! : 0;
    let selected = options.mapId === kitMap.id ? kitMap : options.testMapId ? mapById(options.testMapId) : undefined;
    // Expeditions need creature spawns and always keep their map.
    if (this.state.mode === "expedition" && !selected?.creatureSpawns) selected = defaultMatchMap;
    this.fixedMap = selected !== undefined;
    this.loadMap(selected ?? defaultMatchMap, 0);
    this.state.phase = "warmup";
    this.state.phaseEndsAtMs = WARMUP_MS;
    this.rewindState = this.allowRewindState({ maxRewindMs: MAX_REWIND_MS });
    this.rewindState.attachAll(this.state.players, { fields: ["x", "y", "z", "height", "yaw"], mode: "snapshot" });
    if (!this.rankedMode) this.fillBots();
    this.reportedPlayers = this.state.players.size; serverMetrics.roomOpened(this.reportedPlayers);
    this.onMessage("setName", SetNameMessage, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (player && !nameError(message.name)) player.name = message.name;
    });
    this.onMessage("mapVote", MapVoteMessage, (client, message) => this.voteMap(client.sessionId, message.mapId));
    this.onMessage("ping", PingMessage, (client, message) => this.handlePing(client, message));
    this.onMessage("mutePing", MutePingMessage, (client, message) => {
      if (!this.state.players.has(message.targetId)) return;
      let set = this.mutedPings.get(client.sessionId);
      if (!set) { set = new Set(); this.mutedPings.set(client.sessionId, set); }
      if (set.size >= 32 && !set.has(message.targetId)) return;
      set.add(message.targetId);
    });
    this.onMessage("report", ReportMessage, (client, message) => { void this.handleReport(client, message); });
    this.setFixedTimestep((context) => this.simulateTick(context, this.clock.elapsedTime), TICK_HZ, { subSteps: SUBSTEPS });
  }

  /** Reset the balance ledgers and mark every living player as freshly spawned. Call at the start of a balance match. */
  clearBalanceAudit(): void {
    this.auditKills.length = 0;
    this.auditCaptures.length = 0;
    this.auditMovement = { grapple: 0, swing: 0, zip: 0, tether: 0, samples: 0, zipRides: 0, tetherRides: 0 };
    this.aliveSinceMs.clear();
    this.firstHitAtMs.clear();
    this.relicPickedAtMs = 0;
    for (const [id, player] of this.state.players) if (player.alive) { this.aliveSinceMs.set(id, this.simulationNowMs); this.firstHitAtMs.delete(id); }
  }

  private noteAuditKill(weapon: string, arrowKind: string, headshot: boolean, killerTeam: number, victimId: string, victimTeam: number): void {
    const atMs = this.simulationNowMs;
    const since = this.firstHitAtMs.get(victimId) ?? this.aliveSinceMs.get(victimId) ?? this.matchLiveAtMs;
    this.auditKills.push({ weapon, arrowKind, headshot, atMs, killerTeam, victimTeam, ttkMs: Math.max(0, atMs - since) });
    if (this.auditKills.length > 500) this.auditKills.splice(0, this.auditKills.length - 500);
    this.firstHitAtMs.delete(victimId);
  }

  private sampleMovementVerbs(): void {
    this.auditMovement.samples += 1;
    for (const player of this.state.players.values()) {
      if (!player.alive) continue;
      if (player.grappleActive) {
        if (player.grappleReeling) this.auditMovement.grapple += 1;
        else this.auditMovement.swing += 1;
      }
      if (player.zipId) {
        if (player.zipId.startsWith("tether-")) this.auditMovement.tether += 1;
        else this.auditMovement.zip += 1;
      }
    }
  }

  simulateTick(context: RoomStepContext, nowMs: number): void {
    const tickStarted = performance.now();
    try {
    this.simulationNowMs = nowMs;
    this.pending.clear();
    for (const [sessionId, player] of this.state.players) if (!player.isBot) this.pending.set(sessionId, this.inputs.get(sessionId));
    if (this.state.phase !== "live") {
      for (const frames of this.pending.values()) for (const _frame of frames) { /* consume during warmup */ }
      const changed = updateMatchPhase(this.state, nowMs, modeRules(this.state.mode).timeLimitS);
      if (changed === "restart") this.resetPlayers();
      if (changed === "live") this.expedition?.reset(this.startWave);
      return;
    }
    if (updateMatchPhase(this.state, nowMs, modeRules(this.state.mode).timeLimitS) === "end") this.sendMatchEnd();
    if (this.state.phase !== "live") return;
    for (const [sessionId, frames] of this.pending) {
      if (this.spectators.has(sessionId)) continue;
      const player = this.state.players.get(sessionId);
      if (!player) continue;
      for (const frame of frames) {
        if (frame.moveX || frame.moveZ || frame.buttons) {
          this.lastInputAtMs.set(sessionId, nowMs);
          this.afkPrompted.delete(sessionId);
        }
        if (!player.alive) continue;
        player.spawnProtectMs = Math.max(0, player.spawnProtectMs - context.dtMs);
        this.tryLever(sessionId, player, frame, nowMs);
        const beforeZip = player.zipId; this.applyEvents(sessionId, player, stepPlayer(player, frame, this.playMap, { nowMs, matchTimeMs: nowMs, geyserLaunches: this.geyserLaunches, geyserPlayerId: sessionId, zipLines: this.tetherZips, gravityMult: this.expedition?.gravityMult() })); this.noteZipRide(sessionId, beforeZip, player.zipId);
      }
    }
    for (const [id, controller] of this.bots) {
      const player = this.state.players.get(id); if (!player?.alive) continue;
      player.spawnProtectMs = Math.max(0, player.spawnProtectMs - context.dtMs);
      const frame = controller.update(player, this.expedition ? this.creatureTargets() : this.state.players, this.playMap, nowMs, this.state.inkClouds.values(), this.state.hazards, this.relicView());
      const beforeZip = player.zipId; this.applyEvents(id, player, stepPlayer(player, frame, this.playMap, { nowMs, matchTimeMs: nowMs, geyserLaunches: this.geyserLaunches, geyserPlayerId: id, zipLines: this.tetherZips, gravityMult: this.expedition?.gravityMult() })); this.noteZipRide(id, beforeZip, player.zipId);
    }
    this.checkAfk(nowMs);
    this.checkFalls();
    this.stepRelic();
    this.updateHazards(nowMs, context.dt);
    this.stepArrows(context);
    this.stepMapFeatures(nowMs);
    this.expedition?.step(context.dt, context.dtMs);
    for (const [id, cloud] of this.state.inkClouds) if (cloud.expiresAtMs <= nowMs) this.state.inkClouds.delete(id);
    let expired = false;
    for (const [id, tether] of this.state.tethers) if (tether.expiresAtMs <= nowMs) { this.state.tethers.delete(id); expired = true; }
    if (expired) this.rebuildTetherZips();
    for (const [id, player] of this.state.players) {
      if (player.alive) { if (!player.downed) stepRegen(player, nowMs, context.dt); }
      else if (!this.expedition && nowMs >= player.respawnAtMs) {
        respawnPlayer(player, chooseSpawnFor(this.state.mode, this.map, player.team, this.state.players.values(), player));
        this.aliveSinceMs.set(id, nowMs); this.firstHitAtMs.delete(id);
      }
    }
    if (Math.floor(nowMs / 1000) !== Math.floor((nowMs - context.dtMs) / 1000)) this.sampleMovementVerbs();
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

  private noteZipRide(id: string, before: string, after: string): void {
    if (before || !after) return;
    this.zipRideCount += 1;
    if (after.startsWith("tether-")) {
      this.auditMovement.tetherRides += 1;
      const stats = this.humanStats.get(id); if (stats) recordTetherRide(stats);
    } else this.auditMovement.zipRides += 1;
  }

  private aimRangeAlongLook(owner: string, event: FireEvent): number {
    const crouched = this.state.players.get(owner)?.crouched ?? false;
    const eye = crouched ? EYE_CROUCH : EYE_STAND;
    const lookX = -Math.sin(event.yaw) * Math.cos(event.pitch);
    const lookY = Math.sin(event.pitch);
    const lookZ = -Math.cos(event.yaw) * Math.cos(event.pitch);
    const from = { x: event.x, y: event.y + eye, z: event.z };
    const to = { x: event.x + lookX * 200, y: event.y + eye + lookY * 200, z: event.z + lookZ * 200 };
    let best = 200;
    for (const [id, target] of this.state.players) {
      if (id === owner || !target.alive) continue;
      this.hitTarget.x = target.x;
      this.hitTarget.y = target.y;
      this.hitTarget.z = target.z;
      this.hitTarget.height = target.height;
      this.hitTarget.crouched = this.hitTarget.height < STAND_HEIGHT;
      const hit = sweepArrowVsTarget(from, to, this.hitTarget, "arrow");
      if (hit && hit.t * 200 < best) best = Math.max(2, hit.t * 200);
    }
    return best;
  }

  private createArrow(owner: string, team: number, event: FireEvent): void {
    const aimed = { ...event, aimRange: event.aimRange ?? this.aimRangeAlongLook(owner, event) };
    for (const sim of spawnVolley(aimed, this.state.players.get(owner)?.crouched)) {
      const arrow = new ArrowState(); Object.assign(arrow, sim);
      arrow.prevX = arrow.x; arrow.prevY = arrow.y; arrow.prevZ = arrow.z;
      arrow.owner = owner; arrow.team = team; arrow.bornMs = this.simulationNowMs;
      const id = `${owner}-${this.arrowSerial += 1}`;
      this.state.arrows.set(id, arrow); this.arrowOrigins.set(id, { x: event.x, y: event.y, z: event.z });
    }
    let owned = 0;
    for (const [arrowId, other] of this.state.arrows) if (other.owner === owner && ++owned > ARROW_MAX_PER_PLAYER) this.deleteArrow(arrowId);
  }

  private stepArrows(context: RoomStepContext): void {
    this.removeArrows.length = 0;
    for (let substep = 0; substep < context.subSteps; substep += 1) {
      for (const [id, arrow] of this.state.arrows) {
        const fromX = arrow.x, fromY = arrow.y, fromZ = arrow.z;
        arrow.prevX = fromX; arrow.prevY = fromY; arrow.prevZ = fromZ;
        const gravity = arrow.kind === "grapple" || arrow.kind === "spit" ? 0 : arrow.kind === "ink" ? INK_CLOUD_GRAVITY : undefined;
        const world = stepArrow(arrow, this.playMap, context.subDt, gravity, this.simulationNowMs);
        let boulderBlocked = false;
        for (const hazard of this.state.hazards.values()) if (hazard.phase === "roll" && segmentHitsBoulder(fromX, fromY, fromZ, arrow.x, arrow.y, arrow.z, hazard, BOULDER_RADIUS + ARROW_RADIUS)) { boulderBlocked = true; break; }
        let targetId = "", headshot = false, earliest = Number.POSITIVE_INFINITY;
        if (arrow.kind === "spit") { if (this.spitStep(id, arrow, fromX, fromY, fromZ, world.worldHit)) continue; }
        if (this.expedition && isDamaging(arrow.kind) && !boulderBlocked) {
          this.arrowFrom.x = fromX; this.arrowFrom.y = fromY; this.arrowFrom.z = fromZ;
          this.arrowTo.x = arrow.x; this.arrowTo.y = arrow.y; this.arrowTo.z = arrow.z;
          if (this.expedition.arrowStep(arrow.owner, arrow, this.arrowFrom, this.arrowTo)) { this.removeArrows.push(id); continue; }
        }
        let breakableHit: { item: BreakableRuntime; t: number } | null = null;
        if (this.breakables.length > 0 && isDamaging(arrow.kind) && !boulderBlocked) {
          breakableHit = breakableHitBySegment(this.breakables, fromX, fromY, fromZ, arrow.x, arrow.y, arrow.z);
        }
        if (isDamaging(arrow.kind) && !boulderBlocked && this.swatArrow(id, arrow, fromX, fromY, fromZ)) continue;
        if (isDamaging(arrow.kind) && !boulderBlocked) {
          const seen = this.rewindState.lastSeenBy(arrow.owner);
          for (const [candidateId, target] of this.state.players) {
            if (candidateId === arrow.owner || target.team === arrow.team || !target.alive || target.spawnProtectMs > 0) continue;
            this.arrowFrom.x = fromX; this.arrowFrom.y = fromY; this.arrowFrom.z = fromZ;
            this.arrowTo.x = arrow.x; this.arrowTo.y = arrow.y; this.arrowTo.z = arrow.z;
            this.hitTarget.x = seen.value(target, "x"); this.hitTarget.y = seen.value(target, "y"); this.hitTarget.z = seen.value(target, "z");
            this.hitTarget.height = seen.value(target, "height"); this.hitTarget.crouched = this.hitTarget.height < STAND_HEIGHT;
            const hit = sweepArrowVsTarget(this.arrowFrom, this.arrowTo, this.hitTarget, arrow.kind);
            if (hit && hit.t < earliest) { earliest = hit.t; targetId = candidateId; headshot = hit.kind === "head"; }
          }
        }
        if (breakableHit && breakableHit.t < earliest) {
          const hit = breakableHit.item;
          const broke = damageBreakable(this.breakables, hit.id, arrow.damage, this.simulationNowMs);
          const state = this.state.breakables.get(hit.id);
          if (state) { state.hp = hit.hp; state.broken = hit.broken; }
          if (broke) this.rebuildPlayMap();
          this.removeArrows.push(id); continue;
        }
        if (isDamaging(arrow.kind) && !boulderBlocked) this.cutRopes(arrow, fromX, fromY, fromZ);
        if (targetId) {
          this.dealDamage(arrow.owner, targetId, arrow.damage * (headshot ? headMultiplier(arrow.kind) : 1), "arrow", headshot, fromX, fromZ, this.arrowOrigins.get(id), arrow.kind);
          this.removeArrows.push(id);
        } else if (world.worldHit || boulderBlocked || this.simulationNowMs - arrow.bornMs >= ARROW_LIFETIME_MS) {
          if (world.worldHit && arrow.kind === "ink") this.createInkCloud(arrow.x, arrow.y, arrow.z);
          if (world.worldHit && arrow.kind === "tether") this.createTether(id, arrow, world.boxHit);
          this.removeArrows.push(id);
        }
      }
      for (const id of this.removeArrows) this.deleteArrow(id);
      this.removeArrows.length = 0;
      this.resolveArrowClashes();
    }
  }

  /** A dagger swing early in its arc destroys an enemy arrow passing close in front. */
  private swatArrow(id: string, arrow: ArrowState, fromX: number, fromY: number, fromZ: number): boolean {
    if (arrow.ageMs < SWAT.minArrowAgeMs) return false;
    this.arrowFrom.x = fromX; this.arrowFrom.y = fromY; this.arrowFrom.z = fromZ;
    this.arrowTo.x = arrow.x; this.arrowTo.y = arrow.y; this.arrowTo.z = arrow.z;
    for (const [swatterId, swatter] of this.state.players) {
      if (swatter.team === arrow.team || !swatter.alive || !inSwatWindow(swatter.meleeCooldownMs)) continue;
      if (!swatHits(swatter, this.arrowFrom, this.arrowTo)) continue;
      this.removeArrows.push(id);
      this.xpEvents.push({ type: "swat", player: swatterId });
      const stats = this.humanStats.get(swatterId); if (stats) recordSwat(stats);
      this.broadcast("swat", { swatter: swatterId, shooter: arrow.owner, x: arrow.x, y: arrow.y, z: arrow.z });
      return true;
    }
    return false;
  }

  /** A tether arrow that stopped in a valid spot becomes its owner's only tether line. */
  private createTether(arrowId: string, arrow: ArrowState, boxHit: boolean): void {
    const origin = this.arrowOrigins.get(arrowId); if (!origin) return;
    const line = tetherLine(`tether-${this.tetherSerial += 1}`, [origin.x, origin.y, origin.z], [arrow.x, arrow.y, arrow.z], boxHit);
    if (!line) return;
    for (const [id, other] of this.state.tethers) if (other.owner === arrow.owner) this.state.tethers.delete(id);
    const tether = new TetherState();
    [tether.fromX, tether.fromY, tether.fromZ] = line.from; [tether.toX, tether.toY, tether.toZ] = line.to;
    tether.owner = arrow.owner; tether.team = arrow.team; tether.expiresAtMs = this.simulationNowMs + QUIVER.tether.lifeMs;
    this.state.tethers.set(line.id, tether);
    this.rebuildTetherZips();
  }

  private rebuildTetherZips(): void {
    this.tetherZips = [];
    for (const [id, tether] of this.state.tethers) this.tetherZips.push({ id, from: [tether.fromX, tether.fromY, tether.fromZ], to: [tether.toX, tether.toY, tether.toZ] });
  }

  /** An enemy arrow passing close to a rope cuts it. The rope is placed where the shooter saw its owner. */
  private cutRopes(arrow: ArrowState, fromX: number, fromY: number, fromZ: number): void {
    const seen = this.rewindState.lastSeenBy(arrow.owner);
    this.arrowFrom.x = fromX; this.arrowFrom.y = fromY; this.arrowFrom.z = fromZ;
    this.arrowTo.x = arrow.x; this.arrowTo.y = arrow.y; this.arrowTo.z = arrow.z;
    for (const [ownerId, owner] of this.state.players) {
      if (!owner.grappleActive || owner.team === arrow.team || !owner.alive) continue;
      ropeSegment(owner, this.ropeFrom, this.ropeTo);
      this.ropeFrom.x = seen.value(owner, "x"); this.ropeFrom.y = seen.value(owner, "y") + owner.height * 0.5; this.ropeFrom.z = seen.value(owner, "z");
      if (segmentDistance(this.arrowFrom, this.arrowTo, this.ropeFrom, this.ropeTo) >= GRAPPLE.cutRadius) continue;
      releaseGrapple(owner, false);
      this.xpEvents.push({ type: "ropeCut", player: arrow.owner });
      const stats = this.humanStats.get(arrow.owner); if (stats) recordRopeCut(stats);
      this.broadcast("ropeCut", { cutter: arrow.owner, owner: ownerId, x: arrow.x, y: arrow.y, z: arrow.z });
    }
    let cut = false;
    for (const [id, tether] of this.state.tethers) {
      if (tether.team === arrow.team) continue;
      this.tetherFrom.x = tether.fromX; this.tetherFrom.y = tether.fromY; this.tetherFrom.z = tether.fromZ;
      this.tetherTo.x = tether.toX; this.tetherTo.y = tether.toY; this.tetherTo.z = tether.toZ;
      if (segmentDistance(this.arrowFrom, this.arrowTo, this.tetherFrom, this.tetherTo) >= GRAPPLE.cutRadius) continue;
      this.state.tethers.delete(id); cut = true;
      this.xpEvents.push({ type: "ropeCut", player: arrow.owner });
      const stats = this.humanStats.get(arrow.owner); if (stats) recordRopeCut(stats);
      this.broadcast("ropeCut", { cutter: arrow.owner, owner: tether.owner, x: arrow.x, y: arrow.y, z: arrow.z, tether: id });
    }
    if (cut) this.rebuildTetherZips();
  }

  private resolveArrowClashes(): void {
    for (const [idA, arrowA] of this.state.arrows) for (const [idB, arrowB] of this.state.arrows) {
      if (idA >= idB || !isDamaging(arrowA.kind) || !isDamaging(arrowB.kind) || arrowA.team === arrowB.team || this.removeArrows.includes(idA) || this.removeArrows.includes(idB)) continue;
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
    if (this.expedition) { this.expedition.melee(attackerId, x, y, z, yaw, MELEE_DAMAGE, MELEE_RANGE); return; }
    const seen = this.rewindState.lastSeenBy(attackerId);
    for (const [targetId, target] of this.state.players) {
      if (targetId === attackerId || target.team === attacker.team || !target.alive || target.spawnProtectMs > 0) continue;
      const hit = meleeHit({ x, y, z, yaw }, { x: seen.value(target, "x"), y: seen.value(target, "y"), z: seen.value(target, "z"), yaw: seen.value(target, "yaw") });
      if (hit) { this.dealDamage(attackerId, targetId, hit.damage, "dagger", false, x, z); return; }
    }
  }

  private dealDamage(attackerId: string, targetId: string, damage: number, weapon: "arrow" | "dagger" | "boulder" | "fall", headshot: boolean, fromX: number, fromZ: number, origin?: ArrowOrigin, arrowKind = ""): void {
    const attacker = this.state.players.get(attackerId), target = this.state.players.get(targetId);
    if (!attacker || !target || attacker.team === target.team || target.spawnProtectMs > 0) return;
    const actual = Math.min(target.hp, damage);
    let ledger = this.damage.get(targetId); if (!ledger) { ledger = new Map(); this.damage.set(targetId, ledger); }
    ledger.set(attackerId, { attacker: attackerId, damage: (ledger.get(attackerId)?.damage ?? 0) + actual, atMs: this.simulationNowMs });
    if (!this.firstHitAtMs.has(targetId)) this.firstHitAtMs.set(targetId, this.simulationNowMs);
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
      this.killStatsEvent.distance = distance; this.killStatsEvent.onZip = attacker.zipId !== ""; this.killStatsEvent.scatter = arrowKind === "scatter";
      recordKill(attackerStats, this.killStatsEvent);
    }
    if (victimStats) recordDeath(victimStats);
    this.noteAuditKill(weapon, arrowKind || (weapon === "arrow" ? "arrow" : ""), headshot, attacker.team, targetId, target.team);
    this.broadcast("kill", { killer: attackerId, victim: targetId, weapon, headshot, distance });
    this.notePlayOfTheMatch(attackerId, targetId, distance, attacker.kills);
    if (scoreKillFor(this.state, this.state.mode, attacker.team, attacker.kills, this.simulationNowMs)) this.sendMatchEnd();
  }

  private clientById(sessionId: string): GameClient | undefined { return this.clients.find((client) => client.sessionId === sessionId); }

  private async handleReport(client: GameClient, message: ReportMessage): Promise<void> {
    const reporterPending = this.accounts.get(client.sessionId);
    const targetPlayer = this.state.players.get(message.targetId);
    if (!reporterPending || !targetPlayer || targetPlayer.isBot) return;
    const targetPending = this.accounts.get(message.targetId);
    if (!targetPending) return;
    const [reporterId, targetId] = await Promise.all([reporterPending, targetPending]);
    if (!reporterId || !targetId || reporterId === targetId) return;
    const db = await gameDatabase();
    await db.fileReport(reporterId, targetId, message.reason, { matchId: `${this.roomId}:${this.matchSerial}` });
  }

  private handlePing(client: GameClient, message: PingMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.isBot) return;
    const stamps = this.pingStamps.get(client.sessionId) ?? [];
    if (!allowPing(stamps, this.simulationNowMs)) { this.pingStamps.set(client.sessionId, stamps); return; }
    this.pingStamps.set(client.sessionId, stamps);
    const event: PingEventMessage = {
      kind: message.kind, x: message.x, y: message.y, z: message.z, callout: message.callout,
      from: client.sessionId, team: player.team, atMs: this.simulationNowMs,
    };
    for (const other of this.clients) {
      const mate = this.state.players.get(other.sessionId);
      if (!mate || mate.isBot) continue;
      // FFA gives every player a unique team, so lobby-wide pings are required there.
      if (this.state.mode !== "ffa" && mate.team !== player.team) continue;
      if (this.mutedPings.get(other.sessionId)?.has(client.sessionId)) continue;
      other.send("pingEvent", event);
    }
  }

  private checkAfk(nowMs: number): void {
    if (this.state.phase !== "live" || this.testMode) return;
    for (const [sessionId, player] of this.state.players) {
      if (player.isBot) continue;
      let last = this.lastInputAtMs.get(sessionId);
      if (last === undefined) { this.lastInputAtMs.set(sessionId, nowMs); continue; }
      const idle = nowMs - last;
      if (idle >= AFK_REMOVE_MS) {
        const client = this.clientById(sessionId);
        const payload: AfkRemovedMessage = { reason: "afk" };
        client?.send("afkRemoved", payload);
        client?.leave(4000);
        this.lastInputAtMs.delete(sessionId);
        this.afkPrompted.delete(sessionId);
        continue;
      }
      if (idle >= AFK_PROMPT_MS && !this.afkPrompted.has(sessionId)) {
        this.afkPrompted.add(sessionId);
        const payload: AfkPromptMessage = { secondsLeft: Math.max(1, Math.ceil((AFK_REMOVE_MS - idle) / 1000)) };
        this.clientById(sessionId)?.send("afkPrompt", payload);
      }
    }
  }

  private notePlayOfTheMatch(killerId: string, victimId: string, distance: number, streak: number): void {
    const longShot = distance >= 35;
    const streakHit = streak >= 3;
    if (!longShot && !streakHit) return;
    const next: PlayOfTheMatchMessage = {
      killerId, victimId, distance, streak,
      kind: longShot && (!this.playOfTheMatch || distance >= (this.playOfTheMatch.distance)) ? "longShot" : "streak",
    };
    if (this.playOfTheMatch) {
      if (next.kind === "longShot" && this.playOfTheMatch.kind === "longShot" && next.distance < this.playOfTheMatch.distance) return;
      if (next.kind === "streak" && this.playOfTheMatch.kind === "longShot") return;
      if (next.kind === "streak" && this.playOfTheMatch.kind === "streak" && next.streak <= this.playOfTheMatch.streak) return;
    }
    this.playOfTheMatch = next;
  }

  private deleteArrow(id: string): void { this.state.arrows.delete(id); this.arrowOrigins.delete(id); }
  private sendMatchEnd(): void {
    const winner = matchWinner(this.state.mode, this.state.scoreSun, this.state.scoreMoon);
    let mvp = "", kills = -1; for (const [id, player] of this.state.players) if (player.kills > kills) { kills = player.kills; mvp = id; }
    if (this.rewardedSerial === this.matchSerial) return;
    this.rewardedSerial = this.matchSerial;
    const playOf = this.playOfTheMatch;
    this.playOfTheMatch = undefined;
    this.broadcast("matchEnd", { winner, mvp, ...(playOf ? { playOf } : {}) });
    let humans = 0; for (const [id, player] of this.state.players) { const stats = this.humanStats.get(id); if (!stats || player.isBot) continue; humans += 1; stats.kills = player.kills; stats.deaths = player.deaths; stats.assists = player.assists; stats.won = winner === "player" ? id === mvp : winner !== "draw" && player.team === (winner === "sun" ? 0 : 1); this.clientById(id)?.send("matchStats", { stats: { ...stats }, medals: medalsFor(stats, kills) }); }
    console.log(JSON.stringify({ event: "matchFinished", mode: this.state.mode, mapId: this.map.id, region: process.env.BOWDLE_REGION ?? "local", humans, bots: this.state.players.size - humans, durationS: Math.max(0, (this.simulationNowMs - this.matchLiveAtMs) / 1000), scoreSun: this.state.scoreSun, scoreMoon: this.state.scoreMoon }));
    this.rewardsSettled = this.grantRewards(`${this.roomId}:${this.matchSerial}`, winner).catch((error: unknown) => {
      console.error(JSON.stringify({ event: "rewardError", roomId: this.roomId, message: error instanceof Error ? error.message : String(error) }));
    });
  }

  /** Signed-in players still in the room get XP and Ink once per match. Guests and bots get nothing stored. */
  private async grantRewards(matchId: string, winner: "sun" | "moon" | "draw" | "player"): Promise<void> {
    const lines: MatchResultLine[] = [];
    const sessionsByAccount = new Map<string, string>();
    // Copy the scoreboard before any await: the next match resets it.
    const snapshot = [...this.accounts].flatMap(([sessionId, pending]) => {
      const player = this.state.players.get(sessionId);
      const stats = this.humanStats.get(sessionId); let bestKills = 0; for (const other of this.state.players.values()) bestKills = Math.max(bestKills, other.kills);
      return player && !player.isBot && stats ? [{ sessionId, pending, mapId: this.map.id, stats: { ...stats }, medals: medalsFor(stats, bestKills), kills: player.kills, assists: player.assists, expedition: this.expedition ? { waves: this.state.expedition.cleared, bosses: this.state.expedition.bosses, reachedWave: this.state.expedition.wave, seed: this.expeditionSeed, weekly: this.expeditionWeekly, handicaps: this.expeditionHandicaps } : undefined, won: winner === "player" ? stats.won : winner !== "draw" && player.team === (winner === "sun" ? 0 : 1) }] : [];
    });
    for (const entry of snapshot) {
      const accountId = await entry.pending;
      if (!accountId || sessionsByAccount.has(accountId)) continue;
      sessionsByAccount.set(accountId, entry.sessionId);
      lines.push({ accountId, kills: entry.kills, assists: entry.assists, won: entry.won, stats: entry.stats, medals: entry.medals, mapId: entry.mapId, ...(entry.expedition ? { expedition: entry.expedition } : {}) });
    }
    if (lines.length === 0) return;
    const db = await gameDatabase();
    const granted = await db.recordMatch(matchId, lines);
    await db.rememberMatchPeers(lines.map((line) => line.accountId).filter(Boolean));
    if (this.rankedMode) {
      const rankedLines: { accountId: string; won: boolean; drew: boolean; team: number }[] = [];
      for (const line of lines) {
        if (!line.accountId) continue;
        const sessionId = sessionsByAccount.get(line.accountId);
        const player = sessionId ? this.state.players.get(sessionId) : undefined;
        rankedLines.push({ accountId: line.accountId, won: !!line.won, drew: winner === "draw", team: player?.team ?? 0 });
      }
      if (rankedLines.length > 0) await db.applyRankedResults(rankedLines, matchId);
    }
    for (const reward of granted) {
      // Account ids only: logs never carry names or tokens.
      if (reward.after.level > reward.before.level) console.log(JSON.stringify({ event: "levelUp", accountId: reward.accountId, level: reward.after.level }));
      for (const change of reward.challenges) if (change.before < change.target && change.after >= change.target) console.log(JSON.stringify({ event: "challengeCompleted", accountId: reward.accountId, challengeId: change.id }));
      const sessionId = sessionsByAccount.get(reward.accountId)!;
      this.clientById(sessionId)?.send("rewards", { xp: reward.xp, ink: reward.ink, breakdown: reward.breakdown, before: reward.before, challenges: reward.challenges, streakDays: reward.streakDays, unlocked: reward.unlocked, level: reward.after.level, intoLevel: reward.after.intoLevel, levelSize: reward.after.levelSize, levelUp: reward.after.level > reward.before.level });
    }
  }
  private resetPlayers(): void {
    this.matchSerial += 1;
    this.matchLiveAtMs = this.simulationNowMs + WARMUP_MS;
    this.clearBalanceAudit();
    for (const id of this.humanStats.keys()) this.humanStats.set(id, createMatchStats());
    resetRelic(this.state.relic, this.map);
    this.state.arrows.clear(); this.state.inkClouds.clear(); this.state.tethers.clear(); this.tetherZips = []; this.arrowOrigins.clear(); this.damage.clear();
    if (!this.fixedMap) this.loadMap(this.votedMap(), this.simulationNowMs);
    else for (const hazard of this.state.hazards.values()) resetBoulderHazard(hazard, this.simulationNowMs);
    for (const [id, player] of this.state.players) { player.kills = 0; player.deaths = 0; player.assists = 0; player.relicCarrier = false; player.downed = false; player.slowMs = 0; respawnPlayer(player, chooseSpawnFor(this.state.mode, this.map, player.team, this.state.players.values(), player)); player.spawnProtectMs = 0; this.aliveSinceMs.set(id, this.simulationNowMs); this.firstHitAtMs.delete(id); }
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
    this.breakables = createBreakables(map);
    this.mapHerbs = createHerbs(map);
    this.geyserLaunches.clear();
    this.rebuildPlayMap();
    this.syncBreakableState();
    this.syncMapHerbState(nowMs);
    resetRelic(this.state.relic, map);
    for (const player of this.state.players.values()) player.relicCarrier = false;
    this.state.hazards.clear();
    for (const boulder of map.boulders) {
      const hazard = new BoulderHazardState(); resetBoulderHazard(hazard, nowMs);
      const start = boulder.path[0]!; hazard.x = start[0]; hazard.y = start[1]; hazard.z = start[2]; this.state.hazards.set(boulder.id, hazard);
    }
  }

  private rebuildPlayMap(): void {
    this.playMap = mergeBreakablesIntoMap(this.map, this.breakables);
  }

  private syncBreakableState(): void {
    this.state.breakables.clear();
    for (const item of this.breakables) {
      const state = new BreakableState();
      state.hp = item.hp; state.broken = item.broken;
      this.state.breakables.set(item.id, state);
    }
  }

  private syncMapHerbState(nowMs: number): void {
    this.state.mapHerbs.clear();
    for (const herb of this.mapHerbs) {
      const state = new MapHerbState();
      state.x = herb.pos[0]; state.y = herb.pos[1]; state.z = herb.pos[2];
      state.ready = nowMs >= herb.readyAtMs;
      this.state.mapHerbs.set(herb.id, state);
    }
  }

  private stepMapFeatures(nowMs: number): void {
    const hasHerbs = this.mapHerbs.length > 0;
    const hasBreakables = this.breakables.length > 0;
    if (!hasHerbs && !hasBreakables) return;
    // Full-HP lobbies skip herb work most ticks; breakable rebuilds still run when needed.
    if (!hasBreakables && hasHerbs) {
      let hungry = false;
      for (const player of this.state.players.values()) {
        if (player.alive && player.hp < MAX_HP) { hungry = true; break; }
      }
      if (!hungry && (nowMs % 500) >= 16) return;
    }
    const players = hasBreakables ? [...this.state.players.values()] : [];
    const before = hasBreakables ? this.breakables.map((item) => item.broken) : [];
    if (hasBreakables) stepBreakables(this.breakables, players, nowMs);
    if (hasBreakables) {
      let solidsChanged = false;
      for (let index = 0; index < this.breakables.length; index += 1) {
        if (this.breakables[index]!.broken !== before[index]) solidsChanged = true;
        const state = this.state.breakables.get(this.breakables[index]!.id);
        if (state) { state.hp = this.breakables[index]!.hp; state.broken = this.breakables[index]!.broken; }
      }
      if (solidsChanged) this.rebuildPlayMap();
    }
    if (hasHerbs) {
      let pickedAny = false;
      for (const [sessionId, player] of this.state.players) {
        if (!player.alive || player.hp >= MAX_HP) continue;
        const picked = tryPickHerb(this.mapHerbs, player, nowMs);
        if (picked) {
          pickedAny = true;
          const state = this.state.mapHerbs.get(picked.id);
          if (state) state.ready = false;
        }
      }
      // Ready flags only need a refresh when something was picked or a respawn clock may have elapsed.
      if (pickedAny || (nowMs % 250) < 16) {
        for (const herb of this.mapHerbs) {
          const state = this.state.mapHerbs.get(herb.id);
          if (state) state.ready = nowMs >= herb.readyAtMs;
        }
      }
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
    this.killByWorld(targetId, "Jungle", "boulder", fromX, fromZ);
  }

  private killByWorld(targetId: string, killer: string, weapon: "boulder" | "fall", fromX: number, fromZ: number): void {
    const target = this.state.players.get(targetId); if (!target || !applyDamage(target, MAX_HP, this.simulationNowMs)) return;
    target.deaths += 1; target.respawnAtMs = this.simulationNowMs + RESPAWN_MS;
    const stats = this.humanStats.get(targetId); if (stats) recordDeath(stats);
    this.damage.delete(targetId);
    this.noteAuditKill(weapon, "", false, -1, targetId, target.team);
    this.broadcast("kill", { killer, victim: targetId, weapon, headshot: false, distance: Math.hypot(target.x - fromX, target.z - fromZ) });
  }

  /** Falling out of the world kills. A recent attacker is credited ("KNOCKED OFF"); otherwise the ravine takes them. */
  private checkFalls(): void {
    for (const [id, player] of this.state.players) {
      if (!player.alive || !isOutOfWorld(this.map, player.y)) continue;
      if (this.expedition) {
        // An Expedition fall costs health and puts the player back at camp.
        const spawn = this.map.spawns.sun[0]!;
        player.x = spawn.pos[0]; player.y = spawn.pos[1]; player.z = spawn.pos[2]; player.vx = 0; player.vy = 0; player.vz = 0;
        this.expedition.hurt(id, EXPEDITION_FALL_DAMAGE);
        continue;
      }
      const credited = fallCreditFor(this.damage.get(id)?.values() ?? [], this.simulationNowMs);
      const attacker = credited ? this.state.players.get(credited) : undefined;
      if (credited && attacker && attacker.team !== player.team) {
        // Spawn protection cannot save a body that already left the world.
        player.spawnProtectMs = 0;
        this.dealDamage(credited, id, MAX_HP, "fall", false, player.x, player.z);
      }
      if (player.alive) this.killByWorld(id, "Ravine", "fall", player.x, player.z);
    }
  }


  private checkpointAsked = false;

  /** A checkpoint start: the run begins after the highest checkpoint the first joining account has reached. */
  private loadCheckpoint(token: string): void {
    this.checkpointAsked = true;
    void gameDatabase().then(async (db) => {
      const accountId = await db.authenticate(token);
      if (accountId && this.state.phase === "warmup") this.startWave = checkpointFor(await db.expeditionBest(accountId));
    }).catch(() => undefined);
  }

  private expeditionHost(): ExpeditionHost {
    const room = this;
    return {
      get state() { return room.state; },
      get map() { return room.map; },
      now: () => this.simulationNowMs,
      humanStats: (id) => this.humanStats.get(id),
      broadcastWave: (message) => this.broadcast("wave", message),
      broadcastDown: (message) => this.broadcast("creatureDown", message),
      broadcastDowned: (message) => this.broadcast("downed", message),
      sendCreatureHit: (playerId, message) => this.clientById(playerId)?.send("creatureHit", message),
      addSpit: (arrow) => this.state.arrows.set(`spit-${this.arrowSerial += 1}`, arrow),
      runOver: () => {
        this.state.phase = "end"; this.state.phaseEndsAtMs = this.simulationNowMs + END_SCREEN_MS;
        this.sendMatchEnd();
      },
    };
  }

  /** Bots in an Expedition fight creatures: each creature is shown to them as an enemy player. */
  private creatureTargets(): Iterable<readonly [string, PlayerSim]> {
    for (const id of this.creatureEnemies.keys()) if (!this.state.creatures.has(id)) this.creatureEnemies.delete(id);
    for (const [id, creature] of this.state.creatures) {
      let enemy = this.creatureEnemies.get(id);
      if (!enemy) {
        enemy = createPlayerSim(); enemy.team = CREATURE_TEAM; this.creatureEnemies.set(id, enemy);
        // Bots aim at the middle of the body, or at the gem where there is one.
        const stats = creatureTuning(creature.kind);
        AIM_HEIGHTS.set(enemy, "gemHeightM" in stats ? stats.gemHeightM : stats.height * 0.5);
      }
      enemy.x = creature.x; enemy.y = creature.y; enemy.z = creature.z; enemy.vx = creature.vx; enemy.vy = creature.vy; enemy.vz = creature.vz;
      enemy.height = Math.max(1, creatureTuning(creature.kind).height); enemy.alive = true;
    }
    return [...this.state.players, ...this.creatureEnemies];
  }

  /** A creature's ink projectile: it hits players, never other creatures. Returns true when it is used up. */
  private spitStep(id: string, arrow: ArrowState, fromX: number, fromY: number, fromZ: number, worldHit: boolean): boolean {
    this.arrowFrom.x = fromX; this.arrowFrom.y = fromY; this.arrowFrom.z = fromZ;
    this.arrowTo.x = arrow.x; this.arrowTo.y = arrow.y; this.arrowTo.z = arrow.z;
    for (const [playerId, player] of this.state.players) {
      if (!player.alive || player.downed) continue;
      this.hitTarget.x = player.x; this.hitTarget.y = player.y; this.hitTarget.z = player.z; this.hitTarget.height = player.height; this.hitTarget.crouched = player.crouched;
      if (!sweepArrowVsTarget(this.arrowFrom, this.arrowTo, this.hitTarget)) continue;
      this.expedition?.spitHit(playerId);
      this.removeArrows.push(id);
      return true;
    }
    if (worldHit || this.simulationNowMs - arrow.bornMs >= ARROW_LIFETIME_MS) { this.removeArrows.push(id); return true; }
    return false;
  }

  /** What bots know about the relic in Relic Run. */
  private relicView(): RelicView | undefined {
    if (this.state.mode !== "relic") return undefined;
    const relic = this.state.relic;
    return { x: relic.x, y: relic.y, z: relic.z, carrier: relic.carrier, carrierTeam: this.state.players.get(relic.carrier)?.team ?? -1 };
  }

  private relicEvent(event: RelicMessage["event"], player: string, team: number): void {
    this.broadcast("relic", { event, player, team });
  }

  /** Relic Run each tick: the carrier carries it home, the ground timer runs out, and touches pick it up or send it back. */
  private stepRelic(): void {
    if (this.state.mode !== "relic" || this.state.phase !== "live") return;
    const relic = this.state.relic;
    if (relic.carrier) {
      const carrier = this.state.players.get(relic.carrier);
      if (!carrier || !carrier.alive) { this.dropCarried(relic.carrier, carrier); return; }
      relic.x = carrier.x; relic.y = carrier.y + RELIC_CARRY_HEIGHT_M; relic.z = carrier.z;
      if (!inCamp(this.map, carrier.team, carrier.x, carrier.y, carrier.z)) return;
      const id = relic.carrier;
      carrier.relicCarrier = false;
      resetRelic(relic, this.map);
      const stats = this.humanStats.get(id); if (stats) recordRelicCapture(stats);
      const carryMs = this.relicPickedAtMs > 0 ? Math.max(0, this.simulationNowMs - this.relicPickedAtMs) : 0;
      this.auditCaptures.push({ atMs: this.simulationNowMs, team: carrier.team, carryMs });
      this.relicPickedAtMs = 0;
      this.relicEvent("capture", id, carrier.team);
      if (scoreCapture(this.state, carrier.team, this.simulationNowMs)) this.sendMatchEnd();
      return;
    }
    if (relicExpired(relic, this.simulationNowMs)) { resetRelic(relic, this.map); this.relicEvent("return", "", -1); return; }
    for (const [id, player] of this.state.players) {
      if (!player.alive || !touchesRelic(relic, player.x, player.y, player.z)) continue;
      const action = relicTouch(relic, player.team, player.x);
      if (action === "return") { resetRelic(relic, this.map); this.relicEvent("return", id, player.team); return; }
      if (action !== "pickup") continue;
      relic.carrier = id; relic.home = false; player.relicCarrier = true;
      releaseGrapple(player, false);
      this.relicPickedAtMs = this.simulationNowMs;
      this.relicEvent("pickup", id, player.team);
      return;
    }
  }

  /** A carrier that died or left drops the relic where they were; a relic that fell out of the world goes home. */
  private dropCarried(id: string, carrier: PlayerState | undefined): void {
    const relic = this.state.relic;
    if (carrier) carrier.relicCarrier = false;
    const x = carrier?.x ?? relic.x, y = carrier?.y ?? relic.y - RELIC_CARRY_HEIGHT_M, z = carrier?.z ?? relic.z;
    if (isOutOfWorld(this.map, y) || y < this.map.bounds.min[1]) { resetRelic(relic, this.map); this.relicEvent("return", id, carrier?.team ?? -1); return; }
    dropRelic(relic, x, y, z, carrier?.team ?? -1, this.simulationNowMs);
    this.relicEvent("drop", id, carrier?.team ?? -1);
  }

  private addBot(team: number, source?: PlayerState): void {
    const id = `bot-${this.botSerial += 1}`; const spawn = chooseSpawnFor(this.state.mode, this.map, team, this.state.players.values());
    const player = source ?? new PlayerState(); player.name = `Doodle ${this.botSerial}`; player.team = team; player.isBot = true;
    if (!source) respawnPlayer(player, spawn);
    else { player.look.bowSkin = DEFAULT_LOADOUT.bow; player.look.arrowTrail = DEFAULT_LOADOUT.trail; player.look.outfit = DEFAULT_LOADOUT.outfit; player.look.killEffect = DEFAULT_LOADOUT.effect; }
    this.state.players.set(id, player); this.bots.set(id, new BotController(id, this.botSeedBase + this.botSerial, this.botDifficulty));
  }

  private fillBots(): void {
    if (this.rankedMode) return;
    const rules = modeRules(this.state.mode);
    if (this.expedition) {
      while (this.bots.size < this.expeditionBots) this.addBot(0);
      return;
    }
    if (!rules.teams) {
      while (this.state.players.size < rules.maxPlayers) this.addBot(freeTeam([...this.state.players.values()].map((player) => player.team)));
      return;
    }
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
      player.look.bowSkin = loadout.bow; player.look.arrowTrail = loadout.trail; player.look.outfit = loadout.outfit; player.look.killEffect = loadout.effect;
      if (this.rankedMode) {
        const profile = await (await gameDatabase()).profile(accountId);
        player.rank.tier = profile?.tier ?? "";
      }
      const blocked = await (await gameDatabase()).blockedAccountIds(accountId);
      for (const [otherId, otherAccount] of this.accounts) {
        if (otherId === sessionId) continue;
        const other = await otherAccount;
        if (other && blocked.includes(other)) {
          let set = this.mutedPings.get(sessionId);
          if (!set) { set = new Set(); this.mutedPings.set(sessionId, set); }
          set.add(otherId);
        }
      }
      // Also mute this player for people who blocked them.
      for (const [otherId, otherAccount] of this.accounts) {
        if (otherId === sessionId) continue;
        const other = await otherAccount;
        if (!other) continue;
        if (await (await gameDatabase()).isBlocked(other, accountId)) {
          let set = this.mutedPings.get(otherId);
          if (!set) { set = new Set(); this.mutedPings.set(otherId, set); }
          set.add(sessionId);
        }
      }
    } catch (error) {
      console.error(JSON.stringify({ event: "loadoutError", message: error instanceof Error ? error.message : String(error) }));
    }
  }

  /** Party rooms need a well-formed code; public rooms never take one. Ranked joins need a linked level-10 account. */
  async onAuth(_client: GameClient, options?: JoinOptions): Promise<boolean> {
    const partyRoom = this.roomName === PARTY_ROOM;
    if (partyRoom && !isPartyCode(options?.party)) throw new ServerError(400, "invalid party code");
    if (!partyRoom && options?.party !== undefined) throw new ServerError(400, "party codes join the party room");
    if (this.roomName === "ranked") {
      const token = options?.token;
      if (!token) throw new ServerError(401, "sign_in_required");
      if (options?.test && process.env.ALLOW_TEST_JOINS !== "1" && process.env.NODE_ENV !== "test") {
        throw new ServerError(403, "test_joins_disabled");
      }
      const db = await gameDatabase();
      const accountId = await db.authenticate(token);
      if (!accountId) throw new ServerError(401, "sign_in_required");
      const profile = await db.profile(accountId);
      if (!profile || !canQueueRanked(profile.progress.level, profile.linked.length > 0)) {
        throw new ServerError(403, "ranked_locked");
      }
    }
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
    if (options?.spectator) {
      if (!this.partyCode) throw new Error("spectator_party_only");
      this.spectators.add(client.sessionId);
      client.send("spectator", { ok: true });
      return;
    }

    if (options?.test && !this.testMode) {
      this.testMode = true;
      for (const id of this.bots.keys()) this.state.players.delete(id);
      this.bots.clear();
    }
    let sun = 0;
    let moon = 0;
    for (const player of this.state.players.values()) if (!player.isBot) player.team === 0 ? sun += 1 : moon += 1;
    let team = sun <= moon ? 0 : 1;
    const teams = modeRules(this.state.mode).teams;
    if (this.expedition) { team = 0; if (options?.checkpoint && options.token && !this.checkpointAsked) this.loadCheckpoint(options.token); }
    // Free for All: take over a bot's team number, or the lowest free one.
    if (!teams) {
      const bot = [...this.state.players.values()].find((player) => player.isBot);
      team = bot ? bot.team : freeTeam([...this.state.players.values()].map((player) => player.team));
    }
    // Friends in a party share a team while it has room for another human.
    else if (this.partyCode) {
      const first = [...this.state.players.values()].find((player) => !player.isBot);
      if (first) team = (first.team === 0 ? sun : moon) < TEAM_SIZE ? first.team : 1 - first.team;
    }
    const replaced = [...this.state.players].find(([, player]) => player.isBot && player.team === team);
    if (replaced) { this.state.players.delete(replaced[0]); this.bots.delete(replaced[0]); }
    const spawn = !teams ? chooseSpawnFor(this.state.mode, this.map, team, this.state.players.values()) : team === 0 ? this.map.spawns.sun[sun % this.map.spawns.sun.length]! : this.map.spawns.moon[moon % this.map.spawns.moon.length]!;
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
    if (this.testMode && teams && sun + moon + 1 >= TEAM_COUNT) this.lock();
  }

  async onDrop(client: GameClient): Promise<void> {
    await this.allowReconnection(client, RECONNECT_WINDOW_S);
  }

  onLeave(client: GameClient): void {
    this.spectators.delete(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    const accountPromise = this.accounts.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.aliveSinceMs.delete(client.sessionId); this.firstHitAtMs.delete(client.sessionId); this.damage.delete(client.sessionId);
    for (const key of [...this.geyserLaunches.keys()]) if (key.startsWith(`${client.sessionId}:`)) this.geyserLaunches.delete(key); this.accounts.delete(client.sessionId); this.humanStats.delete(client.sessionId); this.skills.delete(client.sessionId);
    this.updateBotDifficulty();
    if (this.rankedMode && accountPromise && this.state.phase === "live") {
      void accountPromise.then((accountId) => {
        if (!accountId || this.rankedLeft.has(accountId)) return;
        this.rankedLeft.add(accountId);
        return gameDatabase().then((db) => db.recordRankedLeave(accountId));
      });
    }
    if (player && !this.testMode && !this.expedition && !this.rankedMode) this.addBot(player.team, player);
    this.reportPlayers();
  }

  onDispose(): void { serverMetrics.roomClosed(this.reportedPlayers); this.reportedPlayers = 0; }

  private reportPlayers(): void { const count = this.state.players.size; serverMetrics.playerDelta(count - this.reportedPlayers); this.reportedPlayers = count; }
}
