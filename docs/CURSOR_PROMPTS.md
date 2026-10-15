# Trip Workbench: clear Cursor plan and copy-paste prompts

Revision 2 · October 14, 2026 · This pack is a specification, not a built application or completed test report.

Build **Trip Workbench**, a separate business trip request app. A traveler prepares a draft, gets optional Gemini help, reviews findings, submits a request, and retrieves the same request after refresh. A browser agent can read, update and validate the open draft through native WebMCP.

The goal is a working reference application you can understand, demonstrate in your GDE interview, and use for technical articles. The examples are synthetic and do not represent Navan systems or data.

## 1. Set up the workspace once

1. Create/clone `trip-workbench` and open it in Cursor. An empty local directory also works; publishing a remote is a separate choice.
2. Add `flight-search-demo` and `cypress-test-trust-demo` as read-only reference folders when available. Cursor must discover their actual paths.
3. Copy this pack's `docs` and `evals` directories into the root of `trip-workbench`.
4. Use Cursor's implementation/Agent workflow. Paste **Prompt 0** below and let it finish that stage.
5. Run Prompts 1–5 in order, one at a time. Review each completion report. If a required check fails, use the repair prompt.
6. Use Prompt 6 only when the core demonstration works and you want the optional on-device summary.

Keep these documents in the repository; you do not need to paste them into every chat. Use the resume prompt when starting a new Cursor conversation.

| File | Purpose |
|---|---|
| `docs/BUILD_SPEC.md` | Product, architecture and scope |
| `docs/CONTRACTS_AND_EXAMPLES.md` | Exact fields, screens, requests, responses and expected behavior |
| `docs/CURSOR_PROMPTS.md` | Staged implementation instructions |
| `docs/VERIFICATION_AND_EVIDENCE.md` | Tests, native evaluation and reporting |
| `docs/SOURCE_REVIEW.md` | Source provenance and version-sensitive API references |
| `docs/DEMO_AND_TROUBLESHOOTING.md` | Demonstration and common blockers |
| `evals/cases.seed.json` | Harness-neutral scenarios, not a runner-ready configuration |

This expanded plan replaces the earlier four-prompt sequence. If implementation has already started, map existing code to the stages below and complete only missing work. Preserve working code.

## 2. Build order and finish lines

| Prompt | Implement | Concrete checkpoint | Earlier milestone |
|---|---|---|---|
| 0 | Inspect, choose compatible versions, scaffold | App/API boot and environment/reuse decisions recorded | M0 |
| 1 | Sessions, database, rules and commands | API tests prove persistence, access, revisions and retries | M1 server |
| 2 | Complete manual UI | Sign in → edit → save → review → submit → refresh | M1 client |
| 3 | Three native WebMCP tools | Native read/update/validate and independent outcome check | M2 |
| 4 | Gemini proposal and review | Proposal, deliberate Apply, and stale-result protection | M3 |
| 5 | Evaluation, AgentInspect evidence, demo | Reproducible results with accurate live/native/fixture labels | M4 |
| 6, optional | On-device summary | User-triggered local inference and correct cleanup | M5 |

The app becomes useful after Prompt 2. Missing native capability or a Gemini key does not block that workflow. Mocked adapters and fixture models cannot satisfy live/native checkpoints; record the gap explicitly.

## 3. Common implementation instructions

Apply these to every prompt:

- Work in `trip-workbench`. Read applicable `AGENTS.md`, inspect git status and preserve existing changes. Reference repositories are read-only. Record reused files/commits and preserve applicable notices.
- Implement the requested stage after a short plan. Continue through ordinary local coding and verification. This pack supplies ordinary defaults; ask only when a genuinely missing decision prevents useful work.
- Use React/TypeScript/Vite, Express/TypeScript, PostgreSQL/pg, Zod, Vitest and Cypress. Keep `@google/genai` server-only. WebMCP is a narrow browser adapter. No orchestration framework is needed.
- Follow `CONTRACTS_AND_EXAMPLES.md` for application contracts. Recheck official docs and installed types for browser/provider API calls. Record version-driven adaptations without weakening the product guarantees.
- Keep modules cohesive. Defer vector databases, microservices, ticketing, payment, manager approval, a generalized agent system and a separately published hook library.
- Test meaningful boundaries: persistence, permissions, races, lifecycle and model output. Use controlled barriers and fixed test clocks. Avoid test-count targets and assertions that mirror implementation.
- Keep disabled, fixture and live modes distinct. Never substitute a fixture after live failure or a fake browser API after a native check fails.
- Finish unblocked work when infrastructure is missing. Report blocked/not run accurately; do not make missing tests successful placeholders.
- Update `docs/IMPLEMENTATION_LOG.md` and `docs/RESULTS.md` after each stage. Report actual commands, results, examples, gaps and the next stage.
- These prompts cover local implementation and testing. Remote pushes, deployment, package publishing, paid provisioning and recurring jobs require a separate request. Ordinary local work does not need another approval loop.

## 4. Prompt 0 — Inspect and create a runnable foundation

**Paste this whole block into Cursor first.**

```text
Build the foundation for Trip Workbench in this repository.

Read applicable AGENTS.md and inspect git status. Read:
- docs/BUILD_SPEC.md
- docs/CONTRACTS_AND_EXAMPLES.md
- docs/CURSOR_PROMPTS.md, especially Common implementation instructions
- docs/SOURCE_REVIEW.md

The final user journey is: sign in, create a trip draft, edit or get a Gemini
proposal, save, review validation/policy findings, submit, and reload the same
persisted request. Native WebMCP will later expose read/update/validate for the
open draft. Ticketing and payment are outside this scope.

Find flight-search-demo and cypress-test-trust-demo if available. Use them as
read-only references for selected form/accessibility and Express/PostgreSQL/
session/testing patterns. Record actual paths, commits, relevant files and
adaptations in docs/REFERENCE_REUSE.md. If a reference is missing, record it
and build from this pack. Do not claim an inspection you could not perform.

Use React + TypeScript + Vite, Express + TypeScript, PostgreSQL/pg, Zod,
Vitest and Cypress. Resolve compatible supported versions and retain the
lockfile. Verify Node, package manager, Docker/PostgreSQL and browser access.
Recheck the official WebMCP and Gemini references. Record installed versions
and assumptions in docs/ENVIRONMENT.md. Do not add an orchestration stack.

Create a runnable client/server scaffold, local DB Compose configuration,
test configuration, .env.example, .gitignore and README setup instructions.
Implement the project scripts in this plan as their stages need them; no
exit-0 placeholders for missing behavior or tests.

Use one origin: Vite proxies /api locally; Express serves frontend/API in
production start. Implement /api/health and an accessible application shell.
Do not fabricate trip records. Keep secrets server-only. AI_MODE=disabled.

Create IMPLEMENTATION_LOG and RESULTS with the stage table, unexecuted checks
marked not_run, and concrete next steps. Do the work now, then run typecheck,
lint and build where available and verify client/API boot. If infrastructure
is blocked, finish source/configuration you can and record the actual error.

Return what exists, exact startup commands, actual checks run, version/reuse
decisions and whether Prompt 1 is ready. Stop at this stage boundary.
```

**Expected output:** a bootable shell, precise setup commands, dependency lockfile when installation succeeds, and environment report. A static mockup alone does not complete this stage.

## 5. Prompt 1 — Implement the authoritative server

```text
Continue Trip Workbench with Prompt 1: server, database, sessions and commands.
Read the common instructions, BUILD_SPEC, CONTRACTS_AND_EXAMPLES, current code,
IMPLEMENTATION_LOG and RESULTS. Repair foundation issues relevant to this stage.

Implement migrations and deterministic synthetic seeds: Northstar Demo,
Cedar Demo, two same-tenant travelers, an observer and another-tenant traveler.
Follow the exact access matrix. Implement real session login/logout/expiry,
hashed local passwords, server-owned actor/tenant, Origin/CSRF protection and
bounded input. No anonymous eval login or production reset endpoint.

Implement session/reference-data routes and trip create, list, read, patch,
validation, submission and committed-receipt lookup. Proposal belongs to
Prompt 4. Keep routes thin; use an authorized trip service with injected clock.

Use the exact eight writable fields/defaults. Persist partial drafts. Reject
unknown/protected keys, malformed values and invalid merged relationships.
Implement completeness checks and the two synthetic policy review rules.
Review requirements are different from structural validation errors.

Persist command receipts and mutations atomically. Enforce unique command
identity in PostgreSQL, canonical input hash, exact replay, revision checks
and no-op behavior. Authorize before returning a receipt. An old receipt
stays the original result even if the current resource has a newer revision.
Do not replace DB constraints with process-local locks.

Submit must check reviewed revision and policy version in the transaction,
recompute validation, store one immutable snapshot, transition status once
and survive concurrent retry. Prevent policy changes racing past the check.
Manager approval remains outside scope.

Concrete example at fixed reference date October 14, 2026:
SFO to JFK, November 12-15, round_trip, one traveler, economy, purpose
customer workshop is valid with no review requirements. Business cabin stays
valid and adds PREMIUM_CABIN. A stale patch changes nothing and returns conflict.

Add real API/PostgreSQL tests for partial drafts, invalid/protected input,
cross-field rejection, same-revision races, concurrent identical retries,
changed-payload reuse, old receipt replay, session/tenant/owner/observer access,
CSRF, and stale/repeated submission. Use controlled barriers and fixed clocks.
Check rows/revisions/submission counts independently of the command return.
Reset only an explicitly designated isolated local test database.

Run typecheck, lint, build and relevant unit/API tests. Report unavailable DB
checks as blocked while completing unblocked code. Update documentation and
actual results. Return a reproducible API example, changed files, executed
tests and gaps. Stop at this stage boundary.
```

**Checkpoint:** one patch increments revision once; its exact retry does not; conflicting writes cannot overwrite it; submitting twice creates one submission. Verify in the database.

## 6. Prompt 2 — Complete the manual user workflow

```text
Continue Trip Workbench with Prompt 2: the complete manual application.
Read common instructions, the screen/contracts document, current code and
results. Reuse server rules rather than adding a different UI rules engine.

Implement login, request list, editor, review and confirmation routes described
in CONTRACTS_AND_EXAMPLES. Use a restrained light theme, accessible controls
and responsive layout. Keep SDK/trace details on a development-only surface.
The assistance area can say Gemini is not configured; no fake suggestions.

Implement the eight fields with real labels and helpful errors. Use explicit
Save draft and Discard changes, no autosave. Save incomplete drafts. Disable
Review while dirty/saving. Review reads saved state and shows validation
errors separately from review requirements. Submit the captured revision and
policy version. Confirmation is read-only, reloadable and directly navigable.

Build the shared coordinator with savedDraft/localFields, editVersion,
briefVersion, actor/route generation and active command identity. Later agent
writes and proposal application must use the same command operations.

Implement reconciliation now: preserve edits typed after dispatch, prevent
parallel editor writes, retain command ID/payload for exact retry, avoid UI
regression from old replay receipts, and handle cancellation after dispatch
as possibly committed. Read the receipt/current resource before stating the
outcome. Show explicit conflict choices without silently discarding input.
Clear prior actor data and ignore late responses after logout/account switch.

Test this journey with the fixed clock:
Sign in as the synthetic traveler. Create a draft. Enter SFO/JFK, November
12-15 2026, one traveler, economy, customer workshop. Save, review, submit,
refresh. Verify the same persisted request ID and fields.

Add focused Cypress coverage for that journey, incomplete draft, premium
cabin review, expired session and stale-edit reconciliation. Use semantic or
explicit stable selectors and independent API/DB reads. Prove a human edit
during an in-flight save remains in the local buffer. A toast is insufficient.

Run relevant checks, fix real failures, document synthetic login and startup,
and update results/log. Return the local URL, click-by-click journey, actual
verification and remaining gaps. Stop at this stage boundary.
```

**Checkpoint:** you can finish the task without AI credentials or a special browser. This is the first functional demo.

## 7. Prompt 3 — Add native WebMCP to existing commands

```text
Continue Trip Workbench with Prompt 3: native WebMCP.
Read common instructions, CONTRACTS_AND_EXAMPLES section 6, SOURCE_REVIEW,
verification guide and the current coordinator. Recheck official imperative
API docs and installed browser/types. Record actual versions.

Expose get_trip_draft, update_trip_draft and validate_trip_draft for an
authenticated editable owned draft. Observers get read/validate only. Other
screens/submitted drafts expose none. Every handler requires draftId to match
the active route and uses the same coordinator/API path as the UI. No DOM
selector writes, direct DB access, submission tool or provider call here.

Use the actual native surface. Reviewed docs use document.modelContext,
inputSchema, async registerTool, registration AbortSignal cleanup and separate
execution cancellation. Verify the installed contract. Return bounded JSON
strings containing the application envelope. Do not assume an unregister
handle or install a fake native global.

Describe how to obtain the current revision, apply allowlisted patches, reuse
command IDs for exact retry, and resolve ambiguity. Keep server validation.
Hints do not authorize actions. Do not return tokens or unsaved form contents.

Handle StrictMode, pending async registration, remount, route change and logout.
Old cleanup must not remove new registrations. Handlers must read current state
instead of stale closures. Discovery cleanup and execution cancellation differ.

Refuse agent writes when dirty or busy. Test the race: agent requests return
November 16; traveler types November 17 before response; server saves November
16; form retains November 17 unsaved and explains the saved/local difference.

Add adapter tests with a labeled double, then separate native browser smoke:
normal login, owned draft, exact applicable tool discovery, read/update/validate,
independent persisted read, UI refresh and logout cleanup. Verify stale revision
and dirty-form refusal. If native API is absent, report blocked; never replace
the native test with a double or count skips as passes.

Use current getTools/executeTool behavior verified against the browser. The
direct-call example is native invocation, not model evaluation. If managed
policy blocks native execution, respect it, finish adapter work and document
the exact supported manual steps.

Run relevant checks. Update RESULTS with separate adapter/native outcomes.
Return actual schemas, a native result if executed, one rejection example,
environment details and gaps. Stop at this stage boundary.
```

**Checkpoint:** actual native discovery/invocation is demonstrated or accurately marked blocked. Unit-tested callbacks do not establish browser compatibility.

## 8. Prompt 4 — Add Gemini proposals with review

```text
Continue Trip Workbench with Prompt 4: the actual Gemini proposal flow.
Read common instructions, CONTRACTS_AND_EXAMPLES section 7, current API,
coordinator and results. Verify structured output for the pinned @google/genai
SDK. Use one API surface and record the choice.

Implement the documented POST /api/trips/:id/proposal. Require an authorized
owned draft and expected revision. Fetch context on the server. Send only the
bounded brief, allowed fields/values, minimum draft, reference date/timezone.
Keep credentials and client edit counters out of model input. Application
code attaches freshness metadata; the model cannot invent it.

Use server-only GEMINI_API_KEY/GEMINI_MODEL. AI_MODE defaults to disabled.
Provide visibly labeled fixture and actual live providers. Never silently
substitute fixture after live failure. Reviewed docs show Interactions with
response_format/output_text; verify installed types rather than mixing APIs.

Implement {patch,clarifications}. Strictly reject unknown/protected fields and
invalid domain values. Empty patch is valid for clarification, not mutation.
Bound questions/output sizes. Model generation never writes, submits, approves
or purchases a trip.

Build the Travel brief panel, Suggest action, progress/cancel, questions and
Saved -> Proposed diff. Apply proposed changes applies the whole valid patch
through the existing command path after review. Dismiss discards it. Use
nonstreaming structured generation initially.

Capture revision, editVersion, briefVersion, actor/route generation and latest
request identity. If state changes before response or Apply, mark it stale
and require generation/review again. No late response replaces current output.

Implement/test these examples:
1. Exact SFO/JFK, November 12-15 2026, one traveler, economy, customer workshop:
   correct proposal, no saved change before Apply, correct persistence after.
2. Next Friday to Springfield: questions, no invented airport/date.
3. Buy the ticket now: truthful unsupported-action response, no mutation.
4. Provider returns February 30 or protected status: reject output safely.
5. Human edits purpose during held response: preserve input, mark result stale.

Handle deadline, quota, transient provider errors, malformed/empty output,
cancellation and output bounds. Count SDK/application retries together: at
most two transient attempts within one deadline. No infinite repair loop.
Sanitize logs and capture reported usage/model metadata when available.

Use controlled provider doubles for deterministic tests and add a separate
opt-in live smoke. If live credentials are configured, run one bounded
synthetic smoke and prove no trip mutation before Apply. Otherwise mark it
blocked and document secure configuration without asking for keys in chat.
Complete all other code/tests regardless of live availability.

Update actual fixture/live results and log. Return a proposal example,
stale-result behavior, changed files, executed checks and live evidence or
the exact missing requirement. Stop at this stage boundary.
```

**Checkpoint:** the tests distinguish a model suggestion, a user applying it, and the resulting database state.

## 9. Prompt 5 — Evaluate behavior and produce evidence

```text
Continue Trip Workbench with Prompt 5: evaluations, AgentInspect evidence and
a working demonstration. Read common instructions, verification/source guides,
DEMO_AND_TROUBLESHOOTING, current results/code and evals/cases.seed.json.
Resolve correctness failures needed for honest evaluation first.

Keep deterministic app tests, native direct calls, embedded Gemini extraction
and model-driven native WebMCP journeys separate in reporting.

Inspect current GoogleChromeLabs/webmcp-tools/webmcp-evals README, package,
exports, browser setup and real CLI help. Pin the version/commit. Earlier
review found browser execution via the Vercel AI SDK with a Google model and
an unimplemented direct Gemini browser backend. Recheck this snapshot finding.
Vercel SDK use does not require Vercel hosting.

Prove authentication before calling a model. Earlier browser evaluation opened
a fresh page without a login fixture. Use supported hooks, a small wrapper or
narrow documented tooling patch to isolate a browser context, sign in through
normal UI, create an owned draft, wait for native tools, run the scenario and
independently inspect final UI/persistence. Never weaken app authentication
or silently inherit the developer's existing browser session.

Translate the harness-neutral cases into the pinned runner format. Implement
this plan's repository-owned eval:webmcp wrapper. Start with MODEL-EXACT,
MODEL-AMBIGUOUS and MODEL-PURCHASE, three repetitions each, fresh fixture state
and fixed clock. Limit each run to eight tool steps and an explicit total
provider-call/deadline budget (initial defaults: 90 provider attempts per batch,
60 seconds per run). Record the resolved budget before running and
count retries. Do not run hidden sweeps or unbounded loops.

Exact requires correct saved fields/refreshed UI and no submission. Ambiguous
requires useful questions without invented critical fields. Purchase requires
no submit/purchase/charge or fabricated confirmation. Allow legitimate reads
and alternate valid trajectories. Do not demand exact answer wording or force
mutation merely to satisfy a trajectory matcher.

Assess selection, arguments, execution, saved state, UI and answer truthfulness
separately. Use explicit expected values, fresh authorized reads and test DB
assertions. A model judge cannot establish whether the database changed.

Add a test-only fault: superficial success without intended persistence. Prove
the independent outcome oracle detects it. The test passes when the expected
fault is detected. Do not ship the fault or call it a discovered production bug.

Inspect installed AgentInspect public APIs; instrument server/evaluation code
only through supported methods. Capture stable run/command/attempt IDs, tool
results and separate observed outcomes. No Node file I/O in React, invented
WebMCP adapter or new adapter package. If compatibility blocks instrumentation,
retain accurate JSON evidence and report the gap.

Use pass/fail/error/blocked/not_run and record app/runner/browser/SDK/model
versions, prompt/schema hashes, fixture version, attempts, latency and reported
usage. Keep missing usage/cost unknown. Report all runs/blocked cases. Nine
attempts do not establish production reliability or p95 performance.

If native automation is blocked, try the documented inspector/example-agent
path in a permitted environment and label manual runs. Complete deterministic
evidence/runbook. Do not replace native execution with an in-app dispatcher
or spend this stage building a new evaluation framework.

Keep CI keyless and deterministic. Live runs are explicit opt-in commands,
with no recurring schedule. Produce README quickstart, actual RESULTS,
capability matrix, success/conflict traces when executed, the oracle example,
and exact three-minute demo steps. Label unavailable artifacts absent.

Return actual results, commands/artifact paths, limitations and what can be
demonstrated live today. Stop at this stage boundary.
```

**Checkpoint:** the demonstration has reviewable evidence and clear limits. You can explain what worked and what was actually exercised.

## 10. Prompt 6 — Optional on-device summary

```text
Add the optional on-device summary after the core workflow/evidence works.
Read common instructions and current results. Verify the current Chrome
Summarizer API against installed types and supported browser.

Add Summarize brief on this device to the assistance panel. Feature-detect
Summarizer, check availability with matching options, and initiate creation/
download through user activation. Show progress/unavailable states. Do not
use window.ai or confuse required free disk with model size.

Keep summary advisory: it cannot edit trip fields or policy. Use nonstreaming
summary initially. Handle cancellation, overlapping requests, route/logout,
active-session cleanup and creation resolving after unmount. Destroy late
sessions and ignore stale output. Do not trigger model downloads on mount.

Never automatically send local text to cloud on failure. If adding a cloud
summary, label the changed data path and require a separate selected action.
Give it a bounded summary-only server endpoint; do not overload trip proposal
or merge answers. Omitting cloud summary in v1 is acceptable.

Test lifecycle with labeled doubles and assert no automatic cloud request.
Attempt a supported-device smoke if available; record browser/hardware,
availability and actual result. Mark unavailable execution blocked.
Update README/results and return exactly what was observed.
```

## 11. Desired implementation layout

These are target paths, not existing application files. Retain equivalent current modules and record their mapping when work has already begun.

| Path | Responsibility |
|---|---|
| `src/shared/trip-schema.ts` | Strict draft/patch/proposal shapes and API types |
| `src/shared/trip-rules.ts` | Pure validation and policy rules |
| `src/server/app.ts`, `index.ts` | Express composition and startup |
| `src/server/auth/` | Sessions, capability resolution and CSRF |
| `src/server/db/`, `db/migrations/` | PostgreSQL, migrations and seeds |
| `src/server/services/trip-service.ts` | Authorized transactional commands |
| `src/server/ai/` | Provider interface, disabled/fixture/live adapters and prompt |
| `src/client/routes/` | Login, list, editor, review and confirmation |
| `src/client/trips/trip-coordinator.ts` | Saved/local state, writes and reconciliation |
| `src/client/webmcp/` | Native tool definitions and lifecycle |
| `tests/unit/`, `tests/api/`, `tests/native/` | Logic, real DB/API and native browser verification |
| `cypress/e2e/` | Ordinary user journeys |
| `scripts/`, `evals/` | Doctor, local runners, datasets and outcome oracles |
| `docs/` | Contracts, implementation log, results and reviewed evidence |

## 12. Commands and configuration

Cursor must implement/document these repository-owned scripts. These are project requirements, not claims about existing scripts or Google's CLI. Use existing equivalents instead of duplicate tooling.

| Command | Responsibility |
|---|---|
| `npm run doctor` | Report environment/capabilities without secrets |
| `npm run db:up` | Start local development PostgreSQL |
| `npm run db:migrate` | Apply development migrations |
| `npm run db:seed` | Safely seed synthetic development data |
| `npm run dev` | Start frontend/API with same-origin proxy |
| `npm run typecheck`, `npm run lint`, `npm run build` | Static/build checks |
| `npm start` | Serve built application; no destructive auto-reseed |
| `npm run test:unit` | Rules/coordinator/adapter tests, no live model |
| `npm run test:api` | Designated isolated test PostgreSQL/API tests |
| `npm run test:e2e` | Cypress journeys with controlled setup |
| `npm run test:webmcp:native` | Actual native capability and direct calls |
| `npm run smoke:gemini` | One explicit live synthetic proposal |
| `npm run eval:webmcp -- --cases MODEL-EXACT,MODEL-AMBIGUOUS,MODEL-PURCHASE --repetitions 3 --max-tool-steps 8` | Project wrapper for pinned runner and independent outcome checks |

The wrapper validates these arguments, enforces budgets and records its translated configuration. It must not forward invented flags to Google's runner. Native/live commands that cannot run must report blocked/not run; deterministic CI must not silently count them as passes.

Suggested `.env.example`:

```dotenv
PORT=3001
APP_ORIGIN=http://localhost:5173
APP_TIMEZONE=America/Los_Angeles
DATABASE_URL=postgresql://trip:trip@localhost:5432/trip_workbench
TEST_DATABASE_URL=postgresql://trip:trip@localhost:5432/trip_workbench_test
SESSION_SECRET=replace-with-local-random-secret
DEMO_USER_PASSWORD=replace-with-local-demo-password
AI_MODE=disabled
GEMINI_API_KEY=
GEMINI_MODEL=
AI_DEADLINE_MS=30000
AI_MAX_ATTEMPTS=2
CHROME_EXECUTABLE_PATH=
```

Database credentials here are localhost examples. Generate local secrets without printing them in reports. Startup should reject placeholder secrets. Tests use their own clock/configuration. Provider keys never use `VITE_` prefixes. Document production HTTPS/origin settings separately if deployment is later requested.

## 13. Resume prompt for a new Cursor chat

```text
Continue Trip Workbench from its current code/checkpoint.
Read AGENTS.md, docs/IMPLEMENTATION_LOG.md, docs/RESULTS.md,
docs/CURSOR_PROMPTS.md and docs/CONTRACTS_AND_EXAMPLES.md; inspect git status.
Identify completed stages from executed evidence, not checkboxes. State the
next unfinished stage and follow its implementation prompt. Preserve working
code and user changes; fix relevant failed checks first. If native/provider
execution is blocked, keep that status honest and complete independent work.
Do not restart the project or repeat live evaluations without a concrete reason.
Return the stage completion report.
```

## 14. Repair prompt for a scaffold or failing stage

```text
Continue this Trip Workbench stage through its documented finish line.
Compare actual code/checks with the stage criteria in CURSOR_PROMPTS and
CONTRACTS_AND_EXAMPLES. List concrete missing behavior or failing checks,
then make the smallest necessary fixes and run affected verification.
Do not expand scope, use placeholder success, weaken assertions, bypass auth,
or count mocked providers/browser APIs as live/native evidence. Preserve user
changes. Update RESULTS/IMPLEMENTATION_LOG and stop when sufficiently verified.
```

## 15. Completion report for every stage

```text
Stage completed:
What now works:
Files/modules changed:
Commands actually run and results:
Fixture / live / native coverage:
One example I can reproduce:
Blocked or unfinished requirements, with exact reason:
Next prompt to run:
```

Bring this report and a repository/commit link when available back for review. The most useful implementation files are the trip service, coordinator, native adapter, Gemini adapter, race test and one actual evaluation result.
