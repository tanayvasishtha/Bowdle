import { Group, InstancedMesh, Matrix4, Quaternion, Vector3, type PerspectiveCamera } from "three";
import { PROP_HIDE_DISTANCE } from "../../../shared/constants.ts";
import type { Prop, PropKind } from "../../../shared/maps/types.ts";
import { mulberry32 } from "../../../shared/math/rng.ts";
import { InkMaterial } from "../InkMaterial.ts";
import { MATERIAL_ID } from "../palette.ts";
import { PROP_BUILDERS } from "./builders.ts";

type Batch = { kind: PropKind; mesh: InstancedMesh; matrices: readonly Matrix4[] };
const position = new Vector3(); const scale = new Vector3(); const rotation = new Quaternion(); const matrix = new Matrix4(); const up = new Vector3(0, 1, 0);

export class PropsRenderer extends Group {
  private readonly batches: Batch[] = [];

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

  update(camera: PerspectiveCamera, timeMs: number): void {
    for (const batch of this.batches) {
      let visible = 0;
      for (let index = 0; index < batch.matrices.length; index += 1) {
        const base = batch.matrices[index]!, values = base.elements;
        if (Math.hypot(values[12]! - camera.position.x, values[13]! - camera.position.y, values[14]! - camera.position.z) > PROP_HIDE_DISTANCE) continue;
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
