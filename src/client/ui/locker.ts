import type { Locker } from "../../shared/api.ts";
import { CATALOG, COSMETIC_CATEGORIES, isFree, type Cosmetic, type CosmeticCategory, type Loadout } from "../../shared/cosmetics.ts";
import { lineupMap } from "../../shared/maps/fixtures/lineup.ts";
import { buyWithInk, ensureAccount, fetchLocker, fetchShopConfig, saveLoadout, startCheckout } from "../account.ts";
import { paidShopAllowed } from "../platform/platform.ts";
import type { CharacterRig } from "../render/characters/CharacterRig.ts";
import { createMotion } from "../render/characters/pose.ts";
import { Renderer } from "../render/Renderer.ts";
import { loadName } from "../settings.ts";
import { installMenuStyles } from "./menu.ts";
import { escapeHtml } from "./profile.ts";

const SLOT_FOR: Record<CosmeticCategory, keyof Loadout> = { bow: "bow", trail: "trail", outfit: "outfit", effect: "effect" };
const TAB_LABELS: Record<CosmeticCategory, string> = { bow: "Bows", trail: "Trails", outfit: "Outfits", effect: "Kill effects" };
const SPIN_RAD_PER_S = 0.55;
const PREVIEW_EVERY_MS = 1600;
const CHECKOUT_POLL_MS = 3000;
const CHECKOUT_POLL_LIMIT = 60;

export type LockerTestHooks = { look(): Loadout; select(id: string): void; locker(): Locker | undefined; effects(): { trails: number; trailPoints: number; bursts: number }; freeze(): void };

const STYLE = `.bowdle-locker{position:absolute;top:0;right:0;bottom:0;width:min(470px,100%);box-sizing:border-box;padding:18px 18px 28px;overflow:auto;background:#efe3c6ee;border-left:3px solid #4a3527;color:#4a3527;font-family:'Gochi Hand',cursive;z-index:10}
.bowdle-locker h2{font:42px 'Permanent Marker';margin:0}.bowdle-locker .ink{font-size:24px;color:#8a5a12;margin:2px 0 10px}
.bowdle-locker .tabs,.bowdle-locker .teams{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.bowdle-locker .tabs button,.bowdle-locker .teams button{font:20px 'Gochi Hand';padding:4px 12px;border:2px solid #4a3527;background:#fffaf0;color:#4a3527;cursor:pointer}
.bowdle-locker button[aria-pressed=true]{background:#e3b23c}
.bowdle-locker .item{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;margin:8px 0;padding:8px 10px;border:2px dashed #4a352788;cursor:pointer;background:#fffaf0aa}
.bowdle-locker .item[data-selected=true]{border:3px solid #d2531f;background:#fffaf0}
.bowdle-locker .item b{font-size:22px}.bowdle-locker .item small{grid-column:1/2;font-size:17px}
.bowdle-locker .item button{grid-row:1/3;grid-column:2;font:19px 'Gochi Hand';padding:6px 12px;border:2px solid #4a3527;background:#efe3c6;color:#4a3527;cursor:pointer;box-shadow:3px 3px 0 #d2531f;white-space:nowrap}
.bowdle-locker .item button:disabled{box-shadow:none;opacity:.6;cursor:default}
.bowdle-locker .status{min-height:24px;font-size:19px;color:#d2531f}
.bowdle-locker .back{display:block;margin:14px 0 0;font:24px 'Gochi Hand';padding:6px 22px;border:3px solid #4a3527;background:#efe3c6;color:#4a3527;cursor:pointer;box-shadow:4px 4px 0 #d2531f}`;

function priceLabel(item: Cosmetic): string {
  if ("ink" in item.price) return `${item.price.ink} Ink`;
  if ("sku" in item.price) return `$${item.price.usd.toFixed(2)}`;
  if ("level" in item.price) return `Unlocks at level ${item.price.level}`;
  return "Free";
}

/** The locker: a rotating explorer on the left, the catalog on the right. */
export function startLocker(app: HTMLElement): void {
  installMenuStyles(app);
  const style = document.createElement("style"); style.textContent = STYLE; app.append(style);
  const renderer = new Renderer(app, false, lineupMap);
  renderer.setViewmodelVisible(false);
  const narrow = window.innerWidth < 760;
  // The panel covers the right third on wide screens, so the explorer stands left of the camera axis.
  const rigX = narrow ? 0 : -1.1;
  renderer.setTestCamera(0, 1.3, 2.5, 0, 0.95, 0);

  let kind: "sun" | "moon" = "sun";
  let locker: Locker | undefined;
  let level = 1;
  let preview: Loadout = { bow: "bow.default", trail: "trail.default", outfit: "outfit.default", effect: "effect.default" };
  let tab: CosmeticCategory = "bow";
  let paid = false;
  let status = "";
  let rig: CharacterRig = renderer.addShowcase(kind, rigX, 0, 0, Math.PI, { ...createMotion(), drawing: false }, preview);

  const panel = document.createElement("section");
  panel.className = "bowdle-locker";
  panel.dataset.testid = "locker";
  app.append(panel);

  const restyle = (): void => { rig = renderer.restyleShowcase(rig, kind, { bow: preview.bow, outfit: preview.outfit }); };

  const owns = (item: Cosmetic): boolean => isFree(item) || (locker?.owned.includes(item.id) ?? false);

  const draw = (): void => {
    const items = CATALOG.filter((item) => item.category === tab);
    const equipped = locker?.loadout[SLOT_FOR[tab]];
    panel.innerHTML = `<h2>Locker</h2>
      <div class="ink" data-testid="locker-ink">${locker ? `${locker.ink} Ink` : "Offline: preview only"}</div>
      <div class="teams">${(["sun", "moon"] as const).map((team) => `<button data-team="${team}" aria-pressed="${team === kind}">${team === "sun" ? "Sun crew" : "Moon crew"}</button>`).join("")}</div>
      <div class="tabs">${COSMETIC_CATEGORIES.map((category) => `<button data-tab="${category}" aria-pressed="${category === tab}">${TAB_LABELS[category]}</button>`).join("")}</div>
      <div class="status" data-testid="locker-status">${escapeHtml(status)}</div>
      ${items.map((item) => {
        const selected = preview[SLOT_FOR[tab]] === item.id;
        let action = "";
        if (item.id === equipped) action = `<button disabled>Equipped</button>`;
        else if (owns(item)) action = `<button data-equip="${item.id}"${locker ? "" : " disabled"}>Equip</button>`;
        else if ("level" in item.price) action = `<button disabled>${priceLabel(item)}</button>`;
        else if ("ink" in item.price) action = `<button data-buy="${item.id}"${locker && locker.ink >= item.price.ink ? "" : " disabled"}>Buy ${priceLabel(item)}</button>`;
        else if ("sku" in item.price && paid) action = `<button data-checkout="${item.price.sku}">Buy ${priceLabel(item)}</button>`;
        else action = `<button disabled>Web store only</button>`;
        const hint = "level" in item.price && !owns(item) ? `<small>Your level: ${level} / ${item.price.level}</small>` : "";
        return `<div class="item" data-item="${item.id}" data-selected="${selected}"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.blurb)}</small>${hint}${action}</div>`;
      }).join("")}
      <button class="back" data-action="back">Back to camp</button>`;
  };

  const refresh = async (): Promise<void> => { locker = await fetchLocker() ?? locker; draw(); };

  panel.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest("button");
    if (button?.dataset.action === "back") { location.search = ""; return; }
    if (button?.dataset.team) { kind = button.dataset.team as "sun" | "moon"; restyle(); draw(); return; }
    if (button?.dataset.tab) { tab = button.dataset.tab as CosmeticCategory; draw(); return; }
    if (button?.dataset.equip) {
      const saved = await saveLoadout({ [SLOT_FOR[tab]]: button.dataset.equip });
      if (saved && locker) locker = { ...locker, loadout: saved };
      status = saved ? "Equipped. It shows in your next match." : "Could not reach camp.";
      draw(); return;
    }
    if (button?.dataset.buy) {
      const result = await buyWithInk(button.dataset.buy);
      if (result?.ok) { locker = result.locker; status = "Bought. Equip it when you are ready."; }
      else status = result?.reason === "poor" ? "Not enough Ink yet. Matches pay Ink." : "That purchase did not go through.";
      draw(); return;
    }
    if (button?.dataset.checkout) {
      const checkout = await startCheckout(button.dataset.checkout);
      if ("error" in checkout) {
        status = checkout.error === "link_required" ? "Save your progress with Discord or Google in Profile first, so the purchase stays yours." : "The store is not answering. Try again soon.";
        draw(); return;
      }
      window.open(checkout.url, "_blank", "noopener");
      status = "Finish the payment in the new tab. Your item appears here when it clears.";
      draw();
      const before = locker?.owned.length ?? 0;
      for (let attempt = 0; attempt < CHECKOUT_POLL_LIMIT; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, CHECKOUT_POLL_MS));
        const next = await fetchLocker();
        if (next && next.owned.length !== before) { locker = next; status = "Payment cleared. Enjoy the new gear."; draw(); break; }
      }
      return;
    }
    const card = target.closest<HTMLElement>("[data-item]");
    if (card?.dataset.item) {
      preview = { ...preview, [SLOT_FOR[tab]]: card.dataset.item };
      if (tab === "bow" || tab === "outfit") restyle();
      draw();
    }
  });
  window.addEventListener("keydown", (event) => { if (event.key === "Escape") location.search = ""; });

  let lastMs = performance.now();
  // Tests freeze the preview arrow mid-flight so a slow software renderer can still capture the trail.
  let frozen = false;
  let nextPreviewMs = lastMs + 400;
  let flight: { visual: ReturnType<Renderer["spawnArrowVisual"]>; sim: { x: number; y: number; z: number; vx: number; vy: number; vz: number; damage: number; ageMs: number; stuck: boolean }; endMs: number } | undefined;
  const loop = (timeMs: number): void => {
    const dt = Math.min(0.05, Math.max(0, (timeMs - lastMs) / 1000)); lastMs = timeMs;
    rig.rotation.y += dt * SPIN_RAD_PER_S;
    if (timeMs >= nextPreviewMs) {
      nextPreviewMs = timeMs + PREVIEW_EVERY_MS;
      if (tab === "trail" && !flight) {
        const sim = { x: rigX - 1.8, y: 1.2, z: 0.7, vx: 6, vy: 1.4, vz: 0, damage: 0, ageMs: 0, stuck: false };
        flight = { visual: renderer.spawnArrowVisual(sim, "arrow", preview.trail), sim, endMs: timeMs + 1200 };
      }
      if (tab === "effect") {
        if (!renderer.spawnKillEffect(preview.effect, kind === "sun" ? 0 : 1, rigX + 0.8, 0, -0.4, Math.floor(timeMs), timeMs)) {
          renderer.addInkSplat(rigX + 0.8, -0.2, -0.4, kind === "sun" ? 0 : 1, Math.floor(timeMs));
        }
      }
    }
    if (flight && !frozen) {
      flight.sim.x += flight.sim.vx * dt; flight.sim.y += flight.sim.vy * dt; flight.sim.vy -= 2.5 * dt;
      renderer.updateArrowVisual(flight.visual, flight.sim);
      if (timeMs >= flight.endMs) { renderer.removeVisual(flight.visual); flight = undefined; }
    }
    renderer.render(timeMs);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  draw();
  void (async () => {
    paid = paidShopAllowed() && (await fetchShopConfig()).paid;
    level = (await ensureAccount(loadName() || "Explorer"))?.progress.level ?? 1;
    await refresh();
    if (locker) { preview = { ...locker.loadout }; restyle(); draw(); }
  })();

  const params = new URLSearchParams(location.search);
  if (params.has("test")) {
    const hooks: LockerTestHooks = {
      look: () => ({ ...preview }),
      select: (id: string) => { panel.querySelector<HTMLElement>(`[data-item="${id}"]`)?.click(); },
      locker: () => locker,
      effects: () => renderer.effectCounts(),
      freeze: () => { frozen = true; },
    };
    window.__bowdleTest = { snapshot: () => renderer.snapshot(), stats: () => renderer.stats(), cameraAt: (x, y, z, lx, ly, lz) => renderer.setTestCamera(x, y, z, lx, ly, lz), locker: hooks };
  }
}
