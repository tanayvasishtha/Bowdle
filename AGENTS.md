# Bowdle: instructions for coding agents

Bowdle is a browser multiplayer bow shooter set inside a hand-drawn notebook. Two teams of 4 fight with bows and arrows. Movement is fast arena style: high run speed, slides, bunny hops, air strafing. Desktop browsers first.

## Read before writing code

| Doc | What it holds |
|---|---|
| `docs/GAME.md` | Rules, controls and every tuning number |
| `docs/TECH.md` | Stack, repo layout, scripts, testing, where to check library APIs |
| `docs/NETCODE.md` | Server authority, prediction, rewind, state and input schemas |
| `docs/RENDERING.md` | How the doodle look is drawn |
| `docs/MAP.md` | Map data format and the first map |
| `docs/ECONOMY.md` | Accounts, skins, payments, portal rules |
| `docs/RUNBOOK-1.md` to `RUNBOOK-3.md` | Milestones, one at a time |

## Commands

```bash
npm ci              # install exact locked versions
npm run dev         # client + game server on http://localhost:5173
npm run check       # typecheck + unit and server tests + build + size budget
npm run e2e         # Playwright browser tests (slower)
npm run typecheck   # client, server and tools tsconfigs
npm test            # Vitest only
```

## Definition of done for every task

1. `npm run check` passes.
2. New logic in `src/shared` has unit tests.
3. If the task touches rendering, input or UI, `npm run e2e` passes.
4. Your final message lists: files changed, tests added, anything left undone.

## Hard rules

- Build only the milestone you were given. Never start the next one.
- Versions are pinned in `package.json`. Do not add, upgrade or remove dependencies unless the task says so. If you think one is needed, stop and explain why.
- `.npmrc` sets `legacy-peer-deps=true` on purpose. Never remove it. If you see `Cannot find package '@colyseus/...'`, stop and report it.
- Verify library APIs against the type definitions in `node_modules` before using them (paths listed in `docs/TECH.md`). Colyseus 0.18 is very different from older versions. Never write Colyseus code from memory.
- Every gameplay number lives in `src/shared/constants.ts`. No magic numbers anywhere else.
- `src/shared` is pure TypeScript. No imports from `three`, `@colyseus/*`, DOM globals or `node:*`. A test enforces this.
- The server is authoritative. Clients send inputs only: movement axes, look angles, button bits. Clients never send positions, hits, damage, draw time or item ownership.
- Client and server run the same simulation functions from `src/shared/sim`.
- No art or audio files. Geometry, textures and sounds are generated in code.
- No TypeScript enums, namespaces, decorators or parameter properties. The server runs on Node's built-in type stripping (`erasableSyntaxOnly` is on). Use `as const` objects and the `schema()` helper from `@colyseus/schema`.
- Relative imports include the `.ts` extension.
- Never copy code or assets from other games (Doodle District, Deadshot, Narrow.One, ColyStrike or any other). Write from these docs.
- Monetization is cosmetic only. Fixed prices. No paid random boxes, no trading, no cash out, nothing that changes damage, speed or hitboxes.
- Secrets come from environment variables. Never commit `.env`.

## Code style

- TypeScript strict. No `any`, except at a library boundary with a comment saying why.
- Small pure functions in `src/shared`. Classes only where a library expects them (Colyseus rooms, three.js objects).
- File names say what the file does: `movement.ts`, `arrows.ts`, `InkMaterial.ts`.
- Comments explain decisions. Do not restate the code.
- No allocations inside per-frame or per-tick loops. Reuse vectors and arrays.
- Use the seeded RNG from `src/shared/math/rng.ts` in simulation code. Never `Math.random()` there.

## Git

- Repository: https://github.com/tanayvasishtha/Bowdle, branch `main`.
- Tanay Vasishtha is the only author. Do not commit, push or open pull requests unless asked.
- Never add `Co-authored-by` trailers, "Generated with" lines, or any mention of AI tools or agents to commit messages, branch names, pull request titles or descriptions, or code comments.

## When something is unclear

- A flaky test means a bug. Fix the cause (seeded RNG, fixed dt). Never add retries or sleeps.
- Docs win over existing code. If two docs disagree, stop and report the conflict.
- If an API named in the docs does not exist in the installed types, stop and report the exact mismatch. Do not guess.
