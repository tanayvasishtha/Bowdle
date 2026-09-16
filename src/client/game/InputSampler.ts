import { lockPointer } from "./pointerLock.ts";
import { BTN, type PlayerInputFrame } from "../../shared/input.ts";
import { PITCH_LIMIT, clamp, wrapAngle } from "../../shared/math/angles.ts";
import { loadSettings, type GameSettings } from "../settings.ts";

export class InputSampler {
  private readonly canvas: HTMLCanvasElement;
  private readonly keys = new Set<string>();
  private mouseButtons = 0;
  private yaw: number;
  private pitch = 0;
  private settings = loadSettings();
  private paused = false;

  constructor(canvas: HTMLCanvasElement, initialYaw = -Math.PI / 2) {
    this.canvas = canvas;
    this.yaw = initialYaw;
    window.addEventListener("keydown", (event) => this.keys.add(event.code));
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    window.addEventListener("mousedown", (event) => { this.mouseButtons |= 1 << event.button; });
    window.addEventListener("mouseup", (event) => { this.mouseButtons &= ~(1 << event.button); });
    window.addEventListener("mousemove", (event) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.yaw = wrapAngle(this.yaw - event.movementX * this.settings.sensitivity);
      this.pitch = clamp(this.pitch - event.movementY * this.settings.sensitivity, -PITCH_LIMIT, PITCH_LIMIT);
    });
    window.addEventListener("contextmenu", (event) => event.preventDefault());
    this.canvas.addEventListener("click", () => lockPointer(this.canvas));
    window.addEventListener("bowdle-settings", (event) => { this.settings = (event as CustomEvent<GameSettings>).detail; });
  }

  private bound(action: keyof GameSettings["keys"]): boolean {
    const code = this.settings.keys[action];
    if (code.startsWith("Mouse")) return (this.mouseButtons & (1 << Number(code.slice(5)))) !== 0;
    return this.keys.has(code);
  }

  sample(out: PlayerInputFrame): void {
    out.moveX = this.paused ? 0 : Number(this.bound("right")) - Number(this.bound("left"));
    out.moveZ = this.paused ? 0 : Number(this.bound("forward")) - Number(this.bound("back"));
    out.yaw = this.yaw;
    out.pitch = this.pitch;
    let buttons = 0;
    if (!this.paused && this.bound("jump")) buttons |= BTN.JUMP;
    if (!this.paused && this.bound("crouch")) buttons |= BTN.CROUCH;
    if (!this.paused && this.bound("aim")) buttons |= BTN.AIM;
    if (!this.paused && this.bound("draw")) buttons |= BTN.FIRE;
    if (!this.paused && this.bound("melee")) buttons |= BTN.MELEE;
    if (!this.paused && this.bound("cancel")) buttons |= BTN.CANCEL;
    if (!this.paused && this.bound("grapple")) buttons |= BTN.GRAPPLE;
    if (!this.paused && this.bound("ink")) buttons |= BTN.INK;
    if (!this.paused && this.bound("use")) buttons |= BTN.USE;
    out.buttons = buttons;
  }

  setLook(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
  }
  setPaused(paused: boolean): void { this.paused = paused; if (paused) { this.keys.clear(); this.mouseButtons = 0; } }
  actionCode(action: keyof GameSettings["keys"]): string { return this.settings.keys[action]; }
}
