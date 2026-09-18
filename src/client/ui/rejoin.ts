/** Offer to rejoin a live seat while the room still holds it (N3). */
const KEY = "bowdle.rejoin";

export type RejoinTicket = { roomId: string; reconnectionToken: string; mode: string; savedAt: number };

export function saveRejoinTicket(ticket: RejoinTicket): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(ticket)); } catch { /* ignore */ }
}

export function loadRejoinTicket(): RejoinTicket | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return undefined;
    const ticket = JSON.parse(raw) as RejoinTicket;
    if (!ticket.reconnectionToken || Date.now() - ticket.savedAt > 20_000) {
      clearRejoinTicket();
      return undefined;
    }
    return ticket;
  } catch { return undefined; }
}

export function clearRejoinTicket(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function showRejoinBanner(host: HTMLElement, onRejoin: () => void, onDismiss: () => void): void {
  const existing = host.querySelector("[data-testid=rejoin-banner]");
  if (existing) return;
  const banner = document.createElement("div");
  banner.dataset.testid = "rejoin-banner";
  banner.style.cssText = "position:absolute;left:50%;top:18px;transform:translateX(-50%);z-index:40;padding:10px 16px;border:3px solid #4a3527;background:#efe3c6;font:22px Gochi Hand;color:#4a3527;display:flex;gap:10px;align-items:center";
  banner.innerHTML = `<span>Match still open.</span><button type="button" data-action="rejoin">Rejoin</button><button type="button" data-action="dismiss">Menu</button>`;
  banner.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest("button")?.dataset.action;
    if (action === "rejoin") onRejoin();
    if (action === "dismiss") { clearRejoinTicket(); banner.remove(); onDismiss(); }
  });
  host.append(banner);
}
