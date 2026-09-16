import {
  Bone, BoxGeometry, BufferAttribute, ConeGeometry, CylinderGeometry, Group, QuadraticBezierCurve3, Quaternion,
  Skeleton, SkinnedMesh, SphereGeometry, TorusGeometry, TubeGeometry, Vector3, type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { InkMaterial } from "../InkMaterial.ts";
import { CHARACTER_LOOK as C } from "../look.ts";
import { MATERIAL_ID } from "../palette.ts";
import { bowSkin, outfit as outfitById, type BowSkin, type Outfit } from "../../../shared/cosmetics.ts";
import { createMotion, createPose, poseInto, type ArmPose, type CharacterMotion, type LegPose, type Pose } from "./pose.ts";

/** Sun and Moon crews share one silhouette and hitbox; only color and gear differ. */
export type CharacterKind = "sun" | "moon" | "dummy";
/** Cosmetic ids from the shared catalog. Unknown ids fall back to the defaults. */
export type CharacterLook = { bow?: string; outfit?: string };

const BONE_NAMES = [
  "hips", "spine", "head",
  "leftShoulder", "leftElbow", "leftHand", "bowGrip", "nock",
  "rightShoulder", "rightElbow", "rightHand", "dagger",
  "leftHip", "leftKnee", "rightHip", "rightKnee",
] as const;
type BoneName = (typeof BONE_NAMES)[number];
type Bones = Record<BoneName, Bone>;

const SLOTS = ["skin", "shirt", "trousers", "leather", "rope", "trim", "hat", "bow"] as const;
type Slot = (typeof SLOTS)[number];
type MaterialKey = keyof typeof MATERIAL_ID;

const SLOT_MATERIALS: Record<CharacterKind, Record<Slot, MaterialKey>> = {
  sun: { skin: "canvas", shirt: "teamSun", trousers: "earth", leather: "wood", rope: "rope", trim: "gold", hat: "stone", bow: "wood" },
  moon: { skin: "canvas", shirt: "teamMoon", trousers: "earth", leather: "wood", rope: "rope", trim: "gold", hat: "teamMoon", bow: "wood" },
  dummy: { skin: "rope", shirt: "canvas", trousers: "rope", leather: "wood", rope: "rope", trim: "wood", hat: "canvas", bow: "wood" },
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

function bowParts(skin: BowSkin): Part[] {
  const tipTop = new Vector3(0, 0.02, -C.bowHalfLength);
  const tipBottom = new Vector3(0, 0.02, C.bowHalfLength);
  const nock = new Vector3(0, C.nockRest, 0);
  const curve = new QuadraticBezierCurve3(tipTop, new Vector3(0, -C.bowBelly, 0), tipBottom);
  const limbs = new TubeGeometry(curve, 14, 0.018, 5, false);
  limbs.deleteAttribute("uv");
  return [
    { geometry: limbs, slot: "bow", bone: "bowGrip" },
    ...bowOrnament(skin, tipTop, tipBottom),
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

function gearParts(kind: CharacterKind, look: Outfit): Part[] {
  const r = C.headRadius;
  if (kind !== "dummy" && look.headgear !== "crew") return [...headgearParts(look), ...accessoryParts(look)];
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

/** Cosmetic headgear. Everything sits on the head bone and stays inside the head hitbox silhouette plus a brim. */
function headgearParts(look: Outfit): Part[] {
  const r = C.headRadius;
  const top = r + 0.02;
  switch (look.headgear) {
    case "brim": return [
      { geometry: dome(0.2, 0, top + 0.02, 0, 0.95), slot: "hat", bone: "head" },
      { geometry: cylinder(0.36, 0.36, 0.02, 0, top + 0.03, 0), slot: "hat", bone: "head" },
      { geometry: cylinder(0.205, 0.205, 0.04, 0, top + 0.06, 0), slot: "trim", bone: "head" },
    ];
    case "goggles": return [
      { geometry: dome(0.2, 0, top, 0, 0.7), slot: "hat", bone: "head" },
      { geometry: box(0.1, 0.02, 0.1, 0, top + 0.01, -0.2), slot: "hat", bone: "head" },
      { geometry: ring(0.045, 0.014, -0.065, r + 0.08, -r + 0.01), slot: "trim", bone: "head" },
      { geometry: ring(0.045, 0.014, 0.065, r + 0.08, -r + 0.01), slot: "trim", bone: "head" },
    ];
    case "bandana": return [
      { geometry: dome(0.205, 0, top - 0.01, 0, 0.8), slot: "hat", bone: "head" },
      { geometry: cone(0.04, 0.12, -0.04, r + 0.05, r + 0.04, Math.PI / 2 + 0.4), slot: "hat", bone: "head" },
      { geometry: cone(0.04, 0.12, 0.04, r + 0.02, r + 0.05, Math.PI / 2 + 0.9), slot: "hat", bone: "head" },
    ];
    case "headdress": return [
      { geometry: cylinder(0.205, 0.205, 0.06, 0, top + 0.04, 0), slot: "trim", bone: "head" },
      ...[-0.5, -0.25, 0, 0.25, 0.5].map((angle): Part => ({
        geometry: cone(0.035, 0.26, Math.sin(angle) * 0.16, top + 0.18 - Math.abs(angle) * 0.05, 0.05, 0, -angle * 0.9),
        slot: "hat", bone: "head",
      })),
    ];
    case "aviator": return [
      { geometry: dome(0.215, 0, top - 0.02, 0, 1.05), slot: "hat", bone: "head" },
      { geometry: box(0.03, 0.12, 0.08, -0.2, r - 0.02, 0), slot: "hat", bone: "head" },
      { geometry: box(0.03, 0.12, 0.08, 0.2, r - 0.02, 0), slot: "hat", bone: "head" },
      { geometry: ring(0.04, 0.013, -0.06, top + 0.17, -0.1, Math.PI / 2.6), slot: "trim", bone: "head" },
      { geometry: ring(0.04, 0.013, 0.06, top + 0.17, -0.1, Math.PI / 2.6), slot: "trim", bone: "head" },
    ];
    case "crown": return [
      { geometry: cylinder(0.2, 0.19, 0.1, 0, top + 0.08, 0), slot: "hat", bone: "head" },
      ...[0, 1, 2, 3, 4, 5].map((index): Part => {
        const angle = (index / 6) * Math.PI * 2;
        return { geometry: cone(0.035, 0.1, Math.sin(angle) * 0.18, top + 0.18, Math.cos(angle) * 0.18), slot: "trim", bone: "head" };
      }),
    ];
    case "crew": return [];
  }
}

function accessoryParts(look: Outfit): Part[] {
  const r = C.headRadius;
  switch (look.accessory) {
    case "feather": return [{ geometry: cone(0.03, 0.3, 0.2, r + 0.22, 0.04, 0, -0.5), slot: "trim", bone: "head" }];
    case "satchel": return [
      { geometry: box(0.035, 0.62, 0.02, 0, 0.22, -0.12, 0, 0, 0.7), slot: "leather", bone: "spine" },
      { geometry: box(0.2, 0.16, 0.08, -0.2, 0.0, 0.02), slot: "leather", bone: "spine" },
      { geometry: box(0.21, 0.07, 0.085, -0.2, 0.06, 0.02), slot: "trim", bone: "spine" },
    ];
    case "pauldron": return [{ geometry: dome(0.11, 0, 0.0, 0, 0.8), slot: "trim", bone: "rightShoulder" }];
    case "beads": return [
      { geometry: ring(0.1, 0.02, 0, 0.42, -0.02, Math.PI / 2.3), slot: "trim", bone: "spine" },
      { geometry: ball(0.04, 0, 0.33, -0.12), slot: "trim", bone: "spine" },
    ];
    case "scarf": return [
      { geometry: ring(0.085, 0.035, 0, 0.43, 0, Math.PI / 2), slot: "trim", bone: "spine" },
      { geometry: box(0.08, 0.34, 0.03, -0.06, 0.27, 0.15, 0.3, 0, -0.2), slot: "trim", bone: "spine" },
    ];
    case "mask": return [{ geometry: box(0.24, 0.16, 0.03, 0, r + 0.02, -r - 0.02), slot: "trim", bone: "head" }];
    case "crew": return [];
  }
}

/** Ornaments sit on the bow tips or under the grip and share the bow slot, so a skin never adds a draw call. */
function bowOrnament(skin: BowSkin, tipTop: Vector3, tipBottom: Vector3): Part[] {
  const tips = [tipTop, tipBottom];
  const atTips = (make: (tip: Vector3, sign: number) => BufferGeometry): Part[] =>
    tips.map((tip, index) => ({ geometry: make(tip, index === 0 ? -1 : 1), slot: "bow" as const, bone: "bowGrip" as const }));
  switch (skin.ornament) {
    case "leaves": return atTips((tip, sign) => place(new ConeGeometry(0.05, 0.14, 5), tip.x, tip.y, tip.z + sign * 0.04, sign * Math.PI / 2, 0, 0, 1, 1, 0.35));
    case "prongs": return [
      ...atTips((tip, sign) => cone(0.018, 0.14, 0.04, tip.y + 0.02, tip.z, sign * 0.4, -0.6)),
      ...atTips((tip, sign) => cone(0.018, 0.14, -0.04, tip.y + 0.02, tip.z, sign * 0.4, 0.6)),
    ];
    case "sunDisc": return [{ geometry: cylinder(0.08, 0.08, 0.02, 0, -C.bowBelly - 0.06, 0, 0, 0, Math.PI / 2), slot: "bow", bone: "bowGrip" }];
    case "fins": return atTips((tip, sign) => box(0.012, 0.1, 0.12, tip.x, tip.y - 0.03, tip.z - sign * 0.04));
    case "crystals": return [
      ...atTips((tip, sign) => cone(0.035, 0.08, tip.x, tip.y, tip.z + sign * 0.05, sign * Math.PI / 2)),
      ...atTips((tip, sign) => cone(0.035, 0.08, tip.x, tip.y, tip.z + sign * 0.13, -sign * Math.PI / 2)),
    ];
    case "none": return [];
  }
}

type Built = { geometry: BufferGeometry; paints: MaterialKey[] };
const builtByKey = new Map<string, Built>();
const inkByPaint = new Map<MaterialKey, InkMaterial>();

function lookKey(kind: CharacterKind, skin: BowSkin, look: Outfit): string { return kind === "dummy" ? kind : `${kind}|${skin.id}|${look.id}`; }

export function characterLookKey(kind: CharacterKind, look: CharacterLook): string { return lookKey(kind, bowSkin(look.bow ?? ""), outfitById(look.outfit ?? "")); }

function buildGeometry(kind: CharacterKind, skin: BowSkin, look: Outfit): Built {
  const key = lookKey(kind, skin, look);
  const cached = builtByKey.get(key);
  if (cached) return cached;
  const bones = buildBones();
  bones.hips.updateMatrixWorld(true);
  const boneIndex = new Map<BoneName, number>(BONE_NAMES.map((name, index) => [name, index]));
  const parts = [...bodyParts(), ...limbParts("left"), ...limbParts("right"), ...gearParts(kind, look), ...(kind === "dummy" ? [] : bowParts(skin))];
  // Parts are grouped by the paint they resolve to, not by slot, so slots that share a paint share a draw call.
  const byPaint = new Map<MaterialKey, BufferGeometry[]>();
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
    const paint = slotMaterial(kind, part.slot, skin, look);
    const list = byPaint.get(paint) ?? [];
    list.push(part.geometry);
    byPaint.set(paint, list);
  }
  const paints = [...byPaint.keys()];
  const perPaint = paints.map((paint) => {
    const merged = mergeGeometries(byPaint.get(paint)!, false);
    if (!merged) throw new Error(`Character geometry attributes differ for paint ${paint}`);
    return merged;
  });
  const geometry = mergeGeometries(perPaint, true);
  if (!geometry) throw new Error("Character paint geometries differ");
  const built = { geometry, paints };
  builtByKey.set(key, built);
  return built;
}

function slotMaterial(kind: CharacterKind, slot: Slot, skin: BowSkin, look: Outfit): MaterialKey {
  if (kind === "dummy") return SLOT_MATERIALS.dummy[slot];
  if (slot === "bow") return skin.paint;
  if (slot === "hat" && look.hat !== "crew") return look.hat;
  if (slot === "trim" && look.trim !== "crew") return look.trim;
  return SLOT_MATERIALS[kind][slot];
}

function materialsFor(paints: readonly MaterialKey[]): InkMaterial[] {
  return paints.map((paint) => {
    let material = inkByPaint.get(paint);
    if (!material) { material = new InkMaterial(MATERIAL_ID[paint]); inkByPaint.set(paint, material); }
    return material;
  });
}

const HIDDEN_SCALE = 0.001;
const headLocal = new Vector3();

export class CharacterRig extends Group {
  readonly kind: CharacterKind;
  /** Changes when the bow skin or outfit changes; the renderer rebuilds the rig then. */
  readonly lookKey: string;
  readonly motion: CharacterMotion = createMotion();
  readonly pose: Pose = createPose();
  private readonly bones: Bones;
  private readonly mesh: SkinnedMesh;
  private readonly phase: number;

  constructor(kind: CharacterKind, phase = 0, look: CharacterLook = {}) {
    super();
    this.kind = kind;
    this.phase = phase;
    const skin = bowSkin(look.bow ?? ""), gear = outfitById(look.outfit ?? "");
    this.lookKey = lookKey(kind, skin, gear);
    const built = buildGeometry(kind, skin, gear);
    this.bones = buildBones();
    this.mesh = new SkinnedMesh(built.geometry, materialsFor(built.paints));
    this.mesh.add(this.bones.hips);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new Skeleton(BONE_NAMES.map((name) => this.bones[name])));
    this.mesh.frustumCulled = false;
    this.add(this.mesh);
    this.update(0);
  }

  /** Draw calls this character costs: one per distinct paint. */
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
