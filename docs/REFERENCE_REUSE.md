# Reference reuse

## Inspected repositories

| Repo | Path | Commit | Role |
|------|------|--------|------|
| cypress-test-trust-demo | `/Users/dand/Dev/cypress-test-trust-demo` | `5324585` | Primary Express/Postgres/session/Vite proxy/testing patterns |
| flight-search-demo | `/Users/dand/Dev/flight-search-demo` | `5724318` | Accessible labeled form / controlled input examples |

## Adapted patterns (not copied workflows)

| Source | Adapted into | Notes |
|--------|--------------|-------|
| CTTD `scripts/dev.ts` | `scripts/dev.ts` | Concurrent Vite + API |
| CTTD `vite.config.ts` proxy | `vite.config.ts` | `/api` → API_PORT |
| CTTD `scripts/load-env.ts` | `scripts/load-env.ts` | Optional `.env` loader |
| CTTD `src/server/db/pool.ts` | `src/server/db/pool.ts` | Pool + transactions |
| CTTD session cookie middleware shape | `src/server/middleware/session.ts` | HTTP-only cookie resolve + auth gate |
| CTTD API test helper style | `tests/api/helpers.ts` | Ephemeral listen + cookie login |
| flight-search-demo Field/label habits | `src/client/pages/*` | Explicit labels, focusable controls, no card-heavy hero |

## Explicitly not reused

- Booking / quote / money domain
- `cy.prompt`, adaptive Cloud demos, defect injection scripts
- Intentional false-success conference validators

## Notices

Both reference repositories remain read-only. Trip Workbench has an independent git history and trip-request domain.
