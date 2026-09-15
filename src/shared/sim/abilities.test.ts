import { describe, expect, it } from "vitest";
import { GRAPPLE_COOLDOWN_MS, GRAPPLE_MAX_MS, GRAPPLE_RANGE, INK_CLOUD_COOLDOWN_MS } from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import type { MapData } from "../maps/types.ts";
import { createPlayerSim } from "./movement.ts";
import { sphereBlocksSight, stepAbilityInput, stepGrapplePull, tryAttachGrapple } from "./abilities.ts";

const input: PlayerInputFrame = { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: BTN.GRAPPLE };

function mapAt(distance: number, grapple = true): MapData {
  return {
    id: "ability-test", name: "Ability test", bounds: { min: [-50, -5, -50], max: [50, 50, 50] },
    boxes: [{ id: "target", min: [-1, 0, -distance - 1], max: [1, 4, -distance], material: "gold", tags: grapple ? ["solid", "grapple"] : ["solid"] }],
    spawns: { sun: [], moon: [] }, waypoints: [], decor: [],
  };
}

describe("grapple", () => {
  it("attaches only to tagged boxes in range", () => {
    const player = createPlayerSim();
    expect(tryAttachGrapple(player, input, mapAt(10, false))).toBeNull();
    expect(player.grappleActive).toBe(false);
    expect(tryAttachGrapple(player, input, mapAt(GRAPPLE_RANGE + 1))).toBeNull();
    const event = tryAttachGrapple(player, input, mapAt(10));
    expect(event?.type).toBe("grapple");
    expect(player.grappleActive).toBe(true);
    expect(player.grappleZ).toBeCloseTo(-10);
  });

  it("releases on jump, second press, distance and maximum time", () => {
    const jumper = createPlayerSim();
    tryAttachGrapple(jumper, input, mapAt(10));
    jumper.prevButtons = 0;
    const vy = jumper.vy;
    stepAbilityInput(jumper, { ...input, buttons: BTN.JUMP }, mapAt(10), 0);
    expect(jumper.grappleActive).toBe(false);
    expect(jumper.vy).toBeGreaterThan(vy);

    const toggle = createPlayerSim();
    tryAttachGrapple(toggle, input, mapAt(10));
    toggle.prevButtons = 0;
    stepAbilityInput(toggle, input, mapAt(10), 0);
    expect(toggle.grappleActive).toBe(false);

    const close = createPlayerSim(); close.grappleActive = true; close.grappleY = close.height * 0.5; close.grappleZ = -1;
    stepGrapplePull(close, 1 / 60, 1000 / 60);
    expect(close.grappleActive).toBe(false);

    const timed = createPlayerSim(); timed.grappleActive = true; timed.grappleZ = -10; timed.grappleMs = GRAPPLE_MAX_MS;
    stepGrapplePull(timed, 1 / 60, 1000 / 60);
    expect(timed.grappleActive).toBe(false);
  });

  it("starts deterministic cooldowns and emits an ink lob", () => {
    const player = createPlayerSim();
    const grapple = stepAbilityInput(player, input, mapAt(10), 0);
    expect(grapple[0]?.type).toBe("grapple");
    expect(player.grappleCooldownMs).toBe(GRAPPLE_COOLDOWN_MS);
    player.prevButtons = 0;
    const ink = stepAbilityInput(player, { ...input, buttons: BTN.INK }, mapAt(10), 0);
    expect(ink[0]?.type).toBe("ink");
    expect(player.inkCooldownMs).toBe(INK_CLOUD_COOLDOWN_MS);
  });
});

describe("ink vision", () => {
  it("blocks a line-of-sight ray through its center", () => {
    const from = { x: -10, y: 2, z: 0, radius: 0 };
    const to = { x: 10, y: 2, z: 0, radius: 0 };
    expect(sphereBlocksSight(from, to, { x: 0, y: 2, z: 0, radius: 4.5 })).toBe(true);
    expect(sphereBlocksSight(from, to, { x: 0, y: 8, z: 0, radius: 4.5 })).toBe(false);
  });
});
