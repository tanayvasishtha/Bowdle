import { Callbacks, Client, Predict, type PredictedSpawns, type Reconciler, type Room } from "@colyseus/sdk";
import type { Data } from "@colyseus/schema";
import { ARROW_GRAVITY, ARROW_SPEED_MAX, BODY_ARROW_STUCK_MS, EYE_CROUCH, EYE_STAND, HEAD_RADIUS, HUD_REFRESH_MS, INK_CLOUD_GRAVITY, INTERP_DELAY_MS, LONG_SHOT_M, RECONCILE_SMOOTH_MS, STUCK_ARROW_MS, ZIP_SPEED } from "../../shared/constants.ts";
import { defaultMatchMap, mapById, matchMaps } from "../../shared/maps/registry.ts";
import type { MapData } from "../../shared/maps/types.ts";
import type { PlayerSim } from "../../shared/sim/movement.ts";
import { stepPlayer } from "../../shared/sim/movement.ts";
import { spawnArrow, stepArrow, type ArrowSim } from "../../shared/sim/arrows.ts";
import { headCenterY } from "../../shared/sim/hitboxes.ts";
import { DamagedMessage, HitConfirmMessage, KillMessage, MatchEndMessage, MatchStatsMessage, RewardMessage, RobinHoodMessage } from "../../net/messages.ts";
import { MatchState, PlayerInput, type ArrowState, type PlayerState } from "../../net/schema.ts";
import type { Renderer } from "../render/Renderer.ts";
import { MatchHud } from "../ui/hud.ts";
import { SoundEffects } from "../audio/sfx.ts";
import { happyTime } from "../platform/web.ts";
import { loadToken } from "../account.ts";
import { setAudioSuspended } from "../audio/bus.ts";
import { portalPolicy } from "../platform/platform.ts";
import { platform } from "../platform/sdk.ts";
import { ClipRecorder, clipsSupported, downloadBlob, shareOnXUrl } from "./clips.ts";
import { CameraRig } from "./CameraRig.ts";
import type { InputSampler } from "./InputSampler.ts";
import { ReplayDirector } from "./ReplayDirector.ts";
import { spawnAbilityProjectile } from "../../shared/sim/abilities.ts";
import { drawFraction } from "../../shared/sim/bow.ts";
import { KillFeedbackTracker } from "../../shared/killFeedback.ts";
import { isInWater } from "../../shared/sim/volumes.ts";
import { motionFromSim, stabProgress } from "../render/characters/motion.ts";
import { createMotion } from "../render/characters/pose.ts";

export type RenderedPlayer = { id: string; team: number; x: number; y: number; z: number };
type LocalArrow = ArrowSim & { owner: string; team: number; bornMs: number; kind: "arrow" | "grapple" | "ink" };
type ArrowRender = { visual: ReturnType<Renderer["spawnArrowVisual"]>; sim: ArrowSim; removedAtMs: number; stuckForMs: number };

export class OnlineSession {
  readonly sessionId: string;
  private readonly renderer: Renderer;
  private readonly sampler: InputSampler;
  private readonly clips: ClipRecorder | undefined;
  private readonly room;
  private readonly input;
  private readonly predict;
  private readonly me: Reconciler<PlayerState, Data<PlayerInput>>;
  private readonly arrows: PredictedSpawns<ArrowState, LocalArrow>;
  private readonly arrowRenders = new Map<number, ArrowRender>();
  private readonly names = new Map<string, string>();
  private readonly motionScratch = createMotion();
  private readonly hud: MatchHud;
  private readonly replay: ReplayDirector;
  private readonly sounds = new SoundEffects();
  private readonly cameraRig = new CameraRig();
  private map: MapData;
  private lastFrameMs = performance.now();
  private nextHudAtMs = 0;
  private wasAlive = true;
  private previousHazardPhase: "idle" | "telegraph" | "roll" | "despawn" = "idle";
  private bestShot = 0;
  private readonly feedback = new KillFeedbackTracker();
  private feedbackPhase = "warmup";

  private constructor(renderer: Renderer, sampler: InputSampler, room: Room<unknown, MatchState>) {
    this.renderer = renderer;
    this.sampler = sampler;
    this.room = room;
    this.map = mapById(room.state.mapId) ?? defaultMatchMap;
    this.renderer.setMap(this.map);
    this.clips = clipsSupported() ? new ClipRecorder(renderer.canvas) : undefined;
    const policy = portalPolicy();
    this.hud = new MatchHud(renderer.canvas.parentElement!, (mapId) => this.room.send("mapVote", { mapId }), {
      playAgain: () => this.playAgain(),
      newMatch: async () => { try { await this.room.leave(true); } finally { location.assign("/?scene=online"); } },
      saveClip: this.clips ? () => this.saveClip() : undefined,
      shareUrl: policy.externalLinks ? (text) => shareOnXUrl(text) : undefined,
    });
    this.replay = new ReplayDirector(renderer.canvas.parentElement!);
    this.cameraRig.onMove = (kind) => this.sounds.play(kind);
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
      step: (arrow, dt) => { stepArrow(arrow, this.map, dt, arrow.kind === "grapple" ? 0 : arrow.kind === "ink" ? INK_CLOUD_GRAVITY : undefined); },
      fields: ["x", "y", "z"],
    });
    this.me = this.predict.reconciler(local, {
      input: this.input,
      smoothMs: RECONCILE_SMOOTH_MS,
      step: (context, state, command) => {
        const events = stepPlayer(state, command, this.map, { nowMs: context.reckonTime });
        if (context.isReplay) return;
        for (const event of events) {
          if (event.type === "fire") this.arrows.spawn({ ...spawnArrow(event, state.crouched), owner: room.sessionId, team: state.team, bornMs: context.reckonTime, kind: "arrow" });
          else if (event.type === "grapple" || event.type === "ink") this.arrows.spawn({ ...spawnAbilityProjectile(event, state.crouched), owner: room.sessionId, team: state.team, bornMs: context.reckonTime, kind: event.type });
        }
      },
    });
    const callbacks = Callbacks.get(room);
    callbacks.onRemove("players", (_player, id) => this.renderer.removePlayer(id));
    callbacks.onAdd("inkClouds", (cloud, id) => this.renderer.setInkCloud(id, cloud.x, cloud.y, cloud.z, cloud.radius));
    callbacks.onRemove("inkClouds", (_cloud, id) => this.renderer.removeInkCloud(id));
    room.onMessage<KillMessage>("kill", (payload) => { const parsed = KillMessage.safeParse(payload); if (parsed.success) this.onKill(parsed.data); });
    room.onMessage<HitConfirmMessage>("hitConfirm", (payload) => { const parsed = HitConfirmMessage.safeParse(payload); if (parsed.success) this.onHitConfirm(parsed.data); });
    room.onMessage<DamagedMessage>("damaged", (payload) => { const parsed = DamagedMessage.safeParse(payload); if (parsed.success) { this.hud.damaged(parsed.data.fromX - this.me.state.x, parsed.data.fromZ - this.me.state.z); this.cameraRig.hurt(parsed.data.damage); } });
    room.onMessage<MatchEndMessage>("matchEnd", (payload) => { const parsed = MatchEndMessage.safeParse(payload); const me = room.state.players.get(room.sessionId); if (!parsed.success || !me) return; platform().setPlaying(false); this.hud.end(parsed.data, this.names, { kills: me.kills, deaths: me.deaths, bestShot: this.bestShot, bestStreak: this.feedback.bestStreak }, matchMaps); });
    room.onMessage<RewardMessage>("rewards", (payload) => { const parsed = RewardMessage.safeParse(payload); if (parsed.success) this.hud.rewards(parsed.data); });
    room.onMessage<MatchStatsMessage>("matchStats", (payload) => { const parsed = MatchStatsMessage.safeParse(payload); if (parsed.success) this.hud.matchStats(parsed.data); });
    room.onMessage<RobinHoodMessage>("robinHood", (payload) => { const parsed = RobinHoodMessage.safeParse(payload); if (parsed.success) { this.hud.banner("ROBIN HOOD!"); this.sounds.play("paper"); happyTime("robinHood"); } });
  }

  static async connect(renderer: Renderer, sampler: InputSampler, name = "Player", testing = false, testMapId?: string, party?: string): Promise<OnlineSession> {
    const endpoint = import.meta.env.VITE_SERVER_URL || location.origin;
    const room = party
      ? await new Client(endpoint).joinOrCreate<MatchState>("party", { name, token: loadToken(), party }, MatchState)
      : await new Client(endpoint).joinOrCreate<MatchState>("tdm", { name, token: loadToken(), test: testing, testMapId }, MatchState);
    if (!room.state.players.get(room.sessionId)) {
      await new Promise<void>((resolve) => {
        const off = Callbacks.get(room).onAdd("players", (_player, id) => {
          if (id !== room.sessionId) return;
          off();
          resolve();
        });
      });
    }
    room.send("setName", { name });
    return new OnlineSession(renderer, sampler, room);
  }

  start(): void {
    this.clips?.start();
    platform().loaded();
    platform().setPlaying(true);
    requestAnimationFrame((time) => this.frame(time));
  }

  /** Portals show an ad between matches; audio and input stay off for its whole length. */
  private async playAgain(): Promise<void> {
    if (portalPolicy().ads) {
      await platform().adBreak((paused) => { this.sampler.setPaused(paused); setAudioSuspended(paused); });
    }
    platform().setPlaying(true);
  }

  /** Test hook: shows the end screen with the current scoreboard. */
  showEndScreen(): void {
    this.hud.endPinned = true;
    this.hud.end({ winner: "draw", mvp: this.sessionId }, this.names, { kills: this.me.state.kills, deaths: this.me.state.deaths, bestShot: this.bestShot, bestStreak: this.feedback.bestStreak }, matchMaps);
  }

  showMatchRewards(stats: MatchStatsMessage, reward: RewardMessage): void {
    this.hud.matchStats(MatchStatsMessage.parse(stats));
    this.hud.rewards(RewardMessage.parse(reward));
  }
  showKill(message: KillMessage, atMs: number): void { this.onKill(KillMessage.parse(message), atMs); }

  private async saveClip(): Promise<boolean> {
    const blob = await this.clips?.save().catch(() => undefined);
    if (!blob) return false;
    downloadBlob(blob, `bowdle-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`);
    return true;
  }

  private frame(timeMs: number): void {
    if (this.room.state.phase === "warmup" && this.feedbackPhase !== "warmup") { this.feedback.reset(); this.hud.resetFeedback(); }
    this.feedbackPhase = this.room.state.phase;
    if (this.room.state.mapId !== this.map.id) {
      this.map = mapById(this.room.state.mapId) ?? defaultMatchMap;
      this.bestShot = 0;
      this.renderer.setMap(this.map);
    }
    const elapsed = Math.min(100, timeMs - this.lastFrameMs);
    this.lastFrameMs = timeMs;
    const steps = this.predict.tick(timeMs);
    for (let step = 0; step < steps; step += 1) {
      this.sampler.sample(this.input.data);
      this.input.send();
    }
    this.cameraRig.update(this.renderer.camera, this.me.state, this.me.state, 1, elapsed);
    this.renderer.setFeel(this.cameraRig.output.hurt, this.cameraRig.output.streaks);
    this.renderer.setDebugMovement(this.me.state);
    const serverNow = this.room.clock.serverNow();
    const capture = this.replay.beginCapture(timeMs);
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
        this.lookFor(player),
      );
      this.renderer.setPlayerMotion(id, motionFromSim(this.motionScratch, player, isInWater(this.map, player.x, player.y, player.z, serverNow)));
      if (player.alive) this.renderer.unpinPlayer(id);
      this.renderer.setGrappleRope(id, player.grappleActive, this.predict.value(player, "x"), this.predict.value(player, "y"), this.predict.value(player, "z"), player.grappleX, player.grappleY, player.grappleZ);
      if (capture) this.replay.player(id, this.predict.value(player, "x"), this.predict.value(player, "y"), this.predict.value(player, "z"), this.predict.value(player, "yaw"));
    }
    this.renderArrows(timeMs, capture);
    this.renderer.setLocalTeam(this.me.state.team);
    this.renderer.setLocalBowSkin(this.me.state.bowSkin);
    this.renderer.setDrawFraction(drawFraction(this.me.state.drawMs));
    this.renderer.setMeleeSwing(stabProgress(this.me.state.meleeCooldownMs));
    if (!this.me.state.alive) { this.renderer.setViewmodelVisible(false); this.replay.update(this.renderer.camera, timeMs); }
    else if (!this.wasAlive) { this.renderer.setViewmodelVisible(true); this.replay.stop(); this.hud.setReplay(false); }
    this.wasAlive = this.me.state.alive;
    this.renderer.setGrappleHighlights(this.me.state.grappleCooldownMs <= 0 && !this.me.state.grappleActive);
    let hazardPhase: "idle" | "telegraph" | "roll" | "despawn" = "idle";
    for (const hazard of this.room.state.hazards.values()) if (hazard.phase === "roll" || hazard.phase === "telegraph") { hazardPhase = hazard.phase; break; }
    if (hazardPhase === "telegraph" && this.previousHazardPhase !== "telegraph") this.renderer.leverAudio();
    this.previousHazardPhase = hazardPhase; this.renderer.setBoulderAudio(hazardPhase); this.renderer.setZipAudio(this.me.state.zipId ? ZIP_SPEED : 0);
    if (timeMs >= this.nextHudAtMs) { this.hud.update(this.room.state, this.sessionId, this.room.clock.serverNow()); this.nextHudAtMs = timeMs + HUD_REFRESH_MS; }
    this.renderer.render(timeMs);
    requestAnimationFrame((time) => this.frame(time));
  }

  private renderArrows(timeMs: number, capture: boolean): void {
    for (const entry of this.arrows.entries()) {
      let render = this.arrowRenders.get(entry.id);
      const source = entry.server ?? entry.local;
      if (!source) continue;
      if (!render) {
        const sim = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, damage: 0, ageMs: 0, stuck: false };
        render = { visual: this.renderer.spawnArrowVisual(sim, source.kind, this.room.state.players.get(source.owner)?.arrowTrail ?? ""), sim, removedAtMs: 0, stuckForMs: source.kind === "arrow" ? STUCK_ARROW_MS : 0 }; this.arrowRenders.set(entry.id, render);
      }
      render.sim.x = this.arrows.value(entry, "x"); render.sim.y = this.arrows.value(entry, "y"); render.sim.z = this.arrows.value(entry, "z");
      render.sim.vx = source.vx; render.sim.vy = source.vy; render.sim.vz = source.vz; this.renderer.updateArrowVisual(render.visual, render.sim);
      if (capture) this.replay.arrow(entry.id, render.sim.x, render.sim.y, render.sim.z);
    }
    for (const [id, render] of this.arrowRenders) {
      if (this.arrows.alive(id)) continue;
      if (render.removedAtMs === 0) render.removedAtMs = timeMs;
      if (timeMs - render.removedAtMs >= render.stuckForMs) { this.renderer.removeVisual(render.visual); this.arrowRenders.delete(id); }
    }
  }

  private readonly lookScratch = { bow: "", outfit: "" };
  private lookFor(player: PlayerState): { bow: string; outfit: string } {
    this.lookScratch.bow = player.bowSkin; this.lookScratch.outfit = player.outfit;
    return this.lookScratch;
  }

  private onHitConfirm(message: HitConfirmMessage): void {
    this.hud.hit(message.headshot);
    this.sounds.play("hit", message.damage);
    const target = this.room.state.players.get(message.target);
    if (!target) return;
    const point = this.renderer.screenPoint(target.x, target.y + (message.headshot ? headCenterY(target) - target.y : target.height * 0.6), target.z);
    if (point) this.hud.damageNumber(point.x, point.y, message.damage, message.headshot);
  }

  /** Test hook: what the camera feel is doing right now. */
  cameraFeel(): { fov: number; offsetY: number; offsetX: number; rollDeg: number; hurt: number; streaks: number } {
    const out = this.cameraRig.output;
    return { fov: this.cameraRig.currentFov, offsetY: out.offsetY, offsetX: out.offsetX, rollDeg: out.rollDeg, hurt: out.hurt, streaks: out.streaks };
  }

  showHitConfirm(message: HitConfirmMessage): void { this.onHitConfirm(HitConfirmMessage.parse(message)); }

  private onKill(message: KillMessage, atMs = performance.now()): void {
    this.hud.kill(message, this.names); const victim = this.room.state.players.get(message.victim); const killer = this.room.state.players.get(message.killer);
    if (message.killer === this.sessionId && message.weapon === "arrow") this.bestShot = Math.max(this.bestShot, message.distance);
    if (victim) {
      const seed = this.hash(message.victim) + Math.round(this.room.clock.serverNow());
      const bought = killer ? this.renderer.spawnKillEffect(killer.killEffect, killer.team, victim.x, victim.y, victim.z, seed) : false;
      if (!bought && message.headshot) this.renderer.addInkSplat(victim.x, victim.y, victim.z, victim.team, seed);
      if (killer && message.weapon === "arrow") this.renderer.pinPlayer(message.victim, killer.x, killer.z);
      this.markBodyArrow(victim.x, victim.y, victim.z);
    }
    if (message.weapon === "boulder" && message.killer === this.sessionId) this.hud.banner("TRAP!");
    else if (message.weapon === "fall" && message.killer === this.sessionId) this.hud.banner("KNOCKED OFF");
    else if (message.weapon === "fall" && message.victim === this.sessionId) this.hud.banner(message.killer === "Ravine" ? "LOST IN THE RAVINE" : "KNOCKED OFF");
    else if (message.headshot) { this.hud.banner("HEADSHOT!"); happyTime("headshot"); }
    else if (message.distance >= LONG_SHOT_M) { this.hud.banner("LONG SHOT!"); happyTime("longShot"); }
    if (message.killer === this.sessionId) {
      this.hud.killConfirm(message.headshot); this.sounds.play("kill");
      const feedback = this.feedback.kill({ atMs, headshot: message.headshot, distance: message.distance, weapon: message.weapon });
      this.hud.feedback(feedback); if (feedback.multikill) this.sounds.play("multikill"); if (feedback.unstoppable) happyTime("unstoppable");
    }
    if (message.victim === this.sessionId) this.hud.feedback(this.feedback.death(atMs));
    if (message.victim === this.sessionId && message.weapon === "arrow") { this.hud.setReplay(true); this.replay.start(message.victim, message.killer, performance.now()); }
  }

  private markBodyArrow(x: number, y: number, z: number): void {
    let nearest: ArrowRender | undefined, distance = Number.POSITIVE_INFINITY;
    for (const render of this.arrowRenders.values()) { const candidate = Math.hypot(render.sim.x - x, render.sim.y - y, render.sim.z - z); if (candidate < distance) { distance = candidate; nearest = render; } }
    if (nearest) nearest.stuckForMs = BODY_ARROW_STUCK_MS;
  }
  private hash(value: string): number { let hash = 0; for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619); return hash; }

  players(): RenderedPlayer[] {
    const result: RenderedPlayer[] = [];
    for (const [id, player] of this.room.state.players) result.push({
      id,
      team: player.team,
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
  cloudCount(): number { return this.room.state.inkClouds.size; }
  grappleActive(): boolean { return this.me.state.grappleActive; }
  aimAtGrapple(): void {
    let x = 0, y = 0, z = 0, bestDistance = Number.POSITIVE_INFINITY;
    for (const box of this.map.boxes) {
      if (!box.tags.includes("grapple")) continue;
      const candidateX = (box.min[0] + box.max[0]) / 2, candidateY = (box.min[1] + box.max[1]) / 2, candidateZ = (box.min[2] + box.max[2]) / 2;
      const distance = Math.hypot(candidateX - this.me.state.x, candidateY - this.me.state.y, candidateZ - this.me.state.z);
      if (distance < bestDistance) { bestDistance = distance; x = candidateX; y = candidateY; z = candidateZ; }
    }
    if (!Number.isFinite(bestDistance)) return;
    const dx = x - this.me.state.x, dz = z - this.me.state.z, horizontal = Math.hypot(dx, dz);
    this.sampler.setLook(Math.atan2(-dx, -dz), Math.atan2(y - (this.me.state.y + EYE_STAND), horizontal));
  }
}
