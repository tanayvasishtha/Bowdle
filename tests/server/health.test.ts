import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";

describe("game server", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot(server);
  });

  beforeEach(async () => {
    await colyseus.cleanup();
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it("answers GET /health", async () => {
    const previous = process.env.REGION;
    process.env.REGION = "test-region";
    try {
      const response = await colyseus.http.get("/health");
      expect(response.data).toEqual({ ok: true, region: "test-region" });
    } finally {
      if (previous === undefined) delete process.env.REGION;
      else process.env.REGION = previous;
    }
  });
});
