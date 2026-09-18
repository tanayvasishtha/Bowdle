import {
  BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, DynamicDrawUsage, Euler, IcosahedronGeometry, InstancedMesh, Matrix4, OctahedronGeometry,
  Quaternion, SphereGeometry, Vector3, type Object3D,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CREATURE_TUNING } from "../../shared/constants.ts";
import { InkMaterial } from "./InkMaterial.ts";
import { CREATURE_LOOK as L } from "./look.ts";
import { MATERIAL_ID } from "./palette.ts";

export type CreatureVisualKind = keyof typeof CREATURE_TUNING;
export const CREATURE_KINDS = Object.keys(CREATURE_TUNING) as CreatureVisualKind[];

type Part = { geometry: BufferGeometry; at: [number, number, number]; scale?: [number, number, number]; rotate?: [number, number, number] };

const partMatrix = new Matrix4();
const partRotation = new Quaternion();
const partEuler = new Euler();
const partScale = new Vector3();
const partPosition = new Vector3();

/** Bakes parts into one geometry, so each creature kind is one draw call for its body and one for its accents. */
function bake(parts: readonly Part[]): BufferGeometry {
  const placed = parts.map((part) => {
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    for (const name of Object.keys(geometry.attributes)) if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
    partRotation.setFromEuler(partEuler.set(...(part.rotate ?? [0, 0, 0])));
    geometry.applyMatrix4(partMatrix.compose(partPosition.set(...part.at), partRotation, partScale.set(...(part.scale ?? [1, 1, 1]))));
    return geometry;
  });
  const merged = mergeGeometries(placed);
  if (!merged) throw new Error("Creature parts did not merge");
  merged.computeBoundingSphere();
  return merged;
}

const box = (w: number, h: number, d: number): BufferGeometry => new BoxGeometry(w, h, d);
const ball = (r: number, detail = 1): BufferGeometry => new IcosahedronGeometry(r, detail);

/** Legs in pairs along the body, splayed out, as thin ink strokes. */
function legs(count: number, spread: number, length: number, y: number, thickness: number): Part[] {
  const parts: Part[] = [];
  for (let index = 0; index < count; index += 1) {
    const z = (index / Math.max(1, count - 1) - 0.5) * spread;
    for (const side of [-1, 1]) parts.push({ geometry: box(length, thickness, thickness), at: [side * length * 0.55, y, z], rotate: [0, side * (z * 0.6), side * -0.6] });
  }
  return parts;
}

/** Local space: forward is -Z like players; y 0 is the feet. */
function bodyParts(kind: CreatureVisualKind): Part[] {
  switch (kind) {
    case "beetle": return [
      { geometry: ball(0.5), at: [0, 0.38, 0.05], scale: [1, 0.62, 1.35] },
      { geometry: ball(0.22), at: [0, 0.36, -0.62] },
      { geometry: new ConeGeometry(0.06, 0.34, 5), at: [-0.12, 0.33, -0.86], rotate: [-Math.PI / 2, 0, 0.35] },
      { geometry: new ConeGeometry(0.06, 0.34, 5), at: [0.12, 0.33, -0.86], rotate: [-Math.PI / 2, 0, -0.35] },
      ...legs(3, 0.8, 0.55, 0.2, 0.06),
    ];
    case "spitter": return [
      { geometry: ball(0.62), at: [0, 0.78, 0], scale: [1, 1.1, 1] },
      { geometry: new CylinderGeometry(0.16, 0.28, 0.5, 7), at: [0, 1.15, -0.45], rotate: [-1.1, 0, 0] },
      { geometry: new CylinderGeometry(0.1, 0.14, 0.45, 5), at: [-0.3, 0.2, 0.1] },
      { geometry: new CylinderGeometry(0.1, 0.14, 0.45, 5), at: [0.3, 0.2, 0.1] },
      { geometry: new CylinderGeometry(0.1, 0.14, 0.45, 5), at: [0, 0.2, 0.35] },
    ];
    case "guardian": return [
      { geometry: box(0.95, 0.9, 0.6), at: [0, 1.05, 0.05] },
      { geometry: box(0.5, 0.42, 0.45), at: [0, 1.72, 0.08] },
      { geometry: box(0.3, 0.62, 0.3), at: [-0.26, 0.31, 0.05] },
      { geometry: box(0.3, 0.62, 0.3), at: [0.26, 0.31, 0.05] },
      { geometry: box(0.24, 0.8, 0.24), at: [0.66, 1.0, 0.05], rotate: [0, 0, 0.12] },
      // The shield it carries in front.
      { geometry: box(1.35, 1.5, 0.12), at: [-0.1, 1.0, -0.62] },
      { geometry: box(0.2, 0.2, 0.12), at: [-0.1, 1.0, -0.72], rotate: [0, 0, Math.PI / 4] },
    ];
    case "wisp": return [
      { geometry: new OctahedronGeometry(0.26), at: [0, 0.32, 0], scale: [1, 1.3, 1] },
      { geometry: box(0.7, 0.03, 0.26), at: [-0.42, 0.38, 0.05], rotate: [0, 0.3, 0.35] },
      { geometry: box(0.7, 0.03, 0.26), at: [0.42, 0.38, 0.05], rotate: [0, -0.3, -0.35] },
      { geometry: new ConeGeometry(0.07, 0.6, 4), at: [0, 0.02, 0.28], rotate: [2.4, 0, 0] },
      { geometry: new ConeGeometry(0.05, 0.5, 4), at: [0.12, 0.05, 0.22], rotate: [2.6, 0, 0.3] },
    ];
    case "colossus": return [
      { geometry: new CylinderGeometry(0.5, 0.65, 2.2, 7), at: [-0.8, 1.1, 0.2] },
      { geometry: new CylinderGeometry(0.5, 0.65, 2.2, 7), at: [0.8, 1.1, 0.2] },
      { geometry: box(3.0, 2.4, 2.0), at: [0, 3.3, 0.1] },
      { geometry: box(1.5, 1.2, 1.3), at: [0, 5.1, 0.1] },
      { geometry: box(0.7, 2.6, 0.7), at: [-1.95, 3.1, 0], rotate: [0, 0, 0.1] },
      { geometry: box(0.7, 2.6, 0.7), at: [1.95, 3.1, 0], rotate: [0, 0, -0.1] },
      { geometry: box(0.95, 0.8, 0.95), at: [-2.05, 1.5, -0.1] },
      { geometry: box(0.95, 0.8, 0.95), at: [2.05, 1.5, -0.1] },
      { geometry: box(3.4, 0.4, 2.3), at: [0, 4.55, 0.1] },
    ];
    case "mire": return [
      { geometry: ball(0.55), at: [0, 0.35, 0], scale: [1.15, 0.7, 1.15] },
      { geometry: ball(0.32), at: [0, 0.72, 0], scale: [1, 0.85, 1] },
      { geometry: new ConeGeometry(0.18, 0.45, 6), at: [0, 1.05, 0] },
      { geometry: ball(0.12), at: [-0.38, 0.22, 0.2] },
      { geometry: ball(0.12), at: [0.4, 0.2, -0.15] },
      { geometry: ball(0.1), at: [-0.15, 0.18, -0.4] },
    ];
    case "tender": return [
      { geometry: new CylinderGeometry(0.12, 0.22, 0.9, 6), at: [0, 0.55, 0] },
      { geometry: ball(0.28), at: [0, 1.15, 0], scale: [1, 1.15, 1] },
      { geometry: new ConeGeometry(0.08, 0.55, 5), at: [-0.35, 1.35, 0], rotate: [0, 0, 0.7] },
      { geometry: new ConeGeometry(0.08, 0.55, 5), at: [0.35, 1.35, 0], rotate: [0, 0, -0.7] },
      { geometry: new ConeGeometry(0.07, 0.5, 5), at: [0, 1.45, -0.3], rotate: [0.5, 0, 0] },
      { geometry: box(0.5, 0.04, 0.18), at: [0, 0.85, 0.05], rotate: [0, 0.4, 0] },
    ];
  }
}

/** Gold accents: eyes, the ink sack, the weak gems where the simulation puts them, a wisp's glowing core. */
function accentParts(kind: CreatureVisualKind): Part[] {
  const gemZ = (radius: number): number => -radius * 0.6;
  switch (kind) {
    case "beetle": return [{ geometry: ball(0.05, 0), at: [-0.1, 0.46, -0.78] }, { geometry: ball(0.05, 0), at: [0.1, 0.46, -0.78] }];
    case "spitter": return [{ geometry: ball(0.3), at: [0, 1.05, 0.38] }, { geometry: ball(0.07, 0), at: [-0.2, 1.25, -0.42] }, { geometry: ball(0.07, 0), at: [0.2, 1.25, -0.42] }];
    case "guardian": return [{ geometry: new OctahedronGeometry(CREATURE_TUNING.guardian.gemRadiusM), at: [0, CREATURE_TUNING.guardian.gemHeightM, gemZ(CREATURE_TUNING.guardian.radius)] }];
    case "wisp": return [{ geometry: ball(0.12), at: [0, 0.32, -0.02] }];
    case "colossus": return [
      { geometry: new OctahedronGeometry(CREATURE_TUNING.colossus.gemRadiusM), at: [0, CREATURE_TUNING.colossus.gemHeightM, gemZ(CREATURE_TUNING.colossus.radius)] },
      { geometry: new SphereGeometry(0.16, 6, 4), at: [-0.4, 5.3, -0.56] },
      { geometry: new SphereGeometry(0.16, 6, 4), at: [0.4, 5.3, -0.56] },
    ];
    case "mire": return [
      { geometry: ball(0.08), at: [-0.14, 0.8, -0.2] },
      { geometry: ball(0.08), at: [0.14, 0.8, -0.2] },
      { geometry: ball(0.14), at: [0, 0.4, 0.15] },
    ];
    case "tender": return [
      { geometry: ball(0.1), at: [0, 1.2, -0.18] },
      { geometry: new OctahedronGeometry(0.12), at: [0, 1.55, 0] },
    ];
  }
}

const BODY_MATERIAL: Record<CreatureVisualKind, number> = {
  beetle: MATERIAL_ID.hazard, spitter: MATERIAL_ID.water, guardian: MATERIAL_ID.carvedStone, wisp: MATERIAL_ID.canopy, colossus: MATERIAL_ID.stone,
  mire: MATERIAL_ID.hazard, tender: MATERIAL_ID.canopy,
};

export type CreaturePose = { kind: string; x: number; y: number; z: number; yaw: number; action: string; actionMs: number };

const matrix = new Matrix4();
const rotation = new Quaternion();
const euler = new Euler(0, 0, 0, "YXZ");
const scale = new Vector3();
const position = new Vector3();

/**
 * Every creature on the map, drawn as two instanced meshes per kind (body and gold accents), so a full
 * wave of 18 creatures costs at most ten draw calls. Poses are set every frame and animated here.
 */
export class CreatureRenderer {
  private readonly bodies = new Map<CreatureVisualKind, InstancedMesh>();
  private readonly accents = new Map<CreatureVisualKind, InstancedMesh>();
  private readonly herbs: InstancedMesh;
  private readonly counts = new Map<CreatureVisualKind, number>();
  private herbCount = 0;

  constructor(parent: Object3D) {
    for (const kind of CREATURE_KINDS) {
      const capacity = kind === "colossus" ? L.bossCapacity : L.capacity;
      const body = new InstancedMesh(bake(bodyParts(kind)), new InkMaterial(BODY_MATERIAL[kind]), capacity);
      const accent = new InstancedMesh(bake(accentParts(kind)), new InkMaterial(MATERIAL_ID.gold), capacity);
      for (const mesh of [body, accent]) { mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; parent.add(mesh); }
      this.bodies.set(kind, body); this.accents.set(kind, accent);
    }
    const herb = bake([
      { geometry: new ConeGeometry(0.12, 0.7, 4), at: [0, 0.35, 0] },
      { geometry: box(0.5, 0.03, 0.16), at: [0.2, 0.3, 0], rotate: [0, 0, 0.5] },
      { geometry: box(0.5, 0.03, 0.16), at: [-0.2, 0.42, 0], rotate: [0, 0, -0.5] },
      { geometry: box(0.16, 0.03, 0.5), at: [0, 0.22, 0.2], rotate: [-0.5, 0, 0] },
      { geometry: ball(0.09, 0), at: [0, 0.75, 0] },
    ]);
    this.herbs = new InstancedMesh(herb, new InkMaterial(MATERIAL_ID.fern), L.herbCapacity);
    this.herbs.instanceMatrix.setUsage(DynamicDrawUsage); this.herbs.frustumCulled = false; this.herbs.count = 0;
    parent.add(this.herbs);
  }

  /** Call once per frame before adding poses. */
  begin(): void {
    for (const kind of CREATURE_KINDS) this.counts.set(kind, 0);
    this.herbCount = 0;
  }

  /** phase keeps creatures of one kind out of step with each other. */
  add(pose: CreaturePose, phase: number, timeMs: number): void {
    const kind = (pose.kind in CREATURE_TUNING ? pose.kind : "beetle") as CreatureVisualKind;
    const body = this.bodies.get(kind)!, accent = this.accents.get(kind)!;
    const index = this.counts.get(kind)!;
    if (index >= body.instanceMatrix.count) return;
    this.counts.set(kind, index + 1);
    const seconds = timeMs / 1000 + phase;
    let lift = 0, pitch = 0, roll = 0, squash = 1;
    if (kind === "wisp") {
      lift = Math.sin(seconds * L.wispBobHz * Math.PI * 2) * L.wispBobM;
      roll = Math.sin(seconds * L.wispBobHz * 3.1) * L.wispRoll;
      if (pose.action === "dive") pitch = -L.wispDivePitch;
    } else {
      const stride = Math.sin(seconds * L.walkHz[kind] * Math.PI * 2);
      lift = Math.abs(stride) * L.walkBobM[kind];
      roll = stride * L.walkRoll;
      if (pose.action === "windup") {
        // The Colossus crouches and rears back before a stomp.
        const t = Math.min(1, 1 - pose.actionMs / CREATURE_TUNING.colossus.stompWindupMs);
        squash = 1 - L.windupSquash * t; pitch = L.windupPitch * t;
      }
    }
    euler.set(pitch, pose.yaw, roll);
    rotation.setFromEuler(euler);
    const width = 1 + (1 - squash) * 0.5;
    matrix.compose(position.set(pose.x, pose.y + lift, pose.z), rotation, scale.set(width, squash, width));
    body.setMatrixAt(index, matrix); accent.setMatrixAt(index, matrix);
  }

  addHerb(x: number, y: number, z: number, timeMs: number): void {
    if (this.herbCount >= this.herbs.instanceMatrix.count) return;
    const bob = Math.sin(timeMs / 1000 * L.herbBobHz * Math.PI * 2 + x) * L.herbBobM;
    rotation.setFromEuler(euler.set(0, timeMs / 1000 * L.herbSpinPerS, 0));
    this.herbs.setMatrixAt(this.herbCount, matrix.compose(position.set(x, y + bob + L.herbLiftM, z), rotation, scale.set(1, 1, 1)));
    this.herbCount += 1;
  }

  end(): void {
    for (const kind of CREATURE_KINDS) {
      const count = this.counts.get(kind)!;
      for (const mesh of [this.bodies.get(kind)!, this.accents.get(kind)!]) {
        mesh.visible = count > 0;
        if (mesh.count === 0 && count === 0) continue;
        mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this.herbs.count = this.herbCount; this.herbs.visible = this.herbCount > 0; this.herbs.instanceMatrix.needsUpdate = true;
  }

  /** Test hook: how many creatures of each kind were drawn last frame. */
  drawn(): Record<string, number> { return Object.fromEntries(CREATURE_KINDS.map((kind) => [kind, this.counts.get(kind) ?? 0])); }
  herbsDrawn(): number { return this.herbCount; }
}
