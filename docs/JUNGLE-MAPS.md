# Bowdle maps: the jungle journal

Status: **v2.0.0** (G1–G14 shipped). Five launch maps: Sun Temple, Canopy Village, Lost River, Sky Bridges and Sunken Ruins, plus Practice Camp. Map kit v3 (G10) adds swing anchors, geysers, breakables and herbs on top of the W6 arena set in `WORLD.md`.

All three are 68 m by 52 m (x from -34 to 34, z from -26 to 26) and mirror symmetric across `x = 0`. Team Sun spawns west, team Moon east. Coordinates below are for the Sun half unless marked center. Mirror everything else. Positions are a starting point: adjust by the smallest amount that passes validation and record it in the build log.

Every map needs: three routes between the spawns, one power position that is exposed from several angles, one signature mechanic, no line of sight between spawns, and every walkable area reachable on foot (zip lines and grapple are shortcuts, never the only way).

---

## Map 1: Sun Temple (`sun-temple`)

A stepped pyramid in a jungle clearing, a tomb tunnel beneath it and a boulder trap anyone can spring.

**Lanes:** north colonnade (mid range), center pyramid and tunnel (vertical and close), south courtyard (stealth).

### Center (self-symmetric)

| Piece | Geometry | Material |
|---|---|---|
| Tier 1 | min (-10, 0, -10), max (10, 1.2, 10), split around the tunnel roof | carvedStone |
| Tier 2 | (-7.5, 1.2, -7.5) to (7.5, 2.4, 7.5) | carvedStone |
| Tier 3 | (-5, 2.4, -5) to (5, 3.6, 5) | carvedStone |
| Altar | (-2.5, 3.6, -2.5) to (2.5, 4.8, 2.5), sun disc prop on top | carvedStone |
| Stairs | North and south faces, from ground to the altar, rise 0.4, run 0.6, width 3 | stone |
| Vine walls | Gold strips on the west and east faces, tagged `grapple` | gold |
| Tunnel trench | Along X from x -16 to 16, z -1.8 to 1.8, floor at y -2.4. Covered by tier 1 between x -10 and 10 | stone |
| Tunnel ramps | Down from ground at x ±16 to the trench floor at x ±11 | earth |
| Alcoves | 2 m deep side pockets at x ±5 on both walls | stone |
| Boulder path | (-18, 1.5, 0), (-11, -0.9, 0), (11, -0.9, 0), (18, 1.5, 0). Direction alternates | |
| Lever | On the altar at (0, 4.8, 2) | gold |
| Torches | Along the tunnel every 5 m | |

### Sun half

| Piece | Geometry | Purpose |
|---|---|---|
| Spawn camp | Tents and crates at x -31 to -26 | Spawns at (-29, 0, -6), (-29, 0, -2), (-29, 0, 2), (-29, 0, 6), yaw -PI/2 |
| Colonnade | Two pillar rows at z 13 and z 17, x -26 to -6, every 4 m, heights 1.6 to 3.2 | Mid-range cover |
| Fallen pillars | Low cover between the rows | Slide lanes |
| Ravine | 4 m deep strip at z 20 to 26, stairs back up at x ±20 | Flank route, not fatal |
| Rope bridge | Center, x -8 to 8 at z 23 over the ravine | Long sightline between flanks |
| Courtyard pool | Floor lowered to -0.4 at x -18 to -10, z -18 to -12, water volume to 0 | Slow zone |
| Tall grass | x -26 to -20, z -16 to -8, height 1.2 | Stealth |
| Broken walls | Height 1.1 around the courtyard | Close cover |
| Boundary | Dense giant trees as the outer wall, height 10, invisible ceiling at 16 | |

**Notes:** "altar", "tunnel: listen for the rumble". **Sun shafts:** off.

**Validation extras:** the boulder sweep never touches a solid collider; a player capsule in any alcove never touches the sweep; the boulder path stays at least 6 m from every spawn; the altar is reachable by walk links.

**Signature moments:** trap kills from the lever, altar headshots, dagger fights in the tunnel.

---

## Map 2: Canopy Village (`canopy`)

A treetop village on three levels: jungle floor (y 0), low decks (y 4), high decks (y 8).

**Lanes:** high bridges (long range), low decks (mid), jungle floor (stealth).

### Center (self-symmetric)

| Piece | Geometry | Purpose |
|---|---|---|
| Great tree | Trunk collider (-2, 0, -2) to (2, 14, 2), giantTree prop | Center landmark |
| Low ring deck | 3 m wide ring around the trunk at y 4 | |
| High ring deck | 3 m wide ring at y 8 | Power position |
| Spiral ramps | Around the trunk, ground to low ring and low ring to high ring, 20 degrees or less | On-foot route up |
| Stream | Shallow water along z -20, x -34 to 34 | Slow crossing |
| Waterfall | North boundary at x -4 to 4, pool below | Landmark, sun shafts behind |

### Sun half

| Piece | Geometry | Purpose |
|---|---|---|
| West tree | Trunk at (-15, 0, 0), low deck 7×7 at y 4, high deck 5×5 at y 8, stairs around the trunk | |
| High bridge | Along X from the west tree high deck (x -12.5) to the high ring (x -5), z -1 to 1 | Long sightline |
| North tree | Trunk at (-15, 0, 16), low deck at y 4 | |
| South tree | Trunk at (-15, 0, -16), low deck at y 4 | |
| Low bridges | Along Z from the west tree low deck to the north and south tree decks | |
| Zip lines | High ring north edge (-3, 8.8, 5) down to north tree deck (-15, 4.8, 13); high ring south edge (-3, 8.8, -5) down to south tree deck (-15, 4.8, -13) | Fast rotation back |
| Spawn tree | Trunk at (-28, 0, 0), huts at its base, spawns at (-30, 0, -6), (-30, 0, -2), (-30, 0, 2), (-30, 0, 6) | |
| Tall grass | x -24 to -8, z 6 to 12 and z -12 to -6 | Floor ambushes |
| Fallen logs | Scattered low cover on the floor | |

**Notes:** "high ground", "zip line". **Sun shafts:** on.

**Validation extras:** every deck is reachable by walk links; every zip line is clear of colliders with 0.5 m spare; grass volumes sit on walkable ground.

**Signature moments:** shots fired while riding a zip line, drops from high decks, grass ambushes on the floor.

---

## Map 3: Lost River (`lost-river`)

A jungle river between two ruined gates with three ways across: an aqueduct, a crashed seaplane and the river itself, which floods every two minutes.

### Center (self-symmetric)

| Piece | Geometry | Purpose |
|---|---|---|
| River | Bed at y -1.0 for x -5 to 5, full length. Water volume top at y -0.4, tagged `flood` | Low route |
| Aqueduct | Stone channel along X at z 8.75 to 11.25, walkway top at y 5 from x -14 to 14, arches below, broken 2 m gap at x -1 to 1 | High route, jump or grapple the gap |
| Aqueduct stairs | Up at x ±16 to ±14 | |
| Seaplane wreck | Fuselage across the river at z -6 from x -7 to 7: hollow interior 2.6 m wide, 2.2 m tall, floor at y 0.2; roof walkable at y 2.6 | Middle route |
| Broken wing | Ramp from the north bank up to the fuselage roof, both sides | |
| Log bridges | Along X at z ±18 from x -6 to 6, walkable top at y 1.0, 1 m wide | Narrow crossings |
| Waterfall cave | South end, z -26 to -20: waterfall over the river, a tunnel behind it crossing at y 0 from x -6 to 6 | Hidden route |

### Sun half

| Piece | Geometry | Purpose |
|---|---|---|
| Bank | Floor at y 0 for x -34 to -5 | |
| Ruined gate | Two pillars and a lintel at x -24, z -3 to 3 | Spawn cover |
| Spawns | (-30, 0, -6), (-30, 0, -2), (-30, 0, 2), (-30, 0, 6), yaw -PI/2 | |
| Reeds | Tall grass along the bank, x -8 to -5, broken into segments | Crouch cover by the water |
| Serpent statues | Generic stone heads at the aqueduct stairs | Landmarks |
| Mangrove trees | Along the bank | |

**Notes:** "flood every two minutes", "behind the falls". **Sun shafts:** on.

**Validation extras:** flood level never reaches the aqueduct, wreck roof or log bridge surfaces; all three crossings connect both banks in the waypoint graph.

**Signature moments:** aqueduct gap jumps under fire, fights inside the wreck, getting caught in the river when the flood hits.

---

## Practice Camp (`camp`)

An expedition camp on a jungle trail. The player starts at (0, 0, 0) facing -Z.

| Station | Setup |
|---|---|
| Targets | Straw dummies at 10, 20, 30, 45 and 60 m with player hitboxes |
| Moving targets | Rope rails at 25 m (4 m/s) and 40 m (7 m/s) |
| Zip line | From a 6 m watchtower down the trail |
| Grapple | A gold vine wall |
| Slide | Fallen logs with 1.1 m clearance |
| Boulder | A short lane with a lever and one alcove |
| Stealth | A creek with tall grass and one patrolling bot |

M8 tutorial prompts use these stations.

## Map rotation (W6)

`TdmRoom` plays sun-temple, then canopy, then lost-river, then repeats. `MatchState.mapId` names the map and clients build it from the id. M8 adds a next-map vote on the end screen (majority wins, ties follow the rotation).
