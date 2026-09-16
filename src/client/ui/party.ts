import { PARTY_CODE_LENGTH } from "../../shared/constants.ts";
import { mulberry32 } from "../../shared/math/rng.ts";
import { createPartyCode, isPartyCode, normalizePartyCode } from "../../shared/party.ts";
import { portalPolicy } from "../platform/platform.ts";

export function partyLink(code: string): string {
  return `${location.origin}${location.pathname}?scene=online&party=${code}`;
}

function freshCode(): string {
  const seed = new Uint32Array(1);
  crypto.getRandomValues(seed);
  return createPartyCode(mulberry32(seed[0]!));
}

/** "Play with friends": create a code to share, or type a friend's code. */
export function showPartyPanel(container: HTMLElement, go: (code: string) => void): void {
  const code = freshCode();
  const links = portalPolicy().externalLinks;
  const panel = document.createElement("section");
  panel.className = "bowdle-panel bowdle-party";
  panel.innerHTML = `<h2>Play with friends</h2>
    <p class="bowdle-small">Share this code. Everyone who enters it lands in the same match, on the same team.</p>
    <p class="bowdle-party-code" data-testid="party-code">${code}</p>
    ${links ? `<button data-action="copy">Copy invite link</button>` : ""}
    <button data-action="start">Start party</button>
    <h3>Have a code?</h3>
    <input data-field="code" maxlength="${PARTY_CODE_LENGTH + 2}" autocomplete="off" spellcheck="false" placeholder="K7P2QX">
    <div class="bowdle-error"></div>
    <button data-action="join">Join party</button>
    <button data-action="close">Back</button>`;
  container.append(panel);
  const error = panel.querySelector<HTMLDivElement>(".bowdle-error")!;
  panel.addEventListener("click", async (event) => {
    const action = (event.target as HTMLElement).closest("button")?.dataset.action;
    if (action === "close") panel.remove();
    if (action === "start") go(code);
    if (action === "copy") {
      try { await navigator.clipboard.writeText(partyLink(code)); error.textContent = "Invite link copied."; }
      catch { error.textContent = partyLink(code); }
    }
    if (action === "join") {
      const typed = normalizePartyCode(panel.querySelector<HTMLInputElement>("[data-field=code]")!.value);
      if (!isPartyCode(typed)) { error.textContent = `Codes are ${PARTY_CODE_LENGTH} letters and numbers.`; return; }
      go(typed);
    }
  });
}
