export const inkVertexShader = /* glsl */ `
  out vec3 vWorldNormal;
  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const inkFragmentShader = /* glsl */ `
  precision highp float;
  uniform float materialId;
  in vec3 vWorldNormal;
  out vec4 gBuffer;
  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 lightDir = normalize(vec3(0.4, 1.0, 0.3));
    float tone = 0.35 + 0.65 * max(dot(normal, lightDir), 0.0);
    gBuffer = vec4(normal.xy * 0.5 + 0.5, tone, materialId / 255.0);
  }
`;
