# Phase 1 plan and progress

Baseline commit: `9485a47d5a036de0fddc7cd8bc93227fcfc80d98`  
Roadmap: [WEBMCP_ROADMAP.md](WEBMCP_ROADMAP.md)  
Default AI mode for this work: `disabled` (fixture only for deterministic proposal checks).

## Scope

Reliable trip workflow, five WebMCP tools, tests, and recorded evidence. Stop after Phase 1.

## Checkpoints

| Pass | Status | Notes |
|------|--------|-------|
| 0 Save roadmap | complete | `docs/WEBMCP_ROADMAP.md` + this file |
| 1 Baseline and state correctness | complete | `mergeAfterRefresh`, refresh sequencing, pendingOutcome snapshots, submit revision binding |
| 2 Application UI | complete | Trip list status pills, saved summary, conflict/recheck copy, prepared-review panel, review findings |
| 3 Five tools and lifecycle | complete | `prepare_trip_review`, `recheck_trip_update`, reactive registration status |
| 4 Verification and evidence | complete | Unit/API/e2e/evals pass; native smoke blocked with setup docs |

## Do not

- Run `db:seed` against an existing demo database unless disposable
- Overwrite `.env`
- Implement Phase 2/3, articles, push, or deployment automatically

## Completion report

See [PHASE_1_EVIDENCE.md](PHASE_1_EVIDENCE.md) for tests run, blockers, and article-claim boundaries.
