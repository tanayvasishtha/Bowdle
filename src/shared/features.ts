/** Launch feature flags. Old systems stay in the code; flags hide them from players. */
export const features = {
  /** Scatter and tether slots stay compiled but are not selectable at launch. */
  extraArrows: false,
  /** Dagger melee stays compiled but is off at launch. */
  melee: false,
  ranked: false,
  relicRun: false,
  teamDeathmatch: false,
  partyCodes: false,
  lockerShop: false,
  profilePage: false,
  challengesPanel: false,
  leaderboardPage: false,
  pingsWheel: false,
  attractMode: false,
  serviceWorker: false,
  /** Old menu entries (ranked, relic, party, locker, profile, leaderboard, course). */
  legacyMenu: false,
} as const;

export type FeatureFlag = keyof typeof features;

const overrides: Partial<Record<FeatureFlag, boolean>> = {};

export function featureEnabled(flag: FeatureFlag): boolean {
  return overrides[flag] ?? features[flag];
}

/** Test-only: force a flag on or off. Pass undefined to clear. */
export function setFeatureOverride(flag: FeatureFlag, value: boolean | undefined): void {
  if (value === undefined) delete overrides[flag];
  else overrides[flag] = value;
}
