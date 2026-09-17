# Handoff: finish G9, then G10 to G14

For the next coding agent. Repo `C:\Users\Dell\Desktop\bowdle`, branch `main`, remote `github.com/tanayvasishtha/Bowdle`.
`docs/RUNBOOK-V2.md` is the milestone list and `docs/V2-DESIGN.md` holds the numbers. Read `AGENTS.md` first.

## Hard rules

- Commit as `Tanay Vasishtha <tanayvasishtha@gmail.com>` only. No `Co-authored-by`, no "Generated with" lines, no mention of any AI or agent in commits, code or docs. Never open pull requests.
- Commit message `G<n>: <summary>`, then `git tag g<n>` and `git push -q origin main --tags`.
- Secrets only through environment variables. Never commit `.env`.
- No new dependencies. Cosmetic-only monetization. Never copy code, names or assets from other games.
- Docs and UI copy: no em dashes, no "not X but Y" phrasing, no slogan-style closing lines.
- Gameplay numbers go in `src/shared/constants.ts`, render-only numbers in `src/client/render/look.ts`.
- Each milestone: gates pass, one "break it on purpose" check (break, see the test fail, revert), screenshots in `test-results/qa/g<n>/` looked at, a `docs/BUILD_LOG.md` entry at the top (Built, Verified, Left).

## Gates

```bash
npm run check
npm run soak
npm run build
npm run smoke
npm run build:portals
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" npx playwright test
```

- The full e2e run takes 8+ minutes. Do not edit client or server files while it runs: the dev server hot-reloads and tests break.
- Other apps using a lot of CPU (ChatGPT desktop, codex) make the performance and prediction tests flaky. Close them or rerun a failing test once.
- `npm run soak` accepts `[seeds] [mode]`, for example `node scripts/bot-soak.ts 1 expedition`.

## G9 state (uncommitted work in the tree)

Done and passing:

- Server: `src/shared/sim/creatures.ts`, `src/shared/sim/waves.ts`, `src/server/rooms/expedition.ts` (wave director), Expedition hooks in `TdmRoom.ts`, `expedition` room name in `app.config.ts` (filtered by `checkpoint`), `expedition_runs` migration, rewards, personal best, weekly board `GET /api/expedition/leaderboard`, challenges `w.wave10` and `w.colossus`, creature and herb spawns on Sun Temple and Lost River.
- Creatures hop when blocked and leap to higher waypoints; routes use only walk, jump and drop links; a stuck creature reappears at its next waypoint; a route refresh skips a waypoint already passed. Bots aim at creature bodies through `AIM_HEIGHTS` in `BotController.ts`.
- Client: instanced creature rigs (`src/client/render/creatures.ts`), herbs, Night fog uniform in the composite shader, `ExpeditionHud` (wave line, boss bar, downed screen, revive prompt), end-of-run panel in `hud.ts`, Expedition menu entry with checkpoint choice, `checkpoint` and test-only `startWave` URL options, test hook `__bowdleTest.expedition()`. Client prediction passes the Low Gravity multiplier.
- Schema encoder buffer raised to 32 KB in `app.config.ts`.
- Tests: `src/shared/sim/creatures.test.ts` (10), `tests/server/expedition.test.ts` (5 of 6 pass), `tests/e2e/expedition.spec.ts` (3 pass, screenshots in `test-results/qa/g9/` checked). `npm run check` passed with 313 tests before the last test was added.
- `node scripts/bot-soak.ts 3 expedition`: all 6 runs clear 20 waves; 1 to 22 creature respawns per run.
- Docs: `GAME.md` Expedition section, `RETENTION.md` weekly pool.

Left to do for G9:

1. Fix the failing test "matches a predicted low gravity jump and a downed crawl for 60 frames" in `tests/server/expedition.test.ts`. The simulation matches. The mismatch comes from timing: when a tick gets no new input, the server replays the last input, so it runs more steps than the test. The x-change wait in the loop does not prevent that. Options: drive the room by hand with `room.simulateTick(step, now)` and feed frames through the room's input queue (`inputs = this.defineInput(...)` in `TdmRoom.ts`; check the Colyseus `defineInput` API in `node_modules/colyseus` for a way to push frames), or stop the fixed timestep for the test. Keep the checks: peak height above 1.8 m under Low Gravity, the player still downed, x, y and z equal within 1e-6.
2. Run the full gates above, including the whole Playwright suite (`tests/e2e/modes.spec.ts` now expects the Expedition option in the party mode list).
3. Run `npm run soak` with the default 3 seeds (every PvP mode plus Expedition).
4. Break it: set `creatureLeapMaxMps` to 8 in `constants.ts`; the ledge test in `creatures.test.ts` fails. Revert. (Already done once; repeat and note it.)
5. `docs/BUILD_LOG.md` entry "G9: Expedition co-op waves" with Built, Verified, Left. Left should mention: 1 to 22 stuck-creature respawns per 20-wave run on Lost River; Relic Run bots rarely capture on Canopy; Sun Temple seed 101 had low kills since G3; the respawn is a teleport with no effect on the client.
6. Commit `G9: Expedition co-op waves`, tag `g9`, push.

## G10 to G14

Follow `docs/RUNBOOK-V2.md` sections G10 to G14 in order, one commit and tag each.

- G10: map kit v3 (anchors, geysers, breakables, herbs, kill volumes), Sky Bridges and Sunken Ruins. Add `creatureSpawns` and `herbSpawns` to the new maps if Expedition should run there, and keep `npm run soak` green on all five maps in every mode.
- G11: pings and callout wheel, spectate the killer, AFK removal, reports, play of the match.
- G12: Glicko-2 ranked queue, ratings per season, regions.
- G13: graphics presets, loading screen, attract mode, share tags, manifest and service worker (never cache `/api` or WebSocket traffic).
- G14: `scripts/balance-report.ts`, constant tweaks with reasons, doc updates, full release QA, `package.json` 2.0.0, commit `v2.0.0: ...`, tag `v2.0.0`. Also look at Relic Run bot captures on Canopy and low kills on Sun Temple seed 101.

## Useful facts

- Schemas allow 64 fields each; player cosmetics live in the nested `PlayerState.look`.
- Matchmaking only filters on options the joiner sends, so each public mode is its own room name. Every Expedition join must send `checkpoint`.
- Challenge picks are ranked by a seeded hash; server tests pin the date to 2033-10-22.
- Online e2e tests use `onlineUrl(query)` from `tests/e2e/helpers.ts` for their own room and `returningPlayer(page)` to skip the first-launch flow. Only the front tab renders; use `page.bringToFront()` or a separate browser context.
- Many files use CRLF line endings; keep them as they are.
