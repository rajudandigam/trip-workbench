# WebMCP Cursor plan and copy-paste prompts — November 23, 2026

Yes: Cursor can prepare the code changes, regression tests, local native-browser validation, integration experiments, documentation and upstream contribution drafts. Native execution requires a usable browser and disposable database. Maintainer acceptance, independent application feedback and actual adoption require other people; code cannot substitute for those results.

The initial engineering goal is trustworthy evidence plus one useful upstream contribution. A new npm package is a later decision, conditional on repeated external need.

**Workspace and prerequisites**

| Item | Needed now? | Purpose |
|---|---|---|
| rajudandigam/trip-workbench | Yes | Repair comparison reporting and run the native application fixture |
| rajudandigam/agent-inspect | Yes, primarily reference | Reuse existing capture/read/check/evidence APIs; change core only for a separately reproduced core defect |
| GoogleChromeLabs/webmcp-tools | Yes for upstream work | Add schema-preservation/diagnostic tests in webmcp-evals |
| webmachinelearning/webmcp | Reference only | Check current specification and capability boundaries |
| signettai/signett | Optional source reference | Prefer an isolated, version-pinned package experiment first |
| puppeteer/puppeteer | Not initially | Coordinate with existing outputSchema work; clone only if a separate Puppeteer change is actually needed |

Add [webmcp-tools](https://github.com/GoogleChromeLabs/webmcp-tools) as a third Cursor workspace folder. If it is absent, clone it into an unused sibling directory. Keep repositories independent; do not combine package manifests, lockfiles or Git history.

Trip needs the Node version declared in its manifest, dependencies installed from its lockfile, TW_CHROME_BIN pointing to an executable native WebMCP-capable browser, and an isolated TEST_DATABASE_URL. Use existing database provisioning and safety checks. Do not repurpose a production or development database as a test database.

Use capability checks as well as version numbers. The Trip UI-sync cases and the newer outputSchema path have different requirements; do not make every existing native test depend on the newest optional API.

**Verified starting points**

- Trip main: 2edf8a743e51442a8ecf0bac2720065db85161bf; its package pin is agent-inspect@6.31.41.
- Google tools main: 65c1ddc90b118c0ecf89d7478b704c4d65b3fe8e.
- AgentInspect main advanced to 5cba94ffb8e66e5c21ec3e930faab15853ab422a after the assessment. Its current task describes the N2 lifecycle/token-budget fix and a pending 6.31.42 publication.
- Treat those as reviewed snapshots, not immutable instructions. Recheck current branches, package publication and repository task files when Cursor starts.
- Do not label a main-branch change as published. Keep Trip’s reproducible 6.31.41 baseline initially unless the targeted work requires a later verified package.
- AgentInspect has maintainer-reviewed chunk/release rules and separate external-evidence gates. This WebMCP work must not merge the pending release or mark those gates approved.

The assessment reproduced reporting problems with the real writer/CLI, but native Chromium could not launch on the research host. Do not treat that as evidence that the browser matrix passed or that the application itself is broken.

**Recommended chunks**

| Chunk | Repository | Deliverable | Completion test |
|---|---|---|---|
| T1 | Trip | Explicit case/run/artifact ownership | Multiple actual writer runs are scored correctly regardless of timestamps; missing or wrong artifacts fail |
| T2 | Trip | Correct CLI finding classification and overall evidence gate | Expected negative controls pass only for their named findings; unrelated failures and invalid artifacts fail |
| T3 | Trip | Honest operation states and comparison documentation | Unknown remains unknown; deadline failure survives repair; inapplicable lanes are not scored |
| T4 | Trip | Native execution packet | All mandatory cases executed through actual native discovery/invocation, or accurately reported blocked/failed |
| G1 | Google Evals | Schema-loss reproduction and minimal diagnostics patch | Actual mapper/provider boundaries tested without paid model calls; compatibility behavior documented |
| G2 | Google Evals, conditional | Optional outputSchema preservation | Supported boundary retains it; older boundary reports unavailability; no fake dependency support |
| I1 | Isolated example, conditional | Signett → AgentInspect evidence experiment | Exact retained/lost fields and practical benefit documented using existing APIs |
| E1 | Review artifacts | Upstream issue/PR drafts and external trial instructions | Another maintainer can reproduce the relevant result without private credentials |
| Decision | No new package yet | Go/no-go note | Reusable external need demonstrated, otherwise keep contributions and recipes |

T1–T3 are a small sequence, not a broad refactor. T4 can be blocked without preventing independent G1 work. G2 may remain dependency-blocked while G1 is ready. I1 is optional and should be abandoned if the existing workflow already meets the need.

**Files to inspect and likely edit**

Paths below are repository-relative. Cursor should resolve the actual workspace roots.

| Repository | Existing files | Intended change |
|---|---|---|
| Trip | scripts/webmcp/ui-sync-comparison.ts | Case artifact lookup, persisted evidence/check interpretation, operation/phase scoring |
| Trip | scripts/webmcp/ui-sync-evidence.ts | Carry case/run identities, record actual tool steps, pass per-case artifacts, aggregate final status |
| Trip | scripts/webmcp/ui-sync-finalize.ts | Integrate evidence completion if this is the existing suitable aggregation boundary |
| Trip | tests/unit/ui-sync-comparison.test.ts | Preserve and extend focused scoring tests |
| Trip | tests/unit/ui-sync-finalize.test.ts | Cover overall evidence status if finalization changes |
| Trip | docs/AGENTINSPECT_WEBMCP.md; docs/WEBMCP_SETUP.md | Actual commands, state meanings, evidence limitations and real run results |
| Trip | A new focused persisted-comparison integration test, placed according to current conventions | Exercise published writer → disk → public CLI → report, not just hand-written JSON |
| Google | webmcp-evals/src/evaluator/mappers.ts | Reproduce and report schema transformation |
| Google | webmcp-evals/src/types/tools.ts | Minimal metadata preservation where the current representation loses it |
| Google | webmcp-evals/src/backends/vercel.ts; gemini.ts; ollama.ts | Inspect actual provider boundaries; edit only affected adapters |
| Google | webmcp-evals/src/test/mappers.test.ts; relevant backend/report tests | Provider/request-boundary regression coverage |
| Google | webmcp-evals/src/report/report.ts and existing docs | Surface diagnostics only where required by the chosen minimal design |
| AgentInspect | examples/recipes/webmcp-native-evidence/src/capture.ts and verify.ts | Reuse as reference; do not assume reference helpers already meet every new acceptance criterion |
| AgentInspect | Existing related recipes and readers | Conditional integration experiment, with no new root/core dependency |

Do not invent an inspector.tool API. The existing capture recipe uses inspector.step(name, callback, { type: "tool", ... }). Verify current signatures before implementation.

**What a corrected Trip report must mean**

Keep test correctness separate from application outcome and evidence integrity. Exact JSON property names can follow current conventions; these are semantic requirements, not a new AgentInspect trace schema.

| Scenario | Fixture result | Application observation | Artifact/check expectation |
|---|---|---|---|
| Healthy update | Pass | Required deadline facts met | Correct case artifact; checks pass; bundle verifies |
| Stale then repaired | Pass if the expected problem and repair are observed | Deadline unmet; after-repair met | Original deadline failure retained; only expected negative findings |
| Missing observer | Pass as a negative control | Unknown | Named unknown observation retained; expected CLI finding classified |
| Wrong resource | Pass as a negative control | Binding unmet; unavailable other facts remain unknown | Correct binding failure, correct run/resource ownership |
| Dirty-edit refusal | Pass if refusal and no write are observed | Safe-refusal expectation met; mutation must not be claimed | No fabricated successful mutation/tool facts |
| No browser / no mandatory capability | Blocked or not run under current conventions | Not scored | Strict command nonzero; no success claim |
| Missing/corrupt evidence or unrelated CLI failure | Fail | Preserve any independently observed facts | Overall evidence run fails |

If a known failure and an unknown fact coexist, retain both; do not let unknown erase the known failure. A green negative-control fixture is not a green application operation.

A/B/C must compare:
- A: final DOM state.
- B: competent per-operation assertions with DOM/database facts and retained diagnostics.
- C: those same observations persisted and examined through AgentInspect.

B can detect the same failures as C. Measure or demonstrate C’s added value in reopening, sharing, comparing and explaining evidence. Do not create a deliberately weak B baseline. Mark synthetic controls and the injected DOM rewrite accurately.

**Regression cases that matter**

T1:
- Use the actual published AgentInspect writer to create at least three distinct runs in one test execution.
- Resolve every required case deterministically to its run and file.
- Changing file modification times must not change ownership.
- Missing, duplicate and unrelated artifacts cannot substitute for the required case.
- Include an unscored seed run and make sure it cannot become a case’s artifact.

T2:
- A normal case needs successful checks and verified evidence.
- An expected negative case needs all required named findings and no unrelated failures.
- Match structured rule/outcome/run evidence, not only a nonzero exit or substring.
- An expected outcome failure plus a missing-tool finding fails overall.
- Truncated/malformed JSON, CLI launch failure, nonzero unexpected exits, missing or invalid bundles and writer-finalization failure remain nonpass.
- A passing browser fixture cannot hide a failed evidence result.
- Do not parse the existing 4,000-character stdout preview as the authoritative CLI JSON; parse a complete bounded result and retain a separate display preview. Output-limit overflow is an explicit failure.
- Apply required-tool checks only where a real invocation is expected; synthetic observation-only controls must not fabricate tool execution.

T3:
- Missing observer → unknown operation.
- Deadline failed, repair passed → two retained phase results.
- Partial observations do not fabricate completion.
- A lane with no applicable claim is not_scored, not a credited pass.
- Safe refusal must be bound to an explicit no-write expectation.

G1/G2:
- Nested anyOf and oneOf cases demonstrate what the projection changes.
- Unchanged simple schemas are preserved.
- The source schema is not mutated.
- Existing redundant enum/union examples remain understood; do not claim every removed keyword necessarily widens accepted values.
- Output schema present/absent/unavailable cases remain distinct where capability is known.
- No unsupported provider fields are appended to requests.
- Provider request captures use the actual serialization boundary, with a keyless stub.
- Tests do not cast an absent browser/Puppeteer field into “native support.”

**Google Evals design caution**

The current mappers.test.ts explicitly expects oneOf and anyOf to be stripped, including an anyOf-only property becoming {}. That behavior is intentional. Do not remove that test and declare the compatibility issue solved.

The existing sanitizer clones its input. Original input schemas are not being mutated. Reuse the already retained source representation where possible; avoid storing duplicate “original schema” fields everywhere.

The current types file already includes outputSchema on ToolSchema but not on the internal Tool shape. Trace the actual lossy conversion points before adding fields. The first useful contribution can be diagnostics and regression coverage, leaving compatibility behavior intact until a tested provider-specific replacement is available.

At review time Chrome documented outputSchema from version 159 and Puppeteer PR #15579 remained unmerged. Recheck both. Support in one layer does not imply support across the whole route.

**Commands and validation**

Use the current repository scripts after checking them. These were verified in the reviewed source.

Trip:
~~~sh
npm ci
npm run test:unit
npm run typecheck
npm run build

# After provisioning the isolated database and selecting native Chrome:
npm run test:receipt-readback-evidence
npm run test:webmcp-evidence
npm run test:webmcp-ui-sync-evidence
~~~

Run focused tests while editing, then the required chunk gates once. API readback is not native WebMCP proof. Informational test:native-smoke may exit zero when blocked; use the strict evidence command for acceptance.

Set TW_CHROME_BIN and TEST_DATABASE_URL locally. Do not paste credentials into a report or commit an environment file. Do not disable the database guard to make a run proceed.

Google Evals:
~~~sh
# From webmcp-tools/webmcp-evals:
npm ci
npx tsc
node --test dist/test/mappers.test.js
# Add only the relevant backend/report test files for the patch.
~~~

The reviewed npm run build invokes formatting, and npm test invokes that build. Inspect the resulting diff when running required full upstream checks; avoid unrelated formatting changes. Follow upstream contributing instructions and required tests before considering a patch ready.

No paid model call is necessary for the core regressions. A request-stub test proves serialization, not live model behavior.

AgentInspect:
Follow its AGENTS.md and current operational files if an actual change is needed. Do not run its full release train for a Trip-only patch. A local workspace/tarball test and a registry-package test must be labeled separately.

**How to use the prompts**

1. Add the third repository for G1/G2.
2. Paste the master prompt below into Cursor Plan mode.
3. Review the resulting file list and begin with T1. Use the implementation prompt after the plan is accepted.
4. Proceed through small reviewable chunks. A blocked native run must not be replaced with a mock pass.
5. Use the conditional prompt only after the core proof and upstream reproducer are useful.
6. Keep publication and outreach as reviewed final actions; Cursor can prepare their exact text and artifacts.

**Master prompt — paste into Cursor Plan mode**

~~~text
You are working in a multi-root Cursor workspace with:
- agent-inspect
- trip-workbench
- webmcp-tools (GoogleChromeLabs/webmcp-tools), if already added.

Goal:
Produce an actionable, evidence-based implementation plan that makes the existing WebMCP comparison trustworthy and prepares a small upstream Google WebMCP Evals contribution. Reuse existing AgentInspect capabilities. A new npm package is not part of the initial scope.

Start by inspecting current state, not by assuming the review findings are still open:
1. Locate the repository roots and read applicable AGENTS.md / contributing instructions.
2. Record branch, working-tree status, HEAD, remote main SHA, installed versions and lockfile versions.
3. Fetch remote refs without resetting or overwriting work. Preserve unrelated changes and release work.
4. Read AgentInspect RELEASE-TRAIN-STATE.md, CURRENT-TASK.md and the relevant active-plan portion. Do not rewrite its active release train.
5. The reviewed Trip commit was 2edf8a743e51442a8ecf0bac2720065db85161bf, using agent-inspect@6.31.41.
6. Google tools was 65c1ddc90b118c0ecf89d7478b704c4d65b3fe8e.
7. AgentInspect later advanced to 5cba94ffb8e66e5c21ec3e930faab15853ab422a with an unrelated N2/6.31.42 release in progress. Verify current reality; never equate main with published npm.
8. Treat all findings below as hypotheses to reproduce on the chosen baseline. Skip issues already fixed.

Scope and workflow:
- Plan small independently testable chunks T1, T2, T3, T4, G1 and conditional G2.
- Keep each repository independent.
- Use Trip's currently pinned published AgentInspect for the initial regression.
- Reuse public writer/reader/check/Evidence APIs; do not add a trace schema, new root dependency, browser instrumentation framework or generic WebMCP SDK.
- Follow repository chunk/review instructions. Identify conflicts before editing.
- Prepare local code, tests, docs and review artifacts. Do not publish packages, change release versions, merge PRs, push, send outreach, or mark external gates approved.
- Give exact files, reproduction, implementation, acceptance tests and required commands for each chunk.

T1 — Correct case/run/artifact ownership in Trip:
Inspect scripts/webmcp/ui-sync-comparison.ts, ui-sync-evidence.ts, ui-sync-finalize.ts and related tests.
The reviewed runner creates separate inspector runs for seed and cases but locateWrittenTrace selects the newest JSONL and reuses its outcomes for all cases.
Reproduce this using the actual published writer.
Plan explicit case -> runId -> artifact ownership with a unique execution directory and per-case evidence directory. Use existing readers and supported output formats.
Do not select by mtime or raw-concatenate runs without identity.
Keep the seed separate. Missing, duplicate, stale or unrelated artifacts must not satisfy a case.
Test multiple real runs and reordered mtimes.

T2 — Correct CLI/evidence gating:
The reviewed entrypoint returns matrix.ok/matrix.exitCode without incorporating persisted comparison failures.
Separate fixture behavior, CLI execution/check findings, bundle integrity and overall evidence success.
Parse complete bounded CLI JSON before making display previews. Treat invalid/truncated output, CLI process failures, unexpected findings and missing/invalid evidence as nonpass.
Expected negative controls pass only when every required named observation/finding is present for the correct case/run and no unrelated failure is accepted.
Do not merely allow any exit 1.
The current CLI helper requires update_trip_draft although the runner does not record a tool step. Use the existing public inspector.step(name, callback, {type:"tool", ...}) pattern for actual native invocations where appropriate; verify the current signature first. Preserve application return values/errors and metadata-only capture.
Use case-specific rules for synthetic observation-only controls; do not invent tool activity.
Make final process/report status include required evidence results, with native execution and evidence completion still separately visible.
Regression: expected unknown outcome plus unrelated tool.usage failure must fail; bundle verify alone cannot satisfy the gate.

T3 — Correct outcome semantics and documentation:
fixtureStatus=pass must not automatically imply operationVerdict=met.
Separate fixture correctness, deadline outcome, repair outcome and evidence integrity.
Represent unknown, unmet and not-scored explicitly. A known violation is retained even if other facts are unknown.
Keep stale-at-deadline and repaired-afterward distinct.
Safe dirty-edit refusal needs an explicit no-write expectation; do not claim a mutation occurred.
Mark inapplicable comparison lanes not_scored.
Update docs/AGENTINSPECT_WEBMCP.md and docs/WEBMCP_SETUP.md.
Keep the existing DOM value rewrite labeled as an injected detector control, not a reproduced React cache defect or production latency result.

T4 — Validate native behavior:
Use a real supported browser selected by TW_CHROME_BIN and a disposable TEST_DATABASE_URL.
Use existing app/database setup and guards. Do not change guards to bypass isolation.
Probe actual native discovery/execution capabilities; record exact browser, Puppeteer and package versions.
Run the strict native evidence and UI-sync commands with all five existing cases accounted for.
Do not install a polyfill or use page.evaluate to directly call a handler and count it as native WebMCP invocation. page.evaluate is acceptable for DOM observations.
Keep missing browser/capability blocked or not_run with a nonzero strict gate. Preserve partial-run failures and writer-finalization failures.
Capture per-case traces, structured CLI results, verified bundles and a concise provenance report.
If native is blocked, continue independent offline/upstream preparation but leave native acceptance incomplete.

A/B/C comparison:
A is final DOM.
B is competent per-operation browser plus database assertions, including retained diagnostic output.
C uses the same observations through AgentInspect.
Do not claim AgentInspect uniquely detects failures B also detects. Show any practical benefit in reopening, comparing, sharing or explaining the persisted evidence.

G1 — Google Evals schema diagnostics:
If webmcp-tools is absent, identify the missing sibling clone; the first Trip chunks can proceed independently.
Read its current mappers, Tool/ToolSchema types, provider adapters, tests and contributing instructions.
Reproduce outputSchema being dropped at mapRawBrowserToolsToConfig when supplied, and nested anyOf/oneOf being removed by sanitizeSchema.
The current test explicitly expects stripping. It is an intentional compatibility workaround.
Do not remove it globally without proving provider compatibility.
The source input is already cloned, so avoid unnecessary duplicate source-schema storage.
Prefer a minimal patch retaining available source metadata and reporting actual provider projection changes through existing diagnostic/reporting patterns.
Test unchanged schemas, nested unions, source immutability, clear transformation diagnostics, and the real provider serialization boundary with a keyless stub.
Do not invent provider support or append unsupported request fields.
Prepare a before/after reproduction and local issue/PR draft. State whether the patch preserves behavior or changes it.

G2 — Optional outputSchema path:
Recheck Chrome documentation and Puppeteer PR #15579 / released support.
ToolSchema already has outputSchema in the reviewed source; internal Tool does not. Trace every conversion, edit only actual loss points.
Preserve metadata where supported, and distinguish unavailable capability from an authored omission when the capability is known.
Do not use unsafe casts or fabricated browser data as native proof.
If the dependency is not released, prepare the independent type/mapper tests and document the blocked native path. Do not force unrelated upgrades or duplicate the existing Puppeteer PR.
Output schema conformance must not be reported as proof of the real application effect.

Deliver the plan with:
- current baseline and already-fixed findings;
- chunk order and file list;
- regression tests and acceptance criteria;
- native prerequisites and precise blockers;
- effect on APIs, dependencies, schema, network behavior and release work;
- commands from each repository;
- proposed upstream issue/PR drafts;
- a final decision: no new package unless independent recurring demand is demonstrated.

Do not implement the optional Signett integration or create a new package in this planning step. End with the exact first chunk to implement.
~~~

**Implementation prompt — paste after accepting the plan**

~~~text
Implement the next accepted, unblocked commit-sized chunk from the WebMCP plan, starting with T1 if it is still open.

Before editing, report the current starting commit, scope, files and focused tests. Recheck that the finding still reproduces. Follow the repository's chunk and maintainer-review instructions; preserve unrelated work and active release state.

First demonstrate the regression with the actual public boundary relevant to this chunk. Implement the smallest correction, then run focused tests and the required chunk gate once. Do not keep expanding tests without a concrete remaining risk.

Use the installed/pinned published package for Trip consumer validation. If a core change becomes necessary, isolate its reproduction and label any packed-source consumer test separately from npm validation.

Keep code, tests and directly affected docs consistent. Report:
- files changed and why;
- before/after observed behavior;
- tests actually executed and their results;
- blocked or unexecuted native/model paths;
- API/dependency/network impact;
- next chunk.

Prepare the change for review. Do not push, publish, merge releases, change package versions, or send external messages. Do not mark a blocked gate complete.
~~~

**Conditional integration prompt — use after T1–T4 and G1 are assessed**

~~~text
Evaluate one small Signett-to-AgentInspect integration experiment using existing public APIs.

Use a version-pinned isolated consumer or an existing private recipe, not a new public package or root dependency. Read current Signett events/OTLP support and AgentInspect readers first.

Use deterministic callbacks for:
1. execution succeeds and authoritative verification passes;
2. execution returns but postcondition verification fails;
3. response is lost and authoritative recovery proves the result;
4. recovery cannot establish the effect, which remains unknown.

Record the facts Signett actually exposes, then test whether AgentInspect's existing ingestion path preserves them. Do not turn every generic failed event into a known postcondition failure; require explicit stage/error/fact evidence.
Preserve invocation/run/resource identity and deadline/repair phases where supplied; document anything unavailable.
Produce a retained/transformed/lost/unknown field table and one reopenable evidence example.
Compare this with Signett's existing evidence/eval output and ordinary per-operation assertions.

Stop if no useful advantage is demonstrated. If there is an advantage, prepare a small recipe and an unsent request for maintainer feedback. Do not create an adapter package or broaden core unless a specific repeated mapping defect is demonstrated and accepted as scope.

For the external trial, prepare instructions for one maintainer-owned fixture from #553/#559 or another agreed application. Leave actual independent reproduction and maintainer feedback pending until received. Never label our own fixture as external adoption.
~~~

**Completion and new-package decision**

Cursor can finish the engineering packet with these artifacts:
- trustworthy per-case Trip comparison;
- focused real-writer/CLI regression coverage;
- a native run with exact provenance, or a clearly blocked native report;
- a small tested Google Evals patch/reproducer;
- unsent issue/PR text and reproduction instructions;
- optional integration findings;
- an explicit record of what is and is not established.

A separate package is justified only if the same diagnostic is needed by multiple independent consumers, existing tools do not already solve that boundary, and the extracted core stays small. The initial candidate is authored/runtime/provider schema diagnostics. Keep it inside upstream tests or a private recipe until those conditions hold.

Useful source links:
- https://github.com/rajudandigam/trip-workbench
- https://github.com/rajudandigam/agent-inspect
- https://github.com/GoogleChromeLabs/webmcp-tools
- https://github.com/GoogleChromeLabs/webmcp-tools/issues/553
- https://github.com/GoogleChromeLabs/webmcp-tools/issues/559
- https://github.com/puppeteer/puppeteer/pull/15579
- https://developer.chrome.com/docs/ai/webmcp/imperative-api
- https://github.com/signettai/signett

