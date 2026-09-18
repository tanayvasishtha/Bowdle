# Build log

## N1 - Expedition depth (2026-09-18)

- Mire Bloom and Mycelium Tender: tuning, sim steps, instanced render, wave unlocks, unit tests.
- Weekly Expedition seed/map helpers; room options `weekly` + `handicaps`; DB columns seed/weekly/handicaps; weekly board query.
- Player-chosen handicaps on the Expedition start card (short lives, swift waves, glass bodies) with stacked reward mults.
- Richer end-of-run summary: damage taken, revives, personal best flag.
- Canopy creature/herb spawns so all five match maps support Expedition.
- e2e screenshots for mire and tender; spawn coverage unit test; soak remains 20 waves per map via bot-soak.


## N2 - Progression, identity and the shop (2026-09-18)

- Ranked tier badge on the scoreboard and end roster via nested `RankState`.
- One season-end cosmetic per tier (`effect.tier.*`), granted once in `season_tier_grants`.
- Expedition cosmetics for wave 10, wave 20, and a Colossus kill.
- Career page: win rate, favorite map, Expedition best, tier history; recent players with party invite and block.
- Daily featured shop shelf from the existing catalog (`/shop/featured`), cosmetic only.
- Server tests: season grant once, recent-player privacy (no account ids), featured day stability.

