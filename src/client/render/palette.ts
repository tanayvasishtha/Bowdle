export const PALETTE = {
  parchment: 0xefe3c6, parchmentShade: 0xd9c79f, sky: 0xa8cfd8, sepia: 0x4a3527,
  sunInk: 0xd2531f, sunWash: 0xf2a05a, moonInk: 0x3346b8, moonWash: 0x8c99e6,
  gold: 0xe3b23c, goldInk: 0x8a5a12, hazard: 0xc9463d, hazardInk: 0x7a1e17,
  stone: 0xc9a66b, carvedStone: 0xb8925a, wood: 0x9c6b3f, canopy: 0x5e8c3a,
  fern: 0x7fae4e, earth: 0x8a6a45, water: 0x3f8f8c, rope: 0xb79b6a,
  canvas: 0xe6d7b0, foliageDark: 0x3f6b2c,
  canopyInk: 0x2f4a22, waterInk: 0x1f5654, foliageInk: 0x25401b,
  legacyRuled: 0xa9c4e8, legacyInk: 0x233c9b,
} as const;

/** Team wash and outline colors per color vision setting. Everything else in the palette stays the same. */
export const TEAM_PALETTES = {
  default: { sunWash: 0xf2a05a, sunInk: 0xd2531f, moonWash: 0x8c99e6, moonInk: 0x3346b8 },
  deuteranopia: { sunWash: 0xf0c04a, sunInk: 0x9a6200, moonWash: 0x6f9ee8, moonInk: 0x1f3f9e },
  protanopia: { sunWash: 0xe8d45a, sunInk: 0x806c00, moonWash: 0x72b8f0, moonInk: 0x1c4f8c },
  tritanopia: { sunWash: 0xef7a8a, sunInk: 0xa3162c, moonWash: 0x5cc8bd, moonInk: 0x11645c },
} as const;
export type TeamPalette = typeof TEAM_PALETTES[keyof typeof TEAM_PALETTES];

export const MATERIAL_ID = {
  background: 0, stone: 1, carvedStone: 2, wood: 3, canopy: 4, fern: 5, earth: 6,
  water: 7, rope: 8, gold: 9, teamSun: 10, teamMoon: 11, hazard: 12, canvas: 13, foliageDark: 14,
} as const;
