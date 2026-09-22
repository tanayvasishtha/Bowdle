import { expect, test, type Page } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

type CourseState = { active: boolean; index: number; station: string; finished: boolean; skipped: boolean; reward: { granted: boolean; ink: number } | null };
type CourseApi = { courseState(): CourseState; courseSignal(signal: string): void };
// The launch course: move, jump, shoot (src/client/game/course.ts LAUNCH_COURSE).
const SIGNALS = ["reach", "vineHop", "headshot"];
const STATIONS = ["move", "hop", "headshot"];

const state = (page: Page) => page.evaluate(() => (window as unknown as { __bowdleTest: CourseApi }).__bowdleTest.courseState());
const signal = (page: Page, name: string) => page.evaluate((value) => (window as unknown as { __bowdleTest: CourseApi }).__bowdleTest.courseSignal(value), name);

/** Walks every station through the test hook, checking a later station's move never counts early. */
async function walkCourse(page: Page, shots: string): Promise<void> {
  for (let index = 0; index < SIGNALS.length; index += 1) {
    await expect.poll(async () => (await state(page)).station).toBe(STATIONS[index]);
    await expect(page.locator("[data-testid=course]")).toContainText(`${index + 1} / ${SIGNALS.length}`);
    const later = SIGNALS[(index + 1) % SIGNALS.length]!;
    if (later !== SIGNALS[index]) { await signal(page, later); expect((await state(page)).index).toBe(index); }
    if (index === 1) await page.screenshot({ path: `test-results/qa/g5/${shots}-station.png` });
    await signal(page, SIGNALS[index]!);
  }
}

test("the field course can be started by direct route and the reward comes once", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=camp&course=first&test");
  await page.waitForFunction(() => "__bowdleTest" in window);
  await expect(page.locator(".bowdle-course-marker")).toBeVisible();
  await walkCourse(page, "first");
  await expect(page.locator("[data-testid=course-done]")).toContainText("Field course complete");
  await expect(page.locator("[data-testid=course-done]")).toContainText("+100 Ink", { timeout: 30_000 });
  expect((await state(page)).reward).toMatchObject({ granted: true });
  await page.screenshot({ path: "test-results/qa/g5/course-done.png" });

  await page.goto("/?scene=camp&course&test");
  await page.waitForFunction(() => "__bowdleTest" in window);
  await walkCourse(page, "replay");
  await expect(page.locator("[data-testid=course-done]")).toContainText("Reward already collected", { timeout: 15_000 });
  expect((await state(page)).reward).toMatchObject({ granted: false });
  await page.locator("[data-testid=course-done] button").click();
  await expect(page.locator("[data-testid=course-done]")).toHaveCount(0);

  await page.goto("/?scene=camp&course=first&test");
  await page.waitForFunction(() => "__bowdleTest" in window);
  await walkCourse(page, "again");
  await page.locator("[data-testid=course-done] button").click();
  await page.waitForURL(/scene=online/);
  await expect(page.locator(".bowdle-timer")).toBeVisible({ timeout: 15_000 });

  await page.evaluate(() => sessionStorage.removeItem("bowdle.rejoin"));
  await page.goto("/?test");
  await expect(page.locator(".bowdle-menu")).toBeVisible();
  await expect(page.locator(".bowdle-name")).toHaveCount(1);
  await expect(page.locator("[data-action=training]")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the course can be skipped, practice starts without it afterwards, and F1 lists the controls", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=camp&test");
  await page.waitForFunction(() => "__bowdleTest" in window);
  await expect(page.locator("[data-testid=course]")).toBeVisible();
  await expect(page.locator("[data-testid=aim-hint]")).toBeVisible();
  await page.locator("[data-testid=course] button").click();
  expect(await state(page)).toMatchObject({ active: false, finished: true, skipped: true });
  await page.reload();
  await page.waitForFunction(() => "__bowdleTest" in window);
  expect((await state(page)).active).toBe(false);
  await expect(page.locator("[data-testid=course]")).toBeHidden();

  await page.keyboard.press("F1");
  await expect(page.locator("[data-testid=controls-overlay]")).toBeVisible();
  await expect(page.locator("[data-testid=controls-overlay]")).toContainText("Scatter arrows");
  await expect(page.locator("[data-testid=controls-overlay]")).toContainText("Left Shift");
  await page.screenshot({ path: "test-results/qa/g5/controls.png" });
  await page.keyboard.press("F1");
  await expect(page.locator("[data-testid=controls-overlay]")).toBeHidden();
  expect(errors).toEqual([]);
});
