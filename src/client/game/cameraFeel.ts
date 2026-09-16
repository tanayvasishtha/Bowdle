import { CAMERA_FEEL as F } from "../render/look.ts";

export type FeelInput = {
  /** Horizontal speed in m/s. */
  speed: number;
  grounded: boolean;
  sliding: boolean;
  /** Sideways velocity divided by run speed, -1 (left) to 1 (right). */
  strafe: number;
  dtMs: number;
  reduceMotion: boolean;
};

export type FeelOutput = { fovOffset: number; offsetX: number; offsetY: number; rollDeg: number; shakePitchDeg: number; shakeYawDeg: number; hurt: number; streaks: number };
export type KickKind = "jump" | "doubleJump" | "dodge" | "slide";

const KICKS: Record<KickKind, number> = { jump: F.kickJump, doubleJump: F.kickDoubleJump, dodge: F.kickDodge, slide: F.kickSlide };
const ease = (current: number, target: number, rate: number, dtS: number): number => current + (target - current) * (1 - Math.exp(-rate * dtS));
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
/** Shake below this is treated as settled. */
const SHAKE_FLOOR = 0.002;

/**
 * Pure camera feel: speed FOV, bob, roll, landing dip, kicks, shake, hurt and speed streaks.
 * Knows nothing about three.js so it can be tested alone. Reduce motion zeroes every motion offset.
 */
export class CameraFeel {
  private speedFov = 0;
  private kick = 0;
  private bobPhase = 0;
  private bobAmount = 0;
  private roll = 0;
  private dip = 0;
  private dipMs = Number.POSITIVE_INFINITY;
  private shake = 0;
  private shakeTime = 0;
  private hurtMs = Number.POSITIVE_INFINITY;
  private hurtStrength = 0;
  readonly out: FeelOutput = { fovOffset: 0, offsetX: 0, offsetY: 0, rollDeg: 0, shakePitchDeg: 0, shakeYawDeg: 0, hurt: 0, streaks: 0 };

  kickFov(kind: KickKind): void { this.kick = Math.max(this.kick, KICKS[kind]); }

  land(fallSpeed: number): void {
    const speed = Math.max(0, fallSpeed);
    this.dip = Math.min(F.dipMax, speed * F.dipPerMps);
    this.dipMs = 0;
    if (speed > F.shakeHardLandingMps) this.addShake((speed - F.shakeHardLandingMps + 1) * F.shakeLandingPerMps);
  }

  hurt(damage: number): void {
    this.hurtMs = 0;
    this.hurtStrength = clamp(damage / 100, 0, 1);
    this.addShake(this.hurtStrength * F.shakeHurtScale);
  }

  addShake(amount: number): void { this.shake = Math.min(F.shakeMax, this.shake + Math.max(0, amount)); }

  update(input: FeelInput): FeelOutput {
    const dtS = Math.max(0, input.dtMs) / 1000;
    const out = this.out;
    this.speedFov = ease(this.speedFov, clamp((input.speed - F.speedFovStart) * F.speedFovPerMps, 0, F.speedFovMax), F.fovEase, dtS);
    // Every kick decays at the same rate, so the largest one lasts kickDecayMs.
    this.kick = Math.max(0, this.kick - (F.kickDodge / F.kickDecayMs) * input.dtMs);
    const bobbing = input.grounded && !input.sliding && input.speed > 0.5;
    this.bobAmount = bobbing ? ease(this.bobAmount, clamp(input.speed / F.bobScaleSpeed, 0, F.bobScaleMax), F.bobEase, dtS) : 0;
    this.bobPhase += dtS * (F.bobBaseHz + input.speed * F.bobHzPerMps) * Math.PI * 2;
    this.roll = ease(this.roll, -clamp(input.strafe, -1, 1) * F.strafeRollDeg + (input.sliding ? F.slideRollDeg : 0), F.rollEase, dtS);
    this.dipMs += input.dtMs;
    const dipLeft = this.dipMs >= F.dipRecoverMs ? 0 : this.dip * (1 - this.dipMs / F.dipRecoverMs);
    this.shake *= Math.exp(-F.shakeDecay * dtS);
    if (this.shake < SHAKE_FLOOR) this.shake = 0;
    this.shakeTime += dtS;
    this.hurtMs += input.dtMs;
    out.hurt = this.hurtMs >= F.hurtMs ? 0 : F.hurtAlpha * this.hurtStrength * (1 - this.hurtMs / F.hurtMs);
    if (input.reduceMotion) {
      out.fovOffset = 0; out.offsetX = 0; out.offsetY = 0; out.rollDeg = 0; out.shakePitchDeg = 0; out.shakeYawDeg = 0; out.streaks = 0;
      return out;
    }
    out.fovOffset = this.speedFov + this.kick;
    out.offsetY = Math.abs(Math.sin(this.bobPhase)) * F.bobVertical * this.bobAmount - dipLeft;
    out.offsetX = Math.cos(this.bobPhase * 0.5) * F.bobLateral * this.bobAmount;
    out.rollDeg = this.roll;
    const wobble = this.shakeTime * F.shakeHz;
    out.shakePitchDeg = Math.sin(wobble * 1.3) * this.shake * F.shakeAmplitudeDeg;
    out.shakeYawDeg = Math.cos(wobble) * this.shake * F.shakeAmplitudeDeg;
    out.streaks = clamp((input.speed - F.streakStartMps) / (F.streakFullMps - F.streakStartMps), 0, 1) * F.streakAlpha;
    return out;
  }
}
