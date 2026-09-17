# Bowdle game design

Name: **Bowdle**. Tagline: *doodle bow shooter*.

## Pitch

A fast team shooter drawn in blue ballpoint on notebook paper. Everyone has a bow. Pull back to charge, lead your target, land the headshot. Movement is quick and slippery so fights are about aim and positioning.

## Pillars

1. **Every kill looks good.** Arrows fly visibly, drop a little, stick in walls. Long shots and headshots are worth clipping.
2. **Fast and fair.** High movement speed, short time to kill, server-authoritative hits. No pay to win.
3. **Loads instantly.** Tiny download, no art files, playable from a link in seconds.

## Modes

| Mode | Milestone | Rules |
|---|---|---|
| Practice Camp | W6 | Offline. Targets and traversal stations, no timer |
| Team Deathmatch | M4 | 4v4, bots fill empty slots, first team to 25 kills or most kills after 7 minutes |
| Free for All | G8 | 8 players, bots fill, every player on their own; first to 20 kills or most kills after 7 minutes |
| Relic Run | G8 | 4v4, carry the relic from the map center to your camp; first to 3 captures or most after 8 minutes |
| Expedition | G9 | Co-op PvE for 1 to 4 players: waves of ink creatures on Sun Temple or Lost River until everyone is down |
| Kill Confirmed | later | Not planned |

The menu lists Play (team deathmatch), Free for All, Relic Run and Expedition. Each public mode is its own room name (`tdm`, `ffa`, `relic`, `expedition`), because matchmaking only filters on options a joiner sends; a party picks its mode when the leader starts it. `MatchState.mode` holds the mode and `src/shared/sim/modes.ts` holds the per-mode rules (scoring, spawns, end conditions).

**Free for All:** each player gets a team number of their own, so every existing "other team" check (damage, arrows, ropes, tethers, swats) means "anyone else". Players wear a neutral outfit and a colored name ring, the first-person sleeve is neutral, the scoreboard is one list by kills, and the score reads YOU and BEST. Spawns pick the point farthest from every living player. The winner is the player with the most kills.

**Relic Run:** the relic rests at `MapData.relic` (the altar top on Sun Temple, the low ring deck on Canopy Village, the river crossing on Lost River) and each team has a camp (`MapData.camps`) around its spawns. Touching the relic at home picks it up. The carrier runs at 85 % speed and cannot grapple, vine hop or shoot a tether; a gold halo marks them for everyone. Reaching their own camp scores a capture and sends the relic home. A dying carrier drops it; it goes home after 15 s on the ground, at once when a player of the other team than the dropper touches it in their own half, or when it falls out of the world. Anyone else touching it picks it up. Kills do not score. A marker shows the relic on screen. Bots split into runners (always play the relic), escorts (follow a carrying teammate) and chasers (hunt an enemy carrier); bots with a relic objective only fight enemies within 14 m.

**Expedition:** every player is on the sun team and the enemies are creatures, simulated in `src/shared/sim/creatures.ts` and run by the wave director in `src/server/rooms/expedition.ts`. Creatures enter at `MapData.creatureSpawns` and follow the bot waypoint graph toward the nearest standing player.

| Creature | HP | Behavior | From wave |
|---|---|---|---|
| Scribble Beetle | 40 | Rushes at 7.5 m/s, 15 damage bite | 1 |
| Blot Spitter | 60 | Keeps 15 to 25 m away and lobs ink: 20 damage and 30 % slow for 1.5 s | 2 |
| Stone Guardian | 150 | A front shield blocks arrows within its 110 degree arc; hit it from behind or on the head gem | 4 |
| Vine Wisp | 30 | Hovers 3.5 m up, circles and dives for 10 damage | 6 |
| Temple Colossus | 800, +200 per extra player | Body takes half damage, the gem double; stomps (35 damage within 9 m, jump to dodge) and calls 4 beetles at half health | every 5th wave |

- A wave holds `6 + 2n` creatures, times 1.3 for each extra player, with at most `min(18, 4 + n)` alive. A boss wave spawns the Colossus with half the usual count.
- Every 3rd wave draws a modifier: Swarm (+35 % count, -30 % HP), Heavy (+25 % HP), Night (a dark tint and a shorter view) or Low Gravity (gravity x 0.7 for players and creatures).
- 8 s breaks between waves (3 s before the first). Two herbs (heal 40) grow at `MapData.herbSpawns`, the ink cloud recharges and players who were out come back at camp.
- At zero health a player goes down: they crawl at 25 % speed for 15 s and cannot shoot or use abilities. A teammate holding Use within 2 m for 2 s revives them at 50 HP. The run ends when nobody is standing. A solo player earns a spare life every 5 waves, used instead of going down. Falling out of the world costs 25 health and returns the player to camp.
- Checkpoints every 5 waves: the menu offers a start after the highest checkpoint the account has reached. Expedition rooms are split by the `checkpoint` join option, so every Expedition join sends it.
- Rewards: 5 XP per cleared wave, 40 XP per Colossus, 2 Ink per cleared wave up to 30 Ink per run. Runs are stored in `expedition_runs` for the personal best (on the profile) and the weekly board (`GET /api/expedition/leaderboard`).
- The HUD shows the wave, creatures left, the modifier and spare lives, a health bar for the Colossus, a downed screen with the bleed-out timer and a revive prompt. The end screen shows the wave reached, the best and the rewards.
- Creatures are drawn as instanced ink rigs, two draw calls per kind (body and gold accents), so a full wave stays well inside the 150 draw call budget.

## Teams and colors

Two teams: **Sun** (team 0, orange) and **Moon** (team 1, indigo). Warm sepia world lines and watercolor scenery keep both teams readable. Exact colors are in `docs/RENDERING.md`.

## Controls (desktop)

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Look |
| Hold left mouse | Pull the bow back (draw). Release to fire |
| R | Cancel the draw without firing |
| Hold right mouse | Aim: zoom and move slower |
| Space | Jump. In the air: vine hop, or wall jump right after touching a wall |
| Left Shift | Dodge |
| 1, 2, 3 or mouse wheel | Broadhead, scatter or tether arrow |
| C or Left Ctrl | Crouch. While running fast: slide |
| V | Dagger stab (cancels the draw) |
| E | Grapple: hold to reel, let go to swing |
| Q | Ink cloud arrow (M7) |
| Tab | Scoreboard |
| Esc | Menu, releases mouse |
| F3 | Debug overlay (dev builds only) |
| F1 | Controls overlay with the current keys |
| M | Music on or off |

## Onboarding (v2)

- **First launch:** a player with no saved name and no finished course names their explorer, plays the field course (`?scene=camp&course=first`), then goes straight into a first match. Returning players land on the menu, which has a Field course button (`?scene=camp&course`).
- **Field course:** eight stations in Practice Camp, in order: walk to the marker, vine hop, slide, wall jump at the watchtower, mantle onto the course crate (1.8 m), grapple swing at the gold vine, headshot a target, and swat a slow practice arrow. Each station shows one line and a floating marker. Moves only count for the current station. The course can be skipped; plain practice starts without it once it is finished or skipped.
- **Reward:** finishing calls `POST /api/tutorial/done`, which sets `tutorial_done` and grants 100 Ink once per account (5 calls per minute per account).
- **Tips:** during a player's first 5 matches on a device, a tip line names a move that is available but unused for 40 s (reel, vine hop, dodge, scatter, slide), at most one every 45 s and each once per match. Settings can turn tips off.
- **Help:** F1 lists every control. While the mouse is not captured, "Click the page to aim" shows in the middle of the screen.
- **Funnel:** the client reports `menuOpened` through `POST /api/funnel` (only that event, 60 per hour per address); the server logs `tutorialDone`, `firstMatch` and `secondMatch` itself.

## Audio (v2)

All sound is generated in the browser; there are no recorded files. One audio context feeds a master bus and three buses under it (music, effects, ambience), each with a settings slider; ad breaks suspend it. Numbers are in `AUDIO_MIX` in `src/client/render/look.ts`.

- **Music:** three layers (a filtered pad, kick and shaker percussion, a pentatonic melody) mixed by one intensity: 0 in the menu (pad only, quietly), 0.4 in practice and while exploring (pad and some percussion), 1 when an enemy within 35 m is on screen or the player was hit in the last 4 s (all layers). Layers crossfade over 1.5 s. M switches the music on and off and the choice is saved.
- **Enemy footsteps:** within 18 m, one step every 2 m walking or 2.8 m running (6 m/s and up), panned around the listener. Walking steps play at 45 % of running ones, fading with distance; crouched, slow, airborne and zip-riding enemies make none.
- **Other players:** a grapple or zip start within 30 m plays at its position, and so does the first sight of an enemy arrow.
- **Sound indicators** (setting, off by default): an ink arc near the screen edge toward each enemy footstep, nearby enemy shot and starting boulder roll.

## Gamepad and accessibility (v2)

Standard-mapping gamepads work in matches and menus (`src/client/game/gamepad.ts`). Numbers are in `PAD` there.

| Input | Action |
|---|---|
| Left stick | Move (radial deadzone 0.12) |
| Right stick | Look (deadzone 0.12, response curve exponent 1.8, 3.2 rad/s at full tilt times the gamepad sensitivity) |
| RT / LT | Draw and fire / aim |
| A / B | Jump / slide |
| X / Y | Previous / next arrow |
| RB / LB | Grapple / ink cloud |
| R3 / L3 | Dagger / dodge |
| D-pad down | Use |
| Start | Menu |

- **Aim slowdown:** stick look turns at 60 % while an enemy within 40 m is drawn within 70 px of the screen center. It only changes turning speed; nothing snaps.
- **Menus:** while a menu or panel is open, the D-pad or left stick moves focus (left and right nudge sliders), A presses, B goes back. During play with no panel open the pad belongs to the game, and the "Click the page to aim" hint is hidden when a pad is connected.
- **Options:** invert vertical look, aim sensitivity (look speed while aiming, mouse and pad), gamepad sensitivity, trackpad mode (draw and aim toggle on each press), crosshair style (circle, dot, cross), size (12 to 48 px) and color (ink brown, sun orange, gold, moon blue, paper).
- **Team colors:** standard, deuteranopia, protanopia and tritanopia palettes (`TEAM_PALETTES` in `src/client/render/palette.ts`). A palette changes only the two team washes and their outlines, through composite shader uniforms.

## Units and conventions

- Meters, seconds, radians. +Y is up.
- `yaw = 0` looks toward -Z. Forward vector: `(-sin(yaw), 0, -cos(yaw))`. Facing +X means `yaw = -PI/2`.
- Pitch is clamped to plus or minus 89 degrees.
- The simulation runs at a fixed step. See `TICK_HZ` and `SUBSTEPS` below.

## Tuning numbers

All of these go into `src/shared/constants.ts` with these exact names. Change them there only.

### Simulation

| Name | Value | Notes |
|---|---|---|
| `TICK_HZ` | 30 | Inputs per second and server ticks per second |
| `SUBSTEPS` | 2 | Physics runs at 60 Hz inside each tick |

### Movement

Quake-style acceleration: `addSpeed = wishSpeed - dot(vel, wishDir)`; if positive, `vel += wishDir * min(accel * dt * wishSpeed, addSpeed)`.
Friction: `control = max(speed, STOP_SPEED)`, `newSpeed = max(0, speed - control * friction * dt)`.

| Name | Value | Notes |
|---|---|---|
| `GRAVITY` | 24 | m/s² |
| `RUN_SPEED` | 8.5 | Ground wish speed. Always run, no sprint key |
| `CROUCH_SPEED` | 4.0 | |
| `AIM_SPEED_MULT` | 0.75 | While aiming |
| `GROUND_ACCEL` | 14 | |
| `AIR_ACCEL` | 70 | |
| `AIR_WISH_CAP` | 1.0 | Wish speed cap in the air, allows air strafing |
| `FRICTION` | 6.5 | |
| `STOP_SPEED` | 3 | |
| `JUMP_VELOCITY` | 8.4 | Apex about 1.47 m |
| `MAX_HORIZONTAL_SPEED` | 16 | Cap while grounded and for player-controlled speed |
| `ABSOLUTE_SPEED_CAP` | 30 | Cap on total speed in the air, including launches |
| `STEP_HEIGHT` | 0.45 | Auto step-up and step-down on ledges and stairs |
| `COYOTE_MS` | 130 | Jump still allowed this long after leaving ground |
| `JUMP_BUFFER_MS` | 140 | Jump pressed slightly before landing still fires |
| `PLAYER_WIDTH` | 0.7 | Collision box is width × height × width |
| `STAND_HEIGHT` | 1.8 | |
| `CROUCH_HEIGHT` | 1.0 | Also the slide height |
| `EYE_STAND` | 1.62 | |
| `EYE_CROUCH` | 0.9 | |

**Bunny hop:** on the first substep after landing, skip friction if jump is held or buffered.
**Landing grace:** landing faster than 9 m/s applies 30 % friction for 350 ms.

### Air moves (v2)

| Move | Input | Rules |
|---|---|---|
| Vine hop | Jump in the air | Once per airtime; vertical speed 7.1; turns toward the input keeping at least 6.5 m/s. Restored on landing, wall jumps and rope launches |
| Wall jump | Jump within 120 ms of touching a wall in the air | 7 m/s off the wall, keeps 40 % of speed along it, vertical speed 8.4; 400 ms cooldown; at most 3 before landing; restores the vine hop |
| Mantle | Hold forward into a ledge in the air | Ledge top 0.6 to 2.0 m above the feet within 0.8 m, with room to stand; lifts to 0.4 m above the ledge and carries forward at 3 m/s for 350 ms; 600 ms cooldown |
| Dodge | Shift (rebindable) | Ground or air; speed along the input (or forward) becomes at least 13, or current + 5; lifts to 1.5 m/s in the air; 1.6 s cooldown. Never changes the hitbox |

**Collision:** bodies move in pieces of at most 0.28 m (up to 8 per substep), so nothing passes through thin walls at speed. Ramps are solid wedges: a body cannot walk into one from the side or the high end, and a body that lands overlapping one can always walk out.
**Falling:** 8 m below a map's lowest bound kills. An enemy who damaged the player in the last 5 s gets the kill ("KNOCKED OFF"); otherwise the feed reads "LOST IN THE RAVINE".

### Slide

| Name | Value | Notes |
|---|---|---|
| `SLIDE_MIN_SPEED` | 6.5 | Crouch pressed on ground above this speed starts a slide |
| `SLIDE_BOOST` | 3 | Speed becomes min(start + 3, 12.5), never lower than the start |
| `SLIDE_MAX_SPEED` | 12.5 | Boost cannot push past this |
| `SLIDE_DECEL` | 6 | m/s lost per second while sliding; no time limit |
| `SLIDE_STEER_ACCEL` | 5 | Only steering allowed while sliding |
| `SLIDE_AIR_MS` | 350 | A slide ends after this long airborne |
| `SLIDE_END_SPEED` | 3.5 | Slide ends below this speed |
| `SLIDE_COOLDOWN_MS` | 500 | No new boost until this passes |
| `SLIDE_JUMP_MULT` | 1.06 | Jumping out of a slide multiplies horizontal speed, up to the ground cap |

### Bow and arrows

Draw fraction: `f = clamp((drawMs - DRAW_MIN_MS) / (DRAW_FULL_MS - DRAW_MIN_MS), 0, 1)`. Releasing before `DRAW_MIN_MS` cancels silently.

| Name | Value | Notes |
|---|---|---|
| `DRAW_MIN_MS` | 120 | |
| `DRAW_FULL_MS` | 550 | |
| `RELEASE_COOLDOWN_MS` | 200 | Time to nock the next arrow |
| `ARROW_SPEED_MIN` | 45 | m/s at f = 0 |
| `ARROW_SPEED_MAX` | 95 | m/s at f = 1 |
| `ARROW_GRAVITY` | 9 | m/s², lighter than player gravity |
| `ARROW_RADIUS` | 0.07 | Swept sphere radius for hits |
| `ARROW_LIFETIME_MS` | 3000 | |
| `ARROW_MAX_PER_PLAYER` | 10 | Oldest is removed first |
| `ARROW_SPAWN_FORWARD` | 0.3 | Spawn this far in front of the eye |
| `DMG_BODY_MIN` | 25 | Body damage at f = 0 |
| `DMG_BODY_MAX` | 60 | Body damage at f = 1, two body shots kill |
| `HEAD_MULT` | 2.0 | Full draw headshot kills |

Arrows move with swept collision every substep, so nothing tunnels at 95 m/s. An arrow hitting the world stops. The server deletes it at once, the client keeps a stuck copy for 8 seconds as decoration.

### Hitboxes

| Name | Value | Notes |
|---|---|---|
| `HEAD_RADIUS` | 0.25 | Sphere centered at `feet.y + eyeHeight + 0.05` |
| `BODY_RADIUS` | 0.38 | Vertical capsule from `feet.y + 0.05` to `feet.y + height - 0.3` |

When a swept arrow touches both, the earliest contact along the path wins. Ties go to the head.

### Dagger

| Name | Value | Notes |
|---|---|---|
| `MELEE_DAMAGE` | 55 | |
| `BACKSTAB_DAMAGE` | 100 | Attacker within 60 degrees of directly behind the target |
| `MELEE_RANGE` | 2.3 | |
| `MELEE_ARC_DEG` | 70 | Full cone angle |
| `MELEE_COOLDOWN_MS` | 700 | |

### Health

| Name | Value |
|---|---|
| `MAX_HP` | 100 |
| `REGEN_DELAY_MS` | 4000 |
| `REGEN_PER_S` | 30 |

No friendly fire. No self damage.

### Abilities (M7)

| Name | Value | Notes |
|---|---|---|
| `GRAPPLE_COOLDOWN_MS` | 5000 | Starts when the rope detaches |
| `GRAPPLE_SPEED` | 120 | Speed of the drawn hook, no gravity |
| `GRAPPLE_RANGE` | 45 | Attaches only to boxes tagged `grapple` |
| `INK_CLOUD_COOLDOWN_MS` | 15000 | |
| `INK_CLOUD_SPEED` | 35 | |
| `INK_CLOUD_GRAVITY` | 15 | |
| `INK_CLOUD_RADIUS` | 4.5 | Blocks vision and bot line of sight, never blocks arrows |
| `INK_CLOUD_MS` | 6000 | |

### Quiver (v2)

Keys 1, 2, 3 (rebindable) or the mouse wheel pick the arrow. The quiver strip at the bottom of the screen shows the selected arrow, scatter charges and the tether cooldown; the nocked arrow changes too. Numbers are in `QUIVER` in `src/shared/constants.ts`. Slot and charges are synced and predicted.

| Arrow | Rules |
|---|---|
| Broadhead | The v1 arrow, unlimited. Its arrow kind keeps the v1 name `arrow` |
| Scatter | Three arrows at -4, 0 and +4 degrees, each at 55 % body damage with a 1.5 headshot multiplier. Full draw takes 700 ms. 3 charges; one returns every 6 s. Releasing with no charge shoots a broadhead |
| Tether | Needs a full draw; 14 s cooldown from the shot. If it stops in a solid box, the line from 1.2 m above the release point to the hit (pulled back 0.5 m) becomes a zip line for 10 s when it is 6 to 35 m long and no steeper than 35 degrees. One line per player; a new one replaces the old. Anyone can ride it; an enemy arrow within 0.25 m cuts it (rope cut rules and reward) |

Tether lines live in room state (`tethers`). The shared simulation takes them through `StepContext.zipLines`, so riding one is predicted like a map zip line; a rider drops when the line expires or is cut.

### Dagger swat (v2)

During the first 180 ms of a dagger swing, an enemy arrow whose path passes within 1.8 m of the swinger's chest and inside a 70 degree arc in front is destroyed, unless the arrow is younger than 60 ms (a point-blank shot nobody could react to). The swatter sees SWATTED and earns 25 XP per swat (the "Swats" reward line) and the Swatter medal. The server checks each arrow step against the swinger's current position.

### Swing grapple (v2)

The server owns the rope (`grappleX/Y/Z`, `grappleLen`, `grappleMs`, `grappleReeling`) and client prediction replays it like other movement. Numbers are in `GRAPPLE` in `src/shared/constants.ts`.

| Step | Rule |
|---|---|
| Press E | The hook attaches at once to the first `grapple` box on the aim ray within 45 m. A miss costs a 1 s cooldown |
| Attach | Rope length is 0.95 x the distance from the chest to the anchor, at least 2 m |
| Hold E | Reel in at 12 m/s and pull at 38 m/s² along the rope, up to 22 m/s toward the anchor |
| Let go of E | Swing: the body stays within the rope length, gravity is 0.9 x, and move input pushes 8 m/s² sideways while below the anchor |
| Space | Let go and launch: speed along the current velocity +2 m/s, then +3 m/s up. Gives the vine hop back |
| Crouch | Let go without a launch |
| Auto detach | After 4.5 s attached, after the rope has been blocked by a solid box for 300 ms, or closer than 1.5 m |
| Walls | The pull back to the rope length moves through collision; where a wall stops it the rope pays out instead of letting go |

**Rope cut:** an enemy arrow step that passes within 0.25 m of a rope cuts it. The rope runs from the owner's chest, placed where the shooter last saw the owner, to the anchor. The owner drops, everyone gets a `ropeCut` message (snap effect and sound), the shooter sees ROPE CUT and earns 25 XP per cut in the match reward, and a cut earns the Snip medal.

### Match (Team Deathmatch)

| Name | Value | Notes |
|---|---|---|
| `TEAM_SIZE` | 4 | |
| `SCORE_LIMIT` | 25 | |
| `TIME_LIMIT_S` | 420 | Draw if tied at the end |
| `WARMUP_MS` | 5000 | Countdown, nobody can move |
| `RESPAWN_MS` | 3000 | |
| `SPAWN_PROTECT_MS` | 1500 | Ends early when the player fires or stabs |
| `END_SCREEN_MS` | 10000 | Then a new match starts in the same room |

- A joining human takes a bot's slot on the team with fewer humans.
- Spawn choice: the team spawn point farthest from living enemies.

### Rewards (progression, v1.1)

XP, Ink, medals, challenges and the unlock track are defined in `docs/RETENTION.md`; the numbers live in `src/shared/constants.ts`.

| Event | XP |
|---|---|
| Finish the match | 100 |
| Kill | 50 |
| Assist (30+ damage within 5 s before the kill) | 25 |
| Headshot kill bonus | 25 |
| Long shot bonus (35 m or more) | 25 |
| Win | 200 |
| Each medal, up to 4 | 25 |
| First win of the UTC day | 100 |

### Medals

MVP, Unstoppable, On a Roll, Headhunter, Eagle Eye, Robin Hood, Up Close, Trapper, Zipline Hero, Team Player, Untouchable and Snip. Conditions are in RETENTION.md.

### In-match feedback

| Event | Banner |
|---|---|
| 2 kills within 4 s | DOUBLE TAG |
| 3 kills, each within 4 s of the last | TRIPLE TAG |
| 4 or more | JUNGLE FEVER |
| Streak of 3 | ON A ROLL |
| Streak of 6 | UNSTOPPABLE |

Each local kill adds XP ticker lines ("+50 Tagged", "+25 Headshot", "+25 Long shot"). The death screen shows "Streak ended at N" for streaks of 3 or more.

### Bots and parties

- Bot aim error follows the room: easy while any human has fewer than 3 finished matches, otherwise by average level (below 4 easy, below 12 normal, else hard).
- Party codes put friends in the same match and team (`party` room).

## Feel targets

- Fastest kill: one full-draw headshot, about 0.55 s of drawing.
- Two full-draw body shots: about 1.3 s.
- Crossing the 60 m map: about 7.5 s running, about 5.5 s chaining slides and hops.
- A new player should land a body shot on a computer-controlled opponent within their first minute in the Practice Camp.

## Highlight features (later milestones)

| Feature | Milestone |
|---|---|
| Arrow cam: the victim's death screen replays the killing arrow in slow motion | M6 |
| Arrows pin doodle bodies to walls | M6 |
| Robin Hood: arrow hits arrow mid-air, both break, banner for the whole lobby | M6 |
| Ink splat on headshots | M6 |
| Save clip: export the arrow cam replay as a video file | M12 |
