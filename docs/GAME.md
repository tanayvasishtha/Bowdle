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
| Space | Jump |
| C or Left Ctrl | Crouch. While running fast: slide |
| V | Dagger stab (cancels the draw) |
| E | Grapple arrow (M7) |
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
| `GRAVITY` | 20 | m/s² |
| `RUN_SPEED` | 8.0 | Ground wish speed |
| `CROUCH_SPEED` | 4.0 | |
| `AIM_SPEED_MULT` | 0.75 | While aiming |
| `GROUND_ACCEL` | 10 | |
| `AIR_ACCEL` | 70 | |
| `AIR_WISH_CAP` | 1.0 | Wish speed cap in the air, allows air strafing |
| `FRICTION` | 6 | |
| `STOP_SPEED` | 3 | |
| `JUMP_VELOCITY` | 7.0 | Apex about 1.22 m |
| `MAX_HORIZONTAL_SPEED` | 14 | Hard cap, applied last every substep |
| `STEP_HEIGHT` | 0.45 | Auto step-up on ledges and stairs |
| `COYOTE_MS` | 100 | Jump still allowed this long after leaving ground |
| `JUMP_BUFFER_MS` | 100 | Jump pressed slightly before landing still fires |
| `PLAYER_WIDTH` | 0.7 | Collision box is width × height × width |
| `STAND_HEIGHT` | 1.8 | |
| `CROUCH_HEIGHT` | 1.0 | Also the slide height |
| `EYE_STAND` | 1.62 | |
| `EYE_CROUCH` | 0.9 | |

**Bunny hop:** on the first substep after landing, skip friction if jump is held or buffered.

### Slide

| Name | Value | Notes |
|---|---|---|
| `SLIDE_MIN_SPEED` | 6.0 | Crouch pressed on ground above this speed starts a slide |
| `SLIDE_BOOST` | 2.5 | Added along current velocity when the slide starts |
| `SLIDE_MAX_SPEED` | 12 | Boost cannot push past this |
| `SLIDE_FRICTION` | 0.8 | Replaces `FRICTION` while sliding |
| `SLIDE_STEER_ACCEL` | 2 | Only steering allowed while sliding |
| `SLIDE_MAX_MS` | 1100 | |
| `SLIDE_END_SPEED` | 4.0 | Slide ends below this speed |
| `SLIDE_COOLDOWN_MS` | 800 | No new boost until this passes |

Jumping out of a slide keeps the momentum.

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
| `GRAPPLE_COOLDOWN_MS` | 7000 | |
| `GRAPPLE_SPEED` | 120 | No gravity |
| `GRAPPLE_RANGE` | 40 | Attaches only to boxes tagged `grapple` |
| `GRAPPLE_PULL_ACCEL` | 35 | Toward the anchor |
| `GRAPPLE_MAX_PULL_SPEED` | 22 | |
| `GRAPPLE_MAX_MS` | 1600 | |
| `GRAPPLE_RELEASE_DIST` | 1.5 | Auto release this close to the anchor |
| `GRAPPLE_JUMP_BOOST` | 2 | Upward m/s added when released with jump |
| `INK_CLOUD_COOLDOWN_MS` | 15000 | |
| `INK_CLOUD_SPEED` | 35 | |
| `INK_CLOUD_GRAVITY` | 15 | |
| `INK_CLOUD_RADIUS` | 4.5 | Blocks vision and bot line of sight, never blocks arrows |
| `INK_CLOUD_MS` | 6000 | |

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

MVP, Unstoppable, On a Roll, Headhunter, Eagle Eye, Robin Hood, Up Close, Trapper, Zipline Hero, Team Player and Untouchable. Conditions are in RETENTION.md.

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
