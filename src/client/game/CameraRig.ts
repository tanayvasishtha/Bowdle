import type { PerspectiveCamera } from "three";
import { AIM_FOV, AIM_FOV_MS, CAMERA_CROUCH_MS, EYE_CROUCH, EYE_STAND, RUN_SPEED } from "../../shared/constants.ts";
import { BTN } from "../../shared/input.ts";
import type { PlayerSim } from "../../shared/sim/movement.ts";
import { loadSettings, type GameSettings } from "../settings.ts";
import { CameraFeel, type FeelOutput, type KickKind } from "./cameraFeel.ts";

const DEG = Math.PI / 180;
const JUMP_KICK_MIN_DELTA_VY = 3;

export class CameraRig {
  private eyeHeight = EYE_STAND;
  private settings: GameSettings = loadSettings();
  private fov = this.settings.fov;
  private readonly feel = new CameraFeel();
  private wasGrounded = true;
  private wasSliding = false;
  private lastVy = 0;
  private lastOut: FeelOutput = this.feel.out;

  constructor() {
    // The player's FOV setting is the base; aim zoom and feel kicks apply on top of it.
    window.addEventListener("bowdle-settings", (event) => { this.settings = (event as CustomEvent<GameSettings>).detail; });
  }

  get output(): FeelOutput { return this.lastOut; }
  get currentFov(): number { return this.fov; }

  kick(kind: KickKind): void { this.feel.kickFov(kind); }
  hurt(damage: number): void { this.feel.hurt(damage); }
  shake(amount: number): void { this.feel.addShake(amount); }

  update(camera: PerspectiveCamera, previous: PlayerSim, current: PlayerSim, alpha: number, dtMs: number): void {
    const targetEye = current.crouched ? EYE_CROUCH : EYE_STAND;
    const eyeStep = Math.min(1, dtMs / CAMERA_CROUCH_MS);
    this.eyeHeight += (targetEye - this.eyeHeight) * eyeStep;

    // Movement events come from the simulated body, so every session gets them for free.
    // Any sudden upward push is a jump; frame rate can skip the exact take-off frame.
    if (current.vy - this.lastVy > JUMP_KICK_MIN_DELTA_VY && current.vy > 0) this.feel.kickFov("jump");
    if (current.grounded && !this.wasGrounded) this.feel.land(-this.lastVy);
    if (current.sliding && !this.wasSliding) this.feel.kickFov("slide");
    this.wasGrounded = current.grounded; this.wasSliding = current.sliding; this.lastVy = current.vy;

    const speed = Math.hypot(current.vx, current.vz);
    const strafe = (current.vx * Math.cos(current.yaw) - current.vz * Math.sin(current.yaw)) / RUN_SPEED;
    const out = this.feel.update({ speed, grounded: current.grounded, sliding: current.sliding, strafe, dtMs, reduceMotion: this.settings.reduceMotion });
    this.lastOut = out;

    const aiming = (current.prevButtons & BTN.AIM) !== 0;
    const targetFov = aiming ? AIM_FOV : this.settings.fov + out.fovOffset;
    const fovStep = Math.min(1, dtMs / AIM_FOV_MS);
    this.fov += (targetFov - this.fov) * fovStep;

    const cos = Math.cos(current.yaw), sin = Math.sin(current.yaw);
    camera.position.set(
      previous.x + (current.x - previous.x) * alpha + cos * out.offsetX,
      previous.y + (current.y - previous.y) * alpha + this.eyeHeight + out.offsetY,
      previous.z + (current.z - previous.z) * alpha - sin * out.offsetX,
    );
    camera.rotation.set(current.pitch + out.shakePitchDeg * DEG, current.yaw + out.shakeYawDeg * DEG, out.rollDeg * DEG);
    if (Math.abs(camera.fov - this.fov) > 0.01) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
  }
}
