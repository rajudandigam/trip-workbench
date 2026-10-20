# Trip Workbench

A business trip request app. A traveler prepares a draft, reviews deterministic policy findings, and submits. Gemini can propose fields from a brief. A browser agent can read, update, and validate the open draft through WebMCP. Both paths use the same application commands. The server owns authorization, validation, and persistence.

Synthetic demo data only. Sessions, PostgreSQL, the WebMCP adapter, and Gemini proposal modes are real integrations. AI mode is explicit: `disabled`, `fixture`, or `live`.

## What works

- Manual journey: sign in, edit, save, review, and submit. Cypress covers this path.
- Development server: Vite on port **3000**, API on port **3001**. Browser calls to `/api` are proxied through Vite.
- Health: `GET /api/health` reports database and migration readiness.
- WebMCP on an open draft, observed in Chrome on 2026-10-19 and 2026-10-20: `get_trip_draft`, `update_trip_draft`, and `validate_trip_draft`. The tools cannot create or submit a request.
- Gemini proposals in `fixture` mode. Live Gemini stays off unless `GEMINI_API_KEY` is set. A WebMCP demonstration does not need Gemini; the browser agent supplies the model and the tools call this app.

Automated evals still mark native `document.modelContext` scenarios as blocked. The live observation below is a direct Chrome DevTools invocation, separate from that harness. See [docs/RESULTS.md](docs/RESULTS.md).

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

Use a Chrome build that exposes WebMCP. Sign in, open a draft you own, and confirm the editor says **Saved**. Discover tools on that page, then call them. Read first. Stop if `hasUnsavedChanges` is true. Pass the revision from that read, plus a new `commandId`, to `update_trip_draft`. Validate the revision the update returns. Read the draft again. Leave submission to the human **Review request** control.

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
| `npm run doctor` | Environment report |

## Docs

| Doc | Use it for |
|-----|------------|
| [docs/DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md) | Manual, fixture, and WebMCP walkthrough |
| [docs/DEMO_AND_TROUBLESHOOTING.md](docs/DEMO_AND_TROUBLESHOOTING.md) | What to explain, observed outcomes, and failure cases |
| [docs/RESULTS.md](docs/RESULTS.md) | Recorded checks and the live WebMCP observation |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Local runtime and capability labels |
| [START_HERE.md](START_HERE.md) | Original implementation pack. The app in this repo is already built. |
