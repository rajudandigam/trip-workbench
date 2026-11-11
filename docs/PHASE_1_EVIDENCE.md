# Phase 1 evidence

Baseline before Phase 1: `9485a47`. Phase 1 complete commit: `e711e20`. Reliability pass commit: `0691767` (from descendant `a6c7d4a`; Phase 2 already on `main`). Adds disposable-DB isolation, bounded reconcile / submission recheck, prepareReview race refusal, and an optional real native smoke path.

Evidence date: 2026-11-11. Node `v22.22.3`. `puppeteer-core` `25.16.0` (browser path optional). AI mode for this work: `disabled` / fixture only.

## Application gate

| Check | Status | Evidence |
|-------|--------|----------|
| typecheck | pass | `npm run typecheck` |
| lint | pass | `npm run lint` |
| build | pass | `npm run build` |
| test:unit | pass | **49** tests (was 35): refresh merge, recheck snapshots, stalled/401 receipt recovery, submit recheck, prepareReview races, disposable DB URL guard |
| test:api | pass | **6** cases including permissions, events, and sentinel DB-guard refusal |
| test:evals | pass (0 fail) | `evals/evidence/eval-summary-2026-11-11T21-13-13-109Z.json` — **12 pass, 0 fail, 10 blocked, 12 not_run** |
| test:native-smoke | blocked (honest) | `evals/evidence/native-smoke-2026-11-11T21-10-13-257Z.json` — `TW_CHROME_BIN` unset; scripted path ready when WebMCP Chromium is provided |
| Five tools | implemented | `get_trip_draft`, `update_trip_draft`, `validate_trip_draft`, `prepare_trip_review`, `recheck_trip_update` |
| Live Gemini | not required | default work used `AI_MODE=disabled` / fixture |
| Model-directed journeys | not_run / blocked | exact-update, ambiguous-request, premium-cabin ×2 each deferred to a later article |

## Reliability regressions added (this pass)

- `TEST_DATABASE_URL` required before migrate/seed; refuse alias of app `DATABASE_URL` unless `TW_ISOLATED_TEST_DB=1`; sentinel row survives refusal
- `reconcileCommand` bounds each receipt GET (including hung fetches); releases the matching operation on 401 and every terminal exit
- `pendingOutcome.kind` distinguishes `update` vs `submit`; review screen offers **Recheck submission** without a second POST
- `prepareReview` refuses results after an intervening write, unresolved outcome, or leave/reopen of the same draft
- Native smoke: real Puppeteer/WebMCP path when `TW_CHROME_BIN` is set; otherwise blocked with setup notes; evidence is timestamped and marks `modelDirected: false` for scripted runs

## Native / model limitations

`npm run test:native-smoke` reports **blocked** when no WebMCP-capable Chrome is attached (`TW_CHROME_BIN`). Independent Chromium 153 evidence (five traveler tools, three observer tools, one PATCH / one receipt / BOS recovered) remains valid from the external audit pack. Model-directed Cursor runs for the HackerNoon article are still outstanding.

## Article claims supported now

Supported with deterministic evidence:

- Human and agent edits can share a draft without wiping pre-existing unsaved fields on refresh
- Uncertain mutation recovery can reuse the same command ID and preserve later local edits
- Submission uncertainty can be rechecked on the review screen without another POST
- Submission is bound to the reviewed revision, not whatever revision happens to be current later
- An agent can prepare an inline review without submitting; stale prepare results are refused across writes and reentry
- Premium cabin remains a review requirement that can coexist with `canSubmit: true`
- API/eval migrate+seed cannot silently wipe the application database

Not yet supported as live-model article claims:

- Model-selected tool trajectories and explanation accuracy across repeated runs (run exact-update / ambiguous / premium-cabin ×2 through Cursor first)
- Automated native harness **pass** in CI without `TW_CHROME_BIN`

## Repro commands

```bash
# Requires distinct disposable TEST_DATABASE_URL (see .env.example)
npm run typecheck
npm run lint
npm run test:unit
npm run test:api
npm run test:evals
npm run test:native-smoke   # blocked without TW_CHROME_BIN; pass path needs WebMCP Chromium + dist/client
npm run build
```

Optional native pass:

```bash
export TW_CHROME_BIN=/path/to/webmcp-chromium
# TW_ISOLATED_NO_SANDBOX=1  # only if the environment requires it
npm run build && npm run test:native-smoke
```
