# Bowdle retention design (v1.1)

v1 has a solid match and a store, but little to pull a player back tomorrow or into the next match. This doc defines every system v1.1 adds, with exact numbers. `docs/RUNBOOK-RETENTION.md` splits the work into milestones R1 to R6.

## Goals

| Loop | Question it answers | Systems |
|---|---|---|
| Within a match | "Did that feel good?" | Kill feedback, multikill and streak banners, XP ticker |
| Between matches | "Why play one more?" | Post-match sequence, medals, challenge progress, next unlock, auto countdown |
| Between days | "Why come back tomorrow?" | Daily and weekly challenges, play streak, first win of the day |
| Long term | "What am I working toward?" | Level unlock track, career stats, season leaderboard |
| Social | "Who do I play with?" | Party codes and invite links |
| Fairness | "Can a new player win?" | Bot difficulty matched to the room |

Success is measured by the retention report (R6): day 1 and day 7 return rates, matches per session, and the share of sessions that play more than one match.

## Rules that keep it fair

These hold for every system below.

1. No penalties for missing a day beyond losing the streak bonus. Nothing is taken away.
2. No timers on paid items, no paid rerolls, no paid XP boosts, no paid challenge skips. Money buys cosmetics only (ECONOMY.md).
3. Every reward is shown before it is earned: challenge rewards, unlock track, medal XP.
4. No random rewards. Every drop is fixed.
5. No push notifications, emails or other nudges outside the game.
6. Guests get the same systems as linked accounts. Linking only protects progress.

## Match stats

The server tracks these for each human player during a match. They reset on restart.

| Stat | Counts |
|---|---|
| `kills`, `deaths`, `assists` | Already in `PlayerState` |
| `headshots` | Kills where the killing arrow hit the head |
| `longShots` | Arrow kills from `LONG_SHOT_M` (35 m) or more |
| `longestShotM` | Longest arrow kill distance |
| `daggerKills` | Kills with the dagger |
| `boulderKills` | Kills credited through a pulled boulder lever |
| `zipKills` | Kills while the attacker rides a zip line (`zipId` not empty) |
| `robinHoods` | Arrow clashes the player took part in |
| `streak`, `bestStreak` | Kills since the last death, and the best of those |
| `won` | The player's team won (a draw is not a win) |

Stats live on the server only (a `Map` in `TdmRoom`), never in synced state. At match end each human client gets one `matchStats` message with its own stats and medals.

## XP and Ink per match

Replaces `MATCH_XP` in `src/shared/progression.ts`. Ink is unchanged.

| Source | XP |
|---|---|
| Finish the match | 100 |
| Kill | 50 |
| Assist | 25 |
| Headshot kill (on top of the kill) | 25 |
| Long shot kill (on top of the kill) | 25 |
| Rope cut (v2) | 25 |
| Swat (v2) | 25 |
| Win | 200 |
| Each medal, up to 4 | 25 |
| First win of the UTC day | 100 XP and 20 Ink |

`matchReward(stats)` returns the totals and a breakdown list `{ label, xp, ink }[]` in the order shown above. The end screen shows that list.

## Medals

Computed by a pure function `medalsFor(stats, roomBestKills)` in `src/shared/medals.ts`. A player can earn any number; only the first 4 in this order pay XP.

| Id | Name | Condition |
|---|---|---|
| `mvp` | MVP | Most kills in the room, at least 5 (ties all get it) |
| `unstoppable` | Unstoppable | `bestStreak` >= 6 |
| `onARoll` | On a Roll | `bestStreak` >= 3 and not Unstoppable |
| `headhunter` | Headhunter | `headshots` >= 3 |
| `eagleEye` | Eagle Eye | `longestShotM` >= 45 |
| `robinHood` | Robin Hood | `robinHoods` >= 1 |
| `upClose` | Up Close | `daggerKills` >= 1 |
| `trapper` | Trapper | `boulderKills` >= 1 |
| `zipline` | Zipline Hero | `zipKills` >= 1 |
| `teamPlayer` | Team Player | `assists` >= 4 |
| `untouchable` | Untouchable | `won`, `deaths` = 0, `kills` >= 3 |
| `snip` | Snip | `ropeCuts` >= 1 (v2) |
| `swatter` | Swatter | `swats` >= 1 (v2) |
| `relicRunner` | Relic Runner | `relicCaptures` >= 1 (v2) |

## Challenges

`src/shared/challenges.ts` holds the pool and the selection. Progress is stored per account.

### Schedule

- 3 daily challenges, reset at 00:00 UTC. Period key `d:YYYY-MM-DD`.
- 3 weekly challenges, reset Monday 00:00 UTC. Period key `w:YYYY-Www` (ISO week).
- Selection is the same for every player: each challenge in the pool gets a draw from `mulberry32` seeded with the period seed (the day number since 1970-01-01 UTC, or the ISO week number times 100 plus the year) mixed with a hash of its id, and the lowest draws are picked. Adding a challenge to a pool only changes the periods where the new one ranks among the picks (v2; before, a full shuffle reshuffled every period).
- One free daily reroll per account per UTC day. It replaces one unfinished daily with an unused pool entry at 0 progress. Weekly challenges cannot be rerolled.
- A challenge completes the moment progress reaches the target. Its reward is granted at once, in the same transaction as the match that finished it. No claim button.

### Rewards

| Period | Each challenge |
|---|---|
| Daily | 30 Ink and 150 XP |
| Weekly | 120 Ink and 600 XP |

With 3 dailies, a player who finishes them earns 90 Ink a day on top of match Ink, so a 250 to 500 Ink item takes 2 to 5 days of play.

### Daily pool

| Id | Text | Stat | Target |
|---|---|---|---|
| `d.kills` | Tag 12 explorers | kills | 12 |
| `d.headshots` | Land 4 headshots | headshots | 4 |
| `d.wins` | Win 2 matches | won | 2 |
| `d.matches` | Finish 3 matches | matches | 3 |
| `d.longshots` | Get 2 kills from 35 m or more | longShots | 2 |
| `d.dagger` | Get 2 dagger kills | daggerKills | 2 |
| `d.assists` | Earn 5 assists | assists | 5 |
| `d.zip` | Get a kill from a zip line | zipKills | 1 |
| `d.streak` | Get 3 kills without being tagged | streaks3 | 1 |
| `d.scatter` | Get 3 kills with Scatter arrows | scatterKills | 3 |
| `d.relic` | Capture a relic | relicCaptures | 1 |

### Weekly pool

| Id | Text | Stat | Target |
|---|---|---|---|
| `w.kills` | Tag 80 explorers | kills | 80 |
| `w.headshots` | Land 25 headshots | headshots | 25 |
| `w.wins` | Win 10 matches | won | 10 |
| `w.longshots` | Get 12 kills from 35 m or more | longShots | 12 |
| `w.robin` | Split an arrow in mid-air | robinHoods | 1 |
| `w.boulder` | Crush an enemy with the boulder | boulderKills | 1 |
| `w.maps` | Win on all three maps | mapsWon | 3 |
| `w.medals` | Earn 15 medals | medals | 15 |
| `w.tether` | Ride 10 tether lines | tetherRides | 10 |
| `w.wave10` | Reach wave 10 in Expedition | wave10 | 1 |
| `w.colossus` | Defeat a Temple Colossus | colossusKills | 1 |

Derived stats: `matches` adds 1 per finished match; `won` adds 1 per win; `streaks3` adds 1 when `bestStreak` >= 3; `medals` adds the medal count; `mapsWon` counts distinct map ids won this week (stored as a list on the challenge row); `wave10` adds 1 when an Expedition run reaches wave 10.

## Play streak and first win

- A day counts when the account finishes at least one match on that UTC day.
- `streakDays`: +1 if the previous counted day was yesterday, unchanged if today already counted, otherwise reset to 1.
- The first finished match of each day pays a streak bonus of `5 x min(streakDays, 7)` Ink (5 to 35).
- The first win of each day pays 100 XP and 20 Ink.
- The profile shows the streak with the next day's bonus. Losing a streak only resets the bonus.

## Level unlock track

Free items earned by level. They are new catalog entries with price `{ level: n }`, never sold. The 24 bought items stay as they are.

| Level | Reward |
|---|---|
| 3 | Trail `trail.chalk`, "Chalk Line": canvas, dashes |
| 5 | Bow `bow.explorer`, "Explorer's Longbow": earth, gold grip, fins |
| 7 | Kill effect `effect.dust`, "Dust Devil": earth, spark |
| 10 | Outfit `outfit.cartographer`, "Cartographer": canvas hat, water trim, brim, satchel |
| 15 | Trail `trail.fern`, "Fern Wake": canopy, zigzag |
| 20 | Bow `bow.carved`, "Carved Stone Bow": carvedStone, rope grip, prongs |
| 30 | Kill effect `effect.goldrush`, "Gold Rush": gold, cube |
| 50 | Outfit `outfit.veteran`, "Veteran Guide": foliageDark hat, gold trim, aviator, pauldron |
| Any other level from 2 up | `50 + 5 x level` Ink |

Level items are granted in the same transaction as the XP that reaches the level (inventory source `level`), including several levels at once. The locker shows them with "Unlocks at level N" and a progress hint. The profile shows the next reward.

The catalog test changes to: one free default, six bought items and two level items per category.

## In-match feedback

Client only, driven by existing `kill` and `hitConfirm` messages for the local player.

| Event | Feedback |
|---|---|
| Local kill | XP ticker line "+50 Tagged", plus "+25 Headshot" and "+25 Long shot" when they apply |
| 2 kills within 4 s | Banner "DOUBLE TAG" |
| 3 kills within 4 s each | Banner "TRIPLE TAG" |
| 4 or more | Banner "JUNGLE FEVER" |
| Streak reaches 3 | Banner "ON A ROLL" |
| Streak reaches 6 | Banner "UNSTOPPABLE", `happyTime()` |
| Local death | Streak resets; the death screen shows "Streak ended at N" when N >= 3 |

- The XP ticker sits bottom right, keeps the last 4 lines, and fades each line after 2.5 s.
- A small streak counter shows next to the ability boxes while the streak is 2 or more.
- The banner takes the existing `hud.banner` slot. A newer banner replaces an older one.
- Numbers (4 s window, thresholds, fade time) go in `src/shared/constants.ts` or `look.ts` as the AGENTS.md rules require.
- Sounds: a rising three-note paper chime for multikills, generated in `sfx.ts`.

## Post-match sequence

The end screen (`hud.end`) becomes a short sequence. The whole sequence must fit inside `END_SCREEN_MS` (10 s) plus warmup, and every step can be skipped with a click.

1. 0 s: result title, score, the player's line (kills, deaths, best shot, best streak).
2. 0.4 s: medals appear one by one (120 ms apart), each with its name.
3. When `rewards` arrives: the breakdown lines count up, then the XP bar fills from the old value to the new one. A level-up flashes "LEVEL N" and shows any unlocked item as a card with an Equip button (calls `PUT /api/loadout`).
4. Challenge progress: each challenge that moved this match shows its bar moving, and "Done" with the reward when it completes.
5. Footer: map vote, Save clip, Share, "Play again", "New match" (leaves the room and joins a fresh one) and a countdown "Next expedition in N s" from `phaseEndsAtMs`.

Guests whose account could not be created (API down) see steps 1, 2 and 5 only.

## Parties

Friends play in the same room with a code.

- Codes are 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, generated by the client, validated by the server with `^[A-HJ-NP-Z2-9]{6}$`. Invalid codes are rejected in `onAuth`.
- Party matches use their own room name, `party` (`defineRoom(TdmRoom).filterBy(["party"])`). Colyseus only filters on options a joiner sends, so a separate name is what keeps public matchmaking out of party rooms. The `party` room refuses joins without a valid code and `tdm` refuses joins that carry one.
- A party room fills empty slots with bots like any room. Up to 8 humans; friends are placed on the same team while it has room.
- Menu button "Play with friends": create a party (shows the code and a Copy link button on the web build), or join by typing a code. The link is `/?scene=online&party=CODE`.
- The pause menu shows the party code. Portal builds show the code only, no link button.

## Bot difficulty

- When humans join or leave, the room sets every bot's difficulty from the average human level: below 4 easy, below 12 normal, otherwise hard. Guests without an account count as level 1.
- `BotController.setDifficulty()` changes the aim error. The thresholds are constants.
- A player's first 3 finished matches (career `matches` < 3) always get easy bots in their room.

## Profile and career stats

- New account columns, updated by `recordMatch`: `total_matches`, `total_wins`, `total_kills`, `total_headshots`, `best_streak`, `longest_shot_m`, `streak_days`, `last_play_day`, `first_win_day`.
- The profile shows level and next unlock, streak and tomorrow's bonus, and career stats. It also shows the daily and weekly challenges with progress, time to reset, and the reroll button.

## API additions

| Route | Returns |
|---|---|
| `GET /api/challenges` | `{ daily: ChallengeState[], weekly: ChallengeState[], dailyResetAt, weeklyResetAt, rerollAvailable }` |
| `POST /api/challenges/reroll` `{ id }` | The new daily list, or 409 when no reroll is left or the challenge is done |
| `GET /api/profile` | Adds `career`, `streakDays`, `nextUnlock` |

`ChallengeState` is `{ id, text, target, progress, done, reward: { ink, xp } }`.

## Rewards message v2

`rewards` gains `breakdown: { label, xp, ink }[]`, `before: LevelProgress`, `challenges: { id, text, before, after, target, done }[]`, `unlocked: string[]` and `streakDays`. The zod schema in `src/net/messages.ts` validates it.

## Retention report

`npm run retention` (`scripts/retention-report.ts`) reads the database named by `DATABASE_URL` (or `PGLITE_DIR`) and prints:

- accounts created per day for the last 14 days
- day 1 and day 7 return rate: share of accounts created on day D with a finished match on D+1 or D+7
- matches per active account per day
- share of play days with 2 or more matches
- challenge completion rate by challenge id

The server also logs one JSON line per finished match (`matchFinished`: map, humans, bots, duration, score) and per level-up and challenge completion, plus the onboarding funnel steps `menuOpened`, `tutorialDone`, `firstMatch` and `secondMatch` (v2). The logs never include tokens or names.
