import { CREATURE_TUNING, EXPEDITION, EXPEDITION_HANDICAPS, MAX_HP, type ExpeditionHandicapId } from "../../shared/constants.ts";
import { BTN } from "../../shared/input.ts";
import type { MapData } from "../../shared/maps/types.ts";
import { findPath, nearestWaypoint } from "../../shared/bots/nav.ts";
import { mulberry32, type SeededRng } from "../../shared/math/rng.ts";
import { createCreature, creatureDamage, creatureHit, stepCreature, type CreatureContext, type CreatureEvent, type CreatureTarget, type Heading } from "../../shared/sim/creatures.ts";
import { aliveCap, earnsSoloLife, gravityMultiplier, hpMultiplier, isBossWave, modifierFor, pickKind, waveCount, type CreatureKind, type WaveModifier } from "../../shared/sim/waves.ts";
import {
  TOTEM_ID, VILLAGE, VILLAGE_UPGRADES, applyUpgrade, emptyBuffs, rollShop,
  type VillageBuffs, type VillageUpgradeId,
} from "../../shared/sim/villageDefense.ts";
import { ArrowState, CreatureState, HerbState, type MatchState, type PlayerState } from "../../net/schema.ts";
import type { CreatureDownMessage, CreatureHitMessage, DownedMessage, WaveMessage } from "../../net/messages.ts";
import type { MatchStats } from "../../shared/matchStats.ts";

/** What the director needs from its room. */
export type ExpeditionHost = {
  readonly state: MatchState;
  readonly map: MapData;
  now(): number;
  humanStats(id: string): MatchStats | undefined;
  broadcastWave(message: WaveMessage): void;
  broadcastDown(message: CreatureDownMessage): void;
  broadcastDowned(message: DownedMessage): void;
  sendCreatureHit(playerId: string, message: CreatureHitMessage): void;
  addSpit(arrow: ArrowState): void;
  runOver(): void;
};

type Route = { path: { pos: readonly [number, number, number] }[]; index: number; refreshedAtMs: number; goalId: string };
/** Where a creature was when it last made progress, for the stuck check. */
type Progress = { x: number; z: number; atMs: number };
type MirePool = { x: number; z: number; radius: number; untilMs: number; dps: number; slowMult: number };
const walkable = (link: { kind: string }): boolean => link.kind === "walk" || link.kind === "jump" || link.kind === "drop";

const START_BREAK_MS = 3000;
const REVIVED_HP = 50;
/** The spit projectile is an arrow owned by nobody on a team no player is on. */
export const CREATURE_TEAM = 9;

/**
 * Runs an Expedition: waves of creatures, breaks with herbs, downed players and revives, solo lives,
 * and the end of the run. The room keeps players and arrows; the director keeps everything else.
 */
export class ExpeditionDirector {
  private readonly host: ExpeditionHost;
  private rng: SeededRng;
  private readonly handicaps: ExpeditionHandicapId[];
  private readonly rewardMult: number;
  private readonly spawnGapMult: number;
  private readonly breakMs: number;
  private readonly playerHpMult: number;
  private readonly soloLifeEvery: number;
  private toSpawn = 0;
  private nextSpawnAtMs = 0;
  private serial = 0;
  private readonly routes = new Map<string, Route>();
  private readonly playerBuffs = new Map<string, VillageBuffs>();
  private readonly ownedUpgrades = new Map<string, Set<VillageUpgradeId>>();
  private totemX = 0;
  private totemY = 0;
  private totemZ = 0;
  private readonly progress = new Map<string, Progress>();
  private mires: MirePool[] = [];

  constructor(host: ExpeditionHost, seed: number, handicaps: readonly ExpeditionHandicapId[] = []) {
    this.host = host;
    this.rng = mulberry32(seed);
    this.handicaps = [...handicaps];
    let rewardMult = 1;
    let spawnGapMult = 1;
    let breakMs: number = EXPEDITION.breakMs;
    let playerHpMult = 1;
    let soloLifeEvery: number = EXPEDITION.soloLifeEvery;
    for (const id of this.handicaps) {
      const handicap = EXPEDITION_HANDICAPS[id] as {
        rewardMult?: number; spawnGapMult?: number; breakMs?: number; hpMult?: number; soloLifeEvery?: number;
      };
      rewardMult *= handicap.rewardMult ?? 1;
      spawnGapMult *= handicap.spawnGapMult ?? 1;
      if (handicap.breakMs !== undefined) breakMs = handicap.breakMs;
      playerHpMult *= handicap.hpMult ?? 1;
      if (handicap.soloLifeEvery !== undefined) soloLifeEvery = handicap.soloLifeEvery;
    }
    this.rewardMult = rewardMult;
    this.spawnGapMult = spawnGapMult;
    this.breakMs = breakMs;
    this.playerHpMult = playerHpMult;
    this.soloLifeEvery = soloLifeEvery;
  }

  private get run() { return this.host.state.expedition; }

  /** Called once the map is loaded, so the totem and its health bar are there from the moment players arrive. */
  prepare(): void {
    this.placeTotem();
    this.run.totemMaxHp = VILLAGE.totemMaxHp; this.run.totemHp = VILLAGE.totemMaxHp;
  }

  /** A fresh run from a checkpoint: the first wave follows a short break. */
  reset(startWave: number): void {
    const run = this.run;
    run.wave = startWave; run.startWave = startWave; run.cleared = 0; run.bosses = 0; run.left = 0; run.modifier = "none";
    run.lives = 0;
    this.host.state.creatures.clear();
    this.mires = []; this.host.state.herbs.clear(); this.routes.clear(); this.progress.clear(); this.toSpawn = 0;
    this.playerBuffs.clear(); this.ownedUpgrades.clear();
    this.placeTotem();
    run.totemMaxHp = VILLAGE.totemMaxHp; run.totemHp = VILLAGE.totemMaxHp; run.coins = 0;
    run.shop0 = ""; run.shop1 = ""; run.shop2 = "";
    this.beginBreak(START_BREAK_MS);
  }

  gravityMult(): number { return gravityMultiplier(this.run.modifier); }
  rewardMultiplier(): number { return this.rewardMult; }
  playerHealthMult(): number { return this.playerHpMult; }

  private humans(): PlayerState[] { return [...this.host.state.players.values()]; }

  private placeTotem(): void {
    const map = this.host.map;
    // Maps built for Village Defense mark the totem; older Expedition maps fall back to their first herb or spawn.
    const pos = map.totem ?? map.herbSpawns?.[0] ?? map.spawns.sun[0]?.pos ?? ([0, 0, 0] as const);
    this.totemX = pos[0]; this.totemY = pos[1]; this.totemZ = pos[2];
  }

  private beginBreak(ms: number): void {
    const run = this.run, now = this.host.now();
    const shopMs = run.wave > run.startWave ? Math.max(ms, VILLAGE.shopMs) : ms;
    run.phase = "break"; run.phaseEndsAtMs = now + shopMs; run.left = 0;
    if (run.wave > run.startWave) {
      const owned = new Set<VillageUpgradeId>();
      for (const set of this.ownedUpgrades.values()) for (const id of set) owned.add(id);
      const picks = rollShop(() => this.rng(), owned);
      run.shop0 = picks[0] ?? ""; run.shop1 = picks[1] ?? ""; run.shop2 = picks[2] ?? "";
    } else { run.shop0 = ""; run.shop1 = ""; run.shop2 = ""; }
    this.host.state.herbs.clear();
    (this.host.map.herbSpawns ?? []).slice(0, EXPEDITION.herbs).forEach(([x, y, z], index) => {
      const herb = new HerbState(); herb.x = x; herb.y = y; herb.z = z; this.host.state.herbs.set(`herb-${run.wave}-${index}`, herb);
    });
    const spawns = this.host.map.spawns.sun;
    this.humans().forEach((player, index) => {
      player.inkCooldownMs = 0;
      if (player.downed) this.revive(player);
      if (!player.alive) {
        const spawn = spawns[index % spawns.length]!;
        player.x = spawn.pos[0]; player.y = spawn.pos[1]; player.z = spawn.pos[2]; player.yaw = spawn.yaw;
        player.vx = 0; player.vy = 0; player.vz = 0; player.hp = MAX_HP; player.alive = true; player.respawnAtMs = 0;
      }
    });
  }

  private beginWave(): void {
    const run = this.run, now = this.host.now();
    run.wave += 1;
    run.modifier = modifierFor(run.wave, this.rng);
    const players = Math.max(1, this.humans().length);
    this.toSpawn = waveCount(run.wave, players, run.modifier as WaveModifier);
    const boss = isBossWave(run.wave);
    if (boss) { this.spawn("colossus"); this.toSpawn = Math.ceil(this.toSpawn / 2); }
    run.phase = "fight"; run.phaseEndsAtMs = 0; this.nextSpawnAtMs = now;
    run.left = this.toSpawn + this.host.state.creatures.size;
    this.host.state.herbs.clear();
    this.host.broadcastWave({ event: "start", wave: run.wave, modifier: run.modifier, boss });
  }

  private spawn(kind: CreatureKind, near?: { x: number; z: number }): void {
    const spawns = this.host.map.creatureSpawns ?? this.host.map.spawns.moon.map((spawn) => spawn.pos);
    const [x, y, z] = near ? [near.x + (this.rng() - 0.5) * 4, 1, near.z + (this.rng() - 0.5) * 4] : spawns[Math.floor(this.rng() * spawns.length)]!;
    const sim = createCreature(kind, x, kind === "wisp" ? y + CREATURE_TUNING.wisp.hoverM : y, z, hpMultiplier(this.run.modifier as WaveModifier), Math.max(1, this.humans().length));
    const creature = new CreatureState(); Object.assign(creature, sim);
    this.host.state.creatures.set(`c${this.serial += 1}`, creature);
  }

  /** Called once per room tick while the match is live. */
  step(dt: number, dtMs: number): void {
    const run = this.run, now = this.host.now();
    if (run.phase === "over") return;
    this.stepPlayers(dtMs);
    // stepPlayers ends the run when nobody is left standing.
    if ((run.phase as string) === "over") return;
    if (run.phase === "break") {
      this.pickHerbs();
      if (now >= run.phaseEndsAtMs) this.beginWave();
      return;
    }
    const creatures = this.host.state.creatures;
    if (this.toSpawn > 0 && now >= this.nextSpawnAtMs && creatures.size < aliveCap(run.wave)) {
      this.spawn(pickKind(run.wave, this.rng)); this.toSpawn -= 1; this.nextSpawnAtMs = now + EXPEDITION.spawnGapMs * this.spawnGapMult;
    }
    const targets: CreatureTarget[] = [];
    for (const [id, player] of this.host.state.players) {
      if (!player.alive || player.downed) continue;
      const target = { id, x: player.x, y: player.y, z: player.z, grounded: player.grounded };
      targets.push(target);
    }
    if (this.run.totemHp > 0) {
      targets.push({ id: TOTEM_ID, x: this.totemX, y: this.totemY, z: this.totemZ, grounded: true });
    }
    const allies = [...creatures.entries()]
      .filter(([, creature]) => creature.hp > 0)
      .map(([allyId, creature]) => ({ id: allyId, x: creature.x, y: creature.y, z: creature.z }));
    const ctx: CreatureContext = { map: this.host.map, targets, allies, dt, gravityMult: this.gravityMult(), steer: (creature, target) => this.steer(creature as CreatureState, target, now) };
    for (const [id, creature] of creatures) {
      this.currentCreature = id;
      for (const event of stepCreature(creature, ctx)) this.apply(id, event, targets);
      if (creature.y < this.host.map.bounds.min[1] - 5) this.remove(id, creature, "");
      else this.checkStuck(id, creature, targets, now);
    }
    this.tickMires(dt);
    run.left = this.toSpawn + creatures.size;
    if (this.toSpawn === 0 && creatures.size === 0) this.clearWave();
  }

  private currentCreature = "";

  /**
   * A walking creature that has stayed near one spot for a while (hopping against a wall counts as staying) and has nobody in reach is stuck on the level;
   * it comes back in at the waypoint it was trying to reach (or a spawn point) so a wave can always be cleared.
   */
  private checkStuck(id: string, creature: CreatureState, targets: readonly CreatureTarget[], now: number): void {
    const last = this.progress.get(id);
    if (!last || Math.hypot(creature.x - last.x, creature.z - last.z) >= EXPEDITION.stuckMoveM) { this.progress.set(id, { x: creature.x, z: creature.z, atMs: now }); return; }
    if (now - last.atMs < EXPEDITION.stuckMs || creature.kind === "wisp") return;
    const stats = CREATURE_TUNING[creature.kind as CreatureKind];
    const reach = creature.kind === "spitter" ? CREATURE_TUNING.spitter.keepMaxM + 3 : creature.kind === "colossus" ? CREATURE_TUNING.colossus.stompRadiusM : stats.radius + ("reachM" in stats ? stats.reachM : 0) + 1;
    if (targets.some((target) => Math.hypot(target.x - creature.x, target.z - creature.z) <= reach)) { last.atMs = now; return; }
    const route = this.routes.get(id);
    const spawns = this.host.map.creatureSpawns ?? this.host.map.spawns.moon.map((spawn) => spawn.pos);
    const [x, y, z] = route?.path[route.index]?.pos ?? spawns[Math.floor(this.rng() * spawns.length)]!;
    creature.x = x; creature.y = y; creature.z = z; creature.vx = 0; creature.vy = 0; creature.vz = 0;
    if (route) route.index += 1;
    this.progress.set(id, { x, z, atMs: now });
    this.unstuck += 1;
  }

  /** How many times a stuck creature was sent back to a spawn point, for the soak report. */
  unstuck = 0;

  /** Creatures far from their target follow the waypoint graph, refreshed every so often. */
  private readonly heading: Heading = { x: 0, y: 0, z: 0 };
  private steer(creature: CreatureState, target: CreatureTarget, now: number): Heading | null {
    if (Math.hypot(target.x - creature.x, target.z - creature.z) <= EXPEDITION.directChaseM) return null;
    const id = this.currentCreature;
    let route = this.routes.get(id);
    const goal = nearestWaypoint(this.host.map, target.x, target.y, target.z);
    if (!route || now - route.refreshedAtMs > EXPEDITION.pathRefreshMs || route.goalId !== goal.id) {
      const start = nearestWaypoint(this.host.map, creature.x, creature.y, creature.z, true);
      const path = findPath(this.host.map, start.id, goal.id, walkable);
      // The nearest waypoint is often one the creature just passed; start past it when the second is closer from here.
      const skip = path.length >= 2 && Math.hypot(path[1]!.pos[0] - creature.x, path[1]!.pos[2] - creature.z) < Math.hypot(path[1]!.pos[0] - path[0]!.pos[0], path[1]!.pos[2] - path[0]!.pos[2]) ? 1 : 0;
      route = { path, index: skip, refreshedAtMs: now, goalId: goal.id };
      this.routes.set(id, route);
    }
    while (route.index < route.path.length) {
      const point = route.path[route.index]!.pos;
      if (Math.hypot(point[0] - creature.x, point[2] - creature.z) > 1.2) { this.heading.x = point[0]; this.heading.y = point[1]; this.heading.z = point[2]; return this.heading; }
      route.index += 1;
    }
    return null;
  }


  /** Ink mires planted by Mire Blooms: damage and slow players standing in them. */
  private tickMires(dt: number): void {
    const now = this.host.now();
    this.mires = this.mires.filter((pool) => pool.untilMs > now);
    if (this.mires.length === 0) return;
    const seconds = dt > 2 ? dt / 1000 : dt;
    for (const [playerId, player] of this.host.state.players) {
      if (!player.alive || player.downed) continue;
      for (const pool of this.mires) {
        if (Math.hypot(player.x - pool.x, player.z - pool.z) > pool.radius) continue;
        this.hurt(playerId, pool.dps * seconds);
        player.slowMs = Math.max(player.slowMs, 400);
        break;
      }
    }
  }

  private apply(id: string, event: CreatureEvent, targets: readonly CreatureTarget[]): void {
    if (event.type === "melee") this.hurt(event.target, event.damage);
    else if (event.type === "stomp") {
      for (const target of targets) if (target.grounded && Math.hypot(target.x - event.x, target.z - event.z) <= event.radius) this.hurt(target.id, event.damage);
    } else if (event.type === "summon") {
      for (let index = 0; index < event.count; index += 1) this.spawn("beetle", { x: event.x, z: event.z });
    } else if (event.type === "mire") {
      this.mires.push({
        x: event.x,
        z: event.z,
        radius: event.radius,
        untilMs: this.host.now() + event.durationMs,
        dps: event.dps,
        slowMult: event.slowMult,
      });
    } else if (event.type === "heal") {
      for (const targetId of event.targets) {
        const creature = this.host.state.creatures.get(targetId);
        if (!creature || creature.hp <= 0) continue;
        creature.hp = Math.min(creature.maxHp, creature.hp + event.amount);
      }
    } else if (event.type === "spit") {
      const arrow = new ArrowState();
      arrow.x = event.x; arrow.y = event.y; arrow.z = event.z; arrow.prevX = event.x; arrow.prevY = event.y; arrow.prevZ = event.z;
      arrow.vx = event.vx; arrow.vy = event.vy; arrow.vz = event.vz;
      arrow.kind = "spit"; arrow.owner = id; arrow.team = CREATURE_TEAM; arrow.damage = CREATURE_TUNING.spitter.damage; arrow.bornMs = this.host.now();
      this.host.addSpit(arrow);
    }
  }

  /** A spit projectile reached a player: damage and the ink slow. */
  /** Between-wave shop: spend coins on one of the three offers. */
  pickUpgrade(playerId: string, upgradeId: string): boolean {
    const run = this.run;
    if (run.phase !== "break") return false;
    const offers = [run.shop0, run.shop1, run.shop2];
    if (!offers.includes(upgradeId)) return false;
    const def = VILLAGE_UPGRADES.find((row) => row.id === upgradeId);
    if (!def || run.coins < def.cost) return false;
    run.coins -= def.cost;
    if (upgradeId === "totemRepair") {
      run.totemHp = Math.min(run.totemMaxHp, run.totemHp + run.totemMaxHp * 0.35);
      return true;
    }
    const id = upgradeId as VillageUpgradeId;
    const owned = this.ownedUpgrades.get(playerId) ?? new Set<VillageUpgradeId>();
    owned.add(id); this.ownedUpgrades.set(playerId, owned);
    const buffs = applyUpgrade(this.playerBuffs.get(playerId) ?? emptyBuffs(), id);
    this.playerBuffs.set(playerId, buffs);
    const player = this.host.state.players.get(playerId);
    if (player && id === "moreHealth") {
      player.hp = Math.min(Math.round(MAX_HP * buffs.hpMult), Math.round(player.hp * buffs.hpMult));
    }
    return true;
  }

  buffsFor(playerId: string): VillageBuffs { return this.playerBuffs.get(playerId) ?? emptyBuffs(); }

  spitHit(targetId: string): void {
    const player = this.host.state.players.get(targetId);
    if (!player || !player.alive || player.downed) return;
    player.slowMs = CREATURE_TUNING.spitter.slowMs;
    this.hurt(targetId, CREATURE_TUNING.spitter.damage);
  }

  /** Creature damage to a player. At zero a player goes down instead of dying; a solo player with a spare life gets straight up. */
  hurt(playerId: string, damage: number): void {
    if (playerId === TOTEM_ID) {
      const run = this.run;
      if (run.totemHp <= 0) return;
      run.totemHp = Math.max(0, run.totemHp - damage);
      if (run.totemHp <= 0) this.end();
      return;
    }
    const player = this.host.state.players.get(playerId);
    if (!player || !player.alive || player.downed) return;
    player.hp -= damage; player.lastDamageAtMs = this.host.now();
    if (player.hp > 0) return;
    const run = this.run;
    if (this.humans().length === 1 && run.lives > 0) {
      run.lives -= 1; player.hp = REVIVED_HP;
      this.host.broadcastDowned({ player: playerId, event: "life" });
      return;
    }
    player.hp = 1; player.downed = true; player.downedMs = EXPEDITION.downedMs; player.reviveMs = 0;
    player.grappleActive = false; player.drawMs = 0; player.deaths += 1;
    this.host.broadcastDowned({ player: playerId, event: "down" });
  }

  private revive(player: PlayerState): void {
    player.downed = false; player.downedMs = 0; player.reviveMs = 0; player.hp = REVIVED_HP;
  }

  /** Bleed-out timers, revives by a teammate holding Use nearby, and the end of the run when nobody is left standing. */
  private stepPlayers(dtMs: number): void {
    const players = [...this.host.state.players];
    for (const [id, player] of players) {
      if (!player.downed) continue;
      player.downedMs -= dtMs;
      const helper = players.find(([otherId, other]) => otherId !== id && other.alive && !other.downed && (other.prevButtons & BTN.USE) !== 0
        && Math.hypot(other.x - player.x, other.z - player.z) <= EXPEDITION.reviveRangeM);
      player.reviveMs = helper ? player.reviveMs + dtMs : Math.max(0, player.reviveMs - dtMs);
      if (player.reviveMs >= EXPEDITION.reviveMs) {
        this.revive(player);
        this.host.broadcastDowned({ player: id, event: "revived" });
      } else if (player.downedMs <= 0) {
        player.downed = false; player.alive = false; player.respawnAtMs = Number.POSITIVE_INFINITY;
        this.host.broadcastDowned({ player: id, event: "out" });
      }
    }
    if (players.length > 0 && players.every(([, player]) => !player.alive || player.downed)) this.end();
  }

  private pickHerbs(): void {
    for (const [herbId, herb] of this.host.state.herbs) {
      for (const player of this.host.state.players.values()) {
        if (!player.alive || player.downed || player.hp >= MAX_HP) continue;
        if (Math.hypot(player.x - herb.x, player.y - herb.y, player.z - herb.z) > EXPEDITION.herbTouchM + 1) continue;
        player.hp = Math.min(MAX_HP, player.hp + EXPEDITION.herbHeal);
        this.host.state.herbs.delete(herbId);
        break;
      }
    }
  }

  private clearWave(): void {
    const run = this.run;
    run.cleared = run.wave - run.startWave;
    const players = this.humans().length;
    if (earnsSoloLife(run.wave, players)) run.lives += 1;
    for (const id of this.host.state.players.keys()) {
      const stats = this.host.humanStats(id); if (stats) stats.waveReached = Math.max(stats.waveReached, run.wave);
    }
    run.coins = Math.min(9999, run.coins + VILLAGE.coinWave);
    this.host.broadcastWave({ event: "clear", wave: run.wave, modifier: run.modifier, boss: isBossWave(run.wave) });
    this.beginBreak(this.breakMs);
  }

  private end(): void {
    const run = this.run;
    run.phase = "over";
    this.host.state.creatures.clear();
    this.host.broadcastWave({ event: "over", wave: run.wave, modifier: run.modifier, boss: false });
    this.host.runOver();
  }

  /** An arrow step against every creature. Returns true when the arrow is used up. */
  arrowStep(shooter: string, arrow: ArrowState, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): boolean {
    for (const [id, creature] of this.host.state.creatures) {
      const hit = creatureHit(creature, from, to);
      if (!hit) continue;
      const result = creatureDamage(creature, arrow.damage, hit, arrow.vx, arrow.vz);
      this.host.sendCreatureHit(shooter, { id, damage: result.damage, gem: hit.gem, blocked: result.blocked });
      creature.hp -= result.damage;
      if (creature.hp <= 0) this.remove(id, creature, shooter);
      return true;
    }
    return false;
  }

  /** A dagger swing against creatures in front of the player. */
  melee(attacker: string, x: number, y: number, z: number, yaw: number, damage: number, reach: number): void {
    for (const [id, creature] of this.host.state.creatures) {
      const dx = creature.x - x, dz = creature.z - z, distance = Math.hypot(dx, dz);
      if (distance > reach + CREATURE_TUNING[creature.kind as CreatureKind].radius || Math.abs(creature.y - y) > 3) continue;
      if (distance > 0.01 && (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / distance < 0.5) continue;
      creature.hp -= damage;
      this.host.sendCreatureHit(attacker, { id, damage, gem: false, blocked: false });
      if (creature.hp <= 0) this.remove(id, creature, attacker);
      return;
    }
  }

  private remove(id: string, creature: CreatureState, killer: string): void {
    const run = this.run;
    const boss = creature.kind === "colossus";
    run.coins = Math.min(9999, run.coins + (boss ? VILLAGE.coinBoss : VILLAGE.coinKill));
    this.host.state.creatures.delete(id);
    this.routes.delete(id);
    this.progress.delete(id);
    const player = killer ? this.host.state.players.get(killer) : undefined;
    if (player) player.kills += 1;
    if (creature.kind === "colossus") {
      this.run.bosses += 1;
      for (const playerId of this.host.state.players.keys()) {
        const stats = this.host.humanStats(playerId); if (stats) stats.colossusKills += 1;
      }
    }
    this.host.broadcastDown({ id, kind: creature.kind, killer });
  }

  /** Test hook: the creatures still to come this wave. */
  get pending(): number { return this.toSpawn; }
}
