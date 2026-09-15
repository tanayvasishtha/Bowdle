import type { Group } from "three";
import {
  ARROW_GRAVITY,
  ARROW_LIFETIME_MS,
  ARROW_RADIUS,
  EYE_STAND,
  HEAD_MULT,
  HEAD_RADIUS,
  MAX_HP,
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
import type { PlayerInputFrame } from "../../shared/input.ts";
import { practiceTargets, rangeMap, type PracticeTarget } from "../../shared/maps/range.ts";
import type { Vec3 } from "../../shared/math/vec3.ts";
import { spawnArrow, stepArrow, sweepArrowVsTarget, type ArrowSim } from "../../shared/sim/arrows.ts";
import { arrowSpeed, bodyDamage, drawFraction, type FireEvent } from "../../shared/sim/bow.ts";
import { applyDamage } from "../../shared/sim/health.ts";
import { headCenterY } from "../../shared/sim/hitboxes.ts";
import { meleeHit } from "../../shared/sim/melee.ts";
import { createPlayerSim, stepPlayer, type PlayerSim } from "../../shared/sim/movement.ts";
import { JOURNAL_LOOK } from "../render/look.ts";
import { SoundEffects } from "../audio/sfx.ts";
import type { Renderer } from "../render/Renderer.ts";
import { CameraRig } from "./CameraRig.ts";
import type { InputSampler } from "./InputSampler.ts";

type TargetState = PracticeTarget & { x: number; hp: number; alive: boolean; lastDamageAtMs: number; respawnAtMs: number };
type ArrowEntry = { sim: ArrowSim; visual: Group; stuckAtMs: number; trail: Float32Array; trailCount: number; captureStep: number };
export type PracticeShotResult = { headshot: boolean; killed: boolean; targetId: string };

const input: PlayerInputFrame = { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 };
const segmentStart: Vec3 = { x: 0, y: 0, z: 0 };
const segmentEnd: Vec3 = { x: 0, y: 0, z: 0 };
const PRACTICE_TRAIL_POINTS = REPLAY_DURATION_MS * REPLAY_CAPTURE_HZ / 1000;

function copyState(target: PlayerSim, source: PlayerSim): void {
  Object.assign(target, source);
}

function targetState(target: PracticeTarget): TargetState {
  return { ...target, x: target.pos[0], hp: MAX_HP, alive: true, lastDamageAtMs: 0, respawnAtMs: 0 };
}

export class PracticeSession {
  readonly player = createPlayerSim(0, 0, 0);
  private readonly previous = createPlayerSim(0, 0, 0);
  private readonly renderer: Renderer;
  private readonly sampler: InputSampler;
  private readonly cameraRig = new CameraRig();
  private readonly sounds = new SoundEffects();
  private readonly targets = practiceTargets.map(targetState);
  private readonly arrows: ArrowEntry[] = [];
  private readonly crosshair: HTMLDivElement;
  private readonly hitText: HTMLDivElement;
  private readonly replayCard: HTMLDivElement;
  private accumulatorMs = 0;
  private lastFrameMs = performance.now();
  private simTimeMs = 0;

  constructor(renderer: Renderer, sampler: InputSampler, container: HTMLElement) {
    this.renderer = renderer;
    this.sampler = sampler;
    this.crosshair = document.createElement("div");
    this.crosshair.id = "crosshair";
    this.crosshair.style.cssText = "position:absolute;left:50%;top:50%;width:36px;height:36px;border:3px solid #4a3527;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none";
    this.hitText = document.createElement("div");
    this.hitText.id = "hit-marker";
    this.hitText.style.cssText = "position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);font:34px 'Permanent Marker',cursive;color:#d2531f;text-shadow:1px 1px #efe3c6;pointer-events:none";
    this.replayCard = document.createElement("div");
    this.replayCard.className = "bowdle-practice-replay";
    this.replayCard.style.cssText = "display:none;position:absolute;right:24px;bottom:24px;width:320px;height:180px;border:4px solid #4a3527;background-size:cover;background-position:center;color:#d2531f;font:24px 'Permanent Marker';padding:8px;box-sizing:border-box;pointer-events:none";
    container.append(this.crosshair, this.hitText, this.replayCard);
  }

  start(): void {
    requestAnimationFrame((time) => this.frame(time));
  }

  private updateTargets(): void {
    const width = PRACTICE_RAIL_HALF_WIDTH;
    for (const target of this.targets) {
      if (!target.alive && this.simTimeMs >= target.respawnAtMs) {
        target.alive = true;
        target.hp = MAX_HP;
      }
      if (target.speed > 0) {
        const distance = (this.simTimeMs / 1000 * target.speed) % (width * 4);
        target.x = distance <= width * 2 ? -width + distance : width * 3 - distance;
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
        const arrowStep = stepArrow(entry.sim, rangeMap, dt);
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

  private fire(event: FireEvent): void {
    const arrow = spawnArrow(event, this.player.crouched);
    this.arrows.push({ sim: arrow, visual: this.renderer.spawnArrowVisual(arrow), stuckAtMs: 0, trail: new Float32Array(PRACTICE_TRAIL_POINTS * 3), trailCount: 0, captureStep: 0 });
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
    const events = stepPlayer(this.player, input, rangeMap, { nowMs: this.simTimeMs });
    for (const event of events) {
      if (event.type === "fire") this.fire(event);
      else this.melee();
    }
    const subDt = 1 / (TICK_HZ * SUBSTEPS);
    for (let step = 0; step < SUBSTEPS; step += 1) this.stepProjectiles(subDt);
    this.updateTargets();
    this.simTimeMs += 1000 / TICK_HZ;
  }

  private frame(timeMs: number): void {
    const elapsed = Math.min(100, timeMs - this.lastFrameMs);
    this.lastFrameMs = timeMs;
    this.accumulatorMs += elapsed;
    const tickMs = 1000 / TICK_HZ;
    while (this.accumulatorMs >= tickMs) { this.tick(); this.accumulatorMs -= tickMs; }
    const alpha = this.accumulatorMs / tickMs;
    this.cameraRig.update(this.renderer.camera, this.previous, this.player, alpha, elapsed);
    const fraction = drawFraction(this.player.drawMs);
    this.renderer.setDrawFraction(fraction);
    const radius = 18 - fraction * 12;
    this.crosshair.style.width = `${radius * 2}px`;
    this.crosshair.style.height = `${radius * 2}px`;
    this.renderer.setDebugMovement(this.player);
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
    const speedSquared = speed * speed;
    const discriminant = speedSquared * speedSquared - ARROW_GRAVITY * (ARROW_GRAVITY * horizontal * horizontal + 2 * vertical * speedSquared);
    const pitch = Math.atan((speedSquared - Math.sqrt(Math.max(0, discriminant))) / (ARROW_GRAVITY * horizontal));
    const yaw = Math.atan2(-dx, -dz);
    const event: FireEvent = { type: "fire", x: this.player.x, y: this.player.y, z: this.player.z, yaw, pitch, fraction, speed, damage: bodyDamage(fraction) };
    const shot = spawnArrow(event);
    const trail = new Float32Array(PRACTICE_TRAIL_POINTS * 3); let trailCount = 0;
    const dt = 1 / (TICK_HZ * SUBSTEPS);
    for (let step = 0; step < TICK_HZ * SUBSTEPS * 3; step += 1) {
      segmentStart.x = shot.x; segmentStart.y = shot.y; segmentStart.z = shot.z;
      if (step % SUBSTEPS === 0 && trailCount < PRACTICE_TRAIL_POINTS) { const offset = trailCount++ * 3; trail[offset] = shot.x; trail[offset + 1] = shot.y; trail[offset + 2] = shot.z; }
      stepArrow(shot, rangeMap, dt);
      segmentEnd.x = shot.x; segmentEnd.y = shot.y; segmentEnd.z = shot.z;
      const hit = sweepArrowVsTarget(segmentStart, segmentEnd, { x: target.x, y: target.pos[1], z: target.pos[2], height: STAND_HEIGHT, crouched: false });
      if (hit) { const result = this.damageTarget(target, shot.damage, hit.kind === "head"); if (result.killed && horizontal > PRACTICE_REPLAY_MIN_M) this.showReplayCard(horizontal, trail, trailCount); return result; }
      if (shot.stuck) break;
    }
    return { headshot: false, killed: false, targetId };
  }
}
