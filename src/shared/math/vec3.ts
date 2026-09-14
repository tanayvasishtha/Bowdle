export type Vec3 = { x: number; y: number; z: number };

export function setVec3(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function copyVec3(out: Vec3, value: Readonly<Vec3>): Vec3 {
  return setVec3(out, value.x, value.y, value.z);
}

export function addScaledVec3(out: Vec3, value: Readonly<Vec3>, scale: number): Vec3 {
  out.x += value.x * scale;
  out.y += value.y * scale;
  out.z += value.z * scale;
  return out;
}

export function lengthXZ(value: Readonly<Vec3>): number {
  return Math.hypot(value.x, value.z);
}

export function normalizeXZ(out: Vec3): Vec3 {
  const length = lengthXZ(out);
  if (length > 0) {
    out.x /= length;
    out.z /= length;
  }
  return out;
}

export function dotXZ(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return a.x * b.x + a.z * b.z;
}
