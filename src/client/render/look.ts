export const JOURNAL_LOOK = {
  skyEndFraction: 0.55, grainCellCssPx: 2, grainStrength: 0.03, gridCssPx: 64, gridOpacity: 0.07,
  coffeeOpacity: 0.1, coffeeRadiusMinCssPx: 90, coffeeRadiusMaxCssPx: 160, compassOpacity: 0.2,
  washLight: 0.45, washShade: 0.45, pigmentEdgeCssPx: 3, pigmentEdgeDarken: 0.18,
  hatchCssPx: 9, hatchOpacity: 0.45, hatchLightTone: 0.45, hatchFullTone: 0.25,
  outlineCssPx: 1.8, farOutlineCssPx: 1, boilHz: 6, boilCssPx: 1,
  fadeNearM: 35, fadeFarM: 120, thinOutlineM: 60,
  waterStrokeCssPx: 10, waterDriftCssPxPerSecond: 12, waterStrokeOpacity: 0.5,
  sunShaftCount: 4, sunShaftLighten: 0.12,
  hitMarkerMs: 900,
  washJitter: 0.16, contactShade: 0.2, contactHeightM: 0.6,
  horizonNearCssPx: 70, horizonFarCssPx: 34, horizonNearHaze: 0.5, horizonFarHaze: 0.28, horizonPanCssPxPerRad: 520,
  birdCount: 3, birdCssPx: 7, birdFlapHz: 3, birdDriftCssPxPerSecond: 18,
  colorEdgeWeight: 0.55, depthEdgeFullRatio: 4,
} as const;

/** Explorer body proportions and animation feel. Hip height plus pelvis, torso and head radius
 *  equals the standing head hitbox center (EYE_STAND + 0.05), so the drawn head sits on the hitbox. */
export const CHARACTER_LOOK = {
  hipHeight: 0.93, pelvisHeight: 0.1, torsoLength: 0.45, headRadius: 0.19, headAboveEye: 0.05,
  shoulderWidth: 0.21, shoulderDrop: 0.05, upperArm: 0.3, forearm: 0.28,
  hipWidth: 0.1, hipDrop: 0.02, thigh: 0.46, shin: 0.45,
  bowHalfLength: 0.62, bowBelly: 0.2, nockRest: 0.1, nockPull: 0.5,
  runLean: 0.14, crouchLean: 0.45, slideLean: -0.32, drawLean: 0.08,
  strideLength: 0.42, strideLift: 0.2, strideBaseHz: 0.8, strideHzPerMps: 0.17,
  crouchStrideScale: 0.55, wadeStrideScale: 0.6,
  drawTwist: -0.6, maxHeadPitch: 0.6, stabAnimMs: 260, breathHz: 0.25, zipSwingHz: 0.6,
  carryTilt: 0.25,
} as const;

export const DYNAMIC_RESOLUTION = { frameBudgetMs: 20, sampleWindowMs: 2000, step: 0.1, minScale: 0.6 } as const;
export const HUD_END_MAX_HEIGHT_VH = 90;
export const RETENTION_LOOK = { countSteps: 30, percent: 100, medalStartMs: 400, medalStepMs: 120, breakdownMs: 700, xpMs: 650, challengeMs: 500, footerMs: 250, tickerFadeMs: 2500, transitionMs: 180, bannerMs: 1800, panelWidthVw: 88, panelWidthPx: 760, bodyPx: 18, gapPx: 8, tickerBottomPx: 28, tickerRightPx: 24, streakLeftPx: 280, streakBottomPx: 48 } as const;
export const MULTIKILL_CHIME = { notes: [523.25, 659.25, 783.99], stepS: 0.08, decayS: 0.16, tailS: 0.2, peak: 0.12, floor: 0.001 } as const;

/** Camera feel (V2-DESIGN.md section 2). Distances in metres, angles in degrees, rates per second. */
export const CAMERA_FEEL = {
  speedFovStart: 8, speedFovPerMps: 1.2, speedFovMax: 8, fovEase: 6,
  bobVertical: 0.03, bobLateral: 0.018, bobBaseHz: 1.8, bobHzPerMps: 0.12, bobScaleSpeed: 8, bobScaleMax: 1.2, bobEase: 8,
  strafeRollDeg: 1.2, slideRollDeg: -4, rollEase: 9,
  dipPerMps: 0.012, dipMax: 0.18, dipRecoverMs: 220,
  kickJump: 3, kickDoubleJump: 2, kickDodge: 4, kickSlide: 2.5, kickDecayMs: 250,
  shakeMax: 0.8, shakeDecay: 7, shakeHardLandingMps: 12, shakeLandingPerMps: 0.05, shakeHurtScale: 1, shakeAmplitudeDeg: 1.1, shakeHz: 23,
  hurtMs: 400, hurtAlpha: 0.6,
  streakStartMps: 13, streakFullMps: 20, streakAlpha: 0.35,
} as const;

/** Screen-space shapes for the hurt vignette and speed streaks. */
export const COMPOSITE_FEEL = { streakRays: 48, streakWidth: 0.08, streakDensity: 0.55, streakFlickerHz: 6, streakInner: 0.38, streakOuter: 0.75, hurtInner: 0.32, hurtOuter: 0.85 } as const;

/** Grapple rope: sag while swinging, straight while reeling, and the two pieces that fall after a cut. */
export const ROPE_LOOK = { radius: 0.025, points: 13, wobble: 0.07, swingSag: 0.3, slackSagPerM: 0.5, maxSag: 1.4, snapMs: 550, snapFall: 9, cutHideMs: 300, handOffset: [0.3, -0.32, -0.55] } as const;

/** Audio mix (v2): bus ramps, music layers and intensity, enemy footsteps and screen-edge sound cues. */
export const AUDIO_MIX = {
  busRampS: 0.05, crossfadeS: 1.5, exploreIntensity: 0.4, combatAfterDamageMs: 4000, padFloor: 0.35,
  bpm: 92, padGain: 0.05, kickGain: 0.22, shakerGain: 0.05, melodyGain: 0.06, melodyChance: 0.55,
  footstepRangeM: 18, footstepMinSpeed: 1, footstepRunSpeed: 6, footstepWalkGain: 0.45, walkStrideM: 2, runStrideM: 2.8,
  enemyViewM: 35, shotCueRangeM: 30, cueMs: 900, cueRadius: 0.38,
  defaultMusic: 0.5, defaultEffects: 1, defaultAmbience: 1,
} as const;

/** Relic Run: the relic's size and spin, and the gold halo around its carrier. Free for All name rings. */
export const RELIC_LOOK = { size: 0.45, spinPerS: 1.6, bobM: 0.12, groundLiftM: 0.9, haloRadius: 0.55, haloTube: 0.05, haloHeight: 1.0 } as const;
export const FFA_RING_COLORS = ["#d2531f", "#3346b8", "#e3b23c", "#3f8f8c", "#7a4b2a", "#c9463d", "#5e8c3a", "#8a5a12"] as const;

export const HIT_FEEL = { damageNumberMs: 600, damageNumberRisePx: 46, damageNumberOffsetX: 34, damageNumberOffsetY: -26, killConfirmMs: 250 } as const;
