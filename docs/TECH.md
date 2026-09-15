# Bowdle tech

## Stack (pinned, do not change)

| Package | Version | Used for |
|---|---|---|
| Node.js | 24 LTS | Server runtime. Runs `.ts` directly with built-in type stripping |
| npm | 11 | Package manager |
| `typescript` | 7.0.2 | Typecheck only (`tsc --noEmit`). Nothing is compiled by tsc |
| `vite` | 8.3.0 | Client dev server and build |
| `three` / `@types/three` | 0.186.0 | Rendering with `WebGLRenderer` and GLSL shaders |
| `colyseus` | 0.18.5 | Game server, includes the Vite plugin (`colyseus/vite`) |
| `@colyseus/core` | 0.18.13 | Room, input, rewind APIs |
| `@colyseus/schema` | 5.0.32 | Synced state, defined with `schema()` |
| `@colyseus/ws-transport` | 0.18.2 | WebSocket transport |
| `@colyseus/sdk` | 0.18.2 | Browser client, prediction (`@colyseus/sdk/predict`) |
| `@colyseus/testing` | 0.18.5 | Server integration tests |
| `@colyseus/better-call` | 1.3.3 | Router used by `@colyseus/core`, listed because peers are not auto-installed |
| `express` | 5.2.1 | HTTP routes and static files |
| `zod` | 4.6.5 | Message validation |
| `vitest` | 5.0.0 | Unit and server tests |
| `@playwright/test` | 1.63.0 | Browser tests |
| `@types/node` | 24.13.4 | Node types |

Added only in their milestone: `@colyseus/auth` 0.18.2, `@colyseus/database` 0.18.3, `drizzle-orm` 0.45.2, `@electric-sql/pglite` 0.5.8, `postgres` 3.4.9.

**`.npmrc` sets `legacy-peer-deps=true`.** The `colyseus` package declares every transport as a required peer, including `uWebSockets.js` fetched from GitHub over SSH, which makes `npm ci` fail in Codex cloud. With auto peers off, the peers Bowdle needs are listed in `package.json`. Keep the file.

### Why these choices

- **WebGLRenderer with GLSL**, even though three.js is moving to WebGPU. Our look is one post-processing shader, WebGL2 runs on every desktop browser, and GLSL is well documented.
- **Colyseus 0.18** ships client prediction, reconciliation, server rewind for lag compensation, a fixed timestep and input buffering. We use those instead of writing netcode.
- **No physics engine.** Players and arrows move with our own axis-aligned box collision in `src/shared/sim`. It is deterministic and runs identically on client and server.
- **One package, no workspaces.** Fewer moving parts for tools and agents.

## Repo layout

```
bowdle/
  AGENTS.md  README.md  docs/
  index.html
  package.json  package-lock.json
  tsconfig.client.json  tsconfig.server.json
  vite.config.ts  vitest.config.ts  playwright.config.ts
  scripts/size-check.ts
  src/
    shared/                 pure TS, imports only other files in src/shared
      constants.ts          every tuning number from GAME.md
      math/                 vec3.ts, rng.ts (seeded), angles.ts
      sim/                  movement.ts, collision.ts, bow.ts, arrows.ts,
                            hitboxes.ts, melee.ts, health.ts, match.ts
      maps/                 types.ts, helpers.ts, launch maps, camp.ts, validate.ts
      bots/                 aim.ts (projectile lead), nav.ts (waypoint paths)
      input.ts              PlayerInputFrame type and BTN button flags
      cosmetics.ts          item catalog (M11)
    net/                    may import @colyseus/schema, zod and src/shared
      schema.ts             MatchState, PlayerState, ArrowState, PlayerInput
      messages.ts           zod schemas + types for non-input messages
    server/match/tick.ts    tick logic as a plain function, testable in a loop
    server/
      app.config.ts         export const server = defineServer({...})
      main.ts               production entry: static files + listen(PORT)
      rooms/TdmRoom.ts
      bots/BotController.ts builds PlayerInput frames for bots
    client/
      main.ts               boot, menu, mode switch
      render/               Renderer.ts, InkMaterial.ts, CompositePass.ts,
                            shaders/, meshes/ (player, bow, arrow, map, decor)
      game/                 OfflineSession.ts (practice), OnlineSession.ts,
                            InputSampler.ts, CameraRig.ts
      ui/                   hud.ts, menus.ts, killfeed.ts, scoreboard.ts
      audio/                sfx.ts (procedural WebAudio)
      platform/             web.ts, poki.ts, crazygames.ts (M12)
  tests/
    purity.test.ts          fails if src/shared imports anything outside itself
    server/                 Colyseus integration tests
    e2e/                    Playwright specs (helpers.ts filters harmless font errors)
```

**Import direction:** `shared` is imported by everything. `net` imports `shared`. `server` and `client` import `shared` and `net`. `server` and `client` never import each other. The client types room state with the schema classes from `src/net`.

## Scripts

| Script | Command | Notes |
|---|---|---|
| `dev` | `vite` | Colyseus Vite plugin runs the game server inside the dev server. One port: 5173 |
| `dev:server` | `node --watch src/server/main.ts` | Fallback split mode, port 2567 |
| `dev:client` | `vite --mode split` | Fallback split mode, reads `VITE_SERVER_URL` |
| `typecheck` | `tsc -p tsconfig.client.json && tsc -p tsconfig.server.json && tsc -p tsconfig.tools.json` | |
| `test` | `vitest run` | Unit + server tests |
| `build` | `vite build` | Client in `dist/client`. The Colyseus plugin also emits `dist/server/server.mjs` (unused until M9) |
| `size` | `node scripts/size-check.ts` | Fails over budget |
| `check` | `npm run typecheck && npm test && npm run build && npm run size` | Required before finishing any task |
| `e2e` | `playwright test` | Starts `npm run dev` itself |
| `start` | `node src/server/main.ts` | Production. Serves `dist/client` and the game server on `PORT` |

In dev the log prints `'transport' is ignored in dev mode`. That is expected: the plugin serves WebSockets on Vite's own server. Do not "fix" it.

## TypeScript rules

All three tsconfigs set: `strict`, `noEmit`, `allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `skipLibCheck`.

- `tsconfig.client.json`: `module: preserve`, `moduleResolution: bundler`, `lib: [ES2023, DOM, DOM.Iterable]`, `types: ["vite/client"]`. Includes `src/client`, `src/shared`, `src/net`.
- `tsconfig.server.json`: `module: nodenext`, `moduleResolution: nodenext`, `lib: [ES2024]`, `types: ["node"]`. Includes `src/server`, `src/shared`, `src/net`, `tests/server`, `tests/purity.test.ts`.
- `tsconfig.tools.json`: same as server plus the `DOM` lib. Includes the three config files, `scripts` and `tests/e2e`.

TypeScript 7 removed `baseUrl`, `moduleResolution: node`, ES5 targets and `downlevelIteration`, and defaults `types` to empty. Do not use them. List `types` explicitly.

## Where to check library APIs

The agent environment has no internet. Read these installed files instead of guessing. If npm nested a package, find it with `find node_modules -name Room.d.ts -path "*colyseus*"`.

| Topic | File |
|---|---|
| Server setup | `@colyseus/core/build/Server.d.ts` (`defineServer`, `defineRoom`) |
| Rooms, inputs, timestep, rewind | `@colyseus/core/build/Room.d.ts`, `Rewind.d.ts`, `input/types.d.ts` |
| Schema definitions | `@colyseus/schema/README.md` (`schema()` and `t.*` builders) |
| Client room, input handle | `@colyseus/sdk/build/Room.d.ts`, `input/InputHandle.d.ts` |
| Client prediction | `@colyseus/sdk/build/predict/Predictor.d.ts`, `reconciler.d.ts`, `rollback.d.ts`, `predictedSpawns.d.ts` |
| Server clock vs client clock | `@colyseus/sdk/build/RoomClock.d.ts` |
| Test server | `@colyseus/testing/build/TestServer.d.ts` |
| Vite plugin | `colyseus/build/vite.d.ts` |

## Testing

### Unit tests (Vitest, `src/shared/**/*.test.ts`)

Required coverage:

- Movement: ground acceleration reaches `RUN_SPEED`, friction stops the player, jump apex height, air strafing gains speed within the cap, slide boost and end rules, bunny hop keeps speed, step-up climbs 0.45 m and refuses 0.5 m, 10,000 substeps at max speed into walls never ends inside a box.
- Arrows: position after t seconds matches the closed-form ballistic formula within 1 cm, a 95 m/s arrow never passes through a 0.1 m wall, head hit beats body hit, crouching lowers both hitboxes.
- Bow: draw fraction math, early release cancels, cooldown blocks the next shot, damage table values.
- Melee: range, arc and backstab angle.
- Match: kill scoring, score limit ends the match, time limit and draw, respawn timer, spawn protection ends on fire.
- Maps: `validateMap` returns no errors for every map. Also one broken map per rule to prove each rule can fail.
- Determinism: run the same 600 input frames twice from the same start state, final state hashes are identical.
- Purity: `src/shared` imports nothing outside `src/shared`.

### Server tests (Vitest + `@colyseus/testing`, `tests/server/*.test.ts`)

Use `boot(server)` in `beforeAll`, `cleanup()` in `beforeEach`, `shutdown()` in `afterAll`. Required:

- Joining `tdm` creates a player on a team and bots fill the rest to 4v4.
- Sending movement inputs moves the player the same distance as calling `stepPlayer` directly.
- Holding fire for 600 ms then releasing spawns one arrow in state.
- An arrow kills a stationary bot at 30 m with a full-draw headshot. Kill score increments.
- Team damage does nothing.
- A client that drops and reconnects within 15 s keeps its player.
- Reaching `SCORE_LIMIT` moves the match to the `end` phase.

### Browser tests (Playwright, `tests/e2e/*.spec.ts`)

Chromium only, headless, launched with `--use-angle=swiftshader`, `--enable-unsafe-swiftshader` and `--ignore-gpu-blocklist` so WebGL works without a GPU.

- The page loads with zero console errors.
- Practice Range renders: sample the canvas, at least 40% of pixels are paper color and at least 2% are ink color.
- Clicking Play joins a match and the HUD shows both team scores within 10 s.

Tests never touch the internet. Seed every random source.

## Performance budgets

| Budget | Limit | Checked by |
|---|---|---|
| Client JS, gzipped | 900 KB | `npm run size` |
| First frame on a mid laptop | under 3 s | Manual |
| Frame rate, 1080p, integrated GPU, 8 players | 60 fps | F3 overlay |
| Draw calls in a match | 150 or fewer | F3 overlay |
| Server tick, 8 players and 20 arrows | under 3 ms | Server log every 10 s in dev |

Merge static map geometry by material. Dynamic resolution: drop render scale in 10% steps (down to 60%) when the average frame time goes over 20 ms for 2 seconds.

## Debug tools

- `?debug` in the URL enables the F3 overlay: fps, draw calls, ping, player speed, draw fraction.
- In debug mode, lazily `import("@colyseus/sdk/debug")` for the Colyseus prediction panel.
- F4 toggles hitbox wireframes (dev builds only).

## Codex cloud environment

- Image: default universal image, Node 24.
- Setup script: `npm ci && npx playwright install --with-deps chromium`
- Agent internet access: off. Everything the agent needs is installed by the setup script.
- Secrets (from M10): add them as environment secrets in the Codex environment settings, never in the repo.
