# Bowdle netcode

## Model in one paragraph

The server is authoritative and simulates at a fixed 30 Hz with 2 physics substeps. Each client sends one input frame per tick. The client predicts its own player by running the same `stepPlayer` function locally, and Colyseus reconciles it against server state. Other players are drawn 100 ms in the past, interpolated between snapshots. Arrows are predicted on the shooter's screen the moment they are released, then handed over to the server's copy. The server checks arrow and dagger hits against where the shooter saw each target, using Colyseus rewind.

All of this uses Colyseus 0.18 built-ins. Check every signature in the files listed in `TECH.md` before writing code.

## Constants (add to `src/shared/constants.ts`)

| Name | Value |
|---|---|
| `INTERP_DELAY_MS` | 100 |
| `RECONCILE_SMOOTH_MS` | 65 |
| `MAX_REWIND_MS` | 250 |
| `RECONNECT_WINDOW_S` | 15 |
| `MAX_NAME_LENGTH` | 16 |

## State (`src/net/schema.ts`)

Define with `schema()` and `t.*` from `@colyseus/schema`. No decorators.

**Rule:** every field that `stepPlayer` reads or writes lives in `PlayerState`. The client reconciler replays inputs starting from server state, so any missing field breaks replay.

`PlayerState`
- identity: `name`, `team` (0 Sun, 1 Moon), `isBot`
- body: `x`, `y`, `z`, `vx`, `vy`, `vz`, `yaw`, `pitch`, `height` (numeric so rewind can track crouching)
- movement flags and timers: `grounded`, `crouched`, `sliding`, `slideMs`, `slideCooldownMs`, `coyoteMs`, `jumpBufferMs`
- combat: `hp`, `alive`, `drawMs`, `releaseCooldownMs`, `meleeCooldownMs`, `prevButtons`, `lastDamageAtMs`, `spawnProtectMs`, `respawnAtMs`
- abilities (M7): `grappleCooldownMs`, `grappleActive`, `grappleX`, `grappleY`, `grappleZ`, `grappleMs`, `inkCooldownMs`
- stats: `kills`, `deaths`, `assists`
- cosmetics (M11): `bowSkin`, `arrowTrail`, `outfit`, `killEffect` (item ids, set by the server only)

`ArrowState`: `x`, `y`, `z`, `vx`, `vy`, `vz`, `owner` (session id), `team`, `bornMs`, `kind` (`arrow`, `grapple`, `ink`), `damage`.

`MatchState`: `mapId`, `phase` (`warmup`, `live`, `end`), `phaseEndsAtMs`, `scoreSun`, `scoreMoon`, `players` (map of `PlayerState` keyed by session id, computer-controlled players use `bot-1` style keys), `arrows` (map of `ArrowState`), `inkClouds` (M7).

**Time base:** `bornMs`, `phaseEndsAtMs` and every other absolute time must use the same server clock that the client's `room.clock.serverNow()` tracks. Read `RoomClock.d.ts` and `predictedSpawns.d.ts` to confirm which server value that is before stamping.

## Input (`src/net/schema.ts`, `src/shared/input.ts`)

`PlayerInput`: `moveX` (-1 to 1, strafe), `moveZ` (-1 to 1, forward is +1), `yaw`, `pitch`, `buttons` (bit flags).

```ts
export const BTN = {
  JUMP: 1, CROUCH: 2, FIRE: 4, AIM: 8,
  MELEE: 16, CANCEL: 32, GRAPPLE: 64, INK: 128,
} as const;
```

Buttons are **held states**, never edge events. Presses and releases are detected in `stepPlayer` by comparing against `prevButtons`. This keeps replay deterministic and makes a late or repeated frame harmless.

## Server room (`src/server/rooms/TdmRoom.ts`)

Shape (verify every name against the installed types):

```ts
export class TdmRoom extends Room<{ state: MatchState; input: PlayerInput }> {
  maxClients = TEAM_SIZE * 2;
  maxMessagesPerSecond = 30;
  state = new MatchState();
  inputs = this.defineInput(PlayerInput, {
    bufferMaxSize: 32,
    sanitize: { moveX: [-1, 1], moveZ: [-1, 1], pitch: [-PITCH_LIMIT, PITCH_LIMIT] },
    // idle: repeat the latest frame so a late packet does not freeze the player
  });

  onCreate() {
    this.rewind = this.allowRewindState({ maxRewindMs: MAX_REWIND_MS });
    this.rewind.attachAll(this.state.players, { fields: ["x", "y", "z", "height"], mode: "snapshot" });
    this.setFixedTimestep((ctx) => this.tick(ctx), TICK_HZ, { subSteps: SUBSTEPS });
  }
}
```

Tick order, every fixed step:

1. **Humans:** for each player, consume inputs one at a time (`for (const cmd of this.inputs.get(sessionId))`) and call `stepPlayer(player, cmd, map, ctx)`. One input advances that player by one tick.
2. **Bots:** `BotController` builds a `PlayerInput` for each bot, then the same `stepPlayer` runs.
3. **Actions produced by `stepPlayer`** (fire released, melee pressed) are returned as events, never applied inside the step. The room spawns arrows and resolves melee from these events.
4. **Arrows:** for each substep, `stepArrow` moves each arrow with swept collision against the map, then against players. Read target positions from `this.rewind.lastSeenBy(arrow.owner)`, so the arrow is judged against the world the shooter was looking at for its whole flight.
5. **Damage, kills, assists, regen, respawns, score, phase changes** via functions in `src/shared/sim/health.ts` and `match.ts`.

Melee uses `this.rewind.lastSeenBy(attackerSessionId)` the same way.

## Client session (`src/client/game/OnlineSession.ts`)

Shape (verify every name against the installed types):

```ts
const room = await client.joinOrCreate("tdm", { name });
const input = room.input({ mode: "reliable" });          // WebSocket: reliable is correct
const predict = Predict.get(room, { mode: "lerp", delay: INTERP_DELAY_MS });

predict.attachAll("players", { /* x, y, z, height lerp; yaw and pitch as angles */ });

const me = predict.reconciler(room.state.players.get(room.sessionId), {
  input,
  step: (ctx, state, cmd) => { const events = stepPlayer(state, cmd, map, ctx); /* see below */ },
  smoothMs: RECONCILE_SMOOTH_MS,
});

const arrows = predict.spawns("arrows", {
  owned: (a) => a.owner === room.sessionId,
  spawnTime: (a) => a.bornMs,
  step: (local, dt) => stepArrowVisual(local, dt),
  fields: ["x", "y", "z"],
});

function frame(now: number) {
  const steps = predict.tick(now);
  for (let i = 0; i < steps; i++) {
    sampleInputInto(input.data);   // mouse, keys -> moveX, moveZ, yaw, pitch, buttons
    input.send();
  }
  // render: me.value(...) for self, predict.value(player, field) for others,
  // arrows.entries() with arrows.value(entry, field) for arrows
}
```

**Predicted fire:** when the local step returns a fire event, call `arrows.spawn(...)` only on the live step. The reconciler also re-runs `step` while replaying, and spawning there would duplicate arrows. Find the replay flag on the step context in `rollback.d.ts` and check it.

**Look input is never smoothed or reconciled.** The camera always uses the latest local yaw and pitch so aiming feels instant.

## Messages (`src/net/messages.ts`)

Non-input messages are validated with zod on receipt (`this.onMessage(type, schema, handler)`).

Client to server:

| Type | Payload |
|---|---|
| `setName` | `{ name: string }`, trimmed, 1 to `MAX_NAME_LENGTH` characters, printable only |

Server to client:

| Type | Sent to | Payload |
|---|---|---|
| `kill` | everyone | `{ killer, victim, weapon: "arrow" or "dagger", headshot, distance }` |
| `hitConfirm` | the attacker | `{ target, damage, headshot }` |
| `damaged` | the victim | `{ fromX, fromZ, damage }` |
| `robinHood` | everyone (M6) | `{ shooterA, shooterB, x, y, z }` |
| `matchEnd` | everyone | `{ winner: "sun", "moon" or "draw", mvp }` |

## Joining, leaving, reconnecting

- `onJoin`: assign the team with fewer humans, replacing a bot on that team.
- `onDrop`: `await this.allowReconnection(client, RECONNECT_WINDOW_S)`. The player's avatar keeps the idle input meanwhile.
- `onReconnect`: resume normally.
- `onLeave`: a bot takes the slot and keeps the stats.

## Anti-cheat baseline

- Inputs are sanitized by `defineInput`.
- Draw time is counted on the server from held `FIRE` frames. A client cannot claim a full draw.
- Dead or warmup-frozen players have their inputs consumed and ignored.
- Rewind is clamped to `MAX_REWIND_MS`.
- Item ownership (M11) is loaded by the server from the database. Client-sent cosmetic ids are ignored.

## Testing latency by hand

Tests run without latency. Before calling M4 done, deploy a build to a server far from you (or use a network emulator on your machine) and play against it with around 150 ms of ping. Your own movement must feel instant and hits on moving bots must register where you aimed.
