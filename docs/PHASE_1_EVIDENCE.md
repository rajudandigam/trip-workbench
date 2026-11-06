# Phase 1 evidence

Baseline before this work: `9485a47`. Evidence date: 2026-11-05 / 2026-11-06.

## Application gate

| Check | Status | Evidence |
|-------|--------|----------|
| typecheck | pass | `npm run typecheck` |
| lint | pass | `npm run lint` |
| build | pass | `npm run build` |
| test:unit | pass | 35 tests (refresh merge, refresh ordering, recheck snapshots, prepare review, submit binding, races, cancel) |
| test:api | pass | 3 API cases including permissions and stale validate |
| test:e2e | pass | Cypress electron manual journey |
| test:evals | pass (0 fail) | `evals/evidence/eval-summary-2026-11-06T01-34-17-272Z.json` |
| test:native-smoke | blocked | `evals/evidence/native-smoke-2026-11-06T01-34-07-039Z.json` — Node host has no WebMCP browser attachment |
| Five tools | implemented | `get_trip_draft`, `update_trip_draft`, `validate_trip_draft`, `prepare_trip_review`, `recheck_trip_update` |
| Live Gemini | not required | default work used `AI_MODE=disabled` / fixture for unrelated proposal tests |
| Model-directed journeys | blocked | no Cursor/Inspector model trajectory recorded in this session |

## Deterministic regressions added

- Dirty-before-refresh local edit preservation (`mergeAfterRefresh` + coordinator)
- Superseded refresh cannot regress saved revision
- Uncertain update recheck reuses original dispatch snapshots and keeps intervening edits
- Submit bound to reviewed revision + policy; `REVIEW_STALE` when they diverge
- Inline `prepareReview` leaves draft unsubmitted and clears on local edit

## Native / model limitations

`npm run test:native-smoke` intentionally reports **blocked** when this process cannot discover real page tools. Earlier Chrome DevTools sessions (2026-10-20) remain valid evidence for the original three tools. The two new tools (`prepare_trip_review`, `recheck_trip_update`) need a fresh native session before an article claims them from live browser discovery.

## Article claims supported now

Supported with deterministic evidence:

- Human and agent edits can share a draft without wiping pre-existing unsaved fields on refresh
- Uncertain mutation recovery can reuse the same command ID and preserve later local edits
- Submission is bound to the reviewed revision, not whatever revision happens to be current later
- An agent can prepare an inline review without submitting
- Premium cabin remains a review requirement that can coexist with `canSubmit: true`

Not yet supported as live-model article claims:

- Model-selected tool trajectories and explanation accuracy across repeated runs
- Automated native harness pass for all five tools in CI

## Repro commands

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:api
npm run test:e2e
npm run test:evals
npm run test:native-smoke
npm run dev
```
