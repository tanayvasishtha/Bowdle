import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
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
import { notebookMap } from "../../shared/maps/notebook.ts";
import type { InkName, MapData } from "../../shared/maps/types.ts";
import type { PlayerSim } from "../../shared/sim/movement.ts";
import type { PracticeTarget } from "../../shared/maps/range.ts";
import { BODY_RADIUS, EYE_STAND, HEAD_RADIUS, STAND_HEIGHT } from "../../shared/constants.ts";
import type { ArrowSim } from "../../shared/sim/arrows.ts";
import { CompositePass } from "./CompositePass.ts";
import { InkMaterial } from "./InkMaterial.ts";
import { INK_ID } from "./palette.ts";

const clear = { color: 0x8080ff, alpha: 0 } as const;
const up = new Vector3(0, 1, 0);
const arrowDirection = new Vector3();

function mapMeshes(map: MapData): Mesh[] {
  const groups = new Map<InkName, BufferGeometry[]>();
  for (const box of map.boxes) {
    if (box.tags.includes("invisible") || box.ink === "none") continue;
    const width = box.max[0] - box.min[0];
    const height = box.max[1] - box.min[1];
    const depth = box.max[2] - box.min[2];
    const geometry = new BoxGeometry(width, height, depth);
    geometry.translate((box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2);
    const list = groups.get(box.ink) ?? [];
    list.push(geometry);
    groups.set(box.ink, list);
  }
  const meshes: Mesh[] = [];
  for (const [ink, geometries] of groups) {
    const merged = mergeGeometries(geometries);
    meshes.push(new Mesh(merged, new InkMaterial(INK_ID[ink])));
    for (const geometry of geometries) geometry.dispose();
  }
  return meshes;
}

function addSun(scene: Scene): void {
  const material = new InkMaterial(INK_ID.blue);
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
  const material = new InkMaterial(INK_ID.blue);
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
  const material = new InkMaterial(INK_ID.red);
  const torsoHeight = STAND_HEIGHT - HEAD_RADIUS * 2;
  const torso = new Mesh(new CylinderGeometry(BODY_RADIUS, BODY_RADIUS, torsoHeight, 8), material);
  torso.position.y = torsoHeight / 2;
  const head = new Mesh(new SphereGeometry(HEAD_RADIUS, 12, 8), material);
  head.position.y = EYE_STAND + 0.05;
  group.add(torso, head);
  return group;
}

function createArrowVisual(): Group {
  const group = new Group();
  const material = new InkMaterial(INK_ID.blue);
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

export type SnapshotFractions = { paper: number; ink: number };

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly camera = new PerspectiveCamera(74, 1, 0.1, 250);
  private readonly renderer: WebGLRenderer;
  private readonly composite = new CompositePass();
  private readonly worldScene = new Scene();
  private readonly viewScene = new Scene();
  private readonly viewCamera = new PerspectiveCamera(70, 1, 0.01, 10);
  private readonly planes: Mesh[] = [];
  private readonly targets = new Map<string, Group>();
  private readonly players = new Map<string, Group>();
  private readonly viewBow: Group;
  private readonly overlay: HTMLDivElement | null;
  private previousTime = performance.now();
  private frames = 0;
  private fpsAt = this.previousTime;
  private fps = 0;
  private speed = 0;
  private grounded = false;
  private sliding = false;

  constructor(container: HTMLElement, debug: boolean, map: MapData = notebookMap, practice: readonly PracticeTarget[] = []) {
    this.renderer = new WebGLRenderer({ antialias: false, alpha: false });
    this.canvas = this.renderer.domElement;
    this.canvas.id = "game-canvas";
    container.append(this.canvas);
    for (const mesh of mapMeshes(map)) this.worldScene.add(mesh);
    if (map.id === "notebook") {
      addSun(this.worldScene);
      const planeMaterial = new InkMaterial(INK_ID.blue);
      for (let index = 0; index < 2; index += 1) {
        const plane = new Mesh(planeGeometry(), planeMaterial);
        this.planes.push(plane);
        this.worldScene.add(plane);
      }
      const spiralMaterial = new InkMaterial(INK_ID.blue);
      for (let index = 0; index < 18; index += 1) {
        const ring = new Mesh(new TorusGeometry(0.62, 0.075, 5, 10), spiralMaterial);
        ring.position.set(-28 + index * (56 / 17), 7, 21);
        ring.rotation.y = Math.PI / 2;
        this.worldScene.add(ring);
      }
    }
    for (const target of practice) {
      const visual = createPlayer();
      visual.position.set(target.pos[0], target.pos[1], target.pos[2]);
      this.targets.set(target.id, visual);
      this.worldScene.add(visual);
    }
    this.viewBow = addViewmodel(this.viewScene);
    this.camera.rotation.order = "YXZ";
    this.overlay = debug ? this.createOverlay(container) : null;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private createOverlay(container: HTMLElement): HTMLDivElement {
    const overlay = document.createElement("div");
    overlay.id = "debug-overlay";
    overlay.style.cssText = "position:absolute;left:12px;top:12px;padding:8px 10px;background:#f3eedfcc;color:#233c9b;font:16px monospace;white-space:pre;pointer-events:none";
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
    this.composite.resize(width, height, dpr);
  }

  setDebugMovement(player: PlayerSim): void {
    this.speed = Math.hypot(player.vx, player.vz);
    this.grounded = player.grounded;
    this.sliding = player.sliding;
  }

  setDrawFraction(fraction: number): void {
    this.viewBow.position.z = fraction * 0.2;
  }

  setTargetPosition(id: string, x: number, y: number, z: number, visible: boolean): void {
    const target = this.targets.get(id);
    if (!target) return;
    target.position.set(x, y, z);
    target.visible = visible;
  }

  spawnArrowVisual(arrow: ArrowSim): Group {
    const visual = createArrowVisual();
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
      const inkId = team === 0 ? INK_ID.red : INK_ID.green;
      player.traverse((child) => {
        if (child instanceof Mesh) child.material = new InkMaterial(inkId);
      });
      this.players.set(id, player);
      this.worldScene.add(player);
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
  }

  render(timeMs = performance.now()): void {
    this.previousTime = timeMs;
    for (let index = 0; index < this.planes.length; index += 1) {
      const plane = this.planes[index]!;
      const radius = index === 0 ? 18 : 24;
      const speed = index === 0 ? 0.08 : -0.05;
      const angle = timeMs * 0.001 * speed + index * Math.PI;
      plane.position.set(Math.cos(angle) * radius, index === 0 ? 16 : 19, Math.sin(angle) * radius);
      plane.rotation.y = -angle;
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
    let paper = 0;
    let ink = 0;
    const paperRgb = [243, 238, 223] as const;
    const inks = [[35, 60, 155], [209, 56, 47], [47, 158, 87], [240, 138, 36]] as const;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const close = (color: readonly [number, number, number]) => Math.abs(pixels[offset]! - color[0]) <= 12 && Math.abs(pixels[offset + 1]! - color[1]) <= 12 && Math.abs(pixels[offset + 2]! - color[2]) <= 12;
      if (close(paperRgb)) paper += 1;
      if (inks.some(close)) ink += 1;
    }
    const total = width * height;
    return { paper: paper / total, ink: ink / total };
  }
}
