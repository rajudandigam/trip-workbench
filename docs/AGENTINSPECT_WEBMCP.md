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
| **C — persisted CLI / Evidence** | Written JSONL → public `agent-inspect check --evidence-on` + `bundle verify`; OUTCOME statuses read from disk | Only as honest as the observations recorded |

Per case the report keeps separate fields:

- `fixtureStatus` — did the fixture demonstrate expected control behavior?
- `operationVerdict` — did the app effect meet expectation?
- `evidenceVerified` — did the Evidence artifact verify? (`null` when not scored)

When Chrome is unavailable, all five cases stay `not_run` and every lane is
`not_scored` (exit 2). Do not mock native or weaken the gate.

The injected-mismatch case is an explicit harness control (DOM `.value` rewrite
after commit). It is **not** a reproduced React/cache-invalidation path and is
not an SLO/latency claim from the 8s poll budget.

**Decision:** existing AgentInspect APIs (`observeOutcome`,
`--fail-on-observation`, Evidence v2, `gen_ai.tool.name`) express these facts
without a new package, schema, or root dependency. **Recommend stopping
AgentInspect WebMCP feature expansion** unless a future Chrome run shows a
concrete public-API defect. Optional external DOM evaluator (Google WebMCP
Evals) remains comparison-only.

### Validation snapshot (this host — 2026-11-22)

| Anchor | Value |
| --- | --- |
| Trip | main with A/B/C UI-sync wiring + `agent-inspect@6.31.41` (untracked `evals/evidence/native-smoke-*.json` ignored) |
| AgentInspect HEAD (reference) | `2561eb3b8259b7df494862820d0aa76ec6f47400` |
| `agent-inspect` (registry) | **6.31.41** (`registry.npmjs.org` tarball; not a workspace link) |
| `puppeteer-core` | 25.16.0 |
| Node / npm | v22.22.3 / 10.9.8 |
| `TW_CHROME_BIN` | unset — native blocked |
| `dist/client` | present after `npm run build` |

| Gate | Exit | Notes |
| --- | --- | --- |
| `npm run test:unit` | 0 | 95 passed (includes `ui-sync-comparison`) |
| `npm run typecheck` | 0 | client + server + node |
| `npm run build` | 0 | client + server |
| `npm run test:receipt-readback-evidence` | 0 | API; `checkExit=0`, `verifyExit=0`; `revision_semantics_match` with independent SQL revision |
| `npm run test:webmcp-ui-sync-evidence` | 2 | five cases `not_run`; A/B/C all `not_scored`; `evidenceVerified=null` |
| `npm run test:webmcp-evidence` | 2 | mandatory native cases blocked (`NATIVE-TOOL-DISCOVERY`, dirty-read/refusal, prepare-review, recheck-update) |

**Five-case accounting (Chrome blocked):**

| Case | fixtureStatus | operationVerdict | A / B / C |
| --- | --- | --- | --- |
| healthy-update | not_run | not_scored | not_scored ×3 |
| stale-ui-then-repair | not_run | not_scored | not_scored ×3 |
| missing-observer | not_run | not_scored | not_scored ×3 |
| wrong-resource | not_run | not_scored | not_scored ×3 |
| dirty-refusal | not_run | not_scored | not_scored ×3 |

**When Chrome + disposable `TEST_DATABASE_URL` land:** expect (A) final DOM after
repair can look healthy on the injected-mismatch case; (B) deadline fails on
injected mismatch; (C) persisted OUTCOME retains the deadline failure after
repair and Evidence verifies. Artifacts live under the run’s temp `outRoot`
(`traces/*.jsonl`, `evidence/`, `ui-sync-report.json`) — synthetic/share-checked
only; no customer data.

**Blockers:** `TW_CHROME_BIN` unset (no WebMCP-capable Chrome on this host);
`git fetch` to GitHub failed here with SSH `Permission denied (publickey)` —
local `origin/main` already matched recorded HEADs. No AgentInspect core change
made; no public-API defect demonstrated.

## Related AgentInspect recipe

Synthetic portable packaging (no browser dependency at AgentInspect root):

`examples/recipes/webmcp-native-evidence/` in the AgentInspect repository.
Binding/forged-label ablations remain in `browser-mcp-observed-outcomes` (#485).
