import type { InputSampler } from "../game/InputSampler.ts";
import { loadSettings } from "../settings.ts";
import { showSettings } from "./menu.ts";

export function attachPauseMenu(container: HTMLElement, sampler: InputSampler): void {
  const panel = document.createElement("section"); panel.className = "bowdle-panel bowdle-pause"; panel.style.display = "none";
  panel.innerHTML = `<h2>Field Notes</h2><button data-action="resume">Resume</button><button data-action="settings">Settings</button><button data-action="leave">Leave match</button>`;
  container.append(panel);
  const setOpen = (open: boolean): void => {
    panel.style.display = open ? "grid" : "none"; sampler.setPaused(open);
    if (open) document.exitPointerLock(); else void document.querySelector<HTMLCanvasElement>("#game-canvas")?.requestPointerLock();
  };
  panel.querySelector("[data-action=resume]")!.addEventListener("click", () => setOpen(false));
  panel.querySelector("[data-action=settings]")!.addEventListener("click", () => { panel.style.display = "none"; showSettings(container, () => { panel.style.display = "grid"; }); });
  panel.querySelector("[data-action=leave]")!.addEventListener("click", () => { location.href = "/"; });
  window.addEventListener("keydown", (event) => { if (event.code === loadSettings().keys.menu) { event.preventDefault(); setOpen(panel.style.display === "none"); } });
}
