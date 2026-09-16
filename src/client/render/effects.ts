import {
  BoxGeometry, BufferAttribute, BufferGeometry, ConeGeometry, DoubleSide, DynamicDrawUsage, InstancedMesh, Matrix4, Mesh, OctahedronGeometry,
  PlaneGeometry, Quaternion, TetrahedronGeometry, Vector3, type Object3D,
} from "three";
import { arrowTrail, killEffect, type ArrowTrail, type BurstShape, type KillEffect } from "../../shared/cosmetics.ts";
import { mulberry32 } from "../../shared/math/rng.ts";
import { InkMaterial } from "./InkMaterial.ts";
import { MATERIAL_ID } from "./palette.ts";

export const TRAIL_POINTS = 12;
const TRAIL_SPACING_M = 0.45;
const TRAIL_WIDTH_M = 0.08;
const ZIGZAG_M = 0.08;
const VERTS_PER_SEGMENT = 12;

const BURST_PARTICLES = 14;
const BURST_MS = 900;
const BURST_SPEED = 3.2;
const BURST_GRAVITY = 6;

const materials = new Map<number, InkMaterial>();
function materialFor(id: number): InkMaterial {
  let material = materials.get(id);
  // Ribbons and wings are single quads, so both faces must draw.
  if (!material) { material = new InkMaterial(id); material.side = DoubleSide; materials.set(id, material); }
  return material;
}

const side = new Vector3();
const lift = new Vector3();
const segment = new Vector3();
const worldUp = new Vector3(0, 1, 0);

/**
 * A ribbon that follows one arrow: two crossed strips so it reads from any angle, one draw call.
 * Points are world space; the mesh lives in the world scene, not under the arrow.
 */
export class ArrowTrailMesh {
  readonly mesh: Mesh;
  readonly style: ArrowTrail;
  private readonly points: Vector3[] = [];
  private readonly head = new Vector3();
  private hasHead = false;
  private readonly positions: Float32Array;
  private readonly geometry = new BufferGeometry();

  constructor(trailId: string) {
    this.style = arrowTrail(trailId);
    this.positions = new Float32Array(TRAIL_POINTS * VERTS_PER_SEGMENT * 3);
    const normals = new Float32Array(this.positions.length);
    for (let index = 1; index < normals.length; index += 3) normals[index] = 1;
    this.geometry.setAttribute("position", new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute("normal", new BufferAttribute(normals, 3));
    this.mesh = new Mesh(this.geometry, materialFor(MATERIAL_ID[this.style.paint]));
    this.mesh.frustumCulled = false;
    this.mesh.visible = this.style.style !== "none";
  }

  get enabled(): boolean { return this.style.style !== "none"; }
  get pointCount(): number { return this.points.length; }

  /** Follows the arrow head. A trail point drops every TRAIL_SPACING_M; a stopped arrow shrinks its trail away one point per call. */
  push(x: number, y: number, z: number): void {
    if (!this.enabled) return;
    const stopped = this.hasHead && Math.hypot(this.head.x - x, this.head.y - y, this.head.z - z) < 1e-3;
    this.head.set(x, y, z); this.hasHead = true;
    const last = this.points[this.points.length - 1];
    if (stopped) { if (this.points.length > 1) this.points.shift(); }
    else if (!last || Math.hypot(last.x - x, last.y - y, last.z - z) >= TRAIL_SPACING_M) {
      this.points.push(this.points.length >= TRAIL_POINTS ? this.points.shift()!.set(x, y, z) : new Vector3(x, y, z));
    }
    this.rebuild();
  }

  private rebuild(): void {
    this.positions.fill(0);
    // The newest segment runs from the last dropped point to the live head.
    const count = this.points.length;
    let write = 0;
    for (let index = 0; index < count; index += 1) {
      if (!this.drawSegment(count - 1 - index)) { write += VERTS_PER_SEGMENT * 3; continue; }
      const a = this.points[index]!, b = index + 1 < count ? this.points[index + 1]! : this.head;
      segment.subVectors(b, a);
      if (segment.lengthSq() < 1e-6) { write += VERTS_PER_SEGMENT * 3; continue; }
      segment.normalize();
      side.crossVectors(segment, worldUp);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      lift.crossVectors(side, segment).normalize();
      const widthA = TRAIL_WIDTH_M * ((index + 1) / (count + 1)), widthB = TRAIL_WIDTH_M * ((index + 2) / (count + 1));
      const wiggleA = this.style.style === "zigzag" ? (index % 2 === 0 ? ZIGZAG_M : -ZIGZAG_M) : 0;
      const wiggleB = this.style.style === "zigzag" ? -wiggleA : 0;
      for (const axis of [side, lift]) {
        write = quad(this.positions, write, a, b, axis, widthA, widthB, wiggleA, wiggleB);
      }
    }
    (this.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
  }

  private drawSegment(index: number): boolean {
    switch (this.style.style) {
      case "dots": return index % 2 === 0;
      case "dashes": return index % 3 !== 2;
      default: return true;
    }
  }

  dispose(): void { this.geometry.dispose(); }
}

function quad(out: Float32Array, start: number, a: Vector3, b: Vector3, axis: Vector3, widthA: number, widthB: number, wiggleA: number, wiggleB: number): number {
  const corners = [
    [a, -widthA + wiggleA], [a, widthA + wiggleA], [b, widthB + wiggleB],
    [a, -widthA + wiggleA], [b, widthB + wiggleB], [b, -widthB + wiggleB],
  ] as const;
  let write = start;
  for (const [point, offset] of corners) {
    out[write++] = point.x + axis.x * offset;
    out[write++] = point.y + axis.y * offset;
    out[write++] = point.z + axis.z * offset;
  }
  return write;
}

function shapeGeometry(shape: BurstShape): BufferGeometry {
  switch (shape) {
    case "leaf": return new ConeGeometry(0.07, 0.2, 4).scale(1, 1, 0.3);
    case "feather": return new ConeGeometry(0.04, 0.26, 5).scale(1, 1, 0.25);
    case "star": return new OctahedronGeometry(0.09).scale(1, 1, 0.35);
    case "spark": return new TetrahedronGeometry(0.06);
    case "wing": return new PlaneGeometry(0.16, 0.12);
    case "cube": return new BoxGeometry(0.1, 0.1, 0.1);
    case "splat": return new OctahedronGeometry(0.08);
  }
}

type Particle = { velocity: Vector3; spin: Vector3; offset: number };

/** One kill effect: a single instanced burst that flies out, falls and shrinks away. */
export class KillBurst {
  readonly mesh: InstancedMesh;
  readonly effect: KillEffect;
  private readonly startMs: number;
  private readonly origin = new Vector3();
  private readonly particles: Particle[] = [];

  constructor(effectId: string, team: number, x: number, y: number, z: number, startMs: number, seed: number) {
    this.effect = killEffect(effectId);
    const paint = this.effect.paint === "team" ? (team === 0 ? MATERIAL_ID.teamSun : MATERIAL_ID.teamMoon) : MATERIAL_ID[this.effect.paint];
    this.mesh = new InstancedMesh(shapeGeometry(this.effect.shape), materialFor(paint), BURST_PARTICLES);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.startMs = startMs;
    this.origin.set(x, y, z);
    const random = mulberry32(seed);
    for (let index = 0; index < BURST_PARTICLES; index += 1) {
      const angle = random() * Math.PI * 2, rise = 0.4 + random() * 0.9, speed = BURST_SPEED * (0.5 + random() * 0.6);
      this.particles.push({
        velocity: new Vector3(Math.cos(angle) * speed, rise * speed, Math.sin(angle) * speed),
        spin: new Vector3(random() * 8 - 4, random() * 8 - 4, random() * 8 - 4),
        offset: random() * Math.PI * 2,
      });
    }
    this.update(startMs);
  }

  /** Returns false once the burst has finished and can be removed. */
  update(nowMs: number): boolean {
    const t = Math.max(0, nowMs - this.startMs) / 1000;
    const life = t * 1000 / BURST_MS;
    if (life >= 1) return false;
    const scale = life < 0.7 ? 1 : 1 - (life - 0.7) / 0.3;
    const flap = this.effect.shape === "wing";
    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index]!;
      position.copy(this.origin).addScaledVector(particle.velocity, t);
      position.y -= 0.5 * BURST_GRAVITY * (flap ? 0.2 : 1) * t * t;
      rotation.setFromAxisAngle(axisFor(particle.spin), particle.spin.length() * t + particle.offset);
      scaleVector.setScalar(Math.max(0.001, scale));
      if (flap) scaleVector.x *= 0.4 + 0.6 * Math.abs(Math.sin(t * 18 + particle.offset));
      matrix.compose(position, rotation, scaleVector);
      this.mesh.setMatrixAt(index, matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return true;
  }

  dispose(parent: Object3D): void { parent.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.dispose(); }
}

const position = new Vector3();
const rotation = new Quaternion();
const scaleVector = new Vector3();
const matrix = new Matrix4();
const spinAxis = new Vector3();
function axisFor(spin: Vector3): Vector3 { return spinAxis.copy(spin).normalize(); }
