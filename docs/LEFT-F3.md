# Left after F3 (2026-09-18)

Ship blockers from the F3 runbook that are deferred with dates, not claimed done:

1. **Attract mode** - still not implemented. Needs an idle demo loop after N seconds on the main menu.
2. **First-launch benchmark caller** - `presetFromFrameMs` exists but nothing invokes it on first launch yet.
3. **Loading screen progress / shader warm-up** - not wired.
4. **`npm run og` / `npm run icons`** - still stubs that assume assets already exist under `public/`. Replace with real generators or keep assets checked in.

These stay out of BUILD_LOG "Built" until they ship.
