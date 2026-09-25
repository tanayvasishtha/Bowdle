import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import { closeGameDatabase } from "../../src/server/db/GameDatabase.ts";
import { MESSAGE_HEADROOM, type TdmRoom } from "../../src/server/rooms/TdmRoom.ts";
import { TICK_HZ } from "../../src/shared/constants.ts";

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("message flood guard", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); await closeGameDatabase(); });

  /** Sends `count` messages at once and reports whether the server closed the connection for it. */
  async function burst(count: number): Promise<boolean> {
    const client = await colyseus.sdk.joinOrCreate("ffa", { name: "Burst" });
    await client.waitForInitialState();
    // The SDK reconnects on its own after the server closes it, so count the drop on the server.
    const room = colyseus.getRoomById<TdmRoom>(client.roomId);
    let dropped = false;
    const onDrop = room.onDrop.bind(room);
    room.onDrop = (dropping) => { dropped = true; return onDrop(dropping); };
    for (let index = 0; index < count; index += 1) client.send("mapVote", { mapId: "lost-river" });
    await settle(400);
    return dropped;
  }

  it("keeps a player whose inputs arrive bunched, as after a frame hitch or a network stall", async () => {
    // A second of input plus a second of catch-up landing at once. The limit used to be exactly the tick rate.
    expect(await burst(TICK_HZ * 2)).toBe(false);
  });

  it("still disconnects a client that floods the room", async () => {
    expect(await burst(TICK_HZ * MESSAGE_HEADROOM + TICK_HZ)).toBe(true);
  });
});
