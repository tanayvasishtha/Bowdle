# N1 Expedition depth - design notes

Appended for RUNBOOK-V2-1 N1 (2026-09-18). Existing roster stays: Scribble Beetle, Blot Spitter, Stone Guardian, Vine Wisp, Temple Colossus.

## New creatures

### Mire Bloom (area denier)

- **Role:** Force players off a deck or out of a camp. Standing still should hurt.
- **HP / speed:** 80 HP, slow walk (3.0). From wave 5.
- **Behavior:** Walks toward the densest player cluster. Every 4 s plants an ink mire (radius 3.5 m, lasts 6 s) at its feet. Players inside take 8 damage/s and move at 55% speed. The bloom itself is fragile and prefers open floor; it does not chase in melee.
- **Sim:** Pure `stepMire` in `creatures.ts`. Events: `mire` `{ x, z, radius, durationMs }`. No networking special cases beyond existing creature broadcast.
- **Render:** Instanced squat bulb + ground decal ring (one extra draw for active mires, pooled).

### Mycelium Tender (healer)

- **Role:** Punish ignoring support creatures. Leaving it alive makes waves snowball.
- **HP / speed:** 70 HP, 3.5 speed. From wave 7.
- **Behavior:** Stays 8-14 m behind the nearest allied creature (not players). Every 3 s pulses a heal of 12 HP to creatures within 6 m (not itself, not bosses above 90% HP). If no allies remain, it flees toward spawn and only heals when another creature appears.
- **Sim:** `stepTender`. Event: `heal` `{ targets: id[], amount }`. Cap pulse so a single tender cannot outheal focused fire (max 4 targets per pulse).
- **Render:** Instanced soft stalk with a brief heal ring flash on pulse.

## Player-chosen run handicaps

Chosen on the Expedition start card before join. Stored on the room and in `expedition_runs.handicaps` (JSON).

| Id | Effect | Reward mult (XP and Ink) |
|---|---|---|
| `shortLives` | Solo spare lives every 8 waves instead of 5; party starts with -1 revive token | 1.25 |
| `swiftWaves` | Break between waves 5 s instead of 8 s; spawn interval -15% | 1.2 |
| `glassBodies` | Player max HP 75% for the run | 1.35 |

Stacked mults multiply, then clamp so Ink for the run never exceeds the existing per-run Ink cap (30). UI shows the combined mult.

## Weekly Expedition

- Seed = `hash(isoWeekKey)` where `isoWeekKey` is `YYYY-Www` UTC.
- Room option `weekly: true` forces that seed for wave RNG and map pick from the five launch maps (`weeklyMap(seed)`).
- `expedition_runs` gains `seed INTEGER` and `weekly BOOLEAN`; weekly board filters `weekly = true` and current week.
- Client shows "Weekly" on the start card with the shared map name and seed (readable hex) so a result can be verified.

## End-of-run summary

Extend the existing end payload with: `waves[]` of `{ wave, modifier, damageTaken, kills, revives }`, `bestWave`, `personalBest`, `beatBest`, `handicaps`, `seed`, `weekly`. HUD end card lists per-wave rows and a "New best" badge.

## Map coverage

Sky Bridges and Sunken Ruins already ship `creatureSpawns` / `herbSpawns`. N1 verifies waypoint connectivity so creatures can reach every deck (soak + a path test). Add missing links rather than teleporting.
