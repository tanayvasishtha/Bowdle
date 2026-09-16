# Bowdle characters

Two explorer crews with one shared silhouette and one shared hitbox. Only color and gear tell them apart, so neither team is easier to hit.

## The crews

| | Sun crew | Moon crew |
|---|---|---|
| Shirt | Orange wash, burnt orange ink | Indigo wash, deep blue ink |
| Hat | Khaki pith helmet with a gold band | Indigo knit cap with a gold pompom |
| Across the chest | Gold sash | Indigo scarf with a hanging tail |
| On the back | Quiver and a rolled map tube | Quiver and a gold lantern |
| Shared | Tan skin, brown trousers, leather boots and belt, a bow in the left hand, a dagger drawn only to stab |

Practice Camp targets use the same body as straw dummies (rope and canvas, no bow).

Every name and outfit is generic. No franchise likeness.

## Body

Numbers live in `CHARACTER_LOOK` in `src/client/render/look.ts`.

- 1.8 m tall standing. Hips at 0.93 m.
- Hip height + pelvis + torso + head radius = 1.67 m, the center of the standing head hitbox (`EYE_STAND + 0.05`). Crouched and sliding poses settle the head on the crouched hitbox (`EYE_CROUCH + 0.05`).
- The pose function shifts the hips so the drawn head always sits on the hitbox center, whatever the lean. A unit test checks this for every pose.

## Rig

`src/client/render/characters/CharacterRig.ts`

- One skinned mesh per character, rigidly bound to 16 bones: hips, spine, head, both shoulders, elbows and hands, bow grip, nock, dagger, both hips and knees.
- Parts are merged by material slot, so a character costs 6 to 7 draw calls. Eight players stay far inside the 150 draw call budget.
- The bowstring is split across the grip and nock bones, so pulling the nock stretches the string.
- Materials and geometry are shared by every character of the same crew.

## Poses

`src/client/render/characters/pose.ts` is pure and unit tested. `poseInto(pose, motion, time)` fills a reused pose object.

| Legs (locomotion) | When |
|---|---|
| idle | Standing still |
| run | Moving; stride rate and length follow speed, feet planted by two-bone IK |
| crouch, crouchWalk | Crouched |
| slide | Sliding: lead leg out, lean back |
| jump, fall | Airborne, rising or falling |
| wade | In water |
| zip | Riding a zip line, legs swinging |
| dead | Knocked out (the renderer tips or pins the body) |

| Arms (upper body) | Priority |
|---|---|
| limp | Dead |
| hang | On a zip line |
| stab | Dagger swing, from the melee cooldown |
| grapple | Grapple arrow out |
| draw | Holding a draw: side-on stance, bow up, string hand pulling back with the draw fraction, aim following look pitch |
| hold | Otherwise: bow carried upright at the side, arms swinging with the stride |

The head turns back against the draw twist, so an archer keeps looking at the target.

## First person

`src/client/render/characters/Viewmodel.ts`: team sleeves, both hands, the bow, a string that follows the draw, a nocked arrow while drawing, and a dagger thrust during a stab.

## Where the data comes from

`motionFromSim` in `src/client/render/characters/motion.ts` turns any player simulation (local or replicated) into a `CharacterMotion`. Online play sends it for every player each frame. Wading comes from the water volumes at the current match time.

## Checking it

- `?scene=characters` shows both crews in eight poses: idle, run, crouch, slide, jump, draw, stab and zip.
- `tests/e2e/characters.spec.ts` screenshots the lineup, checks the draw call budget and zooms in on each crew to confirm its color reads.
- `pose.test.ts` and `CharacterRig.test.ts` cover state selection, head alignment, feet reach, stride opposition, draw pull, bow carry, dagger visibility and rig wiring.
