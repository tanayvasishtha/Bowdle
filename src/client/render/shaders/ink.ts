export const inkVertexShader = /* glsl */ `
  out vec3 vWorldNormal;
  out vec3 vWorldPosition;
  void main() {
    vec4 local = vec4(position, 1.0);
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      model = modelMatrix * instanceMatrix;
    #endif
    vWorldNormal = normalize(mat3(model) * normal);
    vWorldPosition = (modelMatrix * local).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * local;
  }
`;

export const inkFragmentShader = /* glsl */ `
  precision highp float;
  uniform float materialId;
  uniform float washJitter;
  uniform float contactShade;
  uniform float contactHeight;
  in vec3 vWorldNormal;
  in vec3 vWorldPosition;
  out vec4 gBuffer;

  float patchHash(vec3 position) {
    vec3 cell = floor(position / 3.0);
    return fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 lightDir = normalize(vec3(0.4, 1.0, 0.3));
    float tone = 0.35 + 0.65 * max(dot(normal, lightDir), 0.0);
    tone *= 1.0 + (patchHash(vWorldPosition) - 0.5) * washJitter;
    tone *= mix(1.0 - contactShade, 1.0, clamp(vWorldPosition.y / contactHeight, 0.0, 1.0));
    gBuffer = vec4(normal.xy * 0.5 + 0.5, clamp(tone, 0.0, 1.0), materialId / 255.0);
  }
`;
