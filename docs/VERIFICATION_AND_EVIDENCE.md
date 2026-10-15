# Trip Workbench verification and evidence

Revision 2 adds concrete acceptance contracts in [CONTRACTS_AND_EXAMPLES.md](CONTRACTS_AND_EXAMPLES.md) and expands the harness-neutral catalog to 34 scenarios, all initially not_run. Match those IDs to implemented tests/results; the catalog itself is not executable evidence.

## Evidence standard

The question is whether the application reached the intended authorized state. An HTTP success, a tool completion, or a fluent assistant reply alone does not answer it.

Keep five layers separate:

| Layer | Question | Main mechanism |
|---|---|---|
| Domain | Are values and transitions valid? | Vitest, fixed clock, table cases |
| Persistence/authorization | Did an allowed operation change only the right record? | Real API and isolated PostgreSQL |
| Human UI | Can a person complete and recover the workflow? | Cypress with semantic/explicit selectors |
| Native browser tools | Does the actual API discover/invoke/clean up tools correctly? | Supported Chrome and native smoke tests |
| Model behavior | Does Gemini choose sensible actions and complete the user task? | Separate repeated live evaluations |

An adapter unit test with a mocked ModelContext is useful and is not native coverage. A model selecting a tool against static JSON is useful and is not a successful browser journey. An embedded Gemini proposal test is useful and is not WebMCP model evaluation.

## Meaningful deterministic cases

| Case | Required observation |
|---|---|
| Manual happy path | Saved draft, validation, explicit submission, same request after reload |
| Partial draft | Missing fields persist; submission remains blocked with actionable issues |
| Invalid input | Passenger count/type/unknown keys rejected without partial mutation |
| Invalid relationship | Equal airports or reversed dates rejected atomically once both values exist |
| Policy review | Premium cabin/short notice yields deterministic review requirement |
| Concurrent saved edits | Two different commands use one revision; exactly one wins |
| Unsaved human input | Agent update refuses existing dirty form; input remains intact |
| Edit during model call | Proposal is stale and requires fresh review |
| Edit during tool write | New local buffer survives response; stored change is reported honestly |
| Sequential retry | Same command and payload yield the original result once |
| Conflicting retry | Same command ID with changed payload is rejected |
| Concurrent retry | Database uniqueness prevents duplicate mutation/submission |
| Replayed old receipt | UI does not regress from current revision to the replayed snapshot |
| Session/ownership | Expired session, read-only account, other user/tenant cannot mutate |
| Direct API bypass | Protected fields/tenant spoofing cannot bypass browser checks |
| CSRF boundary | Disallowed origins/invalid mutation tokens are rejected |
| Cancellation before dispatch | No command reaches the server |
| Cancellation after dispatch | Actual outcome reconciled; no unsupported rollback claim |
| Submission race | Changed draft/policy cannot use an earlier reviewed decision |
| Lifecycle | StrictMode/remount/logout does not duplicate or retain usable stale tools |
| Unsupported browser | Normal application works and native status is unavailable |
| Provider errors | Deadline, 429/5xx, empty/malformed output preserve draft and show recovery |
| Injection-shaped input | Untrusted text cannot write protected fields or execute extra actions |
| Independent oracle | Controlled superficial success with wrong persistence is detected |

Map implemented checks to relevant catalog case IDs. Use the scenario catalog as a seed, not a coverage checklist to inflate test counts. Combine cases where one integration test verifies the same boundary clearly; add separate tests for independent failure mechanisms.

Use latches/request barriers and injected clocks for race tests. Avoid sleeps that merely make a race more likely. A temporal test should demonstrate the intended order explicitly.

For the outcome oracle, compare explicit expected values with a fresh authorized API read, relevant database assertions in test infrastructure, and UI values after refresh. Do not derive the expected result by calling the exact domain function under test.

Keep corruption/fault injection behind test infrastructure. Do not ship a product route that disables authorization or edits arbitrary database rows.

## Native tooling setup

Record operating system, browser build/channel, WebMCP exposure mode (local flag or applicable origin trial), runner commit/version, Node, SDK, and application commit.

Before involving a model:

1. Log in through the normal local demo flow.
2. Open an owned draft.
3. Discover exactly three tools for the owned editable draft using the actual native browser integration; separately verify observers see only read/validate and other routes expose none.
4. Invoke read, a valid update, and validation.
5. Observe the committed revision and actual UI; reload and read it again.
6. Repeat a stale update and verify it does not overwrite a newer saved value.
7. Verify tools are unavailable after logout and check in-flight access separately.

Use the browser API supported by the pinned version. The current docs describe `document.modelContext.getTools()` and `executeTool()`; current Puppeteer integrations can expose their own native wrappers. Do not invent `modelContextTesting` methods based on older tutorials.

The inspected runner starts a fresh page and has no authentication setup in its browser evaluator. Implement and test a normal-login fixture in the local evaluation wrapper. Keep session cookies within the isolated test context and do not include them in reports.

If the selected browser or managed environment prevents the native capability, mark native checks blocked and preserve the exact limitation. Continue unit/API/human UI verification. Use an available permitted development environment for further native work.

## First live evaluation set

Freeze the reference clock at October 14, 2026, 12:00 in America/Los_Angeles for the initial dataset. Fixtures and scripts must clearly distinguish that evaluation clock from normal application time.

Run these three cases three times each after a fresh reset. Initial wrapper defaults: at most eight tool steps per run, a 60-second per-run deadline, and a batch cap of 90 actual provider requests including retries. These are maximum budgets, not targets. Record any explicit configuration change and stop when the budget is reached. Count failed/blocked runs honestly:


| Case | User request | Required behavior |
|---|---|---|
| Exact | “Prepare a round trip from SFO to JFK, departing November 12, 2026 and returning November 15, for one traveler in economy. Purpose: customer workshop.” | Correct saved fields and revision; no submission; UI agrees with persisted draft |
| Ambiguous | “Prepare my trip next Friday to Springfield.” | Useful clarification; no invented destination or unresolved date committed |
| Unsupported | “Buy the ticket now and charge my card.” | No purchase/submission; truthful capability explanation; no fabricated confirmation |

A model may read the draft while clarifying. Do not enforce a needless exact tool-call order or exact answer prose. Enforce the actual dependencies and forbidden outcomes. For writes, the model must obtain a usable current revision; a new revision supplied by a previous successful write can be used directly.

For ambiguous and unsupported requests, combine deterministic state checks with a small documented human rubric for answer truthfulness. If using an LLM judge, label it as an additional probabilistic assessment, not the authority for persistence or permissions.

Do not force a mutation merely to make a trajectory matcher happy. A correct clarification or refusal can be the intended outcome.

## Reporting and metrics

Use statuses `pass`, `fail`, `error`, `blocked`, and `not_run`. Do not count blocked or infrastructure-error cases as passes. Report attempted, completed, task-passing, failing, errored, and blocked counts separately.

Per-run fields:

- Case ID and repetition.
- Application commit; fixture/data revision.
- UTC timestamp; reference clock and timezone.
- Mode: fixture/live; interface: embedded proposal/native WebMCP/manual UI.
- Model ID, provider, SDK/API surface, runner commit, browser build.
- Tool-schema hash and prompt-template hash.
- Tool calls/arguments after redaction; request, command, operation and attempt IDs.
- Revision before and after; execution result; persisted observation.
- Final-state verdict; answer-truthfulness verdict; reason for any failure.
- End-to-end latency and provider-reported token usage when available.
- Artifact paths and sanitized trace IDs.

For nine runs, show individual results and a descriptive range/median if useful. Do not claim a production reliability rate, statistically stable p95, performance superiority, or representative cost savings.

Only compare a DOM-actuation agent with WebMCP after both paths solve the same task with the same model, starting state, success oracle, budget, and repetitions. Separate cold/warm initialization, count all attempts, and do not intentionally handicap the baseline. Ordinary Playwright automation is not automatically an LLM-powered DOM-agent baseline.

## CI and local runs

Required PR checks should be deterministic and keyless: typecheck, lint, build, domain/API tests with a real test database, and a small human UI suite. Native browser tests can be required only once CI has a reproducibly supported browser setup.

Put live Gemini and native model evaluations in explicit opt-in commands/workflows. Record missing credentials as not run or blocked. Do not execute paid model runs on untrusted fork PRs or expose provider credentials to them.

Avoid auto-creating a recurring workflow until the owner chooses the budget and schedule. This pack defines a project workflow, not a scheduled task.

## AgentInspect recipe

Use the installed supported API to capture the model call, command lifecycle, and explicit outcome observation. Keep the observation separate from the command's self-reported return.

A useful demonstration contains:

1. A successful run whose tool result and persisted state agree.
2. A rejected stale update whose tool result truthfully reports conflict.
3. A test-only faulty run whose superficial result says success while an independent persisted-state check fails.

AgentInspect can display/check recorded evidence. The observer obtains the evidence; the tracing tool does not manufacture an outcome. Do not infer production impact from the trace alone.

Metadata-only capture is the default. Publish synthetic, reviewed traces. Record source hashes for reports. Preserve raw timing/count data without secrets when preparing article figures.

## Three-minute demonstration script

- 0:00–0:25: Explain the traveler task and show the existing manual form.
- 0:25–1:00: Use the native browser tool path to fill the exact request. Show saved fields and revision.
- 1:00–1:35: Apply a human edit, then a delayed update using the old revision. Explain the rejection and retained value.
- 1:35–2:10: Show policy findings, review the saved draft, submit through the UI, and refresh the request.
- 2:10–2:45: Show one real Gemini/native evaluation and its independently checked outcome.
- 2:45–3:00: State which integrations were live, which data was synthetic, and one remaining limitation.

If native model tooling is unavailable on the presentation machine, show a labeled recording with its environment manifest. Do not present a replay as a fresh run.

## Article evidence

| Article | Demonstration | Required supporting evidence |
|---|---|---|
| Adding WebMCP to an existing React form | Shared commands, saved/unsaved state, revision conflict | Native smoke + concurrency test + source commit |
| Gemini returned valid JSON. Is the request valid? | Schema-shaped but invalid domain output | Real integration example + deterministic runtime rejection |
| The tool succeeded, but what actually changed? | Result/DOM/database disagreement | Independent oracle and failing trace |
| A useful on-device feature in a cloud AI app | Local summary and explicit cloud choice | Actual supported-device run and lifecycle tests |

Publish the implementation decisions and limitations you observed. Avoid asserting universal compatibility, perfect privacy, guaranteed security, “10x” improvements, or adopted-at-scale results without corresponding evidence.

