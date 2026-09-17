import { describe, expect, it } from "vitest";

import { BREAKABLE, MAP_HERB } from "../constants.ts";

import type { MapData } from "../maps/types.ts";

import { createPlayerSim } from "./movement.ts";

import {

  breakableHitBySegment,

  createBreakables,

  createHerbs,

  damageBreakable,

  solidBreakableBoxes,

  stepBreakables,

  tryGeyserLaunch,

  tryPickHerb,

} from "./mapFeatures.ts";



const kitMap = {

  id: "kit-features",

  name: "Kit",

  bounds: { min: [-20, -2, -20], max: [20, 12, 20] },

  boxes: [{ id: "floor", min: [-20, -1, -20], max: [20, 0, 20], material: "earth", tags: ["solid"] }],

  ramps: [],

  volumes: [],

  zipLines: [],

  boulders: [],

  props: [],

  spawns: { sun: [{ pos: [-10, 0, 0], yaw: 0 }], moon: [{ pos: [10, 0, 0], yaw: Math.PI }] },

  waypoints: [],

  decor: [],

  notes: [],

  look: { sunShafts: false, stainSeed: 1 },

  geysers: [

    { id: "sun-geyser", pos: [-2, 0, 0], radius: 1.5, launch: 14 },

    { id: "moon-geyser", pos: [2, 0, 0], radius: 1.5, launch: 14 },

  ],

  herbs: [

    { id: "sun-herb", pos: [-4, 0, 0] },

    { id: "moon-herb", pos: [4, 0, 0] },

  ],

  breakables: [

    { id: "sun-plank", box: { min: [-6, 0, -1], max: [-5, 3, 1] }, hp: 60 },

    { id: "moon-plank", box: { min: [5, 0, -1], max: [6, 3, 1] }, hp: 60 },

  ],

  anchors: [

    { id: "sun-anchor", pos: [-3, 5, 0], sway: { axis: "x", amplitude: 1, periodS: 4 } },

    { id: "moon-anchor", pos: [3, 5, 0], sway: { axis: "x", amplitude: 1, periodS: 4 } },

  ],

} as MapData;



describe("mapFeatures", () => {

  it("launches a player standing on a geyser", () => {

    const player = createPlayerSim();

    player.x = -2; player.y = 0.1; player.z = 0; player.vy = 0;

    const launches = new Map<string, number>();

    expect(tryGeyserLaunch(kitMap.geysers!, player, "p1", launches, 1000)).toBe(true);

    expect(player.vy).toBeGreaterThanOrEqual(14);

    expect(tryGeyserLaunch(kitMap.geysers!, player, "p1", launches, 1100)).toBe(false);

  });



  it("heals on herb pickup and respawns later", () => {

    const herbs = createHerbs(kitMap);

    const player = createPlayerSim();

    player.x = -4; player.y = 0; player.z = 0; player.hp = 40;

    expect(tryPickHerb(herbs, player, 0)?.id).toBe("sun-herb");

    expect(player.hp).toBe(40 + MAP_HERB.heal);

    expect(tryPickHerb(herbs, player, 100)).toBeNull();

    player.hp = 40;

    expect(tryPickHerb(herbs, player, MAP_HERB.respawnMs)?.id).toBe("sun-herb");

  });



  it("breaks a plank and rebuilds after the timer when clear", () => {

    const items = createBreakables(kitMap);

    expect(solidBreakableBoxes(items)).toHaveLength(2);

    expect(breakableHitBySegment(items, -7, 1.5, 0, -4, 1.5, 0)?.item.id).toBe("sun-plank");

    expect(damageBreakable(items, "sun-plank", BREAKABLE.defaultHp, 0)).toBe(true);

    expect(items[0]!.broken).toBe(true);

    expect(solidBreakableBoxes(items)).toHaveLength(1);

    const player = createPlayerSim();

    player.x = 0; player.y = 0; player.z = 0;

    stepBreakables(items, [player], BREAKABLE.rebuildMs);

    expect(items[0]!.broken).toBe(false);

    expect(items[0]!.hp).toBe(BREAKABLE.defaultHp);

  });

});

