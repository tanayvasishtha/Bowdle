import type { PerspectiveCamera } from "three";
import { AIM_FOV, AIM_FOV_MS, CAMERA_CROUCH_MS, DEFAULT_FOV, EYE_CROUCH, EYE_STAND } from "../../shared/constants.ts";
import { BTN } from "../../shared/input.ts";
import type { PlayerSim } from "../../shared/sim/movement.ts";

export class CameraRig {
  private eyeHeight = EYE_STAND;
  private fov = DEFAULT_FOV;

  update(camera: PerspectiveCamera, previous: PlayerSim, current: PlayerSim, alpha: number, dtMs: number): void {
    const targetEye = current.crouched ? EYE_CROUCH : EYE_STAND;
    const eyeStep = Math.min(1, dtMs / CAMERA_CROUCH_MS);
    this.eyeHeight += (targetEye - this.eyeHeight) * eyeStep;
    const targetFov = (current.prevButtons & BTN.AIM) !== 0 ? AIM_FOV : DEFAULT_FOV;
    const fovStep = Math.min(1, dtMs / AIM_FOV_MS);
    this.fov += (targetFov - this.fov) * fovStep;
    camera.position.set(
      previous.x + (current.x - previous.x) * alpha,
      previous.y + (current.y - previous.y) * alpha + this.eyeHeight,
      previous.z + (current.z - previous.z) * alpha,
    );
    camera.rotation.set(current.pitch, current.yaw, 0);
    if (Math.abs(camera.fov - this.fov) > 0.01) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
  }
}
