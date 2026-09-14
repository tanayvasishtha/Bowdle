import type { PlayerInputFrame } from "../../shared/input.ts";
import type { MapData } from "../../shared/maps/types.ts";
import { stepPlayer, type PlayerSim, type StepContext } from "../../shared/sim/movement.ts";

export type MovementMatchState = { players: { get(id: string): PlayerSim | undefined } };

export function tickMovement(
  state: MovementMatchState,
  pendingInputs: ReadonlyMap<string, Iterable<PlayerInputFrame>>,
  map: MapData,
  context: StepContext,
): number {
  let applied = 0;
  for (const [sessionId, frames] of pendingInputs) {
    const player = state.players.get(sessionId);
    if (!player) continue;
    for (const frame of frames) {
      stepPlayer(player, frame, map, context);
      applied += 1;
    }
  }
  return applied;
}
