import { QUIVER } from "../../shared/constants.ts";
import { ARROW_SLOTS } from "../../shared/sim/bow.ts";

type QuiverSource = { arrowSlot: number; scatterCharges: number; scatterRechargeMs: number; tetherCooldownMs: number };

const NAMES = { arrow: "BROADHEAD", scatter: "SCATTER", tether: "TETHER" } as const;

/** The quiver strip: one card per arrow slot, the selected one raised, with scatter charges and the tether cooldown. */
export class QuiverStrip {
  readonly root = document.createElement("div");
  private shown = "";

  constructor(container: HTMLElement) {
    this.root.className = "bowdle-quiver";
    this.root.dataset.testid = "quiver";
    const style = document.createElement("style");
    style.textContent = ".bowdle-quiver{position:absolute;left:calc(50% + 70px);bottom:24px;transform:translateX(-50%);display:flex;gap:10px;font:18px 'Permanent Marker';color:#4a3527;pointer-events:none}"
      + ".bowdle-quiver>div{min-width:104px;padding:6px 9px;background:#efe3c6cc;border:3px solid #4a352788;transform:rotate(1deg);text-align:center}"
      + ".bowdle-quiver>div[data-selected=true]{border-color:#d2531f;color:#d2531f;background:#efe3c6f2;transform:translateY(-8px) rotate(-1deg)}"
      + ".bowdle-quiver small{display:block;font:15px 'Gochi Hand'}";
    container.append(style, this.root);
  }

  update(source: QuiverSource): void {
    const cards = ARROW_SLOTS.map((kind, slot) => {
      let detail = "any time";
      if (kind === "scatter") {
        const pips = "●".repeat(source.scatterCharges) + "○".repeat(QUIVER.scatter.charges - source.scatterCharges);
        detail = source.scatterCharges < QUIVER.scatter.charges ? `${pips} ${(source.scatterRechargeMs / 1000).toFixed(0)}s` : pips;
      } else if (kind === "tether") detail = source.tetherCooldownMs > 0 ? `${Math.ceil(source.tetherCooldownMs / 1000)}s` : "full draw";
      return `<div data-slot="${kind}" data-selected="${slot === source.arrowSlot}">${slot + 1} ${NAMES[kind]}<small>${detail}</small></div>`;
    }).join("");
    if (cards === this.shown) return;
    this.shown = cards;
    this.root.innerHTML = cards;
  }

  setVisible(visible: boolean): void { this.root.style.display = visible ? "flex" : "none"; }
}
