import type { MatchState } from "../../net/schema.ts";
import type { KillMessage, MatchEndMessage } from "../../net/messages.ts";
import { GRAPPLE_COOLDOWN_MS, INK_CLOUD_COOLDOWN_MS } from "../../shared/constants.ts";

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

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.innerHTML = `<div class="bowdle-score"></div><div class="bowdle-timer"></div><div class="bowdle-feed" data-testid="kill-feed"></div><div class="bowdle-marker">✕</div><div class="bowdle-damage"></div><div class="bowdle-scoreboard"></div><div class="bowdle-center"></div><div class="bowdle-moment"></div><div class="bowdle-abilities" data-testid="ability-cooldowns"></div>`;
    this.root.style.cssText = "position:absolute;inset:0;pointer-events:none;color:#233c9b;font-family:'Gochi Hand',cursive;text-shadow:1px 1px #f3eedf";
    const style = document.createElement("style");
    style.textContent = `.bowdle-score{position:absolute;top:18px;left:50%;transform:translateX(-50%);font:36px 'Permanent Marker';letter-spacing:8px}.bowdle-timer{position:absolute;top:62px;left:50%;transform:translateX(-50%);font-size:22px}.bowdle-feed{position:absolute;right:24px;top:28px;text-align:right;font-size:22px}.bowdle-feed div{margin:5px;padding:4px 9px;background:#f3eedfcc;border-bottom:2px solid #233c9b}.bowdle-marker{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:46px;color:#d1382f;opacity:0}.bowdle-damage{position:absolute;left:50%;top:50%;width:220px;height:220px;margin:-110px;border:12px solid transparent;border-top-color:#d1382f;border-radius:50%;opacity:0}.bowdle-scoreboard{display:none;position:absolute;left:50%;top:16%;transform:translateX(-50%);min-width:520px;padding:22px;background:#f3eedfee;border:4px solid #233c9b;font-size:22px;white-space:pre}.bowdle-center{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);text-align:center;font:42px 'Permanent Marker';white-space:pre}.bowdle-moment{position:absolute;left:50%;top:22%;transform:translateX(-50%) rotate(-2deg);font:52px 'Permanent Marker';color:#d1382f;opacity:0}.bowdle-abilities{position:absolute;left:24px;bottom:24px;display:flex;gap:12px;font:22px 'Permanent Marker'}.bowdle-ability{width:112px;padding:9px;background:#f3eedfdd;border:3px solid #233c9b;transform:rotate(-1deg)}.bowdle-ability.ready{border-color:#f08a24;color:#d1382f}`;
    container.append(style, this.root);
    this.score = this.root.querySelector(".bowdle-score")!; this.timer = this.root.querySelector(".bowdle-timer")!;
    this.feed = this.root.querySelector(".bowdle-feed")!; this.marker = this.root.querySelector(".bowdle-marker")!;
    this.damage = this.root.querySelector(".bowdle-damage")!; this.scoreboard = this.root.querySelector(".bowdle-scoreboard")!; this.center = this.root.querySelector(".bowdle-center")!;
    this.moment = this.root.querySelector(".bowdle-moment")!;
    this.abilities = this.root.querySelector(".bowdle-abilities")!;
    window.addEventListener("keydown", (event) => { if (event.code === "Tab") { event.preventDefault(); this.scoreboard.style.display = "block"; } });
    window.addEventListener("keyup", (event) => { if (event.code === "Tab") this.scoreboard.style.display = "none"; });
  }

  update(state: MatchState, sessionId: string, serverNow: number): void {
    this.score.textContent = `${state.scoreRed}  —  ${state.scoreGreen}`;
    const seconds = Math.max(0, Math.ceil((state.phaseEndsAtMs - serverNow) / 1000));
    this.timer.textContent = state.phase === "warmup" ? `DRAW IN ${seconds}` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    let board = "RED                         GREEN\n";
    for (const [id, player] of state.players) board += `${player.team === 0 ? "●" : "                         ●"} ${player.name}  ${player.kills}/${player.deaths}/${player.assists}${id === sessionId ? "  YOU" : ""}\n`;
    this.scoreboard.textContent = board;
    const me = state.players.get(sessionId);
    if (me) this.abilities.innerHTML = `${this.ability("E", "GRAPPLE", me.grappleCooldownMs, GRAPPLE_COOLDOWN_MS)}${this.ability("Q", "INK CLOUD", me.inkCooldownMs, INK_CLOUD_COOLDOWN_MS)}`;
    if (state.phase === "end") return;
    this.center.textContent = me && !me.alive ? `INKED!\nBack in ${Math.ceil(Math.max(0, me.respawnAtMs - serverNow) / 1000)}` : "";
  }

  hit(headshot: boolean): void { this.marker.textContent = headshot ? "HEADSHOT!" : "✕"; this.flash(this.marker); }
  damaged(fromX: number, fromZ: number): void { this.damage.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(fromZ, fromX)}rad)`; this.flash(this.damage); }
  kill(message: KillMessage, names: ReadonlyMap<string, string>): void {
    const row = document.createElement("div"); row.textContent = `${names.get(message.killer) ?? message.killer}  ${message.weapon === "arrow" ? "➳" : "🗡"}  ${names.get(message.victim) ?? message.victim}${message.headshot ? "  HEADSHOT" : ""}`;
    this.feed.prepend(row); while (this.feed.childElementCount > 5) this.feed.lastElementChild?.remove();
  }
  end(message: MatchEndMessage, names: ReadonlyMap<string, string>): void { this.center.textContent = `${message.winner.toUpperCase()} ${message.winner === "draw" ? "" : "WINS"}\nMVP: ${names.get(message.mvp) ?? message.mvp}`; }
  banner(text: string): void { this.moment.textContent = text; this.moment.animate([{ opacity: 0, transform: "translateX(-50%) scale(.7) rotate(-5deg)" }, { opacity: 1, transform: "translateX(-50%) scale(1.08) rotate(2deg)" }, { opacity: 0 }], { duration: 1800 }); }
  setReplay(active: boolean): void { this.center.style.visibility = active ? "hidden" : "visible"; }
  feedText(): string { return this.feed.textContent ?? ""; }
  private ability(key: string, label: string, remaining: number, total: number): string { const ready = remaining <= 0; return `<div class="bowdle-ability${ready ? " ready" : ""}">${key} · ${label}<br>${ready ? "READY" : `${(remaining / 1000).toFixed(1)}s`}<div style="height:3px;background:#f08a24;width:${Math.round((1 - remaining / total) * 100)}%"></div></div>`; }
  private flash(element: HTMLElement): void { element.animate([{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 500 }); }
}
