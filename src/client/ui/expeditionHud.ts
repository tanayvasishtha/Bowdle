import type { MatchState } from "../../net/schema.ts";
import { EXPEDITION } from "../../shared/constants.ts";
import { isBossWave } from "../../shared/sim/waves.ts";
import { VILLAGE_UPGRADES, type VillageUpgradeId } from "../../shared/sim/villageDefense.ts";
import { keyLabel, loadSettings } from "../settings.ts";

export const MODIFIER_NAMES: Record<string, string> = {
  none: "", swarm: "Swarm", heavy: "Heavy", night: "Night", lowGravity: "Low Gravity",
};

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** A downed teammate close enough to revive, and how far the revive has come (0 to 1). */
export type ReviveView = { name: string; progress: number } | null;

export type ShopPick = (upgradeId: string) => void;

/** Village Defense overlays: wave, totem, coins, shop, boss bar, downed, revive. */
export class ExpeditionHud {
  private readonly root = document.createElement("div");
  private readonly wave = document.createElement("div");
  private readonly totem = document.createElement("div");
  private readonly totemFill = document.createElement("div");
  private readonly coins = document.createElement("div");
  private readonly shop = document.createElement("div");
  private readonly boss = document.createElement("div");
  private readonly bossFill = document.createElement("div");
  private readonly downed = document.createElement("div");
  private readonly revive = document.createElement("div");
  private readonly onPick: ShopPick;

  constructor(container: HTMLElement, onPick: ShopPick = () => {}) {
    this.onPick = onPick;
    this.root.className = "bowdle-expedition";
    this.wave.dataset.testid = "wave";
    this.totem.dataset.testid = "totem-bar";
    this.coins.dataset.testid = "coins";
    this.shop.dataset.testid = "village-shop";
    this.boss.dataset.testid = "boss-bar";
    this.downed.dataset.testid = "downed";
    this.revive.dataset.testid = "revive-prompt";
    this.totem.innerHTML = "<span>VILLAGE TOTEM</span>";
    this.totem.append(this.totemFill);
    this.boss.innerHTML = "<span>CHIEF</span>";
    this.boss.append(this.bossFill);
    this.root.append(this.wave, this.totem, this.coins, this.shop, this.boss, this.downed, this.revive);
    const style = document.createElement("style");
    style.textContent = `.bowdle-expedition{position:absolute;inset:0;pointer-events:none;color:#4a3527;font-family:'Gochi Hand',cursive;text-shadow:1px 1px #efe3c6}
.bowdle-expedition [data-testid=wave]{position:absolute;top:18px;left:50%;transform:translateX(-50%);font:30px 'Permanent Marker';letter-spacing:3px;white-space:nowrap;text-align:center}
.bowdle-expedition [data-testid=wave] small{display:block;font:20px 'Gochi Hand';letter-spacing:0}
.bowdle-expedition [data-testid=totem-bar]{display:none;position:absolute;top:86px;left:50%;transform:translateX(-50%) rotate(0.4deg);width:min(420px,60vw);padding:4px 8px 8px;background:#efe3c6dd;border:3px solid #4a3527;text-align:center;font:16px 'Permanent Marker'}
.bowdle-expedition [data-testid=totem-bar]>div{height:10px;background:#2f6b4f;border:2px solid #4a3527;transition:width 120ms linear}
.bowdle-expedition [data-testid=coins]{display:none;position:absolute;top:18px;right:18px;padding:4px 12px;background:#efe3c6dd;border:2px solid #4a3527;font:22px 'Permanent Marker'}
.bowdle-expedition [data-testid=village-shop]{display:none;pointer-events:auto;position:absolute;left:50%;bottom:12%;transform:translateX(-50%);gap:10px;padding:10px;background:#efe3c6ee;border:3px solid #4a3527}
.bowdle-expedition [data-testid=village-shop] button{pointer-events:auto;cursor:pointer;min-width:140px;padding:10px 12px;border:2px solid #4a3527;background:#fffaf0;font:18px 'Gochi Hand';color:#4a3527;text-align:left}
.bowdle-expedition [data-testid=village-shop] button small{display:block;font:14px 'Gochi Hand';opacity:0.85}
.bowdle-expedition [data-testid=village-shop] button:disabled{opacity:0.45;cursor:default}
.bowdle-expedition [data-testid=boss-bar]{display:none;position:absolute;top:130px;left:50%;transform:translateX(-50%) rotate(-0.5deg);width:min(520px,70vw);padding:4px 8px 8px;background:#efe3c6dd;border:3px solid #4a3527;text-align:center;font:18px 'Permanent Marker'}
.bowdle-expedition [data-testid=boss-bar]>div{height:12px;background:#d2531f;border:2px solid #4a3527;transition:width 120ms linear}
.bowdle-expedition [data-testid=downed]{display:none;position:absolute;inset:0;background:radial-gradient(transparent 35%,#4a352799);text-align:center;padding-top:30vh;font:44px 'Permanent Marker';white-space:pre-line}
.bowdle-expedition [data-testid=downed] small{display:block;font:24px 'Gochi Hand'}
.bowdle-expedition .bowdle-revive-bar{width:260px;height:12px;margin:10px auto;border:3px solid #4a3527;background:#fffaf0}
.bowdle-expedition .bowdle-revive-bar>div{height:100%;background:#e3b23c}
.bowdle-expedition [data-testid=revive-prompt]{display:none;position:absolute;left:50%;top:60%;transform:translateX(-50%);padding:6px 16px;background:#efe3c6dd;border:2px dashed #4a3527;font-size:24px;text-align:center}`;
    container.append(style, this.root);
  }

  update(state: MatchState, sessionId: string, serverNow: number, revive: ReviveView): void {
    const run = state.expedition, me = state.players.get(sessionId);
    const modifier = MODIFIER_NAMES[run.modifier] ?? "";
    const lives = run.lives > 0 ? `  ·  ♥ ${run.lives}` : "";
    if (state.phase === "warmup") {
      this.wave.innerHTML = `VILLAGE DEFENSE<small>${run.startWave > 0 ? `Starting after wave ${run.startWave}` : "Get ready"}</small>`;
    } else if (run.phase === "break") {
      this.wave.innerHTML = `${run.wave === run.startWave ? "FIRST WAVE" : `WAVE ${run.wave} CLEARED`}<small>Next wave in ${Math.max(0, Math.ceil((run.phaseEndsAtMs - serverNow) / 1000))}${isBossWave(run.wave + 1) ? " · the Chief wakes" : ""}${lives}</small>`;
    } else if (run.phase === "fight") {
      this.wave.innerHTML = `WAVE ${run.wave}${modifier ? ` · ${modifier.toUpperCase()}` : ""}<small>${run.left} left${lives}</small>`;
    } else {
      this.wave.innerHTML = `RUN OVER<small>Reached wave ${run.wave}</small>`;
    }

    const showTotem = run.totemMaxHp > 0 && run.phase !== "over";
    this.totem.style.display = showTotem ? "block" : "none";
    if (showTotem) this.totemFill.style.width = `${Math.max(0, Math.round(run.totemHp / run.totemMaxHp * 100))}%`;

    this.coins.style.display = run.totemMaxHp > 0 ? "block" : "none";
    this.coins.textContent = `${run.coins} coins`;

    const offers = [run.shop0, run.shop1, run.shop2].filter(Boolean) as VillageUpgradeId[];
    const shopOpen = run.phase === "break" && offers.length > 0 && run.wave > run.startWave;
    this.shop.style.display = shopOpen ? "flex" : "none";
    if (shopOpen) {
      this.shop.replaceChildren();
      for (const id of offers) {
        const def = VILLAGE_UPGRADES.find((row) => row.id === id);
        if (!def) continue;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.upgradeId = id;
        btn.disabled = run.coins < def.cost;
        btn.innerHTML = `${escapeHtml(def.name)} · <small>${escapeHtml(def.blurb)}</small>`;
        btn.addEventListener("click", () => this.onPick(id));
        this.shop.append(btn);
      }
    }

    let boss: { hp: number; maxHp: number } | undefined;
    for (const creature of state.creatures.values()) {
      if (creature.kind === "colossus") { boss = creature; break; }
    }
    this.boss.style.display = boss ? "block" : "none";
    if (boss) this.bossFill.style.width = `${Math.max(0, Math.round(boss.hp / boss.maxHp * 100))}%`;

    if (me?.downed) {
      this.downed.style.display = "block";
      this.downed.innerHTML = `YOU ARE DOWN<small>Crawl to a teammate · ${Math.max(0, Math.ceil(me.downedMs / 1000))} s</small><div class="bowdle-revive-bar"><div style="width:${Math.round(Math.min(1, me.reviveMs / EXPEDITION.reviveMs) * 100)}%"></div></div>`;
    } else if (me && !me.alive && run.phase !== "over") {
      this.downed.style.display = "block";
      this.downed.innerHTML = "OUT FOR THIS WAVE<small>You are back at the next break</small>";
    } else {
      this.downed.style.display = "none";
    }

    this.revive.style.display = revive ? "block" : "none";
    if (revive) {
      this.revive.innerHTML = `Hold ${keyLabel(loadSettings().keys.use)} to revive ${escapeHtml(revive.name)}<div class="bowdle-revive-bar"><div style="width:${Math.round(revive.progress * 100)}%"></div></div>`;
    }
  }

  text(): string { return this.wave.textContent ?? ""; }
}
