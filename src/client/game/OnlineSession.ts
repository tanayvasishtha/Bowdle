import { Callbacks, Client, Predict, type PredictedSpawns, type Reconciler, type Room } from "@colyseus/sdk";
import type { Data } from "@colyseus/schema";
import { ARROW_GRAVITY, ARROW_SPEED_MAX, EYE_CROUCH, EYE_STAND, HEAD_RADIUS, HUD_REFRESH_MS, INTERP_DELAY_MS, RECONCILE_SMOOTH_MS, STUCK_ARROW_MS } from "../../shared/constants.ts";
import { notebookMap } from "../../shared/maps/notebook.ts";
import type { PlayerSim } from "../../shared/sim/movement.ts";
import { stepPlayer } from "../../shared/sim/movement.ts";
import { spawnArrow, stepArrow, type ArrowSim } from "../../shared/sim/arrows.ts";
import { headCenterY } from "../../shared/sim/hitboxes.ts";
import { DamagedMessage, HitConfirmMessage, KillMessage, MatchEndMessage } from "../../net/messages.ts";
import { MatchState, PlayerInput, type ArrowState, type PlayerState } from "../../net/schema.ts";
import type { Renderer } from "../render/Renderer.ts";
import { MatchHud } from "../ui/hud.ts";
import { CameraRig } from "./CameraRig.ts";
import type { InputSampler } from "./InputSampler.ts";

export type RenderedPlayer = { id: string; x: number; y: number; z: number };
type LocalArrow = ArrowSim & { owner: string; team: number; bornMs: number; kind: "arrow" | "grapple" | "ink" };
type ArrowRender = { visual: ReturnType<Renderer["spawnArrowVisual"]>; sim: ArrowSim; removedAtMs: number };

export class OnlineSession {
  readonly sessionId: string;
  private readonly renderer: Renderer;
  private readonly sampler: InputSampler;
  private readonly room;
  private readonly input;
  private readonly predict;
  private readonly me: Reconciler<PlayerState, Data<PlayerInput>>;
  private readonly arrows: PredictedSpawns<ArrowState, LocalArrow>;
  private readonly arrowRenders = new Map<number, ArrowRender>();
  private readonly names = new Map<string, string>();
  private readonly hud: MatchHud;
  private readonly cameraRig = new CameraRig();
  private lastFrameMs = performance.now();
  private nextHudAtMs = 0;

  private constructor(renderer: Renderer, sampler: InputSampler, room: Room<unknown, MatchState>) {
    this.renderer = renderer;
    this.sampler = sampler;
    this.room = room;
    this.hud = new MatchHud(renderer.canvas.parentElement!);
    this.sessionId = room.sessionId;
    this.input = room.input<PlayerInput>({ mode: "reliable", type: PlayerInput });
    this.predict = Predict.get(room, { mode: "lerp", delay: INTERP_DELAY_MS, renderPresent: false });
    this.predict.attachAll("players", { mode: "lerp", fields: ["x", "y", "z", "height"], smoothMs: 0 });
    this.predict.attachAll("players", { mode: "lerp", fields: ["yaw", "pitch"], angle: true, smoothMs: 0 });
    const local = room.state.players.get(room.sessionId);
    if (!local) throw new Error("Server joined without a local player");
    this.sampler.setLook(local.yaw, local.pitch);
    this.arrows = this.predict.spawns<"arrows", LocalArrow>("arrows", {
      owned: (arrow) => arrow.owner === room.sessionId,
      spawnTime: (arrow) => arrow.bornMs,
      step: (arrow, dt) => { stepArrow(arrow, notebookMap, dt); },
      fields: ["x", "y", "z"],
    });
    this.me = this.predict.reconciler(local, {
      input: this.input,
      smoothMs: RECONCILE_SMOOTH_MS,
      step: (context, state, command) => {
        const events = stepPlayer(state, command, notebookMap, { nowMs: context.reckonTime });
        if (context.isReplay) return;
        for (const event of events) if (event.type === "fire") this.arrows.spawn({ ...spawnArrow(event, state.crouched), owner: room.sessionId, team: state.team, bornMs: context.reckonTime, kind: "arrow" });
      },
    });
    const callbacks = Callbacks.get(room);
    callbacks.onRemove("players", (_player, id) => this.renderer.removePlayer(id));
    room.onMessage<KillMessage>("kill", (payload) => { const parsed = KillMessage.safeParse(payload); if (parsed.success) this.hud.kill(parsed.data, this.names); });
    room.onMessage<HitConfirmMessage>("hitConfirm", (payload) => { const parsed = HitConfirmMessage.safeParse(payload); if (parsed.success) this.hud.hit(parsed.data.headshot); });
    room.onMessage<DamagedMessage>("damaged", (payload) => { const parsed = DamagedMessage.safeParse(payload); if (parsed.success) this.hud.damaged(parsed.data.fromX - this.me.state.x, parsed.data.fromZ - this.me.state.z); });
    room.onMessage<MatchEndMessage>("matchEnd", (payload) => { const parsed = MatchEndMessage.safeParse(payload); if (parsed.success) this.hud.end(parsed.data, this.names); });
  }

  static async connect(renderer: Renderer, sampler: InputSampler, name = "Player", testing = false): Promise<OnlineSession> {
    const endpoint = import.meta.env.VITE_SERVER_URL || location.origin;
    const room = await new Client(endpoint).joinOrCreate<MatchState>("tdm", { name, test: testing }, MatchState);
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
      this.names.set(id, player.name);
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
    this.renderArrows(timeMs);
    if (timeMs >= this.nextHudAtMs) { this.hud.update(this.room.state, this.sessionId, this.room.clock.serverNow()); this.nextHudAtMs = timeMs + HUD_REFRESH_MS; }
    this.renderer.render(timeMs);
    requestAnimationFrame((time) => this.frame(time));
  }

  private renderArrows(timeMs: number): void {
    for (const entry of this.arrows.entries()) {
      let render = this.arrowRenders.get(entry.id);
      if (!render) {
        const sim = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, damage: 0, ageMs: 0, stuck: false };
        render = { visual: this.renderer.spawnArrowVisual(sim), sim, removedAtMs: 0 }; this.arrowRenders.set(entry.id, render);
      }
      const source = entry.server ?? entry.local;
      if (!source) continue;
      render.sim.x = this.arrows.value(entry, "x"); render.sim.y = this.arrows.value(entry, "y"); render.sim.z = this.arrows.value(entry, "z");
      render.sim.vx = source.vx; render.sim.vy = source.vy; render.sim.vz = source.vz; this.renderer.updateArrowVisual(render.visual, render.sim);
    }
    for (const [id, render] of this.arrowRenders) {
      if (this.arrows.alive(id)) continue;
      if (render.removedAtMs === 0) render.removedAtMs = timeMs;
      if (timeMs - render.removedAtMs >= STUCK_ARROW_MS) { this.renderer.removeVisual(render.visual); this.arrowRenders.delete(id); }
    }
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

  aimAt(sessionId: string): void {
    const target = this.room.state.players.get(sessionId); if (!target) return;
    const x = this.predict.value(target, "x"), y = this.predict.value(target, "y"), z = this.predict.value(target, "z");
    const dx = x - this.me.state.x, dz = z - this.me.state.z, horizontal = Math.hypot(dx, dz);
    const flight = horizontal / ARROW_SPEED_MAX;
    const targetHeight = this.predict.value(target, "height");
    const targetHead = headCenterY({ x, y, z, height: targetHeight, crouched: targetHeight < EYE_STAND });
    const eye = this.me.state.y + (this.me.state.crouched ? EYE_CROUCH : EYE_STAND);
    this.sampler.setLook(Math.atan2(-dx, -dz), Math.atan2(targetHead + HEAD_RADIUS - eye + ARROW_GRAVITY * flight * flight / 2, horizontal));
  }
  drawMs(): number { return this.me.state.drawMs; }
  killFeed(): string { return this.hud.feedText(); }
}
