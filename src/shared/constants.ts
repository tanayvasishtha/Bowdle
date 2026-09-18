// Every gameplay number lives here.

export const RETENTION_XP = { finish: 100, kill: 50, assist: 25, headshot: 25, longShot: 25, ropeCut: 25, swat: 25, win: 200, medal: 25, maxMedals: 4 } as const;

/** Onboarding (v2): the field course reward, its rate limit, and in-match tips for new players. */

export const ONBOARDING = { courseInk: 100, courseCallsPerMinute: 5, tipIntervalMs: 45_000, tipMatches: 5, tipIdleMs: 40_000, funnelPerHour: 60,

  /** The practice arrows the swat station throws: from a fixed spot down the range, slow enough to read. */

  swatDrill: { everyMs: 2600, speed: 22, from: [0, 1.6, -18] as readonly [number, number, number], lifeMs: 3000, missM: 0.6 },

} as const;

export const FUNNEL_EVENTS = ["menuOpened", "tutorialDone", "firstMatch", "secondMatch", "modePicked"] as const;

/** Free for All and Relic Run (v2). */

export const MODE_TUNING = { ffaKillLimit: 20, ffaTimeLimitS: 420, ffaPlayers: 8, relicCaptureLimit: 3, relicTimeLimitS: 480 } as const;

/** The relic: touch reach, how long it waits on the ground, and what carrying it costs. */

export const RELIC = { touchM: 1.3, touchHeightM: 2.2, returnMs: 15_000, carrierSpeedMult: 0.85 } as const;

/**

 * Expedition creatures (v2). hp and damage from the design; speeds in m/s; radius and height size the hit capsule.

 * fromWave is the first wave a creature can appear in.

 */

export const CREATURE_TUNING = {

  beetle: { hp: 40, speed: 7.5, radius: 0.55, height: 0.7, damage: 15, reachM: 1.4, cooldownMs: 900, fromWave: 1 },

  spitter: { hp: 60, speed: 4.5, radius: 0.55, height: 1.4, damage: 20, keepMinM: 15, keepMaxM: 25, cooldownMs: 2600, projectileSpeed: 18, slowMult: 0.7, slowMs: 1500, fromWave: 2 },

  guardian: { hp: 150, speed: 3.2, radius: 0.8, height: 1.9, damage: 25, reachM: 1.8, cooldownMs: 1400, shieldArcDeg: 110, gemHeightM: 1.7, gemRadiusM: 0.25, fromWave: 4 },

  wisp: { hp: 30, speed: 8.5, radius: 0.4, height: 0.6, damage: 10, hoverM: 3.5, diveSpeed: 14, reachM: 1.2, cooldownMs: 2200, fromWave: 6 },

  mire: { hp: 80, speed: 3.0, radius: 0.7, height: 1.1, damage: 0, reachM: 0, cooldownMs: 4000, mireRadiusM: 3.5, mireDurationMs: 6000, mireDps: 8, mireSlowMult: 0.55, fromWave: 5 },

  tender: { hp: 70, speed: 3.5, radius: 0.6, height: 1.4, damage: 0, reachM: 0, cooldownMs: 3000, healRadiusM: 6, healAmount: 12, healMaxTargets: 4, holdMinM: 8, holdMaxM: 14, fromWave: 7 },

  colossus: { hp: 800, hpPerExtraPlayer: 200, speed: 2.4, radius: 1.8, height: 6, stompDamage: 35, stompRadiusM: 9, stompWindupMs: 900, stompCooldownMs: 6000, summonAtFraction: 0.5, summons: 4, gemHeightM: 5.2, gemRadiusM: 0.6, bodyDamageMult: 0.5, gemDamageMult: 2, fromWave: 5 },

} as const;

/** Expedition waves and the run around them. */

export const EXPEDITION = {

  maxPlayers: 4, baseCount: 6, countPerWave: 2, extraPlayerMult: 1.3, maxAlive: 18, aliveBase: 4,

  bossEvery: 5, modifierEvery: 3, swarmCountMult: 1.35, swarmHpMult: 0.7, heavyHpMult: 1.25, lowGravityMult: 0.7,

  breakMs: 8000, spawnGapMs: 450, herbs: 2, herbHeal: 40, herbTouchM: 1.2,

  downedMs: 15_000, reviveMs: 2000, reviveRangeM: 2, downedSpeedMult: 0.25, soloLifeEvery: 5, checkpointEvery: 5,

  xpPerWave: 5, xpPerBoss: 40, inkPerWave: 2, inkCap: 30, pathRefreshMs: 1500, directChaseM: 8, stuckMs: 6000, stuckMoveM: 3, creatureHopMult: 1.05, creatureLeapMaxMps: 13, leapClearanceM: 0.6,

} as const;

export const MEDAL_LIMITS = { mvp: 5, unstoppable: 6, onARoll: 3, headhunter: 3, eagleEye: 45, teamPlayer: 4, untouchable: 3 } as const;

export const XP_PER_LEVEL_STEP = 500;

export const MAX_LEVEL = 100;

export const MATCH_INK = { finish: 10, win: 10, perKill: 1, maxKillInk: 10 } as const;

export const CHALLENGE_COUNT = 3;

export const UTC_DAY_MS = 86400000;

export const TIME_UNITS = { msPerSecond: 1000, secondsPerMinute: 60, secondsPerHour: 3600 } as const;

export const DAYS_PER_WEEK = 7;

export const ISO_THURSDAY = 4;

export const WEEK_SEED_MULTIPLIER = 100;

export const DAILY_TARGETS = { kills: 12, headshots: 4, wins: 2, matches: 3, longshots: 2, dagger: 2, assists: 5, zip: 1, streak: 1, scatter: 3, relic: 1 } as const;

export const WEEKLY_TARGETS = { kills: 80, headshots: 25, wins: 10, longshots: 12, robin: 1, boulder: 1, maps: 3, medals: 15, tether: 10, wave10: 1, colossus: 1 } as const;

export const CHALLENGE_REWARDS = { daily: { ink: 30, xp: 150 }, weekly: { ink: 120, xp: 600 } } as const;

export const PLAY_STREAK = { inkPerDay: 5, capDays: 7, firstWinXp: 100, firstWinInk: 20 } as const;

export const LEVEL_ITEM_LEVELS = { chalk: 3, explorer: 5, dust: 7, cartographer: 10, fern: 15, carved: 20, goldrush: 30, veteran: 50 } as const;

export const LEVEL_INK = { firstLevel: 2, base: 50, perLevel: 5 } as const;

export const DEV_GRANT_MAX = 100000;

export const KILL_FEEDBACK = { windowMs: 4000, double: 2, triple: 3, jungle: 4, streakVisible: 2, tickerLines: 4 } as const;

export const TICK_HZ = 30;

export const SUBSTEPS = 2;

// Movement 2.0 (V2-DESIGN.md section 3).

export const GRAVITY = 24;

export const RUN_SPEED = 8.5;

export const CROUCH_SPEED = 4;

export const AIM_SPEED_MULT = 0.75;

export const GROUND_ACCEL = 14;

export const AIR_ACCEL = 70;

export const AIR_WISH_CAP = 1;

export const FRICTION = 6.5;

export const STOP_SPEED = 3;

/** Apex of about 1.47 m with GRAVITY 24. */

export const JUMP_VELOCITY = 8.4;

/** Cap for speed the player controls: running, air strafing and anything while grounded. */

export const MAX_HORIZONTAL_SPEED = 16;

/** Cap for every source together, including rope launches, while airborne. */

export const ABSOLUTE_SPEED_CAP = 30;

export const STEP_HEIGHT = 0.45;

export const COYOTE_MS = 130;

export const JUMP_BUFFER_MS = 140;

/** Landing fast keeps momentum: less friction for a moment. */

export const LANDING_GRACE = { minSpeed: 9, ms: 350, frictionMult: 0.3 } as const;

/** One extra jump in the air, restored on landing, wall jumps and rope launches. */

export const VINE_HOP = { velocity: 7.1, minSpeed: 6.5, perAirtime: 1 } as const;

export const WALL_JUMP = { touchMs: 120, cooldownMs: 400, push: 7, keepAlongWall: 0.4, velocity: 8.4, maxBeforeLanding: 3 } as const;

/** pushMs: after a mantle starts, forward speed is held so the body carries onto the ledge once it clears the edge. */

export const MANTLE = { minRise: 0.6, maxRise: 2, reach: 0.8, clearance: 0.4, forwardSpeed: 3, cooldownMs: 600, pushMs: 350, minForwardInput: 0.5 } as const;

export const DODGE = { cooldownMs: 1600, boost: 5, minSpeed: 13, airLift: 1.5 } as const;

/** Collision never moves a body more than this per piece, so fast bodies cannot tunnel. */

export const COLLISION_MAX_STEP_M = 0.28;

export const COLLISION_MAX_PIECES = 8;

export const FALL = { belowBoundsM: 8, creditMs: 5000 } as const;

export const PLAYER_WIDTH = 0.7;

export const STAND_HEIGHT = 1.8;

export const CROUCH_HEIGHT = 1;

export const EYE_STAND = 1.62;

export const EYE_CROUCH = 0.9;

export const SLIDE_MIN_SPEED = 6.5;

export const SLIDE_BOOST = 3;

export const SLIDE_MAX_SPEED = 12.5;

/** Slides have no time limit; they lose this much speed per second. */

export const SLIDE_DECEL = 6;

export const SLIDE_STEER_ACCEL = 5;

export const SLIDE_AIR_MS = 350;

export const SLIDE_END_SPEED = 3.5;

export const SLIDE_COOLDOWN_MS = 500;

export const SLIDE_JUMP_MULT = 1.06;

export const DRAW_MIN_MS = 120;

export const DRAW_FULL_MS = 550;

export const RELEASE_COOLDOWN_MS = 200;

export const ARROW_SPEED_MIN = 45;

export const ARROW_SPEED_MAX = 95;

export const ARROW_GRAVITY = 9;

export const ARROW_RADIUS = 0.07;

export const ARROW_LIFETIME_MS = 3000;

export const ARROW_MAX_PER_PLAYER = 10;

export const ARROW_SPAWN_FORWARD = 0.3;

export const DMG_BODY_MIN = 25;

export const DMG_BODY_MAX = 60;

export const HEAD_MULT = 2;

/** The quiver (v2). Slot 0 is the broadhead, the v1 arrow. */

export const QUIVER = {

  scatter: { spreadDeg: 4, damageMult: 0.55, headMult: 1.5, drawFullMs: 700, charges: 3, rechargeMs: 6000 },

  tether: { minM: 6, maxM: 35, maxSlopeDeg: 35, liftM: 1.2, endClearanceM: 0.5, lifeMs: 10_000, cooldownMs: 14_000 },

} as const;

/**

 * A dagger swing destroys enemy arrows close in front of the player early in the swing.

 * Arrows younger than minArrowAgeMs are point-blank shots nobody could react to, so they cannot be swatted.

 */

export const SWAT = { rangeM: 1.8, arcDeg: 70, windowMs: 180, minArrowAgeMs: 60 } as const;

export const HEAD_RADIUS = 0.25;

export const BODY_RADIUS = 0.38;

export const MELEE_DAMAGE = 55;

export const BACKSTAB_DAMAGE = 100;

export const MELEE_RANGE = 2.3;

export const MELEE_ARC_DEG = 70;

export const MELEE_COOLDOWN_MS = 700;

export const MAX_HP = 100;

export const REGEN_DELAY_MS = 4000;

export const REGEN_PER_S = 30;

/** Swing grapple (v2). Cooldown starts when the rope detaches. */

export const GRAPPLE_COOLDOWN_MS = 5000;

export const GRAPPLE_SPEED = 120;

export const GRAPPLE_RANGE = 45;

export const GRAPPLE = {

  missCooldownMs: 1000, lengthFactor: 0.95, minLength: 2,

  reelSpeed: 12, pullAccel: 38, maxPullSpeed: 22,

  swingGravityMult: 0.9, swingPushAccel: 8,

  launchAlong: 2, launchUp: 3,

  maxMs: 4500, blockedMs: 300, releaseDist: 1.5,

  cutRadius: 0.25,

  /** Radius around a swing anchor that counts as a grapple hit. */

  anchorHitRadius: 1.2,

} as const;

/** Map-kit geyser (G10). Default launch matches V2-DESIGN. */

export const GEYSER = { defaultLaunch: 14, cooldownMs: 400, upBoost: 0.35 } as const;

/** Breakable plank walls and crates. */

export const BREAKABLE = { defaultHp: 60, rebuildMs: 30_000 } as const;

/** PvP herb pickups on the map kit (not Expedition wave herbs). */

export const MAP_HERB = { heal: 30, respawnMs: 20_000, touchM: 1.2 } as const;

/** Sunken Ruins tide: floods the lower courtyard every 90 s. */

export const TIDE = { periodMs: 90_000, activeMs: 25_000, rise: 1.4 } as const;

export const INK_CLOUD_COOLDOWN_MS = 15000;

export const INK_CLOUD_SPEED = 35;

export const INK_CLOUD_GRAVITY = 15;

export const INK_CLOUD_RADIUS = 4.5;

export const INK_CLOUD_MS = 6000;

export const TEAM_SIZE = 4;

export const SCORE_LIMIT = 25;

export const TIME_LIMIT_S = 420;

export const WARMUP_MS = 5000;

export const RESPAWN_MS = 3000;

export const SPAWN_PROTECT_MS = 1500;

export const END_SCREEN_MS = 10000;

export const ASSIST_MIN_DAMAGE = 30;

export const ASSIST_WINDOW_MS = 5000;

export const INTERP_DELAY_MS = 100;

export const RECONCILE_SMOOTH_MS = 65;

export const MAX_REWIND_MS = 250;

export const RECONNECT_WINDOW_S = 15;

export const MAX_NAME_LENGTH = 16;

export const CAMERA_CROUCH_MS = 80;

export const DEFAULT_FOV = 90;

export const MIN_FOV = 80;

export const MAX_FOV = 110;

export const AIM_FOV = 65;

export const AIM_FOV_MS = 120;

export const MOUSE_SENSITIVITY = 0.002;

export const PRACTICE_RESPAWN_MS = 2000;

export const STUCK_ARROW_MS = 8000;

export const MASTER_VOLUME = 0.6;

export const PRACTICE_RAIL_HALF_WIDTH = 3;

export const PRACTICE_PATROL_SPEED = 2;

export const PRACTICE_PATROL_HALF_WIDTH = 4;

export const TEST_DUEL_HALF_DISTANCE = 15;

export const TEST_DUEL_LANE_Z = -8;

export const HUD_REFRESH_MS = 100;

export const WAYPOINT_SPAWN_MAX_DIST = 3;

export const WAYPOINT_SWEEP_STEP = 0.25;

export const BOT_LEAD_ITERATIONS = 3;

export const BOT_LONG_LINK_M = 8;

export const BOT_SLIDE_CHANCE = 0.2;

export const BOT_RETREAT_HP = 35;

export const BOT_DRAW_MIN_MS = 450;

export const BOT_DRAW_MAX_MS = 650;

export const BOT_REACTION_MS = 250;

export const BOT_AIM_ERROR_EASY_DEG = 4;

export const BOT_AIM_ERROR_NORMAL_DEG = 2;

export const BOT_AIM_ERROR_HARD_DEG = 0.8;

export const BOT_STRAFE_MS = 900;

export const BOT_WAYPOINT_REACHED_M = 0.8;

export const TEAM_COUNT = 2;

export const BOT_SCENIC_ROUTE_EVERY = 3;

export const REPLAY_BUFFER_MS = 3000;

export const REPLAY_CAPTURE_HZ = 30;

export const REPLAY_DURATION_MS = 1200;

export const REPLAY_SPEED = 0.35;

export const REPLAY_CAMERA_DISTANCE = 2;

export const REPLAY_CAMERA_HEIGHT = 0.5;

export const BODY_ARROW_STUCK_MS = 3000;

export const PIN_SEARCH_M = 3;

export const PIN_SEARCH_STEP_M = 0.2;

export const LONG_SHOT_M = 35;

export const SPLAT_MIN_VERTICES = 9;

export const SPLAT_MAX_VERTICES = 14;

export const PRACTICE_REPLAY_MIN_M = 30;

export const RAMP_MAX_SLOPE_DEG = 40;

export const CANOPY_SPIRAL_MAX_SLOPE_DEG = 20;

export const GROUND_SNAP = 0.3;

export const WATER_SPEED_MULT = 0.65;

export const ZIP_SPEED = 14;

export const ZIP_ATTACH_DIST = 2;

export const ZIP_JUMP_BOOST = 3;

export const BOULDER_RADIUS = 1.5;

export const BOULDER_SPEED = 11;

export const BOULDER_PERIOD_MS = 75000;

export const BOULDER_TELEGRAPH_MS = 3000;

export const LEVER_COOLDOWN_MS = 60000;

export const FLOOD_PERIOD_MS = 120000;

export const FLOOD_MS = 25000;

export const FLOOD_RISE = 0.6;

export const USE_DIST = 1.5;

export const ZIP_CLEARANCE = 0.5;

export const BOULDER_SPAWN_CLEARANCE = 6;

export const PROP_HIDE_DISTANCE = 90;

export const BOT_STUCK_MS = 2500;

export const BOT_STUCK_MOVE_M = 0.03;

/** Bots vine hop on jump links longer than this, while still this far from the landing. */

export const BOT_VINE_HOP_GAP_M = 3;

export const BOT_VINE_HOP_REMAINING_M = 1.5;

/** Chance a bot dodges right after taking damage. */

/** Bots reel for a moment, swing toward their goal, and launch once past the anchor or close to it. */

export const BOT_GRAPPLE = { reelMs: 900, launchMs: 1800, launchDistM: 4 } as const;

/** Bots switch to scatter arrows inside this range while they have charges. */

export const BOT_SCATTER_M = 12;

/** Relic Run bots: a moved objective replans the route, and close to the relic they walk straight at it. */

export const BOT_RELIC = { replanM: 4, directM: 3, directRiseM: 1.5, roles: 3, engageM: 14 } as const;

/** Below this speed a strafing bot is against a wall, so it steps forward or back instead. */

export const BOT_STRAFE_BLOCKED_MPS = 0.5;

export const BOT_DODGE_CHANCE = 0.2;

/** A waypoint only counts as reached within this height, so a bot under a deck never "reaches" the deck. */

export const BOT_WAYPOINT_REACHED_Y_M = 1.3;

/** A bot that gets no closer to its waypoint for this long drops the route and plans again. */

export const BOT_PROGRESS_MS = 4000;

export const BOT_PROGRESS_M = 0.5;

export const SERVER_METRICS_MS = 10000;

/** G10 map-kit geyser/herb probes on launch maps need a little headroom over the old 3 ms line. */
export const SERVER_TICK_BUDGET_MS = 3;

export const PARTY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const PARTY_CODE_LENGTH = 6;

/** Average human level at which bots step up to normal and hard aim. */

export const BOT_DIFFICULTY_LEVELS = { normal: 4, hard: 12 } as const;

/** Players with fewer finished matches than this always face easy bots. */

export const NEW_PLAYER_MATCHES = 3;

/** Optional Expedition start handicaps (N1). Reward mults stack; Ink still capped by EXPEDITION.inkCap. */
export const EXPEDITION_HANDICAPS = {
  shortLives: { soloLifeEvery: 8, reviveTokensDelta: -1, rewardMult: 1.25 },
  swiftWaves: { breakMs: 5000, spawnGapMult: 0.85, rewardMult: 1.2 },
  glassBodies: { hpMult: 0.75, rewardMult: 1.35 },
} as const;
export type ExpeditionHandicapId = keyof typeof EXPEDITION_HANDICAPS;
