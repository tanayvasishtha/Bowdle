# Launch-ready track

Honest path from â€œfun local multiplayerâ€ to a public service. This is **not** a claim of million-user scale.

## Status

| Slice | Tag | Status | What it proves |
|-------|-----|--------|----------------|
| **P1 Persistence** | `p1` | **This slice** | Accounts/progress can survive a process restart (`DATABASE_URL` or `PGLITE_DIR`). `/health` reports `database` mode. |
| **P2 Capacity** | `p2` | TODO | Matchmaking + room limits + metrics under concurrent rooms; multi-instance story (or documented single-node ceiling). |
| **P3 Load proof** | `p3` | TODO | Scripted load test: N bots Ã— M rooms, tick budget held, publish numbers in BUILD_LOG. |
| **P4 Public hardening** | `p4` | TODO | Abuse limits, backup/restore drill, error budgets, crash/alert hooks, CDN/portal checklist signed off. |

## Already in good shape

- Shared sim + Colyseus prediction (right architecture for this genre)
- Docker + Render deploy docs (`docs/DEPLOY.md`)
- Smoke / soak / check gates for day-to-day quality
- OAuth hooks documented when env vars are set

## P1 acceptance

- [x] `databaseMode()` â†’ `postgres` | `pglite` | `memory`
- [x] `GET /health` includes `{ database }`
- [x] `.env.example` documents `DATABASE_URL` / `PGLITE_DIR`
- [x] `npm run persist-smoke` creates a guest, reopens the DB dir, authenticates
- [x] Production without durable config still warns `databaseInMemory`

## What â€œmillions of usersâ€ still needs (later)

Horizontal game servers, regional matchmaking, shared session store, CDN, serious auth/abuse, on-call, and load tests that match marketing claims. Do not ship those claims after P1 alone.

