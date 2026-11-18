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

`npm run test:webmcp-ui-sync-evidence` declares expected visible fields before
each case and records `observeOutcome` at the **operation deadline** and again
**after repair**:

| Case | Expectation |
| --- | --- |
| healthy-update | DOM + DB match at deadline |
| stale-ui-then-repair | Test-only UI suppression after server commit → per-op fail; refresh repairs DOM while deadline failure stays in the trace |
| missing-observer | Unknown / nonpass |
| wrong-resource | Binding fail |
| dirty-refusal | `USER_EDIT_IN_PROGRESS` + zero PATCH |

Without Chrome, every case is **not_run** (exit 2). Do not claim pass.

## Compare lanes before expanding AgentInspect (C6)

Same fixtures, three assertion lanes:

| Lane | What it sees | Blind spot |
| --- | --- | --- |
| **A — final Puppeteer DOM** | End-of-run visible fields | Misses mid-op stale UI that later repairs |
| **B — per-operation asserts** | Deadline + repair snapshots in the harness | App-local; not a portable evidence artifact |
| **C — AgentInspect observeOutcome / Evidence** | Named facts with `dom`/`database`/`network` methods and phase labels | Only as honest as the observations recorded |

**Decision (evidence-defect train):** A+B already catch the #553-class stale-then-repair case when the harness records the **operation deadline** separately from final DOM. Existing AgentInspect APIs (`observeOutcome`, `--fail-on-observation`, Evidence v2 `bundle verify`, `gen_ai.tool.name` matching on packed main) represent those facts without a new package, schema, or root dependency.

Defects fixed in this train were **harness / adapter** issues (false-pass effect checks, invented API localPurpose, dirty→update sequencing, metadata denylist), not AgentInspect capability gaps. No new AgentInspect feature proposed. Revisit only if a concrete native case cannot be expressed with current OUTCOME events after Chrome execution lands.

Optional external DOM evaluator (Google WebMCP Evals @ `7dbfa4de`) remains comparison-only and was not required for this decision.

## Related AgentInspect recipe

Synthetic portable packaging (no browser dependency at AgentInspect root):

`examples/recipes/webmcp-native-evidence/` in the AgentInspect repository.
Binding/forged-label ablations remain in `browser-mcp-observed-outcomes` (#485).
