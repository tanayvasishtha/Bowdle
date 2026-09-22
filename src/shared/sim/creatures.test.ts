import { describe, expect, it } from "vitest";
import { TOTEM_ID } from "./villageDefense.ts";
import { CREATURE_TUNING, EXPEDITION } from "../constants.ts";
import { mulberry32 } from "../math/rng.ts";
import type { MapData } from "../maps/types.ts";
import { createCreature, creatureDamage, creatureHit, stepCreature, type CreatureContext, type CreatureEvent, type CreatureTarget } from "./creatures.ts";
import { aliveCap, bossHp, checkpointFor, earnsSoloLife, expeditionReward, hpMultiplier, isBossWave, modifierFor, pickKind, unlockedKinds, waveCount } from "./waves.ts";

const flat: MapData = {
  id: "flat", name: "flat", bounds: { min: [-60, -2, -60], max: [60, 20, 60] }, boxes: [{ id: "floor", min: [-60, -1, -60], max: [60, 0, 60], material: "earth", tags: ["solid"] }],
  ramps: [], volumes: [], zipLines: [], boulders: [], props: [], spawns: { sun: [], moon: [] }, waypoints: [], decor: [], notes: [], look: { sunShafts: false, stainSeed: 0 },
};
const DT = 1 / 30;
const player = (x: number, z: number, grounded = true): CreatureTarget => ({ id: "p", x, y: 0, z, grounded });
function run(creature: ReturnType<typeof createCreature>, targets: CreatureTarget[], seconds: number): CreatureEvent[] {
  const ctx: CreatureContext = { map: flat, targets, dt: DT, gravityMult: 1 };
  const events: CreatureEvent[] = [];
  for (let tick = 0; tick < seconds * 30; tick += 1) events.push(...stepCreature(creature, ctx));
  return events;
}

describe("creatures", () => {
  it("raiders go for the village totem unless a player is close, and Runners only when one is right on them", () => {
    const totem: CreatureTarget = { id: TOTEM_ID, x: 0, y: 0, z: 0, grounded: true };
    const runner = createCreature("beetle", 30, 0, 0);
    const events = run(runner, [player(30, 20), totem], 1);
    expect(runner.x).toBeLessThan(30);
    expect(events.filter((event) => event.type === "melee")).toHaveLength(0);
    const cornered = createCreature("beetle", 30, 0, 0);
    const bites = run(cornered, [player(31, 0), totem], 1).filter((event) => event.type === "melee");
    expect(bites[0]).toMatchObject({ target: "p" });
    // A guardian fights a player inside the aggro range and walks to the totem when everyone is far away.
    const guardian = createCreature("guardian", 40, 0, 0);
    run(guardian, [player(40, 20), totem], 1);
    expect(guardian.z).toBeGreaterThan(0.5);
    const lone = createCreature("guardian", 40, 0, 0);
    run(lone, [player(40, 60), totem], 1);
    expect(lone.x).toBeLessThan(40);
    expect(Math.abs(lone.z)).toBeLessThan(0.5);
  });

  it("a walking creature hops a log and leaps up to a ledge it is heading for", () => {
    const log: MapData = { ...flat, boxes: [...flat.boxes, { id: "log", min: [4, 0, -3], max: [5, 1, 3], material: "wood", tags: ["solid"] }] };
    const beetle = createCreature("beetle", 0, 0, 0);
    const ctx: CreatureContext = { map: log, targets: [player(12, 0)], dt: DT, gravityMult: 1 };
    for (let tick = 0; tick < 90; tick += 1) stepCreature(beetle, ctx);
    expect(beetle.x).toBeGreaterThan(6);

    const ledge: MapData = { ...flat, boxes: [...flat.boxes, { id: "deck", min: [4, 0, -3], max: [10, 2.5, 3], material: "stone", tags: ["solid"] }] };
    const guardian = createCreature("guardian", 0, 0, 0);
    const up = { id: "p", x: 8, y: 2.5, z: 0, grounded: true };
    const routed: CreatureContext = { map: ledge, targets: [up], dt: DT, gravityMult: 1, steer: () => ({ x: 8, y: 2.5, z: 0 }) };
    for (let tick = 0; tick < 120; tick += 1) stepCreature(guardian, routed);
    expect(guardian.y).toBeGreaterThanOrEqual(2.4);
    expect(guardian.x).toBeGreaterThan(4);
    // A plain hop does not clear the deck.
    const hopper = createCreature("guardian", 0, 0, 0);
    const flatRoute: CreatureContext = { ...routed, steer: () => ({ x: 8, y: 0, z: 0 }) };
    let highest = 0;
    for (let tick = 0; tick < 120; tick += 1) { stepCreature(hopper, flatRoute); highest = Math.max(highest, hopper.y); }
    expect(highest).toBeLessThan(2.5);
    expect(hopper.x).toBeLessThan(4);
  });

  it("beetles rush the nearest player and bite on a cooldown", () => {
    const beetle = createCreature("beetle", 0, 0, 0);
    const events = run(beetle, [player(10, 0), player(-30, 0)], 4);
    expect(beetle.x).toBeGreaterThan(8);
    const bites = events.filter((event) => event.type === "melee");
    expect(bites.length).toBeGreaterThanOrEqual(2);
    expect(bites[0]).toMatchObject({ target: "p", damage: CREATURE_TUNING.beetle.damage });
    expect(bites.length).toBeLessThanOrEqual(Math.ceil(4000 / CREATURE_TUNING.beetle.cooldownMs) + 1);
    const idle = createCreature("beetle", 0, 0, 0);
    expect(run(idle, [], 1)).toEqual([]);
  });

  it("spitters keep their distance and lob ink at the target", () => {
    const close = createCreature("spitter", 0, 0, 0);
    run(close, [player(5, 0)], 2);
    expect(close.x).toBeLessThan(0);
    const far = createCreature("spitter", 0, 0, 0);
    run(far, [player(45, 0)], 3);
    expect(far.x).toBeGreaterThan(5);
    const inRange = createCreature("spitter", 0, 0, 0);
    const events = run(inRange, [player(20, 0)], 3);
    const spit = events.find((event) => event.type === "spit");
    expect(spit).toMatchObject({ target: "p" });
    expect(spit && spit.type === "spit" ? spit.vx : 0).toBeGreaterThan(CREATURE_TUNING.spitter.projectileSpeed * 0.9);
    expect(Math.abs(inRange.x)).toBeLessThan(0.5);
  });

  it("guardians block arrows at their front shield but not from behind or on the gem", () => {
    const guardian = createCreature("guardian", 0, 0, 0);
    guardian.yaw = 0; // facing -z
    const fromFront = creatureHit(guardian, { x: 0, y: 1, z: -3 }, { x: 0, y: 1, z: 0 })!;
    expect(fromFront).toEqual({ gem: false });
    expect(creatureDamage(guardian, 40, fromFront, 0, 60)).toEqual({ damage: 0, blocked: true });
    expect(creatureDamage(guardian, 40, fromFront, 0, -60)).toEqual({ damage: 40, blocked: false });
    expect(creatureDamage(guardian, 40, fromFront, 60, 0)).toEqual({ damage: 40, blocked: false });
    const gemY = CREATURE_TUNING.guardian.gemHeightM, gemZ = -CREATURE_TUNING.guardian.radius * 0.6;
    const gem = creatureHit(guardian, { x: -2, y: gemY, z: gemZ }, { x: 2, y: gemY, z: gemZ })!;
    expect(gem.gem).toBe(true);
    expect(creatureDamage(guardian, 40, gem, 0, 60)).toEqual({ damage: 40, blocked: false });
    expect(creatureHit(guardian, { x: -2, y: 5, z: 0 }, { x: 2, y: 5, z: 0 })).toBeNull();
  });

  it("wisps hover, dive at a player, strike and climb away", () => {
    const wisp = createCreature("wisp", 0, 4, 0);
    const events = run(wisp, [player(3, 0)], 3);
    expect(events.some((event) => event.type === "melee" && event.damage === CREATURE_TUNING.wisp.damage)).toBe(true);
    expect(wisp.y).toBeGreaterThan(0.5);
  });

  it("the Colossus stomps after a wind-up and calls beetles once at half health", () => {
    const colossus = createCreature("colossus", 0, 0, 0, 1, 3);
    expect(colossus.maxHp).toBe(bossHp(3));
    const events = run(colossus, [player(4, 0)], 2);
    const stomps = events.filter((event) => event.type === "stomp");
    expect(stomps).toHaveLength(1);
    expect(stomps[0]).toMatchObject({ radius: CREATURE_TUNING.colossus.stompRadiusM, damage: CREATURE_TUNING.colossus.stompDamage });
    expect(events.some((event) => event.type === "summon")).toBe(false);
    colossus.hp = colossus.maxHp * 0.5;
    const later = run(colossus, [player(4, 0)], 1);
    expect(later.filter((event) => event.type === "summon")).toEqual([{ type: "summon", count: CREATURE_TUNING.colossus.summons, x: colossus.x, z: colossus.z }]);
    expect(run(colossus, [player(4, 0)], 1).some((event) => event.type === "summon")).toBe(false);
    const hit = { gem: false };
    expect(creatureDamage(colossus, 40, hit, 1, 0).damage).toBe(20);
    expect(creatureDamage(colossus, 40, { gem: true }, 1, 0).damage).toBe(80);
  });
});

describe("waves", () => {
  it("counts 6 + 2n creatures, 1.3 times more per extra player, more in a swarm", () => {
    expect(waveCount(1, 1)).toBe(8);
    expect(waveCount(5, 1)).toBe(16);
    expect(waveCount(1, 2)).toBe(Math.round(8 * 1.3));
    expect(waveCount(1, 4)).toBe(Math.round(8 * 1.3 ** 3));
    expect(waveCount(3, 1, "swarm")).toBe(Math.round(12 * EXPEDITION.swarmCountMult));
    expect(hpMultiplier("swarm")).toBe(EXPEDITION.swarmHpMult);
    expect(hpMultiplier("heavy")).toBe(EXPEDITION.heavyHpMult);
  });

  it("caps the living count, unlocks creatures by wave and puts a boss on every fifth wave", () => {
    expect(aliveCap(1)).toBe(5);
    expect(aliveCap(30)).toBe(18);
    expect(unlockedKinds(1)).toEqual(["beetle"]);
    expect(unlockedKinds(4)).toEqual(["beetle", "spitter", "guardian"]);
    expect(unlockedKinds(6)).toEqual(["beetle", "spitter", "guardian", "mire", "wisp"]);
    const rng = mulberry32(7);
    for (let pick = 0; pick < 50; pick += 1) expect(unlockedKinds(2)).toContain(pickKind(2, rng));
    expect([1, 4, 5, 9, 10].map(isBossWave)).toEqual([false, false, true, false, true]);
  });

  it("draws a modifier every third wave only", () => {
    const rng = mulberry32(3);
    expect(modifierFor(1, rng)).toBe("none");
    expect(modifierFor(2, rng)).toBe("none");
    expect(["swarm", "heavy", "night", "lowGravity"]).toContain(modifierFor(3, rng));
    expect(["swarm", "heavy", "night", "lowGravity"]).toContain(modifierFor(6, rng));
  });

  it("keeps checkpoints, solo lives and the reward cap", () => {
    expect([0, 4, 5, 9, 12].map(checkpointFor)).toEqual([0, 0, 5, 5, 10]);
    expect(earnsSoloLife(5, 1)).toBe(true);
    expect(earnsSoloLife(5, 2)).toBe(false);
    expect(earnsSoloLife(6, 1)).toBe(false);
    expect(expeditionReward(4, 0)).toEqual({ waves: 4, bosses: 0, xp: 20, ink: 8 });
    expect(expeditionReward(22, 4)).toEqual({ waves: 22, bosses: 4, xp: 22 * 5 + 4 * 40, ink: EXPEDITION.inkCap });
  });
});
