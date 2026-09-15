import { ZIP_ATTACH_DIST, ZIP_JUMP_BOOST, ZIP_SPEED } from "../constants.ts";
import type { PlayerInputFrame } from "../input.ts";
import { BTN } from "../input.ts";
import type { MapData, ZipLine } from "../maps/types.ts";
import type { PlayerSim } from "./movement.ts";

function pressed(buttons: number, previous: number, button: number): boolean { return (buttons & button) !== 0 && (previous & button) === 0; }

function findZip(map: MapData, id: string): ZipLine | null {
  for (const zip of map.zipLines) if (zip.id === id) return zip;
  return null;
}

export function releaseZip(state: PlayerSim, jump: boolean): void {
  if (!state.zipId) return;
  state.zipId = "";
  state.zipT = 0;
  if (jump) state.vy += ZIP_JUMP_BOOST;
}

export function stepZipInput(state: PlayerSim, input: PlayerInputFrame, map: MapData): void {
  if (state.zipId && pressed(input.buttons, state.prevButtons, BTN.JUMP)) { releaseZip(state, true); return; }
  if (state.zipId || !pressed(input.buttons, state.prevButtons, BTN.USE)) return;
  for (const zip of map.zipLines) {
    if (Math.hypot(state.x - zip.from[0], state.y - zip.from[1], state.z - zip.from[2]) > ZIP_ATTACH_DIST) continue;
    state.zipId = zip.id;
    state.zipT = 0;
    state.x = zip.from[0]; state.y = zip.from[1]; state.z = zip.from[2];
    state.grounded = false; state.sliding = false; state.grappleActive = false;
    return;
  }
}

export function stepZipRide(state: PlayerSim, map: MapData, dt: number): boolean {
  if (!state.zipId) return false;
  const zip = findZip(map, state.zipId);
  if (!zip) { releaseZip(state, false); return false; }
  const dx = zip.to[0] - zip.from[0], dy = zip.to[1] - zip.from[1], dz = zip.to[2] - zip.from[2];
  const length = Math.hypot(dx, dy, dz);
  if (length <= 0) { releaseZip(state, false); return false; }
  state.vx = dx / length * ZIP_SPEED; state.vy = dy / length * ZIP_SPEED; state.vz = dz / length * ZIP_SPEED;
  state.zipT = Math.min(1, state.zipT + ZIP_SPEED * dt / length);
  state.x = zip.from[0] + dx * state.zipT; state.y = zip.from[1] + dy * state.zipT; state.z = zip.from[2] + dz * state.zipT;
  state.grounded = false;
  if (state.zipT >= 1) releaseZip(state, false);
  return true;
}
