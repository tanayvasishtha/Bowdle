# Fix plan: close the gaps and make main shippable

Written after a full audit of the L1 to L6 launch work. Measured state of `main` right now:

- `npm run check`: 381 of 382 pass. The failure is real: `tests/server/performance.test.ts` measured 3.35 ms per server tick against a 3 ms budget.
- `npm run build`, `npm run smoke`: pass.
- Playwright: **39 passed, 21 failed** of 60. Before this round it was 54 of 56.
- 5 files are modified and uncommitted in the working tree.
- 9 commits landed after the `v3.0.0` tag, so the tag does not match `main`.

The 21 browser failures are not 21 separate bugs. They come from four causes. Fix the causes, not the symptoms.

## Rules

- Commit as Tanay Vasishtha <tanayvasishtha@gmail.com> only. No co-author lines, no "Generated with" lines, no mention
  of any AI, model or agent in commits, code or docs. Never open pull requests.
- Fix causes. Never delete a test, loosen a threshold or widen a gameplay constant to make a gate pass. If a test is
  genuinely wrong because the design changed, update the test to assert the new intended behaviour and say why in
  `docs/BUILD_LOG.md`.
- No new npm dependencies.
- No em dashes in UI copy or docs.
- Each phase: gates pass, a `docs/BUILD_LOG.md` entry at the top, commit `C<n>: <summary>`, tag `c<n>`, push.

## Gates

```bash
npm run check
npm run build
npm run smoke
npm run soak
npm run build:portals
npx playwright test
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"`. The full browser run
takes about 20 minutes. Do not edit source while it runs, because the dev server reloads and tests break.

Target at the end of C2: **60 of 60 browser tests pass and `npm run check` is green.** Nothing later matters until that
holds.

---

## C0: Land the work that is already done (15 minutes)

Five files are modified and uncommitted right now. They are real fixes, not scratch work: bots that close distance and
see raiders on the big maps, a 20 wave soak gate, a bigger schema buffer for the large maps, and the matching doc
updates.

1. Read `git diff` and confirm the changes are coherent.
2. Run `npm run check` and `npm run soak`.
3. Commit them as `C0: land big map bot and soak fixes`, tag `c0`, push.

Nothing else in this plan is safe to build on top of an uncommitted tree.

---

## C1: Repair the browser suite, cause by cause

### Cause A: the simplified menu hid entry points the suite uses (about 13 failures)

`src/client/ui/menu.ts` moved Profile, Locker, Practice, Expedition, Free for All, Relic Run and the rest into a
collapsed `<details>` block. Collapsed content is hidden, so `getByRole("button", { name: "Profile" })` times out.

Decide once, then apply it everywhere:

- Keep the three big buttons as the front door. That part is right and the player feedback asked for it.
- Give every hidden entry point a stable, reachable path that does not depend on the collapsed block:
  a `?scene=` deep link, or a test hook, or opening the block by `data-testid`.
- Update the affected specs to use that path. This is a design change, so updating the test is correct here. Record in
  BUILD_LOG that the menu is intentionally three buttons and how the old screens are now reached.

Affected: `accounts.spec.ts`, `challenges.spec.ts`, `locker.spec.ts`, `menu.spec.ts`, `modes.spec.ts`,
`onboarding.spec.ts`, `party.spec.ts`, `postmatch.spec.ts`, `quiver.spec.ts`, `expedition.spec.ts` (the menu test),
`level-unlocks.spec.ts`, `gamepad.spec.ts` (expected focus order changed again).

### Cause B: the legal links were dropped (1 failure, and a real launch blocker)

`launch.spec.ts` fails because the Privacy and Terms links are gone from the menu. Portals require reachable legal
pages, and the pages themselves still exist. Put both links back on the menu, small, under the buttons. Do not change
the test.

### Cause C: Expedition and Village Defense do not boot on the old maps (5 failures)

`expedition.spec.ts` fails with `Cannot read properties of undefined (reading 'expedition')`, which means the online
session never started, and `[data-testid=wave]` never appears. The likely cause is the L3 rotation change: Sun Temple
moved to `legacyMatchMaps`, and the Expedition path now falls back or refuses when a legacy map id is requested.

1. Find out why the join fails. Run one spec on its own and read the browser console and the server log.
2. Fix the cause in the room or the map resolution, not in the test.
3. Point the Expedition and Village Defense specs at `home-grove`, the map the mode actually ships on, and add the
   totem, the between wave shop and the Chief to those screenshots, which L4 asked for and never got.

### Cause D: the practice camp headshot test (1 failure)

`camp.spec.ts` expects a full draw headshot to kill the 20 m target. L1 changed draw timing, arrow speed and gravity, so
either the new numbers are wrong or the test's expected result is stale. Work out which. If the shot genuinely no longer
kills, that is a gameplay regression in the core feature and the numbers are wrong, not the test.

### Also in C1

`tests/server/performance.test.ts` fails at 3.35 ms against the 3 ms budget. The aim convergence raycast added in L1
runs per shot on the server. Profile the tick, cache what can be cached, and get back under 3 ms. Do not raise the
budget. It was already raised once from 3 to 4 in an earlier round and put back.

---

## C2: Close the production holes

1. **`test: true` is still exploitable.** `src/server/rooms/TdmRoom.ts` sanitises the flag in `onCreate` but `onJoin`
   reads its own unsanitised `options`, so a direct WebSocket client can still pass `test: true` to the public rooms in
   production and wipe bots, teleport, and lock the room at two players. Gate it in `onJoin` the same way `onAuth`
   gates the ranked room, and add a server test that a production mode join ignores the flag.
2. **Ink cloud was meant to be off at launch.** Add an `ink` entry to `src/shared/features.ts` and gate the ability and
   its key binding, as scatter, tether and the dagger swat already are.
3. **Aim convergence is not shared.** The raycast that decides what the player is aiming at lives only in
   `TdmRoom.aimRangeAlongLook`, checks players only and never the map, and the client always uses a fixed 200 m. Move it
   into `src/shared/sim`, make it check map geometry as well as players, and call it from both the client prediction and
   the server. Add a prediction parity test. This is the core feature of the game and it is currently half wired.

---

## C3: Make Lobby real, or stop promising it

The plan specified a Lobby mode. There is no `lobby` room: Free for All stands in for it, and the numbers do not match
what the docs and UI say. Pick one and make everything agree.

Recommended: make it real, because it is small work.

1. Register a `lobby` room, `maxClients` 10, and point the menu button at it.
2. Round length 5 minutes, then the 10 second scoreboard, then the next round **on the same map**. Today `resetPlayers`
   rotates the map through `votedMap()`.
3. Respawn 2 seconds (it is 3), spawn protection 1.5 seconds (correct already).
4. Kill streak banners at 3, 5 and 8. Today they fire at 3 and 6.
5. Tests: an 11th player opens a new room, bots make way as humans join, and a soak of 10 bots on Wild Crossing with no
   stuck bots.

If you choose not to build it, rename the button and remove every mention of Lobby from `docs/DEPLOY.md`, the launch
plan and the UI in the same commit.

---

## C4: Finish what was reported done but is not

1. **HUD was never simplified.** L2 asked for health, a draw meter, wave or score and a small timer. `src/client/ui/hud.ts`
   still ships the full scoreboard, kill feed, ability bar and callouts. Build the simple HUD and keep the old one
   behind the legacy flag.
2. **The first launch coach does not exist.** There is a dead comment where it should be. Three steps: move, jump,
   shoot, then a button into Play.
3. **The daily board is unreachable.** The route and the database method exist and no client code ever calls
   `/expedition/daily`. Show it on the end screen, which is the whole point of a daily board.
4. **Raiders are relabelled creatures.** The four Hollow Mask types share one AI and nothing prefers the totem, although
   `VILLAGE.totemAggroM` is defined and never read. Give the Runner totem preference and the Torch Bearer a reason to go
   for huts and walls, with a unit test each.
5. **No client side hit feedback in real matches.** The hit marker and damage numbers wait for the server. Show them
   from the prediction and correct on disagreement, which is what L1 asked for and what makes shooting feel instant.

---

## C5: Release honestly

1. `v3.0.0` does not match `main`. Do not move the tag. Cut a fresh `v3.0.1` (or `v3.1.0` if C3 adds Lobby) from the
   commit where every gate is green, and say plainly in BUILD_LOG that `v3.0.0` was tagged early and should not be
   deployed.
2. `docs/DEPLOY.md` still says `Status: v2.0.0` at the top and tells the operator to playtest a mode that does not
   exist. Reconcile the whole file.
3. The capacity numbers in that file ("about 8 Lobby rooms per process") were never measured. Either measure them with
   a script that runs several rooms and records the average tick time under load, or delete the numbers and say the
   capacity is unmeasured.
4. The 150 ms latency check has never been run. It is a manual step and it is the one thing that tells you whether
   grapple and zip feel right for players who are not on your machine. Deploy the build somewhere remote, play it, and
   write what you saw in BUILD_LOG.
5. Final gates, screenshots of all three modes in `test-results/qa/release/`, then tag and push.

---

## Order and effort

| Phase | What | Effort |
|---|---|---|
| C0 | Land the uncommitted fixes | 15 minutes |
| C1 | Browser suite back to green, tick budget | half a day |
| C2 | Production holes, shared aim | 2 hours |
| C3 | Lobby real or removed | 2 hours |
| C4 | HUD, coach, daily board, raider AI, hit feedback | half a day |
| C5 | Honest release | 1 hour |

C0, C1 and C2 are the minimum before anyone else touches the server. C3 and C4 decide whether the game is fun enough to
keep people. C5 is what stops a bad build reaching players.
