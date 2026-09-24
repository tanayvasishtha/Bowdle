import { lockPointer } from "./pointerLock.ts";
import { BTN, type PlayerInputFrame } from "../../shared/input.ts";
import { PITCH_LIMIT, clamp, wrapAngle } from "../../shared/math/angles.ts";
import { loadSettings, type GameSettings } from "../settings.ts";
import type { TouchControls } from "../ui/touchControls.ts";
import { PAD, TrackpadToggles, emptyPad, firstPad, readPad } from "./gamepad.ts";

export class InputSampler {
  private readonly canvas: HTMLCanvasElement;
  private readonly keys = new Set<string>();
  private mouseButtons = 0;
  yaw: number;
  pitch = 0;
  private settings = loadSettings();
  private paused = false;
  /** Wheel steps not sent yet. Each step becomes one press, with a released sample between presses. */
  private wheelSteps = 0;
  private wheelSent = false;
  private readonly pad = emptyPad();
  private padStartWasDown = false;
  private readonly toggles = new TrackpadToggles();
  /** True while an enemy is under the crosshair; stick look slows down, nothing else changes. */
  private aimSlowdown = false;
  private touch: TouchControls | undefined;

  constructor(canvas: HTMLCanvasElement, initialYaw = -Math.PI / 2) {
    this.canvas = canvas;
    this.yaw = initialYaw;
    window.addEventListener("keydown", (event) => { this.keys.add(event.code); this.toggle(event.code); });
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    window.addEventListener("mousedown", (event) => { this.mouseButtons |= 1 << event.button; this.toggle(`Mouse${event.button}`); });
    window.addEventListener("mouseup", (event) => { this.mouseButtons &= ~(1 << event.button); });
    window.addEventListener("mousemove", (event) => {
      if (document.pointerLockElement !== this.canvas) return;
      const scale = this.settings.sensitivity * (this.aiming() ? this.settings.aimSensitivity : 1);
      this.turn(-event.movementX * scale, -event.movementY * scale * this.settings.verticalSensitivity);
    });
    window.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("wheel", (event) => {
      if (this.paused || event.deltaY === 0) return;
      this.wheelSteps = Math.max(-3, Math.min(3, this.wheelSteps + Math.sign(event.deltaY)));
    }, { passive: true });
    this.canvas.addEventListener("click", () => lockPointer(this.canvas));
    window.addEventListener("bowdle-settings", (event) => {
      this.settings = (event as CustomEvent<GameSettings>).detail;
      if (!this.settings.trackpadMode) this.toggles.reset();
    });
  }

  /** In trackpad mode the draw and aim bindings flip a toggle on each press instead of acting while held. */
  private toggle(code: string): void {
    if (!this.settings.trackpadMode || this.paused) return;
    if (code === this.settings.keys.draw) this.toggles.press("draw");
    if (code === this.settings.keys.aim) this.toggles.press("aim");
  }

  private turn(yawDelta: number, pitchDelta: number): void {
    this.yaw = wrapAngle(this.yaw + yawDelta);
    this.pitch = clamp(this.pitch + pitchDelta * (this.settings.invertY ? -1 : 1), -PITCH_LIMIT, PITCH_LIMIT);
  }

  private bound(action: keyof GameSettings["keys"]): boolean {
    if (this.settings.trackpadMode && (action === "draw" || action === "aim")) return this.toggles.held(action);
    const code = this.settings.keys[action];
    if (!code || typeof code !== "string") return false;
    if (code.startsWith("Mouse")) return (this.mouseButtons & (1 << Number(code.slice(5)))) !== 0;
    return this.keys.has(code);
  }

  /** True when this physical key is down, even if the player rebound the action. */
  private keyDown(...codes: string[]): boolean {
    return codes.some((code) => this.keys.has(code));
  }

  /**
   * Keyboard move on one axis, with WASD and arrow keys as hard fallbacks so a bad rebind
   * cannot brick strafing. Positive is right / forward.
   */
  private keyboardAxis(negative: keyof GameSettings["keys"], positive: keyof GameSettings["keys"], fallbackNeg: string[], fallbackPos: string[]): number {
    let value = Number(this.bound(positive)) - Number(this.bound(negative));
    if (this.keyDown(...fallbackPos)) value += 1;
    if (this.keyDown(...fallbackNeg)) value -= 1;
    return Math.max(-1, Math.min(1, value));
  }

  /** Pick the stronger signal per axis so a drifting stick cannot wipe keyboard strafe. */
  private blendAxis(keyboard: number, pad: number): number {
    return Math.abs(pad) > Math.abs(keyboard) ? pad : keyboard;
  }

  private aiming(): boolean { return this.bound("aim") || (this.pad.buttons & BTN.AIM) !== 0; }

  /**
   * Once per rendered frame: reads the pad, turns with the right stick, and presses the menu key for Start.
   * Stick look turns at the gamepad sensitivity, slower while aiming at an enemy.
   */
  frame(elapsedMs: number): void {
    readPad(firstPad(), this.pad);
    if (this.pad.start && !this.padStartWasDown) window.dispatchEvent(new KeyboardEvent("keydown", { code: this.settings.keys.menu }));
    this.padStartWasDown = this.pad.start;
    if (this.paused || !this.pad.connected) return;
    const speed = PAD.lookRadPerS * this.settings.gamepadSensitivity * (this.aimSlowdown ? PAD.aimSlowdown : 1) * (this.aiming() ? this.settings.aimSensitivity : 1);
    const seconds = Math.min(0.1, elapsedMs / 1000);
    this.turn(-this.pad.lookX * speed * seconds, -this.pad.lookY * speed * seconds * this.settings.verticalSensitivity);
  }

  setAimSlowdown(active: boolean): void { this.aimSlowdown = active; }
  gamepadConnected(): boolean { return this.pad.connected; }

  attachTouch(controls: TouchControls): void {
    this.touch?.dispose();
    this.touch = controls;
  }


  sample(out: PlayerInputFrame): void {
    const keyboardX = this.keyboardAxis("left", "right", ["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]);
    const keyboardZ = this.keyboardAxis("back", "forward", ["KeyS", "ArrowDown"], ["KeyW", "ArrowUp"]);
    const padX = this.pad.connected ? this.pad.moveX : 0;
    const padZ = this.pad.connected ? this.pad.moveZ : 0;
    out.moveX = this.paused ? 0 : this.blendAxis(keyboardX, padX);
    out.moveZ = this.paused ? 0 : this.blendAxis(keyboardZ, padZ);
    if (!this.paused && this.touch) {
      const touch = this.touch.sample();
      if (Math.hypot(touch.moveX, touch.moveZ) > 0.05) {
        if (Math.abs(touch.moveX) >= 0.05) out.moveX = touch.moveX;
        if (Math.abs(touch.moveZ) >= 0.05) out.moveZ = touch.moveZ;
      }
      this.yaw += touch.lookDx;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch - touch.lookDy * this.settings.verticalSensitivity));
      out.yaw = this.yaw;
      out.pitch = this.pitch;
      (out as { _touchButtons?: number })._touchButtons = touch.buttons;
    }
    out.yaw = this.yaw;
    out.pitch = this.pitch;
    out.aimRange = this.aimRange;
    let buttons = this.paused ? 0 : this.pad.buttons;
    if (!this.paused && this.bound("jump")) buttons |= BTN.JUMP;
    if (!this.paused && this.bound("crouch")) buttons |= BTN.CROUCH;
    if (!this.paused && this.bound("aim")) buttons |= BTN.AIM;
    if (!this.paused && this.bound("draw")) buttons |= BTN.FIRE;
    if (!this.paused && this.bound("melee")) buttons |= BTN.MELEE;
    if (!this.paused && this.bound("cancel")) buttons |= BTN.CANCEL;
    if (!this.paused && this.bound("grapple")) buttons |= BTN.GRAPPLE;
    if (!this.paused && this.bound("ink")) buttons |= BTN.INK;
    if (!this.paused && this.bound("use")) buttons |= BTN.USE;
    if (!this.paused && this.bound("dodge")) buttons |= BTN.DODGE;
    if (!this.paused && this.bound("slot1")) buttons |= BTN.SLOT1;
    if (!this.paused && this.bound("slot2")) buttons |= BTN.SLOT2;
    if (!this.paused && this.bound("slot3")) buttons |= BTN.SLOT3;
    if (this.wheelSent) this.wheelSent = false;
    else if (this.wheelSteps !== 0 && !this.paused) {
      buttons |= this.wheelSteps > 0 ? BTN.SLOT_NEXT : BTN.SLOT_PREV;
      this.wheelSteps -= Math.sign(this.wheelSteps); this.wheelSent = true;
    }
    out.buttons = buttons | ((out as { _touchButtons?: number })._touchButtons ?? 0);
  }

  setLook(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
  }
  /** Metres to whatever is under the crosshair, set by the session every frame and sent with each input. */
  aimRange = 0;
  releaseForTest(): void { this.keys.clear(); this.mouseButtons = 0; this.toggles.reset(); }
  setPaused(paused: boolean): void { this.paused = paused; if (paused) { this.keys.clear(); this.mouseButtons = 0; this.toggles.reset(); } }
  actionCode(action: keyof GameSettings["keys"]): string { return this.settings.keys[action]; }
}
