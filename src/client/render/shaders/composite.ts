export const compositeVertexShader = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const compositeFragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D worldColor;
  uniform sampler2D worldDepth;
  uniform sampler2D viewColor;
  uniform sampler2D viewDepth;
  uniform vec2 resolution;
  uniform float devicePixelRatio;
  uniform float renderScale;
  uniform float time;
  in vec2 vUv;
  out vec4 outColor;

  const vec3 PAPER = vec3(0.953, 0.933, 0.875);
  const vec3 RULED = vec3(0.663, 0.769, 0.910);
  const vec3 MARGIN = vec3(0.890, 0.604, 0.604);

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  vec2 hash2(vec2 p) {
    return vec2(hash(p), hash(p + vec2(17.2, 91.7)));
  }

  vec3 ink(float id) {
    if (id < 1.5) return vec3(0.137, 0.235, 0.608);
    if (id < 2.5) return vec3(0.820, 0.220, 0.184);
    if (id < 3.5) return vec3(0.184, 0.620, 0.341);
    return vec3(0.941, 0.541, 0.141);
  }

  float linearDepth(float value) {
    float near = 0.1;
    float far = 250.0;
    float z = value * 2.0 - 1.0;
    return (2.0 * near * far) / (far + near - z * (far - near));
  }

  float stripe(float value, float spacing, float width) {
    float d = abs(fract(value / spacing) - 0.5) * spacing;
    return 1.0 - smoothstep(width - fwidth(value), width + fwidth(value), d);
  }

  vec4 compose(sampler2D colorTex, sampler2D depthTex, vec2 uv, vec2 cssPixel, vec2 boil) {
    vec4 center = texture(colorTex, uv);
    float centerId = floor(center.a * 255.0 + 0.5);
    vec2 texel = 1.5 * devicePixelRatio * renderScale / resolution;
    float centerDepth = linearDepth(texture(depthTex, uv).r);
    float depthEdge = 0.0;
    float normalEdge = 0.0;
    float nearestDepth = centerDepth;
    float nearestId = centerId;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 sampleUv = uv + vec2(float(x), float(y)) * texel;
        vec4 sampleColor = texture(colorTex, sampleUv);
        float sampleDepth = linearDepth(texture(depthTex, sampleUv).r);
        depthEdge = max(depthEdge, abs(sampleDepth - centerDepth) / max(centerDepth, 0.01));
        normalEdge = max(normalEdge, length(sampleColor.rg - center.rg));
        if (sampleDepth < nearestDepth) {
          nearestDepth = sampleDepth;
          nearestId = floor(sampleColor.a * 255.0 + 0.5);
        }
      }
    }
    bool edge = depthEdge > 0.08 || normalEdge > 0.35;
    if (centerId < 0.5 && !edge) return vec4(0.0);
    float chosenId = edge ? nearestId : centerId;
    vec3 inkColor = ink(max(chosenId, 1.0));
    if (edge) return vec4(inkColor, 1.0);
    vec2 hatchP = cssPixel + boil;
    float hatch = 0.0;
    if (center.b < 0.80) hatch = max(hatch, stripe(hatchP.x + hatchP.y, 11.314, 1.0));
    if (center.b < 0.55) hatch = max(hatch, stripe(hatchP.x - hatchP.y, 11.314, 1.0));
    if (center.b < 0.30) hatch = max(hatch, stripe(hatchP.y, 5.0, 1.0));
    return vec4(mix(PAPER, inkColor, hatch * 0.55), 1.0);
  }

  void main() {
    vec2 p = gl_FragCoord.xy / devicePixelRatio / renderScale;
    float grain = (hash(floor(p / 2.0)) - 0.5) * 0.04;
    vec3 paper = PAPER + grain;
    float ruled = 1.0 - smoothstep(0.6, 1.8, abs(mod(p.y, 28.0) - 14.0));
    float margin = 1.0 - smoothstep(0.75, 2.25, abs(p.x - 64.0));
    vec3 background = mix(paper, RULED, ruled * 0.6);
    background = mix(background, MARGIN, margin * 0.7);
    float frame = floor(time * 8.0);
    vec2 boil = (hash2(floor(p / 3.0) + frame) - 0.5) * 1.2;
    vec4 world = compose(worldColor, worldDepth, vUv, p, boil);
    vec4 viewmodel = compose(viewColor, viewDepth, vUv, p, boil);
    vec3 color = world.a > 0.0 ? world.rgb : background;
    if (viewmodel.a > 0.0) color = viewmodel.rgb;
    outColor = vec4(color, 1.0);
  }
`;
