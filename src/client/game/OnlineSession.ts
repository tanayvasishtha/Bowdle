import { Callbacks, Client, Predict, type PredictedSpawns, type Reconciler, type Room } from "@colyseus/sdk";
import type { Data } from "@colyseus/schema";
import { ARROW_GRAVITY, ARROW_SPEED_MAX, BODY_ARROW_STUCK_MS, CREATURE_TUNING, EXPEDITION, EYE_CROUCH, EYE_STAND, HEAD_RADIUS, HUD_REFRESH_MS, INK_CLOUD_GRAVITY, INTERP_DELAY_MS, LONG_SHOT_M, RECONCILE_SMOOTH_MS, STUCK_ARROW_MS, RETENTION_XP, ZIP_SPEED } from "../../shared/constants.ts";
import { defaultMatchMap, mapById, matchMaps } from "../../shared/maps/registry.ts";
import type { MapData } from "../../shared/maps/types.ts";
import type { PlayerSim } from "../../shared/sim/movement.ts";
import { createPlayerSim, stepPlayer } from "../../shared/sim/movement.ts";
import { spawnVolley, stepArrow, type ArrowSim } from "../../shared/sim/arrows.ts";
import { ARROW_SLOTS, fullDrawMs } from "../../shared/sim/bow.ts";
import type { ZipLine } from "../../shared/maps/types.ts";
import { QuiverStrip } from "../ui/quiver.ts";
import { emptySnapshot, moveSignals, snapshotOf } from "./course.ts";
import { TIP_TEXT, TipScheduler, countMatchStart, tipsActive, type TipId } from "./tips.ts";
import { loadSettings } from "../settings.ts";
import { headCenterY } from "../../shared/sim/hitboxes.ts";
import { CreatureDownMessage, CreatureHitMessage, DamagedMessage, DownedMessage, WaveMessage, HitConfirmMessage, KillMessage, MatchEndMessage, MatchStatsMessage, RelicMessage, RewardMessage, RobinHoodMessage, RopeCutMessage, SwatMessage } from "../../net/messages.ts";
import { MatchState, PlayerInput, type ArrowState, type PlayerState } from "../../net/schema.ts";
import { ropeSag, type Renderer } from "../render/Renderer.ts";
import { MatchHud, type RunSummary } from "../ui/hud.ts";
import { chooseRegion, probeRegions, regionEndpoint } from "../regions.ts";
import { ExpeditionHud, MODIFIER_NAMES, type ReviveView } from "../ui/expeditionHud.ts";
import type { CreaturePose } from "../render/creatures.ts";
import { SoundEffects } from "../audio/sfx.ts";
import { happyTime } from "../platform/web.ts";
import { fetchProfile, loadToken } from "../account.ts";
import { setAudioSuspended } from "../audio/bus.ts";
import { portalPolicy } from "../platform/platform.ts";
import { platform } from "../platform/sdk.ts";
import { ClipRecorder, clipsSupported, downloadBlob, shareOnXUrl } from "./clips.ts";
import { CameraRig } from "./CameraRig.ts";
import type { InputSampler } from "./InputSampler.ts";
import { ReplayDirector } from "./ReplayDirector.ts";
import { AfkPrompt, PingLayer, type PingEvent } from "../ui/pings.ts";
import { classifyPing, type CalloutId } from "../../shared/pings.ts";
import { AfkPromptMessage, AfkRemovedMessage, MutePingMessage, PingEventMessage, PingMessage, PlayOfTheMatchMessage } from "../../net/messages.ts";
import { spawnAbilityProjectile, tryAttachGrapple } from "../../shared/sim/abilities.ts";
import { drawFraction } from "../../shared/sim/bow.ts";
import { KillFeedbackTracker } from "../../shared/killFeedback.ts";
import { isGameMode, onlineSearch, type GameMode } from "../../shared/sim/modes.ts";
import { isInWater } from "../../shared/sim/volumes.ts";
import { gravityMultiplier } from "../../shared/sim/waves.ts";
import { motionFromSim, stabProgress } from "../render/characters/motion.ts";
import { createMotion } from "../render/characters/pose.ts";
import { AUDIO_MIX, ROPE_LOOK } from "../render/look.ts";
import { music } from "../audio/music.ts";
import { busTarget } from "../audio/bus.ts";
import { cueAngle, footstepGain, musicIntensity, strideLength } from "../audio/spatial.ts";
import { SoundCues, type CueKind } from "../ui/soundCues.ts";
import { Crosshair } from "../ui/crosshair.ts";
import { PAD } from "./gamepad.ts";
import { boulderPosition } from "../../shared/sim/hazards.ts";
import type { GameSettings } from "../settings.ts";

export type RenderedPlayer = { id: string; team: number; x: number; y: number; z: number; yaw?: number; grapple?: [number, number, number] };
type LocalArrow = ArrowSim & { owner: string; team: number; bornMs: number; kind: "arrow" | "scatter" | "tether" | "grapple" | "ink" | "spit" };
export type ExpeditionView = {
  mode: string; phase: string; wave: number; runPhase: string; left: number; modifier: string;
  creatures: Array<{ kind: string; x: number; y: number; z: number; yaw: number }>; drawn: Record<string, number>;
  herbs: number; herbsDrawn: number; downed: boolean; night: number; hud: string; me: { x: number; y: number; z: number };
};
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
  private readonly pingLayer: PingLayer;
  private readonly afkPrompt: AfkPrompt;
  private readonly pingEvents: PingEvent[] = [];
  private mutedPingFrom = new Set<string>();
  private zHeldMs = 0;
  private zWasDown = false;
  private middleWasDown = false;
  private readonly keysDown = new Set<string>();
  private playOfTheMatch: PlayOfTheMatchMessage | undefined;
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
      newMatch: async () => { try { await this.room.leave(true); } finally { location.assign(`/${onlineSearch(isGameMode(this.room.state.mode) ? this.room.state.mode : "tdm")}`); } },
      saveClip: this.clips ? () => this.saveClip() : undefined,
      shareUrl: policy.externalLinks ? (text) => shareOnXUrl(text) : undefined,
      mutePings: (playerId) => this.mutePingsFrom(playerId),
      reportPlayer: (playerId, reason) => { void this.reportPlayer(playerId, reason); },
    });
    this.replay = new ReplayDirector(renderer.canvas.parentElement!);
    this.pingLayer = new PingLayer(renderer.canvas.parentElement!);
    this.afkPrompt = new AfkPrompt(renderer.canvas.parentElement!);
    this.pingLayer.setCalloutHandler((id) => this.sendPing(undefined, id));
    window.addEventListener("keydown", (event) => { if (!event.repeat) this.keysDown.add(event.code); });
    window.addEventListener("keyup", (event) => { this.keysDown.delete(event.code); });
    window.addEventListener("mousedown", (event) => { if (event.button === 1) { event.preventDefault(); this.keysDown.add("Mouse1"); } });
    window.addEventListener("mouseup", (event) => { if (event.button === 1) this.keysDown.delete("Mouse1"); });
    this.quiver = new QuiverStrip(renderer.canvas.parentElement!);
    this.cues = new SoundCues(renderer.canvas.parentElement!);
    this.crosshair = new Crosshair(renderer.canvas.parentElement!);
    this.indicators = loadSettings().soundIndicators;
    window.addEventListener("bowdle-settings", (event) => { this.indicators = (event as CustomEvent<GameSettings>).detail.soundIndicators; });
    this.cameraRig.onMove = (kind) => this.sounds.play(kind);
    this.sessionId = room.sessionId;
    this.input = room.input<PlayerInput>({ mode: "reliable", type: PlayerInput });
    this.predict = Predict.get(room, { mode: "lerp", delay: INTERP_DELAY_MS, renderPresent: false });
    this.predict.attachAll("players", { mode: "lerp", fields: ["x", "y", "z", "height"], smoothMs: 0 });
    this.predict.attachAll("players", { mode: "lerp", fields: ["yaw", "pitch"], angle: true, smoothMs: 0 });
    this.predict.attachAll("creatures", { mode: "lerp", fields: ["x", "y", "z"], smoothMs: 0 });
    this.predict.attachAll("creatures", { mode: "lerp", fields: ["yaw"], angle: true, smoothMs: 0 });
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
        const events = stepPlayer(state, command, this.map, { nowMs: context.reckonTime, zipLines: this.tetherZips, gravityMult: gravityMultiplier(this.room.state.expedition.modifier) });
        if (context.isReplay) return;
        for (const event of events) {
          if (event.type === "fire") for (const arrow of spawnVolley(event, state.crouched)) this.arrows.spawn({ ...arrow, owner: room.sessionId, team: state.team, bornMs: context.reckonTime });
          else if (event.type === "grapple" || event.type === "ink") this.arrows.spawn({ ...spawnAbilityProjectile(event, state.crouched), owner: room.sessionId, team: state.team, bornMs: context.reckonTime, kind: event.type });
        }
      },
    });
    const callbacks = Callbacks.get(room);
    callbacks.onRemove("players", (_player, id) => this.renderer.removePlayer(id));
    callbacks.onAdd("inkClouds", (cloud, id) => this.renderer.setInkCloud(id, cloud.x, cloud.y, cloud.z, cloud.radius));
    callbacks.onRemove("inkClouds", (_cloud, id) => this.renderer.removeInkCloud(id));
    callbacks.onAdd("tethers", () => this.rebuildTetherZips());
    callbacks.onRemove("tethers", (_tether, id) => { this.rebuildTetherZips(); this.renderer.removeRope(id); });
    room.onMessage<CreatureHitMessage>("creatureHit", (payload) => { const parsed = CreatureHitMessage.safeParse(payload); if (parsed.success) this.onCreatureHit(parsed.data); });
    room.onMessage<CreatureDownMessage>("creatureDown", (payload) => { const parsed = CreatureDownMessage.safeParse(payload); if (parsed.success) this.onCreatureDown(parsed.data); });
    room.onMessage<WaveMessage>("wave", (payload) => { const parsed = WaveMessage.safeParse(payload); if (parsed.success) this.onWave(parsed.data); });
    room.onMessage<DownedMessage>("downed", (payload) => { const parsed = DownedMessage.safeParse(payload); if (parsed.success) this.onDowned(parsed.data); });
    room.onMessage<RelicMessage>("relic", (payload) => { const parsed = RelicMessage.safeParse(payload); if (parsed.success) this.onRelic(parsed.data); });
    room.onMessage<SwatMessage>("swat", (payload) => { const parsed = SwatMessage.safeParse(payload); if (parsed.success) this.onSwat(parsed.data); });
    room.onMessage<KillMessage>("kill", (payload) => { const parsed = KillMessage.safeParse(payload); if (parsed.success) this.onKill(parsed.data); });
    room.onMessage("pingEvent", (payload) => {
      const parsed = PingEventMessage.safeParse(payload);
      if (!parsed.success || this.mutedPingFrom.has(parsed.data.from)) return;
      this.pingEvents.push(parsed.data);
    });
    room.onMessage("afkPrompt", (payload) => {
      const parsed = AfkPromptMessage.safeParse(payload);
      if (parsed.success) this.afkPrompt.show(parsed.data.secondsLeft);
    });
    room.onMessage("afkRemoved", (payload) => {
      const parsed = AfkRemovedMessage.safeParse(payload);
      if (parsed.success) { this.afkPrompt.hide(); location.assign("/"); }
    });
    room.onMessage("playOfTheMatch", (payload) => {
      const parsed = PlayOfTheMatchMessage.safeParse(payload);
      if (parsed.success) this.playOfTheMatch = parsed.data;
    });
    room.onMessage<HitConfirmMessage>("hitConfirm", (payload) => { const parsed = HitConfirmMessage.safeParse(payload); if (parsed.success) this.onHitConfirm(parsed.data); });
    room.onMessage<DamagedMessage>("damaged", (payload) => { const parsed = DamagedMessage.safeParse(payload); if (parsed.success) { this.hud.damaged(parsed.data.fromX - this.me.state.x, parsed.data.fromZ - this.me.state.z); this.lastDamageAtMs = performance.now(); this.cameraRig.hurt(parsed.data.damage); } });
    room.onMessage<MatchEndMessage>("matchEnd", (payload) => { const parsed = MatchEndMessage.safeParse(payload); const me = room.state.players.get(room.sessionId); if (!parsed.success || !me) return; platform().setPlaying(false); if (parsed.data.playOf) this.playOfTheMatch = parsed.data.playOf; this.hud.end(parsed.data, this.names, { kills: me.kills, deaths: me.deaths, bestShot: this.bestShot, bestStreak: this.feedback.bestStreak }, matchMaps, this.runSummary(), this.playOfTheMatch); });
    room.onMessage<RewardMessage>("rewards", (payload) => { const parsed = RewardMessage.safeParse(payload); if (parsed.success) this.hud.rewards(parsed.data); });
    room.onMessage<MatchStatsMessage>("matchStats", (payload) => { const parsed = MatchStatsMessage.safeParse(payload); if (parsed.success) this.hud.matchStats(parsed.data); });
    room.onMessage<RopeCutMessage>("ropeCut", (payload) => { const parsed = RopeCutMessage.safeParse(payload); if (parsed.success) this.onRopeCut(parsed.data); });
    room.onMessage<RobinHoodMessage>("robinHood", (payload) => { const parsed = RobinHoodMessage.safeParse(payload); if (parsed.success) { this.hud.banner("ROBIN HOOD!"); this.sounds.play("paper"); happyTime("robinHood"); } });
  }

  static async connect(renderer: Renderer, sampler: InputSampler, name = "Player", testing = false, testMapId?: string, party?: string, testRoom?: string, mode: GameMode = "tdm", checkpoint = false, testStartWave?: number, ranked = false): Promise<OnlineSession> {
    const probes = await probeRegions();
    const chosen = chooseRegion(probes);
    const endpoint = regionEndpoint(chosen);
    const room = party
      ? await new Client(endpoint).joinOrCreate<MatchState>("party", { name, token: loadToken(), party, mode }, MatchState)
      : ranked
        ? await new Client(endpoint).joinOrCreate<MatchState>("ranked", { name, token: loadToken(), ranked: true, test: testing, testMapId, ...(testing && testRoom ? { testRoom } : {}) }, MatchState)
        : await new Client(endpoint).joinOrCreate<MatchState>(mode, { name, token: loadToken(), test: testing, testMapId, ...(testing && testRoom ? { testRoom } : {}), ...(mode === "expedition" ? { checkpoint, ...(testing && testStartWave !== undefined ? { testStartWave } : {}) } : {}) }, MatchState);
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
    const session = new OnlineSession(renderer, sampler, room);
    const pingRow = probes.find((row) => row.id === chosen?.id);
    const label = chosen?.label ?? chosen?.id ?? "server";
    session.setRegionPing(label, pingRow?.pingMs ?? null);
    const refresh = async (): Promise<void> => {
      const started = performance.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        await fetch(`${endpoint.replace(/\/$/, "")}/health`, { method: "GET", mode: "cors", cache: "no-store", signal: controller.signal });
        clearTimeout(timer);
        session.setRegionPing(label, Math.max(1, Math.round(performance.now() - started)));
      } catch {
        session.setRegionPing(label, null);
      }
    };
    setInterval(() => { void refresh(); }, 5000);
    return session;
  }

  setRegionPing(label: string, pingMs: number | null): void { this.hud.setRegionPing(label, pingMs); }

  start(): void {
    if (this.room.state.mode === "expedition") void fetchProfile().then((profile) => { this.expeditionBest = profile?.expeditionBest ?? 0; });
    this.tipsOn = tipsActive(loadSettings().tips, countMatchStart());
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
    this.hud.end({ winner: "draw", mvp: this.sessionId }, this.names, { kills: this.me.state.kills, deaths: this.me.state.deaths, bestShot: this.bestShot, bestStreak: this.feedback.bestStreak }, matchMaps, this.runSummary(), this.playOfTheMatch);
  }

  /** Test hook: plants a play-of-the-match highlight for the end screen. */
  setPlayOfTheMatch(playOf: PlayOfTheMatchMessage): void { this.playOfTheMatch = playOf; }

  openPingWheel(): void { this.pingLayer.showWheel(); }
  closePingWheel(): void { this.pingLayer.hideWheel(); }
  pingWheelOpen(): boolean { return this.pingLayer.isWheelOpen; }
  pingMarkerCount(): number { return this.pingLayer.root.querySelectorAll('[data-testid="ping-marker"]').length; }
  forcePing(kind: PingEvent["kind"] = "location"): void {
    this.sendPing(kind);
    const me = this.me.state;
    const event: PingEvent = {
      kind, x: me.x + Math.sin(me.yaw) * 8, y: me.y + 1.2, z: me.z + Math.cos(me.yaw) * 8,
      from: this.sessionId, team: me.team, atMs: performance.now(),
    };
    this.pingEvents.push(event);
    this.pingLayer.show(event, performance.now(), (x, y, z) => this.renderer.screenPoint(x, y, z));
  }
  afkPromptVisible(): boolean { return !this.afkPrompt.root.hidden; }
  showAfkPrompt(secondsLeft = 30): void { this.afkPrompt.show(secondsLeft); }
  isSpectating(): boolean { return this.replay.isSpectating(); }
  startSpectate(killerId: string, killerName = "Rival"): void {
    this.replay.start(this.sessionId, killerId, performance.now());
    this.replay.setKillerCaption(killerName, "spectating");
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
    this.sampler.frame(elapsed);
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
    this.enemyInView = false;
    this.enemyUnderCrosshair = false;
    for (const [id, player] of this.room.state.players) {
      this.names.set(id, player.name);
      if (id !== this.sessionId) this.listenTo(id, player, this.predict.value(player, "x"), this.predict.value(player, "y"), this.predict.value(player, "z"));
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
      const ropeX = this.predict.value(player, "x"), ropeY = this.predict.value(player, "y"), ropeZ = this.predict.value(player, "z");
      this.renderer.setGrappleRope(id, player.grappleActive && !this.recentlyCut(id, timeMs), ropeX, ropeY, ropeZ, player.grappleX, player.grappleY, player.grappleZ, ropeSag(player, ropeX, ropeY, ropeZ), id === this.sessionId);
      if (capture) this.replay.player(id, this.predict.value(player, "x"), this.predict.value(player, "y"), this.predict.value(player, "z"), this.predict.value(player, "yaw"));
    }
    this.renderArrows(timeMs, capture);
    this.hearHazards();
    this.showObjective(timeMs);
    this.showExpedition(timeMs);
    try {
      const broken = new Map<string, boolean>();
      const herbReady = new Map<string, boolean>();
      this.room.state.breakables?.forEach((item, id) => { broken.set(String(id), !!item.broken); });
      this.room.state.mapHerbs?.forEach((herb, id) => { herbReady.set(String(id), !!herb.ready); });
      this.renderer.updateMapKit(timeMs, broken, herbReady);
    } catch {
      // Map-kit draw must never stop the match frame (shot cues, prediction, HUD).
    }
    const camera = this.renderer.camera.position;
    this.sounds.setListener(camera.x, camera.y, camera.z, this.me.state.yaw);
    music().setIntensity(musicIntensity("match", this.enemyInView || this.creatureInView, performance.now() - this.lastDamageAtMs));
    this.renderer.setLocalTeam(this.room.state.mode === "ffa" ? -1 : this.me.state.team);
    this.renderer.setLocalBowSkin(this.me.state.look?.bowSkin ?? "bow.default");
    this.renderer.setLocalArrowKind(ARROW_SLOTS[this.me.state.arrowSlot] ?? "arrow");
    this.quiver.update(this.me.state);
    for (const [id, tether] of this.room.state.tethers) this.renderer.setTether(id, tether.fromX, tether.fromY, tether.fromZ, tether.toX, tether.toY, tether.toZ);
    const drawn = drawFraction(this.me.state.drawMs, fullDrawMs(this.me.state.arrowSlot));
    this.renderer.setDrawFraction(drawn);
    this.crosshair.update(drawn);
    this.sampler.setAimSlowdown(this.enemyUnderCrosshair);
    this.renderer.setMeleeSwing(stabProgress(this.me.state.meleeCooldownMs));
    if (!this.me.state.alive) { this.renderer.setViewmodelVisible(false); this.replay.update(this.renderer.camera, timeMs);
    this.tickPings(timeMs); }
    else if (!this.wasAlive) { this.renderer.setViewmodelVisible(true); this.replay.stop(); this.hud.setReplay(false); }
    this.wasAlive = this.me.state.alive;
    this.renderer.setGrappleHighlights(this.me.state.grappleCooldownMs <= 0 && !this.me.state.grappleActive);
    let hazardPhase: "idle" | "telegraph" | "roll" | "despawn" = "idle";
    for (const hazard of this.room.state.hazards.values()) if (hazard.phase === "roll" || hazard.phase === "telegraph") { hazardPhase = hazard.phase; break; }
    if (hazardPhase === "telegraph" && this.previousHazardPhase !== "telegraph") this.renderer.leverAudio();
    this.previousHazardPhase = hazardPhase; this.renderer.setBoulderAudio(hazardPhase); this.renderer.setZipAudio(this.me.state.zipId ? ZIP_SPEED : 0);
    if (timeMs >= this.nextHudAtMs) { this.hud.update(this.room.state, this.sessionId, this.room.clock.serverNow()); this.nextHudAtMs = timeMs + HUD_REFRESH_MS; this.updateTips(timeMs); this.expeditionHud?.update(this.room.state, this.sessionId, this.room.clock.serverNow(), this.reviveView()); }
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
        render = { visual: this.renderer.spawnArrowVisual(sim, source.kind, this.room.state.players.get(source.owner)?.look.arrowTrail ?? ""), sim, removedAtMs: 0, stuckForMs: source.kind === "arrow" || source.kind === "scatter" || source.kind === "tether" ? STUCK_ARROW_MS : 0 }; this.arrowRenders.set(entry.id, render);
      }
      render.sim.x = this.arrows.value(entry, "x"); render.sim.y = this.arrows.value(entry, "y"); render.sim.z = this.arrows.value(entry, "z");
      if (!this.heardShots.has(entry.id) && this.hearShot(source, render.sim)) this.heardShots.add(entry.id);
      render.sim.vx = source.vx; render.sim.vy = source.vy; render.sim.vz = source.vz; this.renderer.updateArrowVisual(render.visual, render.sim);
      if (capture) this.replay.arrow(entry.id, render.sim.x, render.sim.y, render.sim.z);
    }
    for (const [id, render] of this.arrowRenders) {
      if (this.arrows.alive(id)) continue;
      if (render.removedAtMs === 0) render.removedAtMs = timeMs;
      if (timeMs - render.removedAtMs >= render.stuckForMs) { this.renderer.removeVisual(render.visual); this.arrowRenders.delete(id); this.heardShots.delete(id); }
    }
  }

  private readonly lookScratch = { bow: "", outfit: "" };
  private lookFor(player: PlayerState): { bow: string; outfit: string } {
    this.lookScratch.bow = player.look.bowSkin; this.lookScratch.outfit = player.look.outfit;
    return this.lookScratch;
  }

  /** Tethers as zip lines, so prediction rides them like the server does. */
  private tetherZips: ZipLine[] = [];
  private tipsOn = false;
  private readonly cues: SoundCues;
  private indicators = false;
  private lastDamageAtMs = Number.NEGATIVE_INFINITY;
  private enemyInView = false;
  private enemyUnderCrosshair = false;
  private readonly crosshair: Crosshair;
  private readonly heard = new Map<string, { x: number; z: number; stride: number; grapple: boolean; zip: string }>();
  private readonly hazardPhases = new Map<string, string>();
  private readonly boulderPoint = { x: 0, y: 0, z: 0 };

  private nearCenter(point: { x: number; y: number }): boolean {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return Math.hypot(point.x - rect.width / 2, point.y - rect.height / 2) <= PAD.aimSlowdownPx;
  }

  private cue(kind: CueKind, x: number, z: number): void {
    if (!this.indicators) return;
    const me = this.me.state;
    this.cues.show(kind, cueAngle(me.x, me.z, me.yaw, x, z));
  }

  /** Enemy footsteps, and grapple and zip starts from other players, heard from where they happen. */
  private listenTo(id: string, player: PlayerState, x: number, y: number, z: number): void {
    const me = this.me.state;
    let memo = this.heard.get(id);
    if (!memo) { memo = { x, z, stride: 0, grapple: player.grappleActive, zip: player.zipId }; this.heard.set(id, memo); return; }
    const moved = Math.hypot(x - memo.x, z - memo.z);
    memo.x = x; memo.z = z;
    const distance = Math.hypot(x - me.x, y - me.y, z - me.z);
    if (player.alive && player.team !== me.team) {
      const onScreen = distance < Math.max(AUDIO_MIX.enemyViewM, PAD.aimSlowdownRangeM) ? this.renderer.screenPoint(x, y + 1.2, z) : undefined;
      if (onScreen && distance < AUDIO_MIX.enemyViewM) this.enemyInView = true;
      if (onScreen && distance < PAD.aimSlowdownRangeM && this.nearCenter(onScreen)) this.enemyUnderCrosshair = true;
      const speed = Math.hypot(player.vx, player.vz);
      const loudness = player.grounded && !player.zipId ? footstepGain(distance, speed, player.crouched) : 0;
      if (loudness > 0 && moved < 5) {
        memo.stride += moved;
        if (memo.stride >= strideLength(speed)) { memo.stride = 0; this.sounds.playAt("footstep", x, y, z, loudness); this.cue("footstep", x, z); }
      } else memo.stride = 0;
    }
    const near = Math.max(0, 1 - distance / AUDIO_MIX.shotCueRangeM);
    if (player.grappleActive && !memo.grapple) this.sounds.playAt("reel", x, y + 1, z, near);
    if (player.zipId && !memo.zip) this.sounds.playAt("zip", x, y + 1, z, near);
    memo.grapple = player.grappleActive; memo.zip = player.zipId;
  }

  private readonly heardShots = new Set<string | number>();

  /**
   * An enemy arrow is heard once, the first frame it is within range. Returns true when it was heard
   * or never can be (an own arrow, a teammate arrow or an ability projectile).
   */
  private hearShot(arrow: LocalArrow | ArrowState, at: { x: number; y: number; z: number }): boolean {
    const me = this.me.state;
    // Wait until owner is on the player map. ArrowState defaults team to 0, so using
    // arrow.team alone can mark a half-synced enemy shot as a teammate (no cue).
    if (!arrow.owner) return false;
    if (arrow.owner === this.sessionId) return true;
    if (arrow.kind !== "arrow" && arrow.kind !== "scatter" && arrow.kind !== "tether") return true;
    const owner = this.room.state.players.get(arrow.owner);
    if (!owner) return false;
    if (owner.team === me.team) return true;
    const distance = Math.hypot(at.x - me.x, at.z - me.z);
    if (distance > AUDIO_MIX.shotCueRangeM) return false;
    this.sounds.playAt("twang", at.x, at.y, at.z, 1 - distance / AUDIO_MIX.shotCueRangeM);
    this.cue("shot", at.x, at.z);
    return true;
  }

  private showObjective(timeMs: number): void {
    const state = this.room.state, relic = state.relic;
    this.renderer.setFreeForAll(state.mode === "ffa");
    const relicMode = state.mode === "relic";
    this.renderer.setRelic(relicMode, relic.x, relic.y, relic.z, relic.carrier, timeMs);
    const point = relicMode && relic.carrier !== this.sessionId ? this.renderer.screenPoint(relic.x, relic.y + (relic.carrier ? 0.6 : 1.8), relic.z) : undefined;
    this.hud.objective(point ?? null);
  }

  private expeditionHud: ExpeditionHud | null = null;
  private expeditionBest = 0;
  private creatureInView = false;
  private lastHp = -1;
  private readonly poses: Array<[string, CreaturePose]> = [];
  private readonly creatureSeen = new Map<string, { x: number; y: number; z: number; kind: string }>();

  /** Expedition: creatures and herbs every frame, the Night modifier, and hurt feedback from creature damage. */
  private showExpedition(timeMs: number): void {
    const state = this.room.state;
    if (state.mode !== "expedition") return;
    this.expeditionHud ??= new ExpeditionHud(this.renderer.canvas.parentElement!);
    const me = this.me.state;
    let count = 0;
    this.creatureInView = false;
    for (const [id, creature] of state.creatures) {
      let entry = this.poses[count];
      if (!entry) { entry = ["", { kind: "", x: 0, y: 0, z: 0, yaw: 0, action: "", actionMs: 0 }]; this.poses.push(entry); }
      const pose = entry[1];
      entry[0] = id; pose.kind = creature.kind; pose.action = creature.action; pose.actionMs = creature.actionMs;
      pose.x = this.predict.value(creature, "x"); pose.y = this.predict.value(creature, "y"); pose.z = this.predict.value(creature, "z"); pose.yaw = this.predict.value(creature, "yaw");
      count += 1;
      let seen = this.creatureSeen.get(id);
      if (!seen) { seen = { x: 0, y: 0, z: 0, kind: creature.kind }; this.creatureSeen.set(id, seen); }
      seen.x = pose.x; seen.y = pose.y; seen.z = pose.z;
      if (!this.creatureInView && Math.hypot(pose.x - me.x, pose.z - me.z) < AUDIO_MIX.enemyViewM) this.creatureInView = true;
    }
    this.poses.length = count;
    this.renderer.setCreatures(this.poses, state.herbs.values(), timeMs);
    this.renderer.setNight(state.expedition.modifier === "night" && state.expedition.phase === "fight");
    // Creature damage has no damaged message; a drop in health is enough for the camera and music.
    if (this.lastHp >= 0 && me.hp < this.lastHp && me.alive) { this.cameraRig.hurt(this.lastHp - me.hp); this.lastDamageAtMs = performance.now(); }
    this.lastHp = me.hp;
  }

  /** The nearest downed teammate within reach, while this player can revive. */
  private reviveView(): ReviveView {
    const me = this.me.state;
    if (this.room.state.mode !== "expedition" || !me.alive || me.downed) return null;
    for (const [id, player] of this.room.state.players) {
      if (id === this.sessionId || !player.downed) continue;
      if (Math.hypot(player.x - me.x, player.z - me.z) <= EXPEDITION.reviveRangeM) return { name: player.name, progress: Math.min(1, player.reviveMs / EXPEDITION.reviveMs) };
    }
    return null;
  }

  private runSummary(): RunSummary | undefined {
    const run = this.room.state.expedition;
    if (this.room.state.mode !== "expedition") return undefined;
    return { wave: run.wave, best: Math.max(this.expeditionBest, run.wave), cleared: run.cleared, bosses: run.bosses };
  }

  private onCreatureHit(message: CreatureHitMessage): void {
    if (message.blocked) { this.sounds.play("dagger"); this.hud.tickerLine("Shield blocked"); return; }
    this.hud.hit(message.gem);
    this.sounds.play("hit", message.damage);
    const creature = this.room.state.creatures.get(message.id) ?? this.creatureSeen.get(message.id);
    if (!creature) return;
    const stats: { height: number; gemHeightM?: number } = CREATURE_TUNING[(creature.kind in CREATURE_TUNING ? creature.kind : "beetle") as keyof typeof CREATURE_TUNING];
    const point = this.renderer.screenPoint(creature.x, creature.y + (message.gem ? stats.gemHeightM ?? stats.height : stats.height * 0.6), creature.z);
    if (point) this.hud.damageNumber(point.x, point.y, message.damage, message.gem);
  }

  private onCreatureDown(message: CreatureDownMessage): void {
    const seen = this.creatureSeen.get(message.id);
    this.creatureSeen.delete(message.id);
    if (seen) this.renderer.creatureBurst(message.kind, seen.x, seen.y, seen.z, this.hash(message.id));
    if (message.kind === "colossus") { this.hud.banner("COLOSSUS DEFEATED!"); this.sounds.play("multikill"); }
    if (message.killer !== this.sessionId) return;
    this.hud.killConfirm(false); this.sounds.play("kill");
  }

  private onWave(message: WaveMessage): void {
    if (message.event === "start") {
      const modifier = MODIFIER_NAMES[message.modifier] ?? "";
      this.hud.banner(message.boss ? "THE COLOSSUS WAKES" : `WAVE ${message.wave}${modifier ? ` Â· ${modifier.toUpperCase()}` : ""}`);
      this.sounds.play("paper");
    } else if (message.event === "clear") {
      this.hud.banner(`WAVE ${message.wave} CLEARED`);
      this.sounds.play("multikill");
    } else this.hud.banner("RUN OVER");
  }

  private onDowned(message: DownedMessage): void {
    const mine = message.player === this.sessionId, name = this.names.get(message.player) ?? "A teammate";
    if (message.event === "down") { if (mine) this.hud.banner("DOWN!"); else this.hud.tickerLine(`${name} is down`); }
    else if (message.event === "revived") { if (mine) this.hud.banner("BACK UP"); else this.hud.tickerLine(`${name} is back up`); this.sounds.play("paper"); }
    else if (message.event === "life") { if (mine) this.hud.banner("SPARE LIFE USED"); }
    else if (!mine) this.hud.tickerLine(`${name} is out until the break`);
  }

  /** Test hook: the run as this client sees and draws it. */
  expeditionState(): ExpeditionView {
    const state = this.room.state, run = state.expedition;
    return {
      mode: state.mode, phase: state.phase, wave: run.wave, runPhase: run.phase, left: run.left, modifier: run.modifier,
      creatures: [...state.creatures.values()].map((creature) => ({ kind: creature.kind, x: creature.x, y: creature.y, z: creature.z, yaw: creature.yaw })),
      drawn: this.renderer.creaturesDrawn(), herbs: state.herbs.size, herbsDrawn: this.renderer.herbsDrawn(), downed: this.me.state.downed,
      night: this.renderer.nightAmount(), hud: this.expeditionHud?.text() ?? "", me: { x: this.me.state.x, y: this.me.state.y, z: this.me.state.z },
    };
  }

  private hearHazards(): void {
    for (const [id, hazard] of this.room.state.hazards) {
      const before = this.hazardPhases.get(id);
      this.hazardPhases.set(id, hazard.phase);
      if (hazard.phase !== "roll" || before === "roll") continue;
      const boulder = this.map.boulders.find((entry) => entry.id === id);
      if (!boulder) continue;
      boulderPosition(boulder, hazard.t, hazard.direction, this.boulderPoint);
      this.cue("boulder", this.boulderPoint.x, this.boulderPoint.z);
    }
  }

  /** Test hooks for audio. */
  audioState(): { musicBus: number; layers: { pad: number; percussion: number; melody: number }; cues: number } {
    return { musicBus: busTarget("music"), layers: music().mix(), cues: this.cues.shown };
  }
  showCue(kind: CueKind, x: number, z: number): void { this.cue(kind, x, z); }
  private tips: TipScheduler | null = null;
  private readonly tipBefore = emptySnapshot();
  private readonly tipAvailable: TipId[] = [];

  /** Runs with the HUD refresh: notes which moves were used and shows at most one tip for an unused one. */
  private updateTips(nowMs: number): void {
    if (!this.tipsOn || this.room.state.phase !== "live") return;
    const state = this.me.state;
    this.tips ??= new TipScheduler(nowMs);
    const signals = moveSignals(this.tipBefore, state);
    snapshotOf(state, this.tipBefore);
    if (signals.has("reel") || signals.has("swing")) this.tips.used("reel", nowMs);
    if (signals.has("vineHop")) this.tips.used("vineHop", nowMs);
    if (signals.has("dodge")) this.tips.used("dodge", nowMs);
    if (signals.has("slide")) this.tips.used("slide", nowMs);
    if (state.arrowSlot === 1) this.tips.used("scatter", nowMs);
    if (!state.alive) return;
    const available = this.tipAvailable; available.length = 0;
    if (state.grappleCooldownMs <= 0 && !state.grappleActive) available.push("reel");
    if (!state.grounded && state.airJumps > 0) available.push("vineHop");
    if (state.dodgeCooldownMs <= 0) available.push("dodge");
    if (state.scatterCharges > 0 && state.arrowSlot !== 1) available.push("scatter");
    if (state.grounded && Math.hypot(state.vx, state.vz) > 6.5) available.push("slide");
    const tip = this.tips.next(nowMs, available);
    if (tip) this.hud.tip(TIP_TEXT[tip]);
  }
  private readonly quiver: QuiverStrip;

  private rebuildTetherZips(): void {
    this.tetherZips = [];
    for (const [id, tether] of this.room.state.tethers) this.tetherZips.push({ id, from: [tether.fromX, tether.fromY, tether.fromZ], to: [tether.toX, tether.toY, tether.toZ] });
  }

  private onRelic(message: RelicMessage): void {
    const mine = message.player === this.sessionId, ours = message.team === this.me.state.team;
    const text = message.event === "pickup" ? (mine ? "YOU HAVE THE RELIC" : ours ? "YOUR TEAM HAS THE RELIC" : "ENEMY HAS THE RELIC")
      : message.event === "drop" ? "RELIC DROPPED"
      : message.event === "return" ? "RELIC RETURNED"
      : ours ? "RELIC CAPTURED!" : "RELIC LOST";
    this.hud.banner(text);
    this.sounds.play(message.event === "capture" ? "multikill" : "paper");
  }

  /** Test hook: the mode and the relic as this client sees them. */
  relicState(): { mode: string; home: boolean; carrier: string; carrying: boolean; relicDrawn: boolean; x: number; y: number; z: number } {
    const relic = this.room.state.relic;
    return { mode: this.room.state.mode, home: relic.home, carrier: relic.carrier, carrying: this.me.state.relicCarrier, relicDrawn: this.renderer.relicVisible(), x: relic.x, y: relic.y, z: relic.z };
  }

  private onSwat(message: SwatMessage): void {
    this.sounds.play("dagger");
    if (message.swatter === this.sessionId) { this.hud.banner("SWATTED"); this.hud.tickerLine(`+${RETENTION_XP.swat} Swatted`); }
    else if (message.shooter === this.sessionId) this.hud.banner("SWATTED!");
  }

  /** Test hook: shows a swat as if the server had sent it. */
  showSwat(message: SwatMessage): void { this.onSwat(SwatMessage.parse(message)); }
  quiverState(): { slot: string; charges: number; tetherCooldownMs: number; tethers: number } {
    const state = this.me.state;
    return { slot: ARROW_SLOTS[state.arrowSlot] ?? "arrow", charges: state.scatterCharges, tetherCooldownMs: state.tetherCooldownMs, tethers: this.room.state.tethers.size };
  }

  private readonly ropeCuts = new Map<string, number>();
  private recentlyCut(id: string, nowMs: number): boolean {
    const at = this.ropeCuts.get(id); if (at === undefined) return false;
    if (nowMs - at < ROPE_LOOK.cutHideMs) return true;
    this.ropeCuts.delete(id); return false;
  }

  private onRopeCut(message: RopeCutMessage, nowMs = performance.now()): void {
    if (message.tether) this.renderer.snapRope(message.tether, message.x, message.y, message.z, nowMs);
    else { this.renderer.snapRope(message.owner, message.x, message.y, message.z, nowMs); this.ropeCuts.set(message.owner, nowMs); }
    this.sounds.play("ropeSnap");
    if (message.cutter === this.sessionId) { this.hud.banner("ROPE CUT"); this.hud.tickerLine(`+${RETENTION_XP.ropeCut} Rope cut`); }
    else if (message.owner === this.sessionId) this.hud.banner("ROPE CUT!");
  }

  /** Test hook: shows a rope cut as if the server had sent it. */
  showRopeCut(message: RopeCutMessage): void { this.onRopeCut(RopeCutMessage.parse(message)); }
  grappleReeling(): boolean { return this.me.state.grappleReeling; }

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
      const bought = killer ? this.renderer.spawnKillEffect(killer.look.killEffect, killer.team, victim.x, victim.y, victim.z, seed) : false;
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
    if (message.victim === this.sessionId) {
      this.hud.setReplay(true);
      this.replay.start(message.victim, message.killer, performance.now());
      const killer = this.room.state.players.get(message.killer);
      const name = killer?.name ?? this.names.get(message.killer) ?? "Foe";
      this.replay.setKillerCaption(name, `${message.weapon}${message.headshot ? " · headshot" : ""}`);
    }
  }

  private markBodyArrow(x: number, y: number, z: number): void {
    let nearest: ArrowRender | undefined, distance = Number.POSITIVE_INFINITY;
    for (const render of this.arrowRenders.values()) { const candidate = Math.hypot(render.sim.x - x, render.sim.y - y, render.sim.z - z); if (candidate < distance) { distance = candidate; nearest = render; } }
    if (nearest) nearest.stuckForMs = BODY_ARROW_STUCK_MS;
  }

  private tickPings(timeMs: number): void {
    const z = this.keysDown.has("KeyZ");
    const middle = this.keysDown.has("Mouse1");
    if (z && !this.zWasDown) this.zHeldMs = timeMs;
    if (z && this.zWasDown && timeMs - this.zHeldMs >= 250) this.pingLayer.showWheel();
    if (!z && this.zWasDown) {
      if (this.pingLayer.isWheelOpen) this.pingLayer.hideWheel();
      else if (timeMs - this.zHeldMs < 250) this.sendPing();
    }
    if (middle && !this.middleWasDown) this.sendPing();
    this.zWasDown = z;
    this.middleWasDown = middle;
    this.pingLayer.prune(timeMs);
    for (const event of this.pingEvents) {
      this.pingLayer.show(event, timeMs, (x, y, z) => this.renderer.screenPoint(x, y, z));
    }
  }

  private sendPing(kind?: PingEvent["kind"], callout?: CalloutId): void {
    const me = this.me.state;
    const dist = 12;
    const payload = {
      kind: kind ?? ("location" as const),
      x: me.x + Math.sin(me.yaw) * dist,
      y: me.y + 1,
      z: me.z + Math.cos(me.yaw) * dist,
      callout,
    };
    const parsed = PingMessage.safeParse(payload);
    if (parsed.success) this.room.send("ping", parsed.data);
  }

  mutePingsFrom(targetId: string): void {
    this.mutedPingFrom.add(targetId);
    this.room.send("mutePing", MutePingMessage.parse({ targetId }));
  }

  async reportPlayer(targetId: string, reason: "offensiveName" | "cheating" | "afk"): Promise<void> {
    const token = loadToken();
    await fetch("/api/report", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ targetId, reason }),
    });
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
      yaw: this.predict.value(player, "yaw"),
      ...(player.grappleActive ? { grapple: [player.grappleX, player.grappleY, player.grappleZ] as [number, number, number] } : {}),
    });
    return result;
  }

  /** Test hook: looks at the relic. */
  aimAtRelic(): void {
    const relic = this.room.state.relic, me = this.me.state;
    const dx = relic.x - me.x, dz = relic.z - me.z;
    this.sampler.setLook(Math.atan2(-dx, -dz), Math.atan2(relic.y + 1 - (me.y + EYE_STAND), Math.hypot(dx, dz)));
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
  /** Test hook: looks at the nearest grapple anchor the hook really reaches, at least minDistance away. */
  aimAtGrapple(minDistance = 0): void {
    const state = this.me.state, probe = createPlayerSim(state.x, state.y, state.z);
    const anchors: Array<{ distance: number; yaw: number; pitch: number }> = [];
    for (const box of this.map.boxes) {
      if (!box.tags.includes("grapple")) continue;
      const x = (box.min[0] + box.max[0]) / 2, y = (box.min[1] + box.max[1]) / 2, z = (box.min[2] + box.max[2]) / 2;
      const dx = x - state.x, dz = z - state.z;
      anchors.push({ distance: Math.hypot(dx, y - state.y, dz), yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(y - (state.y + EYE_STAND), Math.hypot(dx, dz)) });
    }
    anchors.sort((left, right) => left.distance - right.distance);
    for (const anchor of anchors) {
      probe.grappleActive = false;
      const hit = tryAttachGrapple(probe, { moveX: 0, moveZ: 0, yaw: anchor.yaw, pitch: anchor.pitch, buttons: 0 }, this.map);
      if (hit && Math.hypot(hit.anchorX - state.x, hit.anchorY - state.y, hit.anchorZ - state.z) >= minDistance) { this.sampler.setLook(anchor.yaw, anchor.pitch); return; }
    }
  }
}

