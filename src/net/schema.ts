import { schema, t, type SchemaType } from "@colyseus/schema";
import { COYOTE_MS, MAX_HP, STAND_HEIGHT } from "../shared/constants.ts";

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
  zipId: t.string().default(""), zipT: t.number().default(0),
  kills: t.uint16().default(0), deaths: t.uint16().default(0), assists: t.uint16().default(0),
  bowSkin: t.string().default("bow.default"), arrowTrail: t.string().default("trail.default"), outfit: t.string().default("outfit.default"), killEffect: t.string().default("effect.default"),
}, "PlayerState");
export type PlayerState = SchemaType<typeof PlayerState>;

export const ArrowState = schema({
  x: t.number().default(0), y: t.number().default(0), z: t.number().default(0),
  vx: t.number().default(0), vy: t.number().default(0), vz: t.number().default(0),
  owner: t.string().default(""), team: t.uint8().default(0), bornMs: t.number().default(0),
  kind: t.string<"arrow" | "grapple" | "ink">().default("arrow"), damage: t.number().default(0),
  ageMs: t.number().noSync().default(0), stuck: t.boolean().noSync().default(false),
  prevX: t.number().noSync().default(0), prevY: t.number().noSync().default(0), prevZ: t.number().noSync().default(0),
}, "ArrowState");
export type ArrowState = SchemaType<typeof ArrowState>;

export const InkCloudState = schema({
  x: t.number().default(0), y: t.number().default(0), z: t.number().default(0),
  radius: t.number().default(0), expiresAtMs: t.number().default(0),
}, "InkCloudState");
export type InkCloudState = SchemaType<typeof InkCloudState>;

export const MatchState = schema({
  mapId: t.string().default("notebook"),
  phase: t.string<"warmup" | "live" | "end">().default("warmup"),
  phaseEndsAtMs: t.number().default(0),
  scoreSun: t.uint16().default(0),
  scoreMoon: t.uint16().default(0),
  players: t.map(PlayerState),
  arrows: t.map(ArrowState),
  inkClouds: t.map(InkCloudState),
}, "MatchState");
export type MatchState = SchemaType<typeof MatchState>;

export const PlayerInput = schema({
  moveX: t.number().default(0), moveZ: t.number().default(0),
  yaw: t.number().default(0), pitch: t.number().default(0), buttons: t.uint16().default(0),
}, "PlayerInput");
export type PlayerInput = SchemaType<typeof PlayerInput>;
