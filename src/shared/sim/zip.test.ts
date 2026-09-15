import { describe, expect, it } from "vitest";
import { ZIP_JUMP_BOOST } from "../constants.ts";
import { BTN } from "../input.ts";
import { kitMap } from "../maps/fixtures/kit.ts";
import { createPlayerSim, stepPlayer } from "./movement.ts";

describe("zip lines", () => {
  it("attaches only at the high end, rides, and permits firing", () => {
    const zip = kitMap.zipLines[0]!;
    const player = createPlayerSim(...zip.from);
    stepPlayer(player, { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: BTN.USE | BTN.FIRE }, kitMap, { nowMs: 0 });
    expect(player.zipId).toBe(zip.id);
    expect(player.zipT).toBeGreaterThan(0);
    for (let frame = 1; frame < 5; frame += 1) stepPlayer(player, { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: BTN.FIRE }, kitMap, { nowMs: frame * 1000 / 30 });
    const events = stepPlayer(player, { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 }, kitMap, { nowMs: 5000 / 30 });
    expect(events.some((event) => event.type === "fire")).toBe(true);
    const low = createPlayerSim(...zip.to);
    stepPlayer(low, { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: BTN.USE }, kitMap, { nowMs: 0 });
    expect(low.zipId).toBe("");
  });

  it("jump releases with boost and grapple cancels", () => {
    const player = createPlayerSim(...kitMap.zipLines[0]!.from);
    stepPlayer(player, { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: BTN.USE }, kitMap, { nowMs: 0 });
    const rideVy = player.vy;
    stepPlayer(player, { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: BTN.JUMP }, kitMap, { nowMs: 1 });
    expect(player.zipId).toBe(""); expect(player.vy).toBeGreaterThan(rideVy + ZIP_JUMP_BOOST / 2);
    player.x = kitMap.zipLines[0]!.from[0]; player.y = kitMap.zipLines[0]!.from[1]; player.z = kitMap.zipLines[0]!.from[2]; player.prevButtons = 0;
    stepPlayer(player, { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: BTN.USE }, kitMap, { nowMs: 2 });
    player.prevButtons = 0;
    stepPlayer(player, { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: BTN.GRAPPLE }, kitMap, { nowMs: 3 });
    expect(player.zipId).toBe("");
  });
});
