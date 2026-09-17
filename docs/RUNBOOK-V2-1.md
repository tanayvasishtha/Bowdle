# Runbook v2.1: review fixes, then new features

Written after a full review of G9 to G14 (commits e0be21e to d4721db). Gates on this machine right now:
`npm run check` 349 tests pass, `npm run soak` passes on all five maps with 1 seed, `npm run build`, `npm run smoke` and
`npm run build:portals` pass. Playwright: 54 passed, 2 failed (`gamepad.spec.ts:77`, `world-density.spec.ts:20`).

Order: F1, F2, F3, F4, then N1, N2, N3. One commit and tag per milestone, same rules as `docs/RUNBOOK-V2.md`
(author Tanay Vasishtha only, no trailers, no pull requests, no new dependencies, no em dashes in docs or UI copy).
Every milestone ends with all gates green, a `docs/BUILD_LOG.md` entry, a tag `f1`, `f2` ... `n1` ... and a push.

Rule for this whole runbook: do not change a test threshold, a gameplay constant or a test assertion to make a gate pass.
Fix the cause. If a test is genuinely wrong, say so in BUILD_LOG and explain why the new assertion is stronger.

---

## F1: Ranked, reports and pings security and correctness

**Ranked (critical)**

1. `src/server/rooms/TdmRoom.ts:168` sets `rankedMode` from `options.ranked`, and `ranked` is in the `tdm` filter in
   `src/server/app.config.ts:18`. So `joinOrCreate("tdm", { ranked: true })` makes a public casual room write Glicko
   ratings for everyone in it, with leave-as-loss. Take the mode from `this.roomName === "ranked"` only, and drop
   `ranked` from every non-ranked filter.
2. `TdmRoom.onAuth` enforces nothing for ranked. Authenticate the token there and refuse the join unless
   `canQueueRanked(level, linked)` passes. A level 1 guest can currently move real ratings.
3. `src/server/rooms/QueueRoom.ts:21` returns true for any join sending `test: true`, and `onJoin` takes `rating`
   straight from client options. Honour `test` only in the test runner, always read the rating from the database, and
   validate queue options with zod like every room message.
4. `GameDatabase.applyRankedResults` has no dedupe, so a retry of `grantRewards` applies ratings twice. Add an
   `ON CONFLICT` guard like `recordMatch` uses. It also pairs teammates against each other as 0.5 draws: only score
   against opponents, and pass the real `drew` flag.
5. `softResetSeasonRatings` has no caller, so a new season hard resets instead of a soft reset. Call it on the first
   room created in a new season, or add a script and document it in `docs/DEPLOY.md`.
6. The rating is meant to be hidden (`docs/V2-DESIGN.md` section 13) but `rating` and `rd` are returned in the public
   profile payload and printed in `src/client/ui/profile.ts:49`. Return the tier only.
7. Tests: a server test that a level 9 or unlinked account is refused from the ranked room and the queue; a test that a
   `tdm` join with `ranked: true` does not write ratings; queue pairing with the fake clock through `debugPulse`;
   idempotent `applyRankedResults`. Break it on purpose: let a level 5 account queue and watch the new test fail.

**Reports (critical)**

8. `src/client/game/OnlineSession.ts:777` posts the Colyseus sessionId as `targetId`, which is never an account id, so
   `POST /api/report` answers 400 every time and the offensive-name rename can never trigger in a real match. Send the
   target's account id (the room has it; add it to the scoreboard data if needed, but never expose account ids of other
   players to the client more than the feature needs: prefer a room message `report` that resolves the sessionId server
   side, which also fixes the next two problems).
9. That same call uses a relative `/api/report`, so it breaks on portal and multi-region builds. Use `apiBase()`.
10. `/report` has no rate limit, no uniqueness on (reporter, target, reason) and does not require that the two players
    shared a match. Three colluding accounts can rename anybody. Add the `allow(...)` limiter, a unique constraint and a
    same-match check.
11. Tests: route-level tests for auth, validation, the limiter and the rename threshold, plus one that a report filed
    from a live room actually lands in the table.

**Pings (high)**

12. `OnlineSession.ts:365` runs `tickPings` inside the `if (!this.me.state.alive)` branch, so pings do nothing while you
    are alive, which is the whole feature. Move the call out of that branch.
13. `classifyPing` is imported and never used: `sendPing` always sends `location` at a fixed 12 m. Raycast what is under
    the crosshair and send enemy, location, relic or anchor, per `docs/V2-DESIGN.md` section 12.
14. Decide and document FFA and Expedition ping behavior. In FFA every player has their own team, so a team-only ping
    reaches nobody.
15. `mutePing` adds any 64-character string to a per-client set with no cap and no check that the target is in the room.
    Validate the target and cap the set.
16. Tests: an e2e that a ping from a living player appears for a teammate and not for an enemy.

---

## F2: Prediction parity, map kit and the tick budget

1. **Breakables (high).** The server steps players and arrows against `playMap` (map plus unbroken breakables) while the
   client predicts against the raw map, so every plank wall on Sunken Ruins causes snap-backs, and the merged boxes lose
   the `grapple` tag. Put breakables into the shared collision map on both sides and pass the broken-id set through
   `StepContext` identically on client and server.
2. **Geysers (high).** `tryGeyserLaunch` runs only in the room, so the client never predicts the launch. Move it into
   `stepPlayer` driven by map data, with the per-geyser cooldown stamp on `PlayerSim` and in the schema.
3. **Moving anchors (high).** `src/shared/sim/abilities.ts` samples the anchor once at attach and freezes the rope point,
   so grappling a moving anchor does not follow it, which `docs/V2-DESIGN.md` section 11 and the map kit types both ask
   for. Store the anchor id and resample `anchorPosAt(ctx.nowMs)` each tick on both sides.
4. **Anchor rings drawn on the wrong clock (high).** `OnlineSession.ts:261` passes the animation frame time to
   `updateMapKit`, while the simulation samples anchors with server time. Pass `serverNow`, which is already computed in
   that function, so the gold ring lines up with the real grapple target.
5. **One-shot iterator bug (high).** `TdmRoom.ts:560` passes `this.state.players.values()` (an iterator) into
   `stepBreakables`, which iterates it once per breakable, so only the first breakable checks whether a player is
   standing inside. Pass an array and type the parameter `readonly PlayerSim[]`. The unit test passes an array, which is
   why it did not catch this.
6. **Arrow versus plank ordering (medium).** `TdmRoom.ts:283` tests the breakable before players and always consumes the
   arrow, so a player standing just in front of a plank takes no damage. Resolve whichever hit is nearer along the
   segment.
7. **Rebuild HP (medium).** `src/shared/sim/mapFeatures.ts:46` restores `BREAKABLE.defaultHp` instead of the authored
   `hp`. Keep `maxHp` on the runtime record.
8. **Tide is half wired (medium).** `src/shared/sim/arrows.ts:95` calls `volumeSurfaceY` without the map, so arrows use
   the global flood while players use the Sunken Ruins tide, and `src/shared/maps/validate.ts:227` checks clearance with
   the global rise. Thread the map or the resolved timing through both. Also either use `kit.ts tideFlood()` and `TIDE`
   or delete them, since Sunken Ruins hardcodes its own numbers.
9. **Put the tick budget back (medium).** `SERVER_TICK_BUDGET_MS` was raised from 3 to 4 to fit the map kit probes.
   Restore 3 and make the room fit it: cache the merged collision boxes instead of rebuilding a fresh array (which
   re-spreads every dressing patch) on each break and rebuild, and skip the herb scan for players at full health.
10. **Bots use the wrong map (medium).** Bots get `this.map`, not `playMap`, so they path and shoot through unbroken
    planks. Pass the same map the simulation uses.
11. **Validation and leaks (low).** Validate that anchors, geysers and breakables sit inside `bounds` and clear spawns
    and waypoint sweeps; remove `geyserLaunches` entries when a player leaves; replace the `arrow.damage || 25` magic
    fallback; make `insideBox` account for `PLAYER_WIDTH` so a rebuild cannot entomb a player.
12. **Rendering polish (medium, spec).** `MapKitView` draws a plain cylinder for anchors (no chain), a static cone for
    geysers (no spray) and a tinted plank (no crack stages). Finish these three.
13. **Tests.** Server tests for geysers, breakables and herbs through `TdmRoom` (none exist today), a prediction parity
    test for a geyser launch and for a breakable wall, and a Sky Bridges anchor grapple test. Give Sky Bridges
    `creatureSpawns` and `herbSpawns` so Expedition does not silently fall back to Sun Temple, then run the soak on all
    five maps in every mode with the default 3 seeds.

---

## F3: Service worker, presets and the release gate

1. **Stale app forever (critical).** `public/sw.js` is cache-first for `/` and `*.html` with the fixed cache name
   `bowdle-shell-v1` that no build step rewrites. After a deploy the worker never updates, so returning players keep an
   old `index.html` pointing at hashed asset files the server no longer has. Derive the cache name from the build, serve
   navigations and HTML network-first, and keep cache-first only for hashed `/assets/*`.
2. **Registers where it cannot work (critical).** `src/client/main.ts:186` registers `/sw.js` in every build, including
   the portal builds that are served from a subpath and `npm run dev`. Gate it on the web platform and production. The
   `/og.png`, `/manifest.webmanifest` and `/icons/*` links in `index.html` are root-absolute for the same reason: make
   them relative or emit them only for the web build, and extend `scripts/portal-check.ts` to catch root-absolute URLs.
3. **The FPS cap halves the frame rate (high).** `Renderer.ts:649` drops any frame that arrives sooner than
   `1000 / fpsCap`, and with the default cap of 60 on a 60 Hz display vsync jitter drops about half the frames, giving
   roughly 30 fps. Compare against the interval minus a small tolerance, or keep a next-deadline accumulator, and skip
   the cap when it is at or above the display refresh rate. Also make `Renderer.stats()` not depend on a frame that the
   cap may have skipped, since the performance budget test reads it.
4. **Dynamic resolution never recovers (medium).** `dynamicResolution.ts` only ever lowers `scale`, so switching from Low
   back to High leaves the render scale at 0.7 for the rest of the session. Raise it when the new ceiling is higher.
5. **Link cards and favicon (high).** `og:image` and `twitter:image` must be absolute URLs, `og:url` and `og:site_name`
   are missing, and `index.html:22` still has the old `data:,` icon link after the new one, so the app has no favicon.
6. **Finish the G13 items that are missing.** The BUILD_LOG says done, but there is no first-launch benchmark caller
   (`presetFromFrameMs` is unused outside its unit test), no loading screen progress or shader warm-up, and no attract
   mode at all. `npm run og` and `npm run icons` are stubs that generate nothing. Build these or move them into a
   written, dated "Left" list. Add `modePicked` for Expedition and party starts, and align the funnel event list the
   client sends with what `src/server/api/routes.ts` accepts.
7. **Make the service worker test real (medium).** `tests/server/sw-policy.test.ts` only greps the worker source, so the
   runbook break-it step (cache `/api`) cannot fail it. Run the worker's fetch handler against a fake `caches` and
   `fetch`, and assert that `/api/funnel` is never served from or written to the cache. Then do the break-it check.
8. **Balance metrics (high for G14's conclusion).** `TdmRoom.ts:216` reports time since spawn as time to kill, and
   `TdmRoom.ts:227` splits grapple from swing on the button bit instead of `grappleReeling`. Fix both (the damage ledger
   already has the first hit time), then rerun `npm run balance` with 20 seeds. The "no constant changes needed"
   conclusion in the G14 BUILD_LOG entry rests on those numbers, so revisit it after the fix, including the Moon win
   skew of 65 to 70 percent on mirrored TDM maps.
9. **Audit ledgers in production (medium).** `auditKills` and `auditCaptures` grow in every live room and are only
   cleared on a match restart, so a long Expedition run grows without bound, and `aliveSinceMs` entries are never
   removed when a player leaves. Gate the ledgers behind the test flag or cap them, and clean up on leave.
10. **Release gate.** `tests/e2e/g14-qa.spec.ts` skips unless `G14_SHOTS` is set, so the required screenshots of every
    mode and map were never captured in the release run, and it adds a fresh error collector inside its loop. Make it
    part of the normal run (or a documented script), hoist the collector, and include Expedition.

---

## F4: Repository hygiene, encoding and the two failing browser tests

1. Delete the roughly 40 `tmp-*` files in the repository root and add `tmp-*` and `.devmode.json` to `.gitignore`.
   `.devmode.json` is Colyseus dev state and must not be committed.
2. Fix the mojibake and byte order marks introduced during G9 to G12: `src/client/main.ts:79` shows
   `Opening the field journalâ€¦` to every online player, and `src/client/ui/profile.ts` has the same damage in two
   places plus `Loadingâ€¦`. Strip the byte order marks from `main.ts`, `tests/e2e/audio.spec.ts`, `QueueRoom.ts`,
   `src/shared/regions.ts` and `profile.ts`, and add a check to `npm run check` that fails on `â€`, `Ã¢` or `﻿`
   anywhere in `src`.
3. Rewrite `docs/BUILD_LOG.md` so entries run newest first with no stray `# Build log` heading in the middle (it is
   currently after G13), and fix the corrupted `\npm run check` text in the G10 entry. Remove the em dashes added to
   BUILD_LOG and `scripts/balance-report.ts`.
4. Put back the assertions that were replaced with retry loops or widened constants:
   - `tests/e2e/grapple.spec.ts:39` now polls for up to 20 seconds, re-pressing the key until the HUD happens to show
     SWINGING, and the `grappleActive` assertion is gone. The comment admits the first swing can auto-detach. Find out
     why it detaches, fix that, and restore a deterministic assertion.
   - `AUDIO_MIX.shotCueRangeM` went from 30 to 35 in G9 and then to 40 in G10 to keep the audio test happy. Put the
     design value back and move the test players closer instead.
   - `tests/server/health.test.ts:22` asserts `process.env.REGION || "local"`, which mirrors the implementation and can
     never fail. Assert a fixed expected value with the environment variable set in the test.
5. Fix the two failing browser tests: `gamepad.spec.ts:77` (menus and settings with a gamepad) and
   `world-density.spec.ts:20` (Sun Temple reads as a drawn jungle). Run each one on its own first. If either turns out
   to be genuinely environmental, say exactly which machine detail causes it in BUILD_LOG, do not just rerun it.
6. Revisit the Expedition prediction test in `tests/server/expedition.test.ts`: it now stops the fixed timestep and
   reaches into a private field to inject input, and it steps the server with `now = 1000 + frame * dtMs` while the
   predicted simulation gets `frame * 1000 / 30`, so anything time based could diverge without the test noticing. Use
   the same time base on both sides, and keep one test that drives real inputs through the public path.

---

## N1: Expedition depth (new features)

The mode ships, so the next step is to give players a reason to keep running it.

1. Expedition on all five maps: give Sky Bridges creature and herb spawns, and check the two new maps' waypoints let
   creatures reach every deck (F2 item 13 covers the spawn data).
2. Weekly Expedition: one seeded run per week, so every player gets the same wave order and modifiers, with its own
   board. Store the seed with the run so a result can be verified.
3. Two more creatures from a short design note you write first in `docs/V2-DESIGN.md`: something that forces players to
   move (an area denier) and something that punishes ignoring it (a healer or shielder for other creatures). Same rules:
   pure simulation, unit tests per behavior, instanced rendering, inside the draw call budget.
4. Run modifiers players choose: a short list of optional handicaps at the start of a run (fewer lives, faster waves)
   that raise the XP and Ink reward, capped so the Ink cap still holds.
5. End-of-run summary with per-wave detail: waves cleared, damage taken, revives, best wave, and whether it beat the
   personal best.
6. Tests: server tests for the weekly seed being stable inside a week and changing across weeks, unit tests for each new
   creature, an e2e screenshot of each new creature, and a soak that clears 20 waves on all five maps.

## N2: Progression, identity and the shop

1. Ranked rewards: a tier badge on the scoreboard and the end screen (only the profile has one today), plus one
   cosmetic per tier at season end. Cosmetic only.
2. Expedition rewards: a cosmetic for wave 10, 20 and a Colossus kill.
3. Career page: matches, win rate, favorite map, best shot, Expedition best, ranked tier history, drawn as the same ink
   style as the rest of the interface.
4. Recent players and friends: a short list of accounts you played with, an invite to a party from that list. Server
   side, with a block list that also mutes pings.
5. Shop pass: rotate a small featured set daily from the existing catalog, all still cosmetic, no loot boxes, no
   randomness for money.
6. Tests: server tests for tier rewards granted once per season, recent players privacy (no account ids leaked to other
   clients), and the featured rotation being stable within a day.

## N3: Reach and retention

1. Touch controls for tablets: the client shows a desktop-only page today. A virtual stick, a draw and release button
   and a look area, gated on pointer type, with its own settings.
2. Reconnect into a live match: the room already holds a seat for 15 seconds, so the client should offer to rejoin
   instead of dropping to the menu.
3. Watch a friend: a spectator seat in a party room, no input, free camera.
4. Daily and weekly Expedition challenges in the existing challenge pool, and a first run of the day bonus.
5. Server observability: a log line per match with mode, map, duration, bot count and region, plus a small
   `npm run report` summary. No personal data.
6. Tests: e2e for the touch layout at a tablet viewport, a server test for the rejoin path, and a spectator test that a
   spectator sends no input and scores nothing.
