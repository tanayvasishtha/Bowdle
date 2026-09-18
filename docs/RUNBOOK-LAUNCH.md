# Runbook: Launch-ready (P1â€“P4)

Same landing rules as other Bowdle runbooks: Masky-friendly, one milestone â†’ `npm run check` (or documented gates) â†’ BUILD_LOG â†’ tag on `main` â†’ push.

## P1 â€” Persistence (tag `p1`)

1. Health reports DB mode; `.env.example` exists.
2. `PGLITE_DIR=.data/pglite` or `DATABASE_URL=...` documented in DEPLOY + LAUNCH-READY.
3. `node --experimental-strip-types scripts/persist-smoke.mjs` (or `tsx` / project runner) passes.
4. BUILD_LOG entry; tag `p1`.

## P2 â€” Capacity (tag `p2`)

1. Document max players/rooms per instance from soak.
2. Matchmaking / queue behavior under full rooms (reject or overflow) is explicit.
3. `serverMetrics` (or equivalent) includes room count + tick ms; alert thresholds written down.

## P3 â€” Load proof (tag `p3`)

1. Add or extend a load script (bots joining TDM/FFA).
2. Record: bots, rooms, avg tick ms, disconnect rate.
3. Pass/fail vs tick budget from NETCODE/DEPLOY.

## P4 â€” Public hardening (tag `p4`)

1. Backup/restore drill with Postgres.
2. Rate limits + report pipeline verified on staging.
3. Portal + custom domain checklist from DEPLOY signed off.

