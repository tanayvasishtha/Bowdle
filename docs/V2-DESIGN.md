# Bowdle v2 design: feel, depth and content

v1.1 (RETENTION.md) gives players reasons to come back. v2 makes every second of play feel great and gives them more to do. This doc lists the gaps found in a September 2026 audit and defines every fix with exact numbers. `docs/RUNBOOK-V2.md` turns it into milestones G1 to G14.

Doodle District (doodleshooter.vercel.app) was studied for mechanics only. Bowdle never copies its code, names, numbers or assets. Every system below is our own design, built around the bow and the jungle expedition.

## 1. Gap audit

### Where Bowdle is already ahead

- Dedicated authoritative server with prediction, rewind and anti-cheat by design. Doodle District runs peer to peer with a host player.
- Team play with bots that fill every match.
- Accounts, progression, challenges, cosmetics, leaderboard (v1, v1.1).
- A distinct art direction and a bow-only combat identity.

### Gaps, by area

| # | Area | Gap in Bowdle v1.1 | Impact |
|---|---|---|---|
| 1 | Camera feel | Only aim zoom and crouch height. No speed FOV, bob, roll, landing dip or shake | Movement feels flat, the top reason players bounce |
| 2 | Hit feel | No damage numbers, few sounds (7), no kill confirm sound, no hit direction on body | Shots feel weightless |
| 3 | Jump | 1.2 m apex, floaty 20 m/s² gravity | Low skill ceiling, cannot reach ledges |
| 4 | Movement verbs | No double jump, wall jump, mantle or dodge | Few ways to escape or outplay |
| 5 | Slide | Hard 1.1 s cap and 0.8 s cooldown, no slide jump bonus | Chains feel cut off |
| 6 | Physics robustness | Fixed 2 substeps, no step-down snap on boxes | Tunnelling risk at grapple and zip speeds, bumpy stairs |
| 7 | Grapple | Straight pull only, 1.6 s | Misses the most fun traversal: swinging |
| 8 | Combat depth | One arrow type, dagger, ink cloud | Every fight plays the same |
| 9 | Counterplay | No way to answer an incoming arrow except Robin Hood by luck | Low outplay moments |
| 10 | Modes | 4v4 team match only | No solo loop, no variety |
| 11 | PvE | None | Players who dislike PvP leave; no offline-ish practice beyond camp targets |
| 12 | Maps | 3 launch maps, no moving or breakable parts, no pickups, no jump pads | Maps get stale within a week |
| 13 | Falling | Ravine and edges have no rule | Unclear deaths, no knock-off plays |
| 14 | Onboarding | Camp targets and a 28-line tutorial | New players never learn slide, grapple or zip timing |
| 15 | Audio | No music, no directional footsteps, one volume slider | Low atmosphere, hard to track enemies |
| 16 | Input | Keyboard and mouse only, no invert Y, no trackpad mode | Loses laptop and controller players |
| 17 | Accessibility | Team symbols only | No reduce motion, no colorblind team palettes, no sound indicators |
| 18 | Communication | No pings or callouts | Team play depends on luck |
| 19 | Dead time | No spectating during respawn beyond the arrow cam | Boring deaths |
| 20 | Idle players | No AFK handling | Dead weight in team matches |
| 21 | Safety | No report or mute | Name abuse goes unchecked |
| 22 | Highlights | No play of the match | Fewer shareable moments |
| 23 | Competitive | No ranked mode or rating | Nothing for skilled players to climb |
| 24 | Regions | One server, no ping display | Bad latency far from the host |
| 25 | Performance | No quality presets, no FPS cap, no loading progress | Low-end laptops struggle |
| 26 | Sharing and SEO | No meta description, Open Graph tags, icon or manifest | Links shared on X look empty; no install |
| 27 | Menu idle | Static menu | No attract loop to show the game off |

## 2. Camera and hit feel (G1)

All numbers in `src/client/render/look.ts` unless marked as gameplay.

| Effect | Rule |
|---|---|
| Speed FOV | FOV adds `min(8, max(0, horizontalSpeed - 8) * 1.2)` degrees, eased at 6 per second |
| Head bob | Grounded and not sliding: vertical 0.03 m and lateral 0.018 m, frequency `1.8 + speed * 0.12` Hz, amplitude scaled by `clamp(speed / 8, 0, 1.2)` |
| Strafe roll | `-strafeInput * 1.2` degrees, sliding adds -4 degrees, eased at 9 per second |
| Landing dip | Camera drops `min(0.18, fallSpeed * 0.012)` m and recovers over 220 ms |
| Kicks | FOV +3 on jump, +2 on double jump, +4 on dodge, +2.5 on slide start, each decaying over 250 ms |
| Shake | Landing faster than 12 m/s, taking damage (scaled by damage / 100), boulder within 6 m. Max 0.8, decays at 7 per second |
| Damage vignette | Sepia ink edges, alpha `0.6 * (1 - hp / 100)` for 400 ms after a hit |
| Speed streaks | Above 13 m/s, the composite pass draws ink streaks at the screen edges, alpha rising to 0.35 at 20 m/s |
| Reduce motion | One setting turns off bob, roll, shake, streaks and FOV kicks. Default off. |

Hit feel:

- Damage numbers: optional (default on), float from the hit point, 600 ms, gold for headshots.
- Sounds, all generated in `sfx.ts`: hit tick (pitch rises with damage), headshot ding, kill confirm (two notes), dodge whoosh, double jump flutter, wall jump thud, mantle scrape, rope reel, rope snap, UI click and hover.
- Kill confirm: the crosshair flashes an X for 250 ms, gold for a headshot kill.

## 3. Movement 2.0 (G2)

All gameplay numbers in `src/shared/constants.ts`. Client and server share the simulation, so every change needs updated movement tests, prediction checks and a bot soak.

### Tuning

| Constant | v1 | v2 |
|---|---|---|
| `GRAVITY` | 20 | 24 |
| `JUMP_VELOCITY` | 7 | 8.4 (apex 1.47 m) |
| `RUN_SPEED` | 8 | 8.5 |
| `GROUND_ACCEL` | 10 | 14 |
| `FRICTION` | 6 | 6.5 |
| `COYOTE_MS` | 100 | 130 |
| `JUMP_BUFFER_MS` | 100 | 140 |
| `MAX_HORIZONTAL_SPEED` | 14 | 16 (ground and air control cap) |
| `ABSOLUTE_SPEED_CAP` | none | 30 (any source, including launches) |

Bowdle keeps always-run with no sprint key: speed comes from slides, hops and ropes.

### Landing grace

Landing faster than 9 m/s horizontally applies 30 % friction for 350 ms, so bunny hops and slide chains keep their speed.

### Vine hop (double jump)

- One per airtime, restored on landing, wall jump or rope launch.
- Sets vertical speed to 7.1. If there is move input, horizontal velocity turns toward it, keeping `max(currentSpeed, 6.5)`.
- Not available while carrying the relic (G8) or riding a zip line.

### Wall jump

- In the air, within 120 ms of touching a wall that is not a ramp.
- Pushes 7 m/s along the wall normal, keeps 40 % of the velocity along the wall, and sets vertical speed to 8.4.
- 400 ms cooldown. Restores the vine hop. At most 3 wall jumps before touching the ground, so walls cannot be climbed forever.

### Mantle

- In the air, holding forward, with a ledge top 0.6 to 2.0 m above the feet within 0.8 m ahead, and room to stand on it.
- Sets vertical speed to reach 0.4 m above the ledge and forward speed to 3 m/s. 600 ms cooldown.
- Bots get a new waypoint link kind `mantle`.

### Dodge (Shift)

- Ground or air. 1.6 s cooldown, shown in the ability boxes.
- Sets speed along the move input (or forward) to `max(current + 5, 13)`. In the air vertical speed becomes at least 1.5.
- A dodge never changes the hitbox.

### Slide rework

| Constant | v1 | v2 |
|---|---|---|
| Start speed | 6 | 6.5 |
| Boost | +2.5 up to 12 | to `min(start + 3, 12.5)` |
| Duration cap | 1100 ms | none; speed decays at 6 m/s² |
| End | below 4 | below 3.5, or 350 ms airborne |
| Cooldown | 800 ms | 500 ms |
| Steering | 2 | 5 |
| Slide jump | none | horizontal speed x 1.06, capped at `MAX_HORIZONTAL_SPEED` |

### Collision robustness

- Substeps per tick become `min(8, max(2, ceil(speed * tickDt / 0.28)))`, so a body never moves more than 0.28 m per substep.
- Step-down snap: a body that was grounded last substep and is not rising snaps down up to `STEP_HEIGHT` onto boxes and ramps.
- Falling out: below `bounds.min.y - 8`, the player dies. If an enemy damaged them in the last 5 s the kill goes to that enemy with weapon `fall` and the feed reads "KNOCKED OFF". Otherwise "LOST IN THE RAVINE".

## 4. Swing grapple and rope cutting (G3)

| Step | Rule |
|---|---|
| Fire (press E) | Hook travels at 120 m/s, range 45 m, only onto `grapple` surfaces and swing anchors |
| Attach | Rope length = distance x 0.95, at least 2 m |
| Hold E | Reel in 12 m/s; pull 38 m/s² up to 22 m/s along the rope |
| Release E | Swing: a length constraint, gravity x 0.9; forward input adds 8 m/s² horizontally while below the anchor |
| Space | Detach and launch: +2 m/s along velocity, +3 m/s up; restores vine hop |
| Crouch | Detach without a launch |
| Auto detach | 4.5 s attached, line of sight blocked for 300 ms, closer than 1.5 m, or rope cut |
| Cooldown | 5 s from detach |

- Rope cut: an enemy arrow passing within 0.25 m of a rope segment cuts it. The owner drops, the shooter gets "ROPE CUT" (+25 XP) and medal Snip (add to MEDALS).
- The server owns rope state (`grappleX/Y/Z`, new `grappleLen`, `grappleMs`). Prediction replays it like other movement.
- Bots: swing between anchors on `grapple` links and launch at the far end.

## 5. Bow depth (G4)

### Quiver

Keys 1, 2, 3 or the mouse wheel. The selected arrow shows on the HUD and on the viewmodel nock.

| Arrow | Rules |
|---|---|
| Broadhead | v1 arrow, unlimited |
| Scatter | 3 arrows at -4, 0, +4 degrees; each 55 % body damage, headshot multiplier 1.5; full draw 700 ms; 3 charges, one returns every 6 s |
| Tether | Needs a full draw. Sticks in a solid or grapple surface 6 to 35 m away with a slope of 35 degrees or less; creates a zip line from 1.2 m above the release point to the hit point for 10 s. One active per player, 14 s cooldown. Anyone can ride it; an enemy arrow cuts it like a rope |

Damage numbers, charges and cooldowns live in constants. Arrow kind goes in `ArrowState.kind` (`broadhead`, `scatter`, `tether` plus the existing ability kinds).

### Dagger swat

- A dagger swing destroys enemy arrows that pass within 1.8 m in front of the player, inside a 70 degree arc, during the first 180 ms of the swing.
- "SWATTED" +25 XP, medal Swatter.
- The server checks it with the rewound arrow positions, like hits.

## 6. Onboarding (G5)

- First launch: name, then a 90 second guided course in Practice Camp with 8 stations: move, jump and vine hop, slide, wall jump, mantle, grapple swing, bow draw and headshot, dagger swat. Each station shows one line of text and a ghost marker. It can be skipped and replayed from the menu.
- Completing it grants 100 Ink once (server checks a `tutorial_done` flag set by an authenticated call, rate limited).
- First 5 matches: a contextual tip line when a move is available but unused ("Hold E to reel in"), at most one tip per 45 s, turned off in settings.
- F1 shows a controls overlay at any time.
- "Click the page to aim" hint when pointer lock is lost.

## 7. Audio (G6)

- Procedural music with three layers (pad, percussion, melody) mixed by intensity: 0 in menus, 0.4 exploring, 1.0 when an enemy is visible or the player took damage in the last 4 s. Crossfades over 1.5 s. Toggle with M.
- Volume buses: master, music, effects, ambience, each a slider.
- Directional enemy footsteps within 18 m (louder when running, silent when crouched), plus grapple and zip sounds from other players.
- Sound indicators (accessibility): screen-edge ink arcs for footsteps, shots and boulders when enabled.

## 8. Input and accessibility (G7)

- Gamepad (Gamepad API, standard mapping): left stick move, right stick look with a response curve (exponent 1.8, deadzone 0.12), RT draw, LT aim, A jump, B slide, X previous arrow, Y next arrow, RB grapple, LB ink, R3 dagger, L3 dodge, Start menu. Separate sensitivity. Aim slowdown: turning speed x 0.6 while the crosshair is over an enemy within 40 m (no snapping).
- Invert Y, separate aim sensitivity, trackpad mode (toggle aim instead of hold, draw with one tap and release with a second).
- Crosshair: style (dot, cross, circle), size, color from the palette.
- Colorblind team palettes: default, deuteranopia, protanopia, tritanopia. Palettes change only the two team washes and their outlines.
- Reduce motion (from G1), sound indicators (from G6), subtitles for callouts (from G11).

## 9. Modes (G8)

`MatchState.mode` is one of `tdm`, `ffa`, `relic`, `expedition`. The menu gets a playlist picker: Quick Play (tdm), Free for All, Relic Run, Expedition, Practice. Party leaders pick the mode.

### Free for All

- 8 players, bots fill. First to 20 kills or 7 minutes.
- Every player is their own team for damage, spawns and scoring. `PlayerState.team` stays for rendering: players get a neutral outfit tint and a name-color ring instead of team colors.
- Spawns pick the point farthest from every living player.

### Relic Run

- One golden relic at the map center. Pick it up by touching it.
- The carrier moves at 85 % speed, cannot grapple, vine hop or use a tether, and is outlined for everyone.
- Bring it to your own camp zone (a volume near your spawns) to score. First to 3 captures or 8 minutes.
- Dropped on death. It returns to the center after 15 s on the ground or when a player of the other team touches it in their half.
- Map data gains `relic` (center) and `camps` (sun and moon volumes). All three launch maps get them.

## 10. Expedition: co-op waves (G9)

A PvE mode for 1 to 4 players in a new `ExpeditionRoom` that reuses the shared simulation and the bow.

### Creatures (ink-drawn, procedural)

| Creature | HP | Behavior | From wave |
|---|---|---|---|
| Scribble Beetle | 40 | Fast ground rush, 15 damage bite | 1 |
| Blot Spitter | 60 | Keeps 15 to 25 m away, lobs ink that deals 20 and slows 30 % for 1.5 s | 2 |
| Stone Guardian | 150 | Front shield blocks arrows; damage only from behind or on the head gem | 4 |
| Vine Wisp | 30 | Flies, erratic, dives for 10 damage | 6 |
| Temple Colossus (boss) | 800 + 200 per extra player | Glowing weak gem, ground stomp shockwave (jump to dodge, 35 damage), summons 4 beetles at 50 % HP | every 5th wave |

### Waves

- Count `6 + 2n`, times 1.3 for each extra player; at most `min(18, 4 + n)` alive.
- Every 3rd wave draws a modifier: Swarm (+35 % count, -30 % HP), Heavy (+25 % HP), Night (fog, shorter view), Low Gravity (gravity x 0.7).
- 8 s break between waves; two herb pickups (heal 40) spawn; ink cloud recharges.
- Downed players crawl for 15 s; a teammate holds F for 2 s to revive. Solo players get one extra life every 5 waves.
- Checkpoints every 5 waves: a new run may start from the highest checkpoint reached.
- Rewards: 5 XP per wave, 40 XP per boss, 2 Ink per wave capped at 30 Ink per run. Personal best wave stored per account; weekly Expedition leaderboard.
- Uses Sun Temple and Lost River with creature spawn points added to map data.
- Challenge pool additions (RETENTION.md): "Reach wave 10 in Expedition", "Defeat a Temple Colossus".

## 11. Maps and map kit (G10)

### Map kit additions

| Feature | Data | Rules |
|---|---|---|
| Swing anchor | `anchors: { id, pos, sway: { axis, amplitude, periodS } }` | Gold ring on a chain; grapple target that moves on a sine; deterministic from match time |
| Geyser | `geysers: { id, pos, radius, launch }` | Launches upward at `launch` m/s (default 14); bots link kind `geyser` |
| Breakable | `breakables: { id, box, hp }` | Plank walls and crates with 60 HP; broken for 30 s, then rebuilt if nobody stands inside |
| Herb | `herbs: { id, pos }` | Heals 30, respawns after 20 s; one per side on PvP maps |
| Kill volume | `bounds.min.y` | Fall rule from section 3 |

All validated in `validateMap`, mirrored, and drawn in the journal style.

### New maps

- **Sky Bridges:** three canopy tiers over a gorge, rope bridges, 6 swing anchors, two geysers at the gorge floor, knock-off plays along the bridges. Landmark: a giant hollow tree with a spiral stair.
- **Sunken Ruins:** a half-flooded temple courtyard, breakable plank walls blocking flank routes, 2 geysers, a tide cycle every 90 s that floods the lower courtyard.

Both follow the art density and scenery rules (WORLD.md, W7, W8) and join the rotation and map vote.

## 12. Social and safety (G11)

- **Pings:** middle mouse or Z places a team marker for 6 s, typed by what is under the crosshair (enemy, location, relic, anchor). Hold Z for a wheel with six callouts: Enemy here, On my way, Need help, Grapple here, Fall back, Nice shot. Rate limit 3 per 5 s. Callouts show as text lines too (subtitles).
- **Spectate on death:** after the arrow cam, the camera follows the killer until respawn, with their name, level and weapon.
- **AFK:** no input for 60 s shows "Still there?"; at 90 s the player returns to the menu and a bot takes the slot.
- **Report and mute:** from the scoreboard, report a name (offensive name, cheating, AFK) or mute a player's pings. Reports go to a `reports` table. Three reports from distinct accounts for an offensive name within 24 h reset the name to "Explorer" plus four digits.
- **Play of the match:** the end screen replays the longest-shot or best-streak kill (ReplayDirector capture) for 6 s before the stats, with Save clip.

## 13. Ranked and regions (G12)

- **Ranked Team Match:** needs level 10 and a linked account. Hidden Glicko-2 rating (1500 start, deviation 350). 5 placement matches.
- **Tiers** by `rating - 2 x deviation`: Scribble below 1200, Sketch 1200, Ink 1400, Etching 1600, Illumination 1800, Masterwork 2000 and up. Tiers reset softly each season (deviation raised to 200).
- **Queue:** a `queue` room pairs players by rating, widening the window by 50 every 10 s. No bots in ranked; after 90 s in queue, offer an unranked match.
- Leaving a ranked match early counts as a loss.
- **Regions:** `REGION` env on each server; the client pings every entry of `VITE_REGIONS` (JSON list of `{ id, url }`) at boot, picks the lowest, shows ping in the HUD, and allows a manual override in settings.

## 14. Performance and growth (G13)

- **Graphics presets** Low (render scale 0.7, props hidden past 50 m, no boil, no hatching), Medium, High. A 5 s benchmark on first launch picks one. FPS cap 30, 60, 120 or unlimited.
- **Loading screen** with real progress: map build, shader warm-up (compile every material once before the first frame), server join.
- **Attract mode:** after 30 s idle on the menu, the background plays a bot match on a random map with a slow orbit camera.
- **Sharing:** `index.html` gets a description, Open Graph and Twitter card tags. `npm run og` renders `public/og.png` (1200 x 630) from an in-engine view with Playwright. Party links get a party-specific title.
- **Install:** web app manifest with generated icons (`npm run icons` draws them on a canvas), theme color parchment, and a minimal service worker that caches the app shell only.
- **Funnel events** (server log lines, no personal data): `menuOpened`, `tutorialDone`, `firstMatch`, `secondMatch`, `modePicked`.

## 15. Rules that stay fixed

- Cosmetic-only monetization, fixed prices, no random paid rewards, no paid gameplay advantages (ECONOMY.md).
- The retention fairness rules in RETENTION.md.
- Server authority for every gameplay outcome, including swats, rope cuts, pickups, relics and creature hits.
- No art or audio files. Generated build outputs (`og.png`, icons) are the only images, and they are produced by scripts in the repo.
