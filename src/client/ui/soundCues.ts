import { AUDIO_MIX } from "../render/look.ts";

export type CueKind = "footstep" | "shot" | "boulder";

const MARKS: Record<CueKind, { color: string; width: number }> = {
  footstep: { color: "#4a3527", width: 60 },
  shot: { color: "#d2531f", width: 90 },
  boulder: { color: "#7a4b2a", width: 140 },
};

/**
 * Accessibility: a short ink arc near the screen edge in the direction of a sound.
 * The angle is relative to the view, 0 straight ahead (top of the screen), positive to the right.
 */
export class SoundCues {
  private readonly root = document.createElement("div");
  private shownCount = 0;

  constructor(container: HTMLElement) {
    this.root.className = "bowdle-sound-cues";
    this.root.dataset.testid = "sound-cues";
    this.root.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5";
    container.append(this.root);
  }

  get shown(): number { return this.shownCount; }

  show(kind: CueKind, angle: number): void {
    this.shownCount += 1;
    const mark = MARKS[kind];
    const arc = document.createElement("div");
    arc.dataset.cue = kind;
    const x = 50 + Math.sin(angle) * AUDIO_MIX.cueRadius * 100, y = 50 - Math.cos(angle) * AUDIO_MIX.cueRadius * 100;
    arc.style.cssText = `position:absolute;left:${x}%;top:${y}%;width:${mark.width}px;height:${mark.width / 3}px;border-top:5px solid ${mark.color};border-radius:50% 50% 0 0;transform:translate(-50%,-50%) rotate(${angle}rad)`;
    this.root.append(arc);
    arc.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: AUDIO_MIX.cueMs }).finished.then(() => arc.remove(), () => arc.remove());
  }
}
