/** Ask the browser for the mouse. Chrome rejects the promise when capture is not allowed
 *  (an embedded preview, a hidden tab). Swallow that so the console stays clean, and surface
 *  a one-line message when the lock itself fails after a click. */
export function lockPointer(target: HTMLCanvasElement | null | undefined): void {
  if (!target) return;
  const result: unknown = target.requestPointerLock();
  if (result instanceof Promise) {
    result.catch(() => {
      showPointerLockMessage();
    });
  }
}

function showPointerLockMessage(): void {
  if (document.querySelector("[data-testid=pointer-lock-error]")) return;
  const note = document.createElement("div");
  note.dataset.testid = "pointer-lock-error";
  note.textContent = "Could not capture the mouse. Click the game again, or leave fullscreen apps that are holding it.";
  note.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:420px;padding:10px 16px;background:#efe3c6;border:3px solid #4a3527;color:#4a3527;font:20px 'Gochi Hand',cursive;z-index:40;text-align:center";
  document.body.append(note);
  window.setTimeout(() => note.remove(), 5000);
}

if (typeof document !== "undefined") {
  document.addEventListener("pointerlockerror", () => {
    showPointerLockMessage();
  });
}
