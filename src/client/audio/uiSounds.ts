import { SoundEffects } from "./sfx.ts";

/** Hover plays at most this often, so sweeping across a menu does not buzz. */
const HOVER_GAP_MS = 80;

/** Soft click and hover sounds for every button and link in the menus. */
export function attachUiSounds(root: Document = document): void {
  const sounds = new SoundEffects();
  let lastHover = 0;
  root.addEventListener("click", (event) => {
    if ((event.target as Element | null)?.closest?.("button, a")) sounds.play("click");
  });
  root.addEventListener("pointerover", (event) => {
    const target = (event.target as Element | null)?.closest?.("button, a");
    const now = performance.now();
    if (!target || now - lastHover < HOVER_GAP_MS) return;
    lastHover = now;
    sounds.play("hover");
  });
}
