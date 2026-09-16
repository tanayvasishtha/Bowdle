import {
  Bone, BoxGeometry, BufferAttribute, ConeGeometry, CylinderGeometry, Group, QuadraticBezierCurve3, Quaternion,
  Skeleton, SkinnedMesh, SphereGeometry, TorusGeometry, TubeGeometry, Vector3, type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { InkMaterial } from "../InkMaterial.ts";
import { CHARACTER_LOOK as C } from "../look.ts";
import { MATERIAL_ID } from "../palette.ts";
import { createMotion, createPose, poseInto, type ArmPose, type CharacterMotion, type LegPose, type Pose } from "./pose.ts";

/** Sun and Moon crews share one silhouette and hitbox; only color and gear differ. */
export type CharacterKind = "sun" | "moon" | "dummy";

const BONE_NAMES = [
  "hips", "spine", "head",
  "leftShoulder", "leftElbow", "leftHand", "bowGrip", "nock",
  "rightShoulder", "rightElbow", "rightHand", "dagger",
  "leftHip", "leftKnee", "rightHip", "rightKnee",
] as const;
type BoneName = (typeof BONE_NAMES)[number];
type Bones = Record<BoneName, Bone>;

const SLOTS = ["skin", "shirt", "trousers", "leather", "rope", "trim", "hat"] as const;
type Slot = (typeof SLOTS)[number];
type MaterialKey = keyof typeof MATERIAL_ID;

const SLOT_MATERIALS: Record<CharacterKind, Record<Slot, MaterialKey>> = {
  sun: { skin: "canvas", shirt: "teamSun", trousers: "earth", leather: "wood", rope: "rope", trim: "gold", hat: "stone" },
  moon: { skin: "canvas", shirt: "teamMoon", trousers: "earth", leather: "wood", rope: "rope", trim: "gold", hat: "teamMoon" },
  dummy: { skin: "rope", shirt: "canvas", trousers: "rope", leather: "wood", rope: "rope", trim: "wood", hat: "canvas" },
};

type Part = { geometry: BufferGeometry; slot: Slot; bone: BoneName; nearBone?: { name: BoneName; point: Vector3; other: Vector3 } };

function buildBones(): Bones {
  const make = (x: number, y: number, z: number, parent?: Bone): Bone => {
    const bone = new Bone();
    bone.position.set(x, y, z);
    parent?.add(bone);
    return bone;
  };
  const hips = make(0, C.hipHeight, 0);
  const spine = make(0, C.pelvisHeight, 0, hips);
  const head = make(0, C.torsoLength, 0, spine);
  const leftShoulder = make(-C.shoulderWidth, C.torsoLength - C.shoulderDrop, 0, spine);
  const leftElbow = make(0, -C.upperArm, 0, leftShoulder);
  const leftHand = make(0, -C.forearm, 0, leftElbow);
  const bowGrip = make(0, -0.04, 0, leftHand);
  const nock = make(0, C.nockRest, 0, bowGrip);
  const rightShoulder = make(C.shoulderWidth, C.torsoLength - C.shoulderDrop, 0, spine);
  const rightElbow = make(0, -C.upperArm, 0, rightShoulder);
  const rightHand = make(0, -C.forearm, 0, rightElbow);
  const dagger = make(0, -0.04, 0, rightHand);
  const leftHip = make(-C.hipWidth, -C.hipDrop, 0, hips);
  const leftKnee = make(0, -C.thigh, 0, leftHip);
  const rightHip = make(C.hipWidth, -C.hipDrop, 0, hips);
  const rightKnee = make(0, -C.thigh, 0, rightHip);
  // Yaw after pitch, so an arm raised forward can still turn to aim.
  for (const bone of [leftShoulder, rightShoulder, leftHip, rightHip]) bone.rotation.order = "YXZ";
  // The head turns back against the torso twist so an archer keeps looking at the target.
  head.rotation.order = "YXZ";
  const bones: Bones = { hips, spine, head, leftShoulder, leftElbow, leftHand, bowGrip, nock, rightShoulder, rightElbow, rightHand, dagger, leftHip, leftKnee, rightHip, rightKnee };
  for (const name of BONE_NAMES) bones[name].name = name;
  return bones;
}

function place(geometry: BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): BufferGeometry {
  geometry.deleteAttribute("uv");
  geometry.scale(sx, sy, sz);
  geometry.rotateX(rx);
  geometry.rotateY(ry);
  geometry.rotateZ(rz);
  geometry.translate(x, y, z);
  return geometry;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): BufferGeometry => place(new BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
const cylinder = (top: number, bottom: number, height: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sz = 1): BufferGeometry =>
  place(new CylinderGeometry(top, bottom, height, 8), x, y, z, rx, ry, rz, 1, 1, sz);
const ball = (radius: number, x: number, y: number, z: number, sy = 1): BufferGeometry => place(new SphereGeometry(radius, 10, 7), x, y, z, 0, 0, 0, 1, sy, 1);
const dome = (radius: number, x: number, y: number, z: number, sy = 1): BufferGeometry => place(new SphereGeometry(radius, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), x, y, z, 0, 0, 0, 1, sy, 1);
const cone = (radius: number, height: number, x: number, y: number, z: number, rx = 0, rz = 0): BufferGeometry => place(new ConeGeometry(radius, height, 7), x, y, z, rx, 0, rz);
const ring = (radius: number, tube: number, x: number, y: number, z: number, rx = 0): BufferGeometry => place(new TorusGeometry(radius, tube, 5, 12), x, y, z, rx);

const upAxis = new Vector3(0, 1, 0);
function between(from: Vector3, to: Vector3, radius: number): BufferGeometry {
  const direction = new Vector3().subVectors(to, from);
  const geometry = new CylinderGeometry(radius, radius, direction.length(), 5);
  geometry.deleteAttribute("uv");
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(upAxis, direction.clone().normalize()));
  const middle = new Vector3().addVectors(from, to).multiplyScalar(0.5);
  geometry.translate(middle.x, middle.y, middle.z);
  return geometry;
}

function limbParts(side: "left" | "right"): Part[] {
  const shoulder: BoneName = side === "left" ? "leftShoulder" : "rightShoulder";
  const elbow: BoneName = side === "left" ? "leftElbow" : "rightElbow";
  const hand: BoneName = side === "left" ? "leftHand" : "rightHand";
  const hip: BoneName = side === "left" ? "leftHip" : "rightHip";
  const knee: BoneName = side === "left" ? "leftKnee" : "rightKnee";
  return [
    { geometry: cylinder(0.07, 0.06, C.upperArm, 0, -C.upperArm / 2, 0), slot: "shirt", bone: shoulder },
    { geometry: cylinder(0.058, 0.05, C.forearm, 0, -C.forearm / 2, 0), slot: "shirt", bone: elbow },
    { geometry: ball(0.056, 0, -0.03, 0), slot: "skin", bone: hand },
    { geometry: cylinder(0.092, 0.076, C.thigh, 0, -C.thigh / 2, 0), slot: "trousers", bone: hip },
    { geometry: cylinder(0.074, 0.06, C.shin, 0, -C.shin / 2, 0), slot: "trousers", bone: knee },
    { geometry: box(0.12, 0.12, 0.27, 0, -C.shin + 0.04, -0.06), slot: "leather", bone: knee },
  ];
}

function bowParts(): Part[] {
  const tipTop = new Vector3(0, 0.02, -C.bowHalfLength);
  const tipBottom = new Vector3(0, 0.02, C.bowHalfLength);
  const nock = new Vector3(0, C.nockRest, 0);
  const curve = new QuadraticBezierCurve3(tipTop, new Vector3(0, -C.bowBelly, 0), tipBottom);
  const limbs = new TubeGeometry(curve, 14, 0.018, 5, false);
  limbs.deleteAttribute("uv");
  return [
    { geometry: limbs, slot: "leather", bone: "bowGrip" },
    { geometry: cylinder(0.028, 0.028, 0.16, 0, -C.bowBelly * 0.5, 0, Math.PI / 2), slot: "rope", bone: "bowGrip" },
    { geometry: between(tipTop, nock, 0.006), slot: "rope", bone: "bowGrip", nearBone: { name: "nock", point: nock, other: tipTop } },
    { geometry: between(nock, tipBottom, 0.006), slot: "rope", bone: "bowGrip", nearBone: { name: "nock", point: nock, other: tipBottom } },
    { geometry: cone(0.022, 0.22, 0, -0.17, 0, Math.PI), slot: "trim", bone: "dagger" },
    { geometry: cylinder(0.018, 0.018, 0.09, 0, -0.02, 0), slot: "leather", bone: "dagger" },
    { geometry: box(0.08, 0.015, 0.025, 0, -0.065, 0), slot: "trim", bone: "dagger" },
  ];
}

function bodyParts(): Part[] {
  const r = C.headRadius;
  return [
    { geometry: box(0.34, 0.2, 0.22, 0, 0, 0), slot: "trousers", bone: "hips" },
    { geometry: box(0.36, 0.05, 0.24, 0, 0.09, 0), slot: "leather", bone: "hips" },
    { geometry: box(0.06, 0.05, 0.02, 0, 0.09, -0.125), slot: "trim", bone: "hips" },
    { geometry: cylinder(0.2, 0.17, 0.44, 0, 0.22, 0, 0, 0, 0, 0.65), slot: "shirt", bone: "spine" },
    { geometry: cylinder(0.055, 0.06, 0.1, 0, 0.44, 0), slot: "skin", bone: "spine" },
    { geometry: cylinder(0.07, 0.06, 0.55, 0.1, 0.24, 0.15, 0, 0, 0.35), slot: "leather", bone: "spine" },
    { geometry: box(0.035, 0.62, 0.02, 0, 0.22, -0.12, 0, 0, -0.7), slot: "rope", bone: "spine" },
    { geometry: cone(0.025, 0.08, -0.02, 0.54, 0.14), slot: "rope", bone: "spine" },
    { geometry: cone(0.025, 0.08, 0.03, 0.53, 0.17), slot: "rope", bone: "spine" },
    { geometry: ball(r, 0, r, 0), slot: "skin", bone: "head" },
    { geometry: box(0.04, 0.06, 0.06, 0, r - 0.01, -r), slot: "skin", bone: "head" },
    { geometry: box(0.035, 0.04, 0.02, -0.065, r + 0.04, -r + 0.02), slot: "leather", bone: "head" },
    { geometry: box(0.035, 0.04, 0.02, 0.065, r + 0.04, -r + 0.02), slot: "leather", bone: "head" },
  ];
}

function gearParts(kind: CharacterKind): Part[] {
  const r = C.headRadius;
  if (kind === "sun") {
    return [
      { geometry: dome(0.215, 0, r + 0.05, 0), slot: "hat", bone: "head" },
      { geometry: cylinder(0.31, 0.31, 0.022, 0, r + 0.06, 0), slot: "hat", bone: "head" },
      { geometry: cylinder(0.218, 0.218, 0.045, 0, r + 0.09, 0), slot: "trim", bone: "head" },
      { geometry: box(0.07, 0.62, 0.27, 0, 0.22, 0, 0, 0, 0.75), slot: "trim", bone: "spine" },
      { geometry: cylinder(0.05, 0.05, 0.5, 0, 0.36, 0.17, 0, 0, Math.PI / 2), slot: "leather", bone: "spine" },
      { geometry: cylinder(0.055, 0.055, 0.03, -0.26, 0.36, 0.17, 0, 0, Math.PI / 2), slot: "trim", bone: "spine" },
      { geometry: cylinder(0.055, 0.055, 0.03, 0.26, 0.36, 0.17, 0, 0, Math.PI / 2), slot: "trim", bone: "spine" },
    ];
  }
  if (kind === "moon") {
    return [
      { geometry: dome(0.21, 0, r + 0.03, 0, 1.15), slot: "hat", bone: "head" },
      { geometry: cylinder(0.214, 0.214, 0.07, 0, r + 0.06, 0), slot: "rope", bone: "head" },
      { geometry: ball(0.06, 0, r * 2 + 0.1, 0), slot: "trim", bone: "head" },
      { geometry: ring(0.085, 0.035, 0, 0.43, 0, Math.PI / 2), slot: "hat", bone: "spine" },
      { geometry: box(0.08, 0.32, 0.03, 0.07, 0.28, -0.14, 0, 0, 0.15), slot: "hat", bone: "spine" },
      { geometry: box(0.12, 0.15, 0.12, -0.12, 0.1, 0.17), slot: "trim", bone: "spine" },
      { geometry: cone(0.09, 0.07, -0.12, 0.21, 0.17), slot: "leather", bone: "spine" },
    ];
  }
  return [{ geometry: ring(0.07, 0.02, 0, 0.47, 0, Math.PI / 2), slot: "rope", bone: "spine" }];
}

type Built = { geometry: BufferGeometry; slots: Slot[] };
const builtByKind = new Map<CharacterKind, Built>();
const materialsByKind = new Map<CharacterKind, InkMaterial[]>();

function buildGeometry(kind: CharacterKind): Built {
  const cached = builtByKind.get(kind);
  if (cached) return cached;
  const bones = buildBones();
  bones.hips.updateMatrixWorld(true);
  const boneIndex = new Map<BoneName, number>(BONE_NAMES.map((name, index) => [name, index]));
  const parts = [...bodyParts(), ...limbParts("left"), ...limbParts("right"), ...gearParts(kind), ...(kind === "dummy" ? [] : bowParts())];
  const bySlot = new Map<Slot, BufferGeometry[]>();
  const local = new Vector3();
  for (const part of parts) {
    const positions = part.geometry.getAttribute("position");
    const skinIndex = new Uint16Array(positions.count * 4);
    const skinWeight = new Float32Array(positions.count * 4);
    const main = boneIndex.get(part.bone)!;
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      local.fromBufferAttribute(positions, vertex);
      const near = part.nearBone;
      // A string end sits on the nock bone so the string stretches when the nock is pulled.
      const useNear = near !== undefined && local.distanceTo(near.point) < local.distanceTo(near.other);
      skinIndex[vertex * 4] = useNear ? boneIndex.get(near.name)! : main;
      skinWeight[vertex * 4] = 1;
    }
    part.geometry.setAttribute("skinIndex", new BufferAttribute(skinIndex, 4));
    part.geometry.setAttribute("skinWeight", new BufferAttribute(skinWeight, 4));
    part.geometry.applyMatrix4(bones[part.bone].matrixWorld);
    const list = bySlot.get(part.slot) ?? [];
    list.push(part.geometry);
    bySlot.set(part.slot, list);
  }
  const slots = SLOTS.filter((slot) => bySlot.has(slot));
  const perSlot = slots.map((slot) => {
    const merged = mergeGeometries(bySlot.get(slot)!, false);
    if (!merged) throw new Error(`Character geometry attributes differ in slot ${slot}`);
    return merged;
  });
  const geometry = mergeGeometries(perSlot, true);
  if (!geometry) throw new Error("Character slot geometries differ");
  const built = { geometry, slots };
  builtByKind.set(kind, built);
  return built;
}

function materialsFor(kind: CharacterKind, slots: readonly Slot[]): InkMaterial[] {
  const cached = materialsByKind.get(kind);
  if (cached) return cached;
  const materials = slots.map((slot) => new InkMaterial(MATERIAL_ID[SLOT_MATERIALS[kind][slot]]));
  materialsByKind.set(kind, materials);
  return materials;
}

const HIDDEN_SCALE = 0.001;
const headLocal = new Vector3();

export class CharacterRig extends Group {
  readonly kind: CharacterKind;
  readonly motion: CharacterMotion = createMotion();
  readonly pose: Pose = createPose();
  private readonly bones: Bones;
  private readonly mesh: SkinnedMesh;
  private readonly phase: number;

  constructor(kind: CharacterKind, phase = 0) {
    super();
    this.kind = kind;
    this.phase = phase;
    const built = buildGeometry(kind);
    this.bones = buildBones();
    this.mesh = new SkinnedMesh(built.geometry, materialsFor(kind, built.slots));
    this.mesh.add(this.bones.hips);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new Skeleton(BONE_NAMES.map((name) => this.bones[name])));
    this.mesh.frustumCulled = false;
    this.add(this.mesh);
    this.update(0);
  }

  /** Draw calls this character costs: one per material slot. */
  get drawCalls(): number {
    return this.mesh.geometry.groups.length;
  }

  setMotion(motion: CharacterMotion): void {
    Object.assign(this.motion, motion);
  }

  update(timeSeconds: number): void {
    poseInto(this.pose, this.motion, timeSeconds + this.phase);
    this.applyPose(this.pose);
  }

  applyPose(pose: Pose): void {
    const b = this.bones;
    b.hips.position.set(0, pose.rootY, pose.rootZ);
    b.spine.rotation.set(-pose.lean, pose.spineYaw, pose.spineRoll);
    b.head.rotation.set(pose.headPitch, -pose.spineYaw, 0);
    applyArm(b.leftShoulder, b.leftElbow, pose.leftArm, -1);
    applyArm(b.rightShoulder, b.rightElbow, pose.rightArm, 1);
    applyLeg(b.leftHip, b.leftKnee, pose.leftLeg, -1);
    applyLeg(b.rightHip, b.rightKnee, pose.rightLeg, 1);
    b.bowGrip.rotation.set(pose.gripPitch, 0, 0);
    b.nock.position.set(0, C.nockRest + pose.bowPull * C.nockPull, 0);
    b.dagger.scale.setScalar(pose.dagger > 0 ? 1 : HIDDEN_SCALE);
  }

  /** World position of the drawn head center, for alignment tests. */
  headWorld(target: Vector3): Vector3 {
    this.updateMatrixWorld(true);
    headLocal.set(0, C.headRadius, 0);
    return target.copy(this.bones.head.localToWorld(headLocal));
  }
}

function applyArm(shoulder: Bone, elbow: Bone, arm: ArmPose, side: number): void {
  shoulder.rotation.set(arm.pitch, arm.yaw, side * arm.roll);
  elbow.rotation.set(arm.bend, 0, 0);
}

function applyLeg(hip: Bone, knee: Bone, leg: LegPose, side: number): void {
  hip.rotation.set(leg.pitch, 0, side * leg.roll);
  knee.rotation.set(-leg.bend, 0, 0);
}
