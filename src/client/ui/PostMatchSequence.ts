import type { MatchStatsMessage, RewardMessage } from "../../net/messages.ts";
import { END_SCREEN_MS, TIME_UNITS } from "../../shared/constants.ts";
import { MEDALS } from "../../shared/medals.ts";
import { challengeReward } from "../../shared/challenges.ts";
import { cosmeticById } from "../../shared/cosmetics.ts";
import { saveLoadout } from "../account.ts";
import { RETENTION_LOOK as L } from "../render/look.ts";

type CountRow = { node: HTMLElement; frames: string[] };
type MedalRow = { node: HTMLElement; atMs: number };
type ChallengeRow = { bar: HTMLProgressElement; before: number; after: number };
const SLOTS = { bow: "bow", trail: "trail", outfit: "outfit", effect: "effect" } as const;

export class PostMatchSequence {
  private readonly panel: HTMLElement;
  private readonly medalList: HTMLElement;
  private readonly rewards: HTMLElement;
  private readonly xp = document.createElement("div");
  private readonly xpFill = document.createElement("div");
  private readonly level = document.createElement("p");
  private readonly unlocks = document.createElement("div");
  private readonly challenges = document.createElement("div");
  private readonly countdownLine = document.createElement("p");
  private footer: HTMLElement | undefined;
  private startedMs = 0;
  private rewardAtMs = 0;
  private raf = 0;
  private skipped = false;
  private hasReward = false;
  private lastSecond = -1;
  private lastFrame = -1;
  private readonly medals: MedalRow[] = [];
  private readonly rows: CountRow[] = [];
  private readonly challengeRows: ChallengeRow[] = [];
  private xpFrames: string[] = [];

  constructor(panel: HTMLElement, medals: HTMLElement, rewards: HTMLElement) {
    this.panel = panel; this.medalList = medals; this.rewards = rewards;
    this.xp.className = "postmatch-xp"; this.xp.dataset.testid = "postmatch-xp"; this.xpFill.dataset.testid = "postmatch-xp-fill";
    this.xp.append(this.xpFill); this.level.dataset.testid = "level-flash";
    this.unlocks.dataset.testid = "unlocks"; this.challenges.dataset.testid = "challenge-changes";
    this.countdownLine.dataset.testid = "next-expedition";
    panel.addEventListener("click", () => this.skip());
  }

  begin(footer: HTMLElement): void {
    this.stop(); this.footer = footer; this.startedMs = performance.now(); this.skipped = false; this.hasReward = false;
    this.lastFrame = -1; this.lastSecond = -1; this.medals.length = 0; this.rows.length = 0; this.challengeRows.length = 0;
    this.xpFrames = []; this.level.textContent = ""; this.unlocks.replaceChildren(); this.challenges.replaceChildren();
    this.xp.hidden = true; this.level.hidden = true; this.unlocks.hidden = true; this.challenges.hidden = true; footer.hidden = true;
    this.panel.dataset.sequence = "playing";
    this.panel.insertBefore(this.xp, footer); this.panel.insertBefore(this.level, footer); this.panel.insertBefore(this.unlocks, footer); this.panel.insertBefore(this.challenges, footer);
    footer.append(this.countdownLine); this.countdown(Math.ceil(END_SCREEN_MS / TIME_UNITS.msPerSecond)); this.kick();
  }

  stats(message: MatchStatsMessage): void {
    this.medals.length = 0; this.medalList.replaceChildren();
    for (let index = 0; index < message.medals.length; index += 1) {
      const node = document.createElement("li"); node.textContent = MEDALS.find((entry) => entry.id === message.medals[index])?.name ?? message.medals[index]!;
      node.hidden = !this.skipped; this.medalList.append(node); this.medals.push({ node, atMs: L.medalStartMs + index * L.medalStepMs });
    }
    this.kick();
  }

  reward(message: RewardMessage): void {
    this.hasReward = true; this.rewardAtMs = performance.now() - this.startedMs; this.rows.length = 0; this.challengeRows.length = 0; this.lastFrame = -1;
    this.rewards.replaceChildren();
    const total = document.createElement("span"); this.rewards.append(total);
    const frames: string[] = [];
    const progress = message.levelSize > 0 ? `${message.intoLevel} / ${message.levelSize} XP` : "top level";
    for (let frame = 0; frame <= L.countSteps; frame += 1) {
      const fraction = frame / L.countSteps;
      frames.push(`+${Math.round(message.xp * fraction)} XP · +${Math.round(message.ink * fraction)} Ink · ${message.levelUp ? `LEVEL UP! Level ${message.level}` : `Level ${message.level}`} (${progress})`);
    }
    this.rows.push({ node: total, frames });
    const list = document.createElement("ul"); this.rewards.append(list);
    for (const line of message.breakdown.filter((entry) => entry.xp !== 0 || entry.ink !== 0)) {
      const node = document.createElement("li"); const values: string[] = [];
      for (let frame = 0; frame <= L.countSteps; frame += 1) values.push(`${line.label}: +${Math.round(line.xp * frame / L.countSteps)} XP · +${Math.round(line.ink * frame / L.countSteps)} Ink`);
      list.append(node); this.rows.push({ node, frames: values });
    }
    const oldPercent = !message.levelUp && message.before.levelSize > 0 ? message.before.intoLevel / message.before.levelSize : 0;
    const newPercent = message.levelSize > 0 ? Math.min(1, message.intoLevel / message.levelSize) : 1;
    this.xpFrames = [];
    for (let frame = 0; frame <= L.countSteps; frame += 1) this.xpFrames.push(`${(oldPercent + (newPercent - oldPercent) * frame / L.countSteps) * L.percent}%`);
    this.level.textContent = message.levelUp ? `LEVEL ${message.level}` : `Level ${message.level}`;
    this.level.className = message.levelUp ? "postmatch-level-up" : "";
    this.unlocks.replaceChildren();
    for (const id of message.unlocked) {
      const item = cosmeticById(id); if (!item) continue;
      const card = document.createElement("article"); card.dataset.unlock = id;
      const title = document.createElement("strong"); title.textContent = item.name;
      const equip = document.createElement("button"); equip.textContent = "Equip";
      equip.addEventListener("click", async () => { equip.disabled = true; const saved = await saveLoadout({ [SLOTS[item.category]]: id }); equip.textContent = saved ? "Equipped" : "Camp offline"; equip.disabled = !!saved; });
      card.append(title, equip); this.unlocks.append(card);
    }
    this.challenges.replaceChildren();
    for (const change of message.challenges) {
      const row = document.createElement("div"); const label = document.createElement("span"); const payout = challengeReward(change.id);
      label.textContent = `${change.text}: ${change.before} → ${change.after}/${change.target}${change.done ? ` Done · +${payout.ink} Ink +${payout.xp} XP` : ""}`;
      const bar = document.createElement("progress"); bar.max = change.target; bar.value = change.before;
      row.append(label, bar); this.challenges.append(row); this.challengeRows.push({ bar, before: change.before, after: change.after });
    }
    if (this.footer) this.footer.hidden = !this.skipped;
    this.kick();
  }

  countdown(seconds: number): void {
    if (seconds === this.lastSecond) return;
    this.lastSecond = seconds; this.countdownLine.textContent = `Next expedition in ${seconds} s`;
  }
  skip(): void { this.skipped = true; this.render(performance.now()); this.stop(); }
  stop(): void { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  private kick(): void { if (this.skipped) { this.render(performance.now()); return; } if (!this.raf) this.raf = requestAnimationFrame(this.tick); }
  private readonly tick = (now: number): void => {
    this.raf = 0;
    if (!this.panel.isConnected || this.panel.style.display === "none") return;
    if (!this.render(now)) this.raf = requestAnimationFrame(this.tick);
  };
  private render(now: number): boolean {
    const elapsed = now - this.startedMs;
    const final = this.skipped || elapsed >= END_SCREEN_MS - L.footerMs;
    const medalEnd = L.medalStartMs + this.medals.length * L.medalStepMs;
    const rewardStart = Math.max(medalEnd, this.rewardAtMs);
    const countProgress = final ? 1 : Math.max(0, Math.min(1, (elapsed - rewardStart) / L.breakdownMs));
    const frame = Math.round(countProgress * L.countSteps);
    for (let index = 0; index < this.medals.length; index += 1) this.medals[index]!.node.hidden = !final && elapsed < this.medals[index]!.atMs;
    if (frame !== this.lastFrame) {
      this.lastFrame = frame;
      for (let index = 0; index < this.rows.length; index += 1) this.rows[index]!.node.textContent = this.rows[index]!.frames[frame]!;
    }
    const xpStart = rewardStart + L.breakdownMs;
    const xpProgress = final ? 1 : Math.max(0, Math.min(1, (elapsed - xpStart) / L.xpMs));
    if (this.hasReward) {
      this.xp.hidden = !final && elapsed < xpStart;
      this.xpFill.style.width = this.xpFrames[Math.round(xpProgress * L.countSteps)]!;
      this.level.hidden = xpProgress < 1; this.unlocks.hidden = xpProgress < 1;
      const challengeProgress = final ? 1 : Math.max(0, Math.min(1, (elapsed - xpStart - L.xpMs) / L.challengeMs));
      this.challenges.hidden = !final && elapsed < xpStart + L.xpMs;
      for (let index = 0; index < this.challengeRows.length; index += 1) { const row = this.challengeRows[index]!; row.bar.value = row.before + (row.after - row.before) * challengeProgress; }
    }
    const footerAt = this.hasReward ? xpStart + L.xpMs + L.challengeMs + L.footerMs : medalEnd + L.footerMs;
    const finished = final || elapsed >= footerAt;
    if (this.footer) this.footer.hidden = !finished;
    if (finished) this.panel.dataset.sequence = "complete";
    return finished;
  }
}
