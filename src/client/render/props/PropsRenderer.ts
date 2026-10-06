import { Group, InstancedMesh, Matrix4, Quaternion, Vector3, type PerspectiveCamera } from "three";
import { PROP_HIDE_DISTANCE } from "../../../shared/constants.ts";
import type { Prop, PropKind } from "../../../shared/maps/types.ts";
import { mulberry32 } from "../../../shared/math/rng.ts";
import { InkMaterial } from "../InkMaterial.ts";
import { MATERIAL_ID } from "../palette.ts";
import { PROP_BUILDERS } from "./builders.ts";

type Batch = { kind: PropKind; mesh: InstancedMesh; matrices: readonly Matrix4[] };
const position = new Vector3(); const scale = new Vector3(); const rotation = new Quaternion(); const matrix = new Matrix4(); const up = new Vector3(0, 1, 0);
/** Kinds whose instances move every frame (flicker, sway, flow); everything else only changes when the culling does. */
const ANIMATED: ReadonlySet<PropKind> = new Set(["torch", "brazier", "lantern", "ropeBridge", "zipRope", "waterfall", "waterSurface"]);
/** How far the camera moves before still props are culled again. Small against the hide distance, so nothing visibly pops. */
const RECULL_M = 1;
/** How far the view turns (cosine of about 8 degrees) before still props are culled again. */
const RECULL_TURN_COS = Math.cos(0.14);
/**
 * Small ground clumps vanish at this share of the hide distance. Home Grove has 3,638 grass patches at 196 triangles
 * each, and drawing them out to the full distance put 290,000 triangles of grass on screen, well over the 300,000
 * budget for the whole frame.
 */
const GROUND_CLUMP_SHARE = 0.6;
const GROUND_CLUMPS: ReadonlySet<PropKind> = new Set(["grassPatch", "fernClump"]);
/** Props this far behind the camera plane still draw, for big props whose middle is behind but whose edge is in view. */
const BEHIND_MARGIN_M = 8;
const forward = new Vector3();

export class PropsRenderer extends Group {
  /** Max camera distance for props; Low preset tightens this (G13). */
  hideDistance = PROP_HIDE_DISTANCE;
  private readonly batches: Batch[] = [];
  private readonly culledAt = new Vector3(Number.POSITIVE_INFINITY, 0, 0);
  private readonly culledForward = new Vector3();
  private culledHideDistance = -1;

  constructor(props: readonly Prop[]) {
    super();
    for (const kind of Object.keys(PROP_BUILDERS) as PropKind[]) {
      const matching = props.filter((prop) => prop.kind === kind); if (matching.length === 0) continue;
      const built = PROP_BUILDERS[kind](matching[0]!.seed);
      const mesh = new InstancedMesh(built.geometry, built.materials.map((name) => new InkMaterial(MATERIAL_ID[name])), matching.length);
      const matrices: Matrix4[] = [];
      for (let index = 0; index < matching.length; index += 1) {
        const prop = matching[index]!, rng = mulberry32(prop.seed), base = new Matrix4();
        position.set(...prop.pos); rotation.setFromAxisAngle(up, prop.yaw + (rng() - 0.5) * 0.08); scale.setScalar(prop.scale * (0.96 + rng() * 0.08));
        base.compose(position, rotation, scale); matrices.push(base); mesh.setMatrixAt(index, base);
      }
      mesh.instanceMatrix.needsUpdate = true; this.batches.push({ kind, mesh, matrices }); this.add(mesh);
    }
  }

  /**
   * Distance-culls the instances and animates the moving kinds. Still props (thousands of grass patches and trees) are
   * culled and uploaded again only after the camera moves RECULL_M or the hide distance changes; re-uploading all of
   * them every frame cost a quarter megabyte of buffer upload per frame on Home Grove.
   */
  update(camera: PerspectiveCamera, timeMs: number): void {
    camera.getWorldDirection(forward);
    const recull = camera.position.distanceToSquared(this.culledAt) > RECULL_M * RECULL_M || forward.dot(this.culledForward) < RECULL_TURN_COS || this.culledHideDistance !== this.hideDistance;
    if (recull) { this.culledAt.copy(camera.position); this.culledForward.copy(forward); this.culledHideDistance = this.hideDistance; }
    for (const batch of this.batches) {
      if (!recull && !ANIMATED.has(batch.kind)) continue;
      const hide = this.hideDistance * (GROUND_CLUMPS.has(batch.kind) ? GROUND_CLUMP_SHARE : 1), hideSquared = hide * hide;
      let visible = 0;
      for (let index = 0; index < batch.matrices.length; index += 1) {
        const base = batch.matrices[index]!, values = base.elements;
        const dx = values[12]! - camera.position.x, dy = values[13]! - camera.position.y, dz = values[14]! - camera.position.z;
        if (dx * dx + dy * dy + dz * dz > hideSquared) continue;
        if (dx * forward.x + dy * forward.y + dz * forward.z < -BEHIND_MARGIN_M) continue;
        matrix.copy(base);
        const animated = matrix.elements;
        if (batch.kind === "torch" || batch.kind === "brazier" || batch.kind === "lantern") animated[5] *= 0.94 + Math.sin(timeMs * 0.012 + index) * 0.06;
        else if (batch.kind === "ropeBridge" || batch.kind === "zipRope") animated[13] += Math.sin(timeMs * 0.0017 + index) * 0.08;
        else if (batch.kind === "waterfall") animated[13] -= timeMs % 900 / 900 * 0.08;
        else if (batch.kind === "waterSurface") animated[13] += Math.sin(timeMs * 0.002 + index) * 0.035;
        batch.mesh.setMatrixAt(visible, matrix); visible += 1;
      }
      batch.mesh.count = visible; batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
