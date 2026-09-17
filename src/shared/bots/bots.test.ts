import { describe, expect, it } from "vitest";
import { ARROW_GRAVITY, ARROW_SPEED_MAX } from "../constants.ts";
import { defaultMatchMap } from "../maps/registry.ts";
import { mulberry32 } from "../math/rng.ts";
import { solveProjectileLead } from "./aim.ts";
import { findPath, nearestWaypoint } from "./nav.ts";
import { BotController } from "../../server/bots/BotController.ts";
import { createPlayerSim } from "../sim/movement.ts";
import { BTN } from "../input.ts";
import { kitMap } from "../maps/fixtures/kit.ts";
import { canopyMap } from "../maps/canopy.ts";

describe("computer-controlled navigation and aim", () => {
  it("finds a route between every pair of spawns", () => {
    const spawns = [...defaultMatchMap.spawns.sun, ...defaultMatchMap.spawns.moon];
    for (const from of spawns) for (const to of spawns) {
      const start = nearestWaypoint(defaultMatchMap, ...from.pos), goal = nearestWaypoint(defaultMatchMap, ...to.pos);
      expect(findPath(defaultMatchMap, start.id, goal.id).length).toBeGreaterThan(0);
    }
  });

  it("keeps a filtered route to the links a walker can take", () => {
    const walkable = (link: { kind: string }): boolean => link.kind === "walk" || link.kind === "jump" || link.kind === "drop";
    for (const map of [defaultMatchMap, canopyMap]) {
      const start = nearestWaypoint(map, ...map.spawns.sun[0]!.pos), goal = nearestWaypoint(map, ...map.spawns.moon[0]!.pos);
      const path = findPath(map, start.id, goal.id, walkable);
      for (let index = 1; index < path.length; index += 1) {
        const link = path[index - 1]!.links.find((entry) => entry.to === path[index]!.id)!;
        expect(walkable(link)).toBe(true);
      }
    }
    const start = defaultMatchMap.waypoints[0]!, other = defaultMatchMap.waypoints[1]!;
    expect(findPath(defaultMatchMap, start.id, other.id, () => false)).toEqual([]);
  });

  it("leads a 6 m/s target at 30 m in at least 90 seeded trials", () => {
    const rng = mulberry32(0xb0d1e); let hits = 0;
    for (let trial = 0; trial < 100; trial += 1) {
      const lateral = rng() < 0.5 ? -6 : 6;
      const target = { x: 0, y: 1.67, z: -30, vx: lateral, vy: 0, vz: 0 };
      const aim = solveProjectileLead({ x: 0, y: 1.62, z: 0 }, target, ARROW_SPEED_MAX);
      const horizontal = Math.cos(aim.pitch) * ARROW_SPEED_MAX;
      const arrow = { x: -Math.sin(aim.yaw) * horizontal * aim.time, y: 1.62 + Math.sin(aim.pitch) * ARROW_SPEED_MAX * aim.time - ARROW_GRAVITY * aim.time * aim.time / 2, z: -Math.cos(aim.yaw) * horizontal * aim.time };
      const actual = { x: target.x + target.vx * aim.time, y: target.y, z: target.z };
      if (Math.hypot(arrow.x - actual.x, arrow.y - actual.y, arrow.z - actual.z) < 0.25) hits += 1;
    }
    expect(hits).toBeGreaterThanOrEqual(90);
  });
});

describe("computer-controlled abilities", () => {
  it("keeps one target when two enemies trade places as the closest, and fires", () => {
    const player = createPlayerSim(-25, 0, -8); player.team = 0;
    const a = createPlayerSim(-15, 0, -8.5); a.team = 1;
    const b = createPlayerSim(-15, 0, -7.5); b.team = 1;
    const controller = new BotController("bot", 11);
    let fired = false;
    for (let frame = 0; frame < 90; frame += 1) {
      // The enemies swap which one is nearer every frame.
      a.x = frame % 2 === 0 ? -15 : -14.9; b.x = frame % 2 === 0 ? -14.9 : -15;
      const input = controller.update(player, [["bot", player], ["a", a], ["b", b]], defaultMatchMap, 1000 + frame * 33);
      if (input.buttons & BTN.FIRE) fired = true;
    }
    expect(fired).toBe(true);
  });


  it("loses an enemy hidden by an ink cloud", () => {
    const player = createPlayerSim(-25, 0, -8); player.team = 0;
    const enemy = createPlayerSim(-15, 0, -8); enemy.team = 1;
    const controller = new BotController("bot", 7);
    controller.update(player, [["bot", player], ["enemy", enemy]], defaultMatchMap, 1000);
    expect(controller.mode).toBe("engage");
    controller.update(player, [["bot", player], ["enemy", enemy]], defaultMatchMap, 1000, [{ x: -20, y: 1.6, z: -8, radius: 4.5 }]);
    expect(controller.mode).toBe("roam");
  });

  it("throws ink while retreating", () => {
    const player = createPlayerSim(-25, 0, -8); player.team = 0; player.hp = 1;
    const enemy = createPlayerSim(-15, 0, -8); enemy.team = 1;
    const input = new BotController("bot", 9).update(player, [["bot", player], ["enemy", enemy]], defaultMatchMap, 1000);
    expect(input.buttons & BTN.INK).toBe(BTN.INK);
  });

  it("cannot see a crouched enemy fully inside tall grass", () => {
    const player = createPlayerSim(10, 0, 12); player.team = 0;
    const enemy = createPlayerSim(0, 0, 12); enemy.team = 1; enemy.crouched = true; enemy.height = 1;
    const controller = new BotController("bot", 11);
    controller.update(player, [["bot", player], ["enemy", enemy]], kitMap, 1000);
    expect(controller.mode).toBe("roam");
  });

  it("moves out of an active boulder path and never uses a lever", () => {
    const player = createPlayerSim(0, 0, -6); player.team = 0;
    const controller = new BotController("bot", 13);
    const input = controller.update(player, [["bot", player]], kitMap, 1000, [], [["center-boulder", { phase: "telegraph", x: -8, z: -6 }]]);
    expect(Math.hypot(input.moveX, input.moveZ)).toBeGreaterThan(0);
    expect(input.buttons & BTN.USE).toBe(0);
  });

  it("attaches to a nearby Canopy Village zip line", () => {
    const zip = canopyMap.zipLines[0]!;
    const player = createPlayerSim(...zip.from); player.team = 0;
    const input = new BotController("bot", 15).update(player, [["bot", player]], canopyMap, 1000);
    expect(input.buttons & BTN.USE).toBe(BTN.USE);
  });
});
