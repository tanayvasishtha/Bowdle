# Bowdle

A doodle bow shooter for the browser. Two teams of 4, bows and arrows, fast movement, everything drawn in ballpoint on notebook paper.

Made by Tanay Vasishtha.

## Status

**M0 done:** pinned dependencies, configs, purity test and a server health test, all passing. Next up: M1, the doodle renderer.

## Run it

```bash
npm ci
npm run dev
```

Open http://localhost:5173. The game server runs inside the Vite dev server.

```bash
npm run check                      # typecheck, tests, build, size budget
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

## Stack

TypeScript 7, Vite 8, three.js r186, Colyseus 0.18, Vitest 5, Playwright, Node 24.
