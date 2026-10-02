/** Ask the browser for the mouse. Chrome rejects the promise when capture is not allowed
 *  (an embedded preview, a hidden tab). Swallow that so the console stays clean, and call
 *  onRefused so the game can fall back to aiming with the free cursor. */
export function lockPointer(target: HTMLCanvasElement | null | undefined, onRefused?: () => void): void {
  if (!target) return;
  if (onRefused) refusedHandler = onRefused;
  const result: unknown = target.requestPointerLock();
  if (result instanceof Promise) result.catch(() => refused());
}

let refusedHandler: (() => void) | undefined;
let messageShown = false;

function refused(): void {
  refusedHandler?.();
  showPointerLockMessage();
}

/** Shown once: after that the free cursor just works and a repeat would cover the screen on every click. */
function showPointerLockMessage(): void {
  if (messageShown) return;
  messageShown = true;
  const note = document.createElement("div");
  note.dataset.testid = "pointer-lock-error";
  note.textContent = "This window cannot lock the mouse, so you aim with the cursor. Push it to the edge to keep turning. Chrome or Edge plays best.";
  note.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:420px;padding:10px 16px;background:#efe3c6;border:3px solid #4a3527;color:#4a3527;font:20px 'Gochi Hand',cursive;z-index:40;text-align:center";
  document.body.append(note);
  window.setTimeout(() => note.remove(), 7000);
}

if (typeof document !== "undefined") {
  document.addEventListener("pointerlockerror", () => refused());
}
