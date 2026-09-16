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
| Kill Confirmed | later | Not in v1 |
| Capture the Flag | later | Not in v1 |

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
| C or Left Ctrl | Crouch. While running fast: slide |
| V | Dagger stab (cancels the draw) |
| E | Grapple: hold to reel, let go to swing |
| Q | Ink cloud arrow (M7) |
| Tab | Scoreboard |
| Esc | Menu, releases mouse |
| F3 | Debug overlay (dev builds only) |

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
