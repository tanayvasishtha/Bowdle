# Bowdle runbook, part 3: abilities to launch

Same rules: one milestone per task, verify before moving on.

---

## M7: Abilities

**Prompt:**

```
Build milestone M7 only: grapple arrow and ink cloud arrow. Read AGENTS.md,
docs/GAME.md (Abilities) and docs/NETCODE.md.

1. src/shared/sim/abilities.ts: grapple (fire on GRAPPLE press, attach only to
   boxes tagged grapple within GRAPPLE_RANGE, pull, release on jump, distance,
   max time or a second press) and ink cloud (lob on INK press, cloud spawns
   on impact). All grapple fields live in PlayerState so prediction replays
   them. The grapple pull runs inside stepPlayer.
2. Server: ink clouds in MatchState with expiry. Bot line of sight treats
   clouds as blockers. Arrows ignore clouds.
3. Client: grapple rope as a scribbled line, cooldown icons in the HUD, ink
   cloud as scribble spheres. Orange outline on grapple-able boxes while the
   grapple is ready.
4. Bots: use the grapple to reach the perch or the bridge when their path
   would be much shorter, and throw an ink cloud when retreating.
5. Unit tests: grapple attaches only to grapple boxes, respects range,
   releases on each condition; a cloud blocks a line-of-sight ray through its
   center. Server test: a grappling player's server and predicted positions
   match after 60 frames (reuse the M4a comparison helper).

Stop when npm run check and npm run e2e pass.
```

**Verify:** grapple to the bridge from the ground feels fast and controllable, releasing with jump flings you upward, your own grapple never rubber-bands online, an ink cloud blocks your view and makes bots lose you.

**Break it on purpose:** remove `grappleMs` from `PlayerState`. Online grappling should now rubber-band. Revert.

---

## M8: Menus, onboarding and settings

**Prompt:**

```
Build milestone M8 only: menus, onboarding and settings. Read AGENTS.md,
docs/RENDERING.md (HUD, Accessibility) and docs/GAME.md (Controls).

1. Main menu in the doodle style: Play (joins tdm), Practice, Settings.
   Replace the temporary start screen.
2. Name entry on first visit, saved in localStorage, sent with setName.
   Block names from a small built-in word list.
3. Settings saved in localStorage: mouse sensitivity, FOV (80 to 110), master
   volume, boil on or off, colorblind symbols, key rebinding for every action
   in GAME.md.
4. First Practice Range visit shows 5 short prompts in order: move, jump,
   slide, draw and shoot the 10 m target, stab a target. Each prompt clears
   when done. Skippable.
5. Match end screen: result, your kills, deaths and best shot distance, one
   big "Play again" button that keeps you in the same room.
6. Loading screen while connecting, with a retry on failure.
7. Touch devices see a friendly "desktop only for now" screen.
8. Esc menu: resume, settings, leave match.
9. Playwright: from the menu, Practice loads the range; Play reaches the HUD;
   changing FOV in settings persists after reload.

Stop when npm run check and npm run e2e pass.
```

**Verify:** a friend who has never seen the game goes from link to first kill without you explaining anything. Watch them, do not help. Fix whatever confused them before moving on.

---

## M9: Deploy and performance

**Prompt:**

```
Build milestone M9 only: production deploy and performance. Read AGENTS.md and
docs/TECH.md (Scripts, Performance budgets).

1. Production: npm start serves dist/client and the game server on PORT from
   one process. Add /health. Log one JSON line every 10 s with room count,
   player count and average tick time.
2. Dockerfile on node:24-slim: npm ci, npm run build, npm prune --omit=dev,
   CMD node src/server/main.ts. Add .dockerignore.
3. The client reads VITE_SERVER_URL when set (portal builds) and otherwise
   connects to its own origin.
4. Dynamic resolution scaling as TECH.md describes.
5. Hit every budget in TECH.md. Report the measured numbers.
6. docs/DEPLOY.md: step-by-step deploy to one Node host with WebSocket support
   (pick one provider and document it fully), HTTPS, custom domain
   bowdle.io, and how to roll back.

Stop when npm run check passes and docker build succeeds.
```

**Verify:** deploy it, play from two different networks, check the tick time log under load with 2 full rooms of bots, run the latency test from `NETCODE.md` against the real server.

---

## M10: Accounts and progression

**Prompt:**

```
Build milestone M10 only: accounts and progression. Read AGENTS.md and
docs/ECONOMY.md (Principles, Currency, Accounts, Database) and docs/GAME.md
(Rewards).

Install exactly: @colyseus/auth@0.18.2 @colyseus/database@0.18.3
drizzle-orm@0.45.2 @electric-sql/pglite@0.5.8 postgres@3.4.9 with
--save-exact. Read their type definitions before use.

1. GameDatabase with pglite in dev and tests, pg in production.
2. Tables from ECONOMY.md. Migrations run automatically on start.
3. Anonymous sign-in on first visit, Discord and Google linking, onAuth in
   TdmRoom verifying the token.
4. XP and Ink awarded at match end from the recorded events, inside one
   transaction. Levels: level n needs 500 * n XP.
5. Profile panel in the menu: level, XP bar, Ink, "save your progress" button
   for anonymous players. Account deletion.
6. Seasonal leaderboard (kills) using the database leaderboards feature.
7. Server tests with pglite: rewards are granted once per match, an anonymous
   user keeps progress after linking, deletion removes all rows.

Stop when npm run check passes.
```

**Verify:** play a match anonymously, link Discord, open the game in another browser, sign in, progress is there.

---

## M11: Cosmetics and shop

**Prompt:**

```
Build milestone M11 only: cosmetics and the shop. Read AGENTS.md and
docs/ECONOMY.md fully.

1. src/shared/cosmetics.ts with 24 items: 6 per slot, mixed tiers, plus
   defaults. Unit test: every render param is one the renderer supports.
2. Renderer support for every param: bow patterns, arrow trail styles,
   outfits, kill effects.
3. Locker screen: preview on a rotating doodle player, equip, saved loadout.
   Server loads the loadout on join and drops unowned items.
4. Ink shop: buy with Ink inside a transaction.
5. Paid shop (web platform only, linked accounts only): POST /shop/token,
   Pay Station, POST /webhooks/xsolla exactly as ECONOMY.md describes, with
   fixtures in tests/server/fixtures/xsolla/. If fixtures are missing, stop
   and ask for them instead of inventing payloads.
6. VITE_PLATFORM flag hides the paid shop on poki and crazygames.
7. Server tests: valid signature grants, invalid signature rejects, duplicate
   order_paid grants once, cancel revokes, a client cannot equip an unowned
   item.

Stop when npm run check passes.
```

**Before this task:** create the Xsolla project and items, and put sandbox webhook payloads in `tests/server/fixtures/xsolla/`. Add the Xsolla secrets to your Codex environment.

**Verify:** buy an item in Xsolla sandbox, see it granted within seconds, refund it in the Xsolla dashboard, see it removed.

---

## M12: Portals and launch features

**Prompt:**

```
Build milestone M12 only: portal builds and share features. Read AGENTS.md
and docs/ECONOMY.md (Platforms).

1. src/client/platform/: a PlatformAdapter interface (init, loadingDone,
   gameplayStart, gameplayStop, happyTime, breakBetweenMatches) with web
   (no-ops), poki (verified calls in ECONOMY.md) and crazygames
   implementations. For CrazyGames, take exact function names from the docs
   pages listed in ECONOMY.md. If you cannot read them, stop and ask.
2. Mute audio and disable input during ad breaks. Ads only between matches.
3. npm run build:poki and build:crazygames produce separate dist folders with
   VITE_PLATFORM set, no external links except privacy and terms.
4. Save clip: after an arrow cam replay, "Save clip" re-plays it while
   recording the canvas with MediaRecorder and downloads a webm.
5. Share button on the end screen opens an X post intent with the result text
   and the bowdle.io link (web platform only).
6. Privacy policy and terms pages.

Stop when npm run check and npm run e2e pass.
```

**Verify:** upload each build to the portal's developer preview and follow their QA checklist. Save three clips and watch them on your phone.

---

## When Codex goes off the rails

**It built more than one milestone.** Do not salvage it. Close the task, reset to the last verified commit, and start the prompt with: `Build ONLY this milestone. Stop after it.`

**It added or upgraded a dependency.** Paste: `AGENTS.md forbids dependency changes. Revert package.json and package-lock.json and implement this with what is installed.`

**It wrote Colyseus code that does not compile.** It worked from memory. Paste: `Open the .d.ts files listed in docs/TECH.md, quote the exact signatures you need, then rewrite the code to match them.`

**Your player rubber-bands online.** A field used by `stepPlayer` is missing from `PlayerState`, or client and server call the sim differently. Paste: `List every field stepPlayer reads or writes and confirm each exists in PlayerState. Then find any difference between the client reconciler step and the server tick.`

**Arrows appear twice.** Local spawns are happening during reconciler replay. Point it at the replay flag note in `NETCODE.md`.

**Hits land behind moving targets.** Rewind is not being used, or the time base is wrong. Point it at `rewind.lastSeenBy` and the time base rule in `NETCODE.md`.

**A test was changed to make it pass.** Revert the test. Paste: `Tests are the spec. Fix the code, not the test.`

**E2E fails only in Codex cloud with WebGL errors.** Check the setup script installed Chromium with `--with-deps` and that the SwiftShader flags from `playwright.config.ts` are still there.

**Frame rate dropped.** Ask for the F3 numbers. More than 150 draw calls usually means map geometry stopped being merged or effects are allocating per frame.

---

## Launch checklist

- [ ] A match with bots starts within 5 seconds of pressing Play
- [ ] Latency test passed at about 150 ms against the production server
- [ ] 60 fps at 1080p on an integrated GPU laptop
- [ ] Client JS under 900 KB gzipped
- [ ] bowdle.io live over HTTPS with secure WebSockets
- [ ] Privacy policy and terms linked from the menu
- [ ] 20 people playtested: most played a second match without being asked
- [ ] Three clips saved and ready: a long shot, a Robin Hood, a headshot
- [ ] Poki and CrazyGames builds submitted
- [ ] Launch post on X with a clip and the link, pinned
