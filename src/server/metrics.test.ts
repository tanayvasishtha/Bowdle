import { describe, expect, it } from "vitest";
import { ServerMetrics } from "./metrics.ts";

describe("server metrics", () => {
  it("reports room, player and average tick gauges", () => {
    const metrics = new ServerMetrics(); metrics.roomOpened(8); metrics.roomOpened(4); metrics.playerDelta(2); metrics.tick(1); metrics.tick(3);
    expect(metrics.takeSnapshot()).toEqual({ rooms: 2, players: 14, averageTickMs: 2 });
    expect(metrics.takeSnapshot().averageTickMs).toBe(0);
    metrics.roomClosed(8); expect(metrics.takeSnapshot()).toMatchObject({ rooms: 1, players: 6 });
  });
});
