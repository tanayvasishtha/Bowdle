import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, OctahedronGeometry, QuadraticBezierCurve3, SphereGeometry, TubeGeometry, Vector3 } from "three";
import { bowSkin } from "../../../shared/cosmetics.ts";
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
  private readonly limbMaterial = new InkMaterial(MATERIAL_ID.wood);
  private readonly gripMaterial = new InkMaterial(MATERIAL_ID.rope);
  private readonly ornament = new Group();
  private bowSkinId = "bow.default";
  private readonly stringTop: Mesh;
  private readonly stringBottom: Mesh;
  private readonly rightHand: Mesh;
  private readonly rightSleeve: Mesh;
  private readonly arrowShaft: Mesh;
  private readonly arrowHead: Mesh;
  /** The two extra heads of a scatter volley, fanned beside the main one. */
  private readonly scatterHeads: Mesh[] = [];
  private readonly headMaterials: Record<"arrow" | "scatter" | "tether", InkMaterial>;
  private readonly shaftMaterials: Record<"arrow" | "scatter" | "tether", InkMaterial>;
  private arrowKind: "arrow" | "scatter" | "tether" = "arrow";
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
    this.bow.add(new Mesh(new TubeGeometry(curve, 18, 0.022, 5, false), this.limbMaterial), this.ornament);
    const grip = new Mesh(new CylinderGeometry(0.032, 0.032, 0.2, 7), this.gripMaterial);
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
    const hazard = new InkMaterial(MATERIAL_ID.hazard);
    this.headMaterials = { arrow: gold, scatter: hazard, tether: rope };
    this.shaftMaterials = { arrow: wood, scatter: wood, tether: rope };
    for (let index = 0; index < 2; index += 1) { const head = new Mesh(new ConeGeometry(0.022, 0.07, 6), hazard); head.visible = false; this.scatterHeads.push(head); }
    this.bow.add(grip, leftHand, leftSleeve, this.stringTop, this.stringBottom, this.rightHand, this.rightSleeve, this.arrowShaft, this.arrowHead, ...this.scatterHeads);
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

  /** A negative team is the neutral Free for All sleeve. */
  setTeam(team: number): void {
    this.sleeveMaterial.uniforms.materialId!.value = team < 0 ? MATERIAL_ID.canvas : team === 0 ? MATERIAL_ID.teamSun : MATERIAL_ID.teamMoon;
  }

  /** Repaints the first-person bow and swaps its tip ornaments for the chosen skin. */
  setBowSkin(id: string): void {
    const skin = bowSkin(id);
    if (skin.id === this.bowSkinId) return;
    this.bowSkinId = skin.id;
    this.limbMaterial.uniforms.materialId!.value = MATERIAL_ID[skin.paint];
    this.gripMaterial.uniforms.materialId!.value = MATERIAL_ID[skin.grip];
    for (const child of [...this.ornament.children]) { this.ornament.remove(child); (child as Mesh).geometry.dispose(); }
    const add = (mesh: Mesh, x: number, y: number, z: number, rz = 0): void => { mesh.position.set(x, y, z); mesh.rotation.z = rz; this.ornament.add(mesh); };
    for (const sign of [1, -1]) {
      const tip = sign > 0 ? TIP_TOP : TIP_BOTTOM;
      switch (skin.ornament) {
        case "leaves": add(new Mesh(new ConeGeometry(0.06, 0.18, 5).scale(1, 1, 0.35), this.limbMaterial), tip.x + 0.03, tip.y + sign * 0.06, tip.z, sign > 0 ? 0 : Math.PI); break;
        case "prongs": add(new Mesh(new ConeGeometry(0.02, 0.16, 6), this.limbMaterial), tip.x + 0.05, tip.y + sign * 0.03, tip.z, sign * -0.8); add(new Mesh(new ConeGeometry(0.02, 0.16, 6), this.limbMaterial), tip.x - 0.04, tip.y + sign * 0.05, tip.z, sign * 0.6); break;
        case "fins": add(new Mesh(new BoxGeometry(0.12, 0.14, 0.012), this.limbMaterial), tip.x + 0.05, tip.y - sign * 0.04, tip.z); break;
        case "crystals": add(new Mesh(new OctahedronGeometry(0.05).scale(1, 1.8, 1), this.gripMaterial), tip.x, tip.y + sign * 0.08, tip.z); break;
        case "sunDisc": if (sign > 0) add(new Mesh(new CylinderGeometry(0.1, 0.1, 0.02, 14).rotateZ(Math.PI / 2), this.gripMaterial), GRIP.x + 0.07, GRIP.y, GRIP.z); break;
        case "none": break;
      }
    }
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
    for (const head of this.scatterHeads) head.visible = drawn && this.arrowKind === "scatter";
    if (drawn) {
      this.arrowEnd.copy(ARROW_TIP);
      stretch(this.arrowShaft, this.nock, this.arrowEnd, 0.011);
      this.arrowHead.position.copy(this.arrowEnd);
      this.arrowHead.quaternion.copy(this.arrowShaft.quaternion);
      for (let index = 0; index < this.scatterHeads.length; index += 1) {
        const head = this.scatterHeads[index]!;
        head.position.copy(this.arrowEnd); head.position.y += index === 0 ? 0.05 : -0.05; head.position.z += 0.05;
        head.quaternion.copy(this.arrowShaft.quaternion);
      }
    }
  }

  /** The nocked arrow shows the selected quiver slot: gold broadhead, three red scatter heads, or a rope tether. */
  setArrowKind(kind: "arrow" | "scatter" | "tether"): void {
    if (kind === this.arrowKind) return;
    this.arrowKind = kind;
    this.arrowHead.material = this.headMaterials[kind];
    this.arrowShaft.material = this.shaftMaterials[kind];
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
