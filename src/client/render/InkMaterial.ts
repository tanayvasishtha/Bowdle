import { GLSL3, ShaderMaterial } from "three";
import { inkFragmentShader, inkVertexShader } from "./shaders/ink.ts";

export class InkMaterial extends ShaderMaterial {
  constructor(inkId: number) {
    super({
      glslVersion: GLSL3,
      uniforms: { inkId: { value: inkId } },
      vertexShader: inkVertexShader,
      fragmentShader: inkFragmentShader,
    });
  }
}
