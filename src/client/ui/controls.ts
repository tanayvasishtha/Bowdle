import { ACTION_LABELS, ACTIONS, keyLabel, loadSettings } from "../settings.ts";
import { firstPad } from "../game/gamepad.ts";

const OVERLAY_KEY = "F1";

/**
 * F1 shows every control with its current key, at any time in a match or the camp.
 * While the mouse is not captured, a small hint says how to aim again.
 */
export function attachControlsHelp(container: HTMLElement, canvas: HTMLCanvasElement): void {
  const overlay = document.createElement("section");
  overlay.className = "bowdle-controls";
  overlay.dataset.testid = "controls-overlay";
  overlay.style.cssText = "position:absolute;right:24px;top:90px;display:none;grid-template-columns:auto auto;gap:4px 18px;padding:14px 20px;background:#efe3c6f2;border:4px solid #4a3527;color:#4a3527;font:18px 'Gochi Hand';z-index:9;pointer-events:none";
  const hint = document.createElement("div");
  hint.className = "bowdle-aim-hint";
  hint.dataset.testid = "aim-hint";
  hint.textContent = "Click to play";
  hint.style.cssText = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:18px 36px;background:#efe3c6f2;border:4px solid #4a3527;color:#4a3527;font:36px 'Permanent Marker';pointer-events:none;z-index:7;box-shadow:6px 6px 0 #d2531f";
  container.append(overlay, hint);

  const render = (): void => {
    const keys = loadSettings().keys;
    overlay.innerHTML = `<b style="grid-column:1/3;font:22px 'Permanent Marker'">Controls</b>`
      + ACTIONS.map((action) => `<span>${ACTION_LABELS[action]}</span><b>${keyLabel(keys[action])}</b>`).join("")
      + `<span>Next or previous arrow</span><b>Mouse wheel</b><span>This list</span><b>${OVERLAY_KEY}</b>`;
  };
  window.addEventListener("keydown", (event) => {
    if (event.code !== OVERLAY_KEY) return;
    event.preventDefault();
    const open = overlay.style.display === "none";
    if (open) render();
    overlay.style.display = open ? "grid" : "none";
  });
  const updateHint = (): void => {
    const pauseOpen = [...container.querySelectorAll<HTMLElement>(".bowdle-pause,.bowdle-settings,.bowdle-course-done")].some((panel) => panel.style.display !== "none");
    // Pad players never capture the mouse, so they do not need the hint.
    hint.style.display = document.pointerLockElement === canvas || pauseOpen || firstPad() ? "none" : "block";
  };
  document.addEventListener("pointerlockchange", updateHint);
  window.setInterval(updateHint, 500);
  updateHint();
}
