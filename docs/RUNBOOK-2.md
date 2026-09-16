# Bowdle runbook, part 2: online play and bots

Same rules as part 1: one milestone per task, verify before moving on.

M4 is split into M4a and M4b because multiplayer is where agents most often go wrong. Keep them as separate tasks.

---

## M4a: Online movement

**Prompt:**

```
Build milestone M4a only: online movement. Read AGENTS.md, docs/NETCODE.md
and the "Where to check library APIs" table in docs/TECH.md.

Before writing any Colyseus code, open the listed .d.ts files and confirm
every API you plan to use. If something named in NETCODE.md does not exist in
the installed types, stop and report the exact mismatch.

1. src/net/schema.ts: MatchState, PlayerState (every field in NETCODE.md,
   including later ones), ArrowState and PlayerInput, using schema() and t.*.
2. A unit test proving a PlayerState instance satisfies PlayerSim and can be
   passed to stepPlayer.
3. src/server/match/tick.ts: the tick logic as a plain function of
   (state, pending inputs, map, ctx), so tests can run it in a loop without
   timers. TdmRoom calls it from setFixedTimestep.
4. src/server/rooms/TdmRoom.ts: defineInput with sanitize and an idle policy
   that repeats the latest frame, setFixedTimestep(TICK_HZ, SUBSTEPS), inputs
   consumed one at a time per player, warmup then live phase (no combat yet),
   team assignment, onDrop with allowReconnection. Register it as "tdm" in
   src/server/app.config.ts.
5. src/client/game/OnlineSession.ts: join "tdm", room.input in reliable mode,
   Predict with lerp delay INTERP_DELAY_MS, a reconciler for the local player
   that calls stepPlayer, attachAll for other players. Draw other players as
   doodle people in team ink.
6. A temporary start screen with "Practice" and "Play online" buttons.
7. Server tests: joining creates a player; 90 input frames move the server
   player to the same position as 90 direct stepPlayer calls (tolerance 1e-6);
   a dropped client that reconnects within 15 s keeps its player.
8. With ?test, add window.__bowdleTest.players() returning positions of all
   rendered players. tests/e2e/online.spec.ts: two pages join; page A holds W
   for 1 s; page B sees A move more than 5 m within 2 s.

No arrows online, no damage, no bots. Stop when npm run check and npm run e2e
pass.
```

**Verify:** `npm run check`, `npm run e2e`, then open two browser windows side by side at http://localhost:5173/?debug and join both.

- Your own movement feels exactly like offline.
- The other window's player moves smoothly, no stutter or teleporting.
- The Colyseus debug panel shows the reconciler as matched, not diverging.

**Break it on purpose:** in `OnlineSession.ts`, multiply `moveZ` by 1.5 before the local `stepPlayer` call. You should see rubber-banding, and the debug panel should report divergence. Revert.

---

## M4b: Online combat and the match loop

**Prompt:**

```
Build milestone M4b only: online combat and Team Deathmatch rules. Read
AGENTS.md, docs/NETCODE.md and docs/GAME.md (Bow and arrows, Hitboxes, Dagger,
Health, Match).

1. Server tick: turn fire and melee events into arrows and stabs. Stamp
   bornMs with the server clock that room.clock.serverNow() tracks (confirm
   in RoomClock.d.ts first). Step arrows every substep with swept world
   collision, then player hits using rewind.lastSeenBy(arrow.owner). Melee
   uses rewind.lastSeenBy(attacker).
2. Damage, assists, kills, regen, death, respawn with spawn protection, spawn
   choice farthest from living enemies, score limit, time limit, end phase,
   new match after END_SCREEN_MS.
3. src/net/messages.ts with zod schemas for every message in NETCODE.md.
4. Client: predict.spawns("arrows") and spawn locally only on live steps,
   never during reconciler replay (find the replay flag in rollback.d.ts).
   Render confirmed and foreign arrows, stuck arrows, hit markers from
   hitConfirm, damage direction from damaged, kill feed, Tab scoreboard, team
   scores and timer, death screen with respawn countdown, end screen.
5. A test helper that adds stationary dummy players at given positions.
   Server tests from docs/TECH.md covering arrows, team damage and the score
   limit.
6. With ?test, add window.__bowdleTest.aimAt(sessionId). Extend
   online.spec.ts: page A aims at page B's player, holds fire 600 ms,
   releases; both pages show the kill in the kill feed within 3 s.

No bots, no abilities, no cosmetics. Stop when npm run check and npm run e2e
pass.
```

**Verify:** `npm run check`, `npm run e2e`, then play two windows against each other.

- A full-draw headshot kills. Two full-draw body shots kill.
- Your arrow leaves the bow instantly on your screen, with no delay or jump when the server confirms it.
- Shooting a teammate does nothing.
- To test the match end, temporarily set `SCORE_LIMIT` to 3 locally (do not commit). The end screen appears and a new match starts.
- **Latency test:** follow "Testing latency by hand" in `NETCODE.md`. At about 150 ms ping, hits on a strafing player must land where you aimed. Do not skip this, it is the most important check in the whole build.

**Break it on purpose:** read target positions live instead of through `rewind.lastSeenBy`. In the latency test, shots at a strafing player now miss behind them. Revert.

---

## M5: Bots

**Prompt:**

```
Build milestone M5 only: bots. Read AGENTS.md, docs/MAP.md (Waypoints,
Validation) and docs/GAME.md (Match).

1. Author the waypoint network for the current launch map as MAP.md describes and make
   validation rules 6 to 8 pass.
2. src/shared/bots/nav.ts: A* over waypoints, and path following that outputs
   moveX, moveZ and yaw. Jump on jump links. Slide sometimes on long walk
   links.
3. src/shared/bots/aim.ts: projectile lead for arrow speed and ARROW_GRAVITY
   against the target's velocity, refined over 3 iterations. Returns yaw and
   pitch.
4. src/server/bots/BotController.ts: states roam, engage, retreat (hp below
   35). Line of sight by ray against solid boxes. Draw time 450 to 650 ms from
   the seeded RNG. Aim error by difficulty: easy 4 degrees, normal 2, hard 0.8,
   default normal. 250 ms reaction delay after first sighting an enemy. Strafe
   while drawing. Bots produce PlayerInput frames and go through stepPlayer
   exactly like humans.
5. Teams fill to TEAM_SIZE with bots. Humans replace bots when joining. Bots
   replace players who leave.
6. Unit tests: with zero aim error, the lead solution hits a target moving at
   6 m/s at 30 m in at least 90 of 100 seeded trials; A* finds a path between
   every pair of spawns.
7. Server test: 8 bots and no humans reach the end phase within 7 simulated
   minutes, running tick() in a loop with no real time.

Stop when npm run check passes.
```

**Verify:** `npm run check`, then play a match alone (you plus 3 bot teammates against 4 bots).

- Bots use both staircases, the bridge and the perch.
- No bot stays stuck in one spot for more than 3 seconds.
- Normal bots land hits on you while you move, but you can beat them.
- A full bot match finishes without errors in the server log.

**Break it on purpose:** set the lead refinement iterations to 0. The accuracy test must fail. Revert.

---

## M6: Highlight features

**Prompt:**

```
Build milestone M6 only: highlight features. Read AGENTS.md, docs/GAME.md
(Highlight features, Rewards) and docs/RENDERING.md (Effects).

1. Arrow cam: the client keeps a 3 s ring buffer of rendered snapshots
   (player transforms, arrow positions) at 30 Hz. When the local player dies
   to an arrow, the death screen replays the last 1.2 s following the killing
   arrow at 0.35x speed, then shows the killer. Add a skip button. In the
   Practice Camp, your own kills over 30 m play the same replay as a small
   picture-in-picture.
2. Client-only effects: pinned bodies, ink splat on headshots, arrows stuck in
   bodies for 3 s, damage direction arcs.
3. Robin Hood: each substep the server checks pairs of enemy arrows (segment
   distance below 2 * ARROW_RADIUS), deletes both, broadcasts robinHood and
   records an XP event for later. Clients show a banner and a paper-tear sound.
4. Banners for long-shot kills (over 35 m) and headshots. Add a no-op
   platform "happy time" hook called on these moments.
5. Unit test for segment-to-segment distance, including parallel segments.
   Server test: two arrows fired head-on at each other both disappear.

Stop when npm run check and npm run e2e pass.
```

**Verify:** `npm run check`, `npm run e2e`, then play.

- Die to a long shot: the replay follows the arrow into you, slow, readable, then skips cleanly.
- A headshot leaves an ink splat.
- A kill near a wall pins the body to it.
- Record a short screen capture of an arrow cam replay and watch it back. If it would not make you want to post it, tune timing and camera distance before moving on.

**Break it on purpose:** set the Robin Hood distance threshold to 0. The head-on arrows server test must fail. Revert.
