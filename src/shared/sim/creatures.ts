import { ARROW_RADIUS, CREATURE_TUNING, EXPEDITION, GRAVITY, JUMP_VELOCITY } from "../constants.ts";
import type { MapData } from "../maps/types.ts";
import { segmentDistance } from "../math/segments.ts";
import { movePlayer, moveResult } from "./collision.ts";
import { bossHp, type CreatureKind } from "./waves.ts";

export type CreatureAction = "move" | "windup" | "dive" | "rise";

/** One creature. Plain data so the room's schema state can be stepped directly, like players. */
export type CreatureSim = {
  kind: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; yaw: number;
  hp: number; maxHp: number; action: string; actionMs: number; cooldownMs: number; summoned: boolean; grounded: boolean;
};

export type CreatureTarget = { id: string; x: number; y: number; z: number; grounded: boolean };

export type CreatureEvent =
  | { type: "melee"; target: string; damage: number }
  | { type: "spit"; target: string; x: number; y: number; z: number; vx: number; vy: number; vz: number }
  | { type: "stomp"; x: number; z: number; radius: number; damage: number }
  | { type: "summon"; count: number; x: number; z: number };

/**
 * steer returns where to walk next toward a far target (the next route waypoint), or null to walk straight.
 * Targets are the players a creature may attack: alive and not downed.
 */
export type CreatureContext = { map: MapData; targets: readonly CreatureTarget[]; dt: number; gravityMult: number; steer?: (creature: CreatureSim, target: CreatureTarget) => Heading | null };
/** Where a creature walks next; y lets a blocked creature leap high enough for a ledge. */
export type Heading = { x: number; y: number; z: number };

export function tuning(kind: string): (typeof CREATURE_TUNING)[CreatureKind] {
  return CREATURE_TUNING[(kind in CREATURE_TUNING ? kind : "beetle") as CreatureKind];
}

export function createCreature(kind: CreatureKind, x: number, y: number, z: number, hpMult = 1, players = 1): CreatureSim {
  const hp = Math.round((kind === "colossus" ? bossHp(players) : CREATURE_TUNING[kind].hp) * (kind === "colossus" ? 1 : hpMult));
  return { kind, x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, hp, maxHp: hp, action: "move", actionMs: 0, cooldownMs: 0, summoned: false, grounded: false };
}

function nearest(creature: CreatureSim, targets: readonly CreatureTarget[]): { target: CreatureTarget; distance: number } | null {
  let best: CreatureTarget | null = null, bestDistance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const distance = Math.hypot(target.x - creature.x, target.z - creature.z);
    if (distance < bestDistance) { best = target; bestDistance = distance; }
  }
  return best ? { target: best, distance: bestDistance } : null;
}

/**
 * Walks on the ground toward a point, with collision; creatures use the player-sized collision body.
 * A creature that walks into a wall hops, or leaps as high as the point it heads for when that is higher.
 */
function walk(creature: CreatureSim, ctx: CreatureContext, toX: number, toZ: number, speed: number, toY = creature.y): void {
  const dx = toX - creature.x, dz = toZ - creature.z, length = Math.hypot(dx, dz);
  creature.vx = length > 0.05 ? dx / length * speed : 0;
  creature.vz = length > 0.05 ? dz / length * speed : 0;
  if (length > 0.05) creature.yaw = Math.atan2(-dx, -dz);
  creature.vy -= GRAVITY * ctx.gravityMult * ctx.dt;
  const body = { x: creature.x, y: creature.y, z: creature.z, vx: creature.vx, vy: creature.vy, vz: creature.vz, height: tuning(creature.kind).height, grounded: creature.grounded };
  movePlayer(body, ctx.map, ctx.dt);
  if (creature.grounded && speed > 0 && moveResult.hitWall) {
    const rise = toY - creature.y + EXPEDITION.leapClearanceM;
    const leap = rise > 0 ? Math.sqrt(2 * GRAVITY * ctx.gravityMult * rise) : 0;
    body.vy = Math.min(EXPEDITION.creatureLeapMaxMps, Math.max(JUMP_VELOCITY * EXPEDITION.creatureHopMult, leap));
  }
  creature.x = body.x; creature.y = body.y; creature.z = body.z; creature.vy = body.vy; creature.grounded = body.grounded;
}

function face(creature: CreatureSim, target: CreatureTarget): void {
  creature.yaw = Math.atan2(-(target.x - creature.x), -(target.z - creature.z));
}

/** Where to head: the route's next waypoint for far targets, otherwise the target itself. */
const direct: Heading = { x: 0, y: 0, z: 0 };
function headFor(creature: CreatureSim, ctx: CreatureContext, target: CreatureTarget): Heading {
  const routed = ctx.steer?.(creature, target);
  if (routed) return routed;
  direct.x = target.x; direct.y = target.y; direct.z = target.z;
  return direct;
}

export function stepCreature(creature: CreatureSim, ctx: CreatureContext): CreatureEvent[] {
  const events: CreatureEvent[] = [];
  const dtMs = ctx.dt * 1000;
  creature.cooldownMs = Math.max(0, creature.cooldownMs - dtMs);
  creature.actionMs = Math.max(0, creature.actionMs - dtMs);
  const found = nearest(creature, ctx.targets);
  switch (creature.kind) {
    case "spitter": stepSpitter(creature, ctx, found, events); break;
    case "wisp": stepWisp(creature, ctx, found, events); break;
    case "colossus": stepColossus(creature, ctx, found, events); break;
    default: stepMelee(creature, ctx, found, events);
  }
  return events;
}

/** Beetles and guardians: walk up and strike when in reach. */
function stepMelee(creature: CreatureSim, ctx: CreatureContext, found: ReturnType<typeof nearest>, events: CreatureEvent[]): void {
  const stats = creature.kind === "guardian" ? CREATURE_TUNING.guardian : CREATURE_TUNING.beetle;
  if (!found) { walk(creature, ctx, creature.x, creature.z, 0); return; }
  const { target, distance } = found;
  const reach = stats.radius + stats.reachM;
  if (distance <= reach && Math.abs(target.y - creature.y) < 2) {
    walk(creature, ctx, creature.x, creature.z, 0); face(creature, target);
    if (creature.cooldownMs <= 0) { events.push({ type: "melee", target: target.id, damage: stats.damage }); creature.cooldownMs = stats.cooldownMs; }
    return;
  }
  const head = headFor(creature, ctx, target);
  walk(creature, ctx, head.x, head.z, stats.speed, head.y);
}

/** Spitters hold 15 to 25 m away and lob slowing ink. */
function stepSpitter(creature: CreatureSim, ctx: CreatureContext, found: ReturnType<typeof nearest>, events: CreatureEvent[]): void {
  const stats = CREATURE_TUNING.spitter;
  if (!found) { walk(creature, ctx, creature.x, creature.z, 0); return; }
  const { target, distance } = found;
  if (distance < stats.keepMinM) {
    walk(creature, ctx, creature.x - (target.x - creature.x), creature.z - (target.z - creature.z), stats.speed);
  } else if (distance > stats.keepMaxM) {
    const head = headFor(creature, ctx, target);
    walk(creature, ctx, head.x, head.z, stats.speed, head.y);
  } else walk(creature, ctx, creature.x, creature.z, 0);
  if (distance <= stats.keepMaxM + 3) {
    face(creature, target);
    if (creature.cooldownMs <= 0) {
      const fromY = creature.y + stats.height, toY = target.y + 1.2;
      const dx = target.x - creature.x, dy = toY - fromY, dz = target.z - creature.z, length = Math.hypot(dx, dy, dz) || 1;
      events.push({ type: "spit", target: target.id, x: creature.x, y: fromY, z: creature.z, vx: dx / length * stats.projectileSpeed, vy: dy / length * stats.projectileSpeed, vz: dz / length * stats.projectileSpeed });
      creature.cooldownMs = stats.cooldownMs;
    }
  }
}

/** Wisps hover above the nearest player, dive at them, strike on contact and climb back. */
function stepWisp(creature: CreatureSim, ctx: CreatureContext, found: ReturnType<typeof nearest>, events: CreatureEvent[]): void {
  const stats = CREATURE_TUNING.wisp;
  creature.grounded = false;
  if (!found) { creature.vx = 0; creature.vy = 0; creature.vz = 0; return; }
  const { target, distance } = found;
  const chestY = target.y + 1.1;
  if (creature.action === "dive") {
    const dx = target.x - creature.x, dy = chestY - creature.y, dz = target.z - creature.z, length = Math.hypot(dx, dy, dz) || 1;
    creature.vx = dx / length * stats.diveSpeed; creature.vy = dy / length * stats.diveSpeed; creature.vz = dz / length * stats.diveSpeed;
    if (length <= stats.reachM) {
      events.push({ type: "melee", target: target.id, damage: stats.damage });
      creature.action = "rise"; creature.actionMs = 700; creature.cooldownMs = stats.cooldownMs;
    } else if (creature.actionMs <= 0) { creature.action = "rise"; creature.actionMs = 700; }
  } else {
    if (creature.action === "rise" && creature.actionMs <= 0) creature.action = "move";
    // Circle above the target with a wobble so wisps never line up.
    const wobble = Math.sin((creature.x + creature.z) * 0.7 + creature.hp) * 2;
    const toX = target.x + wobble - creature.x, toY = target.y + stats.hoverM - creature.y, toZ = target.z - wobble - creature.z;
    const length = Math.hypot(toX, toZ);
    const speed = length > 1 ? stats.speed : 0;
    creature.vx = length > 0 ? toX / length * speed : 0;
    creature.vz = length > 0 ? toZ / length * speed : 0;
    creature.vy = Math.max(-stats.speed, Math.min(stats.speed, toY * 3));
    if (creature.action === "move" && creature.cooldownMs <= 0 && distance < 6) { creature.action = "dive"; creature.actionMs = 900; }
  }
  creature.x += creature.vx * ctx.dt; creature.y += creature.vy * ctx.dt; creature.z += creature.vz * ctx.dt;
  if (Math.hypot(creature.vx, creature.vz) > 0.1) creature.yaw = Math.atan2(-creature.vx, -creature.vz);
}

/** The Temple Colossus walks at the nearest player, winds up and stomps, and calls beetles once at half health. */
function stepColossus(creature: CreatureSim, ctx: CreatureContext, found: ReturnType<typeof nearest>, events: CreatureEvent[]): void {
  const stats = CREATURE_TUNING.colossus;
  if (!creature.summoned && creature.hp <= creature.maxHp * stats.summonAtFraction) {
    creature.summoned = true;
    events.push({ type: "summon", count: stats.summons, x: creature.x, z: creature.z });
  }
  if (creature.action === "windup") {
    walk(creature, ctx, creature.x, creature.z, 0);
    if (creature.actionMs <= 0) {
      events.push({ type: "stomp", x: creature.x, z: creature.z, radius: stats.stompRadiusM, damage: stats.stompDamage });
      creature.action = "move"; creature.cooldownMs = stats.stompCooldownMs;
    }
    return;
  }
  if (!found) { walk(creature, ctx, creature.x, creature.z, 0); return; }
  const { target, distance } = found;
  if (distance <= stats.stompRadiusM * 0.8 && creature.cooldownMs <= 0) {
    creature.action = "windup"; creature.actionMs = stats.stompWindupMs; face(creature, target);
    walk(creature, ctx, creature.x, creature.z, 0);
    return;
  }
  const head = headFor(creature, ctx, target);
  walk(creature, ctx, head.x, head.z, distance > stats.radius + 1 ? stats.speed : 0, head.y);
}

type Point = { x: number; y: number; z: number };
const lower: Point = { x: 0, y: 0, z: 0 };
const upper: Point = { x: 0, y: 0, z: 0 };

export type CreatureHit = { gem: boolean };

function pointSegmentDistance(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy + (point.z - from.z) * dz) / lengthSq)) : 0;
  return Math.hypot(from.x + dx * t - point.x, from.y + dy * t - point.y, from.z + dz * t - point.z);
}

/** An arrow step against a creature: a vertical capsule, and for guardians and the Colossus a gem sphere. */
export function creatureHit(creature: CreatureSim, from: Point, to: Point): CreatureHit | null {
  const stats = tuning(creature.kind);
  if ("gemHeightM" in stats) {
    const gem = { x: creature.x - Math.sin(creature.yaw) * stats.radius * 0.6, y: creature.y + stats.gemHeightM, z: creature.z - Math.cos(creature.yaw) * stats.radius * 0.6 };
    if (pointSegmentDistance(gem, from, to) <= stats.gemRadiusM + ARROW_RADIUS) return { gem: true };
  }
  lower.x = creature.x; lower.y = creature.y + Math.min(stats.radius, stats.height / 2); lower.z = creature.z;
  upper.x = creature.x; upper.y = creature.y + Math.max(stats.height - stats.radius, stats.height / 2); upper.z = creature.z;
  return segmentDistance(from, to, lower, upper) <= stats.radius + ARROW_RADIUS ? { gem: false } : null;
}

/**
 * Damage an arrow does. A guardian's shield blocks arrows flying at its front unless they hit the gem;
 * the Colossus takes half damage on its body and double on its gem.
 */
export function creatureDamage(creature: CreatureSim, base: number, hit: CreatureHit, arrowVx: number, arrowVz: number): { damage: number; blocked: boolean } {
  if (creature.kind === "guardian" && !hit.gem) {
    const length = Math.hypot(arrowVx, arrowVz) || 1;
    const facingX = -Math.sin(creature.yaw), facingZ = -Math.cos(creature.yaw);
    // An arrow flying against the facing direction arrived from the front.
    const against = -(arrowVx * facingX + arrowVz * facingZ) / length;
    if (against >= Math.cos(CREATURE_TUNING.guardian.shieldArcDeg * Math.PI / 360)) return { damage: 0, blocked: true };
  }
  if (creature.kind === "colossus") return { damage: base * (hit.gem ? CREATURE_TUNING.colossus.gemDamageMult : CREATURE_TUNING.colossus.bodyDamageMult), blocked: false };
  return { damage: base, blocked: false };
}
