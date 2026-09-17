import { describe, expect, it } from "vitest";
import {
  RANKED,
  canQueueRanked,
  defaultRating,
  displayedSkill,
  isPlacement,
  pairQueue,
  queueOffersUnranked,
  queueWindow,
  ratingsCompatible,
  softReset,
  tierFor,
  updateRating,
  type OpponentResult,
  type Rating,
} from "../../src/shared/rating.ts";
import { formatPingMs, parseRegions, pickBestRegion } from "../../src/shared/regions.ts";

describe("G12 Glicko-2", () => {
  it("matches the published Glickman example", () => {
    const player: Rating = { rating: 1500, rd: 200, volatility: 0.06 };
    const opponents: OpponentResult[] = [
      { rating: 1400, rd: 30, score: 1 },
      { rating: 1550, rd: 100, score: 0 },
      { rating: 1700, rd: 300, score: 0 },
    ];
    const next = updateRating(player, opponents);
    expect(next.rating).toBeCloseTo(1464.06, 1);
    expect(next.rd).toBeCloseTo(151.52, 1);
    expect(next.volatility).toBeCloseTo(0.05999, 4);
  });

  it("maps tiers from rating - 2*RD", () => {
    expect(tierFor({ rating: 1500, rd: 350, volatility: 0.06 })).toBe("scribble");
    expect(tierFor({ rating: 1500, rd: 100, volatility: 0.06 })).toBe("sketch");
    expect(tierFor({ rating: 2100, rd: 50, volatility: 0.06 })).toBe("masterwork");
    expect(displayedSkill({ rating: 1600, rd: 50, volatility: 0.06 })).toBe(1500);
  });

  it("gates ranked queue and placement", () => {
    expect(canQueueRanked(9, true)).toBe(false);
    expect(canQueueRanked(10, false)).toBe(false);
    expect(canQueueRanked(10, true)).toBe(true);
    expect(isPlacement(0)).toBe(true);
    expect(isPlacement(5)).toBe(false);
  });

  it("widens the queue window and soft-resets RD", () => {
    expect(queueWindow(0)).toBe(50);
    expect(queueWindow(10_000)).toBe(100);
    expect(queueWindow(90_000)).toBe(500);
    const soft = softReset({ rating: 1700, rd: 80, volatility: 0.06 });
    expect(soft.rd).toBe(RANKED.seasonSoftRd);
    expect(soft.rating).toBe(1700);
    expect(ratingsCompatible(defaultRating(), { rating: 1540, rd: 350, volatility: 0.06 }, 0)).toBe(true);
    expect(ratingsCompatible(defaultRating(), { rating: 1600, rd: 350, volatility: 0.06 }, 0)).toBe(false);
  });

  it("pairs by rating with fake clocks and offers unranked after 90s", () => {
    expect(pairQueue([
      { id: "a", rating: 1500, joinedAtMs: 0 },
      { id: "b", rating: 1600, joinedAtMs: 0 },
      { id: "c", rating: 1510, joinedAtMs: 1000 },
    ], 0)).toEqual([
      { id: "a", rating: 1500, joinedAtMs: 0 },
      { id: "c", rating: 1510, joinedAtMs: 1000 },
    ]);
    expect(pairQueue([
      { id: "a", rating: 1500, joinedAtMs: 0 },
      { id: "b", rating: 1700, joinedAtMs: 0 },
    ], 0)).toBeNull();
    expect(pairQueue([
      { id: "a", rating: 1500, joinedAtMs: 0 },
      { id: "b", rating: 1700, joinedAtMs: 0 },
    ], 40_000)).not.toBeNull();
    expect(queueOffersUnranked(0, 89_999)).toBe(false);
    expect(queueOffersUnranked(0, 90_000)).toBe(true);
  });
});

describe("G12 regions", () => {
  it("parses VITE_REGIONS and picks the lowest ping unless overridden", () => {
    expect(parseRegions(undefined)).toEqual([]);
    expect(parseRegions("not-json")).toEqual([]);
    const regions = parseRegions('[{"id":"eu","url":"https://eu.example"},{"id":"us","url":"https://us.example","label":"US"}]');
    expect(regions).toEqual([
      { id: "eu", url: "https://eu.example", label: undefined },
      { id: "us", url: "https://us.example", label: "US" },
    ]);
    const pings = { eu: 80, us: 40 };
    expect(pickBestRegion(regions, pings)?.id).toBe("us");
    expect(pickBestRegion(regions, pings, "eu")?.id).toBe("eu");
    expect(formatPingMs(42.2)).toBe("42 ms");
    expect(formatPingMs(null)).toBe("-");
  });
});

