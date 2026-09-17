import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  BoxGeometry,
  type Scene,
} from "three";
import { anchorPosAt } from "../../shared/maps/kit.ts";
import type { MapData } from "../../shared/maps/types.ts";

/** Draws map-kit anchors, geysers, herbs and breakable planks. */
export class MapKitView {
  private readonly root = new Group();
  private readonly anchors: Mesh[] = [];
  private geysers: Mesh[] = [];
  private readonly breakables = new Map<string, Mesh>();
  private map: MapData | null = null;

  constructor(scene: Scene) {
    scene.add(this.root);
  }

  setMap(map: MapData): void {
    this.clear();
    this.map = map;
    const gold = new MeshBasicMaterial({ color: 0xe3b23c });
    const spray = new MeshBasicMaterial({ color: 0x7ec8c8, transparent: true, opacity: 0.45 });
    const herbMat = new MeshBasicMaterial({ color: 0x5e8c3a });
    const wood = new MeshBasicMaterial({ color: 0x9c6b3f });
    for (const _anchor of map.anchors ?? []) {
      const ring = new Mesh(new CylinderGeometry(0.35, 0.35, 0.08, 12), gold);
      const chain = new Mesh(new CylinderGeometry(0.05, 0.05, 1.2, 6), gold.clone());
      chain.position.y = -0.6;
      ring.add(chain);
      this.anchors.push(ring);
      this.root.add(ring);
    }
    this.geysers = [];
    for (const geyser of map.geysers ?? []) {
      const plume = new Mesh(new CylinderGeometry(0.15, geyser.radius * 0.9, 2.4, 10), spray.clone());
      plume.position.set(geyser.pos[0], geyser.pos[1] + 1.2, geyser.pos[2]);
      plume.userData.baseY = geyser.pos[1] + 1.2;
      this.geysers.push(plume);
      this.root.add(plume);
    }
    for (const herb of map.herbs ?? []) {
      const leaf = new Mesh(new BoxGeometry(0.4, 0.5, 0.4), herbMat);
      leaf.position.set(herb.pos[0], herb.pos[1] + 0.35, herb.pos[2]);
      leaf.name = `herb:${herb.id}`;
      this.root.add(leaf);
    }
    for (const item of map.breakables ?? []) {
      const size = [
        item.box.max[0] - item.box.min[0],
        item.box.max[1] - item.box.min[1],
        item.box.max[2] - item.box.min[2],
      ] as const;
      const mesh = new Mesh(new BoxGeometry(size[0], size[1], size[2]), wood.clone());
      mesh.position.set(
        (item.box.min[0] + item.box.max[0]) / 2,
        (item.box.min[1] + item.box.max[1]) / 2,
        (item.box.min[2] + item.box.max[2]) / 2,
      );
      // Crack stage material: darker when damaged (hp ratio stored in userData).
      mesh.userData.maxHp = item.hp;
      this.breakables.set(item.id, mesh);
      this.root.add(mesh);
    }
  }

  update(matchTimeMs: number, breakableBroken: ReadonlyMap<string, boolean>, herbReady: ReadonlyMap<string, boolean>, breakableHp?: ReadonlyMap<string, number>): void {
    if (!this.map) return;
    const list = this.map.anchors ?? [];
    for (let index = 0; index < list.length; index += 1) {
      const [x, y, z] = anchorPosAt(list[index]!, matchTimeMs);
      const ring = this.anchors[index];
      if (ring) ring.position.set(x, y, z);
    }
    for (const plume of this.geysers) {
      const base = Number(plume.userData.baseY ?? plume.position.y);
      plume.position.y = base + 0.15 * Math.sin(matchTimeMs * 0.01);
      plume.scale.setScalar(1 + 0.08 * Math.sin(matchTimeMs * 0.013));
    }
    for (const [id, mesh] of this.breakables) {
      const broken = breakableBroken.get(id) ?? false;
      mesh.visible = !broken;
      const mat = mesh.material as MeshBasicMaterial;
      if (broken) {
        mat.color.setHex(0x5a3a22);
      } else {
        const maxHp = Number(mesh.userData.maxHp ?? 60);
        const hp = breakableHp?.get(id) ?? maxHp;
        const ratio = maxHp > 0 ? hp / maxHp : 1;
        if (ratio < 0.34) mat.color.setHex(0x6b3f24);
        else if (ratio < 0.67) mat.color.setHex(0x825230);
        else mat.color.setHex(0x9c6b3f);
      }
    }
    for (const child of this.root.children) {
      if (!child.name.startsWith("herb:")) continue;
      const id = child.name.slice(5);
      child.visible = herbReady.get(id) ?? true;
    }
  }

  private clear(): void {
    while (this.root.children.length) {
      const child = this.root.children[0]!;
      this.root.remove(child);
      if (child instanceof Mesh) {
        child.geometry.dispose();
        (child.material as MeshBasicMaterial).dispose();
        for (const nested of child.children) {
          if (nested instanceof Mesh) {
            nested.geometry.dispose();
            (nested.material as MeshBasicMaterial).dispose();
          }
        }
      }
    }
    this.anchors.length = 0;
    this.geysers = [];
    this.breakables.clear();
  }
}
