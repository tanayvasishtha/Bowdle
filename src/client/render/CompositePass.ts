import {
  BufferAttribute,
  Color,
  BufferGeometry,
  DepthFormat,
  DepthTexture,
  GLSL3,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import { compositeFragmentShader, compositeVertexShader } from "./shaders/composite.ts";
import { TEAM_PALETTES, type TeamPalette } from "./palette.ts";

function target(width: number, height: number): WebGLRenderTarget {
  const renderTarget = new WebGLRenderTarget(width, height, {
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: true,
  });
  renderTarget.depthTexture = new DepthTexture(width, height, UnsignedIntType);
  renderTarget.depthTexture.format = DepthFormat;
  return renderTarget;
}

export class CompositePass {
  readonly world = target(1, 1);
  readonly viewmodel = target(1, 1);
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: ShaderMaterial;
  private readonly resolution = new Vector2(1, 1);
  private boil = true;

  constructor() {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([
      -1, -1, 0,
      3, -1, 0,
      -1, 3, 0,
    ]), 3));
    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      uniforms: {
        worldColor: { value: this.world.texture },
        worldDepth: { value: this.world.depthTexture },
        viewColor: { value: this.viewmodel.texture },
        viewDepth: { value: this.viewmodel.depthTexture },
        resolution: { value: this.resolution },
        devicePixelRatio: { value: 1 },
        renderScale: { value: 1 },
        time: { value: 0 },
        sunShafts: { value: 0 },
        stainSeed: { value: 0 },
        horizon: { value: 0.5 },
        cameraYaw: { value: 0 },
        hurt: { value: 0 },
        streaks: { value: 0 },
        night: { value: 0 },
        hatchStrength: { value: 1 },
        sunWash: { value: new Color() },
        moonWash: { value: new Color() },
        sunInk: { value: new Color() },
        moonInk: { value: new Color() },
      },
      vertexShader: compositeVertexShader,
      fragmentShader: compositeFragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new Mesh(geometry, this.material));
    this.setTeamPalette(TEAM_PALETTES.default);
  }

  /** Team washes and outlines for the chosen color vision palette. */
  setTeamPalette(palette: TeamPalette): void {
    const uniforms = this.material.uniforms;
    for (const key of ["sunWash", "moonWash", "sunInk", "moonInk"] as const) (uniforms[key]!.value as Color).setHex(palette[key]);
  }

  setSunShafts(enabled: boolean): void { this.material.uniforms.sunShafts!.value = enabled ? 1 : 0; }
  setStainSeed(seed: number): void { this.material.uniforms.stainSeed!.value = seed; }
  setBoil(enabled: boolean): void { this.boil = enabled; }
  setHatch(enabled: boolean): void { this.material.uniforms.hatchStrength!.value = enabled ? 1 : 0; }

  /** Places the horizon band: screen height of the true horizon for this pitch, as a fraction from the bottom. */
  /** Hurt vignette and speed streak strengths, 0 to 1. */
  setFeel(hurt: number, streaks: number): void {
    this.material.uniforms.hurt!.value = hurt;
    this.material.uniforms.streaks!.value = streaks;
  }

  /** Expedition Night modifier, 0 to 1: a dark tint and a shorter view. */
  setNight(amount: number): void { this.material.uniforms.night!.value = amount; }

  setView(pitch: number, yaw: number, fovDegrees: number): void {
    const halfFov = (fovDegrees * Math.PI) / 360;
    this.material.uniforms.horizon!.value = 0.5 - (0.5 * Math.tan(pitch)) / Math.tan(halfFov);
    this.material.uniforms.cameraYaw!.value = yaw;
  }

  resize(width: number, height: number, dpr: number, renderScale = 1): void {
    const pixelWidth = Math.max(1, Math.floor(width * dpr * renderScale));
    const pixelHeight = Math.max(1, Math.floor(height * dpr * renderScale));
    this.world.setSize(pixelWidth, pixelHeight);
    this.viewmodel.setSize(pixelWidth, pixelHeight);
    this.resolution.set(pixelWidth, pixelHeight);
    this.material.uniforms.devicePixelRatio!.value = dpr;
    this.material.uniforms.renderScale!.value = renderScale;
  }

  render(renderer: WebGLRenderer, timeSeconds: number): void {
    this.material.uniforms.time!.value = this.boil ? timeSeconds : 0;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.world.dispose();
    this.viewmodel.dispose();
    this.material.dispose();
  }
}
