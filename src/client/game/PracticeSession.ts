import { platform } from "../platform/sdk.ts";
import type { Group } from "three";
import {
  ARROW_LIFETIME_MS,
  ARROW_RADIUS,
  EYE_STAND,
  HEAD_MULT,
  HEAD_RADIUS,
  MAX_HP,
  ONBOARDING,
  SWAT,
  PRACTICE_RAIL_HALF_WIDTH,
  PRACTICE_REPLAY_MIN_M,
  PRACTICE_RESPAWN_MS,
  REPLAY_DURATION_MS,
  REPLAY_CAPTURE_HZ,
  REPLAY_SPEED,
  STAND_HEIGHT,
  STUCK_ARROW_MS,
  SUBSTEPS,
  TICK_HZ,
} from "../../shared/constants.ts";
import { BTN, type PlayerInputFrame } from "../../shared/input.ts";
import { campMap, campTargets, type CampTarget } from "../../shared/maps/camp.ts";
import type { Vec3 } from "../../shared/math/vec3.ts";
import { aimRangeAlongLook, spawnArrow, spawnVolley, stepArrow, sweepArrowVsTarget, type ArrowSim } from "../../shared/sim/arrows.ts";
import { ARROW_SLOTS, arrowSpeed, bodyDamage, drawFraction, fullDrawMs, type FireEvent } from "../../shared/sim/bow.ts";
import { QuiverStrip } from "../ui/quiver.ts";
import { Crosshair } from "../ui/crosshair.ts";
import { applyDamage } from "../../shared/sim/health.ts";
import { headCenterY } from "../../shared/sim/hitboxes.ts";
import { inSwatWindow, meleeHit, swatHits } from "../../shared/sim/melee.ts";
import { createPlayerSim, stepPlayer, type PlayerSim } from "../../shared/sim/movement.ts";
import { JOURNAL_LOOK } from "../render/look.ts";
import { SoundEffects } from "../audio/sfx.ts";
import { ropeSag, type Renderer } from "../render/Renderer.ts";
import { CameraRig } from "./CameraRig.ts";
import type { InputSampler } from "./InputSampler.ts";
import { COURSE_REACH_M, CourseGuide, courseDone, emptySnapshot, moveSignals, snapshotOf, type CourseResult, type CourseSignal } from "./course.ts";
import { completeTutorial, ensureAccount } from "../account.ts";
import { loadName } from "../settings.ts";
import { music } from "../audio/music.ts";
import { musicIntensity } from "../audio/spatial.ts";
import { stabProgress } from "../render/characters/motion.ts";

type TargetState = CampTarget & { x: number; hp: number; alive: boolean; lastDamageAtMs: number; respawnAtMs: number };
type ArrowEntry = { sim: ArrowSim; visual: Group; stuckAtMs: number; trail: Float32Array; trailCount: number; captureStep: number };
export type PracticeShotResult = { headshot: boolean; killed: boolean; targetId: string };
/** auto starts the course only for players who have not finished it; replay always starts it; first also leads into a first match. */
export type CourseMode = "auto" | "replay" | "first";
export type CourseState = { active: boolean; index: number; station: string; finished: boolean; skipped: boolean; reward: { granted: boolean; ink: number } | null };

const input: PlayerInputFrame = { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 };
const segmentStart: Vec3 = { x: 0, y: 0, z: 0 };
const segmentEnd: Vec3 = { x: 0, y: 0, z: 0 };
const PRACTICE_TRAIL_POINTS = REPLAY_DURATION_MS * REPLAY_CAPTURE_HZ / 1000;

function copyState(target: PlayerSim, source: PlayerSim): void {
  Object.assign(target, source);
}

function targetState(target: CampTarget): TargetState {
  return { ...target, x: target.pos[0], hp: MAX_HP, alive: true, lastDamageAtMs: 0, respawnAtMs: 0 };
}

export class PracticeSession {
  readonly player = createPlayerSim(0, 0, 0);
  private readonly previous = createPlayerSim(0, 0, 0);
  private readonly renderer: Renderer;
  private readonly sampler: InputSampler;
  private readonly cameraRig = new CameraRig();
  private readonly sounds = new SoundEffects();
  private readonly targets = campTargets.map(targetState);
  private readonly arrows: ArrowEntry[] = [];
  private readonly crosshair: Crosshair;
  private readonly hitText: HTMLDivElement;
  private readonly replayCard: HTMLDivElement;
  private readonly course: CourseGuide;
  private readonly courseMode: CourseMode;
  private readonly marker: HTMLDivElement;
  private readonly before = emptySnapshot();
  private readonly drill: Array<{ sim: ArrowSim; visual: Group }> = [];
  private nextThrowAtMs = 0;
  private courseResult: CourseResult | null = null;
  private courseReward: { granted: boolean; ink: number } | null = null;
  private readonly quiver: QuiverStrip;
  private accumulatorMs = 0;
  private lastFrameMs = performance.now();
  private simTimeMs = 0;
  private trailId = "";

  constructor(renderer: Renderer, sampler: InputSampler, container: HTMLElement, courseMode: CourseMode = "auto") {
    this.renderer = renderer;
    this.sampler = sampler;
    this.crosshair = new Crosshair(container);
    this.hitText = document.createElement("div");
    this.hitText.id = "hit-marker";
    this.hitText.style.cssText = "position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);font:34px 'Permanent Marker',cursive;color:#d2531f;text-shadow:1px 1px #efe3c6;pointer-events:none";
    this.replayCard = document.createElement("div");
    this.replayCard.className = "bowdle-practice-replay";
    this.replayCard.style.cssText = "display:none;position:absolute;right:24px;bottom:24px;width:320px;height:180px;border:4px solid #4a3527;background-size:cover;background-position:center;color:#d2531f;font:24px 'Permanent Marker';padding:8px;box-sizing:border-box;pointer-events:none";
    container.append(this.hitText, this.replayCard);
    this.courseMode = courseMode;
    this.marker = document.createElement("div");
    this.marker.className = "bowdle-course-marker";
    this.marker.textContent = "▼";
    this.marker.style.cssText = "position:absolute;display:none;transform:translate(-50%,-100%);font:34px 'Permanent Marker';color:#d2531f;text-shadow:2px 2px #efe3c6;pointer-events:none;z-index:6";
    container.append(this.marker);
    this.course = new CourseGuide(container, courseMode !== "auto" || !courseDone(), (result) => this.finishCourse(result, container));
    this.quiver = new QuiverStrip(container);
  }

  start(): void {
    music().setIntensity(musicIntensity("practice", false, Number.POSITIVE_INFINITY));
    platform().loaded();
    platform().setPlaying(true);
    requestAnimationFrame((time) => this.frame(time));
  }

  /** Shows the equipped bow and trail in practice too. */
  setLoadout(loadout: { bow: string; trail: string }): void {
    this.trailId = loadout.trail;
    this.renderer.setLocalBowSkin(loadout.bow);
  }

  private updateTargets(): void {
    for (const target of this.targets) {
      if (!target.alive && this.simTimeMs >= target.respawnAtMs) {
        target.alive = true;
        target.hp = MAX_HP;
      }
      if (target.speed > 0) {
        const width = target.railHalfWidth ?? PRACTICE_RAIL_HALF_WIDTH;
        const distance = (this.simTimeMs / 1000 * target.speed) % (width * 4);
        target.x = target.pos[0] + (distance <= width * 2 ? -width + distance : width * 3 - distance);
      }
      this.renderer.setTargetPosition(target.id, target.x, target.pos[1], target.pos[2], target.alive);
    }
  }

  private damageTarget(target: TargetState, damage: number, headshot: boolean): PracticeShotResult {
    const killed = applyDamage(target, damage * (headshot ? HEAD_MULT : 1), this.simTimeMs);
    if (killed) target.respawnAtMs = this.simTimeMs + PRACTICE_RESPAWN_MS;
    this.hitText.textContent = headshot ? "HEADSHOT ✕" : `-${Math.round(damage)}`;
    this.hitText.animate([{ opacity: 1, transform: "translate(-50%,-50%) scale(.8)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1.08)" }, { opacity: 0 }], { duration: JOURNAL_LOOK.hitMarkerMs });
    this.sounds.play(headshot ? "headshot" : "body");
    if (headshot) this.course.observe("headshot");
    return { headshot, killed, targetId: target.id };
  }

  private showReplayCard(distance: number, trail: Float32Array, count: number): void {
    this.replayCard.innerHTML = `<strong style="position:absolute;z-index:2">ARROW CAM · ${Math.round(distance)} m</strong><canvas width="296" height="148" style="position:absolute;left:8px;top:24px"></canvas>`;
    this.replayCard.style.backgroundImage = "linear-gradient(165deg,#efe3c6ee,#d9c79f88)";
    this.replayCard.style.display = "block";
    const canvas = this.replayCard.querySelector("canvas")!, context = canvas.getContext("2d")!; const started = performance.now();
    const duration = Math.min(REPLAY_DURATION_MS, count * 1000 / REPLAY_CAPTURE_HZ) / REPLAY_SPEED;
    const draw = (now: number): void => {
      const shown = Math.min(count, Math.max(1, Math.ceil((now - started) / duration * count))); context.clearRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = "#d9c79f"; context.lineWidth = 1; const grid = JOURNAL_LOOK.gridCssPx / 2;
      for (let y = grid; y < canvas.height; y += grid) { context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke(); }
      for (let x = grid; x < canvas.width; x += grid) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke(); }
      context.strokeStyle = "#4a3527"; context.lineWidth = 3; context.beginPath();
      for (let index = 0; index < shown; index += 1) { const x = 14 + index / Math.max(1, count - 1) * (canvas.width - 28); const y = canvas.height * 0.7 - (trail[index * 3 + 1]! - trail[1]!) * 24; if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); } context.stroke();
      const arrowX = 14 + (shown - 1) / Math.max(1, count - 1) * (canvas.width - 28), arrowY = canvas.height * 0.7 - (trail[(shown - 1) * 3 + 1]! - trail[1]!) * 24; context.fillStyle = "#d2531f"; context.beginPath(); context.arc(arrowX, arrowY, 6, 0, Math.PI * 2); context.fill();
      if (shown < count) requestAnimationFrame(draw); else window.setTimeout(() => { this.replayCard.style.display = "none"; }, REPLAY_DURATION_MS);
    };
    requestAnimationFrame(draw);
  }

  private stepProjectiles(dt: number): void {
    for (let index = this.arrows.length - 1; index >= 0; index -= 1) {
      const entry = this.arrows[index]!;
      if (!entry.sim.stuck) {
        if (entry.captureStep % SUBSTEPS === 0 && entry.trailCount < PRACTICE_TRAIL_POINTS) { const offset = entry.trailCount++ * 3; entry.trail[offset] = entry.sim.x; entry.trail[offset + 1] = entry.sim.y; entry.trail[offset + 2] = entry.sim.z; }
        entry.captureStep += 1;
        segmentStart.x = entry.sim.x; segmentStart.y = entry.sim.y; segmentStart.z = entry.sim.z;
        const arrowStep = stepArrow(entry.sim, campMap, dt);
        if (arrowStep.worldHit) entry.stuckAtMs = this.simTimeMs;
        segmentEnd.x = entry.sim.x; segmentEnd.y = entry.sim.y; segmentEnd.z = entry.sim.z;
        for (const target of this.targets) {
          if (!target.alive) continue;
          const hit = sweepArrowVsTarget(segmentStart, segmentEnd, { x: target.x, y: target.pos[1], z: target.pos[2], height: STAND_HEIGHT, crouched: false });
          if (!hit) continue;
          entry.sim.stuck = true;
          entry.stuckAtMs = this.simTimeMs;
          const result = this.damageTarget(target, entry.sim.damage, hit.kind === "head");
          const distance = Math.hypot(target.x - this.player.x, target.pos[2] - this.player.z);
          if (result.killed && distance > PRACTICE_REPLAY_MIN_M) this.showReplayCard(distance, entry.trail, entry.trailCount);
          break;
        }
        this.renderer.updateArrowVisual(entry.visual, entry.sim);
      }
      const expired = entry.sim.ageMs >= ARROW_LIFETIME_MS || (entry.stuckAtMs > 0 && this.simTimeMs - entry.stuckAtMs >= STUCK_ARROW_MS);
      if (expired) {
        this.renderer.removeVisual(entry.visual);
        this.arrows.splice(index, 1);
      }
    }
  }

  private observeCourse(): void {
    const station = this.course.station;
    if (!station) return;
    if (station.signal === "reach") {
      if (Math.hypot(this.player.x - station.marker[0], this.player.z - station.marker[2]) < COURSE_REACH_M) this.course.observe("reach");
      return;
    }
    if (moveSignals(this.before, this.player).has(station.signal as never)) this.course.observe(station.signal);
  }

  private placeMarker(): void {
    const station = this.course.station;
    const point = station ? this.renderer.screenPoint(station.marker[0], station.marker[1] + 2.2, station.marker[2]) : undefined;
    this.marker.style.display = point ? "block" : "none";
    if (point) { this.marker.style.left = `${point.x}px`; this.marker.style.top = `${point.y}px`; }
  }

  /** The swat station throws slow arrows at the player; a swing at the right moment knocks them away. */
  private stepDrill(dt: number): void {
    const drill = ONBOARDING.swatDrill;
    if (this.course.station?.signal === "swat" && this.simTimeMs >= this.nextThrowAtMs) {
      this.nextThrowAtMs = this.simTimeMs + drill.everyMs;
      const chestY = this.player.y + EYE_STAND * 0.75;
      const dx = this.player.x - drill.from[0], dy = chestY - drill.from[1], dz = this.player.z - drill.from[2], length = Math.hypot(dx, dy, dz) || 1;
      const sim: ArrowSim = { x: drill.from[0], y: drill.from[1], z: drill.from[2], vx: dx / length * drill.speed, vy: dy / length * drill.speed, vz: dz / length * drill.speed, damage: 0, ageMs: 0, stuck: false };
      this.drill.push({ sim, visual: this.renderer.spawnArrowVisual(sim, "scatter") });
    }
    for (let index = this.drill.length - 1; index >= 0; index -= 1) {
      const entry = this.drill[index]!;
      segmentStart.x = entry.sim.x; segmentStart.y = entry.sim.y; segmentStart.z = entry.sim.z;
      stepArrow(entry.sim, campMap, dt, 0);
      segmentEnd.x = entry.sim.x; segmentEnd.y = entry.sim.y; segmentEnd.z = entry.sim.z;
      this.renderer.updateArrowVisual(entry.visual, entry.sim);
      let outcome: CourseSignal | "miss" | "gone" | null = null;
      if (entry.sim.ageMs >= SWAT.minArrowAgeMs && inSwatWindow(this.player.meleeCooldownMs) && swatHits(this.player, segmentStart, segmentEnd)) outcome = "swat";
      else if (Math.hypot(entry.sim.x - this.player.x, entry.sim.y - (this.player.y + EYE_STAND * 0.75), entry.sim.z - this.player.z) < drill.missM) outcome = "miss";
      else if (entry.sim.stuck || entry.sim.ageMs >= drill.lifeMs || this.course.station?.signal !== "swat") outcome = "gone";
      if (!outcome) continue;
      this.renderer.removeVisual(entry.visual);
      this.drill.splice(index, 1);
      if (outcome === "swat") { this.showHitText("SWATTED"); this.sounds.play("dagger"); this.course.observe("swat"); }
      else if (outcome === "miss") this.showHitText("Too late · swing as it arrives");
    }
  }

  private showHitText(text: string): void {
    this.hitText.textContent = text;
    this.hitText.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: JOURNAL_LOOK.hitMarkerMs * 2 });
  }

  private finishCourse(result: CourseResult, container: HTMLElement): void {
    this.courseResult = result;
    this.marker.style.display = "none";
    const first = this.courseMode === "first";
    if (result.skipped && !first) return;
    const panel = document.createElement("section");
    panel.className = "bowdle-course-done";
    panel.dataset.testid = "course-done";
    panel.style.cssText = "position:absolute;left:50%;top:30%;transform:translateX(-50%) rotate(1deg);padding:18px 30px;background:#efe3c6f4;border:4px solid #4a3527;color:#4a3527;font:22px 'Gochi Hand';text-align:center;z-index:10";
    panel.innerHTML = `<h2 style="margin:0;font:34px 'Permanent Marker'">${result.skipped ? "Course skipped" : "Field course complete"}</h2><p data-part="reward">${result.skipped ? "You can replay it from the menu." : "Checking your reward…"}</p><button style="font:22px 'Permanent Marker';padding:8px 18px">${first ? "Play your first match" : "Keep practicing"}</button>`;
    container.append(panel);
    document.exitPointerLock();
    const reward = panel.querySelector<HTMLElement>("[data-part=reward]")!;
    const account = ensureAccount(loadName() || "Explorer");
    panel.querySelector("button")!.addEventListener("click", () => {
      if (first) void account.then(() => { location.search = "?scene=online"; });
      else panel.remove();
    });
    if (result.skipped) return;
    void account.then(async () => {
      this.courseReward = (await completeTutorial()) ?? null;
      reward.textContent = this.courseReward?.granted ? `+${ONBOARDING.courseInk} Ink for finishing` : this.courseReward ? "Reward already collected" : "Go online to collect the Ink reward";
    });
  }

  /** Test hooks for the course. */
  courseState(): CourseState {
    return { active: this.course.active, index: this.course.stationIndex, station: this.course.station?.id ?? "", finished: this.courseResult !== null, skipped: this.courseResult?.skipped ?? false, reward: this.courseReward };
  }
  courseSignal(signal: CourseSignal): void { this.course.observe(signal); }

  private fire(event: FireEvent): void {
    const targets = this.targets.filter((target) => target.alive).map((target) => ({ x: target.x, y: target.pos[1], z: target.pos[2], height: STAND_HEIGHT, crouched: false }));
    const aimed = { ...event, aimRange: aimRangeAlongLook(event, this.player.crouched, campMap, targets) };
    for (const arrow of spawnVolley(aimed, this.player.crouched)) {
      this.arrows.push({ sim: arrow, visual: this.renderer.spawnArrowVisual(arrow, arrow.kind, this.trailId), stuckAtMs: 0, trail: new Float32Array(PRACTICE_TRAIL_POINTS * 3), trailCount: 0, captureStep: 0 });
    }
    this.sounds.play("release");
  }

  private melee(): void {
    this.sounds.play("dagger");
    for (const target of this.targets) {
      if (!target.alive) continue;
      const hit = meleeHit(this.player, { x: target.x, y: target.pos[1], z: target.pos[2], yaw: 0 });
      if (hit) { this.damageTarget(target, hit.damage, false); break; }
    }
  }

  private tick(): void {
    copyState(this.previous, this.player);
    this.sampler.sample(input);
    snapshotOf(this.player, this.before);
    const events = stepPlayer(this.player, input, campMap, { nowMs: this.simTimeMs });
    this.observeCourse();
    for (const event of events) {
      if (event.type === "fire") this.fire(event);
      else this.melee();
    }
    const subDt = 1 / (TICK_HZ * SUBSTEPS);
    for (let step = 0; step < SUBSTEPS; step += 1) { this.stepProjectiles(subDt); this.stepDrill(subDt); }
    this.updateTargets();
    this.simTimeMs += 1000 / TICK_HZ;
  }

  private frame(timeMs: number): void {
    const elapsed = Math.min(100, timeMs - this.lastFrameMs);
    this.lastFrameMs = timeMs;
    this.sampler.frame(elapsed);
    this.accumulatorMs += elapsed;
    const tickMs = 1000 / TICK_HZ;
    while (this.accumulatorMs >= tickMs) { this.tick(); this.accumulatorMs -= tickMs; }
    const alpha = this.accumulatorMs / tickMs;
    this.cameraRig.update(this.renderer.camera, this.previous, this.player, alpha, elapsed);
    this.renderer.setFeel(this.cameraRig.output.hurt, this.cameraRig.output.streaks);
    this.cameraRig.onMove ??= (kind) => this.sounds.play(kind);
    const fraction = drawFraction(this.player.drawMs, fullDrawMs(this.player.arrowSlot));
    this.renderer.setDrawFraction(fraction);
    this.renderer.setLocalTeam(0);
    this.renderer.setLocalArrowKind(ARROW_SLOTS[this.player.arrowSlot] ?? "arrow");
    this.quiver.update(this.player);
    this.renderer.setMeleeSwing(stabProgress(this.player.meleeCooldownMs));
    this.crosshair.update(fraction);
    this.renderer.setGrappleRope("practice", this.player.grappleActive, this.player.x, this.player.y, this.player.z, this.player.grappleX, this.player.grappleY, this.player.grappleZ, ropeSag(this.player, this.player.x, this.player.y, this.player.z), true);
    this.renderer.setGrappleHighlights(this.player.grappleCooldownMs <= 0 && !this.player.grappleActive);
    this.renderer.setDebugMovement(this.player);
    this.placeMarker();
    this.renderer.render(timeMs);
    requestAnimationFrame((time) => this.frame(time));
  }

  fireAt(targetId: string, drawMs: number): PracticeShotResult {
    const target = this.targets.find((candidate) => candidate.id === targetId);
    if (!target) throw new Error(`Unknown target ${targetId}`);
    target.alive = true;
    target.hp = MAX_HP;
    const fraction = drawFraction(drawMs);
    const speed = arrowSpeed(fraction);
    const dx = target.x - this.player.x;
    const dz = target.pos[2] - this.player.z;
    const horizontal = Math.hypot(dx, dz);
    const targetY = headCenterY({ x: target.x, y: target.pos[1], z: target.pos[2], height: STAND_HEIGHT, crouched: false }) + HEAD_RADIUS + ARROW_RADIUS / 2;
    const vertical = targetY - (this.player.y + EYE_STAND);
    // spawnArrow applies the shared gravity correction from the selected aim range.
    const pitch = Math.atan2(vertical, horizontal);
    const yaw = Math.atan2(-dx, -dz);
    const event: FireEvent = { type: "fire", kind: "arrow", x: this.player.x, y: this.player.y, z: this.player.z, yaw, pitch, fraction, speed, damage: bodyDamage(fraction), aimRange: horizontal };
    const shot = spawnArrow(event);
    const trail = new Float32Array(PRACTICE_TRAIL_POINTS * 3); let trailCount = 0;
    const dt = 1 / (TICK_HZ * SUBSTEPS);
    for (let step = 0; step < TICK_HZ * SUBSTEPS * 3; step += 1) {
      segmentStart.x = shot.x; segmentStart.y = shot.y; segmentStart.z = shot.z;
      if (step % SUBSTEPS === 0 && trailCount < PRACTICE_TRAIL_POINTS) { const offset = trailCount++ * 3; trail[offset] = shot.x; trail[offset + 1] = shot.y; trail[offset + 2] = shot.z; }
      stepArrow(shot, campMap, dt);
      segmentEnd.x = shot.x; segmentEnd.y = shot.y; segmentEnd.z = shot.z;
      const hit = sweepArrowVsTarget(segmentStart, segmentEnd, { x: target.x, y: target.pos[1], z: target.pos[2], height: STAND_HEIGHT, crouched: false });
      if (hit) { const result = this.damageTarget(target, shot.damage, hit.kind === "head"); if (result.killed && horizontal > PRACTICE_REPLAY_MIN_M) this.showReplayCard(horizontal, trail, trailCount); return result; }
      if (shot.stuck) break;
    }
    return { headshot: false, killed: false, targetId };
  }
}
