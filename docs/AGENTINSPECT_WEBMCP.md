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

Design for the same fixtures scored three ways:

| Lane | What it sees | Blind spot |
| --- | --- | --- |
| **A — final Puppeteer DOM** | End-of-run visible fields | Misses mid-op mismatch that later repairs |
| **B — per-operation asserts** | Deadline + repair snapshots in the harness | App-local; not a portable evidence artifact |
| **C — AgentInspect observeOutcome / Evidence** | Named facts with `dom`/`database`/`network` methods and phase labels | Only as honest as the observations recorded |

**Status:** this A/B/C comparison is a planned native exercise, not a completed
result until a real Chrome + disposable-DB run records all five cases and
scores the three lanes on the same observations. The injected-mismatch case
demonstrates detection of a deliberate visible/saved disagreement; it does not
by itself prove a production cache-invalidation defect.

**Decision (evidence-defect train):** existing AgentInspect APIs
(`observeOutcome`, `--fail-on-observation`, Evidence v2, `gen_ai.tool.name`)
can represent these facts without a new package, schema, or root dependency.
Harness defects (false-pass effect checks, incomplete UI-sync aggregation,
receipt-only revision labeled as independent DB) are fixed in Trip Workbench.
No new AgentInspect feature proposed unless a concrete native case cannot be
expressed with current OUTCOME events after Chrome execution lands.

Optional external DOM evaluator (Google WebMCP Evals) remains comparison-only.

### Post-release validation snapshot (this host)

| Gate | Result |
| --- | --- |
| `npm run test:unit` | 88 passed |
| `npm run typecheck` | passed |
| `npm run test:receipt-readback-evidence` | exit 0 (API); `revision_semantics_match` passed with independent SQL revision |
| `npm run test:webmcp-ui-sync-evidence` | exit 2; all five cases `not_run` (`TW_CHROME_BIN` unset) |
| `npm run test:webmcp-evidence` | exit 2; mandatory native cases blocked |

**A/B/C native comparison:** not executed on this host (Chrome WebMCP binary not configured). Do not treat final-DOM or Evidence lanes as scored until a disposable-DB + `TW_CHROME_BIN` run completes. Expected when that run lands: (A) final DOM after repair can look healthy; (B) deadline fails on injected mismatch; (C) AgentInspect outcomes retain the deadline failure after repair. No new AgentInspect capability identified.

## Related AgentInspect recipe

Synthetic portable packaging (no browser dependency at AgentInspect root):

`examples/recipes/webmcp-native-evidence/` in the AgentInspect repository.
Binding/forged-label ablations remain in `browser-mcp-observed-outcomes` (#485).
