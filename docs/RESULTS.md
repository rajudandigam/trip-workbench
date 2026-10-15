# Results

Base: `c4ef8a6` (remote main at repair start). Working tree dirty with focused repair changes (not committed as part of this task). Evidence date: 2026-10-15.

| Check | Status | Evidence |
|-------|--------|----------|
| typecheck | pass | `npm run typecheck` |
| lint | pass | `npm run lint` |
| build | pass | `npm run build` (also via e2e harness) |
| test:unit | pass | 27 tests (schemas, async-result, races, cancel, logout, fixture, summarizer) |
| test:api | pass | isolated local test DB; includes stale validate `REVISION_CONFLICT` |
| test:e2e | pass | Cypress electron manual journey |
| test:evals | pass (0 fail) | exact case-ID registry: 12 pass / 10 blocked / 12 not_run — `evals/evidence/eval-summary-2026-10-15T20-48-44-330Z.json` |
| native WebMCP | unverified | adapter repaired; browser `document.modelContext` observation not run |
| live Gemini | unverified / blocked | no key required for this repair; fixture mode used |
| model-driven WebMCP | unverified | not observed |

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
