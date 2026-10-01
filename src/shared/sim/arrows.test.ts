import { describe, expect, it } from "vitest";
import { ARROW_GRAVITY, ARROW_RADIUS, ARROW_SPEED_MAX, BODY_RADIUS, CROUCH_HEIGHT, EYE_STAND, HEAD_RADIUS, STAND_HEIGHT, SUBSTEPS, TICK_HZ } from "../constants.ts";
import type { MapData } from "../maps/types.ts";
import type { Vec3 } from "../math/vec3.ts";
import { headCenterY } from "./hitboxes.ts";
import { aimRangeAlongLook, spawnArrow, stepArrow, sweepArrowVsTarget, type ArrowSim } from "./arrows.ts";
import { arrowSpeed, bodyDamage } from "./bow.ts";

function emptyMap(boxes: MapData["boxes"] = []): MapData {
  return { id: "test", name: "test", bounds: { min: [-100, -100, -100], max: [100, 100, 100] }, boxes, ramps: [], volumes: [], zipLines: [], boulders: [], props: [], spawns: { sun: [], moon: [] }, waypoints: [], decor: [], notes: [], look: { sunShafts: false, stainSeed: 0 } };
}

function arrow(): ArrowSim {
  return { x: 0, y: 2, z: 0, vx: ARROW_SPEED_MAX, vy: 10, vz: 0, damage: 60, ageMs: 0, stuck: false };
}

describe("arrows", () => {
  it("matches closed-form ballistic position", () => {
    const shot = arrow();
    const dt = 1 / 60;
    for (let step = 0; step < 60; step += 1) stepArrow(shot, emptyMap(), dt);
    expect(shot.x).toBeCloseTo(ARROW_SPEED_MAX, 6);
    expect(shot.y).toBeCloseTo(2 + 10 - ARROW_GRAVITY / 2, 2);
  });

  it("does not tunnel through a 0.1 m wall at 95 m/s", () => {
    const wall = { id: "thin", min: [1, 0, -1], max: [1.1, 4, 1], material: "stone", tags: ["solid"] } as const;
    const shot = arrow();
    shot.vy = 0;
    const result = stepArrow(shot, emptyMap([wall]), 1 / 60);
    expect(result.worldHit).toBe(true);
    expect(shot.x).toBeLessThan(1);
  });

  it("sticks to a ramp slope and a water surface", () => {
    const rampMap = { ...emptyMap(), ramps: [{ id: "ramp", min: [0, 0, -2], max: [4, 2, 2], up: "+x", material: "earth", tags: ["solid"] }] } as MapData;
    const slopeShot = arrow(); slopeShot.x = 2; slopeShot.y = 3; slopeShot.vx = 0; slopeShot.vy = -20;
    expect(stepArrow(slopeShot, rampMap, 0.1, 0).worldHit).toBe(true);
    expect(slopeShot.y).toBeCloseTo(1 + ARROW_RADIUS, 5);
    const waterMap = { ...emptyMap(), volumes: [{ id: "water", min: [-2, 0, -2], max: [2, 1, 2], kind: "water" }] } as MapData;
    const waterShot = arrow(); waterShot.vx = 0; waterShot.vy = -20;
    expect(stepArrow(waterShot, waterMap, 0.1, 0).worldHit).toBe(true);
    expect(waterShot.y).toBeCloseTo(1 + ARROW_RADIUS, 5);
  });

  it("selects a head hit when contacts tie", () => {
    const target = { x: 5, y: 0, z: 0, height: STAND_HEIGHT, crouched: false };
    const bodyTop = target.y + target.height - 0.3;
    const headY = headCenterY(target);
    const bodySweepRadius = BODY_RADIUS + ARROW_RADIUS;
    const headSweepRadius = HEAD_RADIUS + ARROW_RADIUS;
    const y = (bodySweepRadius * bodySweepRadius - headSweepRadius * headSweepRadius + headY * headY - bodyTop * bodyTop) / (2 * (headY - bodyTop));
    const from: Vec3 = { x: 0, y, z: 0 };
    const to: Vec3 = { x: 10, y, z: 0 };
    expect(sweepArrowVsTarget(from, to, target)?.kind).toBe("head");
  });

  it("lowers both hitboxes while crouching", () => {
    const standing = { x: 0, y: 0, z: 0, height: STAND_HEIGHT, crouched: false };
    const crouching = { ...standing, height: CROUCH_HEIGHT, crouched: true };
    expect(headCenterY(crouching)).toBeLessThan(headCenterY(standing));
    const from: Vec3 = { x: -2, y: 1.5, z: 0 };
    const to: Vec3 = { x: 2, y: 1.5, z: 0 };
    expect(sweepArrowVsTarget(from, to, standing)).not.toBeNull();
    expect(sweepArrowVsTarget(from, to, crouching)).toBeNull();
  });

  it("a crosshair on the head is a headshot and on the chest a body hit, at any range and draw", () => {
    const ground = emptyMap([{ id: "floor", min: [-100, -1, -100], max: [100, 0, 100], material: "earth", tags: ["solid"] }]);
    const shoot = (distance: number, aimY: number, fraction: number): string => {
      const target = { x: 0, y: 0, z: -distance, height: STAND_HEIGHT, crouched: false };
      const event = { type: "fire" as const, x: 0, y: 0, z: 0, yaw: 0, pitch: Math.atan2(aimY - EYE_STAND, distance), fraction, speed: arrowSpeed(fraction), damage: bodyDamage(fraction) };
      const shot = spawnArrow({ ...event, aimRange: aimRangeAlongLook(event, false, ground, [target]) });
      const dt = 1 / (TICK_HZ * SUBSTEPS);
      for (let step = 0; step < TICK_HZ * SUBSTEPS * 3 && !shot.stuck; step += 1) {
        const from = { x: shot.x, y: shot.y, z: shot.z };
        stepArrow(shot, ground, dt);
        const hit = sweepArrowVsTarget(from, shot, target);
        if (hit) return hit.kind;
      }
      return "miss";
    };
    const head = headCenterY({ x: 0, y: 0, z: 0, height: STAND_HEIGHT, crouched: false });
    for (const distance of [5, 20, 50]) for (const fraction of [0, 1]) {
      expect(shoot(distance, head, fraction)).toBe("head");
      expect(shoot(distance, 1.1, fraction)).toBe("body");
    }
  });
});
