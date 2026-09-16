import { PALETTE } from "../render/palette.ts";
import { loadSettings, type GameSettings } from "../settings.ts";

const hex = (value: number): string => `#${value.toString(16).padStart(6, "0")}`;

/**
 * The crosshair in the chosen style, size and color. The circle narrows as the bow draws;
 * the dot and cross stay put and brighten at full draw.
 */
export class Crosshair {
  readonly root = document.createElement("div");
  private settings: GameSettings = loadSettings();
  private fraction = -1;

  constructor(container: HTMLElement) {
    this.root.id = "crosshair";
    this.root.dataset.testid = "crosshair";
    container.append(this.root);
    window.addEventListener("bowdle-settings", (event) => { this.settings = (event as CustomEvent<GameSettings>).detail; this.fraction = -1; });
  }

  update(drawFraction: number): void {
    const fraction = Math.round(Math.max(0, Math.min(1, drawFraction)) * 20) / 20;
    if (fraction === this.fraction) return;
    this.fraction = fraction;
    const { crosshairStyle: style, crosshairSize: size } = this.settings;
    const color = hex(PALETTE[this.settings.crosshairColor]);
    this.root.dataset.style = style;
    const base = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;";
    if (style === "circle") {
      const diameter = size * (1 - fraction * 0.66);
      this.root.style.cssText = `${base}width:${diameter}px;height:${diameter}px;border:3px solid ${color};border-radius:50%;background:none`;
      this.root.innerHTML = "";
    } else if (style === "dot") {
      const diameter = Math.max(4, size * 0.22);
      this.root.style.cssText = `${base}width:${diameter}px;height:${diameter}px;border-radius:50%;background:${color};opacity:${0.65 + fraction * 0.35}`;
      this.root.innerHTML = "";
    } else {
      this.root.style.cssText = `${base}width:${size}px;height:${size}px;opacity:${0.65 + fraction * 0.35}`;
      const gap = size * 0.2 * (1 - fraction * 0.5), arm = size / 2 - gap;
      this.root.innerHTML = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([x, y]) => {
        const horizontal = x !== 0;
        const left = size / 2 + x! * (gap + arm / 2) - (horizontal ? arm / 2 : 1.5);
        const top = size / 2 + y! * (gap + arm / 2) - (horizontal ? 1.5 : arm / 2);
        return `<i style="position:absolute;left:${left}px;top:${top}px;width:${horizontal ? arm : 3}px;height:${horizontal ? 3 : arm}px;background:${color}"></i>`;
      }).join("");
    }
  }
}
