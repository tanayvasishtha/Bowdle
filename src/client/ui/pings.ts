import { CALLOUT_LABELS, CALLOUTS, PING_DURATION_MS, type CalloutId, type PingKind } from "../../shared/pings.ts";

export type PingEvent = {
  kind: PingKind;
  x: number; y: number; z: number;
  callout?: CalloutId;
  from: string;
  team: number;
  atMs: number;
};

export class PingLayer {
  readonly root: HTMLDivElement;
  private readonly markers = new Map<string, HTMLDivElement>();
  private readonly wheel: HTMLDivElement;
  private wheelOpen = false;
  private onCallout: ((id: CalloutId) => void) | undefined;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.dataset.testid = "ping-layer";
    this.root.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
    this.wheel = document.createElement("div");
    this.wheel.dataset.testid = "callout-wheel";
    this.wheel.hidden = true;
    this.wheel.style.cssText = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px;background:#efe3c6ee;border:3px solid #4a3527;pointer-events:none";
    for (const id of CALLOUTS) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.callout = id;
      button.textContent = CALLOUT_LABELS[id];
      button.style.cssText = "font:18px 'Gochi Hand';padding:8px 10px;border:2px solid #4a3527;background:#fff8e7;cursor:pointer";
      button.addEventListener("click", () => { this.onCallout?.(id); this.hideWheel(); });
      this.wheel.append(button);
    }
    this.root.append(this.wheel);
    parent.append(this.root);
  }

  setCalloutHandler(handler: (id: CalloutId) => void): void { this.onCallout = handler; }
  showWheel(): void { this.wheelOpen = true; this.wheel.hidden = false; this.wheel.style.pointerEvents = "auto"; }
  hideWheel(): void { this.wheelOpen = false; this.wheel.hidden = true; this.wheel.style.pointerEvents = "none"; }
  get isWheelOpen(): boolean { return this.wheelOpen; }

  show(event: PingEvent, nowMs: number, project: (x: number, y: number, z: number) => { x: number; y: number } | undefined): void {
    const key = `${event.from}:${event.atMs}`;
    let marker = this.markers.get(key);
    if (!marker) {
      marker = document.createElement("div");
      marker.dataset.testid = "ping-marker";
      marker.dataset.kind = event.kind;
      marker.style.cssText = "position:absolute;transform:translate(-50%,-100%);padding:4px 8px;background:#efe3c6;border:2px solid #4a3527;font:16px 'Gochi Hand';white-space:nowrap";
      marker.textContent = event.callout ? CALLOUT_LABELS[event.callout] : event.kind.toUpperCase();
      this.root.append(marker);
      this.markers.set(key, marker);
    }
    const point = project(event.x, event.y, event.z);
    if (!point) { marker.hidden = true; return; }
    marker.hidden = false;
    marker.style.left = `${point.x}px`;
    marker.style.top = `${point.y}px`;
    if (nowMs - event.atMs >= PING_DURATION_MS) {
      marker.remove();
      this.markers.delete(key);
    }
  }

  prune(nowMs: number): void {
    for (const [key, marker] of [...this.markers]) {
      const atMs = Number(key.split(":")[1]);
      if (nowMs - atMs >= PING_DURATION_MS) { marker.remove(); this.markers.delete(key); }
    }
  }
}

export class AfkPrompt {
  readonly root: HTMLDivElement;
  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.dataset.testid = "afk-prompt";
    this.root.hidden = true;
    this.root.style.cssText = "position:absolute;left:50%;bottom:18%;transform:translateX(-50%);padding:12px 16px;background:#efe3c6;border:3px solid #4a3527;font:22px 'Permanent Marker'";
    parent.append(this.root);
  }
  show(secondsLeft: number): void {
    this.root.hidden = false;
    this.root.textContent = `Still there? ${secondsLeft}s`;
  }
  hide(): void { this.root.hidden = true; }
}
