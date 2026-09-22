import { describe, expect, it } from "vitest";
import { ONBOARDING } from "../../shared/constants.ts";
import { COURSE_STATIONS, courseStations, emptySnapshot, moveSignals } from "./course.ts";
import { TipScheduler, tipsActive } from "./tips.ts";

describe("tip scheduler", () => {
  it("shows nothing until a move has gone unused for a while", () => {
    const tips = new TipScheduler(0);
    expect(tips.next(ONBOARDING.tipIdleMs - 1, ["reel"])).toBeNull();
    expect(tips.next(ONBOARDING.tipIdleMs, ["reel"])).toBe("reel");
  });

  it("shows at most one tip per interval and each tip once", () => {
    const tips = new TipScheduler(0);
    const start = ONBOARDING.tipIdleMs;
    expect(tips.next(start, ["reel", "dodge"])).toBe("reel");
    expect(tips.next(start + ONBOARDING.tipIntervalMs - 1, ["reel", "dodge"])).toBeNull();
    expect(tips.next(start + ONBOARDING.tipIntervalMs, ["reel", "dodge"])).toBe("dodge");
    expect(tips.next(start + ONBOARDING.tipIntervalMs * 3, ["reel", "dodge"])).toBeNull();
  });

  it("skips moves the player used recently and moves that are not available", () => {
    const tips = new TipScheduler(0);
    tips.used("vineHop", ONBOARDING.tipIdleMs - 10);
    expect(tips.next(ONBOARDING.tipIdleMs, ["vineHop"])).toBeNull();
    expect(tips.next(ONBOARDING.tipIdleMs, [])).toBeNull();
    expect(tips.next(ONBOARDING.tipIdleMs, ["slide"])).toBe("slide");
  });

  it("only runs for the first matches and when the setting is on", () => {
    expect(tipsActive(true, 1)).toBe(true);
    expect(tipsActive(true, ONBOARDING.tipMatches)).toBe(true);
    expect(tipsActive(true, ONBOARDING.tipMatches + 1)).toBe(false);
    expect(tipsActive(false, 1)).toBe(false);
  });
});

describe("course signals", () => {
  it("reads each move from two ticks of state", () => {
    const before = emptySnapshot();
    expect(moveSignals(before, { ...before, grounded: false, airJumps: 0 })).toContain("vineHop");
    expect(moveSignals(before, { ...before, grounded: true, airJumps: 0 })).not.toContain("vineHop");
    expect(moveSignals(before, { ...before, wallJumps: 1 })).toContain("wallJump");
    expect(moveSignals(before, { ...before, mantleCooldownMs: 600 })).toContain("mantle");
    expect(moveSignals({ ...before, mantleCooldownMs: 600 }, { ...before, mantleCooldownMs: 566 })).not.toContain("mantle");
    expect(moveSignals(before, { ...before, sliding: true })).toContain("slide");
    expect(moveSignals(before, { ...before, grappleActive: true, grappleReeling: false })).toContain("swing");
    expect(moveSignals(before, { ...before, grappleActive: true, grappleReeling: true })).toEqual(new Set(["reel"]));
    expect(moveSignals(before, { ...before, dodgeCooldownMs: 1600 })).toContain("dodge");
    expect(moveSignals(before, before).size).toBe(0);
  });

  it("covers the eight moves of the design in order", () => {
    expect(COURSE_STATIONS.map((station) => station.signal)).toEqual(["reach", "vineHop", "slide", "wallJump", "mantle", "swing", "headshot", "swat"]);
    // At launch the course is move, jump, shoot; the swat station needs the dagger, which is off.
    expect(courseStations().map((station) => station.signal)).toEqual(["reach", "vineHop", "headshot"]);
  });
});
