import {
  BufferAttribute,
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
      },
      vertexShader: compositeVertexShader,
      fragmentShader: compositeFragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new Mesh(geometry, this.material));
  }

  setSunShafts(enabled: boolean): void { this.material.uniforms.sunShafts!.value = enabled ? 1 : 0; }
  setStainSeed(seed: number): void { this.material.uniforms.stainSeed!.value = seed; }

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
    this.material.uniforms.time!.value = timeSeconds;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.world.dispose();
    this.viewmodel.dispose();
    this.material.dispose();
  }
}
