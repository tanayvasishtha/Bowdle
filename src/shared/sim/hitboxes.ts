import { BODY_RADIUS, EYE_CROUCH, EYE_STAND, HEAD_RADIUS } from "../constants.ts";
import type { Vec3 } from "../math/vec3.ts";

export type HitboxTarget = { x: number; y: number; z: number; height: number; crouched: boolean };
export type HitKind = "head" | "body";
export type TargetHit = { kind: HitKind; t: number };

function segmentSphere(from: Readonly<Vec3>, to: Readonly<Vec3>, cx: number, cy: number, cz: number, radius: number): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const ox = from.x - cx;
  const oy = from.y - cy;
  const oz = from.z - cz;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0 || a === 0) return null;
  const root = Math.sqrt(discriminant);
  const near = (-b - root) / (2 * a);
  const far = (-b + root) / (2 * a);
  if (near >= 0 && near <= 1) return near;
  if (far >= 0 && far <= 1) return far;
  return null;
}

function segmentVerticalCapsule(from: Readonly<Vec3>, to: Readonly<Vec3>, target: HitboxTarget, radius: number): number | null {
  const bottom = target.y + 0.05;
  const top = target.y + target.height - 0.3;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const ox = from.x - target.x;
  const oz = from.z - target.z;
  const a = dx * dx + dz * dz;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - radius * radius;
  let best: number | null = null;
  const discriminant = b * b - 4 * a * c;
  if (a > 0 && discriminant >= 0) {
    const root = Math.sqrt(discriminant);
    for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
      const y = from.y + (to.y - from.y) * t;
      if (t >= 0 && t <= 1 && y >= bottom && y <= top && (best === null || t < best)) best = t;
    }
  }
  const lower = segmentSphere(from, to, target.x, bottom, target.z, radius);
  const upper = segmentSphere(from, to, target.x, top, target.z, radius);
  if (lower !== null && (best === null || lower < best)) best = lower;
  if (upper !== null && (best === null || upper < best)) best = upper;
  return best;
}

export function headCenterY(target: HitboxTarget): number {
  return target.y + (target.crouched ? EYE_CROUCH : EYE_STAND) + 0.05;
}

export function sweepTargetHit(from: Readonly<Vec3>, to: Readonly<Vec3>, target: HitboxTarget, padding: number): TargetHit | null {
  const head = segmentSphere(from, to, target.x, headCenterY(target), target.z, HEAD_RADIUS + padding);
  const body = segmentVerticalCapsule(from, to, target, BODY_RADIUS + padding);
  if (head !== null && (body === null || head <= body + 1e-9)) return { kind: "head", t: head };
  if (body !== null) return { kind: "body", t: body };
  return null;
}
