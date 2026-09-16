import type { Profile, Provider } from "../../shared/api.ts";
import { deleteAccount, enabledProviders, ensureAccount, fetchLeaderboard, fetchProfile, renameAccount, startProviderSignIn } from "../account.ts";
import { loadName, nameError, saveName } from "../settings.ts";

const PROVIDER_LABELS: Record<Provider, string> = { discord: "Discord", google: "Google" };

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
  const profile = await fetchProfile() ?? await ensureAccount(loadName() || "Explorer");
  if (!profile) {
    section.innerHTML = `<h2>Field notes offline</h2><p>The camp server is out of reach. You can still play as a guest.</p><button data-action="close">Back</button>`;
    return;
  }
  const providers = await enabledProviders();
  const unlinked = providers.filter((provider) => !profile.linked.includes(provider));
  section.innerHTML = `<h2>${escapeHtml(profile.name)}</h2>
    ${progressBar(profile)}
    <p class="bowdle-ink" data-testid="ink">${profile.ink} Ink</p>
    <p class="bowdle-small">Season ${escapeHtml(profile.season)}: ${profile.seasonKills} kills, ${profile.seasonWins} wins in ${profile.seasonMatches} matches</p>
    <label>Explorer name <input data-field="name" maxlength="16" value="${escapeHtml(profile.name)}"></label><div class="bowdle-error"></div>
    <button data-action="rename">Save name</button>
    ${profile.linked.length > 0 ? `<p class="bowdle-small">Saved with ${profile.linked.map((provider) => PROVIDER_LABELS[provider]).join(" and ")}</p>` : ""}
    ${unlinked.map((provider) => `<button data-link="${provider}">Save progress with ${PROVIDER_LABELS[provider]}</button>`).join("")}
    <button data-action="delete">Delete account</button>
    <button data-action="close">Back</button>`;
  const error = section.querySelector<HTMLDivElement>(".bowdle-error")!;
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
