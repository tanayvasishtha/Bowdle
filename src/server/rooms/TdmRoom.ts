import { Room, type Client, type Rewind, type StepContext as RoomStepContext } from "@colyseus/core";
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
  MAX_REWIND_MS,
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
} from "../../shared/constants.ts";
import type { PlayerInputFrame } from "../../shared/input.ts";
import { notebookMap } from "../../shared/maps/notebook.ts";
import { PITCH_LIMIT } from "../../shared/math/angles.ts";
import { ArrowState, InkCloudState, MatchState, PlayerInput, PlayerState } from "../../net/schema.ts";
import { SetNameMessage, type DamagedMessage, type HitConfirmMessage, type KillMessage, type MatchEndMessage, type RobinHoodMessage } from "../../net/messages.ts";
import { spawnArrow, stepArrow, sweepArrowVsTarget } from "../../shared/sim/arrows.ts";
import { applyDamage, stepRegen } from "../../shared/sim/health.ts";
import { chooseSpawn, respawnPlayer, scoreKill, updateMatchPhase } from "../../shared/sim/match.ts";
import { meleeHit } from "../../shared/sim/melee.ts";
import { stepPlayer } from "../../shared/sim/movement.ts";
import { segmentDistance } from "../../shared/math/segments.ts";
import { BotController } from "../bots/BotController.ts";
import { spawnAbilityProjectile, type GrappleEvent, type InkEvent } from "../../shared/sim/abilities.ts";

type JoinOptions = { name?: string; test?: boolean };
type ServerMessages = { kill: KillMessage; hitConfirm: HitConfirmMessage; damaged: DamagedMessage; matchEnd: MatchEndMessage; robinHood: RobinHoodMessage };
type GameClient = Client<{ messages: ServerMessages }>;
type DamageRecord = { attacker: string; damage: number; atMs: number };
type ArrowOrigin = { x: number; z: number };

export class TdmRoom extends Room<{ state: MatchState; input: PlayerInput; client: GameClient }> {
  maxClients = TEAM_SIZE * 2;
  maxMessagesPerSecond = TICK_HZ;
  state = new MatchState();
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
  private rewindState!: Rewind;
  private arrowSerial = 0;
  private cloudSerial = 0;
  private botSerial = 0;
  private simulationNowMs = 0;
  private testMode = false;
  private readonly bots = new Map<string, BotController>();

  onCreate(): void {
    this.state.phase = "warmup";
    this.state.phaseEndsAtMs = WARMUP_MS;
    this.rewindState = this.allowRewindState({ maxRewindMs: MAX_REWIND_MS });
    this.rewindState.attachAll(this.state.players, { fields: ["x", "y", "z", "height", "yaw"], mode: "snapshot" });
    this.fillBots();
    this.onMessage("setName", SetNameMessage, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.name = message.name;
    });
    this.setFixedTimestep((context) => this.simulateTick(context, this.clock.elapsedTime), TICK_HZ, { subSteps: SUBSTEPS });
  }

  simulateTick(context: RoomStepContext, nowMs: number): void {
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
        this.applyEvents(sessionId, player, stepPlayer(player, frame, notebookMap, { nowMs }));
      }
    }
    for (const [id, controller] of this.bots) {
      const player = this.state.players.get(id); if (!player?.alive) continue;
      player.spawnProtectMs = Math.max(0, player.spawnProtectMs - context.dtMs);
      const frame = controller.update(player, this.state.players, notebookMap, nowMs, this.state.inkClouds.values());
      this.applyEvents(id, player, stepPlayer(player, frame, notebookMap, { nowMs }));
    }
    this.stepArrows(context);
    for (const [id, cloud] of this.state.inkClouds) if (cloud.expiresAtMs <= nowMs) this.state.inkClouds.delete(id);
    for (const player of this.state.players.values()) {
      if (player.alive) stepRegen(player, nowMs, context.dt);
      else if (nowMs >= player.respawnAtMs) respawnPlayer(player, chooseSpawn(notebookMap, player.team, this.state.players.values()));
    }
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
        const world = stepArrow(arrow, notebookMap, context.subDt, gravity);
        let targetId = "", headshot = false, earliest = Number.POSITIVE_INFINITY;
        if (arrow.kind === "arrow") {
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
        } else if (world.worldHit || this.simulationNowMs - arrow.bornMs >= ARROW_LIFETIME_MS) {
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

  private dealDamage(attackerId: string, targetId: string, damage: number, weapon: "arrow" | "dagger", headshot: boolean, fromX: number, fromZ: number, origin?: ArrowOrigin): void {
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
    this.broadcast("kill", { killer: attackerId, victim: targetId, weapon, headshot, distance });
    if (scoreKill(this.state, attacker.team, this.simulationNowMs)) this.sendMatchEnd();
  }

  private clientById(sessionId: string): GameClient | undefined { return this.clients.find((client) => client.sessionId === sessionId); }
  private deleteArrow(id: string): void { this.state.arrows.delete(id); this.arrowOrigins.delete(id); }
  private sendMatchEnd(): void {
    const winner = this.state.scoreRed === this.state.scoreGreen ? "draw" : this.state.scoreRed > this.state.scoreGreen ? "red" : "green";
    let mvp = "", kills = -1; for (const [id, player] of this.state.players) if (player.kills > kills) { kills = player.kills; mvp = id; }
    this.broadcast("matchEnd", { winner, mvp });
  }
  private resetPlayers(): void {
    this.state.arrows.clear(); this.state.inkClouds.clear(); this.arrowOrigins.clear(); this.damage.clear();
    for (const player of this.state.players.values()) { player.kills = 0; player.deaths = 0; player.assists = 0; respawnPlayer(player, chooseSpawn(notebookMap, player.team, this.state.players.values())); player.spawnProtectMs = 0; }
  }

  private addBot(team: number, source?: PlayerState): void {
    const id = `bot-${this.botSerial += 1}`; const spawn = chooseSpawn(notebookMap, team, this.state.players.values());
    const player = source ?? new PlayerState(); player.name = `Doodle ${this.botSerial}`; player.team = team; player.isBot = true;
    if (!source) respawnPlayer(player, spawn);
    this.state.players.set(id, player); this.bots.set(id, new BotController(id, this.botSerial));
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
    this.state.players.delete(id); this.addBot(player.team, player);
  }

  onJoin(client: GameClient, options?: JoinOptions): void {
    if (options?.test && !this.testMode) {
      this.testMode = true;
      for (const id of this.bots.keys()) this.state.players.delete(id);
      this.bots.clear();
    }
    let red = 0;
    let green = 0;
    for (const player of this.state.players.values()) if (!player.isBot) player.team === 0 ? red += 1 : green += 1;
    const team = red <= green ? 0 : 1;
    const replaced = [...this.state.players].find(([, player]) => player.isBot && player.team === team);
    if (replaced) { this.state.players.delete(replaced[0]); this.bots.delete(replaced[0]); }
    const spawn = team === 0 ? notebookMap.spawns.red[red % notebookMap.spawns.red.length]! : notebookMap.spawns.green[green % notebookMap.spawns.green.length]!;
    const player = new PlayerState();
    player.name = options?.name?.trim().slice(0, MAX_NAME_LENGTH) || "Player";
    player.team = team;
    player.x = spawn.pos[0]; player.y = spawn.pos[1]; player.z = spawn.pos[2]; player.yaw = spawn.yaw;
    if (options?.test) {
      player.x = team === 0 ? -TEST_DUEL_HALF_DISTANCE : TEST_DUEL_HALF_DISTANCE;
      player.y = 0; player.z = TEST_DUEL_LANE_Z; player.yaw = team === 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    this.state.players.set(client.sessionId, player);
    if (this.testMode && red + green + 1 >= TEAM_COUNT) this.lock();
  }

  async onDrop(client: GameClient): Promise<void> {
    await this.allowReconnection(client, RECONNECT_WINDOW_S);
  }

  onLeave(client: GameClient): void {
    const player = this.state.players.get(client.sessionId); this.state.players.delete(client.sessionId);
    if (player && !this.testMode) this.addBot(player.team, player);
  }
}
