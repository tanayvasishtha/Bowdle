export type TutorialEvent = "move" | "jump" | "slide" | "shoot10" | "stab";

const EVENTS: readonly TutorialEvent[] = ["move", "jump", "slide", "shoot10", "stab"];
const PROMPTS = ["WASD · move through camp", "SPACE · jump", "Run + C · slide", "Hold, then release · shoot the 10 m target", "V · stab a target"] as const;
const STORAGE_KEY = "bowdle.practice.complete";

export class PracticeTutorial {
  private readonly root: HTMLDivElement;
  private step = 0;
  private active: boolean;

  constructor(container: HTMLElement) {
    this.active = localStorage.getItem(STORAGE_KEY) !== "yes";
    this.root = document.createElement("div"); this.root.className = "bowdle-tutorial";
    this.root.style.cssText = "position:absolute;left:50%;top:8%;transform:translateX(-50%) rotate(-1deg);padding:14px 24px;background:#efe3c6ee;border:4px solid #4a3527;color:#4a3527;font:28px 'Permanent Marker';text-align:center;pointer-events:auto;z-index:8";
    this.root.innerHTML = `<span></span><button style="display:block;margin:8px auto 0;border:0;background:none;color:#d2531f;font:18px 'Gochi Hand';cursor:pointer">skip field lesson</button>`;
    this.root.querySelector("button")!.addEventListener("click", () => this.finish());
    container.append(this.root); this.render();
  }

  observe(event: TutorialEvent): void {
    if (!this.active || EVENTS[this.step] !== event) return;
    this.step += 1; if (this.step >= EVENTS.length) this.finish(); else this.render();
  }

  private render(): void { this.root.style.display = this.active ? "block" : "none"; this.root.querySelector("span")!.textContent = PROMPTS[this.step] ?? ""; }
  private finish(): void { this.active = false; localStorage.setItem(STORAGE_KEY, "yes"); this.render(); }
}
