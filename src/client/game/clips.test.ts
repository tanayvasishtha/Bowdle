import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClipRecorder, SEGMENT_MS, shareOnXUrl, type RecorderFactory } from "./clips.ts";

class FakeRecorder extends EventTarget {
  state: "inactive" | "recording" = "inactive";
  start(): void { this.state = "recording"; }
  stop(): void {
    this.state = "inactive";
    const event = Object.assign(new Event("dataavailable"), { data: new Blob(["frames"]) });
    this.dispatchEvent(event);
    this.dispatchEvent(new Event("stop"));
  }
}

describe("ClipRecorder", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const canvas = { captureStream: () => ({}) } as unknown as HTMLCanvasElement;

  it("overlaps two segments and saves the oldest while recording continues", async () => {
    const made: FakeRecorder[] = [];
    const factory: RecorderFactory = () => { const recorder = new FakeRecorder(); made.push(recorder); return recorder as unknown as MediaRecorder; };
    const clips = new ClipRecorder(canvas, factory);
    clips.start();
    expect(clips.activeSegments).toBe(1);
    vi.advanceTimersByTime(SEGMENT_MS);
    expect(clips.activeSegments).toBe(2);
    vi.advanceTimersByTime(SEGMENT_MS);
    expect(clips.activeSegments).toBe(2);
    expect(made[0]!.state).toBe("inactive");
    const blob = await clips.save();
    expect(blob?.size).toBeGreaterThan(0);
    expect(blob?.type).toBe("video/webm");
    expect(made[1]!.state).toBe("inactive");
    expect(clips.activeSegments).toBe(1);
    const again = await clips.save();
    expect(again?.size).toBeGreaterThan(0);
    expect(clips.activeSegments).toBe(1);
    clips.stop();
    expect(made.every((recorder) => recorder.state === "inactive")).toBe(true);
    expect(await clips.save()).toBeUndefined();
  });
});

describe("share on X", () => {
  it("builds an intent link with the text and the game URL", () => {
    const url = new URL(shareOnXUrl("7 kills & a 40 m shot"));
    expect(url.origin + url.pathname).toBe("https://x.com/intent/tweet");
    expect(url.searchParams.get("text")).toBe("7 kills & a 40 m shot");
    expect(url.searchParams.get("url")).toBe("https://bowdle.io");
  });
});
