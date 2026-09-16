# Bowdle runbook, retention: v1.1

Builds everything in `docs/RETENTION.md` on top of v1.0.0. Same rules as the other runbooks: one milestone at a time, verify before moving on, commit and tag after each.

| Milestone | What |
|---|---|
| R1 | Match stats, medals, XP breakdown |
| R2 | Challenges, play streak, first win of the day |
| R3 | Level unlock track and career stats |
| R4 | In-match feedback and the post-match sequence |
| R5 | Parties and bot difficulty |
| R6 | Retention report, docs, release QA, v1.1.0 |

## Ground rules for every milestone

- Read `AGENTS.md` and `docs/RETENTION.md` first. RETENTION.md is the source of truth for every number and name. If this runbook and RETENTION.md disagree, follow RETENTION.md and say so in your final message.
- Gameplay numbers go in `src/shared/constants.ts`, render-only numbers in `src/client/render/look.ts`.
- Database changes are new entries appended to `MIGRATIONS` in `src/server/db/migrations.ts`. Never edit an existing migration.
- Every database method gets a test in `tests/server/` using an in-memory `GameDatabase.open()`. Anything that touches SQL also runs in `tests/server/postgres.test.ts` (the postgres.js wire test).
- No new dependencies.
- Gates before committing: `npm run check`, `npm run e2e` (with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` set if the bundled Chromium is missing), `npm run build`, then `npm run smoke`, and `npm run soak` when bots or rooms changed.
- Commit as Tanay Vasishtha only, no trailers, no tool mentions. Message format: `R1: <what changed>`. Then `git tag r1` and `git push origin main --tags`.
- Prepend an entry to `docs/BUILD_LOG.md` for each milestone (Built, Verified, Left). No em dashes in docs or UI copy.

---

## R1: Match stats, medals, XP breakdown

**Prompt:**

```
Build milestone R1 only. Read AGENTS.md and docs/RETENTION.md (Match stats,
XP and Ink per match, Medals).

1. src/shared/matchStats.ts: MatchStats type, createMatchStats(), and pure
   helpers recordKill(stats, { weapon, headshot, distance, onZip }),
   recordDeath(stats), recordRobinHood(stats). Unit tests.
2. src/shared/medals.ts: MEDALS table and medalsFor(stats, roomBestKills)
   exactly as RETENTION.md lists. Unit tests for every medal and the
   On a Roll / Unstoppable exclusion.
3. src/shared/progression.ts: matchReward(stats, medals) returns
   { xp, ink, breakdown } with the XP table from RETENTION.md. Keep Ink
   unchanged. Update existing tests and callers.
4. TdmRoom: keep a Map<sessionId, MatchStats> for humans. Update it in
   dealDamage (kill weapon, headshot, distance from the arrow origin,
   attacker zipId), on deaths, and on Robin Hood clashes. A pulled boulder
   kill counts as boulderKills for the puller. Reset on restart.
5. At match end send each human client a matchStats message
   { stats, medals } (zod schema in src/net/messages.ts), for guests too.
   Pass the stats into grantRewards so recordMatch uses matchReward(stats).
   Keep the idempotency by match id.
6. The rewards message gains breakdown. The end screen lists medals from
   matchStats and the breakdown lines from rewards (simple list for now;
   R4 animates it).
7. Server log: one JSON line matchFinished { mapId, humans, bots,
   durationS, scoreSun, scoreMoon } per match. No names or tokens.
8. Tests: tests/server/match-stats.test.ts drives a room like
   tests/server/rewards.test.ts: a headshot long-range kill, a dagger kill,
   a death resetting the streak, and checks the matchStats message and the
   stored XP.

Stop when the gates in the runbook pass. Commit "R1: ...", tag r1, push.
```

**Verify:** finish a match against bots. The end screen lists medals and an XP breakdown whose lines add up to the total shown in Profile.

**Break it on purpose:** make `recordKill` ignore headshots. The Headhunter medal test and the XP breakdown test must fail. Revert.

---

## R2: Challenges, play streak, first win

**Prompt:**

```
Build milestone R2 only. Read docs/RETENTION.md (Challenges, Play streak
and first win, API additions, Rewards message v2).

1. src/shared/challenges.ts: DAILY_POOL, WEEKLY_POOL, periodKeys(date),
   resetTimes(date), dailyChallenges(date), weeklyChallenges(date) using
   mulberry32 as specified, and progressFrom(stats, challenge) for the
   derived stats. Unit tests: same picks for the same day, different picks
   across days, ISO week keys across a year boundary, 3 distinct picks.
2. Migration 3: account_challenges (account_id, period_key, challenge_id,
   progress, done, maps text default '', primary key over the three,
   cascade on account delete) plus accounts columns streak_days,
   last_play_day, first_win_day, reroll_day.
3. GameDatabase: challenges(accountId, now) returns daily and weekly
   ChallengeState lists with reroll state; rerollDaily(accountId, id);
   recordMatch applies challenge progress, completion rewards, the streak
   bonus and the first win bonus in the same transaction and returns them
   in the granted result (breakdown lines "Daily: <text>", "Streak day N",
   "First win of the day").
4. Routes: GET /api/challenges, POST /api/challenges/reroll.
5. Rewards message v2 fields challenges and streakDays. The end screen
   shows challenge lines that moved (plain list for now).
6. Profile panel: daily and weekly challenges with progress, reset
   countdown, one reroll button; streak with tomorrow's bonus.
7. Tests: tests/server/challenges.test.ts with an injected clock covering
   progress across matches, completion paid once, a second match after
   completion paying nothing more, reroll once per day, rerolling a done
   challenge refused, streak +1 on consecutive days and reset after a gap,
   first win paid once per day, weekly mapsWon counting distinct maps.
   Add a challenge flow to tests/server/postgres.test.ts.
   e2e: tests/e2e/challenges.spec.ts opens Profile and sees 3 daily and
   3 weekly challenges and a working reroll.

Stop when the gates pass. Commit "R2: ...", tag r2, push.
```

**Verify:** play two matches. The dailies move, the Profile countdown is right, and a reroll swaps exactly one daily.

**Break it on purpose:** drop the `done` check so a finished challenge pays again. The "paid once" test must fail. Revert.

---

## R3: Level unlock track and career stats

**Prompt:**

```
Build milestone R3 only. Read docs/RETENTION.md (Level unlock track,
Profile and career stats) and docs/ECONOMY.md (Catalog).

1. src/shared/cosmetics.ts: Price gains { level: number }. Add the eight
   level items with the exact ids, names, paints and styles in
   RETENTION.md. isFree stays false for them. LEVEL_TRACK lists every level
   reward (item or Ink formula) and nextUnlock(level) returns the next one.
   Update the catalog test to "one default, six bought, two level items
   per category" and test LEVEL_TRACK.
2. Level items can never be bought: buyWithInk refuses them
   (reason "not_for_ink") and Xsolla SKUs never include them.
3. Migration 4: career columns total_matches, total_wins, total_kills,
   total_headshots, best_streak, longest_shot_m on accounts.
4. recordMatch: after adding XP, grant every level reward between the old
   and new level (items with inventory source 'level', Ink by formula),
   update career stats, and return unlocked item ids and the Ink lines in
   the breakdown ("Level 12 reward").
5. Profile API and panel: career stats and nextUnlock. Rewards message v2
   field unlocked.
6. Locker: level items show "Unlocks at level N" (disabled) until owned,
   then Equip. Preview works for all of them.
7. Rig and effects must render every new item. Extend the
   CharacterRig and effects unit tests that loop over the catalog.
8. Tests: a jump from level 1 to 11 in one grant unlocks levels 3, 5, 7
   and 10 and pays Ink for 2, 4, 6, 8, 9 and 11; granting the same match
   again unlocks nothing. Career stats add up over three matches.
   e2e: the locker shows a locked level item.

Stop when the gates pass. Commit "R3: ...", tag r3, push.
```

**Verify:** use the dev Ink grant route pattern to add XP in a test account (add a dev-only XP grant next to `/api/dev/grant-ink`, same flag rules), cross level 3 and see Chalk Line appear owned in the locker.

**Break it on purpose:** grant only the item for the new level instead of every level crossed. The multi-level test must fail. Revert.

---

## R4: In-match feedback and the post-match sequence

**Prompt:**

```
Build milestone R4 only. Read docs/RETENTION.md (In-match feedback,
Post-match sequence).

1. src/shared/killFeedback.ts (pure): a KillFeedbackTracker that takes
   local kill and death events with timestamps and returns banner, ticker
   lines and streak count. Unit tests for every threshold and the 4 s
   multikill window.
2. HUD: XP ticker (bottom right, last 4 lines, fade), multikill and streak
   banners through hud.banner, streak counter next to the ability boxes,
   "Streak ended at N" on the death screen. happyTime() on Unstoppable.
3. sfx.ts: generated rising three-note chime for multikills. Respect the
   master volume and the audio bus.
4. End screen sequence as RETENTION.md describes: result, medals one by
   one, breakdown count-up, XP bar fill with level-up flash, unlocked item
   card with Equip, challenge bars, footer with vote, Save clip, Share,
   Play again, New match and the "Next expedition in N s" countdown.
   A click skips to the final state. Use requestAnimationFrame and CSS
   transitions, no timers left running after the panel closes.
5. "New match" leaves the room and joins a fresh public one without a
   page reload if the session can be torn down cleanly; otherwise reload
   to /?scene=online.
6. Timing numbers in look.ts.
7. e2e: tests/e2e/postmatch.spec.ts uses the showEndScreen test hook plus
   a new test hook that injects a matchStats and a rewards payload, then
   checks medals, breakdown lines, the XP bar end width, an unlock card,
   the countdown text, and that a click skips the sequence. A second test
   fires two kill messages 1 s apart through a test hook and sees
   "DOUBLE TAG". Screenshots to test-results/qa/r4/.

Do not change server logic in this milestone.
Stop when the gates pass. Commit "R4: ...", tag r4, push.
```

**Verify:** play a match. Two quick kills show DOUBLE TAG and the ticker. At the end the sequence plays in order and the countdown reaches the next warmup.

**Break it on purpose:** make the tracker ignore the 4 s window. The multikill unit test must fail. Revert.

---

## R5: Parties and bot difficulty

**Prompt:**

```
Build milestone R5 only. Read docs/RETENTION.md (Parties, Bot difficulty).

1. src/shared/party.ts: PARTY_ALPHABET, createPartyCode(rng),
   isPartyCode(value). Unit tests. The client may use crypto random
   values to seed the code; src/shared stays pure.
2. Server: filterBy adds "party". onAuth (or onJoin before placing the
   player) rejects an invalid party code. Party members join the team of
   the first party member while that team has a human slot.
3. OnlineSession.connect takes a party option; main.ts reads ?party=.
   Menu "Play with friends" panel: create (code + Copy link on web,
   code only on portals), join by code with validation. Pause menu shows
   the code.
4. Bot difficulty: BotController.setDifficulty(level). TdmRoom recomputes
   it when humans join or leave from their account levels (guests level 1)
   with the thresholds in constants, and forces easy while any human has
   fewer than 3 career matches. Load the level when the token is
   authenticated.
5. Tests: tests/server/party.test.ts: two clients with the same code share
   a room and a team, a public join never enters it, an invalid code is
   refused. tests/server/bot-difficulty.test.ts: levels 1, 8 and 20 map to
   easy, normal and hard, and a new account forces easy.
   e2e: tests/e2e/party.spec.ts: page A creates a party, page B joins with
   the code, both see each other on the same team.
6. Run npm run soak: all maps still pass.

Stop when the gates pass. Commit "R5: ...", tag r5, push.
```

**Verify:** open two browsers, create a party in one, join with the code in the other. Both land on the same team. A fresh account faces easy bots.

**Break it on purpose:** remove `party` from `filterBy`. The "public join never enters it" test must fail. Revert.

---

## R6: Retention report, docs, release QA, v1.1.0

**Prompt:**

```
Build milestone R6 only. Read docs/RETENTION.md (Retention report).

1. scripts/retention-report.ts and "retention" in package.json, using
   openSql from src/server/db/sql.ts. Add a test that seeds accounts and
   match_rewards rows with fixed dates and checks the printed day 1 and
   day 7 rates (export the pure calculation so the test does not parse
   console output).
2. Server logs: levelUp and challengeCompleted JSON lines (account id
   only, never names or tokens).
3. Docs: GAME.md (medals, streak banners), ECONOMY.md (level track,
   challenge rewards, updated Ink table), README status, AGENTS.md doc
   table (RETENTION.md, RUNBOOK-RETENTION.md), DEPLOY.md (npm run
   retention), BUILD_LOG release entry.
4. Release QA: clean npm ci, npm run check, full e2e, npm run build,
   npm run smoke, npm run soak, npm run build:portals. Screenshots of the
   profile, a finished match end screen and the party panel in
   test-results/qa/r6/.
5. package.json version 1.1.0. Commit "v1.1.0: ...", tag v1.1.0, push.
```

**Verify:** `npm run retention` against a dev database with a few played matches prints sensible numbers. All gates pass on a clean install.

---

## Master prompt for an overnight run

Give Codex this single prompt to run R1 to R6 in order:

```
You are building Bowdle v1.1 in C:\Users\Dell\Desktop\bowdle
(https://github.com/tanayvasishtha/Bowdle, branch main).

Read AGENTS.md, docs/RETENTION.md and docs/RUNBOOK-RETENTION.md. Build
milestones R1, R2, R3, R4, R5 and R6 in that order. For each milestone:

1. Follow its prompt in RUNBOOK-RETENTION.md exactly, plus the ground
   rules at the top of that file.
2. Run the gates: npm run check, npm run e2e, npm run build then
   npm run smoke, and npm run soak when bots or rooms changed. If the
   bundled Playwright Chromium is missing, set
   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to the installed Chrome.
3. Do the "Break it on purpose" step, confirm the named test fails,
   then revert it.
4. Prepend the BUILD_LOG entry, commit as Tanay Vasishtha with the
   message "R<n>: <summary>", tag r<n>, and push to origin main with
   tags.

Commit rules: the only author is Tanay Vasishtha. No Co-authored-by
trailers, no "Generated with" lines, no mention of AI tools or agents
anywhere in commits, branches, code or docs. Never open pull requests.

If a gate fails and you cannot fix it within the milestone's scope,
stop, leave the working tree uncommitted, and write what failed and why.
Never skip or weaken a test to make a gate pass. Do not start the next
milestone until the current one is committed and pushed.
```
