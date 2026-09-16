import { platform } from "./sdk.ts";

export type HappyMoment = "headshot" | "longShot" | "robinHood" | "unstoppable";

/** Big moments tell the portal the player is having fun (CrazyGames happytime). */
export function happyTime(_moment: HappyMoment): void {
  platform().happyTime();
}
