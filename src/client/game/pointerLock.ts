/** Chrome rejects the pointer lock promise when the page is not allowed to capture the mouse
 *  (an embedded preview, a hidden tab). Swallow it so the console stays clean. */
export function lockPointer(target: HTMLCanvasElement | null | undefined): void {
  if (!target) return;
  const result: unknown = target.requestPointerLock();
  if (result instanceof Promise) result.catch(() => undefined);
}
