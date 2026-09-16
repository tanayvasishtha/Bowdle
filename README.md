# Bowdle

A browser bow shooter. Two crews of 4 explorers, bows and arrows, fast Deadshot-style movement, and three jungle maps drawn like an ink and watercolor expedition journal.

Made by Tanay Vasishtha.

## Status

**v1.0.0.** Everything in the completion plan is built and tested:

- **Maps:** Sun Temple, Canopy Village and Lost River, plus Practice Camp. All mirrored, validated, dense with scenery, and every tall prop is solid.
- **Movement and combat:** bunny hops, slides, grapple, zip lines, water, tall grass, boulder traps, the ink cloud, charged bow shots with headshots, and dagger stabs, all server authoritative with prediction.
- **Crews:** Sun and Moon explorers on a skinned rig, with a first-person bow and hands.
- **Bots:** fill every match and play every map. `npm run soak` runs full bot matches on each map.
- **Accounts:** guest accounts with optional Discord or Google sign-in, XP and levels, Ink, and seasonal leaderboards.
- **Cosmetics:** 24 items in a locker with live previews, an Ink shop, and Xsolla checkout on the web build.
- **Portals:** Poki and CrazyGames builds with ad breaks, plus clip saving, sharing on X, and privacy and terms pages.

## Run it

```bash
npm ci
npm run dev
```

Open http://localhost:5173. The game server runs inside the Vite dev server.

```bash
npm run check                      # typecheck, tests, build, size budget
npm run smoke                      # production server smoke test (after build)
npm run soak                       # full bot matches on every map
npm run build:portals              # Poki and CrazyGames bundles
npx playwright install chromium    # once, before the first e2e run
npm run e2e                        # browser tests
```

## Build plan

1. Setup is **Step 0** in [docs/RUNBOOK-1.md](docs/RUNBOOK-1.md).
2. Milestones run in order. Each has a task description, checks to run and a way to break it on purpose.
3. [AGENTS.md](AGENTS.md) holds the project rules for coding tools.

## Docs

| Doc | Contents |
|---|---|
| [GAME.md](docs/GAME.md) | Rules, controls, every tuning number |
| [MAP.md](docs/MAP.md) | Map format, launch layouts, validation |
| [TECH.md](docs/TECH.md) | Stack, layout, scripts, tests, budgets |
| [NETCODE.md](docs/NETCODE.md) | Server authority, prediction, lag compensation |
| [WORLD.md](docs/WORLD.md) | Expedition Journal art direction and world systems |
| [JUNGLE-MAPS.md](docs/JUNGLE-MAPS.md) | Launch maps and Practice Camp |
| [RENDERING.md](docs/RENDERING.md) | The doodle shader pipeline |
| [ECONOMY.md](docs/ECONOMY.md) | Accounts, cosmetics, payments, portal rules |
| [RUNBOOK-1.md](docs/RUNBOOK-1.md) | Setup to Practice Camp (M0 to M3) |
| [RUNBOOK-2.md](docs/RUNBOOK-2.md) | Online play and bots (M4a to M6) |
| [RUNBOOK-3.md](docs/RUNBOOK-3.md) | Abilities to launch (M7 to M12) |
| [CHARACTERS.md](docs/CHARACTERS.md) | The two explorer crews, rig, poses and first person |
| [COMPLETION-PLAN.md](docs/COMPLETION-PLAN.md) | The v1 plan and what only Tanay can do |
| [DEPLOY.md](docs/DEPLOY.md) | Hosting, environment variables, portal uploads |
| [RETENTION.md](docs/RETENTION.md) | v1.1 plan: medals, challenges, streaks, unlock track, parties |
| [RUNBOOK-RETENTION.md](docs/RUNBOOK-RETENTION.md) | Milestones R1 to R6 and the Codex prompt |
| [BUILD_LOG.md](docs/BUILD_LOG.md) | What each milestone built and how it was checked |

## Stack

TypeScript 7, Vite 8, three.js r186, Colyseus 0.18, Vitest 5, Playwright, Node 24.
