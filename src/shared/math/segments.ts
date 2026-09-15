import type { Vec3 } from "./vec3.ts";

export function segmentDistance(a0: Readonly<Vec3>, a1: Readonly<Vec3>, b0: Readonly<Vec3>, b1: Readonly<Vec3>): number {
  const ux = a1.x - a0.x, uy = a1.y - a0.y, uz = a1.z - a0.z;
  const vx = b1.x - b0.x, vy = b1.y - b0.y, vz = b1.z - b0.z;
  const wx = a0.x - b0.x, wy = a0.y - b0.y, wz = a0.z - b0.z;
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz;
  const determinant = a * c - b * b;
  let sNumerator = determinant, sDenominator = determinant, tNumerator = determinant, tDenominator = determinant;
  if (determinant < Number.EPSILON) { sNumerator = 0; sDenominator = 1; tNumerator = e; tDenominator = c; }
  else {
    sNumerator = b * e - c * d; tNumerator = a * e - b * d;
    if (sNumerator < 0) { sNumerator = 0; tNumerator = e; tDenominator = c; }
    else if (sNumerator > sDenominator) { sNumerator = sDenominator; tNumerator = e + b; tDenominator = c; }
  }
  if (tNumerator < 0) {
    tNumerator = 0;
    if (-d < 0) sNumerator = 0; else if (-d > a) sNumerator = sDenominator; else { sNumerator = -d; sDenominator = a; }
  } else if (tNumerator > tDenominator) {
    tNumerator = tDenominator;
    if (-d + b < 0) sNumerator = 0; else if (-d + b > a) sNumerator = sDenominator; else { sNumerator = -d + b; sDenominator = a; }
  }
  const sc = Math.abs(sNumerator) < Number.EPSILON ? 0 : sNumerator / sDenominator;
  const tc = Math.abs(tNumerator) < Number.EPSILON ? 0 : tNumerator / tDenominator;
  return Math.hypot(wx + sc * ux - tc * vx, wy + sc * uy - tc * vy, wz + sc * uz - tc * vz);
}
