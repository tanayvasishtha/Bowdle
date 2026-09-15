import { describe, expect, it } from "vitest";
import { ARROW_GRAVITY, ARROW_SPEED_MAX } from "../constants.ts";
import { notebookMap } from "../maps/notebook.ts";
import { mulberry32 } from "../math/rng.ts";
import { solveProjectileLead } from "./aim.ts";
import { findPath, nearestWaypoint } from "./nav.ts";

describe("computer-controlled navigation and aim", () => {
  it("finds a route between every pair of spawns", () => {
    const spawns = [...notebookMap.spawns.red, ...notebookMap.spawns.green];
    for (const from of spawns) for (const to of spawns) {
      const start = nearestWaypoint(notebookMap, ...from.pos), goal = nearestWaypoint(notebookMap, ...to.pos);
      expect(findPath(notebookMap, start.id, goal.id).length).toBeGreaterThan(0);
    }
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
