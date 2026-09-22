import { describe, expect, it } from "vitest";
import { KillFeedbackTracker } from "./killFeedback.ts";
const event = (atMs: number) => ({ atMs, headshot: false, distance: 0, weapon: "arrow" as const });

describe("kill feedback", () => {
  it("uses the four-second multikill window, inclusive boundary, and consecutive gaps", () => {
    const tracker = new KillFeedbackTracker();
    expect(tracker.kill(event(0)).banner).toBe("");
    expect(tracker.kill(event(4000)).banner).toBe("DOUBLE TAG");
    expect(tracker.kill(event(8001))).toMatchObject({ banner: "ON A ROLL", multikill: false });
    expect(tracker.kill(event(9001)).banner).toBe("DOUBLE TAG");
    tracker.death(9500);
    expect(tracker.kill(event(9600))).toMatchObject({ banner: "", streak: 1, multikill: false });
  });
  it("shows triple and jungle thresholds, and the 5 and 8 streak banners", () => {
    const tracker = new KillFeedbackTracker();
    const banners = Array.from({ length: 8 }, (_, index) => tracker.kill(event(index * 1000)).banner);
    expect(banners).toEqual(["", "DOUBLE TAG", "TRIPLE TAG", "JUNGLE FEVER", "WILDFIRE", "JUNGLE FEVER", "JUNGLE FEVER", "UNSTOPPABLE"]);
    expect(tracker.death(9000).endedAt).toBe(8); expect(tracker.streak).toBe(0); expect(tracker.bestStreak).toBe(8);
    tracker.reset(); expect(tracker.bestStreak).toBe(0);
  });
  it("shows a spread-out streak and adds arrow-only XP ticker lines", () => {
    const tracker = new KillFeedbackTracker();
    expect(tracker.kill({ ...event(0), headshot: true, distance: 35 }).ticker).toEqual(["+50 Tagged", "+25 Headshot", "+25 Long shot"]);
    expect(tracker.kill({ ...event(5000), weapon: "dagger", headshot: true, distance: 100 }).ticker).toEqual(["+50 Tagged"]);
    expect(tracker.kill(event(10000)).banner).toBe("ON A ROLL");
  });
});
