import { describe, expect, it } from "vitest";
import { ARROW_SPEED_MAX, EYE_STAND, HEAD_RADIUS } from "../constants.ts";
import { aimPointFromLook, spawnArrow } from "./arrows.ts";

describe("fire launch prediction", () => {
  it("spawns from the bow hand, not the eye", () => {
    const event = {
      type: "fire" as const,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
      fraction: 1, speed: ARROW_SPEED_MAX, damage: 60, aimRange: 25,
    };
    const arrow = spawnArrow(event, false);
    expect(arrow.y).toBeLessThan(EYE_STAND - 0.05);
    expect(arrow.x).toBeGreaterThan(0.1);
  });

  it("velocity points toward the aim point", () => {
    const event = {
      type: "fire" as const,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
      fraction: 1, speed: ARROW_SPEED_MAX, damage: 60, aimRange: 25,
    };
    const aim = aimPointFromLook(0, 0, 0, 0, 0, false, 25);
    const arrow = spawnArrow(event, false);
    const toAimX = aim.x - arrow.x;
    const toAimY = aim.y - arrow.y;
    const toAimZ = aim.z - arrow.z;
    const dot = arrow.vx * toAimX + arrow.vy * toAimY + arrow.vz * toAimZ;
    const magA = Math.hypot(arrow.vx, arrow.vy, arrow.vz);
    const magB = Math.hypot(toAimX, toAimY, toAimZ);
    expect(dot / (magA * magB)).toBeGreaterThan(0.98);
  });

  it("hand spawn along look direction (no converge) misses the crosshair", () => {
    // Old parallax bug: velocity follows look while spawn is at the hand.
    const aim = aimPointFromLook(0, 0, 0, 0, 0, false, 25);
    const handX = 0.22;
    const handY = EYE_STAND - 0.22;
    const atRangeY = handY;
    const miss = Math.hypot(handX - aim.x, atRangeY - aim.y);
    expect(miss).toBeGreaterThan(HEAD_RADIUS);
  });
});