# Implementation log

## Stages

| Stage | Status | Notes |
|-------|--------|-------|
| 0 Foundation | complete | Scaffold, Compose/local Postgres, health, docs |
| 1 Server | complete | Sessions, migrations, seeds, revision/idempotency commands |
| 2 Manual UI | complete | Login → edit → save → review → submit → refresh (Cypress green) |
| 3 WebMCP | complete (native blocked) | Three tools + AbortSignal cleanup; native discovery blocked without `document.modelContext` |
| 4 Gemini | complete (fixture) | Fixture proposals + stale bindings; live blocked without key |
| 5 Evidence | complete | Exact case-ID eval registry + AgentInspect hooks + DEMO_RUNBOOK |
| 6 Summarizer (optional) | complete (API absent) | On-device adapter with honest unavailable path; no auto cloud fallback |
| Repair (2026-10-15) | complete (code-level) | Five focused repairs below; native/model demos remain unverified |

## Chronology

1. Copied implementation pack `docs/` + `evals/` into empty `trip-workbench` repo.
2. Scaffolded React/Vite + Express/pg stack following CTTD structural patterns.
3. Implemented trip domain rules, PostgreSQL schema, session/CSRF, command receipts.
4. Built manual UI coordinator with unsaved-edit protection.
5. Added WebMCP registration adapter (AbortSignal), Gemini fixture/live adapter, Summarizer adapter.
6. Verified with unit/API/Cypress; eval harness labels native/live gaps honestly.
7. **Repair pass (base `c4ef8a6`, dirty tree):** shared Zod tool/patch contracts; coordinator async-result merge + revision monotonicity; execution cancel + receipt reconciliation; logout CSRF ordering; exact case-ID evals + docs.

## Repair areas (2026-10-15)

1. **Tool contract** — `src/domain/trip-schemas.ts`; enforced in WebMCP handlers and HTTP `parseTripPatch`; `validate_trip_draft` passes caller `expectedRevision`; `get_trip_draft` refreshes via GET.
2. **Human edits / draft identity / revision order** — `src/domain/async-result.ts` + coordinator capture/merge/guards; same-draft openDraft does not bump editor generation; superseded loads ignored in UI.
3. **Cancellation / uncertain outcomes** — execute `AbortSignal`; pre-dispatch `CANCELLED`; post-dispatch `OUTCOME_UNKNOWN` + `recheckOutcome` via command receipt; Recheck control on editor.
4. **Logout** — CSRF retained until DELETE succeeds; failed logout keeps session UI; success clears CSRF/editor/proposal/pending.
5. **Evidence** — `scripts/run-evals.ts` exact case-ID registry; superseded 18-pass substring summary annotated; RESULTS/DEMO_RUNBOOK updated.

## Commands observed this repair

```text
npm run typecheck   # pass
npm run lint        # pass
npm run build       # pass
npm run test:unit   # pass (27)
npm run test:api    # pass (3)
npm run test:e2e    # pass (1)
npm run test:evals  # pass (12 pass / 10 blocked / 12 not_run / 0 fail)
```

## Scope retained

Exactly three WebMCP tools: `get_trip_draft`, `update_trip_draft`, `validate_trip_draft`. No draft-creation/submission tools, no embedded agent host, no remote MCP server. Human creates and submits via UI.

## Next (manual phase — not claimed here)

Native browser WebMCP setup, external-agent execution, live Gemini, and interview rehearsal remain explicitly unverified.
