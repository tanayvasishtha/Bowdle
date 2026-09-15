import { TICK_HZ, ZIP_SPEED } from "../../shared/constants.ts";
import type { PlayerInputFrame } from "../../shared/input.ts";
import { notebookMap } from "../../shared/maps/notebook.ts";
import type { MapData } from "../../shared/maps/types.ts";
import { createPlayerSim, stepPlayer, type PlayerSim } from "../../shared/sim/movement.ts";
import type { Renderer } from "../render/Renderer.ts";
import { CameraRig } from "./CameraRig.ts";
import type { InputSampler } from "./InputSampler.ts";

const input: PlayerInputFrame = { moveX: 0, moveZ: 0, yaw: -Math.PI / 2, pitch: 0, buttons: 0 };

function copyState(target: PlayerSim, source: PlayerSim): void {
  Object.assign(target, source);
}

export class OfflineSession {
  readonly player: PlayerSim;
  private readonly renderer: Renderer;
  private readonly sampler: InputSampler;
  private readonly previous: PlayerSim;
  private readonly cameraRig = new CameraRig();
  private readonly map: MapData;
  private accumulatorMs = 0;
  private lastFrameMs = performance.now();
  private simTimeMs = 0;

  constructor(renderer: Renderer, sampler: InputSampler, map: MapData = notebookMap) {
    this.renderer = renderer;
    this.sampler = sampler;
    this.map = map;
    const spawn = map.spawns.sun[0]!;
    this.player = createPlayerSim(spawn.pos[0], spawn.pos[1], spawn.pos[2]);
    this.player.yaw = spawn.yaw;
    this.previous = createPlayerSim(spawn.pos[0], spawn.pos[1], spawn.pos[2]);
    this.previous.yaw = spawn.yaw;
  }

  start(): void {
    requestAnimationFrame((time) => this.frame(time));
  }

  private frame(timeMs: number): void {
    const elapsed = Math.min(100, timeMs - this.lastFrameMs);
    this.lastFrameMs = timeMs;
    this.accumulatorMs += elapsed;
    const tickMs = 1000 / TICK_HZ;
    while (this.accumulatorMs >= tickMs) {
      copyState(this.previous, this.player);
      this.sampler.sample(input);
      stepPlayer(this.player, input, this.map, { nowMs: this.simTimeMs });
      this.simTimeMs += tickMs;
      this.accumulatorMs -= tickMs;
    }
    const alpha = this.accumulatorMs / tickMs;
    this.cameraRig.update(this.renderer.camera, this.previous, this.player, alpha, elapsed);
    this.renderer.setDebugMovement(this.player);
    this.renderer.setZipAudio(this.player.zipId ? ZIP_SPEED : 0);
    this.renderer.render(timeMs);
    requestAnimationFrame((time) => this.frame(time));
  }
}
