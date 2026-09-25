import { Vector3, type Camera } from "three";
import type { Landing } from "../../shared/sim/arrows.ts";
import { AIM_DOT } from "../render/look.ts";

const projected = new Vector3();

/**
 * A red dot where the arrow being drawn would land if released now, like the red dot of a gun sight. It follows drop,
 * walls and players, so it shows the real landing point when that differs from the crosshair.
 */
export class AimDot {
  readonly root = document.createElement("div");
  private onTarget: boolean | undefined;

  constructor(container: HTMLElement) {
    this.root.dataset.testid = "aim-dot";
    this.root.style.cssText = "position:absolute;left:0;top:0;border-radius:50%;pointer-events:none;display:none;will-change:transform;z-index:1";
    container.append(this.root);
  }

  hide(): void { this.root.style.display = "none"; }

  /** Projects the landing point through the camera the frame is drawn with; hides it when nothing is hit or it is behind. */
  place(landing: Landing, camera: Camera, width: number, height: number): void {
    if (landing.kind === "none") { this.hide(); return; }
    camera.updateMatrixWorld();
    projected.set(landing.x, landing.y, landing.z).project(camera);
    if (projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) { this.hide(); return; }
    const onTarget = landing.kind !== "world";
    if (onTarget !== this.onTarget) {
      this.onTarget = onTarget;
      const size = onTarget ? AIM_DOT.targetSize : AIM_DOT.size;
      this.root.style.width = `${size}px`; this.root.style.height = `${size}px`;
      this.root.style.background = AIM_DOT.color;
      this.root.style.boxShadow = onTarget ? `0 0 0 2px ${AIM_DOT.ring}, 0 0 0 3px ${AIM_DOT.edge}` : `0 0 0 1.5px ${AIM_DOT.edge}`;
    }
    const size = onTarget ? AIM_DOT.targetSize : AIM_DOT.size;
    const x = (projected.x + 1) / 2 * width - size / 2, y = (1 - projected.y) / 2 * height - size / 2;
    this.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    this.root.style.display = "block";
  }
}
