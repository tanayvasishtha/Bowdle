# Bowdle runbook, world: the jungle journal

Runs after M7 and before M8. Same rules as the other runbooks: one milestone at a time, verify before moving on.

| Milestone | What |
|---|---|
| W1 | Expedition Journal look, teams renamed to Sun and Moon |
| W2 | Map kit v2: ramps, water, tall grass, zip lines, boulder trap, flood |
| W3 | Procedural props and jungle ambience |
| W4 | Sun Temple |
| W5 | Canopy Village |
| W6 | Lost River, Practice Camp, map rotation, old maps removed |

After W6, continue with M8 and M9 in `RUNBOOK-3.md`. M8's end screen adds the next-map vote.

---

## W1: Expedition Journal look

**Prompt:**

```
Build milestone W1 only: the Expedition Journal look. Read AGENTS.md,
docs/WORLD.md (The look, Never do these, Teams, Palette, Materials, Composite
pass v2, Floating notes) and docs/RENDERING.md.

1. Rename teams everywhere: red to sun, green to moon (types, map spawns,
   palette, HUD text, messages, tests). Team indices stay 0 and 1.
2. Replace ink ids with material ids as WORLD.md specifies. Boxes take a
   material name. Map the current Notebook Page boxes to stone, wood and gold
   so it keeps rendering until the new maps exist.
3. Add src/client/render/look.ts for render-only numbers, and add that
   exception to AGENTS.md.
4. Rewrite the composite shader to Composite pass v2: sky wash, parchment
   grain, map grid, coffee rings, compass rose, material washes with
   granulation and edge pooling, sepia hatching, material outlines, depth
   fade, water strokes, optional sun shafts. Remove ruled lines, the margin
   line and blue ballpoint completely.
5. Players use the teamSun and teamMoon materials. Grapple surfaces use gold.
6. Floating notes: screen-projected sepia text with distance fade.
7. Update docs/RENDERING.md, docs/GAME.md (teams, colors) and docs/MAP.md
   (material field) to match WORLD.md. Add WORLD.md, JUNGLE-MAPS.md and
   RUNBOOK-WORLD.md to the AGENTS.md doc table.
8. window.__bowdleTest.snapshot() classifies each composite pixel to its
   nearest palette color (plus two legacy entries: #A9C4E8 and #233C9B) and
   returns fractions by name. tests/e2e/render.spec.ts at /?scene=map&test:
   parchment + sky >= 0.35, all material washes together >= 0.10,
   sepia >= 0.02, legacy entries together < 0.01, zero console errors.
9. Screenshots of /?scene=map, /?scene=range and an online match to
   test-results/qa/w1/.

Do not change gameplay, map layout or netcode.
Stop when npm run check and npm run e2e pass.
```

**Verify:** open `/?scene=map`, `/?scene=range` and an online match. Parchment sky, colored washes, sepia lines, no ruled lines anywhere. Teams read clearly as orange and indigo against the scenery.

**Break it on purpose:** make the composite return the old paper color for every surface. The wash fraction check must fail. Revert.

---

## W2: Map kit v2

**Prompt:**

```
Build milestone W2 only: map kit v2. Read AGENTS.md, docs/WORLD.md (Map kit
v2, New constants, Behaviors) and docs/NETCODE.md.

1. MapData v2 types: ramps, volumes, zipLines, boulders, props, notes, look.
   mirrorX handles every new type. validateMap gains: ramp slope within
   RAMP_MAX_SLOPE_DEG and ramp ends within STEP_HEIGHT of their neighbors;
   volumes sit on walkable ground; zip lines run from the higher end and stay
   0.5 m clear of colliders; the boulder sweep never touches a collider;
   alcoves never touch the sweep; boulder paths stay 6 m from spawns; mirror
   symmetry covers every new type.
2. Collision: ramps for players (walk up and down with GROUND_SNAP) and for
   arrows (hits on the sloped surface).
3. Water volumes: speed multiplier, no sliding, arrows stop at the surface,
   flood level as a pure function of match time. Tall grass hides fully
   inside crouched players from bot line of sight.
4. Zip lines on BTN.USE (F, widen buttons to 16 bits if needed): attach at
   the higher end, ride, fire while riding, jump release with boost, grapple
   cancels. zipId and zipT live in PlayerState so prediction replays them.
5. Boulder hazard in MatchState: idle, telegraph, roll, despawn, automatic
   period with alternating direction, lever with shared cooldown, instant
   kill with lever-puller credit, blocks arrows. Kill feed weapon "boulder"
   and a "Trap!" banner.
6. Waypoint link kinds zip and grapple. Bots avoid the boulder path during
   telegraph and roll, and never pull levers.
7. A fixture map in src/shared/maps/fixtures/kit.ts that uses every feature,
   viewable at /?scene=kit with the current renderer.
8. Unit tests for every behavior and one broken fixture per new validation
   rule. Server tests: a zip ride matches prediction after 60 frames; the
   boulder kills a player in its path and spares one in an alcove; lever
   credit goes to the puller; flood slows movement only during its window.

No new maps and no new props yet.
Stop when npm run check and npm run e2e pass.
```

**Verify:** at `/?scene=kit`, walk up and down ramps without bouncing, ride the zip line and shoot mid-ride, pull the lever and watch the telegraph and roll, wade through water.

**Break it on purpose:** remove `zipT` from `PlayerState`. The zip prediction server test must fail. Revert.

---

## W3: Props and ambience

**Prompt:**

```
Build milestone W3 only: procedural props and ambient audio. Read AGENTS.md
and docs/WORLD.md (Props, Ambient audio, Composite pass v2).

1. src/client/render/props/: one builder per prop kind in WORLD.md,
   deterministic from its seed, low-poly, using materials. Instanced per
   kind, hidden beyond 90 m.
2. Waterfall and water surface animation, torch flicker, rope bridge sway
   (visual only).
3. /?scene=props: a jungle clearing gallery with every prop kind in a grid
   and a floating note naming each one.
4. src/client/audio/ambience.ts: jungle bed, water by distance, boulder
   rumble and roll, lever clunk, zip whine. Procedural WebAudio only.
5. With ?test, window.__bowdleTest.stats() returns { drawCalls, triangles }.
   tests/e2e/props.spec.ts: the gallery renders with zero console errors,
   drawCalls <= 150, triangles <= 300000. Screenshots to
   test-results/qa/w3/.

No new maps. Stop when npm run check and npm run e2e pass.
```

**Verify:** the gallery looks like one artist sketched it. Trees still read at distance. Leave the ambience on for five minutes: it should fade into the background and never get irritating.

---

## W4: Sun Temple

**Prompt:**

```
Build milestone W4 only: the Sun Temple map. Read AGENTS.md,
docs/JUNGLE-MAPS.md (the rules at the top and Map 1) and docs/MAP.md
(Waypoints, Validation).

1. src/shared/maps/sunTemple.ts from the tables, using helpers and mirrorX:
   colliders, ramps, volumes, boulder, lever, props, notes, look.
2. Waypoints covering all three lanes, the altar, the tunnel, the ravine and
   the bridge, with walk, jump, drop and grapple links.
3. validateMap passes, including the map's validation extras.
4. /?scene=map&map=sun-temple renders it offline. Online rooms keep the old
   map until W6.
5. Server test: running tick() in a loop on sunTemple, a bots-only match
   reaches the end phase with at least one boulder roll, and no bot stays
   stationary for more than 3 s outside of spawn protection.
6. Playwright: screenshots from 4 fixed camera points (spawn, altar, tunnel,
   courtyard) to test-results/qa/w4/, zero console errors, drawCalls <= 150.

Stop when npm run check and npm run e2e pass.
```

**Verify:** walk every lane, climb to the altar, spring the trap on a bot, and check nothing can see into either spawn.

---

## W5: Canopy Village

**Prompt:**

```
Build milestone W5 only: the Canopy Village map. Read AGENTS.md,
docs/JUNGLE-MAPS.md (the rules at the top and Map 2) and docs/MAP.md
(Waypoints, Validation).

1. src/shared/maps/canopy.ts from the tables: trunks, ring decks, spiral
   ramps, tree decks, bridges, zip lines, stream, waterfall, tall grass,
   fallen logs, props, notes, sun shafts on.
2. Waypoints for all three levels with zip and grapple links. Bots ride zip
   lines toward the fight and use tall grass when retreating.
3. validateMap passes, including the map's validation extras.
4. /?scene=map&map=canopy renders it offline.
5. Server test: a bots-only match on canopy reaches the end phase, bots ride
   zip lines at least 3 times, no bot stationary for more than 3 s.
6. Playwright: screenshots from spawn tree, high ring, halfway along a zip
   line and inside the floor grass to test-results/qa/w5/, zero console
   errors, drawCalls <= 150.

Stop when npm run check and npm run e2e pass.
```

**Verify:** fight from each level, shoot while riding a zip line, ambush a bot from the grass, climb from the floor to the high ring on foot.

---

## W6: Lost River, Practice Camp and rotation

**Prompt:**

```
Build milestone W6 only: Lost River, Practice Camp and map rotation. Read
AGENTS.md and docs/JUNGLE-MAPS.md (Map 3, Practice Camp, Map rotation).

1. src/shared/maps/lostRiver.ts: river with flood, aqueduct with its gap,
   seaplane wreck with interior and roof, log bridges, waterfall cave, reeds,
   gates, props, notes. Waypoints and validation extras.
2. src/shared/maps/camp.ts with every station. Practice mode uses it.
3. A map registry by id. TdmRoom rotates sun-temple, canopy, lost-river.
   MatchState.mapId drives the client map build and changes each new match.
4. Delete Notebook Page, the old Practice Range and every reference, test
   and doc mention of them. History stays in git.
5. Server tests: rotation order across three matches; the flood window slows
   a player in the river; a bots-only match reaches the end on each map.
6. Playwright: an online join on each map (a test-only query forces the map)
   renders with zero console errors and drawCalls <= 150; the camp fireAt
   headshot test passes; screenshots of every map to test-results/qa/w6/.

Stop when npm run check and npm run e2e pass.
```

**Verify:** play one full match on each map with bots. The flood should feel like a warning you can react to, not a punishment. Each camp station should teach its mechanic without explanation.

---

## Map quality checklist (by hand, every map)

- [ ] A landmark is visible from each spawn so new players know where to go
- [ ] Three distinct routes between the spawns
- [ ] Open lanes have cover at least every 6 to 8 m
- [ ] The power position can be attacked from at least three angles
- [ ] No dead end deeper than 8 m
- [ ] Nothing sees into a spawn
- [ ] 60 fps at 1080p on an integrated GPU laptop
- [ ] A screenshot from any point looks like a page from the journal

## When it goes wrong

**The look drifts back toward notebook paper.** Point Codex at "Never do these" in `WORLD.md`.

**Bots get stuck on ramps or decks.** Check `GROUND_SNAP` and that every ramp has waypoint links at both ends.

**Draw calls over budget.** Props are not instanced, or map colliders are not merged by material.

**A map feels empty.** Add props, notes and landmarks before adding more colliders.
