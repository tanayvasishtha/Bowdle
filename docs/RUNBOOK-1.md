# Bowdle runbook, part 1: setup to Practice Camp

How to use this: one milestone per Codex task. Paste the prompt, let it finish, review the diff, run **Verify** yourself, commit it yourself, then move on.

**Rule for the whole build: never start a milestone until the previous one is verified.** Unverified work compounds into long debugging sessions later.

| Part | Milestones |
|---|---|
| RUNBOOK-1 (this file) | Step 0, M0 scaffold, M1 renderer, M2 movement, M3 bow and Practice Camp |
| RUNBOOK-2 | M4a online movement, M4b online combat, M5 bots, M6 highlight features |
| RUNBOOK-3 | M7 abilities, M8 menus, M9 deploy, M10 accounts, M11 shop, M12 portals, recovery, launch checklist |

---

## Step 0: Repo and Codex (you do this, not Codex)

Repository: https://github.com/tanayvasishtha/Bowdle (branch `main`).

**Tanay Vasishtha is the only author.** No co-author lines, no bot commits, no AI attribution anywhere in the history.

1. Push this folder to the empty repo:

```bash
git init
git add .
git commit -m "Scaffold and build plan"
git branch -M main
git remote add origin https://github.com/tanayvasishtha/Bowdle.git
git push -u origin main
```

2. Turn off Codex commit attribution. Add this near the top of `~/.codex/config.toml`, above any `[section]`:

```toml
commit_attribution = ""
```

3. **Codex CLI:** in your local clone run `npm ci` and `npx playwright install chromium`, then start Codex there.
   **Codex cloud:** connect `tanayvasishtha/Bowdle` and create an environment with Node 24, setup script `npm ci && npx playwright install --with-deps chromium`, agent internet access off.
4. **Every milestone ends the same way:** Codex leaves the changes uncommitted, you run Verify, then you commit and push yourself. For cloud tasks, never press "Create PR". Bring the changes into your local clone with `codex cloud apply <task id>`, verify, then commit.
5. First task, to prove the environment works:

```
Run npm run check and npm run e2e. Report the output. Do not change any files.
```

---

## M0: Scaffold (already done)

The repo ships with pinned dependencies, both tsconfigs, Vite with the Colyseus plugin, Vitest, Playwright, the purity test and a `/health` route.

**Verify:**

```bash
npm ci
npm run check
npm run dev
```

Open http://localhost:5173 (paper-colored page) and http://localhost:5173/health (`{"ok":true}`).

**Break it on purpose:** add `import * as THREE from "three";` to `src/shared/constants.ts` and run `npm test`. The purity test must fail. Revert.

---

## M1: Doodle renderer and maps

**Prompt:**

```
Build milestone M1 only: the doodle renderer and map data. Read AGENTS.md,
docs/RENDERING.md and docs/MAP.md fully before writing code.

1. src/shared/maps/types.ts, helpers.ts (mirrorX, stairs) and sunTemple.ts as
   MAP.md describes. Waypoints can be an empty array for now.
2. src/shared/maps/validate.ts with rules 1 to 5 and 9 from MAP.md. Unit tests:
   notebook passes, plus one broken map per rule that fails that rule.
3. src/client/render/: palette.ts, InkMaterial.ts, CompositePass.ts,
   Renderer.ts, shaders/ as GLSL3 strings. Implement passes A, B and C exactly
   as RENDERING.md specifies.
4. Map meshes merged per ink, plus the sun, two paper planes and spiral rings.
5. A placeholder procedural bow in the viewmodel pass.
6. A temporary free-fly camera (WASD, mouse look, pointer lock on click) at
   /?scene=map so the map can be inspected. M2 replaces it.
7. F3 overlay with fps and draw calls when the URL contains ?debug.
8. When the URL contains ?test, expose window.__bowdleTest.snapshot(), which
   renders one frame and returns { paper, ink } as fractions of composite
   pixels (per-channel tolerance 12) read in the same frame.
9. tests/e2e/render.spec.ts: load /?scene=map&test, use
   page.waitForFunction until window.__bowdleTest exists, then assert
   paper >= 0.40, ink >= 0.02, and no errors from collectErrors in
   tests/e2e/helpers.ts.

Do not build movement physics, shooting, networking or menus.
Stop when npm run check and npm run e2e pass.
```

**Verify:**

```bash
npm run check
npm run e2e
npm run dev
```

Open http://localhost:5173/?scene=map&debug and check:

- Outlines wobble about 8 times per second.
- Faces turned away from the light are hatched, darkest in corners under the bridge.
- Empty background shows ruled lines and the red margin. Geometry does not.
- F3 shows fewer than 40 draw calls.

**Break it on purpose:** make the composite shader output only the paper color. `npm run e2e` must fail on the ink fraction. Revert.

---

## M2: Movement

**Prompt:**

```
Build milestone M2 only: the shared movement simulation and the first-person
controller. Read AGENTS.md, docs/GAME.md (Units, Simulation, Movement, Slide)
and docs/NETCODE.md (the PlayerState field list).

1. src/shared/constants.ts containing every constant from GAME.md and
   NETCODE.md, including ones used in later milestones.
2. src/shared/math/: vec3.ts (allocation-free helpers on plain {x,y,z}),
   rng.ts (seeded mulberry32), angles.ts.
3. src/shared/input.ts: PlayerInputFrame { moveX, moveZ, yaw, pitch, buttons }
   and the BTN flags from NETCODE.md.
4. src/shared/sim/collision.ts: swept AABB movement against solid map boxes,
   with step-up up to STEP_HEIGHT.
5. src/shared/sim/movement.ts: stepPlayer(state, input, map, ctx) running
   SUBSTEPS substeps of dt = 1 / (TICK_HZ * SUBSTEPS). Acceleration, friction,
   jump with coyote time and jump buffer, bunny hop rule, crouch, slide, aim
   slowdown, speed cap. State is a plain interface PlayerSim with exactly the
   PlayerState fields from NETCODE.md. Returns an events array (empty for now).
6. Unit tests from docs/TECH.md: Movement, Determinism, Purity.
7. src/client/game/: OfflineSession.ts (fixed-step accumulator at TICK_HZ,
   render interpolates between the last two sim states), InputSampler.ts
   (pointer lock, WASD, mouse, Space, C and Left Ctrl, right mouse),
   CameraRig.ts (eye height, 80 ms crouch transition, FOV 90, aim FOV 65
   over 120 ms).
8. Replace the M1 free-fly camera: the player spawns at red spawn 1 on the
   launch arena.
9. F3 overlay adds horizontal speed, grounded and sliding.

No shooting, no networking. Stop when npm run check and npm run e2e pass.
```

**Verify:** `npm run check`, `npm run e2e`, then play at http://localhost:5173/?debug:

- Running shows about 8.0 m/s.
- You can jump onto the book stack (1.0 m) but not onto the pencil case (1.3 m).
- Sliding from a full run jumps speed to about 10.5, decays, and ends below 4.
- Holding jump while strafing in the air keeps speed at 8 or more across 5 hops.
- You can walk up both staircases without jumping.
- Running into walls at any angle never sticks you or pushes you inside.

**Break it on purpose:** set `STEP_HEIGHT` to 0.3. The step-up test must fail. Revert.

---

## M3: Bow, arrows, dagger and Practice Camp

**Prompt:**

```
Build milestone M3 only: bow, arrows, dagger, targets and the Practice Camp.
Read AGENTS.md, docs/GAME.md (Bow and arrows, Hitboxes, Dagger, Health),
docs/MAP.md (Practice Camp) and docs/RENDERING.md (Meshes, HUD).

1. src/shared/sim/bow.ts: draw time from held FIRE (compare prevButtons),
   CANCEL, release cooldown, draw fraction, arrow speed and damage.
   stepPlayer now returns { type: "fire" } and { type: "melee" } events with
   everything needed to spawn an arrow or resolve a stab.
2. src/shared/sim/arrows.ts: ArrowSim, spawnArrow, stepArrow with swept sphere
   against solid boxes, and sweepArrowVsTarget returning the earliest hit
   (head wins ties) using hitboxes.ts.
3. src/shared/sim/hitboxes.ts, melee.ts (range, arc, backstab), health.ts
   (damage, regen, death).
4. src/shared/maps/camp.ts, passing validation.
5. Practice Camp at /?scene=camp: standing targets at 10, 20, 30, 45 and
   60 m, moving targets at 25 m (4 m/s) and 40 m (7 m/s). Targets use player
   hitboxes, show damage numbers and respawn after 2 s.
6. Rendering: flying arrows, stuck arrows for 8 s, viewmodel bow pulls back
   with draw fraction, shrinking crosshair, hit marker, headshot pop.
7. src/client/audio/sfx.ts: procedural WebAudio only. Draw creak (filtered
   noise, pitch rises with draw), release twang, wood thunk, body hit,
   headshot pop, dagger swish. Master volume 0.6. Create the AudioContext
   after the first click.
8. Unit tests from docs/TECH.md: Arrows, Bow, Melee.
9. With ?test, add window.__bowdleTest.fireAt(targetId, drawMs): aim the
   camera at the target's head, hold fire for drawMs, release.
   tests/e2e/camp.spec.ts: at /?scene=camp&test, fireAt the 20 m target
   with 600 ms and assert it reports a headshot kill.

No networking, no bots. Stop when npm run check and npm run e2e pass.
```

**Verify:** `npm run check`, `npm run e2e`, then at http://localhost:5173/?scene=camp:

- A full-draw shot at 30 m drops visibly but lands near the crosshair.
- A quick tap shot flies slower and drops much more.
- The 40 m moving target needs a clear lead.
- A dagger stab from behind kills a target in one hit. From the front it takes two.
- Arrows stay stuck in walls, then disappear after about 8 seconds.

**Break it on purpose:** replace the swept arrow check with a point-in-box test after moving. The "95 m/s arrow never passes a 0.1 m wall" test must fail. Revert.
