/**
 * Keeps the last few seconds of play ready to save. WebM segments cannot be trimmed or joined in the
 * browser, so two recorders overlap: a new one starts every SEGMENT_MS, and the oldest one still
 * running always holds between SEGMENT_MS and 2 * SEGMENT_MS of footage ending now.
 */
export const SEGMENT_MS = 8000;
const FRAME_RATE = 30;
const BITS_PER_SECOND = 2_500_000;
const TYPES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

type Segment = { recorder: MediaRecorder; chunks: Blob[]; startedAt: number };

export type RecorderFactory = (stream: MediaStream, options: MediaRecorderOptions) => MediaRecorder;

export function clipsSupported(): boolean {
  return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function" && TYPES.some((type) => MediaRecorder.isTypeSupported(type));
}

export class ClipRecorder {
  private readonly stream: MediaStream;
  private readonly mimeType: string;
  private readonly create: RecorderFactory;
  private readonly now: () => number;
  private segments: Segment[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(canvas: HTMLCanvasElement, create: RecorderFactory = (stream, options) => new MediaRecorder(stream, options), now: () => number = performance.now.bind(performance)) {
    this.stream = canvas.captureStream(FRAME_RATE);
    this.mimeType = TYPES.find((type) => typeof MediaRecorder === "undefined" || MediaRecorder.isTypeSupported(type)) ?? "video/webm";
    this.create = create;
    this.now = now;
  }

  start(): void {
    if (this.timer) return;
    this.startSegment();
    this.timer = setInterval(() => this.rotate(), SEGMENT_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const segment of this.segments) if (segment.recorder.state !== "inactive") segment.recorder.stop();
    this.segments = [];
  }

  get activeSegments(): number { return this.segments.length; }

  /** Finishes the longest running segment and returns it as a WebM file. Recording carries on. */
  async save(): Promise<Blob | undefined> {
    const oldest = this.segments.shift();
    if (!oldest) return undefined;
    if (this.segments.length === 0) this.startSegment();
    const finished = new Promise<void>((resolve) => oldest.recorder.addEventListener("stop", () => resolve(), { once: true }));
    if (oldest.recorder.state !== "inactive") oldest.recorder.stop();
    await finished;
    return oldest.chunks.length > 0 ? new Blob(oldest.chunks, { type: this.mimeType.split(";")[0] }) : undefined;
  }

  private startSegment(): void {
    const recorder = this.create(this.stream, { mimeType: this.mimeType, videoBitsPerSecond: BITS_PER_SECOND });
    const segment: Segment = { recorder, chunks: [], startedAt: this.now() };
    recorder.addEventListener("dataavailable", (event) => { if (event.data.size > 0) segment.chunks.push(event.data); });
    recorder.start(1000);
    this.segments.push(segment);
  }

  private rotate(): void {
    this.startSegment();
    // Keep only the two newest segments; anything older is longer than a clip needs.
    while (this.segments.length > 2) {
      const expired = this.segments.shift()!;
      if (expired.recorder.state !== "inactive") expired.recorder.stop();
    }
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function shareOnXUrl(text: string, url = "https://bowdle.io"): string {
  return `https://x.com/intent/tweet?${new URLSearchParams({ text, url }).toString()}`;
}
