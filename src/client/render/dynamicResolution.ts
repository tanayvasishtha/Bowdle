import { DYNAMIC_RESOLUTION } from "./look.ts";

export class DynamicResolution {
  scale = 1;
  /** Soft cap from the graphics preset (G13). */
  ceiling = 1;
  private frameTotalMs = 0;
  private elapsedMs = 0;
  private samples = 0;

  setCeiling(ceiling: number): void {
    this.ceiling = Math.max(DYNAMIC_RESOLUTION.minScale, Math.min(1, ceiling));
    this.scale = Math.min(this.scale, this.ceiling);
  }

  sample(frameMs: number): boolean {
    this.frameTotalMs += frameMs; this.elapsedMs += frameMs; this.samples += 1;
    if (this.elapsedMs < DYNAMIC_RESOLUTION.sampleWindowMs) return false;
    const average = this.frameTotalMs / this.samples;
    this.frameTotalMs = 0; this.elapsedMs = 0; this.samples = 0;
    if (average <= DYNAMIC_RESOLUTION.frameBudgetMs || this.scale <= DYNAMIC_RESOLUTION.minScale) return false;
    this.scale = Math.max(
      DYNAMIC_RESOLUTION.minScale,
      Math.min(this.ceiling, Math.round((this.scale - DYNAMIC_RESOLUTION.step) * 10) / 10),
    );
    return true;
  }
}
