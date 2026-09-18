import { test, type Page } from "@playwright/test";

// Font requests fail without internet (Codex cloud). That is expected and harmless.
const IGNORED_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const source = `${message.location().url} ${message.text()}`;
    if (IGNORED_HOSTS.some((host) => source.includes(host))) return;
    errors.push(message.text());
  });
  return errors;
}

/**
 * Starts the page as a returning player so the first-launch flow (name, then field course) stays out of the way.
 * With keepCourse the course is still unfinished, so Practice Camp starts it; a saved name skips the first-launch prompt instead.
 */
export async function returningPlayer(page: Page, keepCourse = false): Promise<void> {
  await page.addInitScript((keep) => {
    if (keep) { if (!localStorage.getItem("bowdle.name")) localStorage.setItem("bowdle.name", "Returning"); }
    else localStorage.setItem("bowdle.course.done", "yes");
    // Skip LEFT-F3 first-launch benchmark so menu e2e is not racing a 5s sample.
    try {
      const key = "bowdle.settings.v1";
      const current = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
      localStorage.setItem(key, JSON.stringify({ ...current, graphicsBenchmarked: true, graphicsPreset: current.graphicsPreset ?? "medium" }));
    } catch { /* ignore */ }
  }, keepCourse);
}

/** Fresh profile that already skipped the graphics benchmark (for smoke / home). */
export async function skipGraphicsBenchmark(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      const key = "bowdle.settings.v1";
      const current = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
      localStorage.setItem(key, JSON.stringify({ ...current, graphicsBenchmarked: true, graphicsPreset: current.graphicsPreset ?? "medium" }));
    } catch { /* ignore */ }
  });
}

/**
 * An online test scene in a room of its own. Test rooms are matched by map, so without a key a test could join a room
 * an earlier test left behind. Pages of the same test share the key and meet in one room.
 */
export function onlineUrl(query: string): string {
  const info = test.info();
  return `/?scene=online&test&${query}&room=${encodeURIComponent(`${info.testId}-${info.repeatEachIndex}-${info.retry}`)}`;
}
