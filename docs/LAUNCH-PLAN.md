# Launch plan: simple, big, smooth, addictive

Goal: ship Bowdle to real players in 2 to 3 days. Stop adding systems. Make three modes feel great.

Player feedback this plan answers:
- The main menu has far too many options.
- The maps are too small (every map is about 72 x 56 m, crossed in 8 seconds).
- Shooting does not feel right.
- The game should be as easy to pick up as a simple browser doodle shooter: open, click, play.

Reference games are inspiration for simplicity only. Never copy their code, names, art, maps or numbers.

## The game after this plan

Three modes, one screen to pick them:

| Mode | What it is | Players |
|---|---|---|
| Training | Offline range: targets, moving targets, a short parkour loop, controls card | 1, no server |
| Play (Village Defense) | Co-op waves: the Hollow Mask raiders attack your jungle village; protect the village totem | 1 to 4, starts solo instantly |
| Lobby | Drop-in free for all on one big map, instant respawn, 5 minute rounds | up to 10, bots fill to 6 |

Everything else stays in the code but is hidden behind a feature flag, so nothing has to be deleted or rewritten:
Ranked, Relic Run, team deathmatch, party codes, locker and shop, profile page, challenges panel, leaderboard page,
pings wheel, attract mode, service worker. They come back one at a time after launch if players ask for them.

## Rules for this plan

- Commit only as Tanay Vasishtha <tanayvasishtha@gmail.com>. No co-author lines, no AI or agent mentions. No pull
  requests. Push to main.
- Hide features with a single flags file (`src/shared/features.ts`), never by deleting working code.
- Fix causes. Do not loosen test thresholds or constants to make a gate pass.
- No new npm dependencies unless L6 proves they are needed for launch scale, and then say why in BUILD_LOG.
- No em dashes in UI copy or docs.
- Keep the frame and tick budgets: 60 fps on an integrated laptop GPU at the Medium preset, server tick under 3 ms.
- Each milestone: `npm run check`, `npm run build`, `npm run smoke`, the Playwright specs for what changed, screenshots
  in `test-results/qa/l<n>/` looked at, a BUILD_LOG entry, commit `L<n>: <summary>`, tag `l<n>`, push.

---

## L1: Shooting that feels right (do this first, it is the core of the game)

The bow must hit where the crosshair points, feel instant up close and reward skill at range.

1. **Aim convergence.** Today the arrow leaves from the eye with its own ballistics. Cast a ray from the camera through
   the crosshair, find the aim point (first hit on map or player within 200 m, else 200 m out), and launch the arrow
   from the bow hand toward that point, so a full-draw arrow at short and mid range lands exactly on the crosshair.
   Same math on client and server, in the shared sim.
2. **Snappier draw.** Quick shots from 80 ms, full draw at 400 ms (from 120 and 550). Tap fire must always shoot.
   Holding past full draw keeps the arrow ready without penalty.
3. **Faster, flatter arrows.** Speed 70 to 140 m/s (from 45 to 95) and less drop, so inside 40 m the arrow is almost a
   straight line and drop only matters on long shots. Keep headshots at 2x.
4. **Hit registration you can trust.** Keep server authority and rewind, but show the hit marker and damage number
   from the client prediction immediately, then correct if the server disagrees. Slightly larger body and head hitboxes
   (about 15 percent). Check that lag compensation rewinds to the shooter's view time, and test at 150 ms ping.
5. **Feedback.** Crisp release sound, hit tick, headshot ding, kill confirm, crosshair expands during draw and snaps
   tight at full draw, a small screen kick on release. Arrow trail visible from the shooter's view.
6. **Remove confusion.** Scatter and tether arrows, dagger swat and ink cloud stay in the code but are off at launch
   (feature flags). One arrow, one grapple, one dodge. Fewer buttons, more shooting.
7. **Tests.** Shared unit test: a full-draw shot at 10, 25 and 40 m lands within the head radius of the crosshair
   point. Server prediction test for the new launch math. An e2e that clicking at a training target at 20 m hits it.
   Break it: move the launch point back to the eye and watch the convergence test fail.

## L2: The simple front door

1. Main menu becomes: game title, a name field (prefilled, editable), three big buttons **Training**, **Play**,
   **Lobby**, and a small settings gear. Nothing else on the screen. No account prompt before playing; a guest account
   is created in the background.
2. First launch: name, then straight into Training with a three-step on-screen coach (move, jump, shoot), then a button
   into Play. No long course.
3. Pressing a button starts the mode in under 3 seconds on a normal connection. Show a short "Finding your village"
   or "Joining the lobby" line, never a blank screen.
4. Mouse look must work on the first click every time: lock the pointer on the first click of the canvas, show a
   large "Click to play" card whenever the pointer is not locked, relock after the pause menu closes, and handle
   `pointerlockerror` by showing a plain message. Add an e2e that checks the view turns after the first click in all
   three modes.
5. Settings keep only: mouse sensitivity, invert Y, field of view, volume, graphics quality, key bindings.
6. In-match HUD: health, ammo-free bow draw meter, score or wave, a small timer. Hide everything else.
7. Screenshots of the menu and the first 10 seconds of each mode.

## L3: Big maps

1. **Lobby map, "Wild Crossing":** about 200 x 160 m. A ruined temple in the middle, a river with bridges, cliffs and
   tree platforms for height, open meadows for long shots, tight ruins for close fights, zip lines and grapple points
   to cross it fast. 10 spawn areas spread around the edge, spawns pick the point farthest from living players.
2. **Village map, "Home Grove":** about 160 x 160 m. Your village in the middle (huts, the totem, walls with gaps,
   watchtowers to shoot from), jungle all around, 4 raider entry paths from the edges so waves come from different
   sides, herbs to heal between waves.
3. Build both with the existing map kit and generators (boxes, ramps, volumes, dressing, waypoints), mirrored or
   balanced so no spawn is better than another.
4. Performance on big maps: instanced dressing, draw distance fog, impostor or low detail trees past 60 m, frustum
   culling for props, keep under 150 draw calls and 60 fps at Medium. Bots and raiders need a waypoint graph that
   covers the whole map; add a map test that every waypoint reaches every other.
5. Keep the five old maps in code but out of rotation.
6. Tests: `validateMap` on both, the waypoint reachability test, the world density and draw call budget e2e for both,
   and the soak for Lobby and Play on the new maps.

## L4: Play mode, Village Defense (the addictive loop)

Built on the Expedition code (wave director, creatures, downed and revive), reskinned and simplified.

1. **Enemy:** the Hollow Masks, a jungle raider tribe with painted masks. Reuse the creature simulation and give them
   humanoid ink rigs with masks and simple weapons:
   - Runner: fast, weak, sprints for the totem.
   - Spear thrower: keeps distance and throws.
   - Shield brute: blocks from the front, flank it or hit the head.
   - Torch bearer: goes for huts and walls.
   - Every fifth wave, a Chief boss with a glowing mask weak spot.
2. **Objective:** raiders attack players and the village totem. The run ends when the totem falls or every player is
   down. The totem has a health bar on the HUD.
3. **Loop that keeps people playing:** coins for kills and waves. Between waves, a 10 second shop with three random
   upgrades to pick one from (faster draw, double shot every fifth arrow, fire arrows, more health, faster grapple,
   totem repair). Upgrades last for the run. Score = waves cleared x kills bonus. Personal best and a daily top 20
   board on the end screen. "One more run" button right on the end screen.
4. Waves start easy and short (wave 1 under 40 seconds) and ramp. First death should come around wave 6 to 8 for a new
   player.
5. Solo starts immediately. Friends can join a running village between waves through a share link (reuse the party
   code under the hood, hidden from the menu).
6. Fix the Expedition bugs found in review before reusing the code, because this mode depends on them:
   - The migration inserted in the middle of `src/server/db/migrations.ts` must move to the end (it breaks existing
     databases).
   - The weekly seed overflows its INTEGER column; use BIGINT or keep seeds in signed 32-bit range.
   - The first run bonus is paid twice in `GameDatabase.recordMatch`.
   - The client can send its own `seed` and `testStartWave` in production; ignore both outside tests.
   - Handicap and creature bugs only if the handicaps or those creatures stay in the mode.
7. Tests: unit tests for each raider behavior and the upgrade picks, server tests for the totem loss, the coin and
   upgrade flow and the daily board, the soak running 15 waves with bots on Home Grove, e2e screenshots of wave 1,
   the upgrade shop and the Chief.

## L5: Lobby mode (up to 10 players)

1. Free for all on Wild Crossing, up to 10 players. If fewer than 6 humans, bots fill to 6. Rounds of 5 minutes, then
   a 10 second scoreboard with the top 3, then the next round on the same map. Instant join into a running round.
2. Respawn in 2 seconds with 1.5 seconds of spawn protection. Kill streak banners at 3, 5 and 8. A short
   "best shot of the round" line on the scoreboard.
3. Matchmaking: one room name `lobby`, `maxClients` 10, fills the fullest open room first so players see each other.
4. Tests: server test that the 11th player gets a new room, that bots leave as humans join, and a soak of Lobby rounds
   with 10 bots on Wild Crossing with no stuck bots.

## L6: Smooth, scalable, launch ready

1. **Smoothness:** interpolation delay tuned for 30 Hz ticks, no rubber banding on grapple and zip lines at 150 ms
   ping, prediction parity tests passing for every movement verb still enabled. Fix the review findings that cause
   snap-backs (the geyser and moving anchor clock mismatch) only if those map parts are used on the new maps.
2. **Client performance:** Low, Medium and High presets; the FPS cap must not drop frames on 60 Hz and must work on
   144 Hz screens; the first-launch benchmark must not overwrite a preset a returning player already chose.
3. **Server scale:** measure how many Lobby rooms of 10 and Play rooms of 4 one process runs under the 3 ms tick budget,
   write the number in `docs/DEPLOY.md`, and document how to run several processes behind the load balancer. Rate limit
   joins and API routes. Only add a presence/driver dependency for multiple processes if the measurement shows one
   process is not enough for launch traffic.
4. **Safety for launch:** the client `test` join option must do nothing in production; name filter on player names;
   the report button in the scoreboard works through the room message.
5. **Launch checklist in `docs/DEPLOY.md`:** production build, environment variables, database migration run,
   health check, domain and HTTPS, error logging, a 10 minute playtest of each mode on the production URL with two
   people, and a rollback step.
6. Full Playwright suite green, `npm run soak` green on the two new maps, screenshots of all three modes.
7. Package version 3.0.0, commit `v3.0.0: launch`, tag `v3.0.0`, push.

## Order and time budget

| Milestone | Target |
|---|---|
| L1 Shooting | half a day |
| L2 Front door | half a day |
| L3 Big maps | 1 day |
| L4 Village Defense | 1 day |
| L5 Lobby | half a day |
| L6 Launch ready | half a day |

If time runs short, ship after L5 with the old Sun Temple and Lost River in Lobby and Play, and do L3 right after
launch. Shooting (L1) and the simple menu (L2) are never skipped.
