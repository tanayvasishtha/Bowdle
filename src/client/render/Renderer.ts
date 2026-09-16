import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  QuadraticBezierCurve3,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Triangle,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { MaterialName, MapData } from "../../shared/maps/types.ts";
import type { PlayerSim } from "../../shared/sim/movement.ts";
import type { CampTarget } from "../../shared/maps/camp.ts";
import { defaultMatchMap } from "../../shared/maps/registry.ts";
import { BODY_RADIUS, BOULDER_RADIUS, EYE_STAND, HEAD_RADIUS, PIN_SEARCH_M, PIN_SEARCH_STEP_M, SPLAT_MAX_VERTICES, SPLAT_MIN_VERTICES, STAND_HEIGHT } from "../../shared/constants.ts";
import { mulberry32 } from "../../shared/math/rng.ts";
import type { ArrowSim } from "../../shared/sim/arrows.ts";
import { CompositePass } from "./CompositePass.ts";
import { InkMaterial } from "./InkMaterial.ts";
import { MATERIAL_ID, PALETTE } from "./palette.ts";
import { rampHeightAt } from "../../shared/maps/ramps.ts";
import { PropsRenderer } from "./props/PropsRenderer.ts";
import { Ambience } from "../audio/ambience.ts";
import { loadSettings, type GameSettings } from "../settings.ts";
import { DynamicResolution } from "./dynamicResolution.ts";

const clear = { color: 0x8080ff, alpha: 0 } as const;
const up = new Vector3(0, 1, 0);
const arrowDirection = new Vector3();
const symbolWorld = new Vector3();
const ropePoints = 9;

function mapMeshes(map: MapData): Mesh[] {
  const groups = new Map<MaterialName, BufferGeometry[]>();
  for (const box of map.boxes) {
    if (box.tags.includes("invisible")) continue;
    const width = box.max[0] - box.min[0];
    const height = box.max[1] - box.min[1];
    const depth = box.max[2] - box.min[2];
    const geometry = new BoxGeometry(width, height, depth);
    geometry.deleteAttribute("uv");
    geometry.translate((box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2);
    const list = groups.get(box.material) ?? [];
    list.push(geometry);
    groups.set(box.material, list);
  }
  for (const ramp of map.ramps) {
    const x0 = ramp.min[0], x1 = ramp.max[0], y0 = ramp.min[1], z0 = ramp.min[2], z1 = ramp.max[2];
    const h00 = rampHeightAt(ramp, x0, z0)!, h10 = rampHeightAt(ramp, x1, z0)!, h01 = rampHeightAt(ramp, x0, z1)!, h11 = rampHeightAt(ramp, x1, z1)!;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([x0,y0,z0, x1,y0,z0, x1,y0,z1, x0,y0,z1, x0,h00,z0, x1,h10,z0, x1,h11,z1, x0,h01,z1]), 3));
    geometry.setIndex([0,2,1,0,3,2, 4,5,6,4,6,7, 0,1,5,0,5,4, 1,2,6,1,6,5, 2,3,7,2,7,6, 3,0,4,3,4,7]); geometry.computeVertexNormals();
    const list = groups.get(ramp.material) ?? []; list.push(geometry); groups.set(ramp.material, list);
  }
  for (const volume of map.volumes) {
    const geometry = new BoxGeometry(volume.max[0] - volume.min[0], volume.max[1] - volume.min[1], volume.max[2] - volume.min[2]);
    geometry.deleteAttribute("uv");
    geometry.translate((volume.min[0] + volume.max[0]) / 2, (volume.min[1] + volume.max[1]) / 2, (volume.min[2] + volume.max[2]) / 2);
    const material: MaterialName = volume.kind === "water" ? "water" : "fern"; const list = groups.get(material) ?? []; list.push(geometry); groups.set(material, list);
  }
  const meshes: Mesh[] = [];
  for (const [material, geometries] of groups) {
    const merged = mergeGeometries(geometries);
    meshes.push(new Mesh(merged, new InkMaterial(MATERIAL_ID[material])));
    for (const geometry of geometries) geometry.dispose();
  }
  return meshes;
}

function addSun(scene: Scene): void {
  const material = new InkMaterial(MATERIAL_ID.gold);
  const sun = new Mesh(new TorusGeometry(6, 0.18, 6, 24), material);
  sun.position.set(0, 28, -70);
  scene.add(sun);
  for (let index = 0; index < 8; index += 1) {
    const ray = new Mesh(new BoxGeometry(0.24, 3.4, 0.24), material);
    const angle = index * Math.PI / 4;
    ray.position.set(Math.sin(angle) * 8.2, 28 + Math.cos(angle) * 8.2, -70);
    ray.rotation.z = -angle;
    scene.add(ray);
  }
}

function planeGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const triangleA = new Triangle(new Vector3(0, 0, -1.4), new Vector3(-1.4, 0, 1.2), new Vector3(0, 0.12, 0.45));
  const triangleB = new Triangle(new Vector3(0, 0, -1.4), new Vector3(0, 0.12, 0.45), new Vector3(1.4, 0, 1.2));
  const vertices = new Float32Array([
    ...triangleA.a.toArray(), ...triangleA.b.toArray(), ...triangleA.c.toArray(),
    ...triangleB.a.toArray(), ...triangleB.b.toArray(), ...triangleB.c.toArray(),
  ]);
  geometry.setAttribute("position", new BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function cylinderBetween(from: Vector3, to: Vector3, radius: number, material: InkMaterial): Mesh {
  const delta = new Vector3().subVectors(to, from);
  const mesh = new Mesh(new CylinderGeometry(radius, radius, delta.length(), 6), material);
  mesh.position.copy(from).addScaledVector(delta, 0.5);
  mesh.quaternion.setFromUnitVectors(up, delta.normalize());
  return mesh;
}

function addViewmodel(scene: Scene): Group {
  const material = new InkMaterial(MATERIAL_ID.wood);
  const group = new Group();
  const curve = new QuadraticBezierCurve3(new Vector3(0, -0.85, 0), new Vector3(0.5, 0, -0.15), new Vector3(0, 0.85, 0));
  const bow = new Mesh(new TubeGeometry(curve, 18, 0.025, 5, false), material);
  bow.position.set(0.62, -0.34, -1.25);
  group.add(bow);
  const top = new Vector3(0.62, 0.51, -1.25);
  const middle = new Vector3(0.38, -0.34, -1.08);
  const bottom = new Vector3(0.62, -1.19, -1.25);
  group.add(cylinderBetween(top, middle, 0.008, material), cylinderBetween(middle, bottom, 0.008, material));
  scene.add(group);
  return group;
}

function createPlayer(): Group {
  const group = new Group();
  const material = new InkMaterial(MATERIAL_ID.teamSun);
  const torsoHeight = STAND_HEIGHT - HEAD_RADIUS * 2;
  const torso = new Mesh(new CylinderGeometry(BODY_RADIUS, BODY_RADIUS, torsoHeight, 8), material);
  torso.position.y = torsoHeight / 2;
  const head = new Mesh(new SphereGeometry(HEAD_RADIUS, 12, 8), material);
  head.position.y = EYE_STAND + 0.05;
  group.add(torso, head);
  return group;
}

function createArrowVisual(kind: "arrow" | "grapple" | "ink" = "arrow"): Group {
  const group = new Group();
  const material = new InkMaterial(kind === "arrow" ? MATERIAL_ID.wood : MATERIAL_ID.gold);
  const shaft = new Mesh(new CylinderGeometry(0.012, 0.012, 0.8, 6), material);
  const head = new Mesh(new ConeGeometry(0.055, 0.14, 6), material);
  head.position.y = 0.47;
  const featherA = new Mesh(new BoxGeometry(0.14, 0.12, 0.015), material);
  featherA.position.y = -0.34;
  const featherB = new Mesh(new BoxGeometry(0.015, 0.12, 0.14), material);
  featherB.position.y = -0.34;
  group.add(shaft, head, featherA, featherB);
  return group;
}

export type SnapshotFractions = Record<keyof typeof PALETTE, number>;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly camera = new PerspectiveCamera(74, 1, 0.1, 250);
  private readonly renderer: WebGLRenderer;
  private readonly composite = new CompositePass();
  private readonly worldScene = new Scene();
  private readonly container: HTMLElement;
  private mapGroup = new Group();
  private readonly viewScene = new Scene();
  private readonly viewCamera = new PerspectiveCamera(70, 1, 0.01, 10);
  private readonly planes: Mesh[] = [];
  private readonly targets = new Map<string, Group>();
  private readonly players = new Map<string, Group>();
  private readonly playerSymbols = new Map<string, { element: HTMLDivElement; team: number }>();
  private readonly ropes = new Map<string, Line>();
  private readonly clouds = new Map<string, Group>();
  private readonly grappleHighlights: Mesh[] = [];
  private readonly notes: Array<{ element: HTMLDivElement; world: Vector3; x: number; y: number; z: number }> = [];
  private readonly viewBow: Group;
  private readonly overlay: HTMLDivElement | null;
  private map: MapData;
  private props: PropsRenderer;
  private ambience: Ambience;
  private previousTime = performance.now();
  private frames = 0;
  private fpsAt = this.previousTime;
  private fps = 0;
  private speed = 0;
  private grounded = false;
  private sliding = false;
  private cameraOverride: { x: number; y: number; z: number; lookX: number; lookY: number; lookZ: number } | null = null;
  private settings = loadSettings();
  private readonly dynamicResolution = new DynamicResolution();

  constructor(container: HTMLElement, debug: boolean, map: MapData = defaultMatchMap, practice: readonly CampTarget[] = []) {
    this.container = container;
    this.map = map;
    this.renderer = new WebGLRenderer({ antialias: false, alpha: false });
    this.canvas = this.renderer.domElement;
    this.canvas.id = "game-canvas";
    this.canvas.dataset.mapId = map.id;
    this.canvas.dataset.mapFeatures = String(map.ramps.length + map.volumes.length + map.zipLines.length + map.boulders.length);
    container.append(this.canvas);
    this.props = new PropsRenderer([]);
    this.ambience = new Ambience(map);
    this.applySettings(this.settings);
    this.buildMap(map);
    for (const target of practice) {
      const visual = createPlayer();
      visual.position.set(target.pos[0], target.pos[1], target.pos[2]);
      this.targets.set(target.id, visual);
      this.worldScene.add(visual);
    }
    this.viewBow = addViewmodel(this.viewScene);
    this.camera.rotation.order = "YXZ";
    this.overlay = debug || import.meta.env.DEV ? this.createOverlay(container) : null;
    if (this.overlay && !debug) this.overlay.style.display = "none";
    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("bowdle-settings", (event) => this.applySettings((event as CustomEvent<GameSettings>).detail));
    window.addEventListener("keydown", (event) => { if (this.overlay && event.code === this.settings.keys.debug) this.overlay.style.display = this.overlay.style.display === "none" ? "block" : "none"; });
  }

  private applySettings(settings: GameSettings): void {
    this.settings = settings; this.camera.fov = settings.fov; this.camera.updateProjectionMatrix(); this.composite.setBoil(settings.boil); this.ambience.setVolume(settings.masterVolume);
    for (const symbol of this.playerSymbols.values()) symbol.element.style.display = settings.colorblindSymbols ? "block" : "none";
  }

  private buildMap(map: MapData): void {
    this.worldScene.add(this.mapGroup);
    this.canvas.dataset.mapId = map.id;
    this.canvas.dataset.mapFeatures = String(map.ramps.length + map.volumes.length + map.zipLines.length + map.boulders.length);
    this.composite.setSunShafts(map.look.sunShafts); this.composite.setStainSeed(map.look.stainSeed);
    for (const mesh of mapMeshes(map)) this.mapGroup.add(mesh);
    this.props = new PropsRenderer(map.props); this.mapGroup.add(this.props);
    for (const zip of map.zipLines) {
      const geometry = new BufferGeometry(); geometry.setAttribute("position", new BufferAttribute(new Float32Array([...zip.from, ...zip.to]), 3));
      this.mapGroup.add(new Line(geometry, new LineBasicMaterial({ color: PALETTE.rope })));
    }
    for (const boulder of map.boulders) {
      const rock = new Mesh(new SphereGeometry(BOULDER_RADIUS, 12, 8), new InkMaterial(MATERIAL_ID.hazard)); rock.position.set(...boulder.path[0]!); this.mapGroup.add(rock);
      const lever = new Mesh(new CylinderGeometry(0.08, 0.08, 1.2, 6), new InkMaterial(MATERIAL_ID.gold)); lever.position.set(...boulder.lever); lever.rotation.z = -0.45; this.mapGroup.add(lever);
    }
    for (const box of map.boxes) {
      if (!box.tags.includes("grapple")) continue;
      const material = new InkMaterial(MATERIAL_ID.gold); material.wireframe = true;
      const visual = new Mesh(new BoxGeometry(box.max[0] - box.min[0] + 0.08, box.max[1] - box.min[1] + 0.08, box.max[2] - box.min[2] + 0.08), material);
      visual.position.set((box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2);
      visual.visible = false; this.grappleHighlights.push(visual); this.mapGroup.add(visual);
    }
    for (const note of map.notes) {
      const element = document.createElement("div"); element.textContent = note.text;
      element.className = "map-note";
      element.style.cssText = "position:absolute;left:0;top:0;color:#4a3527;font:22px 'Gochi Hand',cursive;pointer-events:none;text-shadow:0 1px #efe3c6;transform:translate(-50%,-50%)";
      this.container.append(element); this.notes.push({ element, world: new Vector3(...note.pos), x: note.pos[0], y: note.pos[1], z: note.pos[2] });
    }
  }

  setMap(map: MapData): void {
    if (map.id === this.map.id) return;
    this.worldScene.remove(this.mapGroup);
    this.mapGroup = new Group();
    this.grappleHighlights.length = 0;
    for (const note of this.notes) note.element.remove();
    this.notes.length = 0;
    this.map = map;
    this.ambience.dispose();
    this.ambience = new Ambience(map);
    this.applySettings(this.settings);
    this.buildMap(map);
  }

  private createOverlay(container: HTMLElement): HTMLDivElement {
    const overlay = document.createElement("div");
    overlay.id = "debug-overlay";
    overlay.style.cssText = "position:absolute;left:12px;top:12px;padding:8px 10px;background:#efe3c6cc;color:#4a3527;font:16px monospace;white-space:pre;pointer-events:none";
    container.append(overlay);
    return overlay;
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.viewCamera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.viewCamera.updateProjectionMatrix();
    this.composite.resize(width, height, dpr, this.dynamicResolution.scale);
  }

  setDebugMovement(player: PlayerSim): void {
    this.speed = Math.hypot(player.vx, player.vz);
    this.grounded = player.grounded;
    this.sliding = player.sliding;
  }
  setTestCamera(x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number): void { this.cameraOverride = { x, y, z, lookX, lookY, lookZ }; }

  setDrawFraction(fraction: number): void {
    this.viewBow.position.z = fraction * 0.2;
  }

  setViewmodelVisible(visible: boolean): void { this.viewBow.visible = visible; }

  setTargetPosition(id: string, x: number, y: number, z: number, visible: boolean): void {
    const target = this.targets.get(id);
    if (!target) return;
    target.position.set(x, y, z);
    target.visible = visible;
  }

  spawnArrowVisual(arrow: ArrowSim, kind: "arrow" | "grapple" | "ink" = "arrow"): Group {
    const visual = createArrowVisual(kind);
    this.worldScene.add(visual);
    this.updateArrowVisual(visual, arrow);
    return visual;
  }

  updateArrowVisual(visual: Group, arrow: ArrowSim): void {
    visual.position.set(arrow.x, arrow.y, arrow.z);
    arrowDirection.set(arrow.vx, arrow.vy, arrow.vz).normalize();
    visual.quaternion.setFromUnitVectors(up, arrowDirection);
  }

  removeVisual(visual: Group): void {
    this.worldScene.remove(visual);
  }

  setPlayerPosition(id: string, team: number, x: number, y: number, z: number, yaw: number, visible = true): void {
    let player = this.players.get(id);
    if (!player) {
      player = createPlayer();
      const inkId = team === 0 ? MATERIAL_ID.teamSun : MATERIAL_ID.teamMoon;
      player.traverse((child) => {
        if (child instanceof Mesh) child.material = new InkMaterial(inkId);
      });
      this.players.set(id, player);
      this.worldScene.add(player);
      const element = document.createElement("div"); element.className = "bowdle-team-symbol"; element.textContent = team === 0 ? "●" : "▲"; element.style.cssText = `position:absolute;display:${this.settings.colorblindSymbols ? "block" : "none"};color:${team === 0 ? "#d2531f" : "#47418c"};font:30px sans-serif;-webkit-text-stroke:2px #efe3c6;pointer-events:none;transform:translate(-50%,-50%)`;
      this.container.append(element); this.playerSymbols.set(id, { element, team });
    }
    player.position.set(x, y, z);
    player.rotation.y = yaw;
    player.visible = visible;
  }

  removePlayer(id: string): void {
    const player = this.players.get(id);
    if (!player) return;
    this.worldScene.remove(player);
    this.players.delete(id);
    this.playerSymbols.get(id)?.element.remove(); this.playerSymbols.delete(id);
  }

  setGrappleHighlights(ready: boolean): void { for (const visual of this.grappleHighlights) visual.visible = ready; }
  setBoulderAudio(phase: "idle" | "telegraph" | "roll" | "despawn"): void { this.ambience.setBoulder(phase); }
  setZipAudio(speed: number): void { this.ambience.setZipSpeed(speed); }
  leverAudio(): void { this.ambience.leverClunk(); }

  setGrappleRope(id: string, active: boolean, x: number, y: number, z: number, anchorX: number, anchorY: number, anchorZ: number): void {
    let rope = this.ropes.get(id);
    if (!active) { if (rope) rope.visible = false; return; }
    if (!rope) {
      const geometry = new BufferGeometry(); geometry.setAttribute("position", new BufferAttribute(new Float32Array(ropePoints * 3), 3));
      rope = new Line(geometry, new LineBasicMaterial({ color: 0xf08a24 })); this.ropes.set(id, rope); this.worldScene.add(rope);
    }
    rope.visible = true;
    const positions = rope.geometry.getAttribute("position") as BufferAttribute;
    for (let index = 0; index < ropePoints; index += 1) {
      const fraction = index / (ropePoints - 1), wobble = Math.sin(index * 2.7) * 0.07 * Math.sin(fraction * Math.PI);
      positions.setXYZ(index, x + (anchorX - x) * fraction + wobble, y + EYE_STAND + (anchorY - y - EYE_STAND) * fraction, z + (anchorZ - z) * fraction - wobble);
    }
    positions.needsUpdate = true;
  }

  setInkCloud(id: string, x: number, y: number, z: number, radius: number): void {
    let cloud = this.clouds.get(id);
    if (!cloud) {
      cloud = new Group();
      for (let layer = 0; layer < 3; layer += 1) {
        const material = new InkMaterial(layer === 1 ? MATERIAL_ID.gold : MATERIAL_ID.foliageDark); material.wireframe = true;
        const sphere = new Mesh(new SphereGeometry(1, 9 + layer, 7), material); sphere.scale.setScalar(1 - layer * 0.12); sphere.rotation.set(layer * 0.4, layer * 0.7, layer * 0.2); cloud.add(sphere);
      }
      this.clouds.set(id, cloud); this.worldScene.add(cloud);
    }
    cloud.position.set(x, y, z); cloud.scale.setScalar(radius); cloud.visible = true;
  }

  removeInkCloud(id: string): void { const cloud = this.clouds.get(id); if (!cloud) return; this.worldScene.remove(cloud); this.clouds.delete(id); }

  addInkSplat(x: number, y: number, z: number, team: number, seed: number): void {
    const rng = mulberry32(seed); const count = SPLAT_MIN_VERTICES + Math.floor(rng() * (SPLAT_MAX_VERTICES - SPLAT_MIN_VERTICES + 1));
    const vertices = new Float32Array(count * 9);
    for (let index = 0; index < count; index += 1) {
      const a0 = index / count * Math.PI * 2, a1 = (index + 1) / count * Math.PI * 2;
      const r0 = 0.18 + rng() * 0.3, r1 = 0.18 + rng() * 0.3, offset = index * 9;
      vertices[offset] = 0; vertices[offset + 1] = 0; vertices[offset + 2] = 0;
      vertices[offset + 3] = Math.cos(a0) * r0; vertices[offset + 4] = Math.sin(a0) * r0; vertices[offset + 5] = 0;
      vertices[offset + 6] = Math.cos(a1) * r1; vertices[offset + 7] = Math.sin(a1) * r1; vertices[offset + 8] = 0;
    }
    const geometry = new BufferGeometry(); geometry.setAttribute("position", new BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
    const splat = new Mesh(geometry, new InkMaterial(team === 0 ? MATERIAL_ID.teamSun : MATERIAL_ID.teamMoon)); splat.position.set(x, y + EYE_STAND, z); this.worldScene.add(splat);
  }

  pinPlayer(id: string, fromX: number, fromZ: number): void {
    const player = this.players.get(id); if (!player) return;
    let dx = player.position.x - fromX, dz = player.position.z - fromZ; const length = Math.hypot(dx, dz); if (length <= 0) return; dx /= length; dz /= length;
    for (let distance = PIN_SEARCH_STEP_M; distance <= PIN_SEARCH_M; distance += PIN_SEARCH_STEP_M) {
      const x = player.position.x + dx * distance, z = player.position.z + dz * distance;
      const wall = this.map.boxes.some((box) => box.tags.includes("solid") && box.max[1] > player.position.y + EYE_STAND && x >= box.min[0] && x <= box.max[0] && z >= box.min[2] && z <= box.max[2]);
      if (!wall) continue;
      player.position.x = x - dx * PIN_SEARCH_STEP_M; player.position.z = z - dz * PIN_SEARCH_STEP_M; player.rotation.z = Math.PI / 2; return;
    }
    player.rotation.z = Math.PI / 5;
  }

  unpinPlayer(id: string): void { const player = this.players.get(id); if (player) player.rotation.z = 0; }

  render(timeMs = performance.now()): void {
    const frameMs = Math.max(0, timeMs - this.previousTime);
    this.previousTime = timeMs;
    if (this.dynamicResolution.sample(frameMs)) this.resize();
    if (this.cameraOverride) { const view = this.cameraOverride; this.camera.position.set(view.x, view.y, view.z); this.camera.lookAt(view.lookX, view.lookY, view.lookZ); }
    this.props.update(this.camera, timeMs);
    this.ambience.updateListener(this.camera.position.x, this.camera.position.z);
    for (let index = 0; index < this.planes.length; index += 1) {
      const plane = this.planes[index]!;
      const radius = index === 0 ? 18 : 24;
      const speed = index === 0 ? 0.08 : -0.05;
      const angle = timeMs * 0.001 * speed + index * Math.PI;
      plane.position.set(Math.cos(angle) * radius, index === 0 ? 16 : 19, Math.sin(angle) * radius);
      plane.rotation.y = -angle;
    }
    for (const note of this.notes) {
      const distance = note.world.distanceTo(this.camera.position); note.world.project(this.camera);
      note.element.style.left = `${(note.world.x * 0.5 + 0.5) * window.innerWidth}px`; note.element.style.top = `${(-note.world.y * 0.5 + 0.5) * window.innerHeight}px`;
      note.element.style.opacity = String(Math.max(0, Math.min(1, 1 - distance / 80))); note.element.style.display = this.settings.floatingNotes && note.world.z < 1 ? "block" : "none";
      note.world.set(note.x, note.y, note.z);
    }
    for (const [id, symbol] of this.playerSymbols) {
      const player = this.players.get(id); if (!player || !this.settings.colorblindSymbols || !player.visible) { symbol.element.style.display = "none"; continue; }
      symbolWorld.copy(player.position); symbolWorld.y += STAND_HEIGHT + 0.5; symbolWorld.project(this.camera); symbol.element.style.left = `${(symbolWorld.x * 0.5 + 0.5) * window.innerWidth}px`; symbol.element.style.top = `${(-symbolWorld.y * 0.5 + 0.5) * window.innerHeight}px`; symbol.element.style.display = symbolWorld.z < 1 ? "block" : "none";
    }
    this.renderer.setClearColor(clear.color, clear.alpha);
    this.renderer.setRenderTarget(this.composite.world);
    this.renderer.clear();
    this.renderer.render(this.worldScene, this.camera);
    this.renderer.setRenderTarget(this.composite.viewmodel);
    this.renderer.clear();
    this.renderer.render(this.viewScene, this.viewCamera);
    this.composite.render(this.renderer, timeMs / 1000);
    this.frames += 1;
    if (timeMs - this.fpsAt >= 500) {
      this.fps = this.frames * 1000 / (timeMs - this.fpsAt);
      this.frames = 0;
      this.fpsAt = timeMs;
      if (this.overlay) this.overlay.textContent = `fps ${this.fps.toFixed(0)}\ndraw calls ${this.renderer.info.render.calls}\nspeed ${this.speed.toFixed(2)}\ngrounded ${this.grounded}\nsliding ${this.sliding}`;
    }
  }

  snapshot(): SnapshotFractions {
    this.render(performance.now());
    const gl = this.renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const entries = Object.entries(PALETTE) as Array<[keyof typeof PALETTE, number]>;
    const counts = Object.fromEntries(entries.map(([name]) => [name, 0])) as SnapshotFractions;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      let nearest = entries[0]![0], distance = Number.POSITIVE_INFINITY;
      for (const [name, color] of entries) {
        const dr = pixels[offset]! - (color >> 16 & 255), dg = pixels[offset + 1]! - (color >> 8 & 255), db = pixels[offset + 2]! - (color & 255);
        const candidate = dr * dr + dg * dg + db * db; if (candidate < distance) { nearest = name; distance = candidate; }
      }
      counts[nearest] += 1;
    }
    const total = width * height;
    for (const [name] of entries) counts[name] /= total;
    return counts;
  }

  stats(): { drawCalls: number; triangles: number; renderScale: number } {
    this.render(performance.now()); return { drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, renderScale: this.dynamicResolution.scale };
  }
}
