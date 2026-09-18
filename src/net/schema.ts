import { schema, t, type SchemaType } from "@colyseus/schema";
import { COYOTE_MS, MAX_HP, QUIVER, STAND_HEIGHT, VINE_HOP } from "../shared/constants.ts";

/**
 * What a player wears. A schema holds at most 64 fields, so cosmetics live in their own schema under PlayerState.look.
 */
export const LookState = schema({
  bowSkin: t.string().default("bow.default"), arrowTrail: t.string().default("trail.default"), outfit: t.string().default("outfit.default"), killEffect: t.string().default("effect.default"),
}, "LookState");
export type LookState = SchemaType<typeof LookState>;

/** Ranked tier label synced for scoreboard / end screen (empty when unranked). */
export const RankState = schema({
  tier: t.string().default(""),
}, "RankState");
export type RankState = SchemaType<typeof RankState>;

export const PlayerState = schema({
  name: t.string().default("Player"),
  team: t.uint8().default(0),
  isBot: t.boolean().default(false),
  x: t.number().default(0), y: t.number().default(0), z: t.number().default(0),
  vx: t.number().default(0), vy: t.number().default(0), vz: t.number().default(0),
  yaw: t.number().default(0), pitch: t.number().default(0), height: t.number().default(STAND_HEIGHT),
  grounded: t.boolean().default(true), crouched: t.boolean().default(false), sliding: t.boolean().default(false),
  slideMs: t.number().default(0), slideCooldownMs: t.number().default(0), coyoteMs: t.number().default(COYOTE_MS), jumpBufferMs: t.number().default(0),
  hp: t.number().default(MAX_HP), alive: t.boolean().default(true), drawMs: t.number().default(0), releaseCooldownMs: t.number().default(0), meleeCooldownMs: t.number().default(0),
  prevButtons: t.uint16().default(0), lastDamageAtMs: t.number().default(0), spawnProtectMs: t.number().default(0), respawnAtMs: t.number().default(0),
  grappleCooldownMs: t.number().default(0), grappleActive: t.boolean().default(false), grappleX: t.number().default(0), grappleY: t.number().default(0), grappleZ: t.number().default(0), grappleMs: t.number().default(0), inkCooldownMs: t.number().default(0),
  grappleLen: t.number().default(0), grappleBlockedMs: t.number().default(0), grappleReeling: t.boolean().default(false),
  relicCarrier: t.boolean().default(false), downed: t.boolean().default(false), slowMs: t.number().default(0), downedMs: t.number().default(0), reviveMs: t.number().default(0), arrowSlot: t.uint8().default(0), scatterCharges: t.uint8().default(QUIVER.scatter.charges), scatterRechargeMs: t.number().default(0), tetherCooldownMs: t.number().default(0),
  zipId: t.string().default(""), zipT: t.number().default(0),
  kills: t.uint16().default(0), deaths: t.uint16().default(0), assists: t.uint16().default(0),
  look: LookState,
  rank: RankState,
  // Movement 2.0: synced so client prediction replays air jumps, wall jumps, mantles and dodges exactly.
  airJumps: t.uint8().default(VINE_HOP.perAirtime), wallJumps: t.uint8().default(0), wallJumpCooldownMs: t.number().default(0),
  wallTouchMs: t.number().default(10_000), wallNormalX: t.number().default(0), wallNormalZ: t.number().default(0),
  mantleCooldownMs: t.number().default(0), dodgeCooldownMs: t.number().default(0), landingGraceMs: t.number().default(0),
}, "PlayerState");
export type PlayerState = SchemaType<typeof PlayerState>;

export const ArrowState = schema({
  x: t.number().default(0), y: t.number().default(0), z: t.number().default(0),
  vx: t.number().default(0), vy: t.number().default(0), vz: t.number().default(0),
  owner: t.string().default(""), team: t.uint8().default(0), bornMs: t.number().default(0),
  kind: t.string<"arrow" | "scatter" | "tether" | "grapple" | "ink" | "spit">().default("arrow"), damage: t.number().default(0),
  ageMs: t.number().noSync().default(0), stuck: t.boolean().noSync().default(false),
  prevX: t.number().noSync().default(0), prevY: t.number().noSync().default(0), prevZ: t.number().noSync().default(0),
}, "ArrowState");
export type ArrowState = SchemaType<typeof ArrowState>;

/** A tether arrow's temporary zip line. Riders ride it like a map zip line until it expires or is cut. */
export const TetherState = schema({
  fromX: t.number().default(0), fromY: t.number().default(0), fromZ: t.number().default(0),
  toX: t.number().default(0), toY: t.number().default(0), toZ: t.number().default(0),
  owner: t.string().default(""), team: t.uint8().default(0), expiresAtMs: t.number().default(0),
}, "TetherState");
export type TetherState = SchemaType<typeof TetherState>;

export const RelicState = schema({
  x: t.number().default(0), y: t.number().default(0), z: t.number().default(0),
  carrier: t.string().default(""), home: t.boolean().default(true), droppedAtMs: t.number().default(0), droppedByTeam: t.int8().default(-1),
}, "RelicState");
export type RelicState = SchemaType<typeof RelicState>;

/** An Expedition creature; the room steps it with the shared creature simulation. */
export const CreatureState = schema({
  kind: t.string().default("beetle"), x: t.number().default(0), y: t.number().default(0), z: t.number().default(0),
  vx: t.number().noSync().default(0), vy: t.number().noSync().default(0), vz: t.number().noSync().default(0), yaw: t.number().default(0),
  hp: t.number().default(0), maxHp: t.number().default(0), action: t.string().default("move"), actionMs: t.number().default(0),
  cooldownMs: t.number().noSync().default(0), summoned: t.boolean().noSync().default(false), grounded: t.boolean().noSync().default(false),
}, "CreatureState");
export type CreatureState = SchemaType<typeof CreatureState>;

export const HerbState = schema({ x: t.number().default(0), y: t.number().default(0), z: t.number().default(0) }, "HerbState");
export type HerbState = SchemaType<typeof HerbState>;

/** Map-kit plank wall or crate (G10). */
export const BreakableState = schema({
  hp: t.number().default(60), broken: t.boolean().default(false),
}, "BreakableState");
export type BreakableState = SchemaType<typeof BreakableState>;

/** Map-kit PvP herb; ready=false while respawning. */
export const MapHerbState = schema({
  x: t.number().default(0), y: t.number().default(0), z: t.number().default(0), ready: t.boolean().default(true),
}, "MapHerbState");
export type MapHerbState = SchemaType<typeof MapHerbState>;

/** The Expedition run: the wave, whether creatures are coming or it is a break, the modifier, solo lives. */
export const ExpeditionState = schema({
  wave: t.uint16().default(0), phase: t.string<"break" | "fight" | "over">().default("break"), phaseEndsAtMs: t.number().default(0),
  left: t.uint16().default(0), modifier: t.string().default("none"), lives: t.uint8().default(0), cleared: t.uint16().default(0), bosses: t.uint8().default(0),
  startWave: t.uint16().default(0),
}, "ExpeditionState");
export type ExpeditionState = SchemaType<typeof ExpeditionState>;

export const InkCloudState = schema({
  x: t.number().default(0), y: t.number().default(0), z: t.number().default(0),
  radius: t.number().default(0), expiresAtMs: t.number().default(0),
}, "InkCloudState");
export type InkCloudState = SchemaType<typeof InkCloudState>;

export const BoulderHazardState = schema({
  phase: t.string<"idle" | "telegraph" | "roll" | "despawn">().default("idle"), direction: t.int8().default(1), t: t.number().default(0),
  phaseEndsAtMs: t.number().default(0), nextAtMs: t.number().default(0), leverReadyAtMs: t.number().default(0), puller: t.string().default(""),
  x: t.number().default(0), y: t.number().default(0), z: t.number().default(0),
}, "BoulderHazardState");
export type BoulderHazardState = SchemaType<typeof BoulderHazardState>;

export const MatchState = schema({
  /** tdm, ffa or relic. */
  mode: t.string().default("tdm"),
  relic: RelicState,
  expedition: ExpeditionState,
  creatures: t.map(CreatureState),
  herbs: t.map(HerbState),
  breakables: t.map(BreakableState),
  mapHerbs: t.map(MapHerbState),
  mapId: t.string().default("sun-temple"),
  phase: t.string<"warmup" | "live" | "end">().default("warmup"),
  phaseEndsAtMs: t.number().default(0),
  scoreSun: t.uint16().default(0),
  scoreMoon: t.uint16().default(0),
  players: t.map(PlayerState),
  arrows: t.map(ArrowState),
  inkClouds: t.map(InkCloudState),
  tethers: t.map(TetherState),
  hazards: t.map(BoulderHazardState),
}, "MatchState");
export type MatchState = SchemaType<typeof MatchState>;

export const PlayerInput = schema({
  moveX: t.number().default(0), moveZ: t.number().default(0),
  yaw: t.number().default(0), pitch: t.number().default(0), buttons: t.uint16().default(0),
}, "PlayerInput");
export type PlayerInput = SchemaType<typeof PlayerInput>;
