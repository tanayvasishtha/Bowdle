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
      this.anchors.push(ring);
      this.root.add(ring);
    }
    for (const geyser of map.geysers ?? []) {
      const plume = new Mesh(new CylinderGeometry(0.2, geyser.radius, 2.2, 8), spray);
      plume.position.set(geyser.pos[0], geyser.pos[1] + 1.1, geyser.pos[2]);
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
      this.breakables.set(item.id, mesh);
      this.root.add(mesh);
    }
  }

  update(matchTimeMs: number, breakableBroken: ReadonlyMap<string, boolean>, herbReady: ReadonlyMap<string, boolean>): void {
    if (!this.map) return;
    const list = this.map.anchors ?? [];
    for (let index = 0; index < list.length; index += 1) {
      const [x, y, z] = anchorPosAt(list[index]!, matchTimeMs);
      const ring = this.anchors[index];
      if (ring) ring.position.set(x, y, z);
    }
    for (const [id, mesh] of this.breakables) {
      const broken = breakableBroken.get(id) ?? false;
      mesh.visible = !broken;
      const mat = mesh.material as MeshBasicMaterial;
      mat.color.setHex(broken ? 0x5a3a22 : 0x9c6b3f);
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
      }
    }
    this.anchors.length = 0;
    this.breakables.clear();
  }
}
