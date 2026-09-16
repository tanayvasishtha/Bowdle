import { ConeGeometry, CylinderGeometry, Group, Mesh, QuadraticBezierCurve3, SphereGeometry, TubeGeometry, Vector3 } from "three";
import { InkMaterial } from "../InkMaterial.ts";
import { MATERIAL_ID } from "../palette.ts";

const up = new Vector3(0, 1, 0);
const scratch = new Vector3();
const TIP_TOP = new Vector3(0, 0.8, 0);
const TIP_BOTTOM = new Vector3(0, -0.8, 0);
const NOCK_REST = new Vector3(-0.02, 0, 0.05);
const PULL = new Vector3(-0.1, 0, 0.36);
const GRIP = new Vector3(0.33, 0, -0.07);
const ARROW_TIP = new Vector3(0.42, 0.02, -0.78);

/** A unit cylinder stretched between two points, reused every frame without allocating. */
function stretch(mesh: Mesh, from: Vector3, to: Vector3, radius: number): void {
  scratch.subVectors(to, from);
  const length = scratch.length();
  mesh.position.copy(from).addScaledVector(scratch, 0.5);
  mesh.quaternion.setFromUnitVectors(up, scratch.normalize());
  mesh.scale.set(radius, length, radius);
}

/** First-person arms, bow, nocked arrow and dagger, drawn in the viewmodel pass. */
export class Viewmodel extends Group {
  private readonly bow = new Group();
  private readonly sleeveMaterial = new InkMaterial(MATERIAL_ID.teamSun);
  private readonly stringTop: Mesh;
  private readonly stringBottom: Mesh;
  private readonly rightHand: Mesh;
  private readonly rightSleeve: Mesh;
  private readonly arrowShaft: Mesh;
  private readonly arrowHead: Mesh;
  private readonly dagger = new Group();
  private readonly nock = new Vector3();
  private readonly sleeveEnd = new Vector3();
  private readonly arrowEnd = new Vector3();

  constructor() {
    super();
    const wood = new InkMaterial(MATERIAL_ID.wood);
    const rope = new InkMaterial(MATERIAL_ID.rope);
    const skin = new InkMaterial(MATERIAL_ID.canvas);
    const gold = new InkMaterial(MATERIAL_ID.gold);
    const unit = new CylinderGeometry(1, 1, 1, 6);

    const curve = new QuadraticBezierCurve3(TIP_BOTTOM, new Vector3(0.5, 0, -0.15), TIP_TOP);
    this.bow.add(new Mesh(new TubeGeometry(curve, 18, 0.022, 5, false), wood));
    const grip = new Mesh(new CylinderGeometry(0.032, 0.032, 0.2, 7), rope);
    grip.position.copy(GRIP);
    const leftHand = new Mesh(new SphereGeometry(0.075, 10, 7), skin);
    leftHand.position.copy(GRIP).add(new Vector3(0.02, -0.01, 0.03));
    const leftSleeve = new Mesh(unit, this.sleeveMaterial);
    stretch(leftSleeve, new Vector3(0.38, -0.06, 0.02), new Vector3(0.95, -1.0, 0.6), 0.08);
    this.stringTop = new Mesh(unit, rope);
    this.stringBottom = new Mesh(unit, rope);
    this.rightHand = new Mesh(new SphereGeometry(0.068, 10, 7), skin);
    this.rightSleeve = new Mesh(unit, this.sleeveMaterial);
    this.arrowShaft = new Mesh(unit, wood);
    this.arrowHead = new Mesh(new ConeGeometry(0.03, 0.09, 6), gold);
    this.bow.add(grip, leftHand, leftSleeve, this.stringTop, this.stringBottom, this.rightHand, this.rightSleeve, this.arrowShaft, this.arrowHead);
    this.bow.position.set(0.55, -0.3, -1.1);
    this.bow.rotation.z = 0.12;

    const blade = new Mesh(new ConeGeometry(0.03, 0.34, 6), gold);
    blade.rotation.x = -Math.PI / 2;
    blade.position.z = -0.2;
    const hilt = new Mesh(new CylinderGeometry(0.025, 0.025, 0.12, 6), wood);
    hilt.rotation.x = Math.PI / 2;
    const hand = new Mesh(new SphereGeometry(0.07, 10, 7), skin);
    const sleeve = new Mesh(unit, this.sleeveMaterial);
    stretch(sleeve, new Vector3(0, -0.02, 0.05), new Vector3(0.2, -0.5, 0.7), 0.075);
    this.dagger.add(blade, hilt, hand, sleeve);
    this.dagger.visible = false;

    this.add(this.bow, this.dagger);
    this.setDrawFraction(0);
  }

  setTeam(team: number): void {
    this.sleeveMaterial.uniforms.materialId!.value = team === 0 ? MATERIAL_ID.teamSun : MATERIAL_ID.teamMoon;
  }

  setDrawFraction(fraction: number): void {
    const pull = Math.min(1, Math.max(0, fraction));
    this.nock.copy(NOCK_REST).addScaledVector(PULL, pull);
    stretch(this.stringTop, TIP_TOP, this.nock, 0.007);
    stretch(this.stringBottom, this.nock, TIP_BOTTOM, 0.007);
    this.rightHand.position.copy(this.nock);
    this.sleeveEnd.set(this.nock.x - 0.45, this.nock.y - 0.9, this.nock.z + 0.5);
    stretch(this.rightSleeve, this.nock, this.sleeveEnd, 0.075);
    const drawn = pull > 0;
    this.arrowShaft.visible = drawn;
    this.arrowHead.visible = drawn;
    if (drawn) {
      this.arrowEnd.copy(ARROW_TIP);
      stretch(this.arrowShaft, this.nock, this.arrowEnd, 0.011);
      this.arrowHead.position.copy(this.arrowEnd);
      this.arrowHead.quaternion.copy(this.arrowShaft.quaternion);
    }
  }

  /** t runs from 0 to 1 over one stab; 0 means no stab. */
  setStab(t: number): void {
    const stabbing = t > 0;
    this.dagger.visible = stabbing;
    this.bow.visible = !stabbing;
    if (!stabbing) return;
    const thrust = Math.sin(Math.min(1, t) * Math.PI);
    this.dagger.position.set(0.28 - thrust * 0.15, -0.32 + thrust * 0.1, -0.55 - thrust * 0.45);
  }
}
