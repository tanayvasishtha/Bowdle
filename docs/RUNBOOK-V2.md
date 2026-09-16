# Bowdle runbook, v2: feel, depth and content

Builds `docs/V2-DESIGN.md` on top of v1.1 (after R6 in `RUNBOOK-RETENTION.md`). One milestone at a time, in order, with a commit and tag after each.

| Tier | Milestone | What | Size |
|---|---|---|---|
| Feel | G1 | Camera and hit feel | M |
| Feel | G2 | Movement 2.0 | L |
| Feel | G3 | Swing grapple and rope cutting | L |
| Feel | G4 | Quiver and dagger swat | L |
| Hook | G5 | Guided onboarding | M |
| Hook | G6 | Music and directional audio | M |
| Hook | G7 | Gamepad, input options, accessibility | M |
| Hook | G8 | Free for All and Relic Run | L |
| Hook | G9 | Expedition co-op waves | XL |
| Content | G10 | Map kit v3, Sky Bridges, Sunken Ruins | XL |
| Content | G11 | Pings, spectating, AFK, reports, play of the match | L |
| Content | G12 | Ranked and regions | L |
| Content | G13 | Performance presets, attract mode, sharing, install | M |
| Release | G14 | Balance pass, release QA, v2.0.0 | M |

If time is short, G1 to G5 alone change how the game feels more than anything else.

## Ground rules for every milestone

- Read `AGENTS.md` and the named sections of `docs/V2-DESIGN.md` first. V2-DESIGN.md is the source of truth for numbers and names; if this runbook disagrees, follow the design doc and say so.
- Gameplay numbers go in `src/shared/constants.ts`, render-only numbers in `src/client/render/look.ts`.
- Anything that changes the shared simulation (`src/shared/sim`) needs: unit tests, a server prediction test like `tests/server/abilities.test.ts` (client prediction matches the server for 60 frames), and `npm run soak` passing on every map.
- Database changes are new migrations appended to `MIGRATIONS`, tested in memory and in `tests/server/postgres.test.ts`.
- New UI needs a Playwright spec with screenshots in `test-results/qa/g<n>/`, and the screenshots must be looked at before committing.
- Never copy code, names, numbers or assets from Doodle District or any other game. Design from V2-DESIGN.md.
- No new dependencies.
- Gates: `npm run check`, `npm run e2e` (set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if the bundled Chromium is missing), `npm run build` then `npm run smoke`, `npm run soak` when the simulation, bots or rooms changed, `npm run build:portals` when client code changed.
- Commit as Tanay Vasishtha only, no trailers, no tool mentions. Message `G<n>: <summary>`, then `git tag g<n>` and `git push origin main --tags`.
- Prepend a `docs/BUILD_LOG.md` entry (Built, Verified, Left). No em dashes in docs or UI copy.
- G1 also adds `docs/V2-DESIGN.md` and `docs/RUNBOOK-V2.md` to the doc tables in `AGENTS.md` and `README.md`.

---

## G1: Camera and hit feel

**Prompt:**

```
Build milestone G1 only. Read docs/V2-DESIGN.md sections 1 and 2.

1. CameraRig: speed FOV, head bob, strafe and slide roll, landing dip,
   FOV kicks (expose kick(kind) for jump, doubleJump, dodge, slide),
   shake with decay, all in look.ts. Keep the aim zoom working on top.
   Make the per-frame math allocation free.
2. A pure helper src/client/game/cameraFeel.ts computes the offsets from
   (speed, grounded, sliding, strafe input, landing speed, time) so it
   can be unit tested without three.js.
3. Damage vignette and high-speed ink streaks in the composite shader
   (new uniforms, values from look.ts). Extend the composite shader test.
4. Settings: reduce motion (turns off bob, roll, shake, streaks, kicks),
   damage numbers (default on). Persist like the other settings.
5. Floating damage numbers from hitConfirm (gold for headshots), kill
   confirm crosshair flash.
6. sfx.ts: hit tick with damage pitch, headshot ding, kill confirm,
   dodge, double jump, wall jump, mantle, rope reel, rope snap, UI click
   and hover. Hook the ones whose events already exist; the rest are
   used by G2 to G4.
7. Add V2-DESIGN.md and RUNBOOK-V2.md to the AGENTS.md and README doc
   tables.
8. Tests: cameraFeel unit tests (bob off when airborne, roll sign, dip
   recovery time, reduce motion zeroes everything). e2e: an online test
   match where the player runs and jumps shows a changed camera FOV and
   position offset through a new test hook; reduce motion keeps them at
   zero. Screenshots of a speed-streak frame and a damage vignette.

Do not change the shared simulation in this milestone.
```

**Verify:** run, slide and jump in Practice Camp. The camera breathes with speed, landings dip, hits shake. Reduce motion turns it all off.

**Break it on purpose:** ignore the reduce motion flag in `cameraFeel`. Its unit test must fail. Revert.

---

## G2: Movement 2.0

**Prompt:**

```
Build milestone G2 only. Read docs/V2-DESIGN.md section 3 and
docs/NETCODE.md.

1. Apply the tuning table to constants.ts and update tests that assert
   old values or old apex heights.
2. Landing grace, vine hop, wall jump (with the 3-jump limit), mantle and
   dodge in src/shared/sim/movement.ts. New PlayerState fields for the
   counters and cooldowns (airJumps, wallJumps, wallJumpCooldownMs,
   mantleCooldownMs, dodgeCooldownMs), synced where the client needs
   them for prediction. Dodge is a new input button bit on Shift
   (rebindable).
3. Slide rework as the table says.
4. Collision: adaptive substeps (max 0.28 m per substep, 2 to 8) and
   step-down snap for boxes and ramps. Keep the ramp rules from v1.0.0
   (solid wedges, box support beats ramp snap).
5. Fall rule: kill volume under bounds.min.y - 8, weapon "fall",
   KNOCKED OFF credit within 5 s of damage, otherwise LOST IN THE RAVINE.
   Add "fall" to KillMessage and the kill feed.
6. Bots: mantle link kind in nav, vine hop over gaps where a jump link
   is longer than 3 m, dodge when hit (20 % chance, respecting cooldown).
   Add mantle links where the maps have ledges between 0.6 and 2.0 m.
7. Camera kicks and sounds from G1 fire on these events.
8. HUD ability boxes show the dodge cooldown.
9. Tests: unit tests for apex height, vine hop once per airtime, wall jump
   limit and cooldown, mantle height window, dodge speed and cooldown,
   slide decay and slide jump, landing grace, no tunnelling through a
   0.1 m wall at 30 m/s over 10,000 substeps, step-down snap on a
   staircase, and the fall credit rule. Server prediction test for 60
   frames of vine hop, wall jump, mantle and dodge. Update the ramp and
   deck regression tests. npm run soak on every map.
```

**Verify:** in Practice Camp, vine hop onto the watchtower, wall jump between the tower and the vine wall, mantle a crate, dodge sideways, and slide jump down the trail without losing speed.

**Break it on purpose:** remove the wall jump limit. The limit test must fail. Revert.

---

## G3: Swing grapple and rope cutting

**Prompt:**

```
Build milestone G3 only. Read docs/V2-DESIGN.md section 4.

1. Replace the straight pull in src/shared/sim/abilities.ts with the
   fire, attach, reel, swing, launch and detach rules. Server-owned rope
   state (add grappleLen). Hold and release come from the existing
   grapple button bit; crouch detaches.
2. Rope cut: arrows versus rope segments on the server with the rewound
   arrow path; KillMessage-like ropeCut message; +25 XP line and the
   Snip medal (update src/shared/medals.ts and its tests).
3. Rendering: a sagging rope while swinging, taut while reeling; snap
   effect and sound on a cut.
4. Bots: swing across grapple links, launch at the far end; update the
   grapple shortcut logic.
5. Tutorial text and controls overlay text for the new grapple.
6. Tests: unit tests for the length constraint (the body never ends
   farther than the rope length plus 0.05 m), reel speed, launch boost,
   4.5 s timeout, line-of-sight detach, rope cut geometry. Server
   prediction test for 60 frames of swinging. Server test: an enemy
   arrow cuts a rope and the owner falls. e2e screenshot of a swing.
   npm run soak.
```

**Verify:** swing across the Canopy Village gap, reel up to a deck, launch off the top. Shoot a bot's rope and watch it drop.

**Break it on purpose:** skip the length constraint when the body moves away from the anchor. The constraint test must fail. Revert.

---

## G4: Quiver and dagger swat

**Prompt:**

```
Build milestone G4 only. Read docs/V2-DESIGN.md section 5.

1. Arrow kinds broadhead, scatter and tether in ArrowState.kind and in
   src/shared/sim/arrows.ts; selected slot in PlayerState; slot input
   through new button bits (1, 2, 3 and wheel, rebindable). Scatter
   charges and tether cooldown in PlayerState.
2. Tether: on a valid hit create a temporary zip line in room state
   (new schema map tethers) that the zip simulation treats like map zip
   lines; expire after 10 s; cut by enemy arrows like ropes.
3. Dagger swat on the server with rewound arrows; SWATTED line, +25 XP,
   Swatter medal.
4. Viewmodel shows the selected arrow; HUD quiver strip with charges and
   cooldown.
5. Bots: use scatter under 12 m, tether when a route link is a long gap
   and no zip line exists (optional if it hurts the soak).
6. Challenges: add daily "Get 3 kills with Scatter arrows" and weekly
   "Ride 10 tether lines" to the pools (update RETENTION.md tables).
7. Tests: unit tests for scatter spread and damage, charge regen, tether
   validity (distance, slope, surface), tether expiry, swat window and
   arc. Server tests for a swat and a tether ride. e2e: switch arrows
   and see the HUD strip. npm run soak.
```

**Verify:** fire a scatter volley at close range, place a tether across the Lost River and ride it, swat a bot's arrow with the dagger.

**Break it on purpose:** let tether lines last forever. The expiry test must fail. Revert.

---

## G5: Guided onboarding

**Prompt:**

```
Build milestone G5 only. Read docs/V2-DESIGN.md section 6.

1. A course mode in PracticeSession with the 8 stations, ghost markers
   and one text line each; skip and replay from the menu.
2. First launch flow: name entry, then the course, then a Quick Play
   match. Returning players go straight to the menu.
3. Account flag tutorial_done (migration), POST /api/tutorial/done grants
   100 Ink once, rate limited per account.
4. Contextual tips during the first 5 matches, one per 45 s at most,
   setting to turn them off.
5. F1 controls overlay; pointer lock lost hint.
6. Funnel log lines menuOpened, tutorialDone, firstMatch, secondMatch.
7. Tests: server test for the one-time grant; unit test for the tip
   scheduler; e2e that walks the course with test hooks, checks each
   station completes in order and that the reward appears once.
```

**Verify:** clear local storage, open the game, and reach a first match having been taught every move.

**Break it on purpose:** allow the tutorial reward twice. The one-time grant test must fail. Revert.

---

## G6: Music and directional audio

**Prompt:**

```
Build milestone G6 only. Read docs/V2-DESIGN.md section 7.

1. src/client/audio/music.ts: three generated layers mixed by an
   intensity value with 1.5 s crossfades; M toggles; menu, explore and
   combat states.
2. Buses: master, music, effects, ambience, each with a settings slider,
   all behind the ad-break audio suspension.
3. Directional enemy footsteps within 18 m using the Web Audio panner,
   quieter when walking, silent when crouched; remote grapple and zip
   sounds.
4. Sound indicators setting: screen-edge arcs for footsteps, shots and
   boulders.
5. Tests: unit tests for the intensity function and the footstep
   loudness rule (pure helpers). e2e: toggling M changes the music bus
   gain through a test hook; the sound indicator appears when a bot
   fires nearby.
```

**Verify:** the menu is calm, a fight swells the music, footsteps come from the right side with headphones.

**Break it on purpose:** play footsteps for crouched enemies. The loudness test must fail. Revert.

---

## G7: Gamepad, input options, accessibility

**Prompt:**

```
Build milestone G7 only. Read docs/V2-DESIGN.md section 8.

1. InputSampler reads the Gamepad API with the mapping, curve, deadzone
   and aim slowdown (slowdown decided on the client from rendered enemy
   positions; it only scales look speed).
2. Settings: invert Y, aim sensitivity, gamepad sensitivity, trackpad
   mode, crosshair style, size and color, colorblind team palette.
3. Menus and the locker are usable with a gamepad (focus ring, A select,
   B back).
4. Colorblind palettes change only the team washes and outlines; the
   composite snapshot test gains a palette case.
5. Tests: unit tests for the stick curve and deadzone and for trackpad
   toggles; e2e with a mocked navigator.getGamepads moving and firing;
   screenshots of each colorblind palette.
```

**Verify:** plug in a controller, play a match and navigate the menus without the mouse.

**Break it on purpose:** drop the deadzone. The stick curve test must fail. Revert.

---

## G8: Free for All and Relic Run

**Prompt:**

```
Build milestone G8 only. Read docs/V2-DESIGN.md section 9.

1. MatchState.mode and a mode option on join; filterBy adds mode.
   Scoring, spawns, friendly fire and end conditions move behind a small
   per-mode rules object in src/shared/sim/modes.ts.
2. Free for All rules, neutral tint and name-color rings.
3. Relic Run: relic state in the schema, pickup, carrier limits, drop,
   return, capture; map data relic and camps for all launch maps with
   validation; HUD objective marker and carrier outline.
4. Menu playlist picker; party leader picks the mode.
5. Bots: FFA targeting everyone; Relic Run roles (carry, escort, chase).
6. Medals and challenges: Relic Runner (capture), daily "Capture a
   relic".
7. Tests: unit tests for each mode's rules; server tests for an FFA win
   at 20 kills, a relic capture, a drop and timed return; npm run soak
   extended to run every mode on every map.
```

**Verify:** play one match of each mode against bots. Relic carriers slow down and glow; FFA shows no teams.

**Break it on purpose:** let the carrier use the grapple. The carrier rules test must fail. Revert.

---

## G9: Expedition co-op waves

**Prompt:**

```
Build milestone G9 only. Read docs/V2-DESIGN.md section 10.

1. ExpeditionRoom (1 to 4 players) sharing the movement and bow sims.
2. Creature simulation in src/shared/sim/creatures.ts (pure, seeded):
   beetle, spitter, guardian with front shield, wisp, Temple Colossus
   with weak gem, stomp shockwave and summons. Creature nav reuses
   waypoints.
3. Wave director: counts, alive caps, unlock waves, modifiers, breaks,
   herbs, downed and revive, solo extra lives, checkpoints.
4. Procedural ink creature rigs and effects in the renderer, within the
   150 draw call budget at 18 creatures (instancing where possible).
5. Rewards and records: expedition_runs table, personal best, weekly
   Expedition leaderboard, run rewards with the Ink cap, challenges
   "Reach wave 10" and "Defeat a Temple Colossus".
6. Creature spawn points in Sun Temple and Lost River map data.
7. Menu entry and an end-of-run screen (wave reached, best, rewards).
8. Tests: unit tests for each creature behavior and the wave formulas;
   server tests for a boss wave, revive, checkpoint restart and reward
   cap; a soak script mode that runs 20 waves with bot players and
   checks for no stuck creatures; e2e screenshots of wave 1 and a boss.
```

**Verify:** play solo to wave 6, then with a friend in a party to a boss wave.

**Break it on purpose:** let the shield block arrows from behind. The guardian test must fail. Revert.

---

## G10: Map kit v3, Sky Bridges, Sunken Ruins

**Prompt:**

```
Build milestone G10 only. Read docs/V2-DESIGN.md section 11,
docs/WORLD.md and docs/JUNGLE-MAPS.md.

1. Map types, validation and mirroring for anchors, geysers,
   breakables, herbs and kill volumes. Deterministic anchor motion from
   match time on client and server.
2. Simulation: geyser launch, breakable HP and rebuild (server state),
   herb pickup and respawn, grapple onto moving anchors.
3. Rendering: chained rings, geyser spray, plank walls with crack
   stages, herbs.
4. Sky Bridges and Sunken Ruins built to the spec, with waypoints,
   dressing, landmarks, solid scenery and the tide cycle. Add both to
   the rotation, vote and Relic Run data.
5. Add herbs and at least one geyser or anchor to each of the three
   launch maps where it fits their layout.
6. Tests: validateMap for both maps; scenery and landmark rules; world
   density e2e views for both maps within the draw call and triangle
   budgets; server tests for geysers, breakables and herbs;
   npm run soak on all five maps in every mode.
```

**Verify:** play both new maps; swing between anchors on Sky Bridges and break a plank wall on Sunken Ruins.

**Break it on purpose:** break mirror symmetry for one anchor. The validation test must fail. Revert.

---

## G11: Pings, spectating, AFK, reports, play of the match

**Prompt:**

```
Build milestone G11 only. Read docs/V2-DESIGN.md section 12.

1. Ping message with type detection, rate limit, team-only broadcast,
   markers and the callout wheel; subtitles for callouts; mute per
   player.
2. Spectate the killer during respawn.
3. AFK prompt and removal with a bot taking the slot.
4. Reports table and API, the automatic name reset rule, scoreboard
   context menu.
5. Play of the match on the end screen using ReplayDirector captures,
   with Save clip.
6. Tests: server tests for ping rate limits and team-only delivery, AFK
   removal at 90 s, the report threshold; e2e for the ping wheel,
   spectating and play of the match.
```

**Verify:** ping an enemy for a teammate, die and watch the killer, idle for 90 s and get returned to the menu.

**Break it on purpose:** send pings to both teams. The team-only test must fail. Revert.

---

## G12: Ranked and regions

**Prompt:**

```
Build milestone G12 only. Read docs/V2-DESIGN.md section 13.

1. src/shared/rating.ts: Glicko-2 update and tier mapping (pure, unit
   tested against published Glicko-2 example values).
2. Ratings table per season, placement tracking, leave-as-loss rule.
3. QueueRoom pairing by rating with the widening window and the 90 s
   unranked fallback; ranked TdmRoom variant without bots.
4. Menu ranked entry with requirements shown; tier badge on the profile,
   scoreboard and end screen; ranked leaderboard.
5. Regions: REGION env, VITE_REGIONS list, ping probe, HUD ping, manual
   override. Document multi-region deploys in DEPLOY.md.
6. Tests: rating math, tier boundaries, queue pairing with fake clocks,
   leave-as-loss, region selection with mocked probes.
```

**Verify:** two linked level-10 test accounts queue and land in the same ranked match; their ratings move after it.

**Break it on purpose:** let a level 5 account queue. The requirement test must fail. Revert.

---

## G13: Performance presets, attract mode, sharing, install

**Prompt:**

```
Build milestone G13 only. Read docs/V2-DESIGN.md section 14.

1. Graphics presets, first-launch benchmark, FPS cap, all in settings.
2. Loading screen with real progress and shader warm-up.
3. Attract mode on the idle menu.
4. index.html meta, Open Graph and Twitter tags; npm run og and
   npm run icons scripts; manifest and app-shell service worker (never
   caches API or WebSocket traffic).
5. Funnel event modePicked.
6. Tests: e2e that Low preset lowers draw calls and render scale; the
   service worker does not intercept /api; og.png has the right size;
   performance spec budgets still pass.
```

**Verify:** paste the game URL into a link preview tool and see the card; install the app from the browser; a low-end laptop holds 60 fps on Low.

**Break it on purpose:** cache `/api` in the service worker. The interception test must fail. Revert.

---

## G14: Balance pass, release QA, v2.0.0

**Prompt:**

```
Build milestone G14 only.

1. Balance script scripts/balance-report.ts: runs 20 bot matches per
   mode and map and prints kills by weapon and arrow kind, average time
   to kill, headshot rate, movement verb usage and relic capture times.
   Flag any weapon above 45 % of kills or any map where one team wins
   more than 60 % of seeds.
2. Adjust constants only where the report flags a problem; record each
   change and its reason in BUILD_LOG.
3. Update GAME.md, JUNGLE-MAPS.md, ECONOMY.md, RETENTION.md, README
   status, DEPLOY.md.
4. Release QA: clean npm ci, check, full e2e, build, smoke, soak on all
   maps and modes, build:portals, retention report, balance report.
   Screenshots of every mode and map in test-results/qa/g14/.
5. package.json 2.0.0, commit "v2.0.0: ...", tag v2.0.0, push.
```

---

## Master prompt

For an overnight run after R6 is done:

```
You are building Bowdle v2 in C:\Users\Dell\Desktop\bowdle
(https://github.com/tanayvasishtha/Bowdle, branch main).

First confirm that tag r6 exists. If it does not, finish
docs/RUNBOOK-RETENTION.md first.

Read AGENTS.md, docs/V2-DESIGN.md and docs/RUNBOOK-V2.md. Build
milestones G1 to G14 in order. For each milestone:

1. Follow its prompt and the ground rules at the top of RUNBOOK-V2.md.
2. Run every gate the ground rules list for that milestone.
3. Do the "Break it on purpose" step, confirm the named test fails,
   then revert it.
4. Look at the screenshots you produced before committing.
5. Prepend the BUILD_LOG entry, commit as Tanay Vasishtha with
   "G<n>: <summary>", tag g<n>, push to origin main with tags.

Commit rules: the only author is Tanay Vasishtha. No Co-authored-by
trailers, no "Generated with" lines, no mention of AI tools or agents
anywhere in commits, branches, code or docs. Never open pull requests.

Never copy code, names, numbers or assets from other games.
If a gate fails and you cannot fix it inside the milestone, stop,
leave the tree uncommitted, and report what failed and why. Never
weaken a test to pass a gate. Do not start the next milestone until
the current one is committed and pushed.
```
