import { GLSL3, ShaderMaterial } from "three";
import { JOURNAL_LOOK } from "./look.ts";
import { inkFragmentShader, inkVertexShader } from "./shaders/ink.ts";

export class InkMaterial extends ShaderMaterial {
  constructor(materialId: number) {
    super({
      glslVersion: GLSL3,
      uniforms: {
        materialId: { value: materialId },
        washJitter: { value: JOURNAL_LOOK.washJitter },
        contactShade: { value: JOURNAL_LOOK.contactShade },
        contactHeight: { value: JOURNAL_LOOK.contactHeightM },
      },
      vertexShader: inkVertexShader,
      fragmentShader: inkFragmentShader,
    });
  }
}
