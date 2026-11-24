# AgentInspect × WebMCP operation evidence

Integration runbook for Trip Workbench. Not a competing roadmap — see
[WEBMCP_ROADMAP.md](./WEBMCP_ROADMAP.md) and [RESULTS.md](./RESULTS.md) for
historical status.

## What each source can establish

| Source | Can establish | Cannot establish |
| --- | --- | --- |
| Native `page.webmcp` invocation | Tool discovered/invoked; native call id/status when available | That the intended DB row changed |
| Application response / receipt | What the server claims for a command | Independent confirmation of field values |
| Independent SQL / authorized readback | Saved resource identity, revision, selected fields | Browser-side local buffer without UI observation |
| AgentInspect outcomes / Evidence v2 | Portable, reviewable checks over recorded facts | Causation from matching IDs alone |

Missing observation stays **unknown**. Strict CI treats unknown as nonpass.

## Enable server diagnostics

```bash
# Off by default
export TW_AGENT_INSPECT=1
export TW_AGENT_INSPECT_DIR=.agent-inspect
```

Explicit allowlisted metadata keys only (`domain`, `operation`, revisions,
opaque aliases, outcome/error codes, `captureStatus`, `mode`,
`clarificationCount`). Unrecognized keys — including research canaries such as
`businessMemo` — are dropped. No prompts, proposal text, cookies, CSRF, emails,
or free-form provider errors.

## Commands

```bash
npm run test:unit
npm run test:api
npm run test:native-smoke          # informational; blocked exits 0
npm run test:webmcp-evidence       # strict; blocked mandatory → exit 2
npm run test:receipt-readback-evidence  # API receipt readback + Evidence verify
# alias: npm run test:lost-response-evidence
npm run test:webmcp-ui-sync-evidence    # native UI-sync matrix; exit 2 if not run
```

## Receipt-readback demo (API-labeled)

`npm run test:receipt-readback-evidence` (alias: `test:lost-response-evidence`)
declares the expected action/outcome/revision **before** the mutating PATCH,
commits via authorized HTTP, independently reads the command receipt (network)
and saved row (SQL), records `observeOutcome` facts with accurate
`network`/`database` methods, runs
`--required-tool update_trip_draft --fail-on-observation failed,unknown,skipped`,
and verifies an Evidence v2 directory.

Label: **api**. Does **not** claim native WebMCP, browser response-drop,
local-buffer preservation, or UI success. Local-edit preservation stays
`unknown` on this journey because no DOM observation is collected.

Native Chromium proof requires `TW_CHROME_BIN` and a WebMCP-capable build; until
that executes, do not cite native coverage from this host.

## UI-synchronization matrix (native)

`npm run test:webmcp-ui-sync-evidence` declares expected visible fields and an
observation budget before each case and records `observeOutcome` at the
**operation deadline** and again **after repair**. All five expected case IDs
must be accounted for; a runtime or writer-finalization failure cannot exit 0.

| Case | Expectation | Label |
| --- | --- | --- |
| healthy-update | DOM + DB match at deadline | native |
| stale-ui-then-repair | After server commit, **injected** input `.value` rewrite creates a visible mismatch; deadline fails; refresh repairs DOM while the deadline failure stays in the trace | native harness injection — **not** a reproduced React/cache-invalidation path |
| missing-observer | Unknown / nonpass | synthetic control inside native harness |
| wrong-resource | Binding fail | synthetic control inside native harness |
| dirty-refusal | `USER_EDIT_IN_PROGRESS` + zero PATCH | native |

Without Chrome, every case is **not_run** (exit 2). Do not claim pass. Partial
execution after some passes must exit nonzero with remaining cases `not_run`.

## Compare lanes (A / B / C)

The UI-sync harness scores the **same** case observations three ways
(`scripts/webmcp/ui-sync-comparison.ts`), reported under `abc` in
`ui-sync-report.json`:

| Lane | Source | Blind spot |
| --- | --- | --- |
| **A — final Puppeteer DOM** | End-of-run / post-repair visible fields | Misses mid-op mismatch that later repairs |
| **B — per-operation asserts** | Deadline + repair `SyncFact`s in the harness | App-local; not a portable evidence artifact |
| **C — owned persisted CLI / Evidence** | `caseId → runId → ${runId}.jsonl` (never mtime) → public `check --evidence-on` + `bundle verify` | Only as honest as the observations recorded |

**Ownership:** each case (and the unscored seed) gets a stable `inspector.run(..., { runId })`.
Artifacts live at `traces/<runId>.jsonl` and `evidence/<caseId>/`. Seed
(`ui-sync-seed`) cannot satisfy a case. Missing/wrong/unrelated files fail that
case’s evidence gate. A green fixture cannot hide a failed evidence result —
process exit combines matrix status with per-case `evidenceOk`.

Per case the report keeps separate fields (do **not** derive application success
from fixtureStatus alone):

- `fixtureStatus` — did the fixture demonstrate expected **control** behavior?
- `operationVerdict` — `met` / `unmet` / `unknown` / `refused` / `not_scored` from phase facts
- `deadlineOutcome` / `repairOutcome` — distinct phase results (earlier failure survives repair)
- `evidenceVerified` / `evidenceOk` — bundle verify + named-finding gate (`null` when not scored)
- Inapplicable lanes are `not_scored` (e.g. lane A for synthetic missing-observer / wrong-resource)

| Scenario | Fixture | Operation | Evidence |
| --- | --- | --- | --- |
| healthy-update | pass when deadline facts pass | `met` | owned artifact; check exit 0; verify |
| stale-ui-then-repair | pass when deadline fail + repair pass | `met` after repair; deadline still failed | owned artifact retains deadline failure |
| missing-observer | pass as negative control | `unknown` | named unknown outcomes; no fabricated tool |
| wrong-resource | pass as negative control | `unmet` (binding) | named binding failure |
| dirty-refusal | pass when refusal + zero PATCH | `refused` (explicit no-write — not a successful mutation) | owned artifact with refusal facts |
| no Chrome | `not_run` | `not_scored` | not scored; strict exit 2 |

When Chrome is unavailable, all five cases stay `not_run` and every lane is
`not_scored` (exit 2). Do not mock native or weaken the gate.

The injected-mismatch case is an explicit harness control (DOM `.value` rewrite
after commit). It is **not** a reproduced React/cache-invalidation path and is
not an SLO/latency claim from the 8s poll budget. Lane B can detect the same
failures as C; C’s added value is reopenable/shareable Evidence, not unique
detection when B already fails.

**Decision:** existing AgentInspect APIs (`observeOutcome`,
`--fail-on-observation`, Evidence v2, `gen_ai.tool.name`,
`inspector.step(..., { type: "tool" })`) express these facts without a new
package, schema, or root dependency. Keep Trip on published **6.31.41** for this
train unless a demonstrated defect requires a later verified package. Optional
external DOM evaluator (Google WebMCP Evals) remains comparison-only. Spec:
[WebMCP_Cursor_Plan_and_Prompts_2026-11-23.md](./WebMCP_Cursor_Plan_and_Prompts_2026-11-23.md).

### Validation snapshot (this host — 2026-11-23)

| Anchor | Value |
| --- | --- |
| Trip | main + T1–T3 ownership/gating/semantics (untracked `evals/evidence/native-smoke-*.json` ignored) |
| `agent-inspect` (registry pin) | **6.31.41** |
| `puppeteer-core` | 25.16.0 |
| `TW_CHROME_BIN` | unset — native blocked |

| Gate | Exit | Notes |
| --- | --- | --- |
| `npm run test:unit` | 0 | includes ownership real-writer regression |
| `npm run typecheck` | 0 | |
| `npm run test:webmcp-ui-sync-evidence` | 2 | five cases `not_run`; A/B/C `not_scored` |
| `npm run test:webmcp-evidence` | 2 | mandatory native blocked |

**T4 native packet (2026-11-23):** `TW_CHROME_BIN` unset → UI-sync exit **2**, five
cases `not_run`, A/B/C `not_scored`, seedRunId=`ui-sync-seed`. Strict
`test:webmcp-evidence` exit **2** (mandatory native blocked). Versions:
`agent-inspect@6.31.41`, `puppeteer-core@25.16.0`. No polyfill/direct-handler
substitution. Native acceptance remains incomplete.

## Related AgentInspect recipe

Synthetic portable packaging (no browser dependency at AgentInspect root):

`examples/recipes/webmcp-native-evidence/` in the AgentInspect repository.
Binding/forged-label ablations remain in `browser-mcp-observed-outcomes` (#485).
