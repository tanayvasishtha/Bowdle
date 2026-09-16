import { expect, test, type Page } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

type GrappleApi = {
  sessionId: string;
  grappleActive(): boolean;
  grappleReeling(): boolean;
  ropeSnaps(): number;
  showRopeCut(message: { cutter: string; owner: string; x: number; y: number; z: number }): void;
};
type Hook = "grappleActive" | "grappleReeling" | "ropeSnaps";
const call = <T>(page: Page, name: Hook): Promise<T> =>
  page.evaluate((hook) => (window as unknown as { __bowdleTest: Record<string, () => unknown> }).__bowdleTest[hook]!(), name) as Promise<T>;

test("the grapple reels while held, swings when let go, and snaps when cut", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=online&test&map=canopy");
  await page.waitForFunction(() => "__bowdleTest" in window);
  const peer = await page.context().newPage();
  await peer.goto("/?scene=online&test&map=canopy");
  await peer.waitForFunction(() => "__bowdleTest" in window);
  await page.bringToFront();
  await page.locator("#game-canvas").click();
  await expect.poll(async () => page.locator(".bowdle-timer").textContent(), { timeout: 8_000 }).not.toContain("DRAW IN");

  await page.evaluate(() => (window as unknown as { __bowdleTest: { aimAtGrapple(minDistance: number): void } }).__bowdleTest.aimAtGrapple(8));
  await page.keyboard.down("e");
  await expect.poll(() => call(page, "grappleActive")).toBe(true);
  expect(await call(page, "grappleReeling")).toBe(true);
  await page.keyboard.up("e");
  await expect.poll(() => call(page, "grappleReeling")).toBe(false);
  expect(await call(page, "grappleActive")).toBe(true);
  await expect(page.locator(".bowdle-ability").first()).toContainText("SWINGING");
  await page.screenshot({ path: "test-results/qa/g3/swing.png" });
  const me = await page.evaluate(() => (window as unknown as { __bowdleTest: GrappleApi }).__bowdleTest.sessionId);
  // Best effort side view for review: only when the other player has the rope in its state already.
  await peer.bringToFront();
  const seen = await peer.evaluate((id) => {
    const hooks = (window as unknown as { __bowdleTest: { players(): Array<{ id: string; x: number; y: number; z: number; grapple?: number[] }>; cameraAt(x: number, y: number, z: number, lx: number, ly: number, lz: number): void } }).__bowdleTest;
    const swinger = hooks.players().find((player) => player.id === id);
    if (!swinger?.grapple) return false;
    // Look past the swinger along the rope, from a little behind and above.
    const [anchorX, anchorY, anchorZ] = swinger.grapple as [number, number, number];
    const dx = anchorX - swinger.x, dz = anchorZ - swinger.z, length = Math.hypot(dx, dz) || 1;
    hooks.cameraAt(swinger.x - dx / length * 2.5 - dz / length * 1.2, swinger.y + 2.6, swinger.z - dz / length * 2.5 + dx / length * 1.2, (swinger.x + anchorX) / 2, (swinger.y + 1.6 + anchorY) / 2, (swinger.z + anchorZ) / 2);
    return true;
  }, me);
  if (seen) { await peer.waitForTimeout(300); await peer.screenshot({ path: "test-results/qa/g3/swing-side.png" }); }
  await page.bringToFront();

  // Cut the rope the way the server announces a cut. A cut only splits a rope a frame has drawn, and it hides
  // the rope for a moment, so tries are spaced out; if the swing has ended, attach again first.
  const attach = async (): Promise<void> => {
    await expect.poll(async () => (await page.locator(".bowdle-ability").first().textContent())?.includes("READY"), { timeout: 8_000 }).toBe(true);
    await page.evaluate(() => (window as unknown as { __bowdleTest: { aimAtGrapple(minDistance: number): void } }).__bowdleTest.aimAtGrapple(8));
    await page.keyboard.down("e");
    await expect.poll(() => call(page, "grappleActive")).toBe(true);
    await page.keyboard.up("e");
  };
  let snaps = 0;
  for (let attempt = 0; attempt < 6 && snaps === 0; attempt += 1) {
    if (!(await call<boolean>(page, "grappleActive"))) await attach();
    await page.waitForTimeout(400);
    snaps = await page.evaluate((owner) => {
      const hooks = (window as unknown as { __bowdleTest: GrappleApi }).__bowdleTest;
      hooks.showRopeCut({ cutter: "someone", owner, x: 0, y: 8, z: 0 });
      return hooks.ropeSnaps();
    }, me);
  }
  expect(snaps).toBe(1);
  await expect(page.locator(".bowdle-moment")).toContainText("ROPE CUT");
  await page.screenshot({ path: "test-results/qa/g3/snap.png" });
  await expect.poll(() => call(page, "ropeSnaps"), { timeout: 3_000 }).toBe(0);
  expect(errors).toEqual([]);
});
