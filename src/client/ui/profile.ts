import type { Profile, Provider } from "../../shared/api.ts";
import { deleteAccount, enabledProviders, ensureAccount, fetchChallenges, fetchLeaderboard, fetchProfile, renameAccount, rerollChallenge, startProviderSignIn , apiBase, loadToken } from "../account.ts";
import type { Challenges, ChallengeState } from "../../shared/challenges.ts";
import { PLAY_STREAK, TIME_UNITS } from "../../shared/constants.ts";
import { cosmeticById } from "../../shared/cosmetics.ts";
import { loadName, nameError, saveName } from "../settings.ts";
import { portalPolicy } from "../platform/platform.ts";

const PROVIDER_LABELS: Record<Provider, string> = { discord: "Discord", google: "Google" };
const CHALLENGE_PERIODS = ["daily", "weekly"] as const;

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function panel(container: HTMLElement, className: string, onClose: () => void): HTMLElement {
  const section = document.createElement("section");
  section.className = `bowdle-panel ${className}`;
  section.innerHTML = `<h2>Loading…</h2>`;
  container.append(section);
  section.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("[data-action=close]")) { section.remove(); onClose(); }
  });
  return section;
}

function progressBar(profile: Profile): string {
  const { level, intoLevel, levelSize } = profile.progress;
  const percent = levelSize > 0 ? Math.round((intoLevel / levelSize) * 100) : 100;
  return `<div class="bowdle-level" data-testid="level">Level ${level}</div>
    <div class="bowdle-xp"><div style="width:${percent}%"></div></div>
    <p class="bowdle-small">${levelSize > 0 ? `${intoLevel} / ${levelSize} XP to level ${level + 1}` : "Top level reached"}</p>`;
}

export async function showProfile(container: HTMLElement, onClose: () => void): Promise<void> {
  const section = panel(container, "bowdle-profile", onClose);
  section.style.alignContent = "start";
  const profile = await fetchProfile() ?? await ensureAccount(loadName() || "Explorer");
  if (!profile) {
    section.innerHTML = `<h2>Field notes offline</h2><p>The camp server is out of reach. You can still play as a guest.</p><button data-action="close">Back</button>`;
    return;
  }
  const providers = await enabledProviders();
  let challenges = await fetchChallenges();
  const unlinked = !portalPolicy().providerSignIn ? [] : providers.filter((provider) => !profile.linked.includes(provider));
  section.innerHTML = `<h2>${escapeHtml(profile.name)}</h2>
    ${progressBar(profile)}
    <p class="bowdle-ink" data-testid="ink">${profile.ink} Ink</p>
    <p class="bowdle-small" data-testid="tier">${profile.tier ? `Ranked: ${escapeHtml(profile.tier)}${profile.placement ? " (placement)" : ""}` : "Ranked: unranked"}</p>
    <p class="bowdle-small">Season ${escapeHtml(profile.season)}: ${profile.seasonKills} kills, ${profile.seasonWins} wins in ${profile.seasonMatches} matches</p>
    <p data-testid="play-streak">Play streak: ${profile.streakDays} days. Tomorrow's bonus: ${PLAY_STREAK.inkPerDay * Math.min(profile.streakDays + 1, PLAY_STREAK.capDays)} Ink</p>
    <p data-testid="career">Career: ${profile.career.matches} matches · ${profile.career.wins} wins (${Math.round((profile.career.winRate ?? 0) * 100)}%) · ${profile.career.kills} kills · ${profile.career.headshots} headshots · best streak ${profile.career.bestStreak} · longest shot ${Math.round(profile.career.longestShotM)} m · favorite map ${escapeHtml(profile.career.favoriteMap ?? "—")} · Expedition best ${profile.career.expeditionBest ?? profile.expeditionBest ?? 0}</p>
    <p data-testid="tier-history">Tier history: ${(profile.career.tierHistory ?? []).length ? (profile.career.tierHistory ?? []).map((entry) => `${escapeHtml(entry.season)} ${escapeHtml(entry.tier)}`).join(" · ") : "none yet"}</p>
    <div data-testid="recent-players" class="bowdle-recent"></div>
    <p data-testid="next-unlock">${profile.nextUnlock ? `Next reward at level ${profile.nextUnlock.level}: ${profile.nextUnlock.itemId ? escapeHtml(cosmeticById(profile.nextUnlock.itemId)!.name) : `${profile.nextUnlock.ink} Ink`}` : "All level rewards earned"}</p>
    <div data-testid="challenges"></div>
    <label>Explorer name <input data-field="name" maxlength="16" value="${escapeHtml(profile.name)}"></label><div class="bowdle-error"></div>
    <button data-action="rename">Save name</button>
    ${profile.linked.length > 0 ? `<p class="bowdle-small">Saved with ${profile.linked.map((provider) => PROVIDER_LABELS[provider]).join(" and ")}</p>` : ""}
    ${unlinked.map((provider) => `<button data-link="${provider}">Save progress with ${PROVIDER_LABELS[provider]}</button>`).join("")}
    <button data-action="delete">Delete account</button>
    <button data-action="close">Back</button>`;
  const recentHost = section.querySelector("[data-testid=recent-players]");
  if (recentHost) {
    const headers = (): HeadersInit => {
      const token = loadToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    };
    void fetch(`${apiBase()}/social/recent`, { headers: headers() }).then(async (response) => {
      if (!response.ok) { recentHost.textContent = "Recent players unavailable."; return; }
      const body = await response.json() as { players: { token: string; name: string }[] };
      if (!body.players.length) { recentHost.textContent = "No recent players yet."; return; }
      recentHost.replaceChildren();
      const title = document.createElement("h3"); title.textContent = "Recent players"; recentHost.append(title);
      for (const player of body.players) {
        const row = document.createElement("div");
        row.append(document.createTextNode(player.name + " "));
        const invite = document.createElement("button"); invite.textContent = "Party invite"; invite.dataset.testid = "recent-invite";
        invite.addEventListener("click", () => {
          const code = prompt("Share this party code with " + player.name + ":");
          if (code) location.search = `?scene=online&party=${encodeURIComponent(code.trim())}`;
        });
        const block = document.createElement("button"); block.textContent = "Block"; block.dataset.testid = "recent-block";
        block.addEventListener("click", () => {
          void fetch(`${apiBase()}/social/block`, {
            method: "POST",
            headers: { ...headers(), "Content-Type": "application/json" },
            body: JSON.stringify({ token: player.token }),
          }).then((res) => { block.textContent = res.ok ? "Blocked" : "Failed"; block.disabled = true; });
        });
        row.append(invite, block);
        recentHost.append(row);
      }
    }).catch(() => { recentHost.textContent = "Recent players unavailable."; });
  }

  const error = section.querySelector<HTMLDivElement>(".bowdle-error")!;
  const challengePanel = section.querySelector<HTMLDivElement>("[data-testid=challenges]")!;
  const renderChallenges = (state: Challenges | undefined): void => {
    if (!state) { challengePanel.textContent = "Challenge notes offline"; return; }
    const rows = (list: ChallengeState[], daily: boolean): string => list.map((entry) => `<li data-challenge="${escapeHtml(entry.id)}"><span>${escapeHtml(entry.text)}</span> <progress max="${entry.target}" value="${entry.progress}"></progress> ${entry.progress}/${entry.target} ${entry.done ? "Done" : ""} · ${entry.reward.ink} Ink + ${entry.reward.xp} XP ${daily ? `<button data-reroll="${escapeHtml(entry.id)}" ${!state.rerollAvailable || entry.done ? "disabled" : ""}>Reroll</button>` : ""}</li>`).join("");
    challengePanel.innerHTML = `<h3>Daily challenges</h3><p data-reset="daily"></p><ul data-testid="daily-challenges">${rows(state.daily, true)}</ul><h3>Weekly challenges</h3><p data-reset="weekly"></p><ul data-testid="weekly-challenges">${rows(state.weekly, false)}</ul>`;
    for (const button of challengePanel.querySelectorAll<HTMLButtonElement>("[data-reroll]")) button.addEventListener("click", async () => {
      for (const current of challengePanel.querySelectorAll<HTMLButtonElement>("[data-reroll]")) current.disabled = true;
      const result = await rerollChallenge(button.dataset.reroll!);
      challenges = result ?? await fetchChallenges(); renderChallenges(challenges);
      if (!result) error.textContent = "That challenge could not be rerolled.";
    });
  };
  renderChallenges(challenges);
  let lastSecond = -1;
  const updateReset = (): void => {
    if (!section.isConnected) return;
    const second = Math.floor(Date.now() / TIME_UNITS.msPerSecond);
    if (second !== lastSecond && challenges) {
      lastSecond = second;
      for (const period of CHALLENGE_PERIODS) {
        const remaining = Math.max(0, Math.ceil((challenges[period === "daily" ? "dailyResetAt" : "weeklyResetAt"] - Date.now()) / TIME_UNITS.msPerSecond));
        const label = challengePanel.querySelector(`[data-reset=${period}]`);
        if (label) label.textContent = `Resets in ${Math.floor(remaining / TIME_UNITS.secondsPerHour)}h ${Math.floor(remaining % TIME_UNITS.secondsPerHour / TIME_UNITS.secondsPerMinute)}m ${remaining % TIME_UNITS.secondsPerMinute}s (UTC)`;
      }
    }
    requestAnimationFrame(updateReset);
  };
  requestAnimationFrame(updateReset);
  section.querySelector("[data-action=rename]")!.addEventListener("click", async () => {
    const input = section.querySelector<HTMLInputElement>("[data-field=name]")!;
    const issue = nameError(input.value); error.textContent = issue;
    if (issue) return;
    const updated = await renameAccount(input.value.trim());
    if (!updated) { error.textContent = "That name did not save."; return; }
    saveName(updated.name);
    section.querySelector("h2")!.textContent = updated.name;
    error.textContent = "Saved.";
  });
  for (const button of section.querySelectorAll<HTMLButtonElement>("[data-link]")) {
    button.addEventListener("click", () => { void startProviderSignIn(button.dataset.link as Provider); });
  }
  const remove = section.querySelector<HTMLButtonElement>("[data-action=delete]")!;
  remove.addEventListener("click", async () => {
    if (remove.dataset.armed !== "true") {
      remove.dataset.armed = "true";
      remove.textContent = "Click again to delete forever";
      return;
    }
    await deleteAccount();
    section.innerHTML = `<h2>Account deleted</h2><p>Your level, Ink and season stats are gone.</p><button data-action="close">Back</button>`;
  });
}

export async function showLeaderboard(container: HTMLElement, onClose: () => void): Promise<void> {
  const section = panel(container, "bowdle-leaderboard", onClose);
  const board = await fetchLeaderboard();
  if (!board) {
    section.innerHTML = `<h2>Leaderboard offline</h2><button data-action="close">Back</button>`;
    return;
  }
  const rows = board.rows.map((row) => `<tr><td>${row.rank}</td><td>${escapeHtml(row.name)}</td><td>${row.level}</td><td>${row.kills}</td><td>${row.wins}</td></tr>`).join("");
  section.innerHTML = `<h2>Season ${escapeHtml(board.season)}</h2>
    <table class="bowdle-table" data-testid="leaderboard"><thead><tr><th>#</th><th>Explorer</th><th>Lvl</th><th>Kills</th><th>Wins</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5">No kills logged yet this season.</td></tr>`}</tbody></table>
    <button data-action="close">Back</button>`;
}
