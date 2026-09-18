/** On-screen stick, draw/release, and look pad for coarse pointers (N3). */
import type { PlayerInputFrame } from "../../shared/input.ts";
import { BTN } from "../../shared/input.ts";
import { loadSettings, saveSettings } from "../settings.ts";

export type TouchSample = {
  moveX: number;
  moveZ: number;
  lookDx: number;
  lookDy: number;
  buttons: number;
};

const STYLE = `
.bowdle-touch{position:absolute;inset:0;pointer-events:none;z-index:8}
.bowdle-touch *{pointer-events:auto;touch-action:none;user-select:none}
.bowdle-touch-stick,.bowdle-touch-look,.bowdle-touch-fire{
  position:absolute;border:3px solid #4a3527;background:#efe3c6aa;border-radius:50%;
}
.bowdle-touch-stick{left:24px;bottom:24px;width:120px;height:120px}
.bowdle-touch-stick>i{position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px;border-radius:50%;background:#d2531f;border:2px solid #4a3527}
.bowdle-touch-look{right:24px;bottom:24px;width:160px;height:160px;border-radius:24px}
.bowdle-touch-fire{right:24px;bottom:200px;width:88px;height:88px;display:grid;place-items:center;font:22px 'Gochi Hand';color:#4a3527}
.bowdle-touch-fire[data-held=true]{background:#e3b23ccc}
`;

export function wantsTouchControls(): boolean {
  const settings = loadSettings();
  if (settings.touchControls === "off") return false;
  if (settings.touchControls === "on") return true;
  return navigator.maxTouchPoints > 0 && matchMedia("(pointer: coarse)").matches;
}

export class TouchControls {
  private readonly root: HTMLDivElement;
  private moveX = 0;
  private moveZ = 0;
  private lookDx = 0;
  private lookDy = 0;
  private holding = false;
  private stickId: number | null = null;
  private lookId: number | null = null;
  private fireId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookOrigin = { x: 0, y: 0 };
  private readonly knob: HTMLElement;
  private readonly fire: HTMLButtonElement;

  constructor(host: HTMLElement) {
    if (!document.getElementById("bowdle-touch-style")) {
      const style = document.createElement("style");
      style.id = "bowdle-touch-style";
      style.textContent = STYLE;
      document.head.append(style);
    }
    this.root = document.createElement("div");
    this.root.className = "bowdle-touch";
    this.root.dataset.testid = "touch-controls";
    this.root.innerHTML = `<div class="bowdle-touch-stick" data-testid="touch-stick"><i></i></div>
      <button type="button" class="bowdle-touch-fire" data-testid="touch-fire">Draw</button>
      <div class="bowdle-touch-look" data-testid="touch-look"></div>`;
    host.append(this.root);
    this.knob = this.root.querySelector(".bowdle-touch-stick > i")!;
    this.fire = this.root.querySelector(".bowdle-touch-fire")!;
    const stick = this.root.querySelector(".bowdle-touch-stick")!;
    const look = this.root.querySelector(".bowdle-touch-look")!;
    stick.addEventListener("pointerdown", (event) => this.onStickDown(event as PointerEvent));
    look.addEventListener("pointerdown", (event) => this.onLookDown(event as PointerEvent));
    this.fire.addEventListener("pointerdown", (event) => this.onFireDown(event as PointerEvent));
    window.addEventListener("pointermove", (event) => this.onMove(event));
    window.addEventListener("pointerup", (event) => this.onUp(event));
    window.addEventListener("pointercancel", (event) => this.onUp(event));
  }

  dispose(): void { this.root.remove(); }

  sample(): TouchSample {
    const buttons = this.holding ? BTN.FIRE : 0;
    const out = { moveX: this.moveX, moveZ: this.moveZ, lookDx: this.lookDx, lookDy: this.lookDy, buttons };
    this.lookDx = 0; this.lookDy = 0;
    return out;
  }

  private onStickDown(event: PointerEvent): void {
    event.preventDefault();
    this.stickId = event.pointerId;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.stickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    this.onStickMove(event.clientX, event.clientY);
  }

  private onLookDown(event: PointerEvent): void {
    event.preventDefault();
    this.lookId = event.pointerId;
    this.lookOrigin = { x: event.clientX, y: event.clientY };
  }

  private onFireDown(event: PointerEvent): void {
    event.preventDefault();
    this.fireId = event.pointerId;
    this.holding = true;
    this.fire.dataset.held = "true";
    this.fire.textContent = "Release";
  }

  private onMove(event: PointerEvent): void {
    if (event.pointerId === this.stickId) this.onStickMove(event.clientX, event.clientY);
    if (event.pointerId === this.lookId) {
      const sens = loadSettings().touchLookSensitivity ?? 1;
      this.lookDx += (event.clientX - this.lookOrigin.x) * 0.004 * sens;
      this.lookDy += (event.clientY - this.lookOrigin.y) * 0.004 * sens;
      this.lookOrigin = { x: event.clientX, y: event.clientY };
    }
  }

  private onStickMove(x: number, y: number): void {
    const dx = x - this.stickOrigin.x;
    const dy = y - this.stickOrigin.y;
    const len = Math.hypot(dx, dy) || 1;
    const max = 48;
    const scale = Math.min(1, len / max);
    this.moveX = (dx / len) * scale;
    this.moveZ = (-dy / len) * scale;
    this.knob.style.transform = `translate(${(dx / len) * scale * max}px, ${(dy / len) * scale * max}px)`;
  }

  private onUp(event: PointerEvent): void {
    if (event.pointerId === this.stickId) {
      this.stickId = null; this.moveX = 0; this.moveZ = 0; this.knob.style.transform = "";
    }
    if (event.pointerId === this.lookId) this.lookId = null;
    if (event.pointerId === this.fireId) {
      this.fireId = null; this.holding = false; this.fire.dataset.held = "false"; this.fire.textContent = "Draw";
    }
  }
}

export function ensureTouchSettingDefault(): void {
  const settings = loadSettings();
  if (settings.touchControls === undefined) {
    saveSettings({ ...settings, touchControls: "auto", touchLookSensitivity: 1 });
  }
}
