# Article source map (cite without re-running)

For the five pieces in flight (recovery, review preparation, page-scoped tools, policy explanations, tool visibility). Do **not** reuse the already-published registration or unsaved-edit articles. Tool-count benchmark waits for measured Phase 3 runs. Model-decision HackerNoon waits for Cursor ×2 trajectories (still outstanding).

Canonical code on `main`: reliability `0691767` / docs tip `adc1143` (descendant of Phase 1 `e711e20` and Phase 2 `a6c7d4a`).

| Piece | Strongest claim already evidenced | Primary sources | Do not claim yet |
|-------|-----------------------------------|-----------------|------------------|
| **Recovery** (“One PATCH, One Receipt”) | Lost successful PATCH response; `recheck_trip_update` recovers one matching receipt; BOS persisted; human unsaved purpose kept; AI disabled | [PHASE_1_EVIDENCE.md](PHASE_1_EVIDENCE.md); coordinator `reconcileCommand` / `recheckOutcome` in `src/client/lib/coordinator.ts`; unit tests in `tests/unit/coordinator-cancel.test.ts`; independent Chromium 153 audit (`webmcp-audit` native-trace); scripted smoke path in `scripts/native-webmcp-smoke.ts` | Model chose the recheck; multi-writer concurrency at scale |
| **Review preparation** | `prepare_trip_review` shows findings with `submitted: false`; DB stays `draft` with zero submissions; races refuse stale panels after write or leave/reopen | [PHASE_1_EVIDENCE.md](PHASE_1_EVIDENCE.md); `prepareReview` in coordinator; editor prepared panel; `tests/unit/coordinator-races.test.ts` | Preparation equals submission; model always prepares before asking human |
| **Tools scoped to each page** | Trip tools on trip editor; event tools only on open event editor; Events nav stays visible while tools stay off the list route | [PHASE_2_EVIDENCE.md](PHASE_2_EVIDENCE.md); [DEMO_EVENTS_RUNBOOK.md](DEMO_EVENTS_RUNBOOK.md); `src/client/lib/webmcp.ts` + event WebMCP; commit `a6c7d4a` | Upstream webmcp-evals already inherits Cursor cookies; declarative forms are native-proven |
| **Policy explanations** | Business cabin → `PREMIUM_CABIN` review requirement with `canSubmit: true` (requirement ≠ blocker); event analogs `LONG_EVENT` / `MANUAL_LOCATION` | [RESULTS.md](RESULTS.md) 2026-10-20 validate table; Phase 1 prepare-review unit test; Phase 2 evidence review-requirements section | A model correctly explained the distinction in a live trajectory (needs ×2 Cursor capture) |
| **Tool visibility** | Traveler discovers five trip tools; observer three (no mutate/recheck); tools clear when leaving the editor | Independent audit native-trace (Chromium 153); smoke script asserts traveler/observer sets; WebMCP registration lifecycle | CI native pass without `TW_CHROME_BIN`; tool-count distractor study |

## Gate numbers to quote

| Check | Count | File |
|-------|-------|------|
| Unit | 49 pass | local `npm run test:unit` after `0691767` |
| API | 6 pass (incl. disposable DB sentinel) | `npm run test:api` |
| Evals | 12 pass / 0 fail / 10 blocked / 12 not_run | `evals/evidence/eval-summary-2026-11-11T21-13-13-109Z.json` |
| Native smoke (this host) | blocked (honest; `TW_CHROME_BIN` unset) | `evals/evidence/native-smoke-2026-11-11T21-10-13-257Z.json` |

## Safety notes for walkthroughs

- Readers must use a **disposable** `TEST_DATABASE_URL` distinct from `DATABASE_URL` (or `TW_ISOLATED_TEST_DB=1` for an explicit ephemeral DB). Missing test URL now refuses migrate/seed.
- Submission recheck is on the **review** screen (`Recheck submission`); update recheck remains on the editor. Neither redispatches PATCH/POST.
- Demo seed resets drafts — say so before `npm run db:seed`.

## Still open for later articles (not these five)

1. Exact-update / ambiguous-request / premium-cabin prompts **twice each** through Cursor → record prompts, tool calls, answers, independent state checks.
2. Phase 3 tool-count / exposure benchmark with measured runs.
3. Navan or live calendar/venue integrations.
