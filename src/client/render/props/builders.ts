import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { MaterialName, PropKind } from "../../../shared/maps/types.ts";
import { mulberry32 } from "../../../shared/math/rng.ts";

type Part = { geometry: BufferGeometry; material: MaterialName };
export type BuiltProp = { geometry: BufferGeometry; materials: readonly MaterialName[] };
export type PropBuilder = (seed: number) => BuiltProp;

function part(geometry: BufferGeometry, material: MaterialName, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): Part {
  geometry.deleteAttribute("uv"); geometry.rotateX(rx); geometry.rotateY(ry); geometry.rotateZ(rz); geometry.translate(x, y, z); return { geometry, material };
}
function box(w: number, h: number, d: number, material: MaterialName, x = 0, y = h / 2, z = 0, ry = 0): Part { return part(new BoxGeometry(w, h, d), material, x, y, z, 0, ry); }
function cylinder(radius: number, height: number, material: MaterialName, x = 0, y = height / 2, z = 0, rz = 0): Part { return part(new CylinderGeometry(radius * 0.75, radius, height, 7), material, x, y, z, 0, 0, rz); }
function blob(radius: number, material: MaterialName, x = 0, y = radius, z = 0): Part { return part(new SphereGeometry(radius, 7, 5), material, x, y, z); }
function cone(radius: number, height: number, material: MaterialName, x = 0, y = height / 2, z = 0, rz = 0): Part { return part(new ConeGeometry(radius, height, 7), material, x, y, z, 0, 0, rz); }
function build(parts: Part[]): BuiltProp {
  const materials: MaterialName[] = []; const geometries: BufferGeometry[] = [];
  for (const entry of parts) { materials.push(entry.material); entry.geometry.computeVertexNormals(); geometries.push(entry.geometry); }
  const geometry = mergeGeometries(geometries, true); if (!geometry) throw new Error("Prop geometry attributes differ");
  for (const item of geometries) item.dispose(); return { geometry, materials };
}

export const buildGiantTree: PropBuilder = (seed) => { const rng = mulberry32(seed), parts = [cylinder(1.35, 7, "wood")]; for (let i = 0; i < 4; i += 1) parts.push(box(2.8, 0.35, 0.55, "wood", Math.cos(i * Math.PI / 2) * 1.1, 0.25, Math.sin(i * Math.PI / 2) * 1.1, -i * Math.PI / 2)); for (let i = 0; i < 8; i += 1) parts.push(blob(1.6 + rng() * 0.5, "canopy", Math.cos(i * 2.4) * 2.1, 7 + rng() * 2, Math.sin(i * 2.4) * 2.1)); return build(parts); };
export const buildPalm: PropBuilder = (seed) => { const rng = mulberry32(seed), parts = [cylinder(0.35, 5 + rng(), "wood", 0, 2.5, 0, 0.08)]; for (let i = 0; i < 7; i += 1) parts.push(cone(0.5, 3.4, "fern", Math.cos(i * 0.9) * 1.2, 5.2, Math.sin(i * 0.9) * 1.2, Math.PI / 2)); return build(parts); };
function leafy(seed: number, grass: boolean): BuiltProp { const rng = mulberry32(seed), parts: Part[] = []; for (let i = 0; i < (grass ? 14 : 9); i += 1) parts.push(cone(grass ? 0.08 : 0.2, (grass ? 0.8 : 1.5) * (0.7 + rng() * 0.5), "fern", (rng() - 0.5) * 1.4, 0.5, (rng() - 0.5) * 1.4, (rng() - 0.5) * 0.7)); return build(parts); }
export const buildFernClump: PropBuilder = (seed) => leafy(seed, false);
export const buildGrassPatch: PropBuilder = (seed) => leafy(seed, true);
export const buildFallenLog: PropBuilder = (seed) => build([part(new CylinderGeometry(0.65, 0.8, 4 + mulberry32(seed)(), 8), "wood", 0, 0.7, 0, 0, 0, Math.PI / 2), blob(0.7, "fern", -1.5, 0.8, 0)]);
export const buildRockPile: PropBuilder = (seed) => { const rng = mulberry32(seed), parts: Part[] = []; for (let i = 0; i < 6; i += 1) parts.push(blob(0.45 + rng() * 0.5, "stone", (rng() - 0.5) * 1.5, 0.35 + rng() * 0.4, (rng() - 0.5) * 1.5)); return build(parts); };
export const buildTempleBlock: PropBuilder = () => build([box(2.4, 1.4, 1.6, "carvedStone"), box(1.2, 0.08, 0.04, "gold", 0, 0.8, 0.82)]);
export const buildPillar: PropBuilder = () => build([cylinder(0.65, 4.5, "carvedStone"), box(1.5, 0.35, 1.5, "stone", 0, 0.18), box(1.4, 0.3, 1.4, "stone", 0, 4.35)]);
export const buildBrokenPillar: PropBuilder = () => build([cylinder(0.7, 2.7, "carvedStone", 0, 1.35, 0, 0.12), blob(0.55, "stone", 0.9, 0.45, 0.3)]);
export const buildStepTier: PropBuilder = () => build([box(3.5, 0.4, 2.5, "stone"), box(2.7, 0.4, 1.9, "carvedStone", 0, 0.6), box(1.9, 0.4, 1.3, "stone", 0, 1)]);
export const buildSunDisc: PropBuilder = () => build([part(new CylinderGeometry(1.5, 1.5, 0.3, 16), "gold", 0, 1.7, 0, Math.PI / 2), part(new TorusGeometry(1.85, 0.08, 5, 16), "carvedStone", 0, 1.7, 0)]);
export const buildStoneHead: PropBuilder = () => build([box(1.7, 2.1, 1.4, "carvedStone"), box(0.28, 0.2, 0.15, "stone", -0.42, 1.35, -0.75), box(0.28, 0.2, 0.15, "stone", 0.42, 1.35, -0.75)]);
export const buildTorch: PropBuilder = () => build([cylinder(0.1, 2.4, "wood"), cone(0.35, 0.8, "gold", 0, 2.75)]);
export const buildBrazier: PropBuilder = () => build([part(new TorusGeometry(0.8, 0.12, 5, 10), "stone", 0, 1.1, 0, Math.PI / 2), cylinder(0.12, 1.2, "stone"), cone(0.5, 1.1, "gold", 0, 1.75)]);
export const buildRopeBridge: PropBuilder = () => { const parts: Part[] = []; for (let i = 0; i < 9; i += 1) parts.push(box(1.8, 0.12, 0.55, "wood", 0, 0, (i - 4) * 0.62)); parts.push(cylinder(0.04, 5.6, "rope", -1, 0.55, 0, Math.PI / 2), cylinder(0.04, 5.6, "rope", 1, 0.55, 0, Math.PI / 2)); return build(parts); };
export const buildZipRope: PropBuilder = () => build([part(new CylinderGeometry(0.04, 0.04, 6, 6), "rope", 0, 2.5, 0, 0, 0, Math.PI / 2), part(new TorusGeometry(0.35, 0.08, 5, 10), "gold", -3, 2.5)]);
export const buildLever: PropBuilder = () => build([box(0.7, 0.4, 0.7, "stone"), cylinder(0.09, 1.5, "gold", 0, 1, 0, -0.55), blob(0.18, "hazard", -0.43, 1.65)]);
export const buildVineWall: PropBuilder = (seed) => { const rng = mulberry32(seed), parts: Part[] = []; for (let i = 0; i < 8; i += 1) parts.push(cylinder(0.035, 3 + rng(), "fern", (i - 3.5) * 0.38, 1.7, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.2)); return build(parts); };
export const buildWaterfall: PropBuilder = () => build([box(3.5, 5, 0.12, "water", 0, 2.5), box(3.8, 0.08, 0.8, "water", 0, 0.1, 0.3)]);
export const buildWaterSurface: PropBuilder = () => build([box(4, 0.08, 3, "water", 0, 0.04)]);
export const buildMist: PropBuilder = (seed) => { const rng = mulberry32(seed), parts: Part[] = []; for (let i = 0; i < 5; i += 1) parts.push(blob(0.7 + rng() * 0.5, "canvas", (rng() - 0.5) * 2.4, 0.5 + rng(), (rng() - 0.5) * 1.2)); return build(parts); };
export const buildTent: PropBuilder = () => build([part(new ConeGeometry(2.1, 2.7, 4), "canvas", 0, 1.35, 0, 0, Math.PI / 4), cylinder(0.05, 3, "wood", 0, 1.5)]);
export const buildCrate: PropBuilder = () => build([box(1.6, 1.6, 1.6, "wood"), box(1.9, 0.12, 0.12, "gold", 0, 0.8, -0.82, Math.PI / 4)]);
export const buildLantern: PropBuilder = () => build([box(0.55, 0.8, 0.55, "canvas", 0, 0.7), part(new TorusGeometry(0.35, 0.04, 5, 10), "gold", 0, 1.35), cylinder(0.05, 0.9, "gold", 0, 0.7)]);
export const buildMapTable: PropBuilder = () => build([box(2.5, 0.18, 1.5, "canvas", 0, 1.5), cylinder(0.1, 1.5, "wood", -0.9, 0.75, -0.5), cylinder(0.1, 1.5, "wood", 0.9, 0.75, -0.5), cylinder(0.1, 1.5, "wood", -0.9, 0.75, 0.5), cylinder(0.1, 1.5, "wood", 0.9, 0.75, 0.5)]);
export const buildPlaneWreck: PropBuilder = () => build([part(new CylinderGeometry(0.55, 0.85, 4.5, 8), "canvas", 0, 1, 0, Math.PI / 2), box(6, 0.18, 1.5, "canvas", 0, 1, 0.4, 0.15), cylinder(0.08, 2.4, "wood", -2.4, 1, 0, Math.PI / 2)]);

export const PROP_BUILDERS: Record<PropKind, PropBuilder> = {
  giantTree: buildGiantTree, palm: buildPalm, fernClump: buildFernClump, grassPatch: buildGrassPatch, fallenLog: buildFallenLog, rockPile: buildRockPile,
  templeBlock: buildTempleBlock, pillar: buildPillar, brokenPillar: buildBrokenPillar, stepTier: buildStepTier, sunDisc: buildSunDisc, stoneHead: buildStoneHead,
  torch: buildTorch, brazier: buildBrazier, ropeBridge: buildRopeBridge, zipRope: buildZipRope, lever: buildLever, vineWall: buildVineWall,
  waterfall: buildWaterfall, waterSurface: buildWaterSurface, mist: buildMist, tent: buildTent, crate: buildCrate, lantern: buildLantern, mapTable: buildMapTable, planeWreck: buildPlaneWreck,
};
