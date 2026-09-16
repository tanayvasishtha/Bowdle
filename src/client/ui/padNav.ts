import { firstPad, menuActions, type MenuPadAction } from "../game/gamepad.ts";
import { loadSettings } from "../settings.ts";

const FOCUSABLE = "button:not([disabled]), input, select, [tabindex]:not([tabindex='-1'])";
const BACK = "[data-action=back], [data-action=close], [data-action=done], [data-action=resume]";
const REPEAT_MS = 220;

function visible(element: HTMLElement): boolean {
  return element.offsetParent !== null && getComputedStyle(element).visibility !== "hidden";
}

/** The panel the pad should work in: the last opened panel that is showing. During play there is none. */
function scope(): HTMLElement | null {
  const panels = [...document.querySelectorAll<HTMLElement>(".bowdle-panel, .bowdle-course-done, .bowdle-menu")].filter(visible);
  return panels.at(-1) ?? null;
}

/**
 * Lets a gamepad drive menus, settings, the locker and the pause panel while the mouse is free:
 * D-pad or stick moves focus (left and right nudge sliders), A presses, B goes back.
 * During play, with no panel open, the pad belongs to the game.
 */
export function attachPadNavigation(): void {
  const style = document.createElement("style");
  style.textContent = ":focus-visible{outline:3px solid #d2531f!important;outline-offset:3px}";
  document.head.append(style);
  const held = new Map<MenuPadAction, number>();
  const step = (now: number): void => {
    requestAnimationFrame(step);
    if (document.pointerLockElement || !scope()) { held.clear(); return; }
    const actions = menuActions(firstPad());
    for (const action of [...held.keys()]) if (!actions.has(action)) held.delete(action);
    for (const action of actions) {
      const last = held.get(action);
      if (last !== undefined && now - last < REPEAT_MS) continue;
      if (last === undefined || action !== "select" && action !== "back") { held.set(action, now); act(action); }
    }
  };
  requestAnimationFrame(step);
}

function act(action: MenuPadAction): void {
  const root = scope();
  if (!root) return;
  const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
  if (items.length === 0) return;
  const active = document.activeElement instanceof HTMLElement && items.includes(document.activeElement) ? document.activeElement : null;
  if (action === "select") { active?.click(); return; }
  if (action === "back") {
    const back = root.querySelector<HTMLElement>(BACK);
    if (back && visible(back)) back.click();
    else window.dispatchEvent(new KeyboardEvent("keydown", { code: loadSettings().keys.menu }));
    return;
  }
  if (active instanceof HTMLInputElement && active.type === "range" && (action === "left" || action === "right")) {
    if (action === "left") active.stepDown(); else active.stepUp();
    active.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  const index = active ? items.indexOf(active) : -1;
  const next = action === "up" || action === "left" ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length;
  items[next]!.focus({ focusVisible: true } as FocusOptions);
}
