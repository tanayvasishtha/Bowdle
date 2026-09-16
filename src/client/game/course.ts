import type { Vec3Tuple } from "../../shared/maps/types.ts";

/** What the course watches for. "reach" means standing at the station marker. */
export type CourseSignal = "reach" | "vineHop" | "slide" | "wallJump" | "mantle" | "swing" | "headshot" | "swat";
export type CourseStation = { id: string; text: string; signal: CourseSignal; marker: Vec3Tuple };

/** The eight field course stations in Practice Camp, in order. Markers float over where each move is easiest. */
export const COURSE_STATIONS: readonly CourseStation[] = [
  { id: "move", text: "WASD · move through camp to the marker", signal: "reach", marker: [0, 0, -5] },
  { id: "hop", text: "SPACE, then SPACE again in the air · vine hop", signal: "vineHop", marker: [0, 0, -5] },
  { id: "slide", text: "Run, then C · slide under the log", signal: "slide", marker: [-6, 0, -10] },
  { id: "wall", text: "Jump at the tower wall, SPACE again as you touch it · wall jump", signal: "wallJump", marker: [-8.8, 0, -5] },
  { id: "mantle", text: "Jump at the crate and hold W · climb onto it", signal: "mantle", marker: [4.5, 1.8, -6.5] },
  { id: "swing", text: "Aim at the gold vine, hold E to reel, let go to swing", signal: "swing", marker: [12, 7, -17] },
  { id: "headshot", text: "Hold the mouse to draw, release · hit a target in the head", signal: "headshot", marker: [0, 0, -10] },
  { id: "swat", text: "V just as the red arrow reaches you · swat it", signal: "swat", marker: [0, 0, -3] },
];

export const COURSE_REACH_M = 1.5;
const DONE_KEY = "bowdle.course.done";

export function courseDone(): boolean {
  try { return localStorage.getItem(DONE_KEY) === "yes"; } catch { return false; }
}

function markCourseDone(): void {
  try { localStorage.setItem(DONE_KEY, "yes"); } catch { /* private mode: the course simply shows again next time */ }
}

/** The movement state the signals are read from. */
export type MoveSnapshot = {
  x: number; z: number; grounded: boolean; airJumps: number; wallJumps: number; mantleCooldownMs: number;
  sliding: boolean; grappleActive: boolean; grappleReeling: boolean; dodgeCooldownMs: number;
};

export function snapshotOf(source: MoveSnapshot, out: MoveSnapshot): MoveSnapshot {
  out.x = source.x; out.z = source.z; out.grounded = source.grounded; out.airJumps = source.airJumps; out.wallJumps = source.wallJumps;
  out.mantleCooldownMs = source.mantleCooldownMs; out.sliding = source.sliding; out.grappleActive = source.grappleActive;
  out.grappleReeling = source.grappleReeling; out.dodgeCooldownMs = source.dodgeCooldownMs;
  return out;
}

export function emptySnapshot(): MoveSnapshot {
  return { x: 0, z: 0, grounded: true, airJumps: 1, wallJumps: 0, mantleCooldownMs: 0, sliding: false, grappleActive: false, grappleReeling: false, dodgeCooldownMs: 0 };
}

export type MoveSignal = "vineHop" | "slide" | "wallJump" | "mantle" | "swing" | "reel" | "dodge";

/** Which moves happened between two ticks. */
export function moveSignals(before: MoveSnapshot, after: MoveSnapshot): Set<MoveSignal> {
  const signals = new Set<MoveSignal>();
  if (after.airJumps < before.airJumps && !after.grounded) signals.add("vineHop");
  if (after.sliding) signals.add("slide");
  if (after.wallJumps > before.wallJumps) signals.add("wallJump");
  if (after.mantleCooldownMs > before.mantleCooldownMs) signals.add("mantle");
  if (after.grappleActive && !after.grappleReeling) signals.add("swing");
  if (after.grappleActive && after.grappleReeling) signals.add("reel");
  if (after.dodgeCooldownMs > before.dodgeCooldownMs) signals.add("dodge");
  return signals;
}

export type CourseResult = { skipped: boolean };

/** The course card: one line per station, a counter, and a skip button. Stations complete in order only. */
export class CourseGuide {
  readonly root = document.createElement("div");
  private index = 0;
  private running: boolean;
  private readonly onFinish: (result: CourseResult) => void;

  constructor(container: HTMLElement, start: boolean, onFinish: (result: CourseResult) => void) {
    this.running = start;
    this.onFinish = onFinish;
    this.root.className = "bowdle-tutorial";
    this.root.dataset.testid = "course";
    this.root.style.cssText = "position:absolute;left:50%;top:8%;transform:translateX(-50%) rotate(-1deg);max-width:760px;padding:12px 24px;background:#efe3c6ee;border:4px solid #4a3527;color:#4a3527;font:26px 'Permanent Marker';text-align:center;pointer-events:auto;z-index:8";
    this.root.innerHTML = `<small data-part="count" style="display:block;font:18px 'Gochi Hand';color:#d2531f"></small><span data-part="text"></span><button style="display:block;margin:8px auto 0;border:0;background:none;color:#d2531f;font:18px 'Gochi Hand';cursor:pointer">skip field course</button>`;
    this.root.querySelector("button")!.addEventListener("click", () => this.finish(true));
    container.append(this.root);
    this.render();
  }

  get active(): boolean { return this.running; }
  get station(): CourseStation | undefined { return this.running ? COURSE_STATIONS[this.index] : undefined; }
  get stationIndex(): number { return this.index; }

  observe(signal: CourseSignal): void {
    if (!this.running || COURSE_STATIONS[this.index]?.signal !== signal) return;
    this.index += 1;
    this.root.animate([{ transform: "translateX(-50%) rotate(-1deg) scale(1.06)" }, { transform: "translateX(-50%) rotate(-1deg) scale(1)" }], { duration: 250 });
    if (this.index >= COURSE_STATIONS.length) this.finish(false); else this.render();
  }

  private render(): void {
    this.root.style.display = this.running ? "block" : "none";
    const station = COURSE_STATIONS[this.index];
    if (!station) return;
    this.root.querySelector("[data-part=count]")!.textContent = `Field course ${this.index + 1} / ${COURSE_STATIONS.length}`;
    this.root.querySelector("[data-part=text]")!.textContent = station.text;
  }

  private finish(skipped: boolean): void {
    if (!this.running) return;
    this.running = false;
    markCourseDone();
    this.render();
    this.onFinish({ skipped });
  }
}
