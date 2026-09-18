import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../src/server/app.config.ts";
import { BTN } from "../../src/shared/input.ts";
import { SCORE_LIMIT, SPAWN_PROTECT_MS } from "../../src/shared/constants.ts";
import type { TdmRoom } from "../../src/server/rooms/TdmRoom.ts";
import type { PlayerInput } from "../../src/net/schema.ts";
import { ArrowState } from "../../src/net/schema.ts";

type WireInput = { data: PlayerInput; send(): void };

describe("authoritative online combat", () => {
  let colyseus: ColyseusTestServer<typeof server>;
  beforeAll(async () => { colyseus = await boot(server); });
  beforeEach(async () => { await colyseus.cleanup(); });
  afterAll(async () => { await colyseus.shutdown(); });

  async function setup() {
    const client = await colyseus.sdk.joinOrCreate("tdm", { name: "Shooter", test: true });
    await client.waitForInitialState();
    const room = colyseus.getRoomById<TdmRoom>(client.roomId); room.state.phase = "live"; room.state.phaseEndsAtMs = Number.MAX_SAFE_INTEGER;
    const shooter = room.state.players.get(client.sessionId)!; shooter.x = -25; shooter.y = 0; shooter.z = -8; shooter.yaw = -Math.PI / 2;
    const input = client.input({ mode: "reliable" });
    return { room, client, input };
  }

  async function fullDraw(room: TdmRoom, input: WireInput, pitch = 0): Promise<void> {
    input.data.yaw = -Math.PI / 2; input.data.pitch = pitch; input.data.buttons = BTN.FIRE;
    for (let frame = 0; frame < 18; frame += 1) { input.send(); await room.waitForNextTimestep(); }
    input.data.buttons = 0; input.send(); await room.waitForNextTimestep();
  }

  it("holding fire then releasing creates one server arrow", async () => {
    const { room, client, input } = await setup();
    room.state.players.get(client.sessionId)!.spawnProtectMs = SPAWN_PROTECT_MS;
    await fullDraw(room, input);
    expect(room.state.arrows.size).toBe(1); expect(room.state.players.get(client.sessionId)!.spawnProtectMs).toBe(0);
  });

  it("a full-draw headshot at 30 m kills and scores", async () => {
    const { room, input } = await setup();
    const target = room.addStationaryPlayer("target", 1, 5, 0, -8);
    await fullDraw(room, input, 0.012);
    for (let frame = 0; frame < 12 && target.alive; frame += 1) await room.waitForNextTimestep();
    expect(target.alive).toBe(false); expect(room.state.scoreSun).toBe(1);
  });

  it("friendly arrows never cause damage", async () => {
    const { room, input } = await setup();
    const teammate = room.addStationaryPlayer("friend", 0, -10, 0, -8);
    await fullDraw(room, input);
    for (let frame = 0; frame < 8; frame += 1) await room.waitForNextTimestep();
    expect(teammate.hp).toBe(100);
  });

  it("the score limit moves the room into the end phase", async () => {
    const { room, input } = await setup(); room.state.scoreSun = SCORE_LIMIT - 1;
    const target = room.addStationaryPlayer("winner", 1, 5, 0, -8);
    await fullDraw(room, input, 0.012);
    for (let frame = 0; frame < 12 && target.alive; frame += 1) await room.waitForNextTimestep();
    expect(room.state.scoreSun).toBe(SCORE_LIMIT); expect(room.state.phase).toBe("end");
  });

  it("head-on enemy arrows destroy each other", async () => {
    const { room } = await setup();
    const left = new ArrowState(); left.x = -1; left.y = 5; left.vx = 95; left.owner = "left"; left.team = 0;
    const right = new ArrowState(); right.x = 1; right.y = 5; right.vx = -95; right.owner = "right"; right.team = 1;
    room.state.arrows.set("left", left); room.state.arrows.set("right", right);
    room.simulateTick({ dt: 1 / 30, dtMs: 1000 / 30, tick: 1, subSteps: 2, subDt: 1 / 60, subDtMs: 1000 / 60 }, 100);
    expect(room.state.arrows.size).toBe(0); expect(room.xpEvents).toHaveLength(2);
  });
});
