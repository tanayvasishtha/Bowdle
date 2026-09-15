import type { PerspectiveCamera } from "three";
import { ARROW_MAX_PER_PLAYER, REPLAY_BUFFER_MS, REPLAY_CAMERA_DISTANCE, REPLAY_CAMERA_HEIGHT, REPLAY_CAPTURE_HZ, REPLAY_DURATION_MS, REPLAY_SPEED, TEAM_SIZE } from "../../shared/constants.ts";

const FRAME_COUNT = REPLAY_BUFFER_MS * REPLAY_CAPTURE_HZ / 1000;
const PLAYER_CAPACITY = TEAM_SIZE * 2;
const ARROW_CAPACITY = TEAM_SIZE * 2 * ARROW_MAX_PER_PLAYER;
type Frame = { playerIds: string[]; players: Float32Array; playerCount: number; arrowIds: Int32Array; arrows: Float32Array; arrowCount: number };

function frame(): Frame { return { playerIds: Array.from({ length: PLAYER_CAPACITY }, () => ""), players: new Float32Array(PLAYER_CAPACITY * 4), playerCount: 0, arrowIds: new Int32Array(ARROW_CAPACITY), arrows: new Float32Array(ARROW_CAPACITY * 3), arrowCount: 0 }; }

export class ReplayDirector {
  private readonly frames = Array.from({ length: FRAME_COUNT }, frame);
  private readonly overlay: HTMLDivElement;
  private cursor = -1;
  private captured = 0;
  private nextCaptureMs = 0;
  private replayStartedMs = 0;
  private arrowId = -1;
  private killerId = "";
  private replaying = false;
  private spectating = false;

  constructor(container: HTMLElement) {
    this.overlay = document.createElement("div"); this.overlay.className = "bowdle-replay";
    this.overlay.innerHTML = `<span>ARROW CAM</span><button style="margin-left:12px;border:2px solid #233c9b;background:#f3eedf;color:#233c9b;font:18px 'Gochi Hand'">SKIP ›</button>`;
    this.overlay.style.cssText = "display:none;position:absolute;left:24px;bottom:24px;padding:10px 14px;background:#f3eedfdd;border:3px solid #233c9b;color:#233c9b;font:24px 'Permanent Marker';pointer-events:auto;transform:rotate(-1deg)";
    this.overlay.querySelector("button")!.addEventListener("click", () => { this.replaying = false; this.spectating = true; }); container.append(this.overlay);
  }

  beginCapture(nowMs: number): boolean {
    if (nowMs < this.nextCaptureMs) return false;
    this.nextCaptureMs = nowMs + 1000 / REPLAY_CAPTURE_HZ; this.cursor = (this.cursor + 1) % FRAME_COUNT; this.captured = Math.min(FRAME_COUNT, this.captured + 1);
    const current = this.frames[this.cursor]!; current.playerCount = 0; current.arrowCount = 0; return true;
  }
  player(id: string, x: number, y: number, z: number, yaw: number): void {
    const current = this.frames[this.cursor]!; if (current.playerCount >= PLAYER_CAPACITY) return; const index = current.playerCount++, offset = index * 4;
    current.playerIds[index] = id; current.players[offset] = x; current.players[offset + 1] = y; current.players[offset + 2] = z; current.players[offset + 3] = yaw;
  }
  arrow(id: number, x: number, y: number, z: number): void {
    const current = this.frames[this.cursor]!; if (current.arrowCount >= ARROW_CAPACITY) return; const index = current.arrowCount++, offset = index * 3;
    current.arrowIds[index] = id; current.arrows[offset] = x; current.arrows[offset + 1] = y; current.arrows[offset + 2] = z;
  }

  start(victimId: string, killerId: string, nowMs: number): void {
    if (this.cursor < 0) return; const latest = this.frames[this.cursor]!; let victimX = 0, victimY = 0, victimZ = 0;
    for (let index = 0; index < latest.playerCount; index += 1) if (latest.playerIds[index] === victimId) { const offset = index * 4; victimX = latest.players[offset]!; victimY = latest.players[offset + 1]!; victimZ = latest.players[offset + 2]!; }
    let nearest = Number.POSITIVE_INFINITY; this.arrowId = -1;
    for (let index = 0; index < latest.arrowCount; index += 1) { const offset = index * 3; const distance = Math.hypot(latest.arrows[offset]! - victimX, latest.arrows[offset + 1]! - victimY, latest.arrows[offset + 2]! - victimZ); if (distance < nearest) { nearest = distance; this.arrowId = latest.arrowIds[index]!; } }
    this.killerId = killerId; this.replayStartedMs = nowMs; this.replaying = this.arrowId >= 0; this.spectating = !this.replaying; this.overlay.style.display = "block";
  }

  update(camera: PerspectiveCamera, nowMs: number): boolean {
    if (!this.replaying && !this.spectating) return false;
    if (this.replaying) {
      const playbackMs = (nowMs - this.replayStartedMs) * REPLAY_SPEED;
      if (playbackMs >= REPLAY_DURATION_MS) { this.replaying = false; this.spectating = true; }
      else if (this.followArrow(camera, playbackMs)) return true;
    }
    return this.followPlayer(camera, this.frames[this.cursor]!, this.killerId);
  }
  stop(): void { this.replaying = false; this.spectating = false; this.overlay.style.display = "none"; }
  private followArrow(camera: PerspectiveCamera, playbackMs: number): boolean {
    const history = Math.min(this.captured - 1, Math.ceil(REPLAY_DURATION_MS * REPLAY_CAPTURE_HZ / 1000));
    const step = Math.min(history, Math.floor(playbackMs * REPLAY_CAPTURE_HZ / 1000));
    let index = (this.cursor - history + step + FRAME_COUNT) % FRAME_COUNT, current = this.frames[index]!, a = -1;
    for (let search = 0; search <= history - step && a < 0; search += 1) {
      current = this.frames[index]!;
      for (let slot = 0; slot < current.arrowCount; slot += 1) if (current.arrowIds[slot] === this.arrowId) a = slot;
      if (a < 0) index = (index + 1) % FRAME_COUNT;
    }
    const nextIndex = (index + 1) % FRAME_COUNT, next = this.frames[nextIndex]!; let b = -1;
    for (let slot = 0; slot < next.arrowCount; slot += 1) if (next.arrowIds[slot] === this.arrowId) b = slot;
    if (a < 0 || b < 0) return false; const ao = a * 3, bo = b * 3;
    let dx = next.arrows[bo]! - current.arrows[ao]!, dy = next.arrows[bo + 1]! - current.arrows[ao + 1]!, dz = next.arrows[bo + 2]! - current.arrows[ao + 2]!; const length = Math.hypot(dx, dy, dz) || 1; dx /= length; dy /= length; dz /= length;
    const x = current.arrows[ao]!, y = current.arrows[ao + 1]!, z = current.arrows[ao + 2]!; camera.position.set(x - dx * REPLAY_CAMERA_DISTANCE, y - dy * REPLAY_CAMERA_DISTANCE + REPLAY_CAMERA_HEIGHT, z - dz * REPLAY_CAMERA_DISTANCE); camera.lookAt(x, y, z); return true;
  }
  private followPlayer(camera: PerspectiveCamera, current: Frame, id: string): boolean {
    for (let index = 0; index < current.playerCount; index += 1) if (current.playerIds[index] === id) { const offset = index * 4, yaw = current.players[offset + 3]!; const x = current.players[offset]!, y = current.players[offset + 1]!, z = current.players[offset + 2]!; camera.position.set(x + Math.sin(yaw) * 4, y + 2.2, z + Math.cos(yaw) * 4); camera.lookAt(x, y + 1, z); return true; }
    return false;
  }
}
