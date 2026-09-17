/** Glicko-2 ratings and ranked tiers (G12). */

export const GLICKO = {
  scale: 173.7178,
  defaultRating: 1500,
  defaultRd: 350,
  defaultVolatility: 0.06,
  tau: 0.5,
  convergence: 1e-6,
} as const;

export const RANKED = {
  minLevel: 10,
  placementMatches: 5,
  queueWidenMs: 10_000,
  queueWiden: 50,
  queueFallbackMs: 90_000,
  seasonSoftRd: 200,
} as const;

export type Rating = { rating: number; rd: number; volatility: number };
export type OpponentResult = { rating: number; rd: number; score: 0 | 0.5 | 1 };

export const TIERS = [
  { id: "scribble", label: "Scribble", min: Number.NEGATIVE_INFINITY },
  { id: "sketch", label: "Sketch", min: 1200 },
  { id: "ink", label: "Ink", min: 1400 },
  { id: "etching", label: "Etching", min: 1600 },
  { id: "illumination", label: "Illumination", min: 1800 },
  { id: "masterwork", label: "Masterwork", min: 2000 },
] as const;

export type TierId = (typeof TIERS)[number]["id"];

export function defaultRating(): Rating {
  return { rating: GLICKO.defaultRating, rd: GLICKO.defaultRd, volatility: GLICKO.defaultVolatility };
}

/** Conservative displayed skill: rating - 2 * RD. */
export function displayedSkill(rating: Rating): number {
  return rating.rating - 2 * rating.rd;
}

export function tierFor(rating: Rating): TierId {
  const skill = displayedSkill(rating);
  let tier: TierId = "scribble";
  for (const entry of TIERS) if (skill >= entry.min) tier = entry.id;
  return tier;
}

export function tierLabel(id: TierId): string {
  return TIERS.find((entry) => entry.id === id)?.label ?? id;
}

function toMu(rating: number): number {
  return (rating - GLICKO.defaultRating) / GLICKO.scale;
}

function toPhi(rd: number): number {
  return rd / GLICKO.scale;
}

function fromMu(mu: number): number {
  return mu * GLICKO.scale + GLICKO.defaultRating;
}

function fromPhi(phi: number): number {
  return phi * GLICKO.scale;
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

function variance(mu: number, opponents: OpponentResult[]): number {
  let sum = 0;
  for (const opp of opponents) {
    const phiJ = toPhi(opp.rd);
    const e = E(mu, toMu(opp.rating), phiJ);
    const gj = g(phiJ);
    sum += gj * gj * e * (1 - e);
  }
  return 1 / sum;
}

function delta(mu: number, v: number, opponents: OpponentResult[]): number {
  let sum = 0;
  for (const opp of opponents) {
    const phiJ = toPhi(opp.rd);
    sum += g(phiJ) * (opp.score - E(mu, toMu(opp.rating), phiJ));
  }
  return v * sum;
}

function newVolatility(phi: number, v: number, deltaVal: number, sigma: number): number {
  const a = Math.log(sigma * sigma);
  const tau = GLICKO.tau;
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (deltaVal * deltaVal - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - a) / (tau * tau);
  };
  let A = a;
  let B: number;
  if (deltaVal * deltaVal > phi * phi + v) {
    B = Math.log(deltaVal * deltaVal - phi * phi - v);
  } else {
    let k = 1;
    B = a - k * tau;
    while (f(B) < 0) {
      k += 1;
      B = a - k * tau;
    }
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > GLICKO.convergence) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

/** Apply Glicko-2 for one rating period (one or more games). */
export function updateRating(player: Rating, opponents: OpponentResult[]): Rating {
  if (opponents.length === 0) return { ...player };
  const mu = toMu(player.rating);
  const phi = toPhi(player.rd);
  const sigma = player.volatility;
  const v = variance(mu, opponents);
  const deltaVal = delta(mu, v, opponents);
  const sigmaPrime = newVolatility(phi, v, deltaVal, sigma);
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  let sum = 0;
  for (const opp of opponents) {
    const phiJ = toPhi(opp.rd);
    sum += g(phiJ) * (opp.score - E(mu, toMu(opp.rating), phiJ));
  }
  const muPrime = mu + phiPrime * phiPrime * sum;
  return {
    rating: fromMu(muPrime),
    rd: fromPhi(phiPrime),
    volatility: sigmaPrime,
  };
}

/** Soft-reset RD at season start (keep rating, bump RD toward seasonSoftRd). */
export function softReset(rating: Rating): Rating {
  return {
    rating: rating.rating,
    rd: Math.max(rating.rd, RANKED.seasonSoftRd),
    volatility: rating.volatility,
  };
}

/** Queue match band half-width after waitedMs. */
export function queueWindow(waitedMs: number, base = RANKED.queueWiden): number {
  const steps = Math.floor(Math.max(0, waitedMs) / RANKED.queueWidenMs);
  return base + steps * RANKED.queueWiden;
}

export function ratingsCompatible(a: Rating, b: Rating, waitedMs: number): boolean {
  const band = queueWindow(waitedMs);
  return Math.abs(a.rating - b.rating) <= band;
}

export function canQueueRanked(level: number, linked: boolean): boolean {
  return linked && level >= RANKED.minLevel;
}

export function isPlacement(matchesPlayed: number): boolean {
  return matchesPlayed < RANKED.placementMatches;
}

export type QueueSeat = { id: string; rating: number; joinedAtMs: number };

/** Pair the two oldest compatible seats, or null if nobody matches yet. */
export function pairQueue(seats: readonly QueueSeat[], nowMs: number): [QueueSeat, QueueSeat] | null {
  const ordered = [...seats].sort((a, b) => a.joinedAtMs - b.joinedAtMs);
  for (let i = 0; i < ordered.length; i += 1) {
    const a = ordered[i]!;
    const waitedA = nowMs - a.joinedAtMs;
    for (let j = i + 1; j < ordered.length; j += 1) {
      const b = ordered[j]!;
      const band = Math.max(queueWindow(waitedA), queueWindow(nowMs - b.joinedAtMs));
      if (Math.abs(a.rating - b.rating) <= band) return [a, b];
    }
  }
  return null;
}

export function queueOffersUnranked(joinedAtMs: number, nowMs: number): boolean {
  return nowMs - joinedAtMs >= RANKED.queueFallbackMs;
}
