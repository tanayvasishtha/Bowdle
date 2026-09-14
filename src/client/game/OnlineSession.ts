import { Callbacks, Client, Predict, type Reconciler, type Room } from "@colyseus/sdk";
import type { Data } from "@colyseus/schema";
import { INTERP_DELAY_MS, RECONCILE_SMOOTH_MS } from "../../shared/constants.ts";
import { notebookMap } from "../../shared/maps/notebook.ts";
import type { PlayerSim } from "../../shared/sim/movement.ts";
import { stepPlayer } from "../../shared/sim/movement.ts";
import { MatchState, PlayerInput, type PlayerState } from "../../net/schema.ts";
import type { Renderer } from "../render/Renderer.ts";
import { CameraRig } from "./CameraRig.ts";
import type { InputSampler } from "./InputSampler.ts";

export type RenderedPlayer = { id: string; x: number; y: number; z: number };

export class OnlineSession {
  readonly sessionId: string;
  private readonly renderer: Renderer;
  private readonly sampler: InputSampler;
  private readonly room;
  private readonly input;
  private readonly predict;
  private readonly me: Reconciler<PlayerState, Data<PlayerInput>>;
  private readonly cameraRig = new CameraRig();
  private lastFrameMs = performance.now();

  private constructor(renderer: Renderer, sampler: InputSampler, room: Room<unknown, MatchState>) {
    this.renderer = renderer;
    this.sampler = sampler;
    this.room = room;
    this.sessionId = room.sessionId;
    this.input = room.input<PlayerInput>({ mode: "reliable", type: PlayerInput });
    this.predict = Predict.get(room, { mode: "lerp", delay: INTERP_DELAY_MS, renderPresent: false });
    this.predict.attachAll("players", { mode: "lerp", fields: ["x", "y", "z", "height"], smoothMs: 0 });
    this.predict.attachAll("players", { mode: "lerp", fields: ["yaw", "pitch"], angle: true, smoothMs: 0 });
    const local = room.state.players.get(room.sessionId);
    if (!local) throw new Error("Server joined without a local player");
    this.sampler.setLook(local.yaw, local.pitch);
    this.me = this.predict.reconciler(local, {
      input: this.input,
      smoothMs: RECONCILE_SMOOTH_MS,
      step: (context, state, command) => { stepPlayer(state, command, notebookMap, { nowMs: context.reckonTime }); },
    });
    const callbacks = Callbacks.get(room);
    callbacks.onRemove("players", (_player, id) => this.renderer.removePlayer(id));
  }

  static async connect(renderer: Renderer, sampler: InputSampler, name = "Player"): Promise<OnlineSession> {
    const endpoint = import.meta.env.VITE_SERVER_URL || location.origin;
    const room = await new Client(endpoint).joinOrCreate<MatchState>("tdm", { name }, MatchState);
    if (!room.state.players.get(room.sessionId)) {
      await new Promise<void>((resolve) => {
        const off = Callbacks.get(room).onAdd("players", (_player, id) => {
          if (id !== room.sessionId) return;
          off();
          resolve();
        });
      });
    }
    return new OnlineSession(renderer, sampler, room);
  }

  start(): void {
    requestAnimationFrame((time) => this.frame(time));
  }

  private frame(timeMs: number): void {
    const elapsed = Math.min(100, timeMs - this.lastFrameMs);
    this.lastFrameMs = timeMs;
    const steps = this.predict.tick(timeMs);
    for (let step = 0; step < steps; step += 1) {
      this.sampler.sample(this.input.data);
      this.input.send();
    }
    this.cameraRig.update(this.renderer.camera, this.me.state, this.me.state, 1, elapsed);
    this.renderer.setDebugMovement(this.me.state);
    for (const [id, player] of this.room.state.players) {
      this.renderer.setPlayerPosition(
        id,
        player.team,
        this.predict.value(player, "x"),
        this.predict.value(player, "y"),
        this.predict.value(player, "z"),
        this.predict.value(player, "yaw"),
        id !== this.sessionId,
      );
    }
    this.renderer.render(timeMs);
    requestAnimationFrame((time) => this.frame(time));
  }

  players(): RenderedPlayer[] {
    const result: RenderedPlayer[] = [];
    for (const [id, player] of this.room.state.players) result.push({
      id,
      x: this.predict.value(player, "x"),
      y: this.predict.value(player, "y"),
      z: this.predict.value(player, "z"),
    });
    return result;
  }
}
