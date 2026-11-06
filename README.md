# Trip Workbench

A business trip request app. A traveler prepares a draft, reviews deterministic policy findings, and submits. Gemini can propose fields from a brief. A browser agent can read, update, and validate the open draft through WebMCP. Both paths use the same application commands. The server owns authorization, validation, and persistence.

Synthetic demo data only. Sessions, PostgreSQL, the WebMCP adapter, and Gemini proposal modes are real integrations. AI mode is explicit: `disabled`, `fixture`, or `live`.

## What works

- Manual journey: sign in, edit, save, review, and submit. Cypress covers this path.
- Development server: Vite on port **3000**, API on port **3001**. Browser calls to `/api` are proxied through Vite.
- Health: `GET /api/health` reports database and migration readiness.
- WebMCP draft tools: `get_trip_draft`, `update_trip_draft`, `validate_trip_draft`, `prepare_trip_review`, and `recheck_trip_update`. Tools cannot create or submit a request. `prepare_trip_review` opens an inline review summary without leaving the editor.
- State handling: dirty-before-refresh edits are preserved; uncertain updates keep original command context; submission is bound to the reviewed revision.
- Gemini proposals in `fixture` mode. Live Gemini stays off unless `GEMINI_API_KEY` is set. A WebMCP demonstration does not need Gemini; the browser agent supplies the model and the tools call this app.

Automated native/model evals remain blocked in Node/Electron. Direct Chrome DevTools sessions are recorded separately. See [docs/PHASE_1_EVIDENCE.md](docs/PHASE_1_EVIDENCE.md) and [docs/RESULTS.md](docs/RESULTS.md).

## Quick start

```bash
cp .env.example .env
npm ci
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000 and sign in as `alex@northstar.demo` / `Password123!`.

`npm run db:seed` resets demo data, including existing drafts. Skip it when you only need to bring a stopped server back.

Confirm the app is ready:

```bash
curl --max-time 5 -i http://localhost:3000/api/health
```

Expected HTTP 200:

```json
{
  "status": "ready",
  "database": true,
  "migrations": true
}
```

`aiMode`, `timeZone`, and `now` are also returned. `"aiMode": "disabled"` is a normal health result. If port 3000 refuses the connection, check the Vite line in the `npm run dev` terminal. If only port 3001 refuses it, check the API startup log. `database: false` means PostgreSQL is down (`npm run doctor`). `migrations: false` means run `npm run db:migrate`.

Production-style boot:

```bash
npm run build
npm start
```

## Demo accounts

| Email | Role | Tenant |
|-------|------|--------|
| alex@northstar.demo | traveler | Northstar Demo |
| jordan@northstar.demo | traveler | Northstar Demo |
| observer@northstar.demo | observer | Northstar Demo |
| casey@cedar.demo | traveler | Cedar Demo |

Password for all: value of `SEED_PASSWORD` (default `Password123!`).

## WebMCP demonstration

Setup details: [docs/WEBMCP_SETUP.md](docs/WEBMCP_SETUP.md).

Use a Chrome build that exposes WebMCP. Sign in, open a draft you own, and confirm the editor says **Saved**. Discover tools on that page, then call them. Read first. Stop if `hasUnsavedChanges` is true. Pass the revision from that read, plus a new `commandId`, to `update_trip_draft`. Validate or `prepare_trip_review` at the revision the update returns. If an update becomes uncertain, call `recheck_trip_update` with the same pending `commandId` — do not invent a new write. Leave submission to the human **Review request** control.

On 2026-10-20 this sequence ran against the open editor `http://localhost:3000/trips/d36292f8-1a73-4ab6-b3ed-ffa3039e02fe` (Alex Morgan):

| Step | Result |
|------|--------|
| Read | Revision 3, draft, no unsaved edits. SFO → JFK, 2026-11-12 to 2026-11-15, round trip, 1 traveler, economy, purpose `customer workshop`. |
| Update | Revision 3 → 4. Round trip, departure 2026-11-19, return 2026-11-22, 2 travelers, business, purpose `Customer planning workshop`. Status stayed `draft`. |
| Validate revision 4 | `valid: true`, no field issues. Policy `demo-policy-v1` returned `PREMIUM_CABIN`: “Premium cabin requires review.” |
| One-way update | Revision 4 → 5. `tripType` `one_way`, `returnDate` cleared. Departure and the other saved fields stayed the same. Still a draft. |
| Stale validate | `expectedRevision: 3` returned `REVISION_CONFLICT`, message “This draft changed.”, `currentRevision: 5`. |

An already loaded editor can keep its form and registered tools after the dev server stops. The next tool call then fails inside the app with `NETWORK_ERROR` / `Failed to fetch`, and the page shows `net::ERR_CONNECTION_REFUSED` for `GET /api/trips/:id`. Restart `npm run dev`, confirm health, reload the editor, and read again before any update. The full walkthrough is [docs/DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite `:3000` + API `:3001` |
| `npm run build` / `npm start` | One-origin production server |
| `npm run test:unit` / `test:api` | Domain and API tests |
| `npm run test:e2e` | Cypress manual journey |
| `npm run test:evals` | Scenario catalog runner (labels blocked/not_run honestly) |
| `npm run test:native-smoke` | Native WebMCP probe (blocked without a WebMCP browser) |
| `npm run doctor` | Environment report |

## Docs

| Doc | Use it for |
|-----|------------|
| [docs/WEBMCP_ROADMAP.md](docs/WEBMCP_ROADMAP.md) | Phased plan; only Phase 1 is active by default |
| [docs/PHASE_1_PLAN.md](docs/PHASE_1_PLAN.md) | Phase 1 checkpoints and completion status |
| [docs/PHASE_1_EVIDENCE.md](docs/PHASE_1_EVIDENCE.md) | Tests, blockers, and article-claim boundaries |
| [docs/WEBMCP_SETUP.md](docs/WEBMCP_SETUP.md) | Browser, Cursor MCP, Inspector, optional Gemini |
| [docs/DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md) | Manual, fixture, and WebMCP walkthrough |
| [docs/RESULTS.md](docs/RESULTS.md) | Recorded checks and the live WebMCP observation |
| [START_HERE.md](START_HERE.md) | Original implementation pack. The app in this repo is already built. |
