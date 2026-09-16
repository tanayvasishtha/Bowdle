# Bowdle completion plan

Goal: a finished v1 where every map, character, system and screen is defined, built, tested and checked.

## Where it stands (2026-09-16)

| Area | State |
|---|---|
| Rendering, movement, bow, online play, bots, replays, abilities, menus | Done (M1 to M8) |
| Journal look, map kit, props, three jungle maps, camp, scenery density | Done (W1 to W7) |
| Deploy and performance | Code landed, closing checks never run (M9) |
| Characters | Placeholder: a cylinder with a ball for a head, no limbs, no animation |
| Accounts, progression, cosmetics, shop, portals | Not started (M10 to M12) |

## Phases

Each phase ends the same way: `npm run check` and `npm run e2e` green, a `BUILD_LOG.md` entry, a commit authored by Tanay Vasishtha with no trailers, a tag, a push.

### 1. M9 close-out
- Production smoke: build, start the production server, confirm `/health`, the client page and a WebSocket join on `tdm`.
- Review `DEPLOY.md` against the actual scripts.
- Record the measured budgets. Tag `m9`.
- Docker is not installed on this machine; the image build is checked on a machine that has it.

### 2. C1 Characters
Two explorer crews with identical silhouettes and hitboxes, told apart by color and gear.

| | Sun crew | Moon crew |
|---|---|---|
| Colors | Orange wash, burnt orange ink | Indigo wash, deep blue ink |
| Hat | Wide brim hat | Round knit cap |
| Neck | Sash knotted at the shoulder | Long scarf |
| Back | Rolled map tube and quiver | Lantern and quiver |

- **Proportions** fit the existing hitboxes: 1.8 m tall standing, 1.0 m crouched, head centered on the head hitbox.
- **Rig**: pelvis, spine, head, upper and lower arms, upper and lower legs, a bow in the left hand and a quiver on the back. Built from low-poly primitives in team materials so outlines and hatching work like everything else.
- **Poses** come from a pure function `poseFor(state, time)`, so they can be unit tested: idle breathing, run with speed-scaled stride, crouch, crouch walk, slide, jump, fall, landing squash, bow draw (string hand pulls back with draw fraction), release recoil, dagger stab, grapple throw, zip line hang, wading, hit flinch, death and victory.
- **First person**: sleeves and hands in team color holding the bow, a pull that follows the draw, a dagger stab.
- **Tests**: pose unit tests per state; head mesh stays inside the head hitbox in every pose; `?scene=characters` lineup gallery with screenshots and zero console errors.

### 3. W8 World finish
- Outline weight by depth gap, a hazy canopy band on the horizon, drifting birds.
- More landmark props per map: temple blocks, braziers, stone heads and vine walls at Sun Temple; lanterns, crates and hut details in Canopy Village; carved gate pieces and statues at Lost River.
- Flat collider slabs get matching props on top (pillars, gates, decks).
- Tests: a landmark is visible from both spawns; no tall prop stands inside a lane.

### 4. M10 Accounts and progression
- GameDatabase: PGlite in dev and tests, Postgres (postgres.js) in production, plain SQL with numbered migrations. No ORM and no @colyseus/auth: the account model is small enough to own.
- Anonymous accounts with per-device tokens (only hashes stored). Discord and Google linking switch on only when their keys are set.
- XP and levels (level n needs 500 × n XP), Ink rewards granted once per match, profile panel, seasonal kills leaderboard, account deletion.

### 5. M11 Cosmetics and shop
- 24 items plus defaults across bow skins, arrow trails, outfits and kill effects. Outfits attach to the C1 rig.
- Locker with a rotating preview, Ink shop, loadouts checked by the server.
- Xsolla paid shop behind environment variables, tested with payloads taken from Xsolla's documentation. The paid shop is hidden on portal builds.

### 6. M12 Portals and launch features
- Platform adapters for web, Poki and CrazyGames from their documented SDK calls.
- Ad breaks only between matches, with audio and input muted.
- `build:poki` and `build:crazygames`.
- Save clip from the arrow cam, a share-to-X button, privacy and terms pages.

### 7. Final QA and release
- Clean install, full check, full browser suite, bot matches on every map, production smoke.
- Refresh `README.md` and the build log with a release summary. Tag `v1.0.0`.

## What only Tanay can do

- Create the Discord and Google OAuth apps and the Xsolla merchant project, and add their keys.
- Pick hosting, point the domain, run the Docker build.
- Create the Poki and CrazyGames developer accounts and submit the builds.
- Play it: the feel checks and the 150 ms latency test listed in the build log.
