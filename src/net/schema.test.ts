import { describe, expect, it } from "vitest";
import { notebookMap } from "../shared/maps/notebook.ts";
import { stepPlayer, type PlayerSim } from "../shared/sim/movement.ts";
import { PlayerInput, PlayerState } from "./schema.ts";

function acceptsPlayerSim(player: PlayerSim): PlayerSim {
  return player;
}

describe("network schema", () => {
  it("PlayerState is the complete shared simulation state", () => {
    const player = acceptsPlayerSim(new PlayerState());
    stepPlayer(player, new PlayerInput(), notebookMap, { nowMs: 0 });
    expect(player.height).toBeGreaterThan(0);
  });
});
