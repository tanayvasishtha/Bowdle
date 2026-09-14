export const BTN = {
  JUMP: 1,
  CROUCH: 2,
  FIRE: 4,
  AIM: 8,
  MELEE: 16,
  CANCEL: 32,
  GRAPPLE: 64,
  INK: 128,
} as const;

export type PlayerInputFrame = {
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  buttons: number;
};
