import { MOUSE_SENSITIVITY } from "../../shared/constants.ts";
import { BTN, type PlayerInputFrame } from "../../shared/input.ts";
import { PITCH_LIMIT, clamp, wrapAngle } from "../../shared/math/angles.ts";

export class InputSampler {
  private readonly canvas: HTMLCanvasElement;
  private readonly keys = new Set<string>();
  private mouseButtons = 0;
  private yaw: number;
  private pitch = 0;

  constructor(canvas: HTMLCanvasElement, initialYaw = -Math.PI / 2) {
    this.canvas = canvas;
    this.yaw = initialYaw;
    window.addEventListener("keydown", (event) => this.keys.add(event.code));
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    window.addEventListener("mousedown", (event) => { this.mouseButtons |= 1 << event.button; });
    window.addEventListener("mouseup", (event) => { this.mouseButtons &= ~(1 << event.button); });
    window.addEventListener("mousemove", (event) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.yaw = wrapAngle(this.yaw - event.movementX * MOUSE_SENSITIVITY);
      this.pitch = clamp(this.pitch - event.movementY * MOUSE_SENSITIVITY, -PITCH_LIMIT, PITCH_LIMIT);
    });
    window.addEventListener("contextmenu", (event) => event.preventDefault());
    this.canvas.addEventListener("click", () => void this.canvas.requestPointerLock());
  }

  sample(out: PlayerInputFrame): void {
    out.moveX = Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA"));
    out.moveZ = Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS"));
    out.yaw = this.yaw;
    out.pitch = this.pitch;
    let buttons = 0;
    if (this.keys.has("Space")) buttons |= BTN.JUMP;
    if (this.keys.has("KeyC") || this.keys.has("ControlLeft")) buttons |= BTN.CROUCH;
    if ((this.mouseButtons & 2) !== 0) buttons |= BTN.AIM;
    if ((this.mouseButtons & 1) !== 0) buttons |= BTN.FIRE;
    if (this.keys.has("KeyV")) buttons |= BTN.MELEE;
    if (this.keys.has("KeyR")) buttons |= BTN.CANCEL;
    out.buttons = buttons;
  }

  setLook(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
  }
}
