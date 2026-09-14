import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";

describe("game server", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it("answers GET /health", async () => {
    const response = await colyseus.http.get("/health");
    expect(response.data).toEqual({ ok: true });
  });
});
