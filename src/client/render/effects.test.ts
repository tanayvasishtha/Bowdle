import { Scene } from "three";
import { describe, expect, it } from "vitest";
import { ARROW_TRAILS, KILL_EFFECTS } from "../../shared/cosmetics.ts";
import { ArrowTrailMesh, KillBurst, TRAIL_POINTS } from "./effects.ts";

describe("arrow trails", () => {
  it("stays off for the default trail", () => {
    const trail = new ArrowTrailMesh("trail.default");
    trail.push(0, 0, 0);
    expect(trail.enabled).toBe(false);
    expect(trail.mesh.visible).toBe(false);
    expect(trail.pointCount).toBe(0);
  });

  it("keeps a bounded ribbon behind a flying arrow and shrinks once it stops", () => {
    for (const style of ARROW_TRAILS.filter((item) => item.style !== "none")) {
      const trail = new ArrowTrailMesh(style.id);
      for (let step = 0; step < 40; step += 1) trail.push(step * 0.5, 1 + step * 0.01, 0);
      expect(trail.pointCount, style.id).toBe(TRAIL_POINTS);
      const positions = trail.mesh.geometry.getAttribute("position").array;
      expect(Array.from(positions).every(Number.isFinite), style.id).toBe(true);
      expect(Array.from(positions).some((value) => value !== 0), style.id).toBe(true);
      for (let step = 0; step < TRAIL_POINTS; step += 1) trail.push(19.5, 1.39, 0);
      expect(trail.pointCount, style.id).toBe(1);
      trail.dispose();
    }
  });
});

describe("kill bursts", () => {
  it("animates every bought and level effect and ends after its lifetime", () => {
    const scene = new Scene();
    for (const effect of KILL_EFFECTS.filter((item) => item.shape !== "splat")) {
      const burst = new KillBurst(effect.id, 1, 2, 1, 3, 1000, 7);
      expect(burst.effect.id).toBe(effect.id);
      scene.add(burst.mesh);
      expect(burst.update(1300), effect.id).toBe(true);
      const matrix = burst.mesh.instanceMatrix.array;
      expect(Array.from(matrix).every(Number.isFinite), effect.id).toBe(true);
      expect(burst.update(2000), effect.id).toBe(false);
      burst.dispose(scene);
    }
    expect(scene.children).toHaveLength(0);
  });
});

describe("slow arrow trails", () => {
  it("keep growing when the arrow moves less than the point spacing per frame", () => {
    const trail = new ArrowTrailMesh("trail.river");
    for (let frame = 0; frame < 120; frame += 1) trail.push(frame * 0.1, 1, 0);
    expect(trail.pointCount).toBe(TRAIL_POINTS);
  });
});
