import { Room, type Client, type StepContext as RoomStepContext } from "@colyseus/core";
import {
  MAX_NAME_LENGTH,
  RECONNECT_WINDOW_S,
  SUBSTEPS,
  TEAM_SIZE,
  TICK_HZ,
  TIME_LIMIT_S,
  WARMUP_MS,
} from "../../shared/constants.ts";
import type { PlayerInputFrame } from "../../shared/input.ts";
import { notebookMap } from "../../shared/maps/notebook.ts";
import { PITCH_LIMIT } from "../../shared/math/angles.ts";
import { MatchState, PlayerInput, PlayerState } from "../../net/schema.ts";
import { tickMovement } from "../match/tick.ts";

type JoinOptions = { name?: string };

export class TdmRoom extends Room<{ state: MatchState; input: PlayerInput }> {
  maxClients = TEAM_SIZE * 2;
  maxMessagesPerSecond = TICK_HZ;
  state = new MatchState();
  inputs = this.defineInput(PlayerInput, {
    bufferMaxSize: 32,
    sanitize: { moveX: [-1, 1], moveZ: [-1, 1], pitch: [-PITCH_LIMIT, PITCH_LIMIT] },
    idle: ({ latest }) => latest ?? true,
  });
  private readonly pending = new Map<string, Iterable<PlayerInputFrame>>();

  onCreate(): void {
    this.state.phase = "warmup";
    this.state.phaseEndsAtMs = WARMUP_MS;
    this.setFixedTimestep((context) => this.tick(context), TICK_HZ, { subSteps: SUBSTEPS });
  }

  private tick(context: RoomStepContext): void {
    this.pending.clear();
    for (const [sessionId] of this.state.players) this.pending.set(sessionId, this.inputs.get(sessionId));
    if (this.state.phase === "warmup") {
      for (const frames of this.pending.values()) for (const _frame of frames) { /* consume during warmup */ }
      if (this.clock.elapsedTime >= this.state.phaseEndsAtMs) {
        this.state.phase = "live";
        this.state.phaseEndsAtMs = this.clock.elapsedTime + TIME_LIMIT_S * 1000;
      }
      return;
    }
    tickMovement(this.state, this.pending, notebookMap, { nowMs: this.clock.elapsedTime });
  }

  onJoin(client: Client, options?: JoinOptions): void {
    let red = 0;
    let green = 0;
    for (const player of this.state.players.values()) player.team === 0 ? red += 1 : green += 1;
    const team = red <= green ? 0 : 1;
    const spawn = team === 0 ? notebookMap.spawns.red[red % notebookMap.spawns.red.length]! : notebookMap.spawns.green[green % notebookMap.spawns.green.length]!;
    const player = new PlayerState();
    player.name = options?.name?.trim().slice(0, MAX_NAME_LENGTH) || "Player";
    player.team = team;
    player.x = spawn.pos[0]; player.y = spawn.pos[1]; player.z = spawn.pos[2]; player.yaw = spawn.yaw;
    this.state.players.set(client.sessionId, player);
  }

  async onDrop(client: Client): Promise<void> {
    await this.allowReconnection(client, RECONNECT_WINDOW_S);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
  }
}
