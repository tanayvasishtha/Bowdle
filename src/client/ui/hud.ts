import { lockPointer } from "../game/pointerLock.ts";
import type { MatchState } from "../../net/schema.ts";
import type { KillMessage, MatchEndMessage, MatchStatsMessage, RewardMessage } from "../../net/messages.ts";
import { HIT_FEEL as HIT, HUD_END_MAX_HEIGHT_VH, RETENTION_LOOK as L } from "../render/look.ts";
import { DODGE, GRAPPLE_COOLDOWN_MS, INK_CLOUD_COOLDOWN_MS, KILL_FEEDBACK, MEDAL_LIMITS } from "../../shared/constants.ts";
import type { KillFeedback } from "../../shared/killFeedback.ts";
import { PostMatchSequence } from "./PostMatchSequence.ts";
import type { MapData } from "../../shared/maps/types.ts";
import { loadSettings } from "../settings.ts";

type EndStats = { kills: number; deaths: number; bestShot: number; bestStreak?: number };

export type HudActions = {
  /** Runs before the end screen closes, for example a portal ad break. */
  playAgain?: () => Promise<void>;
  saveClip?: () => Promise<boolean>;
  shareUrl?: (text: string) => string;
  newMatch?: () => Promise<void>;
};

export class MatchHud {
  private readonly root: HTMLDivElement;
  private readonly score: HTMLDivElement;
  private readonly timer: HTMLDivElement;
  private readonly feed: HTMLDivElement;
  private readonly marker: HTMLDivElement;
  private readonly damage: HTMLDivElement;
  private readonly scoreboard: HTMLDivElement;
  private readonly center: HTMLDivElement;
  private readonly moment: HTMLDivElement;
  private readonly abilities: HTMLDivElement;
  private readonly endPanel: HTMLDivElement;
  private readonly rewardLine = Object.assign(document.createElement("p"), { className: "bowdle-rewards" });
  private readonly medalList = Object.assign(document.createElement("ul"), { className: "bowdle-medals" });
  private readonly onVote: (mapId: string) => void;
  private readonly actions: HudActions;
  private readonly sequence: PostMatchSequence;
  private readonly ticker = document.createElement("div");
  private readonly streakLine = document.createElement("div");
  private readonly tipLine = document.createElement("div");
  private readonly objectiveMark = document.createElement("div");
  private endedStreak = 0;
  private summaryLine: HTMLElement | undefined;
  private summaryMvp = "";
  /** Test hook: keeps the end screen open outside the end phase. */
  endPinned = false;

  constructor(container: HTMLElement, onVote: (mapId: string) => void, actions: HudActions = {}) {
    this.onVote = onVote;
    this.actions = actions;
    this.root = document.createElement("div");
    this.root.innerHTML = `<div class="bowdle-score"></div><div class="bowdle-timer"></div><div class="bowdle-feed" data-testid="kill-feed"></div><div class="bowdle-marker">✕</div><div class="bowdle-damage"></div><div class="bowdle-scoreboard"></div><div class="bowdle-center"></div><div class="bowdle-moment"></div><div class="bowdle-abilities" data-testid="ability-cooldowns"></div><div class="bowdle-end"></div>`;
    this.root.style.cssText = "position:absolute;inset:0;pointer-events:none;color:#4a3527;font-family:'Gochi Hand',cursive;text-shadow:1px 1px #efe3c6";
    const style = document.createElement("style");
    style.textContent = `.bowdle-score{position:absolute;top:18px;left:50%;transform:translateX(-50%);font:36px 'Permanent Marker';letter-spacing:8px}.bowdle-timer{position:absolute;top:62px;left:50%;transform:translateX(-50%);font-size:22px}.bowdle-feed{position:absolute;right:24px;top:28px;text-align:right;font-size:22px}.bowdle-feed div{margin:5px;padding:4px 9px;background:#efe3c6cc;border-bottom:2px solid #4a3527}.bowdle-marker{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:46px;color:#d2531f;opacity:0}.bowdle-marker.kill{font-size:64px;color:#4a3527}.bowdle-marker.kill.head{color:#e3b23c}.bowdle-dmg{position:absolute;font:26px 'Permanent Marker';color:#4a3527;pointer-events:none;-webkit-text-stroke:1px #efe3c6;opacity:0}.bowdle-dmg.head{color:#e3b23c;font-size:32px}.bowdle-damage{position:absolute;left:50%;top:50%;width:220px;height:220px;margin:-110px;border:12px solid transparent;border-top-color:#d2531f;border-radius:50%;opacity:0}.bowdle-scoreboard{display:none;position:absolute;left:50%;top:16%;transform:translateX(-50%);min-width:520px;padding:22px;background:#efe3c6ee;border:4px solid #4a3527;font-size:22px;white-space:pre}.bowdle-center{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);text-align:center;font:42px 'Permanent Marker';white-space:pre}.bowdle-moment{position:absolute;left:50%;top:22%;transform:translateX(-50%) rotate(-2deg);font:52px 'Permanent Marker';color:#d2531f;opacity:0}.bowdle-abilities{position:absolute;left:24px;bottom:24px;display:flex;gap:12px;font:22px 'Permanent Marker'}.bowdle-ability{width:112px;padding:9px;background:#efe3c6dd;border:3px solid #4a3527;transform:rotate(-1deg)}.bowdle-ability.ready{border-color:#e3b23c;color:#d2531f}.bowdle-end{display:none;position:absolute;left:50%;top:48%;transform:translate(-50%,-50%) rotate(-1deg);min-width:420px;padding:24px;background:#efe3c6f5;border:5px solid #4a3527;text-align:center;pointer-events:auto}.bowdle-end h2{font:46px 'Permanent Marker';margin:0}.bowdle-end p{font-size:24px}.bowdle-end button{margin:7px;padding:8px 18px;border:3px solid #4a3527;background:#fffaf0;color:#4a3527;font:22px 'Gochi Hand';cursor:pointer}.bowdle-end-extras a{display:inline-block;margin:7px;padding:8px 18px;border:3px solid #4a3527;background:#fffaf0;color:#4a3527;font:22px 'Gochi Hand';text-decoration:none}.bowdle-end .play-again{display:block;margin:20px auto 4px;font:30px 'Permanent Marker';background:#e3b23c}`;
    container.append(style, this.root);
    this.score = this.root.querySelector(".bowdle-score")!; this.timer = this.root.querySelector(".bowdle-timer")!;
    this.feed = this.root.querySelector(".bowdle-feed")!; this.marker = this.root.querySelector(".bowdle-marker")!;
    this.damage = this.root.querySelector(".bowdle-damage")!; this.scoreboard = this.root.querySelector(".bowdle-scoreboard")!; this.center = this.root.querySelector(".bowdle-center")!;
    this.moment = this.root.querySelector(".bowdle-moment")!;
    this.abilities = this.root.querySelector(".bowdle-abilities")!;
    this.endPanel = this.root.querySelector(".bowdle-end")!;
    this.endPanel.style.maxHeight = `${HUD_END_MAX_HEIGHT_VH}vh`;
    this.endPanel.style.overflowY = "auto";
    this.endPanel.style.boxSizing = "border-box";
    this.sequence = new PostMatchSequence(this.endPanel, this.medalList, this.rewardLine);
    this.ticker.className = "bowdle-xp-ticker"; this.ticker.dataset.testid = "xp-ticker";
    this.streakLine.className = "bowdle-streak"; this.streakLine.dataset.testid = "kill-streak";
    this.root.append(this.ticker, this.streakLine, this.tipLine);
    this.tipLine.dataset.testid = "tip";
    this.objectiveMark.dataset.testid = "objective";
    this.objectiveMark.textContent = "◆ RELIC";
    this.objectiveMark.style.cssText = "position:absolute;display:none;transform:translate(-50%,-100%);font:20px 'Permanent Marker';color:#8a5a12;text-shadow:1px 1px #efe3c6;pointer-events:none";
    this.root.append(this.objectiveMark);
    this.tipLine.style.cssText = "position:absolute;top:96px;left:50%;transform:translateX(-50%);padding:4px 14px;background:#efe3c6dd;border:2px dashed #4a3527;font:20px 'Gochi Hand';display:none";
    style.textContent += `.bowdle-xp-ticker{position:absolute;right:${L.tickerRightPx}px;bottom:${L.tickerBottomPx}px;font-size:${L.bodyPx}px;text-align:right}.bowdle-xp-ticker>div{animation:xp-ticker-fade ${L.tickerFadeMs}ms forwards}.bowdle-streak{position:absolute;left:${L.streakLeftPx}px;bottom:${L.streakBottomPx}px;font-size:${L.bodyPx}px;color:#d2531f}.bowdle-end{min-width:0;width:min(${L.panelWidthVw}vw,${L.panelWidthPx}px)}.bowdle-end p,.bowdle-end li{font-size:${L.bodyPx}px;margin:${L.gapPx}px}.bowdle-medals{display:flex;justify-content:center;gap:${L.gapPx}px;flex-wrap:wrap;list-style:none;padding:0}.bowdle-medals li{border-bottom:solid #e3b23c}.postmatch-xp{height:${L.bodyPx}px;background:#fffaf0;border:solid #4a3527;overflow:hidden}.postmatch-xp>div{height:100%;background:#e3b23c;transition:width ${L.transitionMs}ms linear}.postmatch-level-up{color:#d2531f;animation:postmatch-flash ${L.xpMs}ms}.bowdle-end article{display:inline-flex;align-items:center;border:solid #e3b23c;margin:${L.gapPx}px;padding:${L.gapPx}px}.bowdle-end progress{display:block;margin:auto}.bowdle-end [hidden]{display:none!important}@keyframes xp-ticker-fade{from{opacity:1}to{opacity:0}}@keyframes postmatch-flash{from{opacity:0}to{opacity:1}}`;
    window.addEventListener("keydown", (event) => { if (event.code === loadSettings().keys.scoreboard) { event.preventDefault(); this.scoreboard.style.display = "block"; } });
    style.textContent += `.bowdle-xp-ticker>div{animation-duration:${L.transitionMs}ms;animation-delay:${L.tickerFadeMs}ms}.bowdle-medals li{animation:postmatch-flash ${L.transitionMs}ms}`;
    style.textContent += `.bowdle-end[data-sequence=complete] .postmatch-xp>div{transition:none}.bowdle-end[data-sequence=complete] .postmatch-level-up,.bowdle-end[data-sequence=complete] .bowdle-medals li{animation:none;opacity:1}`;
    window.addEventListener("keyup", (event) => { if (event.code === loadSettings().keys.scoreboard) this.scoreboard.style.display = "none"; });
  }

  update(state: MatchState, sessionId: string, serverNow: number): void {
    const freeForAll = state.mode === "ffa";
    const mine = state.players.get(sessionId);
    this.score.textContent = freeForAll ? `YOU ${mine?.kills ?? 0}  ·  BEST ${state.scoreSun}` : `${state.mode === "relic" ? "◆ " : ""}${state.scoreSun}  ·  ${state.scoreMoon}`;
    const seconds = Math.max(0, Math.ceil((state.phaseEndsAtMs - serverNow) / 1000));
    this.timer.textContent = state.phase === "warmup" ? `DRAW IN ${seconds}` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    let board = freeForAll ? "FREE FOR ALL\n" : "SUN                         MOON\n";
    const rows = [...state.players].sort(([, left], [, right]) => freeForAll ? right.kills - left.kills : 0);
    for (const [id, player] of rows) board += `${freeForAll ? "◯" : player.team === 0 ? "●" : "                         ●"} ${player.name}  ${player.kills}/${player.deaths}/${player.assists}${player.relicCarrier ? "  ◆" : ""}${id === sessionId ? "  YOU" : ""}\n`;
    this.scoreboard.textContent = board;
    const me = state.players.get(sessionId);
    if (me) this.abilities.innerHTML = `${this.ability("E", "GRAPPLE", me.grappleCooldownMs, GRAPPLE_COOLDOWN_MS, me.grappleActive ? (me.grappleReeling ? "REELING" : "SWINGING") : "")}${this.ability("Q", "INK CLOUD", me.inkCooldownMs, INK_CLOUD_COOLDOWN_MS)}${this.ability("SHIFT", "DODGE", me.dodgeCooldownMs, DODGE.cooldownMs)}`;
    if (state.phase === "end" || this.endPinned) { this.sequence.countdown(seconds); return; }
    this.sequence.stop();
    this.endPanel.style.display = "none";
    this.center.textContent = me && !me.alive ? `INKED!\n${this.endedStreak >= MEDAL_LIMITS.onARoll ? `Streak ended at ${this.endedStreak}\n` : ""}Back in ${Math.ceil(Math.max(0, me.respawnAtMs - serverNow) / 1000)}` : "";
  }

  hit(headshot: boolean): void { this.marker.textContent = headshot ? "HEADSHOT!" : "✕"; this.marker.classList.remove("kill"); this.flash(this.marker); }

  /** A number that rises from where the arrow landed, gold for headshots. */
  damageNumber(x: number, y: number, damage: number, headshot: boolean): void {
    if (!loadSettings().damageNumbers) return;
    const number = document.createElement("div");
    number.className = headshot ? "bowdle-dmg head" : "bowdle-dmg";
    number.dataset.testid = "damage-number";
    number.textContent = String(Math.round(damage));
    number.style.left = `${x + HIT.damageNumberOffsetX}px`; number.style.top = `${y + HIT.damageNumberOffsetY}px`;
    this.root.append(number);
    number.animate([{ transform: "translate(-50%,-50%)", opacity: 1 }, { transform: `translate(-50%,calc(-50% - ${HIT.damageNumberRisePx}px))`, opacity: 0 }], { duration: HIT.damageNumberMs, easing: "ease-out" }).finished.then(() => number.remove(), () => number.remove());
  }

  /** The crosshair flashes a bold mark on a kill, gold for a headshot kill. */
  killConfirm(headshot: boolean): void {
    this.marker.textContent = "✕";
    this.marker.classList.add("kill");
    this.marker.classList.toggle("head", headshot);
    this.marker.animate([{ opacity: 1, transform: "translate(-50%,-50%) scale(1.5)" }, { opacity: 0, transform: "translate(-50%,-50%) scale(1)" }], { duration: HIT.killConfirmMs });
  }
  damaged(fromX: number, fromZ: number): void { this.damage.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(fromZ, fromX)}rad)`; this.flash(this.damage); }
  kill(message: KillMessage, names: ReadonlyMap<string, string>): void {
    const row = document.createElement("div"); row.textContent = `${names.get(message.killer) ?? message.killer}  ${message.weapon === "arrow" ? "➳" : message.weapon === "boulder" ? "●" : message.weapon === "fall" ? "↓" : "🗡"}  ${names.get(message.victim) ?? message.victim}${message.headshot ? "  HEADSHOT" : ""}`;
    this.feed.prepend(row); while (this.feed.childElementCount > 5) this.feed.lastElementChild?.remove();
  }
  end(message: MatchEndMessage, names: ReadonlyMap<string, string>, stats: EndStats, maps: readonly MapData[]): void {
    this.center.textContent = ""; this.endPanel.replaceChildren(); this.endPanel.style.display = "block";
    const title = document.createElement("h2"); title.textContent = message.winner === "draw" ? "Draw in the dust" : message.winner === "player" ? `${(names.get(message.mvp) ?? "A player").toUpperCase()} WINS` : `${message.winner.toUpperCase()} WINS`;
    const summary = document.createElement("p"); summary.textContent = `${stats.kills} kills · ${stats.deaths} deaths · best shot ${Math.round(stats.bestShot)} m · best streak ${stats.bestStreak ?? 0}\nMVP: ${names.get(message.mvp) ?? message.mvp}`;
    const scores = document.createElement("p"); scores.textContent = this.score.textContent;
    this.summaryLine = summary; this.summaryMvp = names.get(message.mvp) ?? message.mvp;
    const footer = document.createElement("div"); footer.dataset.testid = "postmatch-footer";
    const vote = document.createElement("p"); vote.textContent = "Vote for the next expedition";
    this.rewardLine.textContent = ""; this.rewardLine.dataset.testid = "rewards";
    this.medalList.replaceChildren(); this.medalList.dataset.testid = "medals";
    this.endPanel.append(title, scores, summary, this.medalList, this.rewardLine, footer); footer.append(vote);
    for (const map of maps) { const button = document.createElement("button"); button.textContent = map.name; button.addEventListener("click", () => { this.onVote(map.id); button.textContent = `✓ ${map.name}`; }); footer.append(button); }
    const extras = document.createElement("div"); extras.className = "bowdle-end-extras";
    if (this.actions.saveClip) {
      const save = document.createElement("button"); save.textContent = "Save clip"; save.dataset.action = "save-clip";
      save.addEventListener("click", async () => { save.disabled = true; save.textContent = "Saving…"; const saved = await this.actions.saveClip!(); save.textContent = saved ? "Clip saved" : "No clip yet"; save.disabled = false; });
      extras.append(save);
    }
    if (this.actions.shareUrl) {
      const share = document.createElement("a"); share.textContent = "Share on X"; share.dataset.action = "share"; share.target = "_blank"; share.rel = "noopener";
      share.href = this.actions.shareUrl(message.winner === "draw" ? `Drew a Bowdle match with ${stats.kills} kills.` : `${stats.kills} kills and a ${Math.round(stats.bestShot)} m best shot in Bowdle.`);
      extras.append(share);
    }
    if (extras.childElementCount > 0) footer.append(extras);
    const again = document.createElement("button"); again.className = "play-again"; again.textContent = "Play again";
    again.addEventListener("click", async () => {
      again.disabled = true;
      await this.actions.playAgain?.();
      again.disabled = false;
      this.endPinned = false;
      this.sequence.stop();
      this.endPanel.style.display = "none"; lockPointer(document.querySelector<HTMLCanvasElement>("#game-canvas"));
    });
    const fresh = document.createElement("button"); fresh.textContent = "New match"; fresh.dataset.action = "new-match";
    fresh.addEventListener("click", () => { void this.actions.newMatch?.(); });
    footer.append(again, fresh); this.sequence.begin(footer);
  }
  /** Rewards arrive just after the end screen, once the server has stored them. */
  rewards(reward: RewardMessage): void {
    this.sequence.reward(reward);
  }
  matchStats(message: MatchStatsMessage): void {
    this.sequence.stats(message);
    if (this.summaryLine) this.summaryLine.textContent = `${message.stats.kills} kills · ${message.stats.deaths} deaths · best shot ${Math.round(message.stats.longestShotM)} m · best streak ${message.stats.bestStreak}\nMVP: ${this.summaryMvp}`;
  }
  feedback(result: KillFeedback): void {
    this.streakLine.textContent = result.streak >= KILL_FEEDBACK.streakVisible ? `Streak ${result.streak}` : "";
    this.endedStreak = result.endedAt;
    for (const line of result.ticker) this.tickerLine(line);
    if (result.banner) this.banner(result.banner);
  }
  tickerLine(text: string): void { const row = document.createElement("div"); row.textContent = text; this.ticker.append(row); while (this.ticker.childElementCount > KILL_FEEDBACK.tickerLines) this.ticker.firstElementChild?.remove(); }
  /** Relic Run: a marker over the relic while it is on screen; null hides it. */
  objective(point: { x: number; y: number } | null): void {
    this.objectiveMark.style.display = point ? "block" : "none";
    if (point) { this.objectiveMark.style.left = `${point.x}px`; this.objectiveMark.style.top = `${point.y}px`; }
  }

  /** A new-player hint that fades after a few seconds. */
  tip(text: string): void {
    this.tipLine.textContent = text;
    this.tipLine.style.display = "block";
    this.tipLine.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: 6000 }).finished.then(() => { this.tipLine.style.display = "none"; }, () => undefined);
  }
  resetFeedback(): void { this.streakLine.textContent = ""; this.ticker.replaceChildren(); this.endedStreak = 0; }
  banner(text: string): void { for (const animation of this.moment.getAnimations()) animation.cancel(); this.moment.textContent = text; this.moment.animate([{ opacity: 0, transform: "translateX(-50%) scale(.7) rotate(-5deg)" }, { opacity: 1, transform: "translateX(-50%) scale(1.08) rotate(2deg)" }, { opacity: 0 }], { duration: L.bannerMs }); }
  setReplay(active: boolean): void { this.center.style.visibility = active ? "hidden" : "visible"; }
  feedText(): string { return this.feed.textContent ?? ""; }
  private ability(key: string, label: string, remaining: number, total: number, active = ""): string { const ready = remaining <= 0; return `<div class="bowdle-ability${ready ? " ready" : ""}">${key} · ${label}<br>${active || (ready ? "READY" : `${(remaining / 1000).toFixed(1)}s`)}<div style="height:3px;background:#e3b23c;width:${Math.round((1 - remaining / total) * 100)}%"></div></div>`; }
  private flash(element: HTMLElement): void { element.animate([{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 500 }); }
}
