import { setFeatureOverride } from "../features.ts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DRAW_FULL_MS, MODE_TUNING, RELIC, RUN_SPEED, SCORE_LIMIT } from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import { matchMaps } from "../maps/registry.ts";
import type { MapData } from "../maps/types.ts";
import { stepCombat } from "./bow.ts";
import { tryAttachGrapple, stepAbilityInput } from "./abilities.ts";
import { chooseSpawnFor, freeTeam, matchWinner, MODE_RULES, modeRules, scoreCapture, scoreKillFor } from "./modes.ts";
import { createPlayerSim, stepPlayer } from "./movement.ts";
import { dropRelic, inCamp, inOwnHalf, relicExpired, relicTouch, resetRelic, touchesRelic, type RelicSim } from "./relic.ts";

const match = () => ({ phase: "live" as const, phaseEndsAtMs: 1e9, scoreSun: 0, scoreMoon: 0 });

describe("mode rules", () => {
  it("scores team kills, leader kills in Free for All, and nothing in Relic Run", () => {
    const tdm = match();
    for (let kill = 0; kill < SCORE_LIMIT - 1; kill += 1) expect(scoreKillFor(tdm, "tdm", 1, 0, 0)).toBe(false);
    expect(tdm.scoreMoon).toBe(SCORE_LIMIT - 1);
    expect(scoreKillFor(tdm, "tdm", 1, 0, 0)).toBe(true);
    expect(tdm.phase).toBe("end");

    const ffa = match();
    expect(scoreKillFor(ffa, "ffa", 5, 12, 0)).toBe(false);
    expect(scoreKillFor(ffa, "ffa", 3, 4, 0)).toBe(false);
    expect(ffa.scoreSun).toBe(12);
    expect(scoreKillFor(ffa, "ffa", 3, MODE_TUNING.ffaKillLimit, 0)).toBe(true);

    const relic = match();
    expect(scoreKillFor(relic, "relic", 0, 30, 0)).toBe(false);
    expect([relic.scoreSun, relic.scoreMoon]).toEqual([0, 0]);
    expect(scoreCapture(relic, 0, 0)).toBe(false);
    expect(scoreCapture(relic, 0, 0)).toBe(false);
    expect(scoreCapture(relic, 0, 0)).toBe(true);
    expect(relic.scoreSun).toBe(MODE_TUNING.relicCaptureLimit);
  });

  it("has the limits of the design and treats unknown modes as team deathmatch", () => {
    expect(MODE_RULES.ffa).toMatchObject({ teams: false, scoreLimit: 20, timeLimitS: 420, maxPlayers: 8 });
    expect(MODE_RULES.relic).toMatchObject({ teams: true, scoreLimit: 3, timeLimitS: 480, killsScore: false });
    expect(modeRules("unknown")).toBe(MODE_RULES.tdm);
    expect(matchWinner("ffa", 20, 0)).toBe("player");
    expect(matchWinner("relic", 1, 2)).toBe("moon");
    expect(matchWinner("tdm", 3, 3)).toBe("draw");
  });

  it("gives Free for All players their own team numbers", () => {
    expect(freeTeam([])).toBe(0);
    expect(freeTeam([0, 1, 3])).toBe(2);
    expect(freeTeam([0, 1, 2, 3, 4, 5, 6])).toBe(7);
  });

  it("spawns Free for All players as far as possible from everyone", () => {
    const map = matchMaps[0]!;
    const near = createPlayerSim(...map.spawns.sun[0]!.pos);
    const far = createPlayerSim(...map.spawns.moon[0]!.pos);
    const spawn = chooseSpawnFor("ffa", map, 3, [near, far]);
    const closest = Math.min(...[near, far].map((player) => Math.hypot(spawn.pos[0] - player.x, spawn.pos[2] - player.z)));
    for (const other of [...map.spawns.sun, ...map.spawns.moon]) {
      expect(Math.min(...[near, far].map((player) => Math.hypot(other.pos[0] - player.x, other.pos[2] - player.z)))).toBeLessThanOrEqual(closest + 1e-9);
    }
    expect(map.spawns.sun).toContain(chooseSpawnFor("tdm", map, 0, []));
  });
});

describe("relic", () => {
  const map = matchMaps[0]!;
  const relic = (): RelicSim => { const state = { x: 0, y: 0, z: 0, carrier: "", home: true, droppedAtMs: 0, droppedByTeam: -1 }; resetRelic(state, map); return state; };

  it("is picked up at home by anyone and sent home by defenders in their own half", () => {
    const state = relic();
    expect(relicTouch(state, 0, -1)).toBe("pickup");
    dropRelic(state, -10, 0, 0, 1, 1000);
    expect(relicTouch(state, 0, -10)).toBe("return");
    expect(relicTouch(state, 1, -10)).toBe("pickup");
    dropRelic(state, 10, 0, 0, 1, 1000);
    expect(relicTouch(state, 0, 10)).toBe("pickup");
    state.carrier = "someone";
    expect(relicTouch(state, 0, 10)).toBeNull();
    expect(inOwnHalf(0, -1)).toBe(true);
    expect(inOwnHalf(1, -1)).toBe(false);
  });

  it("goes home after 15 s on the ground", () => {
    const state = relic();
    expect(relicExpired(state, 1e9)).toBe(false);
    dropRelic(state, 5, 0, 5, 0, 1000);
    expect(relicExpired(state, 1000 + RELIC.returnMs - 1)).toBe(false);
    expect(relicExpired(state, 1000 + RELIC.returnMs)).toBe(true);
    expect(touchesRelic(state, 5.5, 0, 5)).toBe(true);
    expect(touchesRelic(state, 5 + RELIC.touchM + 0.1, 0, 5)).toBe(false);
    expect(touchesRelic(state, 5, RELIC.touchHeightM + 0.1, 5)).toBe(false);
  });

  it("has a reachable home and camps around each team's spawns on every launch map", () => {
    for (const launch of matchMaps as readonly MapData[]) {
      expect(launch.relic, launch.id).toBeDefined();
      const [x, y, z] = launch.relic!;
      expect(Math.abs(x), launch.id).toBeLessThan(0.01);
      const nearest = Math.min(...launch.waypoints.map((waypoint) => Math.hypot(waypoint.pos[0] - x, waypoint.pos[1] - y, waypoint.pos[2] - z)));
      expect(nearest, launch.id).toBeLessThan(1);
      for (const spawn of launch.spawns.sun) expect(inCamp(launch, 0, ...spawn.pos), launch.id).toBe(true);
      for (const spawn of launch.spawns.moon) expect(inCamp(launch, 1, ...spawn.pos), launch.id).toBe(true);
      expect(inCamp(launch, 0, ...launch.spawns.moon[0]!.pos)).toBe(false);
      expect(inCamp(launch, 0, x, y, z)).toBe(false);
    }
  });
});

describe("relic carrier", () => {
  beforeEach(() => setFeatureOverride("extraArrows", true));
  afterEach(() => setFeatureOverride("extraArrows", undefined));
    const flat: MapData = { ...matchMaps[0]!, boxes: [{ id: "floor", min: [-50, -1, -50], max: [50, 0, 50], material: "earth", tags: ["solid"] }, { id: "hook", min: [-1, 0, -12], max: [1, 5, -10], material: "wood", tags: ["solid", "grapple"] }], ramps: [], volumes: [], zipLines: [], boulders: [] };
  const forward: PlayerInputFrame = { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 };

  it("runs slower", () => {
    const runner = createPlayerSim(), carrier = createPlayerSim(); carrier.relicCarrier = true;
    const away = { ...forward, yaw: Math.PI };
    for (let tick = 0; tick < 60; tick += 1) { stepPlayer(runner, away, flat, { nowMs: tick * 33 }); stepPlayer(carrier, away, flat, { nowMs: tick * 33 }); }
    expect(Math.hypot(runner.vx, runner.vz)).toBeCloseTo(RUN_SPEED, 1);
    expect(Math.hypot(carrier.vx, carrier.vz)).toBeCloseTo(RUN_SPEED * RELIC.carrierSpeedMult, 1);
  });

  it("cannot vine hop, grapple or shoot a tether", () => {
    const carrier = createPlayerSim(); carrier.relicCarrier = true;
    stepPlayer(carrier, { ...forward, buttons: BTN.JUMP }, flat, { nowMs: 0 });
    for (let tick = 1; tick < 9; tick += 1) stepPlayer(carrier, forward, flat, { nowMs: tick * 33 });
    const airJumps = carrier.airJumps;
    stepPlayer(carrier, { ...forward, buttons: BTN.JUMP }, flat, { nowMs: 300 });
    expect(carrier.grounded).toBe(false);
    expect(carrier.airJumps).toBe(airJumps);

    const hooker = createPlayerSim(); hooker.relicCarrier = true;
    expect(tryAttachGrapple(createPlayerSim(), { ...forward, buttons: BTN.GRAPPLE }, flat)).not.toBeNull();
    expect(stepAbilityInput(hooker, { ...forward, buttons: BTN.GRAPPLE }, flat, 33)).toEqual([]);
    expect(hooker.grappleActive).toBe(false);

    const archer = createPlayerSim(); archer.relicCarrier = true; archer.arrowSlot = 2;
    archer.prevButtons = BTN.FIRE; archer.drawMs = DRAW_FULL_MS;
    expect(stepCombat(archer, { ...forward, buttons: 0 }, 33)).toEqual([]);
  });
});
