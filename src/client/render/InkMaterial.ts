import { GLSL3, ShaderMaterial } from "three";
import { inkFragmentShader, inkVertexShader } from "./shaders/ink.ts";

export class InkMaterial extends ShaderMaterial {
  constructor(materialId: number) {
    super({
      glslVersion: GLSL3,
      uniforms: { materialId: { value: materialId } },
      vertexShader: inkVertexShader,
      fragmentShader: inkFragmentShader,
    });
  }
}
