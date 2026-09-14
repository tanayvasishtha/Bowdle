export const PITCH_LIMIT = Math.PI * 89 / 180;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function wrapAngle(value: number): number {
  let wrapped = value % (Math.PI * 2);
  if (wrapped > Math.PI) wrapped -= Math.PI * 2;
  if (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}
