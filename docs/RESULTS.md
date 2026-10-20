# Results

Repair evidence date: 2026-10-15, starting from `c4ef8a6`. Those repair checks were recorded before the later commit. The WebMCP session further down was observed on 2026-10-20 against the running app.

| Check | Status | Evidence |
|-------|--------|----------|
| typecheck | pass | `npm run typecheck` |
| lint | pass | `npm run lint` |
| build | pass | `npm run build` (also via e2e harness) |
| test:unit | pass | 27 tests (schemas, async-result, races, cancel, logout, fixture, summarizer) |
| test:api | pass | isolated local test DB; includes stale validate `REVISION_CONFLICT` |
| test:e2e | pass | Cypress electron manual journey |
| test:evals | pass (0 fail) | exact case-ID registry: 12 pass / 10 blocked / 12 not_run — `evals/evidence/eval-summary-2026-10-15T20-48-44-330Z.json` |
| native WebMCP | observed, direct calls only | 2026-10-20 Chrome DevTools session below. The 2026-10-15 eval harness still marks native cases blocked. |
| live Gemini | unverified / blocked | no key required for this repair; fixture mode used |
| model-driven WebMCP | unverified | the 2026-10-20 session invoked tools directly; a model-chosen eval trajectory was not recorded |

## Live WebMCP observation (2026-10-20)

Dev server: Vite `http://localhost:3000`, API port 3001, `aiMode` `fixture`. Health returned HTTP 200 with `status: "ready"`, `database: true`, `migrations: true`.

Page: `http://localhost:3000/trips/d36292f8-1a73-4ab6-b3ed-ffa3039e02fe`, signed in as Alex Morgan. Chrome DevTools listed `get_trip_draft`, `update_trip_draft`, and `validate_trip_draft` for that draft id.

| Call | Arguments that matter | Result |
|------|------------------------|--------|
| `get_trip_draft` | draft id above | Revision 3, `draft`, `hasUnsavedChanges: false`. SFO, JFK, 2026-11-12, 2026-11-15, `round_trip`, 1 traveler, `economy`, purpose `customer workshop`. |
| `update_trip_draft` | `expectedRevision` 3, commandId `cursor-demo-20261019-sfo-jfk-roundtrip` | Applied. Revision 4. Round trip, 2026-11-19, 2026-11-22, 2 travelers, `business`, purpose `Customer planning workshop`. Status `draft`. |
| `validate_trip_draft` | `expectedRevision` 4 | `valid: true`, `fieldIssues: []`, policy `demo-policy-v1`, `PREMIUM_CABIN` (“Premium cabin requires review.”), `canSubmit: true`. Not submitted. |
| `get_trip_draft` | same draft | Revision 4 matched the update. |
| `update_trip_draft` | `expectedRevision` 4, commandId `cursor-demo-20261019-one-way`, patch `tripType: one_way`, `returnDate: null` | Applied. Revision 5. Departure 2026-11-19 kept. Status `draft`. |
| `validate_trip_draft` | `expectedRevision` 5 | Still valid. Same premium-cabin review requirement. |
| `validate_trip_draft` | `expectedRevision` 3, on purpose | `REVISION_CONFLICT`, message “This draft changed.”, `currentRevision: 5`, `retry: "refresh_and_review"`. Not retried. |

A prior attempt the same evening discovered the tools, then `get_trip_draft` returned `NETWORK_ERROR` / `Failed to fetch` because `GET /api/trips/:id` was `net::ERR_CONNECTION_REFUSED`. No mutation was sent. After `npm run dev` and a healthy `/api/health`, the editor was reloaded and the table above was recorded.

## Superseded evidence

`evals/evidence/eval-summary-2026-10-14T22-44-45-221Z.json` (18-pass claim) used **inaccurate substring scenario mapping** and is **not** proof of those scenarios. Keep the file only as a historical artifact.

## Repair verification focus (deterministic)

Named regressions cover:

- schema rejection (`purpose: 42`, string `passengerCount`, empty patch, unknown keys, `2026-02-30`)
- partial destination-only save
- `REVISION_CONFLICT` for stale validate revision
- `get_trip_draft` / `refreshSavedDraft` merge preserving local edits
- edit-during-flight three-way merge (RACE-INFLIGHT)
- draft-switch response isolation
- superseded same-draft openDraft ignored
- historical receipt UI non-regression (IDEMPOTENT-OLD-RECEIPT)
- pre-dispatch cancel → `CANCELLED`, zero PATCH
- post-dispatch network loss → `OUTCOME_UNKNOWN` + receipt recheck
- logout keeps CSRF until DELETE succeeds; failed logout does not clear UI session
- fixture AI review/apply saved-state transition (API layer, not native WebMCP)

## Eval layer labels

| Layer | Meaning |
|-------|---------|
| `api_db` | Real HTTP + isolated Postgres |
| `adapter` | Vitest controlled fetch/registration substitutes — **not** native WebMCP |
| `native` | Requires Chrome `document.modelContext` and/or model agent — blocked/unverified |
| `optional_local_ai` | On-device Summarizer — blocked in this Node host |
| `unmapped` | Exact runner not implemented for this repair pass |
