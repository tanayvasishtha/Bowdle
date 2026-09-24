export const BTN = {
  JUMP: 1,
  CROUCH: 2,
  FIRE: 4,
  AIM: 8,
  MELEE: 16,
  CANCEL: 32,
  GRAPPLE: 64,
  INK: 128,
  USE: 256,
  DODGE: 512,
  SLOT1: 1024,
  SLOT2: 2048,
  SLOT3: 4096,
  SLOT_NEXT: 8192,
  SLOT_PREV: 16384,
} as const;

export type PlayerInputFrame = {
  moveX: number;
  moveZ: number;
  yaw: number;
  /** Metres to whatever is under the crosshair (0 when unknown). A shot converges on that point; see aimRangeAlongLook. */
  aimRange?: number;
  pitch: number;
  buttons: number;
};
