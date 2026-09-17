import type { MatchState } from "../../net/schema.ts";
import { EXPEDITION } from "../../shared/constants.ts";
import { isBossWave } from "../../shared/sim/waves.ts";
import { keyLabel, loadSettings } from "../settings.ts";

export const MODIFIER_NAMES: Record<string, string> = { none: "", swarm: "Swarm", heavy: "Heavy", night: "Night", lowGravity: "Low Gravity" };

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** A downed teammate close enough to revive, and how far the revive has come (0 to 1). */
export type ReviveView = { name: string; progress: number } | null;

/** Expedition overlays: the wave line, the Colossus health bar, the downed screen and the revive prompt. */
export class ExpeditionHud {
  private readonly root = document.createElement("div");
  private readonly wave = document.createElement("div");
  private readonly boss = document.createElement("div");
  private readonly bossFill = document.createElement("div");
  private readonly downed = document.createElement("div");
  private readonly revive = document.createElement("div");

  constructor(container: HTMLElement) {
    this.root.className = "bowdle-expedition";
    this.wave.dataset.testid = "wave";
    this.boss.dataset.testid = "boss-bar";
    this.downed.dataset.testid = "downed";
    this.revive.dataset.testid = "revive-prompt";
    this.boss.innerHTML = "<span>TEMPLE COLOSSUS</span>";
    this.boss.append(this.bossFill);
    this.root.append(this.wave, this.boss, this.downed, this.revive);
    const style = document.createElement("style");
    style.textContent = `.bowdle-expedition{position:absolute;inset:0;pointer-events:none;color:#4a3527;font-family:'Gochi Hand',cursive;text-shadow:1px 1px #efe3c6}
.bowdle-expedition [data-testid=wave]{position:absolute;top:18px;left:50%;transform:translateX(-50%);font:30px 'Permanent Marker';letter-spacing:3px;white-space:nowrap;text-align:center}
.bowdle-expedition [data-testid=wave] small{display:block;font:20px 'Gochi Hand';letter-spacing:0}
.bowdle-expedition [data-testid=boss-bar]{display:none;position:absolute;top:92px;left:50%;transform:translateX(-50%) rotate(-0.5deg);width:min(520px,70vw);padding:4px 8px 8px;background:#efe3c6dd;border:3px solid #4a3527;text-align:center;font:18px 'Permanent Marker'}
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
    if (state.phase === "warmup") this.wave.innerHTML = `EXPEDITION<small>${run.startWave > 0 ? `Starting after wave ${run.startWave}` : "Get ready"}</small>`;
    else if (run.phase === "break") this.wave.innerHTML = `${run.wave === run.startWave ? "FIRST WAVE" : `WAVE ${run.wave} CLEARED`}<small>Next wave in ${Math.max(0, Math.ceil((run.phaseEndsAtMs - serverNow) / 1000))}${isBossWave(run.wave + 1) ? " · the Colossus wakes" : ""}${lives}</small>`;
    else if (run.phase === "fight") this.wave.innerHTML = `WAVE ${run.wave}${modifier ? ` · ${modifier.toUpperCase()}` : ""}<small>${run.left} left${lives}</small>`;
    else this.wave.innerHTML = `RUN OVER<small>Reached wave ${run.wave}</small>`;
    let boss: { hp: number; maxHp: number } | undefined;
    for (const creature of state.creatures.values()) if (creature.kind === "colossus") { boss = creature; break; }
    this.boss.style.display = boss ? "block" : "none";
    if (boss) this.bossFill.style.width = `${Math.max(0, Math.round(boss.hp / boss.maxHp * 100))}%`;
    if (me?.downed) {
      this.downed.style.display = "block";
      this.downed.innerHTML = `YOU ARE DOWN<small>Crawl to a teammate · ${Math.max(0, Math.ceil(me.downedMs / 1000))} s</small><div class="bowdle-revive-bar"><div style="width:${Math.round(Math.min(1, me.reviveMs / EXPEDITION.reviveMs) * 100)}%"></div></div>`;
    } else if (me && !me.alive && run.phase !== "over") {
      this.downed.style.display = "block";
      this.downed.innerHTML = "OUT FOR THIS WAVE<small>You are back at the next break</small>";
    } else this.downed.style.display = "none";
    this.revive.style.display = revive ? "block" : "none";
    if (revive) this.revive.innerHTML = `Hold ${keyLabel(loadSettings().keys.use)} to revive ${escapeHtml(revive.name)}<div class="bowdle-revive-bar"><div style="width:${Math.round(revive.progress * 100)}%"></div></div>`;
  }

  text(): string { return this.wave.textContent ?? ""; }
}
