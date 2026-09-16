import { COMPOSITE_FEEL as F, JOURNAL_LOOK as L } from "../look.ts";

export const compositeVertexShader = /* glsl */ `
  out vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
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
  uniform float sunShafts;
  uniform float stainSeed;
  uniform float horizon;
  uniform float cameraYaw;
  uniform float hurt;
  uniform float streaks;
  uniform vec3 sunWash;
  uniform vec3 moonWash;
  uniform vec3 sunInk;
  uniform vec3 moonInk;
  in vec2 vUv;
  out vec4 outColor;

  const vec3 PARCHMENT = vec3(0.937, 0.890, 0.776);
  const vec3 PARCHMENT_SHADE = vec3(0.851, 0.780, 0.624);
  const vec3 SKY = vec3(0.659, 0.812, 0.847);
  const vec3 SEPIA = vec3(0.290, 0.208, 0.153);
  const vec3 CANOPY_HAZE = vec3(0.420, 0.557, 0.408);
  const vec3 CANOPY_INK = vec3(0.184, 0.290, 0.133);

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + vec2(17.2, 91.7))); }

  vec3 wash(float id) {
    if (id < 1.5) return vec3(0.788, 0.651, 0.420);
    if (id < 2.5) return vec3(0.722, 0.573, 0.353);
    if (id < 3.5) return vec3(0.612, 0.420, 0.247);
    if (id < 4.5) return vec3(0.369, 0.549, 0.227);
    if (id < 5.5) return vec3(0.498, 0.682, 0.306);
    if (id < 6.5) return vec3(0.541, 0.416, 0.271);
    if (id < 7.5) return vec3(0.247, 0.561, 0.549);
    if (id < 8.5) return vec3(0.718, 0.608, 0.416);
    if (id < 9.5) return vec3(0.890, 0.698, 0.235);
    if (id < 10.5) return sunWash;
    if (id < 11.5) return moonWash;
    if (id < 12.5) return vec3(0.788, 0.275, 0.239);
    if (id < 13.5) return vec3(0.902, 0.843, 0.690);
    return vec3(0.247, 0.420, 0.173);
  }

  vec3 outline(float id) {
    if (id > 3.5 && id < 5.5) return vec3(0.184, 0.290, 0.133);
    if (id > 6.5 && id < 7.5) return vec3(0.122, 0.337, 0.329);
    if (id > 8.5 && id < 9.5) return vec3(0.541, 0.353, 0.071);
    if (id > 9.5 && id < 10.5) return sunInk;
    if (id > 10.5 && id < 11.5) return moonInk;
    if (id > 11.5 && id < 12.5) return vec3(0.478, 0.118, 0.090);
    if (id > 13.5) return vec3(0.145, 0.251, 0.106);
    return SEPIA;
  }

  float granulation(float id) {
    if (id < 1.5) return 0.6; if (id < 2.5) return 0.7; if (id < 3.5) return 0.4;
    if (id < 4.5) return 0.5; if (id < 5.5) return 0.4; if (id < 6.5) return 0.8;
    if (id < 7.5) return 0.2; if (id < 9.5) return id < 8.5 ? 0.0 : 0.3;
    if (id < 12.5) return id < 11.5 ? 0.2 : 0.0; if (id < 13.5) return 0.3; return 0.5;
  }

  float hatchMode(float id) { if (id < 2.5 || (id > 5.5 && id < 6.5)) return 2.0; if (id < 4.5 || (id > 9.5 && id < 11.5) || id > 12.5) return 1.0; return 0.0; }
  float linearDepth(float value) { float near = 0.1, far = 250.0, z = value * 2.0 - 1.0; return (2.0 * near * far) / (far + near - z * (far - near)); }
  float stroke(float value, float spacing, float width) { float d = abs(fract(value / spacing) - 0.5) * spacing; return 1.0 - smoothstep(width - fwidth(value), width + fwidth(value), d); }

  vec3 journalBackground(vec2 p) {
    float cssHeight = resolution.y / devicePixelRatio / renderScale;
    vec3 base = mix(PARCHMENT, SKY, smoothstep(cssHeight * ${L.skyEndFraction}, cssHeight, p.y));
    base += (hash(floor(p / ${L.grainCellCssPx}.0)) - 0.5) * ${L.grainStrength};
    float grid = max(stroke(p.x, ${L.gridCssPx}.0, 0.45), stroke(p.y, ${L.gridCssPx}.0, 0.45));
    base = mix(base, SEPIA, grid * ${L.gridOpacity});
    for (int index = 0; index < 2; index++) {
      vec2 seed = hash2(vec2(float(index) + stainSeed, float(index) + stainSeed * 0.17));
      vec2 center = vec2(seed.x * resolution.x / devicePixelRatio, seed.y * cssHeight * 0.7);
      float radius = mix(${L.coffeeRadiusMinCssPx}.0, ${L.coffeeRadiusMaxCssPx}.0, hash(seed));
      float ring = 1.0 - smoothstep(1.5, 4.5, abs(length(p - center) - radius));
      base = mix(base, PARCHMENT_SHADE, ring * ${L.coffeeOpacity});
    }
    vec2 roseCenter = vec2(resolution.x / devicePixelRatio - 92.0, cssHeight - 88.0), rose = p - roseCenter;
    float circle = 1.0 - smoothstep(1.0, 2.3, abs(length(rose) - 38.0));
    float axes = max(1.0 - smoothstep(0.6, 1.8, abs(rose.x)), 1.0 - smoothstep(0.6, 1.8, abs(rose.y)));
    float diagonal = max(1.0 - smoothstep(0.6, 1.8, abs(rose.x - rose.y)), 1.0 - smoothstep(0.6, 1.8, abs(rose.x + rose.y)));
    base = mix(base, SEPIA, max(circle, max(axes, diagonal * 0.6)) * ${L.compassOpacity} * smoothstep(60.0, 42.0, length(rose)));
    // Jungle horizon: two crown lines that pan with yaw and sit on the true horizon for the current pitch.
    float horizonPx = horizon * cssHeight, pan = cameraYaw * ${L.horizonPanCssPxPerRad}.0;
    float fx = p.x + pan * 0.6, nx = p.x + pan;
    float farCrown = horizonPx + ${L.horizonFarCssPx}.0 * (0.55 + 0.45 * abs(sin(fx * 0.019 + stainSeed)) + 0.25 * abs(sin(fx * 0.047 + stainSeed * 1.7)));
    float nearCrown = horizonPx + ${L.horizonNearCssPx}.0 * (0.35 + 0.5 * abs(sin(nx * 0.011 + stainSeed * 0.3)) + 0.3 * abs(sin(nx * 0.029 + stainSeed * 2.3)));
    base = mix(base, mix(CANOPY_HAZE, SKY, 0.45), step(p.y, farCrown) * ${L.horizonFarHaze});
    base = mix(base, CANOPY_HAZE, step(p.y, nearCrown) * ${L.horizonNearHaze});
    base = mix(base, CANOPY_INK, (1.0 - smoothstep(0.4, 1.6, abs(p.y - nearCrown))) * 0.45);
    for (int index = 0; index < ${L.birdCount}; index++) {
      float fi = float(index);
      vec2 bird = vec2(mod(hash(vec2(fi, stainSeed)) * 2000.0 + time * ${L.birdDriftCssPxPerSecond}.0 * (0.7 + 0.3 * fi) - pan, resolution.x / devicePixelRatio / renderScale + 80.0) - 40.0, horizonPx + 150.0 + fi * 46.0 + sin(time * 0.4 + fi) * 10.0);
      vec2 d = p - bird; float wing = ${L.birdCssPx}.0, lift = 0.35 + 0.35 * sin(time * ${L.birdFlapHz}.0 * 6.2832 + fi * 2.0);
      float v = abs(d.x) > wing ? 99.0 : abs(d.y - abs(d.x) * lift);
      base = mix(base, SEPIA, (1.0 - smoothstep(0.5, 1.3, v)) * 0.7);
    }
    if (sunShafts > 0.5) {
      float shafts = 0.0;
      for (int index = 0; index < ${L.sunShaftCount}; index++) shafts = max(shafts, stroke(p.x + p.y * 0.55 + time * 3.0 + float(index) * 87.0, 348.0, 22.0));
      base = mix(base, vec3(1.0), shafts * ${L.sunShaftLighten});
    }
    return base;
  }

  vec4 compose(sampler2D colorTex, sampler2D depthTex, vec2 uv, vec2 p, vec2 boil, vec3 background) {
    vec4 center = texture(colorTex, uv); float centerId = floor(center.a * 255.0 + 0.5); float depth = linearDepth(texture(depthTex, uv).r);
    float outlineWidth = mix(${L.outlineCssPx}, ${L.farOutlineCssPx}.0, smoothstep(${L.thinOutlineM}.0, ${L.fadeFarM}.0, depth));
    vec2 texel = outlineWidth * devicePixelRatio * renderScale / resolution;
    float edgeStrength = 0.0, depthEdge = 0.0, nearestDepth = depth, nearestId = centerId;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 sampleUv = uv + vec2(float(x), float(y)) * texel; vec4 sampleColor = texture(colorTex, sampleUv); float sampleDepth = linearDepth(texture(depthTex, sampleUv).r);
      float gap = abs(sampleDepth - depth) / max(depth, 0.01) / 0.08; depthEdge = max(depthEdge, gap);
      edgeStrength = max(edgeStrength, max(gap, length(sampleColor.rg - center.rg) / 0.35));
      if (sampleDepth < nearestDepth) { nearestDepth = sampleDepth; nearestId = floor(sampleColor.a * 255.0 + 0.5); }
    }
    if (centerId < 0.5 && edgeStrength < 1.0) return vec4(0.0);
    float id = edgeStrength >= 1.0 ? nearestId : centerId; vec3 ink = outline(max(id, 1.0));
    if (edgeStrength >= 1.0) {
      // Silhouettes against far things get full ink; creases inside one surface stay lighter.
      float weight = mix(${L.colorEdgeWeight}, 1.0, smoothstep(1.0, ${L.depthEdgeFullRatio}.0, depthEdge));
      vec3 under = centerId < 0.5 ? background : mix(PARCHMENT, wash(centerId), ${L.washLight} + ${L.washShade} * (1.0 - center.b));
      return vec4(mix(mix(under, ink, weight), background, smoothstep(${L.fadeNearM}.0, ${L.fadeFarM}.0, nearestDepth)), 1.0);
    }
    float noise = (hash(floor((p + boil) / 4.0)) - 0.5) * granulation(id) * 0.18;
    vec3 color = mix(PARCHMENT, wash(id), ${L.washLight} + ${L.washShade} * (1.0 - center.b)); color *= 1.0 + noise;
    color *= 1.0 - smoothstep(0.0, 1.0, edgeStrength) * ${L.pigmentEdgeDarken};
    float hatch = 0.0, mode = hatchMode(id); vec2 hp = p + boil;
    if (mode > 0.5 && center.b < ${L.hatchLightTone}) hatch = stroke(hp.x + hp.y, ${L.hatchCssPx * 1.414}, 0.7);
    if (mode > 1.5 && center.b < ${L.hatchFullTone}) hatch = max(hatch, stroke(hp.x - hp.y, ${L.hatchCssPx * 1.414}, 0.7));
    if (id > 6.5 && id < 7.5) hatch = max(hatch, stroke(hp.x + sin(hp.y * 0.03) * 3.0 + time * ${L.waterDriftCssPxPerSecond}.0, ${L.waterStrokeCssPx}.0, 0.8) * ${L.waterStrokeOpacity});
    color = mix(color, ink, hatch * ${L.hatchOpacity});
    color = mix(color, background, smoothstep(${L.fadeNearM}.0, ${L.fadeFarM}.0, depth));
    return vec4(color, 1.0);
  }

  void main() {
    vec2 p = gl_FragCoord.xy / devicePixelRatio / renderScale; vec3 background = journalBackground(p);
    float frame = floor(time * ${L.boilHz}.0); vec2 boil = (hash2(floor(p / 3.0) + frame) - 0.5) * ${L.boilCssPx}.0;
    vec4 world = compose(worldColor, worldDepth, vUv, p, boil, background); vec4 viewmodel = compose(viewColor, viewDepth, vUv, p, boil, background);
    vec3 color = world.a > 0.0 ? world.rgb : background; if (viewmodel.a > 0.0) color = viewmodel.rgb;
    // Screen-edge distance with the aspect ratio removed, 0 at the centre.
    vec2 centred = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
    float edge = length(centred);
    if (streaks > 0.0) {
      // Speed streaks: thin sepia rays near the edges that flicker along with the boil.
      float angle = atan(centred.y, centred.x) / 6.2831853 * ${F.streakRays}.0;
      float ray = 1.0 - smoothstep(0.0, ${F.streakWidth}, abs(fract(angle) - 0.5));
      float lit = step(${F.streakDensity}, hash(vec2(floor(angle), floor(time * ${F.streakFlickerHz}.0))));
      color = mix(color, SEPIA, streaks * ray * lit * smoothstep(${F.streakInner}, ${F.streakOuter}, edge));
    }
    if (hurt > 0.0) color = mix(color, SEPIA, hurt * smoothstep(${F.hurtInner}, ${F.hurtOuter}, edge));
    outColor = vec4(color, 1.0);
  }
`;
