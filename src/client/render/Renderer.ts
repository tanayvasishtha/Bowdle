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
import { ArrowTrailMesh, KillBurst, RopeMesh } from "./effects.ts";
import { ROPE_LOOK } from "./look.ts";
import { killEffect } from "../../shared/cosmetics.ts";
import type { ArrowSim } from "../../shared/sim/arrows.ts";
import { CompositePass } from "./CompositePass.ts";
import { InkMaterial } from "./InkMaterial.ts";
import { MATERIAL_ID, PALETTE } from "./palette.ts";
import { rampHeightAt } from "../../shared/maps/ramps.ts";
import { PropsRenderer } from "./props/PropsRenderer.ts";
import { Ambience } from "../audio/ambience.ts";
import { loadSettings, type GameSettings } from "../settings.ts";
import { DynamicResolution } from "./dynamicResolution.ts";
import { CharacterRig, characterLookKey, type CharacterLook, type CharacterKind } from "./characters/CharacterRig.ts";
import type { CharacterMotion } from "./characters/pose.ts";
import { Viewmodel } from "./characters/Viewmodel.ts";

/** Straight while reeling; while swinging the rope hangs a little, more when it has slack. */
export function ropeSag(player: Pick<PlayerSim, "grappleActive" | "grappleReeling" | "grappleX" | "grappleY" | "grappleZ" | "grappleLen" | "height">, x: number, y: number, z: number): number {
  if (!player.grappleActive || player.grappleReeling) return 0;
  const distance = Math.hypot(player.grappleX - x, player.grappleY - (y + player.height * 0.5), player.grappleZ - z);
  return Math.min(ROPE_LOOK.maxSag, ROPE_LOOK.swingSag + Math.max(0, player.grappleLen - distance) * ROPE_LOOK.slackSagPerM);
}

const clear = { color: 0x8080ff, alpha: 0 } as const;
const up = new Vector3(0, 1, 0);
const ropeHand = new Vector3();
const arrowDirection = new Vector3();
const symbolWorld = new Vector3();
const viewDirection = new Vector3();
const projectScratch = new Vector3();

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
    if (volume.kind !== "water") { geometry.dispose(); continue; }
    const list = groups.get("water") ?? []; list.push(geometry); groups.set("water", list);
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

function phaseFor(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 997;
  return hash / 97;
}

export type ArrowVisualKind = "arrow" | "scatter" | "tether" | "grapple" | "ink";

function createArrowVisual(kind: ArrowVisualKind = "arrow"): Group {
  const group = new Group();
  const material = new InkMaterial(kind === "arrow" || kind === "scatter" ? MATERIAL_ID.wood : kind === "tether" ? MATERIAL_ID.rope : MATERIAL_ID.gold);
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

/** Palette fractions plus two hue buckets: blended team washes sit between palette entries, so crews are measured by hue. */
export type SnapshotFractions = Record<keyof typeof PALETTE, number> & { sunTint: number; moonTint: number };

function hueOf(r: number, g: number, b: number, max: number, min: number): number {
  const range = max - min;
  if (range === 0) return 0;
  const hue = max === r ? ((g - b) / range) % 6 : max === g ? (b - r) / range + 2 : (r - g) / range + 4;
  return hue * 60 < 0 ? hue * 60 + 360 : hue * 60;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly camera = new PerspectiveCamera(74, 1, 0.1, 250);
  private readonly renderer: WebGLRenderer;
  private readonly composite = new CompositePass();
  private forcedFeel: { hurt: number; streaks: number } | undefined;
  private readonly worldScene = new Scene();
  private readonly container: HTMLElement;
  private mapGroup = new Group();
  private readonly viewScene = new Scene();
  private readonly viewCamera = new PerspectiveCamera(70, 1, 0.01, 10);
  private readonly planes: Mesh[] = [];
  private readonly targets = new Map<string, CharacterRig>();
  private readonly players = new Map<string, CharacterRig>();
  private readonly showcase: CharacterRig[] = [];
  private readonly trails = new Map<Group, ArrowTrailMesh>();
  private readonly bursts: KillBurst[] = [];
  private readonly snaps: Array<{ rope: RopeMesh; base: Float32Array; cut: number; startMs: number }> = [];
  private readonly playerSymbols = new Map<string, { element: HTMLDivElement; team: number }>();
  private readonly ropes = new Map<string, RopeMesh>();
  private readonly clouds = new Map<string, Group>();
  private readonly grappleHighlights: Mesh[] = [];
  private readonly notes: Array<{ element: HTMLDivElement; world: Vector3; x: number; y: number; z: number }> = [];
  private readonly viewmodel = new Viewmodel();
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
    this.renderer.info.autoReset = false;
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
      const visual = new CharacterRig("dummy", phaseFor(target.id));
      visual.position.set(target.pos[0], target.pos[1], target.pos[2]);
      this.targets.set(target.id, visual);
      this.worldScene.add(visual);
    }
    this.viewScene.add(this.viewmodel);
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

  /** Hurt vignette and speed streaks for this frame. A forced value (test hook) wins. */
  setFeel(hurt: number, streaks: number): void {
    const forced = this.forcedFeel;
    this.composite.setFeel(forced ? forced.hurt : hurt, forced ? forced.streaks : streaks);
  }

  forceFeel(hurt: number, streaks: number): void { this.forcedFeel = { hurt, streaks }; this.composite.setFeel(hurt, streaks); }

  /** CSS pixel position of a world point, or undefined when it is behind the camera. */
  screenPoint(x: number, y: number, z: number): { x: number; y: number } | undefined {
    projectScratch.set(x, y, z).project(this.camera);
    if (projectScratch.z > 1) return undefined;
    const rect = this.canvas.getBoundingClientRect();
    return { x: (projectScratch.x * 0.5 + 0.5) * rect.width, y: (-projectScratch.y * 0.5 + 0.5) * rect.height };
  }

  setDrawFraction(fraction: number): void { this.viewmodel.setDrawFraction(fraction); }
  setViewmodelVisible(visible: boolean): void { this.viewmodel.visible = visible; }
  setLocalTeam(team: number): void { this.viewmodel.setTeam(team); }
  setLocalBowSkin(bowId: string): void { this.viewmodel.setBowSkin(bowId); }
  setLocalArrowKind(kind: "arrow" | "scatter" | "tether"): void { this.viewmodel.setArrowKind(kind); }
  setMeleeSwing(progress: number): void { this.viewmodel.setStab(progress); }

  setPlayerMotion(id: string, motion: CharacterMotion): void { this.players.get(id)?.setMotion(motion); }

  /** A posed character that is not a player, for the character lineup scene. */
  addShowcase(kind: CharacterKind, x: number, y: number, z: number, yaw: number, motion: CharacterMotion, look: CharacterLook = {}): CharacterRig {
    const rig = new CharacterRig(kind, this.showcase.length * 0.37, look);
    rig.position.set(x, y, z);
    rig.rotation.y = yaw;
    rig.setMotion(motion);
    this.showcase.push(rig);
    this.worldScene.add(rig);
    return rig;
  }

  /** Swaps a showcase rig for one wearing a different look, keeping its place and pose. */
  restyleShowcase(rig: CharacterRig, kind: CharacterKind, look: CharacterLook): CharacterRig {
    const index = this.showcase.indexOf(rig);
    if (index < 0) return rig;
    const next = new CharacterRig(kind, index * 0.37, look);
    next.position.copy(rig.position); next.rotation.copy(rig.rotation); next.setMotion(rig.motion);
    this.worldScene.remove(rig); this.worldScene.add(next); this.showcase[index] = next;
    return next;
  }

  setTargetPosition(id: string, x: number, y: number, z: number, visible: boolean): void {
    const target = this.targets.get(id);
    if (!target) return;
    target.position.set(x, y, z);
    target.visible = visible;
  }

  spawnArrowVisual(arrow: ArrowSim, kind: ArrowVisualKind = "arrow", trailId = ""): Group {
    const visual = createArrowVisual(kind);
    this.worldScene.add(visual);
    if ((kind === "arrow" || kind === "scatter" || kind === "tether") && trailId) {
      const trail = new ArrowTrailMesh(trailId);
      if (trail.enabled) { this.trails.set(visual, trail); this.worldScene.add(trail.mesh); } else trail.dispose();
    }
    this.updateArrowVisual(visual, arrow);
    return visual;
  }

  updateArrowVisual(visual: Group, arrow: ArrowSim): void {
    visual.position.set(arrow.x, arrow.y, arrow.z);
    arrowDirection.set(arrow.vx, arrow.vy, arrow.vz).normalize();
    visual.quaternion.setFromUnitVectors(up, arrowDirection);
    this.trails.get(visual)?.push(arrow.x, arrow.y, arrow.z);
  }

  removeVisual(visual: Group): void {
    this.worldScene.remove(visual);
    const trail = this.trails.get(visual);
    if (trail) { this.worldScene.remove(trail.mesh); trail.dispose(); this.trails.delete(visual); }
  }

  effectCounts(): { trails: number; trailPoints: number; bursts: number } {
    let trailPoints = 0;
    for (const trail of this.trails.values()) trailPoints += trail.pointCount;
    return { trails: this.trails.size, trailPoints, bursts: this.bursts.length };
  }

  /** Plays a bought kill effect. Returns false for the default effect, which the caller draws as an ink splat. */
  spawnKillEffect(effectId: string, team: number, x: number, y: number, z: number, seed: number, nowMs = performance.now()): boolean {
    if (killEffect(effectId).shape === "splat") return false;
    const burst = new KillBurst(effectId, team, x, y + EYE_STAND - 0.3, z, nowMs, seed);
    this.bursts.push(burst); this.worldScene.add(burst.mesh);
    return true;
  }

  setPlayerPosition(id: string, team: number, x: number, y: number, z: number, yaw: number, visible = true, look: CharacterLook = {}): void {
    let player = this.players.get(id);
    const kind = team === 0 ? "sun" : "moon";
    if (player && player.lookKey !== characterLookKey(kind, look)) {
      const motion = player.motion;
      this.worldScene.remove(player);
      player = new CharacterRig(kind, phaseFor(id), look);
      player.setMotion(motion);
      this.players.set(id, player);
      this.worldScene.add(player);
    }
    if (!player) {
      player = new CharacterRig(kind, phaseFor(id), look);
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

  /**
   * sag is how far the middle of the rope hangs below the straight line, in meters.
   * fromHand starts the rope at the local bow hand, since a rope from the eye would be seen end on.
   */
  setGrappleRope(id: string, active: boolean, x: number, y: number, z: number, anchorX: number, anchorY: number, anchorZ: number, sag = 0, fromHand = false): void {
    if (!active) { const rope = this.ropes.get(id); if (rope) rope.mesh.visible = false; return; }
    let startX = x, startY = y + EYE_STAND, startZ = z;
    if (fromHand) {
      this.camera.updateMatrixWorld();
      ropeHand.set(...ROPE_LOOK.handOffset).applyMatrix4(this.camera.matrixWorld);
      startX = ropeHand.x; startY = ropeHand.y; startZ = ropeHand.z;
    }
    this.drawRope(id, startX, startY, startZ, anchorX, anchorY, anchorZ, sag);
  }

  /** A tether line, drawn like a tight rope between its ends. */
  setTether(id: string, fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number): void {
    this.drawRope(id, fromX, fromY, fromZ, toX, toY, toZ, 0);
  }

  removeRope(id: string): void {
    const rope = this.ropes.get(id); if (!rope) return;
    rope.dispose(this.worldScene); this.ropes.delete(id);
  }

  ropeVisible(id: string): boolean { return this.ropes.get(id)?.mesh.visible ?? false; }

  private drawRope(id: string, startX: number, startY: number, startZ: number, anchorX: number, anchorY: number, anchorZ: number, sag: number): void {
    let rope = this.ropes.get(id);
    if (!rope) { rope = new RopeMesh(ROPE_LOOK.points, ROPE_LOOK.radius); this.ropes.set(id, rope); this.worldScene.add(rope.mesh); }
    rope.mesh.visible = true;
    for (let index = 0; index < ROPE_LOOK.points; index += 1) {
      const fraction = index / (ROPE_LOOK.points - 1), arc = 4 * fraction * (1 - fraction);
      const wobble = sag > 0 ? Math.sin(index * 2.7) * ROPE_LOOK.wobble * arc : 0;
      rope.points[index * 3] = startX + (anchorX - startX) * fraction + wobble;
      rope.points[index * 3 + 1] = startY + (anchorY - startY) * fraction - sag * arc;
      rope.points[index * 3 + 2] = startZ + (anchorZ - startZ) * fraction - wobble;
    }
    rope.update();
  }

  /** Splits a player's rope at the cut: the piece on the owner's side drops, the anchor piece swings down, both thin away. */
  snapRope(id: string, cutX: number, cutY: number, cutZ: number, nowMs = performance.now()): void {
    const rope = this.ropes.get(id);
    if (!rope?.mesh.visible) return;
    let cut = 0, best = Number.POSITIVE_INFINITY;
    for (let index = 0; index < ROPE_LOOK.points; index += 1) {
      const distance = Math.hypot(rope.points[index * 3]! - cutX, rope.points[index * 3 + 1]! - cutY, rope.points[index * 3 + 2]! - cutZ);
      if (distance < best) { best = distance; cut = index; }
    }
    const piece = new RopeMesh(ROPE_LOOK.points, ROPE_LOOK.radius);
    piece.points.set(rope.points); piece.update();
    this.snaps.push({ rope: piece, base: Float32Array.from(rope.points), cut, startMs: nowMs }); this.worldScene.add(piece.mesh);
    rope.mesh.visible = false;
  }

  snapCount(): number { return this.snaps.length; }

  private updateSnaps(nowMs: number): void {
    for (let index = this.snaps.length - 1; index >= 0; index -= 1) {
      const snap = this.snaps[index]!, t = (nowMs - snap.startMs) / ROPE_LOOK.snapMs;
      if (t >= 1) { snap.rope.dispose(this.worldScene); this.snaps.splice(index, 1); continue; }
      const drop = ROPE_LOOK.snapFall * t * t, last = ROPE_LOOK.points - 1;
      for (let point = 0; point <= last; point += 1) {
        // Owner side falls freely; the anchor side hangs from the anchor, so it drops less near the anchor.
        const weight = point <= snap.cut ? 1 : (last - point) / Math.max(1, last - snap.cut);
        snap.rope.points[point * 3 + 1] = snap.base[point * 3 + 1]! - drop * weight;
      }
      snap.rope.update(1 - t, Math.min(snap.cut, last - 1));
    }
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
    const seconds = timeMs / 1000;
    for (const rig of this.players.values()) rig.update(seconds);
    for (const rig of this.targets.values()) rig.update(seconds);
    for (const rig of this.showcase) rig.update(seconds);
    this.updateSnaps(timeMs);
    for (let index = this.bursts.length - 1; index >= 0; index -= 1) {
      const burst = this.bursts[index]!;
      if (!burst.update(timeMs)) { burst.dispose(this.worldScene); this.bursts.splice(index, 1); }
    }
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
    this.renderer.info.reset();
    this.renderer.setClearColor(clear.color, clear.alpha);
    this.renderer.setRenderTarget(this.composite.world);
    this.renderer.clear();
    this.renderer.render(this.worldScene, this.camera);
    this.renderer.setRenderTarget(this.composite.viewmodel);
    this.renderer.clear();
    this.renderer.render(this.viewScene, this.viewCamera);
    this.camera.getWorldDirection(viewDirection);
    this.composite.setView(Math.asin(Math.max(-1, Math.min(1, viewDirection.y))), Math.atan2(viewDirection.x, -viewDirection.z), this.camera.fov);
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
    const counts = { ...Object.fromEntries(entries.map(([name]) => [name, 0])), sunTint: 0, moonTint: 0 } as SnapshotFractions;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = pixels[offset]!, green = pixels[offset + 1]!, blue = pixels[offset + 2]!;
      const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
      const saturation = max === 0 ? 0 : (max - min) / max, hue = hueOf(red, green, blue, max, min);
      if (hue >= 10 && hue <= 33 && saturation > 0.35 && max > 190) counts.sunTint += 1;
      else if (hue >= 215 && hue <= 250 && saturation > 0.15) counts.moonTint += 1;
      let nearest = entries[0]![0], distance = Number.POSITIVE_INFINITY;
      for (const [name, color] of entries) {
        const dr = pixels[offset]! - (color >> 16 & 255), dg = pixels[offset + 1]! - (color >> 8 & 255), db = pixels[offset + 2]! - (color & 255);
        const candidate = dr * dr + dg * dg + db * db; if (candidate < distance) { nearest = name; distance = candidate; }
      }
      counts[nearest] += 1;
    }
    const total = width * height;
    for (const [name] of entries) counts[name] /= total;
    counts.sunTint /= total;
    counts.moonTint /= total;
    return counts;
  }

  stats(): { drawCalls: number; triangles: number; renderScale: number } {
    this.render(performance.now()); return { drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, renderScale: this.dynamicResolution.scale };
  }
}
