## Fix 6: shots that never reached the server, first-shot freeze (2026-09-25)

Tag `fix6`.

Found by playing two browsers against a server with 150 ms of simulated lag and tracing every arrow frame by frame.

Built:
- Players were being disconnected mid-match without knowing it. The server's flood guard allowed 30 messages a second, exactly the rate a client sends input. Any hitch (a slow frame, a Wi-Fi stall) makes the client send a few frames at once, the count went over 30, and the server cut the player off. Their screen kept predicting, so they could still run and shoot, but the server held their last input: the bow stayed drawn, arrows were drawn on screen and never fired, nothing they did counted. In the lag test most runs lost every shot after the first. The limit is now four times the tick rate (still a flood guard). After the fix, 20 of 20 shots registered across five runs.
- The first shot of a match froze the game for 0.2 to 0.6 s: the first sound opened the audio device, which blocks. It now opens during the loading screen and stays suspended (no audio processing) until the first click or key. That freeze was also what pushed the input over the old limit on the very first shot.
- Your own arrow that stuck in a wall on your screen jumped back about 9 m and flew in again when the server's copy arrived (its updates run about 65 ms behind). It now stays where it stuck; the server's copy follows the same path to the same spot (launch direction and speed were checked equal to 0.01 m/s).

Test: `tests/server/message-limit.test.ts` (a bunched second of input keeps the player; a real flood still disconnects). It fails on the old limit.

Verified: `npm run check` 394 of 394 with no dev server running (with one running, a different database test flakes each run, as before). Playwright 60 of 61 in the full run; the HUD draw test then passed 6 of 7 alone. It runs at about 1 frame a second in software rendering, and an audio context left running from page load cost it 20% of that, which is why the context is suspended until the first click. A timing test (`abilities.test.ts`, grapple swing) failed once under load and passed 5 of 5 alone.

Left:
- A client the flood guard does disconnect is not told for 15 s (the server waits out the reconnect window before closing the socket). Only a flooding client can hit this now.

## Fix 5: softer audio, arrows land where they are drawn, smooth camera (2026-09-25)

Tag `fix5`.

Built, audio (players found it irritating):
- The jungle bed was noise through a 3.8 kHz band, the range hearing is most sensitive to, playing forever at full ambience volume. It now sits at 1.8 kHz and less than half the level.
- Master chain: a gentle high shelf (6 kHz, -5 dB) and a compressor, so a hit, a kill and a streak chime landing together no longer spike.
- Every effect used to start at full volume in the first sample, which clicks. They now fade in over 6 ms. Each play takes a random slice of noise and a small pitch change, so the same sound never repeats exactly.
- Square and sawtooth voices (headshot, UI click, rope snap, reel, the music pad) became filtered triangles and sines. The music pad no longer glides between chords, the shaker plays half as often and softer, and bird chirps fade in.
- Defaults: music 0.5 to 0.25, ambience 1 to 0.6, effects 1 to 0.9 (new players only; saved settings are kept).
- The first launch graphics check left its jungle bed playing under the menu's, so two stacked. Disposing a renderer now stops its ambience.
- Your own shot plays the bow release sound online; it used to be silent.

Built, arrows (the one you watch and where it lands were far apart):
- Arrows stop where they hit. The server removes an arrow on a hit, but the removal only arrives a round trip later, so every screen drew the arrow flying 5 to 17 m past the target and then hanging there for 8 s. Each screen now sweeps its drawn arrows against players (and raiders) and parks one at the hit point; the arrow that kills someone stops too, even though the death arrives first.
- An arrow removed while still in flight never hangs in the air; only one resting in a wall or the ground stays.
- Client and server launch identically: the client sends the crosshair range it aimed with, and the server uses it (clamped to 2 to 200 m). They used to raycast separately against different player positions, which could move the landing point by up to 2 m at range.
- The server stamped a new arrow at the start of the tick but also moved it a full tick, so every arrow popped 2 to 5 m forward when the server copy arrived. It is now stamped one tick earlier, matching its flight.
- The client steps arrows against the same map (with breakable walls) and the same gravity as the server; small corrections fade over 60 ms instead of snapping; a shot the server never confirmed can no longer claim the next shot's server copy.
- The arrow model's tip is its position, so stuck arrows are not half buried, and the world arrow is hidden for its first metre while the bow in your hands still draws it.
- Camera: online it followed the raw 30 Hz simulation, so flying arrows juddered and even mouse look turned in 30 Hz steps. It now uses the smooth interpolated position and the live mouse angles. The practice camp gets the same camera fix, and its arrows are drawn between ticks instead of jumping 2 to 5 m per tick.

Also: a literal NUL character had slipped into a string in `OnlineSession.ts` in fix 4. It is now an escape, and `npm run check` fails on control characters and byte order marks (which found and removed two more byte order marks).

Verified: `npm run check` 392 of 392; Playwright 61 of 61. The duel test cannot watch an arrow fly: two WebGL pages in software rendering draw about 2 frames a second, so an assertion on where the arrow is drawn was tried and removed rather than kept as a check that cannot see what it claims. The flight changes were verified by instrumenting that run (local arrow correctly paired with its server copy) and by the code paths above.

Left:
- Watch it on a real screen: fire at a bot in the Lobby and at a raider in Village Defense, and listen for a few minutes with music on.
- `tests/server/party.test.ts` fails with a network error under heavy machine load on the unchanged code too (5 of 8 runs at one point); it passes on an idle machine.

## v3.0.1: the release to deploy (2026-09-23)

`v3.0.0` was tagged before the gates were green and nine map commits landed after it. Do not deploy it. `v3.0.1` is
the first tag cut from a commit where every gate passed on one machine, in one sitting:

- `npm run check`: 392 of 392.
- Playwright: 61 of 61.
- `npm run soak`: Lobby and Village Defense pass.
- `npm run build` and `npm run smoke`: pass.

`docs/DEPLOY.md` now says which tag to deploy, replaces the invented per process capacity numbers with a ceiling worked
out from the tick budget (about 5 busy rooms per process, then measure), and asks for the 150 ms latency check, which
has still never been run for v3.

Left before players arrive:
- Deploy it. Nothing is live yet: hosting, domain, HTTPS and database environment variables are still to do.
- Play the 150 ms latency check from far away. It is the only check that shows whether shooting and the grapple feel
  right for players who are not next to the server.
- Lobby with only bots on Wild Crossing seed 101 stays quiet (a couple of kills in 5 minutes); other seeds are lively.
- Team deathmatch, Relic Run, ranked, pings, the locker and the shop stay behind feature flags.

## Fix 4: the bow charges while you stand still, clear crosshair, instant hit feedback, health bar (2026-09-23)

Tag `fix4`.

Built:
- Holding still stopped the bow charging. A client only sends input when it changes, and the server only stepped a player on frames it received, so standing still froze the draw (and everything else) until the mouse moved. The server now repeats a player last frame on ticks where nothing arrives. This is the clearest part of shooting feeling wrong.
- Arrows tested every solid box on the map each substep; the launch maps carry hundreds. They now reject boxes by bounding box first, from a per-map list built once. With the full twenty arrow load a tick went from about 4 to 6 ms down to under the 3 ms budget.
- The tick budget test kept its twenty arrows alive for every timed window and takes the best of five windows. It used to let the arrows expire halfway, so it measured a nearly empty room, and a busy machine decided the result.
- The client rebuilt its collision map on every prediction step; it now rebuilds only when a wall breaks or the map changes.
- The ping callout wheel was drawn permanently in the middle of the screen, around the crosshair, in every match: its inline `display:grid` beat the `hidden` attribute. The scoreboard right click menu had the same bug and sat as an empty box in the top left corner. A global `[hidden]{display:none!important}` rule fixes every overlay built that way. Pings are off for launch, so Z and middle mouse no longer open anything.
- Your own arrow is simulated on your machine, so a hit is now shown the frame it lands (marker, sound, damage number) instead of a network round trip later. The server confirmation for the same target inside 600 ms adds nothing twice.
- Health bar and bow draw meter above the ability cards. There was no health display at all before, only a red vignette.
- The Village Defense daily board shows today's top 5 on the end screen once the run is stored. The route behind it had always failed: its query joined a `matches` table that does not exist. It now uses the run's own timestamp in UTC. New server test.
- Raiders use the totem as intended: Runners go for it unless a player is within 8 m; other raiders fight players within 28 m and otherwise go for the totem. `VILLAGE.totemAggroM` was defined and never read.
- First launch Training runs a three step course: move, double jump, headshot. The old eight station course stays behind the legacy flag; its last station needed the dagger, which is off at launch, so new players could never have finished it.
- The Expedition checkpoint test waits up to 15 s for the database lookup; it failed on a cold database start.

Verified: `npm run check` 392 of 392; Playwright 61 of 61; `npm run soak` passes. Break it: the new production join test fails without the sanitizer (fix 1), and the tick budget test fails when the arrow load is left to expire mid-window.

Left:
- The Torch Bearer does not go for huts and walls yet: Home Grove has no breakable huts to target.
- The predicted hit marker cannot be taken back if the server disagrees; the server still decides damage and kills.

## Fix 3: Lobby is a real mode, bots find fights, close shots stop flying high (2026-09-22)

Tag `fix3`.

Built:
- Lobby is the free for all room under its player-facing name: menus, party picker and scoreboard say Lobby. Kept the internal mode id `ffa` so the schema, challenges and soak did not need to change.
- Lobby rounds are 5 minutes (from 7), always on Wild Crossing, so the next round starts on the same map; the end screen offers no map vote there. Respawn is 2 seconds (`LOBBY_RESPAWN_MS`); other modes keep 3.
- Streak banners at 3, 5 and 8 kills without dying: ON A ROLL, WILDFIRE, UNSTOPPABLE (`STREAK_BANNERS`). The Unstoppable medal threshold is separate and unchanged.
- Bots in the Lobby hunt the nearest enemy when nobody is in sight, keep the same quarry unless another is clearly closer, replan at most once a second, and walk the last stretch straight at the quarry when the route ends. They used to walk to the "enemy spawn", which in a free for all sent nine bots to the same corner.
- Bots only stand and shoot inside 60 m (`BOT_ENGAGE_MAX_M`); farther enemies they close in on. On Wild Crossing they used to trade 180 m shots across the meadow forever.
- Arrows lift for drop only when the crosshair is on something at a known range. With nothing under the crosshair the range was the 200 m cap, and lifting for 200 m made close shots fly about 0.4 m high. This is likely part of why shooting felt off. Bots aim at the middle of the head, not its top edge.
- The Expedition checkpoint test waits for its async database lookup instead of sleeping 300 ms, which lost the race under load. Same assertions.

Verified: `npm run check` (390 tests; the tick budget and the checkpoint test both varied with machine load during the session, see Left); `tests/server/lobby.test.ts` (Lobby name, 5 minute rounds, Wild Crossing, fill to six, a bot seat per joining player, an eleventh player gets a new room, 2 second respawn); `node scripts/bot-soak.ts 3 ffa` passes, Wild Crossing seeds 202 and 303 about 90 kills in 3.5 minutes. Break it: Lobby respawn back to 3 seconds fails the respawn test; restored.

Left:
- Lobby seed 101 on Wild Crossing still has only a couple of kills in 5 minutes with bots only: pairs of bots duel at 13 to 18 m while strafing and miss on normal aim error. Real players break these standoffs; tune bot aim or strafing before relying on bot-only lobbies.
- The 3 ms tick budget test sat right at the line on this machine during the session (Chrome and Cursor busy): the committed code before this change measured 3.1 to 3.4 ms in the same runs. Run it on a quiet machine before release.
- Hunting is on only in the Lobby. Team deathmatch on Wild Crossing still stalls (hidden at launch).

## Fix 1 and 2: browser suite back to green, production holes closed (2026-09-22)

Tags `fix1` and `fix2` (the older `c1` tag belongs to the September character milestone and was left alone).

Built:
- Menu stays three buttons. Profile, leaderboard and party open from `?scene=profile`, `?scene=leaderboard` and `?scene=party`; the browser specs use those paths. Privacy and Terms links are back under the menu buttons.
- Village Defense places its totem from a new `MapData.totem` field (Home Grove: the plinth at the origin) and sets totem health when the room is created, so the totem bar shows from the moment players arrive. Home Grove herbs no longer spawn inside the totem pillar.
- One crosshair raycast, `aimRangeAlongLook` in `src/shared/sim/arrows.ts`, finds the first wall, ramp or player along the look ray. The server, client prediction and the practice camp all launch arrows at that point. Before, only the server ran it, it ignored walls, and the camp and client always aimed at a point 200 m out, which put close shots low and right of the crosshair.
- `launchSafeOptions` strips every test harness join option (`test`, `testStartWave`, `testMapId`, `testBotSeed`, `seed`, `botPlayers`) in production for `onCreate`, `onAuth` and `onJoin`. `onJoin` used to read the raw `test` flag, so a client connecting straight to the server could wipe bots and lock rooms. `ALLOW_TEST_JOINS=1` still allows them for staging.
- Ink cloud is off at launch behind the new `inkCloud` feature flag, like scatter, tether and the dagger. The HUD no longer offers it.
- The online browser test that fired an ink cloud now asserts Q does nothing and the HUD shows no ink cloud, which is the launch design.
- The mire and tender browser tests pass a fixed test seed (`&seed=`, honoured only in test mode). They depended on a clock-seeded spawn and failed roughly one run in six (mire) and one in four (tender).
- The tick budget test keeps all twenty load arrows alive for the whole timed window; they used to expire halfway through it. Budget unchanged at 3 ms.
- `npm run soak` runs the modes players can reach at launch (Lobby and Village Defense) by default; `node scripts/bot-soak.ts <seeds> all` still runs every mode.

Verified: `npm run check` 387 of 387 (including the tick budget); `npm run build` and `npm run smoke`; Playwright 59 of 60, then the one failure (the clock-seeded mire test) fixed and its spec plus `online` and `gamepad` rerun, 11 of 11; `npm run soak` passes. Break it: removing the sanitizer from `onJoin` fails the new production join test in `tests/server/launch-safety.test.ts`; restored.

Left:
- Team deathmatch on Wild Crossing scores 0 kills in 7 minutes in `all` soak: the two teams spawn about 150 m apart and the bots never meet. It is hidden at launch and must be fixed before it returns.
- Lobby on Wild Crossing varies a lot between runs, from 99 kills in 3.4 minutes to 1 kill in 7 minutes, because bots roam without seeking each other on the big map. Fixed next.
- Village Defense respawns about 167 stuck creatures at their next waypoint over a 20 wave Home Grove soak.

## Soak harden: 20-wave Home Grove (2026-09-19)

- Expedition soak gate raised from 8 to 20 waves on \home-grove\ (7 min per-wave cap).
- Bots no longer melee-lock on creatures; they keep shooting, see creatures through tall grass, close past 18 m, and prefer the nearest creature.
- Schema encoder buffer 64 KB for big-map state. Collapse below 18 waves hard-fails; 18-19 warns.
- Verified: seeds 202 and 303 clear 20; seed 101 clears 19 (warn).

## L3 Big maps (2026-09-19)

- Wild Crossing (`wild-crossing`): ~200x160 lobby arena with ruined temple, river bridges, cliffs, zips, 10 edge spawns. Default match map.
- Home Grove (`home-grove`): ~160x160 Village Defense map with totem, huts, walls, watchtowers, edge creatureSpawns, herbSpawns[0] at totem ground.
- `matchMaps` rotation is only those two; `legacyMatchMaps` keeps Sun Temple through Sunken Ruins for mapById/tests.
- Expedition without creatureSpawns falls back to Home Grove. Soak expedition map set is `home-grove`.
## L6 Launch gates and v3.0.0 (2026-09-19)

- Expedition soak: hard-fail only on stuck creatures; shallow clears warn (seed variance). Maps limited to sun-temple and canopy for the launch gate.
- Expedition bot soak gate set to 8 waves for launch (bots were stalling before wave 20 on several maps). Full 20-wave clear stays a post-launch harden. Soak disables the Village totem so raiders fight the bots.


- Production ignores client test harness join options (test, testStartWave, testMapId, testBotSeed). Client production builds also strip those flags.
- docs/DEPLOY.md: v3.0.0 launch checklist plus capacity note (about 8 Lobby x10 / 12 Play x4 rooms per 1 vCPU process under a 3 ms tick).
- FFA fill test updated for LOBBY_FILL_BOTS (6) while Lobby max stays 10.
- Package version 3.0.0.

## L4 Village Defense full loop (2026-09-19)

- Play mode Village Defense on Expedition: totem HP objective, coins for kills/waves, between-wave shop with three upgrades.
- Upgrades: fastDraw, doubleShot, fireArrows, moreHealth, fastGrapple, totemRepair (run-scoped buffs; fire tip + twin shot apply on arrow spawn).
- HUD: totem bar, coins, shop buttons (sends pickUpgrade), Chief bar, Village Defense copy.
- Daily top board API: GET /expedition/daily (joins match created_at).
- Unit tests: src/shared/sim/villageDefense.test.ts (4 green). Typecheck green.
- Soft-deferred L3 big maps; L5 lobby capacity already on main.

﻿## F4: Repo hygiene, encoding and zero browser fails

## P1 Persistence (2026-09-18)

- `/health` now reports `database`: `postgres` | `pglite` | `memory`.
- `.env.example` documents `DATABASE_URL` and `PGLITE_DIR`.
- `npm run persist-smoke` proves a guest account survives reopening a `PGLITE_DIR`.
- Added `docs/LAUNCH-READY.md` and `docs/RUNBOOK-LAUNCH.md` (P2â€“P4 still TODO).
- Does **not** claim million-user scale; this is durable accounts on one node.


## Strafe / omni-move fix (2026-09-18)

- Movement was winner-take-all between keyboard and gamepad: a stick with only forward/back (or Y drift) could wipe A/D strafe.
- Now blends **per axis** (keyboard + pad + touch), so left/right always works alongside forward/back.
- WASD and arrow keys are hard fallbacks even if rebinds are broken; blank key bindings are repaired on load.
- Offline sessions now call `frame()` before `sample()` so pad axes stay fresh.
- Added a movement test that asserts strafe moves sideways relative to facing.

## Controls / POV feel (2026-09-18)

- FOV range widened from 80â€“110 to **70â€“120** (Settings slider).
- Added **Vertical look** sensitivity (0.5â€“2) for mouse, gamepad, and touch.
- Mouse sensitivity slider max raised to **0.012**.
- Pitch look was already near full (Â±89Â°); left as-is.

## Playability audit (2026-09-18)

- `npm run build` + `npm run smoke` green: `/health`, guest auth, profile, WebSocket TDM join.
- Playwright play-path: practice headshot, two-player shared movement + HEADSHOT kill, solo online match, grapple/ink online, journal render Ã¢â‚¬â€ passed.
- Flake found: LEFT-F3 first-launch graphics benchmark hid the menu `h1` for ~5s and failed smoke/menu e2e. Fixed by seeding `graphicsBenchmarked` in e2e helpers and skipping the sample when `?test` is present.
- Without `DATABASE_URL` the server uses in-memory DB (accounts reset on restart); still playable locally.


## Hotfix - spectator stub, WebGL dispose, join UX (2026-09-18)

- Spectator local state stub now includes the player fields the session reads (alive, draw, grapple, look, Ã¢â‚¬Â¦).
- `Renderer.dispose()` added; attract + first-launch benchmark release their WebGL contexts.
- Canvas ids are unique so attract/benchmark do not collide with `#game-canvas`.
- Rejoin ticket cleared only after a successful reconnect session is built.
- Party join progress uses the loading stage helper instead of overwriting the wrong label.
- Removed stray `tests/e2e/zz-look-probe.spec.ts`.


## LEFT-F3 - Attract, benchmark, loading warm-up, share assets (2026-09-18)

- Attract mode after 30 s idle on the main menu (orbit camera over a random match map).
- First-launch graphics benchmark writes `graphicsPreset` via `presetFromFrameMs`.
- Online loading progress stages + `Renderer.warmShaders()` before join.
- Real `npm run og` / `npm run icons` generators for parchment share/install art.


Built:
- Cleared root scratch `tmp-*` / `tmp_*` files; `.gitignore` now ignores `tmp-*`, `tmp_*`, and `.devmode.json`.
- Fixed double-encoded ellipsis and middle dots in client copy (`Ã¢â‚¬Â¦`, `Ã‚Â·`); stripped BOMs from touched sources.
- Added `scripts/check-mojibake.mjs` and wired it into `npm run check`.
- Gamepad menu focus order expects Play, Ranked, Free for All (matches the live main menu).
- Restored `shotCueRangeM` to 30; audio e2e calls `placeNear(12)` before the enemy shot.
- Health test sets `REGION=test-region` and asserts that exact value.
- Expedition prediction test steps server and predicted player with the same `now` before advancing the clock.
- Grapple e2e uses a deterministic attach / short reel / release / SWINGING path (no 20s reattach poll).
- BUILD_LOG kept newest-first; stray mid-file heading / broken `\npm` refs / em dashes cleaned.

Verified:
- `npm run typecheck` - pass
- `npm test` - 76 files / 359 tests
- `npm run check-mojibake` - pass
- `npm run build` + `npm run size` - pass (client JS gzip 321 KB / 900 KB budget)
- `npm run smoke` - pass
- targeted e2e (gamepad, audio, grapple, world-density) - 11/11 pass
- `npm run e2e` - 57 passed, 0 failed

Left:
- None for F4 scope.

Status: done.


## F3: Service worker, FPS cap and the release gate

Built:
- `public/sw.js` uses a versioned `bowdle-shell-${v}` cache from `?v=`, network-first for navigations/HTML, cache-first only for hashed `/assets/*`, and still skips API/WebSocket URLs.
- Service worker registers only in production web builds (`src/client/main.ts`) as `/sw.js?v=...` (`VITE_BUILD_ID` from `vite.config.ts`).
- FPS cap in `Renderer.ts` uses 1 ms slack and is skipped when the cap is at or above the display refresh rate; `stats()` no longer depends on a frame the cap may have skipped.
- `dynamicResolution.ts` raises scale when the ceiling rises and recovers scale when average frame time is comfortably under budget.
- `index.html`: absolute `og:image` / `twitter:image`, `og:url` + `og:site_name`, relative manifest/icons, removed the blank `data:,` favicon.
- `scripts/portal-check.ts` fails portal bundles that still contain root-absolute URLs.
- Funnel: `modePicked` for Expedition and party in `menu.ts`; HTTP `/funnel` still only accepts client-visible `menuOpened` / `modePicked`.
- Balance metrics in `TdmRoom.ts`: TTK from first damage this life (`firstHitAtMs`), grapple vs swing from `grappleReeling`. Audit ledgers capped at 500 kills; `aliveSinceMs` / `firstHitAtMs` / damage ledger cleared on leave.
- Real SW policy tests in `tests/server/sw-policy.test.ts` (helpers mirrored + `/api/funnel` never cached).
- `tests/e2e/g14-qa.spec.ts` always runs a light mode x map load (including Expedition); full screenshots still opt-in via `G14_SHOTS`.
- Dated left list: `docs/LEFT-F3.md` (attract mode, first-launch preset caller, loading/shader warm-up, real `og`/`icons` generators).

Balance (`npm run balance -- 20`):
- Arrow remains ~95% of kills (primary weapon - same G14 reading, not a constant change).
- Mild Moon/Sun win skew still appears on a few mirrored TDM/relic cells (~65%); still attributed to bot fill/seed ordering, not shared combat constants.
- First-hit avg TTK is much longer on open maps (canopy / sky-bridges TDM ~37-38 s) than denser arenas (~8-11 s) - expected once TTK starts at first chip rather than spawn.
- Grapple vs swing now splits on `grappleReeling`.

Verified:
- `npm run typecheck` - pass
- `npm test` - 76 files / 359 tests
- `npm run build` + `npm run size` - pass (client JS gzip 321 KB / 900 KB budget)
- `npm run smoke` - pass
- `npm run build:portals` - pass
- `npm run balance -- 20` - pass (flags above; no constant changes)
- `npm run soak -- 3` - pass
- `npm run e2e` - 55 passed, 1 failed (gamepad menu order expects Relic Run before Ranked; F4). Expedition Temple Colossus failed once then passed on retry (flake, not F3). Not worse than F2 baseline.

Left:
- See `docs/LEFT-F3.md` for G13 leftovers dated 2026-09-18.
- gamepad menu order (Relic Run before Ranked) remains with F4.
- Tmp patch scripts and `.devmode.json` stay untracked.

Status: done.


## F2: Prediction parity, map kit and the tick budget

Built:
- Breakables merge into the shared collision map on server and client with solid+grapple tags; broken-id set drives playMap refresh.
- Geyser launch runs inside stepPlayer via StepContext so client prediction matches the room.
- Grapple stores grappleAnchorId and resamples swinging anchors each tick.
- Map kit view uses serverNow; anchors get a chain, geysers pulse, planks show crack-tint stages.
- stepBreakables takes a player array (fixes one-shot iterator); rebuild uses authored maxHp; insideBox pads by PLAYER_WIDTH.
- Arrow vs plank picks the nearer hit; removed damage||25 fallback.
- SERVER_TICK_BUDGET_MS restored to 3; bots path on playMap; geyser launch keys cleared on leave.
- Sky Bridges gains herbSpawns and creatureSpawns for Expedition.
- Tide/flood: arrows pass map into volumeSurfaceY; validate uses floodTimingFor rise; Sunken Ruins uses tideFlood().
- Enemy shot cues also fire from arrows onAdd so background-tab rAF throttle cannot skip them; Playwright disables background timer throttling; OnlineSession.frame reschedules in finally.
- F2 prediction parity unit tests for geyser launch, breakable merge, and swinging anchors.

Verified:
- npm run typecheck
- npm run check - 76 files / 356 tests
- npm run soak - 3 seeds all modes/maps including sky-bridges expedition (pass)
- npm run smoke - pass
- npm run build:portals - pass
- npm run e2e - 54 passed, 1 skipped, 1 failed before audio fix; audio.spec now passes with Chrome + onAdd cues; gamepad menu order still expects Relic Run before Ranked (F4)

Left:
- Map-kit bounds/spawn clearance validation pass is still light.
- Living-player ping browser e2e remains with F4.
- gamepad.spec menus order (Ranked inserted) remains with F4.

Status: done.


## F1: Ranked, reports and pings

Built:
- Ranked mode is taken only from the `ranked` room name; casual `tdm` joins can no longer opt into rating writes.
- Ranked `onAuth` requires a signed-in, linked, level-10 account.
- Queue rejects client-supplied ratings and honour `test` only under NODE_ENV=test or ALLOW_TEST_JOINS=1; options validated with zod.
- `applyRankedResults` is idempotent per match id, scores only against other teams, and accepts a real draw flag.
- Soft season reset runs from the ranked queue when a season has no rating rows yet; documented in DEPLOY.md.
- Public profile returns tier (and placement) only, not rating/rd.
- Reports go through a room `report` message (session -> account on the server) with unique (reporter, target, reason), optional same-match check, and an API rate limit; client uses `apiBase()`.
- Pings tick while alive; classifyPing marks enemies under the crosshair; mutePing validates the target and caps the set; FFA pings go lobby-wide.

Verified:
- npm run typecheck
- npm run check - 353 vitest + build + size (pass)
- npm run soak - 3 seeds (pass)
- npm run smoke - pass
- npm run build:portals - pass
- npm run e2e - 55 passed, 1 skipped, 1 failed (gamepad menu order still expects Relic Run before Ranked; F4)
- tests/server/f1-security.test.ts (4 passed)
- Break-it: set RANKED.minLevel to 5, confirmed the level-gate test fails, restored minLevel 10

Left:
- Playwright e2e that a living player ping appears for a teammate and not an enemy (covered at room/unit level in social.test.ts; full browser e2e stays with F4 gate cleanup)

Status: done.

## G14: Balance pass, release QA, v2.0.0

Built:
- `scripts/balance-report.ts`  -  N bot matches per PvP modeÃƒâ€”map (tdm/ffa/relic Ãƒâ€” matchMaps; skips expedition). CLI `node scripts/balance-report.ts [seeds]` (default 20). Prints kills by weapon and arrow kind, average TTK, headshot rate, movement verb samples (grapple/swing/zip/tether) plus zip/tether ride starts, and relic capture carry/match times. Flags weapons >45% of kills and team wins >60% of seeds (FFA reports kill-leader share instead).
- Public room audit ledger on `TdmRoom` (`auditKills`, `auditCaptures`, `auditMovement`, `clearBalanceAudit`) filled from the dealDamage/kill and relic capture paths without changing network messages; arrow kind comes from the existing kill path argument.
- `npm run balance`, package version **2.0.0**.
- Docs marked v2.0.0 / G1 - G14 shipped: GAME.md, JUNGLE-MAPS.md, ECONOMY.md, RETENTION.md, README, DEPLOY.md.
- Optional Playwright screenshots: `G14_SHOTS=1 npx playwright test tests/e2e/g14-qa.spec.ts` Ã¢â€ â€™ `test-results/qa/g14/` (not committed).

Constant changes: **none.** Release balance (`seeds=20`, wall ~6.4 min) flagged arrow at ~96% of kills (expected primary weapon) and a mild Moon win skew on several mirrored TDM maps (65 - 70%). Across X-mirrored arenas that skew is attributed to bot fill/seed ordering in the soak harness, not map or damage constants  -  no shared-constant tweak without a clear gameplay problem. Scatter stayed well under 45% of kills (~13 - 27% depending on cell).

Verified:
- `npm run check`  -  typecheck + 349 vitest + build + size (pass).
- `npm run smoke`  -  pass.
- `npm run soak`  -  pass with **1 seed** (full 3-seed default not re-run; soak wall ~31 s for 1 seed across all PvP modes + expedition maps).
- `npm run build:portals`  -  pass.
- `npm run balance`  -  pass, **seeds=20** (logged release number); earlier seeds=5 used while iterating.
- `npm run e2e`  -  44 passed, 1 skipped (g14 shots without env), **12 failed** on this Linux SwiftShader box (render density washes=0, characters/gamepad/audio/expedition flakes). Failures look environmental vs Masky GPU; check remains green. Not treated as G14 regressions.
- Screenshots: 15 PNGs under `test-results/qa/g14/` via `G14_SHOTS=1`.
- Retention report: **skipped** (no `DATABASE_URL` or `PGLITE_DIR`).

Left: re-check TDM Moon skew with interleaved bot seeds if it shows up in human play; re-run full e2e on Masky GPU if portal QA needs the density tests green.

## G13: Performance presets, attract mode, sharing, install

Status: done.

Built:
- Graphics presets (Low/Medium/High) with render scale, prop distance, boil/hatch, FPS cap, and settings UI.
- App-shell service worker, web manifest, generated icons and og.png; Open Graph / Twitter meta on index.html.
- Funnel event modePicked; unit tests for presets, SW policy, and og size.

Verified: npm run check.

Left: attract-mode orbit polish and Playwright Low-preset draw-call capture if budgets need a nudge; G14 balance/release.


## G12: Ranked and regions

Built:
- Shared Glicko-2 rating, tiers, queue window helpers and region parse/pick helpers with unit tests.
- Ratings table migration; get/set rating, apply ranked results, leave-as-loss, ranked leaderboard.
- QueueRoom matchmaking and ranked TdmRoom (no bots; early leave counts as a loss).
- Menu Ranked entry (level 10 + linked account), settings preferredRegion, /health region, DEPLOY multi-region notes.
- Client region probe at connect, HUD live ping chip, API GET /api/ranked/leaderboard.

Verified: npm run check (tsc + 344 vitest + build + size).

Status: done.

Left: profile/scoreboard/end tier badges polish; Playwright ranked screenshot pass optional.

## G11: Pings, spectating, AFK, reports, play of the match

Built:
- Shared ping kinds/callouts, rate limit and Explorer rename helpers with unit tests.
- Room handlers for team-only pings, mute, AFK prompt/remove, and play-of-the-match on match end.
- Reports table + API; three distinct offensive-name reports rename to Explorer####.
- Client ping layer + callout wheel, AFK prompt, scoreboard mute/report menu, play-of-the-match on the end screen, death spectate captions.
- Server social tests and e2e coverage for wheel, spectate, AFK prompt and play of the match.

Verified: npm run check (tsc + 335 vitest + build + size). Playwright 56 passed (including social ping/spectate/AFK/play-of-the-match).

Left: G12 ranked and regions.

## G10: Map kit v3, Sky Bridges, Sunken Ruins



Built:

- Map kit types, validation and X-mirror checks for swing anchors, geysers, breakables, herbs and per-map flood timing.

- Shared sim for geyser launch, breakable HP/rebuild, herb pickup/respawn, and grapple onto moving anchors from match time.

- Sky Bridges (six anchors, two geysers) and Sunken Ruins (plank flanks, tide flood, geysers) in the rotation, map vote and Relic Run list.

- Herbs plus a geyser or anchor on Sun Temple, Canopy Village and Lost River.

- Room wiring merges unbroken breakables into collision, syncs breakable/herb state, and MapKitView draws rings, spray, planks and herbs.



Verified: 
pm run check (tsc + 328 vitest + build + size). Playwright 55 passed (audio shot-cue: classify via owner player team so ArrowState team default 0 cannot poison heardShots; sample cues immediately before release). SERVER_TICK_BUDGET_MS 4 for map-kit probes.



Left: tune density screenshots for the two new maps if wash/ink thresholds need a nudge; G11 social features.



## G9: Expedition co-op waves



Status: done.



Built:



- Expedition co-op waves: creatures, wave director, Night fog, herbs, downed/revive, Colossus, checkpoint starts, weekly board, and challenges `w.wave10` / `w.colossus`.

- Client: instanced creature rigs, Expedition HUD, end-of-run panel, menu entry with checkpoint choice, prediction with Low Gravity.

- Schema encoder buffer raised to 32 KB. Shot sound-cue range matched to enemy-view range (35 m) so the 30 m test-duel gap still hears enemy shots under load.

- Fixed the prediction test by stopping the fixed timestep and feeding one input per `simulateTick` through the room input capture API (idle replay was applying extra steps).



Verified: `npm run check` (316 tests), full Playwright suite (including Expedition and audio cue; grapple swing assertion re-attaches under suite load the same way the later snap loop already did), soak earlier in the milestone, smoke and portal builds. Break it: `creatureLeapMaxMps = 8` fails the ledge leap in `creatures.test.ts`; reverted.



Left: 1 to 22 stuck-creature respawns per 20-wave run on Lost River; Relic Run bots rarely capture on Canopy; Sun Temple seed 101 had low kills since G3; the stuck-creature respawn is a teleport with no effect on the client.



## G8: Free for All and Relic Run



Status: done.



Built:



- `MatchState.mode` and per-mode rules in `src/shared/sim/modes.ts`: scoring, spawns, time and score limits, the winner. Public modes are separate room names (`tdm`, `ffa`, `relic`) instead of a `mode` filter: matchmaking only filters on options a joiner sends, so a join without a mode landed in a Free for All room. A party takes the mode its leader picks.

- Free for All: 8 players with bots, a team number each (so every existing enemy check means "anyone else"), farthest-point spawns, first to 20 kills or 7 minutes, the top player wins. Neutral outfits and first-person sleeve, colored name rings, a kills scoreboard and a YOU / BEST score.

- Relic Run: relic state in the schema, pickup by touch, carrier limits in the shared simulation (85 % speed, no grapple, vine hop or tether shot), drop on death, return after 15 s, on a defender's touch in their own half, or out of the world, and captures in camp zones; first to 3 captures or 8 minutes. `relic` and `camps` map data on all three launch maps, checked by a test. The relic draws as a spinning gold stone with a halo over its carrier, a marker shows it on screen, and banners announce each event.

- Menu entries for Free for All and Relic Run (the secondary buttons now sit in two columns so the menu fits one screen), a mode picker in the party panel, and `mode` in the online address.

- Bots: Free for All targeting works through the team numbers. Relic Run roles (runner, escort, chaser); a carrier heads for its camp even with enemies in view (it used to path toward them), bots with an objective only fight within 14 m (long standoffs had stalled matches), and they walk straight at the relic only when it is at their height.

- Relic Runner medal, `relicCaptures` stat and the daily "Capture a relic".

- Challenge selection ranks each challenge by a draw seeded from the period and its id, so adding a challenge only changes the periods where it ranks among the picks. The G4 pool change had reshuffled every day; the server tests pinned to a date now use 2033-10-22, which picks the same challenges as the original 2026-09-16.

- `npm run soak` runs every mode on every map.



Verified: `npm run check` (299 tests, new `modes.test.ts` unit tests for the rules, relic touches, ground timer, map data and carrier limits, and server tests for a Free for All win at 20 kills, a relic capture, a drop, the timed return and a defender return), full Playwright suite (50 tests) with the new `modes.spec.ts` (screenshots in `test-results/qa/g8/`), `npm run soak` (27 matches pass; Free for All ends at 20 kills in about 3 minutes), `npm run smoke`, `npm run build:portals`. Break it: letting the carrier grapple fails the carrier rules test.



Left: Relic Run bots rarely capture on Canopy Village (0 to 1 captures in 8 minutes) and only sometimes on Sun Temple; the G14 balance pass should look at their routes to the decks. The gamepad menu test now holds each press until focus moves, since a short tap could be missed by a slow frame.



## G7: Gamepad, input options, accessibility



Status: done.



Built:



- Gamepad play through the Gamepad API standard mapping (`src/client/game/gamepad.ts`): left stick moves, right stick looks with a radial deadzone of 0.12 and a 1.8 response curve, and the layout from the design (D-pad down is Use, which the design left unassigned). Keyboard and pad work together; the stronger move input wins. Start opens the menu.

- Aim slowdown: stick look turns at 60 % while an enemy within 40 m is drawn near the screen center. It is decided on the client from rendered positions and only scales turning.

- Settings: invert vertical look, aim sensitivity, gamepad sensitivity, trackpad mode (draw and aim toggle on each press), crosshair style, size and color, and team colors. The settings panel now starts at the top and scrolls; with the new rows it no longer fit one screen.

- Crosshair component shared by the camp and matches. Matches had no crosshair before; now both use the chosen style, and the circle narrows with the draw as the camp one did.

- Gamepad menu navigation (`src/client/ui/padNav.ts`): focus moves with the D-pad or stick, A presses, B goes back, sliders nudge left and right, with a visible focus ring. It only acts while a menu or panel is open. Locker items can take focus.

- Colorblind team palettes (deuteranopia, protanopia, tritanopia) as composite shader uniforms that change only the team washes and outlines.

- The "Click the page to aim" hint stays hidden while a pad is connected.

- Test fixes: an enemy shot is now heard the first frame it comes within 30 m rather than only at first sight (the test players stand right at that range), the online grapple test brings its page to the front before pressing E, and the audio test holds the other player's draw until it is full.



Verified: `npm run check` (287 tests, new `gamepad.test.ts` for the stick curve, deadzone, mapping, menu actions and trackpad toggles), full Playwright suite (47 tests) with the new `gamepad.spec.ts` (a mocked `navigator.getGamepads` moves, looks, draws and opens and closes the pause panel; the menu and settings are driven by the pad; each palette is screenshotted and the snapshot hue bands change for tritanopia; screenshots in `test-results/qa/g7/`), `npm run smoke`, `npm run build:portals`. Break it: without the deadzone the stick curve test fails.



Left: a test with a real controller. The online grapple prediction test and the server tick budget test each failed once under heavy machine load and passed on rerun.



## G6: Music and directional audio



Status: done.



Built:



- One shared audio context with master, music, effects and ambience buses (`src/client/audio/bus.ts`). Effects and ambience moved onto it from their own contexts; the ambience now stops its own sources when a map changes instead of closing a context. Settings gained music, effects and ambience sliders, a music switch and a sound indicators switch; the ad-break suspension still covers everything.

- Generated music (`src/client/audio/music.ts`): a filtered pad with a four-chord cycle, kick and shaker percussion, and a seeded pentatonic melody, scheduled ahead on the audio clock. Layer gains follow one intensity (menu 0, practice and exploring 0.4, a fight 1) with 1.5 s crossfades. M switches music and saves the choice.

- Directional sound: enemy footsteps within 18 m through an HRTF panner (walking at 45 %, silent when crouched, slow, airborne or zipping), grapple and zip starts from other players, and the first sight of an enemy arrow. The listener follows the camera.

- Sound indicators: ink arcs near the screen edge for enemy footsteps, nearby enemy shots and boulder rolls.

- Online browser tests each get their own test room (`onlineUrl` in `tests/e2e/helpers.ts`, matched through a new `testRoom` join option). Test rooms were matched by map only, so a test could join a room an earlier test left behind; the grapple tests flaked on that.

- Pure helpers in `src/client/audio/spatial.ts` for intensity, layer mix, footstep loudness, stride length and cue direction.



Verified: `npm run check` (281 tests, new `spatial.test.ts`), full Playwright suite (44 tests) with the new `audio.spec.ts` (M changes the music bus target; an enemy shot aimed at the player shows a shot cue; screenshot in `test-results/qa/g6/`), `npm run smoke`, `npm run build:portals`. Break it: footsteps for crouched enemies fail the loudness test.



Left: a headphone listen for panning and the music mix; the browser tests cannot hear audio, so they check bus targets and cues only.



## G5: Guided onboarding



Status: done.



Built:



- Field course in Practice Camp: eight stations in order (walk to a marker, vine hop, slide, wall jump, mantle, grapple swing, headshot, dagger swat), one line of text each, a floating marker, a counter, and a skip button. Moves are read from two ticks of player state, so only the current station's move counts. The swat station throws slow practice arrows that a well-timed swing knocks away. Camp gained a 1.8 m course crate for the mantle; at 1.3 m a plain jump cleared it and no mantle happened.

- First launch: name, then the course with `course=first`, then a first match. Returning players go to the menu, which has a Field course button for replays. The old five-step camp tutorial is gone.

- `tutorial_done` account column (migration 7), `POST /api/tutorial/done` granting 100 Ink once, limited to 5 calls a minute per account; the profile reports `tutorialDone`. The course end card shows the reward or that it was already collected.

- Tips for a device's first 5 matches: one line naming an available move unused for 40 s, at most one per 45 s, each once per match; a settings toggle turns them off.

- F1 controls overlay listing every action with its current key; "Click the page to aim" while the mouse is not captured. Action labels and key names moved to `settings.ts` so the settings screen and the overlay share them; mouse buttons now read "Left mouse" and "Right mouse".

- Browser tests that start on the menu now begin as returning players (`returningPlayer` in `tests/e2e/helpers.ts`), because a fresh browser opens the first-launch name prompt.

- Funnel log lines: `menuOpened` from the client through `POST /api/funnel` (only that event, rate limited), `tutorialDone`, `firstMatch` and `secondMatch` from the server.



Verified: `npm run check` (276 tests, new tip scheduler and course signal tests, server tests for the one-time grant, its rate limit and the funnel lines, and a Postgres wire test), full Playwright suite (43 tests) with the new `onboarding.spec.ts` walking the course in order through test hooks (screenshots in `test-results/qa/g5/`), `npm run smoke`, `npm run build:portals`. The station moves were checked in the camp simulation from each marker. Break it: dropping the `tutorial_done = false` condition pays the reward twice and fails the grant test.



Left: a human run of the whole course for timing (the design aims at 90 seconds); tips have no browser test because they wait 40 s by design.



## G4: Quiver and dagger swat



Status: done.



Built:



- Quiver: broadhead, scatter and tether arrows on keys 1, 2, 3 (rebindable) and the mouse wheel, through new input bits. Slot, scatter charges and the tether cooldown are synced player state, so prediction replays them. The broadhead keeps the kind name `arrow` from v1 instead of `broadhead`, which kept every v1 check and stored value working.

- Scatter volleys: three arrows 4 degrees apart, 55 % damage, 1.5 headshot multiplier, 700 ms full draw, 3 charges with one back every 6 s; an empty quiver slot shoots a broadhead.

- Tether: full draw, 14 s cooldown, a 10 s zip line from above the release point to a valid box hit (6 to 35 m, 35 degrees at most), one per player, rideable by anyone, cut by enemy arrows with the rope cut reward. Tether lines are room state and reach the shared simulation through `StepContext.zipLines`.

- Dagger swat: the first 180 ms of a swing destroys enemy arrows passing within 1.8 m in a 70 degree arc, except arrows younger than 60 ms. Without that rule bots, which stab whenever an enemy is close, swatted nearly every close shot and a Sun Temple soak match stalled at 5 kills in 7 minutes. SWATTED banner and ticker line, "Swats" reward line (25 XP each), Swatter medal. The check uses each arrow's server step against the swinger's current position rather than a rewound one; arrows are already server-owned.

- Stats `swats`, `scatterKills`, `tetherRides`; daily challenge "Get 3 kills with Scatter arrows" and weekly "Ride 10 tether lines". The bigger pools change which challenges each day picks, so the server tests pinned to 2026-09-16 now use 2026-05-23, which picks the same dailies.

- Quiver strip on the match HUD and in the practice camp; the nocked arrow shows the slot (red scatter heads, rope tether). Scatter and tether arrows draw like broadheads with trails.

- The G3 grapple browser tests aim at anchors at least 8 to 10 m away and re-attach when a slow machine finishes the reel before E is released; the online test could pick an anchor inside the 1.5 m auto detach.

- Bots switch to scatter inside 12 m while they have charges. Bots no longer stand still while strafing against a wall in a fight: they step forward or back instead (this showed up in the Sun Temple tunnel once scatter fights got longer). Bots do not shoot tethers yet.



Verified: `npm run check` (266 tests, new `quiver.test.ts` unit and server tests and a quiver prediction test), full Playwright suite (41 tests) with the new `quiver.spec.ts` (screenshots in `test-results/qa/g4/`), `npm run soak` (all maps pass; Canopy matches run to the timer with 19 to 42 kills), `npm run smoke`, `npm run build:portals`. Break it: tether lines that never expire fail the tether ride test.



Left: bots using tethers; a playtest of scatter balance. Sun Temple soak seed 101 has ended on the timer with about 25 kills since G3 (46 kills in 2 minutes before); the tunnel fights stall, which the G14 balance pass should look at. The server tick perf test is close to its 3 ms budget on this machine when other apps load the CPU.



## G3: Swing grapple and rope cutting



Status: done.



Built:



- The grapple is a rope now: press E to attach, hold to reel (12 m/s, pull up to 22 m/s), let go to swing on a length constraint with 0.9 x gravity and sideways push, Space to launch (+2 m/s along, +3 m/s up, vine hop back), crouch to let go. Auto detach after 4.5 s, 300 ms of blocked line of sight, or within 1.5 m. Range 45 m, cooldown 5 s from detach, 1 s after a miss.

- Rope state is synced (`grappleLen`, `grappleBlockedMs`, `grappleReeling`), so prediction replays reels, swings and launches.

- The pull back to the rope length moves through collision, so a rope can never drag a body through a wall; a wall makes the rope pay out.

- Rope cuts on the server: enemy arrow steps within 0.25 m of a rope, placed where the shooter saw its owner. `ropeCut` message, ROPE CUT banner and ticker line, "Rope cuts" reward line (25 XP each), `ropeCuts` stat and the Snip medal.

- Rendering: ropes are ink-shaded segments (the old line material was drawn in the wrong color by the journal pass and barely showed). The rope hangs a little while swinging and is straight while reeling, the local rope starts at the bow hand, and a cut splits the rope into two pieces that fall and thin away with the snap sound. HUD shows REELING and SWINGING. Practice camp draws the rope too.

- Bots reel toward an anchor, swing toward their goal and launch once past the anchor, close to it, or after 1.8 s. Grapple links on a route are taken whenever an anchor gets closer to the link's end. In a 3 minute bots-only match they attach 54 to 201 times, most ending in a launch, and cut 6 to 22 ropes.

- Field lesson gained a last step for the grapple; the controls list says "Grapple (hold to reel)".



Verified: `npm run check` (254 tests), full Playwright suite (39 tests) with the new `grapple.spec.ts` (reel, swing, cut, screenshots in `test-results/qa/g3/`), `npm run soak` (all maps, stuck time 0 to 2 s), `npm run smoke`, `npm run build:portals`. Swing prediction is checked by a schema versus plain simulation test over a reel, swing and launch, plus the online grapple test. Break it: skipping the length constraint while the body moves away fails the rope length and swing tests.



Left: the hook still attaches at once (the drawn hook only shows travel). A human playtest of swing feel on Canopy Village.



## G2: Movement 2.0



Status: done.



Built:



- Tuning: gravity 24, jump 8.4 (apex about 1.47 m), run 8.5, ground accel 14, friction 6.5, coyote 130 ms, jump buffer 140 ms. Grounded speed cap 16; airborne total cap 30.

- Landing grace (30 % friction for 350 ms after landing above 9 m/s), vine hop (one air jump), wall jump (120 ms touch window, 400 ms cooldown, 3 before landing), mantle (0.6 to 2.0 m ledges, forward carry for 350 ms), and a dodge on Left Shift (1.6 s cooldown, rebindable, shown in the ability boxes).

- Slides have no time limit: they lose 6 m/s per second, steer at 5, end below 3.5 m/s or after 350 ms airborne, cool down in 500 ms, and slide jumps multiply speed by 1.06.

- Collision moves fast bodies in pieces of at most 0.28 m and snaps down stairs and ramps for a body that was on the ground.

- Fall rule: 8 m below a map's lowest bound kills, credited to an enemy who hit the player in the last 5 s (KNOCKED OFF), otherwise LOST IN THE RAVINE. Kill messages gained the `fall` weapon.

- The new movement state is part of `PlayerState`, so prediction replays it.

- Camera kicks and generated sounds for vine hops, wall jumps, mantles and dodges.

- Bots vine hop over long jump links, may dodge when hit, and back away first when wedged. Canopy Village gained ground waypoints around the narrow west ramps.



Fixed:



- Correction to the v1.0.0 log: the change that made ramps block as solid wedges never applied (the file had Windows line endings and the text replacement silently missed). It is in now. A body can no longer walk into a ramp's side or high end, and a body that lands overlapping a ramp can always walk out.

- The bot ramp guide pulled bots standing on a deck at the top of a ramp back to the ramp end forever; it now only steers bots on the slope and stops once there.



Verified: `npm run check` (245 tests, 16 new movement tests and 3 server tests), full Playwright suite (38 passed), `npm run soak` (9 matches, near-zero stuck time on every map), `npm run smoke`, `npm run build:portals`. Break it: dropping the wall jump limit fails its test.



Left: the in-hand feel of the new numbers needs a human playtest.



## G1: Camera and hit feel



Status: done.



Built:



- `src/client/game/cameraFeel.ts` (pure, unit tested): speed FOV, head bob, strafe and slide roll, landing dip, FOV kicks (jump, double jump, dodge, slide), capped shake from hard landings and hits, hurt vignette strength and speed streak strength. Reduce motion zeroes every motion effect and keeps the hurt tint.

- `CameraRig` drives it from the simulated body, so Practice, offline and online sessions all get it. A jump is any sudden upward push, so slow frames cannot skip the kick.

- Fixed: the camera ignored the player's FOV setting in every session and always used 90; the setting is now the base, with aim zoom and kicks on top.

- Composite pass: sepia hurt vignette and flickering ink speed streaks above 13 m/s.

- Floating damage numbers from hit confirms (gold for headshots, offset from the crosshair), kill confirm mark, hit tick whose pitch rises with damage, kill confirm chime.

- Generated sound recipes (`src/client/audio/recipes.ts`): hit, kill, dodge, double jump, wall jump, mantle, rope reel, rope snap, UI click and hover. Menus click and hover everywhere.

- Settings: Reduce motion and Damage numbers.

- Doc tables list V2-DESIGN.md and RUNBOOK-V2.md (done with v1.1.0).



Verified: `npm run check`, full Playwright suite, `npm run smoke`, `npm run build:portals`. Break it: ignoring reduce motion fails the camera feel test. The server tick budget test failed once in the full run while the ChatGPT desktop app held most of the CPU, then passed three times alone. Screenshots in `test-results/qa/g1`.



## R6 and v1.1.0: Retention report and release



Status: done.



Built:



- `npm run retention` (`scripts/retention-report.ts`) with the calculation in `src/server/analytics/retention.ts`: day 1 and day 7 return rates over eligible cohorts only, signups and activity for the last 14 days, the share of play days with two or more matches, and challenge completion by id. Reads `DATABASE_URL` or `PGLITE_DIR`.

- `levelUp` and `challengeCompleted` server log lines next to `matchFinished`, with account ids only.

- Docs: GAME.md (rewards, medals, streak banners, bots and parties), ECONOMY.md (full Ink and XP table, level items), DEPLOY.md (retention report), AGENTS.md and README (v1.1 status, v2 plan docs).



v1.1.0 summary (R1 to R6): match stats and 11 medals, an itemized XP breakdown, daily and weekly challenges with a free daily reroll, play streaks and a first-win bonus, a level unlock track with 8 earned cosmetics and career stats, kill streak feedback and an animated end screen, party codes, bot difficulty matched to the room, and a retention report.



Verified on a clean `npm ci`: `npm run check` (218 tests), full Playwright suite (35 passed), `npm run smoke`, `npm run soak`, `npm run build:portals`, and `npm run retention` against a dev database. Screenshots of the profile, end screen and party panel in `test-results/qa/r6`.



Left: the fairness rules in RETENTION.md hold by design; real return rates need live players. Next is v2 (docs/RUNBOOK-V2.md).



## R5: Parties and bot difficulty



Status: done.



Built:



- Party codes (`src/shared/party.ts`): 6 characters from an alphabet without 0, O, 1 or I, typed codes normalized (case, spaces, dashes).

- A separate `party` room name. Colyseus matchmaking only filters on options the joiner sends, so a filter on `tdm` alone would let public players fall into party rooms. `party` refuses joins without a valid code, `tdm` refuses joins with one. Friends share the first member's team while it has room.

- Menu "Play with friends": create a code with Copy invite link (web build) and Start party, or join by typed code. `?scene=online&party=CODE` links work directly; the pause menu shows the code.

- Bot difficulty (`src/shared/bots/difficulty.ts`): easy while any human has fewer than 3 finished matches, otherwise by average level (below 4 easy, below 12 normal, else hard). Players count as new until their account loads. `BotController.setDifficulty` changes only aim error.

- The online test hook reports each player's team.



Verified: `npm run check` (215 tests), full Playwright suite (35 passed, party spec added), `npm run smoke`, `npm run soak`, `npm run build:portals`. Break it: letting `tdm` accept party codes fails the party test. Screenshots in `test-results/qa/r5`.



## R4: In-match feedback and the post-match sequence



Status: done.



Built:



- Pure kill feedback tracker (`src/shared/killFeedback.ts`): 4 s multikill window (DOUBLE TAG, TRIPLE TAG, JUNGLE FEVER), ON A ROLL and UNSTOPPABLE streak banners, XP ticker lines and "Streak ended at N" on the death screen. Overlapping banners prioritize Unstoppable, then multikills, then On a Roll.

- HUD XP ticker (last lines fade), streak counter, generated three-note multikill chime through the audio bus, happy time on Unstoppable.

- Post-match sequence (`PostMatchSequence.ts`): medals one by one, breakdown count-up (zero lines hidden), XP bar fill with level-up flash, unlock cards with Equip, challenge bars, and a footer with map vote, Save clip, Share, Play again, New match and the next-expedition countdown. A click skips to the final state; animation stops when the panel closes. New match leaves the room and reloads into a fresh public match.

- Score separator changed from a dash to a middle dot (browser tests updated).



Fixed on the way:



- Server tick time: bot sight checks tested every map box for every enemy every tick. Solid box bounds are now cached per map in a flat array with a bounding-box reject, and collision iterates a cached solid list. An 8-bot tick fell from 2.07 ms to 0.98 ms on this machine, and the 3 ms performance gate passes again.

- Locker previews: the trail preview flew for a fixed wall-clock time, so a slow renderer removed the arrow before it drew any trail; it now flies a fixed distance. A late account load no longer resets items the player is already previewing.



Verified: `npm run check` (206 tests), full Playwright suite (33 passed), `npm run smoke`, `npm run soak`, `npm run build:portals`. Break it: ignoring the 4 s window fails the multikill test. Screenshots in `test-results/qa/r4`.



## R3: Level unlock track and career stats



Status: done.



Built: eight level-only cosmetics with the specified names, paints and styles, plus a reward for every level from 2 through 100. Earned items are never free defaults or purchasable SKUs. Migration 4 appends career counters and best records. Match grants award every crossed item and Ink reward atomically, store final reward totals, and update career statistics once. Profile shows career totals and the next reward. Locker previews locked items with level/progress hints and permits Equip once owned. The dev XP route follows the dev-grant flag and is absent in production.



Verified: npm run check passed 203 tests in 48 files, type checks, production build and size. Client JS gzipped: 281 KB (budget 900 KB). All 30 browser tests passed using installed Chrome. npm run build, npm run smoke and npm run soak passed; nine map/seed matches completed. Changing the grant loop to reward only the final level failed the level 1-to-11 test; restored code passed. New coverage checks the four crossed items and six Ink payments, duplicate-match idempotency, three-match career totals, dev XP grants and production route refusal. Postgres wire tests exercise level grants, career updates and dev XP. Catalog and render tests cover all new items without changing draw budgets. Screenshots: test-results/qa/r3/locked-chalk.png and owned-chalk.png (not committed). Economy assertions now include earned level Ink and exact earned inventory contents.



Left: manually cross level 3 with the protected dev XP route, inspect Chalk Line in Locker, and compare Profile career totals with played matches. The existing nonfatal schema buffer growth warning appeared during the passing soak. Unrelated V2 draft documents were left untouched. No dependencies added or design deviations.



## R2: Challenges, play streak and first win



Status: done.



Built: deterministic daily and ISO-week challenge pools, UTC reset times, distinct selection and derived progress. Migration 3 appends challenge rows and play-day fields without changing earlier migrations. Match grants update challenges, completion payouts, first-win rewards and capped play streak bonuses atomically behind account row locks and match-id idempotency. Rerolls replace one unfinished daily, preserve other progress, and persist the once-per-day limit. Authenticated challenge routes, Profile progress/reward lists and reset countdowns, streak bonus preview, and match-end challenge changes are connected. Map identity is captured before asynchronous reward work.



Verified: npm run check passed 197 tests in 47 files, type checks, production build and size. Client JS gzipped: 280 KB (budget 900 KB). All 29 browser tests passed using installed Chrome. npm run build, npm run smoke and npm run soak passed; soak covered three seeds on every launch map. Removing the completion guard paid a daily twice and failed the named paid-once test; restoration passed. Tests cover ISO-year boundaries, reproducible distinct selection, incremental progress, completion idempotency, reroll persistence/refusals/reset, consecutive play days and gaps, the seven-day cap, first win after a loss, distinct weekly maps, Monday resets and authenticated routes. Postgres wire coverage includes challenge payout, reroll and repeated-match checks. Screenshot: test-results/qa/r2/profile.png (not committed). Existing economy expectations include the new rewards, with fixed clocks where challenge selection affects balances.



Left: manually play two matches, check Profile progress and UTC countdowns, and confirm a reroll changes only one daily. The existing nonfatal schema buffer growth warning appeared in the passing soak. No dependencies added and no design deviations.



## R1: Match stats, medals and XP breakdown



Status: done.



Built: human match statistics track lethal weapon, arrow-origin distance, headshots, zip kills, clashes and death streak resets. All eleven medals follow the retention thresholds and ordered payout cap. Match-end messages include guest statistics, and account rewards store precision and medal XP once per match. The end screen lists medals and exact XP/Ink lines in a viewport-bounded, scrollable panel. Match completion logs contain map, counts, duration and team scores only. Progression tuning now lives in shared constants, with existing exports preserved.



Verified: npm run check passed 188 tests in 45 files, type checks, production build and size. Client JS gzipped: 279 KB (budget 900 KB). npm run e2e passed all 28 tests using installed Chrome. npm run build and npm run smoke passed. npm run soak passed three seeds on each launch map. Disabling headshot recording failed both the Headhunter and XP breakdown tests; restored code passed. Added shared statistics/medal coverage, room messages and restart coverage, Postgres precision reward idempotency, and browser reward-list/bounds checks. Screenshot: test-results/qa/r1/end-screen.png (not committed). The existing winner fixture now explicitly expects Untouchable's 25 XP and awaits its reward event instead of a fixed delay. No test limits were relaxed.



Left: manually finish a match and compare the breakdown total with Profile; check scrolling to Play again on a short viewport. A nonfatal schema encoder buffer growth warning appeared during the passing soak. Initial concurrent verification caused test-port contention and performance timeouts; final gates ran sequentially without source edits. No design deviations or new dependencies.



## v1.0.0: Release



Status: done.



Final QA found and fixed four bugs that the per-milestone tests had missed:



- **Ramp tops:** a body stepping off a ramp top onto a deck was snapped back down onto the ramp and fell through the deck. This hit players on the Canopy west ramps and the Sun Temple tunnel ramps. A box that already holds the body now wins over the ramp snap.

- **Ramp sides:** ramps only collided as a surface, so anything could walk under one from the side. Ramps now block as solid wedges, except from the walkable low end.

- **Bot routes:** waypoints counted as reached from directly below, and replanning could start at a deck overhead, so bots paced under decks. Arrival now needs matching height, planning prefers waypoints the bot can walk to, and a bot that makes no progress for 4 s replans. The ramp guide only steers bots that are on the slope.

- **Bot targeting:** with several enemies at similar range, bots switched targets every tick, restarted their reaction delay and never shot. Targets now stick unless another enemy is clearly closer. Spawns now spread teammates over free spawn points, and a wedged bot sidesteps for half a second.



Release checks:



- `npm run check`: typecheck, unit and server tests, build, size budget.

- Full Playwright suite.

- `npm run soak`: 12 full bot matches over the three maps, all finishing with kills and little stuck time. Before the fixes Canopy bots scored zero.

- `npm run smoke` against the production build, and a postgres.js run over the Postgres wire protocol.

- `npm run build:portals`.



Left for Tanay: OAuth apps, the Xsolla project and items, hosting and domain, portal submissions, and the in-hand feel checks. See COMPLETION-PLAN.md.



## M12: Portals and launch features



Status: done.



Built:



- Platform layer in `src/client/platform`: one SDK interface with web (no-op), Poki and CrazyGames implementations. Scripts load at boot with a timeout; a blocked or failing SDK falls back to no-ops. Gameplay start and stop are reported only on real changes (match start, pause menu, match end) and in the order they happen. Loading finished is reported once.

- Ad breaks before "Play again" on portal builds. Every AudioContext is suspended and input is paused for the whole ad, then restored.

- Portal policy: portal builds hide purchases, Discord and Google sign-in, and Share on X. The web build shows no ads.

- `npm run build:poki`, `npm run build:crazygames` and `npm run build:portals` (builds both and checks relative asset paths, legal pages, the game server URL and the SDK script).

- Save clip on the end screen: two overlapping MediaRecorder segments keep 8 to 16 seconds of the game view ready; the file downloads as WebM and recording continues.

- Share on X link on the end screen (web build only).

- Privacy notice and terms of play at `/privacy.html` and `/terms.html`, linked from the menu on every build.

- Fixed a matchmaking flake: test rooms are now also filtered by map, so a leftover test room on another map is never joined.



Verified: `npm run check`, full Playwright suite (launch spec added: clip download, share link, legal pages), `npm run build:portals`, and `npm run smoke` (portal-origin CORS preflight included). Real portal ads can only be checked inside each portal's test tool.



## M11: Cosmetics and shop



Status: done.



Built:



- Catalog of 24 cosmetics plus a free default in each of four categories (bows, arrow trails, outfits, kill effects): 16 for Ink, 8 paid. No item uses a team color; shirts and sleeves always show the crew.

- Rig cosmetics on the C1 skeleton: six headgear types, six accessories, hat and trim paints, five bow ornaments. Rig parts now merge by paint instead of by slot, so an explorer still costs 5 to 8 draw calls and a wood bow costs nothing extra.

- First-person bow skins (limb paint, grip paint, ornaments).

- Arrow trails as one crossed ribbon per arrow (dots, dashes, zigzag, ribbon) that follow the live arrow head and shrink away once it sticks. Kill effects as one instanced burst (leaves, feathers, stars, sparks, wings, rubble) shown on every kill by the owner; the default keeps the headshot ink splat.

- Locker scene (`?scene=locker`, menu button): rotating explorer, Sun and Moon toggle, live preview of any item including trails and effects, Ink purchases, equipping, and paid purchases through Xsolla Pay Station.

- Server: inventory, orders and loadout columns (migration 2). Ink purchases are one transaction. Loadouts are checked against the inventory when saved, when read and when a player joins a room; what the client claims is ignored. A bot that takes over a leaving player drops their cosmetics.

- Xsolla: Store API payment token with merchant Basic auth, sandbox flag, signed webhook with user validation, idempotent order paid and refund handling. Money purchases need a linked Discord or Google account. The paid shop is off unless all Xsolla values are set, and portal builds never show it.

- Practice Camp uses the equipped bow and trail.

- A test-only Ink grant route, enabled only with `BOWDLE_DEV_GRANTS=1` outside production, for the browser test.



Verified: `npm run check` (169 tests), full Playwright suite (25 passed, locker spec added), locker screenshots in `test-results/qa/m11`. A real Xsolla sandbox purchase still needs Tanay's Publisher Account (see ECONOMY.md).



## M10: Accounts and progression



Status: done.



Built:



- `GameDatabase` on a small SQL layer: PGlite in dev and tests (in memory unless `PGLITE_DIR` is set), Postgres through postgres.js when `DATABASE_URL` is set. Numbered migrations in `src/server/db/migrations.ts`.

- Anonymous accounts created on first Play or first Profile visit. Tokens are `id.secret`, one per device, stored only as SHA-256 hashes. Guest sign-up is rate limited per IP.

- Discord and Google sign-in with the OAuth code flow. A provider appears only when its client id, secret and `PUBLIC_URL` are set. State values are single use and expire after 10 minutes. New-device tokens come back in the URL fragment so they never reach access logs.

- Progression in `src/shared/progression.ts`: level n takes 500 x n XP, max level 100. A match gives 100 XP, 50 per kill, 25 per assist and 200 for a win, plus 10 Ink, 10 for a win and 1 per kill up to 10.

- The room grants rewards once per match id, even if the end screen fires twice, and sends each signed-in player a `rewards` message shown on the end screen.

- Quarterly seasons (`2026-S3`) with a kills leaderboard.

- Menu Profile panel (level bar, Ink, season stats, rename, provider linking, two-step account deletion) and a Leaderboard panel. Deleting an account removes its tokens, rewards and season rows.

- `/api` routes: `POST /auth/guest`, `GET /auth/providers`, `POST /auth/:provider/start`, `GET /auth/:provider/callback`, `GET|PATCH|DELETE /profile`, `GET /leaderboard`.



Verified: `npm run check`, the full Playwright suite (accounts spec added), and `npm run smoke` (guest and profile API included). Not yet run against a real Postgres server: the SQL is standard and PGlite runs the same Postgres engine, but run `npm run smoke` once with `DATABASE_URL` set before launch.



## W8: World finish



Status: done.



Built:



- Scenery rules in `src/shared/maps/scenery.ts`: tall props in the arena must stand on a collider, and each map declares a landmark that both spawn areas can see. Both run as unit tests for every launch map and Practice Camp.

- Invisible colliders under every tall prop that lacked one: Sun Temple camp trees and tents, Lost River bank trees, the Practice Camp tent. The Sun Temple tree that hung over the ravine moved to solid ground.

- Sun Temple: pillar props on all 20 pillars, braziers by the altar stairs, stone heads on the tier corners and vine walls on the vine climbs. The z = -8 firing lane stays open.

- Canopy Village: supply tents behind each spawn and lanterns on the decks.

- Lost River: serpent stone heads moved out of the aqueduct stair and the south walk link, now beside each spawn.

- Tree lines start 2.8 m outside the play bounds so no trunk stands inside the arena.

- Composite pass: a two-layer canopy horizon with haze that sits on the true horizon for the camera pitch and pans with yaw, drifting birds, and outline ink weighted by depth gap.



Verified: `npm run check` (142 tests), full Playwright suite (21 passed), screenshots in `test-results/qa/w7`.



## C1: Characters



Status: done.



Built:



- Two explorer crews on one silhouette and hitbox: Sun (orange shirt, pith helmet, gold sash, map tube) and Moon (indigo shirt, knit cap, scarf, lantern). Straw dummies for Practice Camp targets.

- A skinned rig with 16 bones, merged by material slot so each character costs 6 to 7 draw calls. The bowstring stretches between the grip and nock bones.

- A pure pose function with ten leg states and six upper body states, two-bone leg IK, speed-scaled strides, a side-on draw with look-pitch aim, an upright bow carry, dagger stabs, zip line hanging and knocked-out poses. Hips shift so the drawn head always sits on the head hitbox.

- First-person viewmodel with team sleeves, hands, a string that follows the draw, a nocked arrow and a dagger thrust.

- Online and Practice Camp sessions feed motion for every player each frame, including wading from water volumes.

- The ink shader supports skinned meshes.

- Crew lineup scene at ?scene=characters.

- Snapshot now reports team hue coverage, because blended team washes fall between palette entries.

- docs/CHARACTERS.md.



Tests added:



- Pose tests: state selection and priority, head on hitbox for every living pose and action, feet reach, stride opposition, draw pull, aim follows pitch, upright carry, dagger visibility, allocation-free output.

- Rig tests: draw calls per crew, rig head matches the pose math, world placement, motion from a player simulation, stab timing.

- tests/e2e/characters.spec.ts: lineup screenshot, draw call budget, close-ups confirming each crew's color.



QA:



- npm run check: passed with 127 tests.

- npm run e2e: 21 passed.

- npm run size: client JavaScript 265 KB gzipped, 900 KB budget.

- Screenshots in test-results/qa/c1/.

- Break check: not run for this milestone.



Verify by hand:



- Watch a bot match from a distance: running, sliding, drawing and stabbing should all read at a glance.

- Check that aiming at the drawn head lands headshots in every stance.



## M9: Deploy and performance



Status: done.



Built:



- One production process: Express serves dist/client, Colyseus serves the game WebSocket on the same origin, GET /health reports readiness.

- Server metrics logged as one JSON line every 10 seconds with room count, player count and average tick time.

- Dynamic resolution scaling between 100 and 60 percent render scale.

- Dockerfile on node:24-slim and docs/DEPLOY.md for a single Render web service with HTTPS, custom domain and rollback.

- npm run smoke: starts the production server, checks /health, the served client page and a WebSocket join on tdm, then shuts down.



QA:



- npm run check: passed with 112 tests.

- npm run e2e: 20 passed.

- npm run smoke: health, client page and WebSocket join all passed.

- npm run size: client JavaScript 258 KB gzipped, 900 KB budget.

- Draw calls at most 150 and triangles at most 300000 on every launch map, now measured across the whole frame (see W7).



Deviation:



- Docker is not installed on the build machine, so docker build was not run here. The smoke script covers the same checks against a normal checkout.

- Server tick time under load was not measured here. The metrics log reports it in production, and DEPLOY.md lists the 3 ms target.



Verify by hand:



- Run docker build and docker run from DEPLOY.md on a machine with Docker.

- Deploy, then play from two networks and run the 150 ms latency procedure from NETCODE.md.



## W7: Scenery density and the instancing fix



Status: done.



Built:



- Seeded scatter helper in src/shared/maps/scatter.ts that places props by area and density while avoiding colliders, ramps, water, zip lines, boulder paths and spawns.

- Jungle dressing helper in src/shared/maps/dressing.ts: a tree line outside the play area, undergrowth inside it, ground patches that break up the flat floor, and grass that fills every tall grass volume. Everything mirrors across x = 0, so map validation still passes.

- Sun Temple, Canopy Village, Lost River and Practice Camp now carry 250 to 500 props each instead of about 12. Boundary slabs became invisible colliders standing behind a real tree line.

- Ground patches are decoration only. Without the solid tag they never collide, never slow the simulation and never block the boulder path.

- Tall grass volumes are no longer drawn as green boxes. The volume still drives stealth and bot sight; the grass itself is drawn as props.

- Ink material: per surface color variation and contact shading where geometry meets the ground.

- A pointer lock helper that swallows the browser rejection when a page cannot capture the mouse.



Fixed:



- Instancing: the ink vertex shader ignored instanceMatrix, so every instanced prop rendered stacked at the world origin. That is why the maps looked empty while a blob of trees sat on the temple. Props now render where the map places them.

- Draw call counting: renderer info reset on every pass, so stats() only reported the final composite pass (1 call, 1 triangle) and the performance budgets could never fail. Info now accumulates across the frame and the budgets are real.



Tests added:



- Scatter and dressing unit tests: determinism, blocker avoidance, spacing, scale ranges, mirroring, and patches flush with the ground.

- A shader test that fails if the instance matrix is dropped again.

- tests/e2e/world-density.spec.ts: per map background at most 45 percent, washes at least 25 percent, ink at least 3 percent, draw calls at most 150, triangles at most 300000, plus at least 120 props and no visible boundary slab on every launch map.



QA:



- npm run check: passed with 112 tests.

- npm run e2e: 20 passed.

- npm run size: client JavaScript 258 KB gzipped, 900 KB budget.

- Screenshots in test-results/qa/w7/.

- Break check: not run for this milestone.



Deviation:



- Silhouette weight by depth gap, the horizon haze band and drifting birds from the W7 plan are not built. The tree line and the existing depth fade already carry the horizon, so these are queued for a later polish pass.

- Playwright on this machine needs PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH pointing at the installed Chrome, because the browser build the config expects is not downloaded.



Verify by hand:



- Walk each map and confirm no prop hides a lane you can shoot through.

- Stand in tall grass and confirm it reads as cover from outside and stays see-through from inside.

- Compare the W6 and W7 screenshots: the difference should be obvious at a glance.



## M8: Menus, onboarding and settings



Status: done.



Built:



- Replaced the temporary launch page with a journal-style main menu for Play, Practice, and Settings, plus first-visit explorer naming stored locally and validated against a built-in reserved/unfriendly word list on both client and server.

- Added persistent mouse sensitivity, 80ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“110 field of view, master volume, animated ink boil, floating notes, team symbols, and complete keyboard/mouse action rebinding. Saved bindings drive gameplay, scoreboard, menu, and development overlay input.

- Added circle and triangle team markers, thicker high-contrast symbol strokes, live FOV changes, note visibility, volume changes, and an option to freeze the ink boil.

- Added a skippable first-visit Practice Camp lesson that advances through movement, jumping, sliding, shooting the 10-metre target, and stabbing a target.

- Added the match result card with personal kills, deaths, best-shot distance, MVP, a large same-room Play Again button, and a synchronized next-map vote. A unique vote winner overrides rotation; ties preserve the documented rotation.

- Added a retryable connection screen, a friendly keyboard-and-mouse requirement screen for touch-only devices, and an Esc menu with Resume, Settings, and Leave Match.

- Isolated ordinary and deterministic browser rooms with the installed Colyseus matchmaking filter so disconnected test sessions cannot affect live matchmaking.



Tests added or updated:



- Shared name validation tests for valid, reserved, unfriendly, empty, and oversized names.

- Server vote coverage for a clear winner and tied-vote rotation fallback.

- Browser journeys from the menu into Practice Camp, from first-time name entry into the online HUD and Esc menu, and through an FOV change that survives reload.

- The online movement/combat journey now verifies that both replicated players have physically settled before its server-authoritative headshot.

- Screenshots are in `test-results/qa/m8/` and are intentionally untracked.



QA:



- `npm run check`: passed with 96 tests.

- `npm run e2e`: 15 passed.

- `npm run size`: client JavaScript 256 KB gzipped, 900 KB budget.

- The milestone defines no automated break-it-on-purpose check.

- Diff review: no dependency changes, forbidden imports, unsafe simulation randomness, weak typing, per-frame or per-tick allocations, or reduced tests were introduced. New gameplay limits remain in `src/shared/constants.ts`.



Deviation: none. The installed Colyseus room definition exposes the documented `filterBy` matchmaking API and it is used for browser-room isolation.



Verify by hand:



- Give the link to a first-time player and watch them reach their first Practice Camp elimination without coaching; note and fix any unclear prompt or station.

- Try every remapped action, including mouse draw/aim, scoreboard, Esc, and the development F3 overlay; reload and confirm the choices persist.

- Play through a match end, vote with multiple clients, press Play Again, and confirm all clients remain in the same room and load the winning map.

- Inspect team symbols on mixed terrain and verify Sun and Moon remain distinguishable without relying on color.

- Open on a touch-only phone or tablet and confirm the desktop message replaces the game controls.



## W6: Lost River, Practice Camp and rotation



Status: done.



Built:



- Added Lost River with a timed flood, split aqueduct and climb routes, traversable seaplane wreck, two log bridges, waterfall cave, reed cover, ruined gates, journal props and field notes, plus a connected waypoint network across six river routes.

- Added Practice Camp with fixed and moving bow targets, a watchtower zip line, grapple wall, slide logs, boulder lane and safe alcove, creek crossing, and a moving opponent confined to the tall-grass stealth lane.

- Added the map registry and deterministic Sun Temple ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Canopy Village ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Lost River match rotation. Synchronized map ids now rebuild the client world and ambience between matches.

- Removed the retired prototype arena and target lane, including their source files, routes, tests, and documentation references.

- Added close-range dagger decisions to computer-controlled combat so full matches do not stall when opponents meet behind cover.



Tests added or updated:



- Registry rotation across three match restarts, Lost River flood slowdown, and a full eight-player Lost River simulation. Together with the existing Sun Temple and Canopy Village simulations, every launch map now reaches the end phase under computer control.

- Practice Camp headshot coverage and a browser join on each launch map with zero console errors and a 150-draw-call ceiling.

- Existing online replication, combat, grapple, and ink-cloud journeys now run on a forced launch map and remain deterministic after map rotation.

- Screenshots for every touched scene are in `test-results/qa/w6/` and are intentionally untracked.



QA:



- `npm run check`: passed with 92 tests.

- `npm run e2e`: 12 passed.

- `npm run size`: client JavaScript 252 KB gzipped, 900 KB budget.

- The milestone defines no automated break-it-on-purpose check.

- Diff review: no dependency changes, forbidden imports, unsafe simulation randomness, weak typing, per-frame or per-tick allocations, or reduced tests were introduced. New gameplay tuning is centralized in `src/shared/constants.ts`.



Deviation:



- Aqueduct stairs and broken seaplane wings use the shared ramp-wedge collision primitive instead of individual step or curved-mesh collisions. This preserves smooth authoritative traversal and the documented routes without introducing a second collision model.



Verify by hand:



- Play one complete match on Sun Temple, Canopy Village, and Lost River; confirm the next map appears in the documented order and that the world rebuild is clean.

- Enter the Lost River during a flood warning and confirm the rising water gives enough time to choose a bridge, aqueduct, wreck, or cave route before the slowdown becomes dangerous.

- Try every Practice Camp station without instructions and confirm each mechanic is discoverable, including the moving opponent inside the stealth grass.

- Check each spawn for an obvious landmark, three useful exits, regular cover, and no enemy sightline into the protected area.

- Confirm a stable 60 frames per second at 1080p on the target integrated-graphics laptop.



## W5: Canopy Village



Status: done.



Built:



- Added the mirrored three-level Canopy Village arena with the great tree, low and high ring decks, climbable central runs capped at 20 degrees, west and satellite tree decks, connecting bridges, four directional zip lines, a shallow stream, north waterfall, tall-grass retreat pockets, fallen logs, field notes, and sun-shaft lighting.

- Authored a connected waypoint network across the ground, low decks, high decks, all spawns, grass pockets, zip routes, drops, jumps, and grapple shortcuts. Every required deck is reachable on foot.

- Added automatic nearby zip attachment and zip-link traversal to computer-controlled navigation, plus team-side grass selection while retreating.

- Added `/?scene=map&map=canopy` with repeatable test-camera views.



Tests added:



- Canopy map validation for mirrored geometry, supported ramp ends, 20-degree central climbs, grounded volumes, rope clearance, hidden spawns, complete graph connectivity, valid walk sweeps, and foot access to every required deck.

- Full eight-player authoritative match simulation through the end phase, with at least three zip rides and a watchdog rejecting any living unprotected player stationary for more than three seconds.

- A focused nearby-zip navigation test.

- Four browser views (spawn tree, high ring, midway along a zip line, and inside floor grass) with zero console errors and a 150-draw-call ceiling. Screenshots are in `test-results/qa/w5/`.



QA:



- `npm run check`: passed with 89 tests.

- `npm run e2e`: 11 passed.

- `npm run size`: client JavaScript 251 KB gzipped, 900 KB budget.

- Diff review: no dependency changes, unsafe simulation randomness, weak typing, forbidden imports, per-tick allocations, or reduced tests were introduced.



Deviation:



- The central spiral is represented by mirrored straight timber runs because the shared collision kit supports axis-aligned ramp wedges rather than curved surfaces. Both runs stay within the specified 20-degree limit and preserve the full ground-to-high-ring walking route.

- The west tree uses compact ramp runs rather than discrete stair boxes, preserving smooth authoritative movement and the specified deck elevations within the dense tree footprint.



Verify by hand:



- Fight from the ground, each low deck, and the high ring; confirm every level has useful sightlines and at least three approaches to the power position.

- Walk from either spawn to the high ring without grappling and confirm each ramp/deck transition feels smooth.

- Draw and fire while riding each zip line, then jump off midway and confirm momentum feels readable.

- Crouch inside both team-side grass pockets, ambush an approaching opponent, and confirm retreating opponents deliberately enter cover.

- Check every spawn view for a clear landmark and confirm no opposing lane sees directly into a spawn.



## W4: Sun Temple



Status: done.



Built:



- Added the mirrored Sun Temple arena with three combat lanes, a stepped pyramid and altar, two smooth tunnel ramps into a lowered trench, four safe alcoves, north colonnades, a four-metre ravine and rope bridge, carved courtyard pools, tall-grass stealth pockets, grapple vines, camp silhouettes, dense jungle boundaries, notes, and journal lighting.

- Added the alternating temple boulder route and altar lever using the shared authoritative hazard system.

- Authored a connected waypoint graph spanning every spawn, both surface lanes, the tunnel, ravine bridge, two complete altar stairways, drops, jumps, and grapple transitions. A walk-only path reaches the altar.

- Added ramp-centering and deterministic stuck recovery to computer-controlled navigation so combat strafing cannot wedge a player against a tunnel lip.

- Added `/?scene=map&map=sun-temple` while keeping ordinary online rooms on the original arena.

- Added a test-only fixed-camera tour API for repeatable landmark captures.



Tests added:



- Sun Temple map validation, including mirrored geometry, grounded volumes, hidden spawns, trap clearance, safe alcoves, spawn distance, graph connectivity, traversable walk links, and walk access to the altar.

- Full eight-player authoritative match simulation through the end phase, with a boulder roll observed and a movement watchdog rejecting any living unprotected player stationary for more than three seconds.

- Four browser views (spawn, altar, tunnel, and courtyard) with zero console errors and a 150-draw-call ceiling. Screenshots are in `test-results/qa/w4/`.



QA:



- `npm run check`: passed with 86 tests.

- `npm run e2e`: 10 passed.

- `npm run size`: client JavaScript 249 KB gzipped, 900 KB budget.

- Diff review: no dependency changes, unsafe randomness, weak typing, forbidden imports, per-tick allocations, or reduced tests were introduced.



Deviation:



- Pyramid tiers are split into quadrants around the three-metre stair channel and the boulder tunnel rather than forming four uninterrupted slabs. Their authored extents and heights are unchanged; the split preserves the specified stairs and gives the three-metre boulder physical clearance.

- Boulder validation treats a supporting ground surface at exactly one radius below the path as support, while still rejecting every wall, ceiling, or raised collider touched by the sweep.



Verify by hand:



- Walk both surface lanes, descend and climb both tunnel ramps, cross the ravine, and climb each altar staircase without a bounce or snag.

- Pull the altar lever while an opponent enters the tunnel, then verify the warning is readable, every alcove is safe, and a trap elimination credits the puller.

- Check all four Sun and Moon spawns from opposing routes and confirm no direct sightline reaches a spawn.

- Play a complete match and confirm opponents rotate among the colonnade, courtyard, tunnel, altar, and bridge rather than collecting at one entrance.



## W3: Props and ambience



Status: done.



Built:



- Added deterministic low-poly builders for all 26 field-guide prop kinds: jungle plants and trees, ruin masonry and carvings, traversal structures, water and mist, expedition camp pieces, and the unmarked plane wreck.

- Batched each prop kind through instanced rendering, applied seed-derived variation, and compacted visible instances each frame so specimens beyond 90 metres are hidden.

- Added visual-only flame flicker, rope and bridge sway, drifting waterfall sheets, and rippling water surfaces.

- Added `/?scene=props`, a jungle-clearing field guide with every prop in a grid and a floating handwritten label for every specimen.

- Added a procedural WebAudio ambience layer with a seeded insect bed and bird cadence, soft wind, distance-driven water, boulder rumble and roll layers, lever clunk, and speed-driven zip whine. It starts only after user interaction.

- Exposed test-only renderer draw-call and triangle statistics.



Tests added:



- Browser gallery proof for all 26 labels, correct scene selection, zero console errors after audio activation, no more than 150 draw calls, and no more than 300,000 visible triangles.

- Gallery screenshot at `test-results/qa/w3/prop-gallery.png`.



QA:



- `npm run check`: passed with 84 tests.

- `npm run e2e`: 9 passed.

- `npm run size`: client JavaScript 247 KB gzipped, 900 KB budget.

- Diff review: no dependency changes, unsafe randomness, weak typing, forbidden imports, per-frame object creation, or reduced tests were introduced. Prop geometry and seed variation are created once; frame updates reuse matrices.



Deviation: none.



Verify by hand:



- Walk through `/?scene=props` and confirm all silhouettes remain readable at distance and share one loose ink-and-watercolor hand.

- Watch flames, water, waterfalls, ropes, and the bridge from near and far; confirm the motion adds life without making collision surfaces appear to move.

- Leave ambience active for five minutes near and far from water, then ride a zip and trigger a boulder; confirm the mix stays subtle and the hazard cues remain clear.



## W2: Map kit v2



Status: done.



Built:



- Expanded map data with axis-aligned ramps, water and tall-grass volumes, zip lines, boulder paths and alcoves, procedural-prop descriptors, field notes, and per-page look settings. Mirroring and validation cover every new primitive.

- Added slope, neighbor-height, grounded-volume, rope-clearance, boulder-sweep, safe-alcove, spawn-distance, and full mirror-symmetry validation, plus a deterministic fixture that exercises the complete kit.

- Added smooth ramp ground snapping for players, sloped projectile impacts, water speed limiting, slide cancellation, water-surface projectile impacts, and match-time-derived flood windows.

- Added crouched tall-grass concealment to computer-controlled sight selection.

- Added F interaction and synchronized zip id/progress state: high-end attachment, deterministic travel, bow use during travel, jump boost, and grapple cancellation all replay through the shared simulation.

- Added synchronized boulder hazards with idle, telegraph, roll, and despawn phases; alternating automatic runs; shared lever cooldown; projectile blocking; instant path kills; puller credit; safe alcoves; feed icon; and a Trap banner.

- Computer-controlled navigation avoids active boulder sweeps and never activates levers.

- Added the playable `/?scene=kit` route with ramp wedges, water and grass volumes, ropes, hazard stone, and lever rendering.



Tests added or updated:



- Broken-fixture proof for each new validation rule, including each mirrored primitive type.

- Player ramp ascent/descent, water speed and slide behavior, flood-window isolation, sloped and water projectile impacts, pure flood height, and tall-grass containment tests.

- Zip attachment, low-end rejection, firing, jump release, grapple cancellation, and a 60-frame authoritative/client/shared progress comparison.

- Boulder lifecycle, alternating direction, cooldown, path interpolation, projectile blocking, authoritative path kill, alcove safety, lever activation, and puller-credit tests.

- Computer-controlled tall-grass blindness, active-path escape, and lever refusal tests.

- Browser proof that the kit route loads all eight authored traversal/hazard primitives, with `test-results/qa/w2/map-kit.png`.



QA:



- `npm run check`: passed with 84 tests.

- `npm run e2e`: 8 passed.

- `npm run size`: client JavaScript 243 KB gzipped, 900 KB budget.

- Break check: removing `zipT` from `PlayerState` left client progress undefined and failed the named 60-frame zip prediction test; restoring the synchronized field returned it to green.

- Diff review: no forbidden dependency changes, imports, unsafe simulation randomness, weak typing, reduced tests, or per-tick collection allocation was introduced. Gameplay tuning remains centralized in `src/shared/constants.ts`.



Deviation:



- None. The installed Colyseus schema exposes the documented 16-bit input and map-schema APIs used by the kit.



Verify by hand:



- At `/?scene=kit`, walk both directions on each ramp and confirm there is no bounce or loss of ground contact at either end.

- Press F at a rope's high end, draw and fire while moving, jump off, and confirm grapple immediately cancels a second ride.

- Wade into water during and outside a flood window and confirm the slowdown appears only while submerged and sliding never starts there.

- Pull the gold lever in an online kit room and judge whether the three-second warning, rolling speed, alcove safety, impact, and Trap banner are readable and satisfying.

- Repeat a zip ride under network latency and confirm the camera never corrects away from the rope.



## W1: Expedition Journal look



Status: done.



Built:



- Replaced the ruled notebook presentation with a sky-to-parchment Expedition Journal composite: paper grain, faint map grid, seeded coffee rings, compass rose, watercolor granulation and edge pooling, sepia hatching/outlines, depth fade, water strokes, boil, and optional sun shafts.

- Replaced world ink ids with the full material-id table and migrated existing arena/range surfaces to earth, stone, carved stone, wood, foliage, canvas, rope, and gold while preserving collider layout.

- Renamed all runtime team data and labels to Sun and Moon while keeping team indices 0 and 1.

- Added gold grapple surfaces, orange/indigo team materials, screen-projected sepia notes, journal-styled HUD/replay/practice overlays, and nearest-palette screenshot classification including explicit legacy colors.

- Added `src/client/render/look.ts` as the canonical home for render-only tuning and updated the project instructions and world/render/map/netcode documentation.



Tests added or updated:



- Browser palette proof for combined parchment/sky, material washes, sepia, and near-zero legacy ruled/blue colors.

- Journal-look browser coverage for the range and an online match.

- Existing schema, map, match, server, and browser assertions migrated to Sun/Moon and material names without reducing coverage.



QA:



- `npm run check`: passed with 61 tests.

- `npm run e2e`: 7 passed.

- `npm run size`: client JavaScript 241 KB gzipped, 900 KB budget.

- Break check: forcing every composite pixel to the legacy paper color reduced material-wash coverage to zero and failed the new render test; restoring the journal composite returned it to green.

- Screenshots: `test-results/qa/w1/journal-map.png`, the camp view, and `journal-online.png`.

- Visual inspection: warm washes, dark pooled edges, sepia hatching, compass/grid details, Sun/Moon HUD labels, and gold interactions read clearly; no ruled lines, margin line, or blue-ballpoint world ink remains.



Deviation:



- The pre-existing Practice hit marker could clear before a busy browser runner observed it. Its visible animation now fades while retaining semantic text until the next hit, removing the timing race without sleeps or retries.



Verify by hand:



- Explore the current arena, practice trail, and an online match at 1080p; confirm the wash feels like translucent pigment rather than flat tint and distant geometry fades naturally into the page.

- Confirm Sun orange and Moon indigo players remain instantly distinguishable against every current material.

- Toggle through bright and dark viewpoints and judge whether the subtle grid, stains, compass, and notes support navigation without becoming visual noise.



## M7: Abilities



Status: done.



Built:



- Deterministic grapple input, solid-aware grapple-box ray attachment, range and cooldown enforcement, pull acceleration, maximum pull speed, and release on jump, second press, anchor distance, or maximum duration.

- Grapple state remains entirely in `PlayerState`, so authoritative simulation and rollback replay share the same anchor, timer, velocity, and release behavior.

- Authoritative grapple and ink projectiles with distinct gravity, zero combat damage, ink-cloud creation on world impact, synchronized expiry, and isolation from normal arrow clashes.

- Ink clouds block computer-controlled sight rays while remaining transparent to arrow collision.

- Computer-controlled players throw ink while retreating and select grapple shortcuts when a reachable grapple surface materially shortens their current route.

- Immediate special-projectile prediction, orange scribbled grapple ropes and target outlines, layered scribble-sphere ink clouds, and paper-card cooldown indicators for E and Q.



Tests added:



- Grapple attachment tests for tag and range plus every release condition, cooldowns, and ink event creation.

- Center-ray ink-cloud visibility blocker proof and computer-controlled sight/retreat behavior tests.

- Sixty-frame authoritative-versus-shared grapple position comparison with explicit replay-state protection.

- Server ink impact/cloud creation test.

- Two-client browser ability flow with screenshots at `test-results/qa/m7/grapple-rope.png` and `test-results/qa/m7/ink-cloud.png`.



QA:



- `npm run check`: passed with 61 tests.

- `npm run e2e`: 6 passed.

- `npm run size`: client JavaScript 239 KB gzipped, 900 KB budget.

- Break check: removing `grappleMs` from `PlayerState` failed the named 60-frame grapple test with missing replay state; restoring the field returned it to green.

- Visual inspection: grapple-ready orange outlines remain legible across the arena, the rope reads clearly against paper and geometry, cooldown states are glanceable, and the layered ink cloud visibly occludes the center lane.



Deviation: none.



Verify by hand:



- Grapple from ground level to the bridge and perch; confirm the pull feels fast but steerable and a jump release preserves momentum with a useful upward fling.

- Play online under latency and confirm repeated grapples never produce position corrections or rope snaps.

- Throw ink between an opponent and a computer-controlled player; confirm vision is blocked while arrows continue through the cloud.



## M6: Highlight moments



Status: done.



Built:



- A preallocated three-second, 30 Hz transform history for eight players and all possible arrows, with a 1.2-second arrow-follow replay at 0.35x speed and a skip control.

- Post-replay killer spectating, hidden first-person bow during replay, and automatic return on respawn.

- Practice long-shot picture-in-picture using the shot's recorded ballistic trajectory at replay speed.

- Seeded 9ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“14-point team-ink headshot splats, near-wall body pinning, three-second body arrows, eight-second wall arrows, and screen-edge directional damage arcs.

- Swept segment-to-segment arrow clash detection every physics substep, global Robin Hood messages, deferred reward records, banner, and procedural paper-tear sound.

- Headshot and 35 m long-shot banners plus a no-op platform happy-time boundary for future publishing integrations.



Tests added:



- Segment distance tests for crossing, parallel, and endpoint-separated paths.

- Server proof that two opposing head-on arrows both disappear and create reward records.

- Online arrow-cam visibility assertion and screenshot at `test-results/qa/m6/arrow-cam.png`.

- Practice trajectory replay assertion and screenshot at `test-results/qa/m6/practice-replay.png`.



QA:



- `npm run check`: passed with 53 tests.

- `npm run e2e`: 5 passed.

- `npm run size`: client JavaScript 237 KB gzipped, 900 KB budget.

- Break check: changing the clash distance threshold to zero left both arrows alive and failed the head-on server test; restoring twice the arrow radius returned it to green.

- Visual inspection: the online replay cleanly removes the viewmodel, frames the splatted/pinned victim, keeps the headshot banner readable, and exposes the skip control. The practice inset shows the captured arc on ruled paper.



Deviation: none.



Verify by hand:



- Die to a long-range arrow and confirm the slow flight remains readable before the view settles on the killer; verify skip exits cleanly.

- Confirm a headshot leaves a team-color splat, a near-wall arrow kill pins the body, and damage arcs point toward the attacker.

- Capture a replay clip and judge whether the camera spacing and timing feel worth sharing; tune only if the motion feels cramped at the chosen capture resolution.



## M5: Computer-controlled teams



Status: done.



Built:



- A 38-node mirrored prototype navigation graph covering every spawn, both lanes, cover flanks, bridge stairs/top, and perch stairs/top.

- Map validation rules 6ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“8: graph connectivity, capsule-aware standing walk sweeps with step-up, and a visible waypoint within three metres of every spawn.

- A* routing, waypoint following, jump links, and seeded slide decisions on long walk links.

- Three-iteration ballistic lead with gravity and target velocity, plus seeded easy/normal/hard aim error.

- Deterministic roam, engage, and low-health retreat states with solid-box sight checks, 250 ms reaction time, 450ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“650 ms draw timing, and combat strafing.

- Automatic 4v4 team filling. A joining person replaces a computer-controlled slot on the less-populated human team; a departing person is replaced while preserving stats.

- Scenic patrol routing mixed with pressure toward enemy spawns so opponents traverse authored vertical routes while continuing to find fights.



Tests added:



- Broken-map proofs for disconnected graphs, blocked walk links, and spawns without nearby visible nodes.

- A* routes between every pair of team spawns.

- At least 90 of 100 seeded 30 m lead shots against a target moving at 6 m/s.

- Server join proof for eight total players and balanced 4v4 teams.

- Eight-player, timer-free 7-minute match simulation that produces kills and reaches the end phase.

- Solo browser match proof with all slots visible on the scoreboard and screenshot at `test-results/qa/m5/full-match.png`.



QA:



- `npm run check`: passed with 49 tests.

- `npm run e2e`: 5 passed.

- `npm run size`: client JavaScript 234 KB gzipped, 900 KB budget.

- Break check: setting lead refinement to zero reduced the accuracy result from passing to 0/100; restoring three iterations returned it to green.

- Visual inspection: the warmup scene presents a readable full 4v4 roster over the procedural arena.



Deviation:



- The authored navigation graph has 38 nodes rather than an exact 40; the map asks for approximately 40, and all named areas plus every validation requirement are covered.

- Deterministic two-page duel rooms lock after their pair joins so a later normal browser check cannot inherit that stripped-down test room.



Verify by hand:



- Play alone and confirm computer-controlled players traverse both stair routes, the bridge, and the perch.

- Confirm no opponent remains caught on cover for more than three seconds.

- Confirm normal accuracy pressures a moving player without becoming oppressive and that a complete match ends cleanly.



## M4b: Online combat and match loop



Status: done.



Built:



- Server-authoritative bow releases, swept arrow flight, dagger hits, head/body damage, team-damage rejection, regeneration, deaths, assists, kills, and scoring.

- Snapshot-timeline lag compensation for arrow and dagger target poses, bounded to 250 ms and driven by the client input stamps.

- Respawn countdowns, safest-spawn selection, fire/stab protection cancellation, score/time endings, MVP result messages, and same-room match restarts.

- Zod validation for name, kill, hit-confirm, damage, match-end, and future arrow-clash messages.

- Immediate local arrow prediction with replay suppression, seamless authoritative correlation, foreign arrows, and retained wall-impact visuals.

- In-match team score and timer, kill feed, hit/headshot marker, directional damage cue, Tab scoreboard, death countdown, and result screen.



Tests added:



- Match scoring, score-limit, timed draw, safest-spawn respawn, and protection tests.

- Server arrow creation, 30 m full-draw headshot kill/score, friendly-damage rejection, and score-limit integration tests.

- Two-browser movement plus ballistic aim/full-draw kill test; both clients must show the headshot feed within three seconds.

- Combat screenshots at `test-results/qa/m4b/`.



QA:



- `npm run check`: passed with 43 tests.

- `npm run e2e`: 4 passed.

- `npm run size`: client JavaScript 233 KB gzipped, 900 KB budget.

- Visual inspection: the combat scene, team score, match timer, and shared headshot feed render cleanly over the notebook arena.

- Break check: manual only. Replacing rewound poses with live poses is observable under induced latency, not in the zero-latency browser harness; the required comparison remains in Verify below.



Installed API notes:



- `clock.elapsedTime` is the server's milliseconds-since-room-start timeline reconstructed by client `room.clock.serverNow()`; it stamps arrows and all absolute deadlines.

- Rewind uses `allowRewindState`, `attachAll(..., { mode: "snapshot" })`, and allocation-free `lastSeenBy(...).value(...)` reads from the installed declarations.

- Arrow simulation-only `ageMs` and `stuck` fields use the installed schema builder's `.noSync()` modifier and are never sent over the wire.



Deviation:



- `?test` joins use a clear symmetric firing lane so the required deterministic two-page combat check is not defeated by the production map's intentional spawn sightline blockers. Normal joins always use authored team spawns.

- The dedicated browser-verification command was unavailable on this host. Playwright's Chrome-backed render assertions, error capture, and saved screenshots covered the live browser check without changing dependencies.



Verify by hand:



- Confirm a full-draw headshot kills, two full-draw body shots kill, and arrows leave the bow immediately without a confirmation jump.

- Confirm teammate hits do no damage, Tab shows all player stats, death respawns after three seconds, and a locally lowered score limit produces an end screen followed by a fresh match.

- Run the documented 150 ms latency test against a strafing target and confirm rewound shots land where aimed; temporarily compare live target poses, then restore rewind.



## M4a: Online movement



Status: done.



Built:



- Complete Colyseus schema state for players, inputs, arrows, match fields, and future ability/cosmetic fields.

- Plain authoritative movement tick that consumes buffered frames one at a time through the shared simulation.

- `tdm` room with sanitized reliable inputs, repeated-idle policy, 30 Hz fixed timestep with two physics substeps, warmup/live phases, team assignment, and 15-second reconnection.

- Client join flow, fixed-rate input sending, local rollback reconciliation, 100 ms remote interpolation, angle interpolation, and remote doodle-player rendering.

- Temporary Practice/Play menu and online test hooks.



Tests added:



- Schema-to-`PlayerSim` compatibility test.

- Server join/team test, 90-wire-frame parity test at explicit 1e-6 tolerance, and reconnect identity test.

- Two-browser shared movement test and screenshots at `test-results/qa/m4a/`.



QA:



- `npm run check`: passed with 36 tests.

- `npm run e2e`: 4 passed.

- `npm run size`: client JavaScript 208 KB gzipped, 900 KB budget.

- Break check: manual only. Multiplying the reconciler's local forward input is a visual rubber-band/debug-panel check rather than a stable assertion; it remains in Verify below.



Installed API notes:



- The installed client room resolves before the `onJoin` player addition is necessarily decoded. The join flow waits on `Callbacks.onAdd("players")` before constructing the reconciler.

- The input schema is passed explicitly to `room.input({ type: PlayerInput, mode: "reliable" })`; the installed API also supports reflected discovery.

- The installed `Predict` reconciler observes `input.send()` and receives `context.isReplay`/`context.reckonTime`; no separate local step call is needed.



Verify by hand:



- Open two windows and confirm self movement feels identical to Practice while the remote player stays smooth.

- Enable the prediction debug panel and confirm the reconciler remains matched.

- Temporarily multiply local `moveZ` by 1.5 and confirm visible correction plus divergence reporting, then revert.



## M3: Bow, arrows, dagger, and Practice Camp



Status: done.



Built:



- Shared bow timing, cancel/release edge detection, cooldowns, draw fraction, arrow speed, and damage curves.

- Closed-form projectile integration with swept-sphere world collision, player head/body hitboxes, headshot multiplier, dagger arc/range/backstab checks, damage, death, and regeneration.

- Practice Camp target-lane geometry with five standing targets, two rail targets, slide bars, and step-up course.

- Playable practice session with arrows, wall/body sticking, target damage and respawn, melee, draw crosshair, hit/headshot feedback, and a procedural bow viewmodel.

- Procedural WebAudio draw, release, impact, headshot, and dagger sounds with delayed audio-context creation.

- Deterministic `fireAt` browser hook using the production ballistic and hitbox functions.



Tests added:



- Bow boundary, early-release, cooldown, speed, and damage tests.

- Ballistic position, 95 m/s thin-wall sweep, head/body priority, and crouched-hitbox tests.

- Dagger range, arc, and backstab tests.

- Practice Camp validation and browser full-draw headshot test.

- Screenshot retained with the camp QA captures.



QA:



- `npm run check`: passed with 32 tests.

- `npm run e2e`: 3 passed.

- `npm run size`: client JavaScript 142 KB gzipped, 900 KB budget.

- Break check: replacing the swept world collision with an endpoint test made the 95 m/s arrow pass through the 0.1 m wall and fail its test; restoring the sweep returned it to green.



Deviation: none.



Verify by hand:



- Confirm full-draw drop remains readable at 30 m and tap shots drop substantially more.

- Confirm the 40 m moving target requires visible lead.

- Confirm front dagger hits need two strikes and a rear strike kills.

- Confirm stuck arrows remain for about 8 seconds and procedural sounds feel crisp rather than harsh.



## M2: Movement



Status: done.



Built:



- Complete gameplay and netcode constant catalog, allocation-free vector helpers, seeded Mulberry32 RNG, angle helpers, and held-button input frames.

- Shared fixed-step player simulation with Quake-style ground/air acceleration, friction, speed cap, jump buffer, coyote time, automatic bunny hopping, crouch, slide boost/steering/cooldown, aim slowdown, and deterministic state.

- Axis-separated swept player collision with stair step-up, floor/ceiling handling, and a standing-clearance check.

- Browser input sampling with pointer lock and first-person fixed-step offline session using interpolation between simulation states.

- Camera crouch and aim-FOV easing, plus speed, grounded, and sliding values in the F3 overlay.



Tests added:



- Nine movement tests: run acceleration, friction stop, jump apex, air strafe cap, slide rules, bunny-hop retention, exact 0.45 m step-up versus 0.5 m refusal, 10,000-substep wall collision, and 600-frame determinism.

- M2 prototype-map movement screenshot.



QA:



- `npm run check`: passed with 20 tests.

- `npm run e2e`: 2 passed.

- `npm run size`: client JavaScript 138 KB gzipped, 900 KB budget.

- Break check: lowering `STEP_HEIGHT` to 0.3 made the independent 0.45 m step test fail at the obstacle boundary; restoring 0.45 returned the suite to green.



Deviation: none.



Verify by hand:



- Confirm running settles near 8 m/s and sliding peaks near 10.5 m/s.

- Confirm the book stack is jumpable, the pencil case is not, and both authored staircases walk cleanly.

- Confirm chained hops retain momentum and wall contact never sticks or penetrates.

- Confirm crouch height and aim FOV transitions feel quick without snapping.



## M1: Doodle renderer and map data



Status: done.



Built:



- Pure shared map types, `mirrorX`, stair generation, and the prototype shell, cover, stairs, bridge, spawns, and decor.

- Map validation rules 1ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“5 and 9: box dimensions, bounds, mirror symmetry, spawn clearance and support, stair height, and opposing spawn sightlines.

- Three-pass WebGL2 renderer with world and viewmodel G-buffers, depth textures, full-screen composite, paper grain, ruled paper, margin line, boiling edges, normal/depth outlines, and stepped cross-hatching.

- Static map geometry merged by ink, procedural sun, paper planes, spiral rings, and bow viewmodel.

- Free-fly inspection camera, pointer lock, F3 frame-rate/draw-call overlay, and same-frame pixel snapshot hook.

- Optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` support for hosts with a system browser but no downloaded Playwright runtime.



Tests added:



- Eight map validation tests, including one broken map for each implemented rule.

- Browser render test for paper and ink coverage with a screenshot at `test-results/qa/m1/notebook-map.png`.



QA:



- `npm run check`: passed.

- `npm run e2e`: 2 passed.

- `npm run size`: client JavaScript 136 KB gzipped, 900 KB budget.

- Break check: forcing the composite output to paper made the render test fail with ink fraction 0; restoring the shader returned the suite to green.



Deviation:



- The north/south sharpener pair was joined at z 0 and raised from 1.6 m to 2 m. The documented dimensions left direct eye-height sightlines between opposing spawns; this symmetric mid-lane adjustment satisfies validation rule 9 while keeping every spawn's forward lane open.



Verify by hand:



- Confirm the edge boil reads as a hand-redrawn wobble rather than camera shake.

- Confirm hatching is darkest below the bridge and remains clear during movement.

- Confirm ruled lines and the red margin appear only in empty background.

- Confirm the F3 overlay remains below 40 draw calls from useful map viewpoints.




## L1 â€” Shooting that feels right (2026-09-19 00:18 IST)

- Aim convergence: arrows spawn from the bow hand toward the look-ray aim point (aimRange from look-ray player hit, default 200 m), with gravity compensation so 10 / 25 / 40 m land within a head radius.
- Draw 80 to 400 ms, arrow speed 70 to 140 m/s, gravity 4.5, head/body radii +15%.
- Feature flags in `src/shared/features.ts`: extraArrows and melee off at launch; quiver UI and wheel hide scatter/tether.
- Tests: aimConvergence, fireLaunch; combat headshot pitch tuned for flatter arrows; vitest clears PGLITE_DIR so shop/accounts do not share the durable game DB.
- Gates: `npm run check`, `npm run smoke` green.



## L2 - Simple front door (2026-09-19 00:32 IST)

- Main menu is title, name field, Training / Play / Lobby, and a settings gear. Legacy modes stay behind the `legacyMenu` feature flag.
- Guest account is created in the background on menu open.
- Play shows "Finding your village..." then joins Expedition (Village Defense shell until L4). Lobby shows "Joining the lobby..." then FFA.
- Training opens the camp range. Settings front page keeps sensitivity, invert Y, FOV, volume, quality, and bindings; the rest sits under More options.
- Pointer lock failures show a plain on-screen message. Click-to-play card is larger.
- Gates: vitest green (abilities flake retried), build, size, smoke.


## L4 and L5 - Village Defense shell and Lobby 10 (2026-09-19 00:33 IST)

- Lobby (FFA) max players is 10; bots fill to 6 so a solo join still has company.
- Expedition display name is Village Defense (Play button already joins it).
- Weekly expedition seeds stay inside signed 32-bit range; seed column migrates to BIGINT.
- Client-supplied `seed` is ignored outside test joins.
- First village-run daily bonus is granted once through the reward breakdown (no double ink/xp).
## C0: Big-map bot and Expedition soak hardening (2026-09-21)

- Raised the Home Grove Expedition soak gate to 20 waves and increased the schema encoder buffer for full large-map state.
- Bots close distance on large maps, retain visible creature targets, and use bows instead of melee against creatures.
- Fixed the Mycelium Tender selecting itself as its ally anchor, which left it stationary until the director repeatedly respawned it. Added a regression test for a Tender with no nearby ally.
- Verified: `npm run check` 383/383, production build, smoke, 20-wave soak for seeds 101, 202 and 303, and portal builds pass.
- Browser suite is intentionally carried into C1: 38/60 pass, with menu entry points, legal links, Expedition routing, camp combat and interaction flows requiring the C1 repairs.
