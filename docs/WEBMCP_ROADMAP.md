# Trip Workbench Phased Cursor Plan

Build a dependable Trip Workbench release first, then write from its recorded behavior. Phase 1 improves the existing trip application and adds two useful WebMCP capabilities. Phase 2 introduces the event workflow. Phase 3 adds controlled research and reusable upstream examples.

Only Phase 1 is active. The later phases are a backlog, not instructions to implement now.

Reviewed October 23, 2026. Repository baseline: [9485a47](https://github.com/rajudandigam/trip-workbench/tree/9485a47d5a036de0fddc7cd8bc93227fcfc80d98). Cursor must inspect the actual checkout before editing and preserve any newer work.

## What the first release should do

A traveler can sign in, create or open a synthetic trip, edit it manually or through WebMCP, see what is saved, resolve conflicts or uncertain updates, and prepare a clear review. Submission remains a separate application action. An agent can explain what changed and what still needs attention.

Keep the existing React, TypeScript, Express, PostgreSQL, session, CSRF, and domain-rule architecture. Manual controls and WebMCP must call the same application commands. Server authorization and revision checks remain authoritative.

The app works with AI disabled. Fixture proposals remain explicitly labeled. Live Gemini proposals and model-driven browser tests are separate optional integrations.

## Current implementation to build on

The repository already has login, a trip list and create action, an editor, review and confirmation routes, command receipts, revision checks, Gemini proposal modes, Cypress tests, and a scenario catalog. Its three current WebMCP tools are get_trip_draft, update_trip_draft, and validate_trip_draft.

The documented October 20 browser session exercised native calls directly. It did not establish a model-selected journey. The current scenario runner still hardcodes several native/model cases as blocked. Preserve that distinction when adding results.

Prioritize these source-level concerns for reproduction and repair:

- **Refresh preservation:** refreshSavedDraft uses the mutation-oriented mergeAfterInFlightEdit helper. That helper preserves changes made after dispatch; a read also needs to preserve edits already present when the request starts.
- **Refresh ordering:** check that an older read cannot overwrite a newer saved revision, a newer read, a different draft, or a changed session.
- **Delayed recovery:** pendingOutcome stores identifiers and generations but not the original mutation snapshots. recheckOutcome builds a new context from current fields, which can lose the history needed to preserve intervening edits.
- **Registration reporting:** registerTripDraftTools returns a snapshot of pending/error values, and the editor ignores its result. Make actual registration readiness and failures observable.
- **Review binding:** review and submission must refer to the same draft revision and policy version. A later refresh must not silently change what the person is submitting.

These are implementation targets. Establish each behavior with a focused failing regression before describing it as fixed.

## Implementation areas

| Area | Existing files to extend |
| --- | --- |
| Read refresh and command recovery | src/client/lib/coordinator.ts; src/domain/async-result.ts |
| Tool schemas and lifecycle | src/client/lib/webmcp.ts; src/domain/trip-schemas.ts |
| Editor and review UI | src/client/pages/TripEditorPage.tsx; TripReviewPage.tsx; TripsPage.tsx; src/client/styles/app.css |
| Authoritative validation and receipts | src/server/services/trip-service.ts; src/server/routes/api.ts; src/domain/types.ts |
| Regressions and manual journey | tests/unit/coordinator-races.test.ts; coordinator-cancel.test.ts; tests/api/trips.test.ts; cypress/e2e/trip-request.cy.ts |
| Native evidence and setup | scripts/run-evals.ts; a small new native runner if needed; evals/evidence; package.json; existing docs |

Inspect neighboring callers before changing a contract. Keep database migrations out of Phase 1 unless a reproduced requirement cannot be met with the existing tables.

## Phases and stopping points

| Phase | Application and tooling work | Completion point |
| --- | --- | --- |
| 1 Reliable trip workflow | Repair state handling, improve saved/review UI, add two tools, native smoke checks, small recorded agent trials | Usable local release and evidence for the first articles |
| 2 Event workflow and contextual tools | Event draft wizard, route-specific capabilities, declarative form experiment, authenticated upstream evaluation integration | Three event journeys and a second practical tutorial |
| 3 Tool exposure research | Controlled distractors, global/contextual comparison, optional tracing integration, standalone upstream example | Reproducible study and contribution package |

After Phase 1, pause implementation expansion and work on the first DEV article and the HackerNoon task-success article. Their claims must match the evidence available. Event and tool-count articles wait for their respective phases.

## Phase 1 implementation order

### Pass 1 Establish and repair the baseline

Read applicable AGENTS.md files, package.json, README.md, and the current docs before editing. There was no AGENTS.md in the inspected repository tree; check the actual checkout and its parent instructions. Record the starting commit and worktree status. Do not reset, overwrite, or reseed an existing development database.

Run the existing relevant checks against a dedicated synthetic test database. Reproduce the refresh and receipt-recovery cases, then apply the smallest fixes.

A read refresh must preserve human edits present before dispatch and edits made during the request. A successful mutation receipt must update the saved baseline while preserving later local changes. Keep those merge rules explicit; do not make one helper serve both purposes unless its contract accurately covers both.

Keep original dispatch context for an unresolved update: draft/session/editor identity, command ID, expected revision, edit version, saved snapshot, and local snapshot. Recheck that same logical operation. A missing receipt or transport timeout does not prove that the write failed. Never create a replacement command ID automatically to resolve uncertainty.

Bound recovery requests as well as the overall retry loop. Reject new mutations while an outcome remains unknown. Reject stale results after route, draft, or session changes. Preserve current saved revisions when historical receipts arrive. Clear a resolved pending marker even when its receipt is historical.

For manual submission, bind the request to the reviewed revision and policy version. Prevent duplicate dispatch. Reuse a command ID for an exact retry and use the existing receipt endpoint if its outcome is uncertain. A recovered submission must show the actual submitted status, not an editable draft.

Keep recovery within the current authenticated workflow in Phase 1. Cross-session durable recovery is a later enhancement; do not silently imply it is supported.

### Pass 2 Make state and review understandable

Extend the current screens instead of replacing them:

- Trip list: clear draft/submitted status, route and date summary, existing create/open controls, useful empty and loading states.
- Editor: clear saved revision and saving/unsaved/unknown-outcome states; visible saved summary alongside the form; explicit Save and Discard actions.
- Conflicts: explain that saved state changed, preserve the local buffer, and require a deliberate review before another write.
- Review: display the reviewed fields, revision, policy version, blocking field errors, and nonblocking review requirements separately.
- Submission: keep the existing explicit application control and synthetic confirmation. The demo does not make travel bookings.
- Development diagnostics: browser capability and registration status, application/server readiness, and a bounded recent-operation list. Keep diagnostic details out of the normal traveler flow.

Preparing a review must not erase unsaved fields. Refreshing or editing after preparation invalidates that review. The premium-cabin scenario must retain the actual policy semantics: a review requirement can coexist with valid: true and canSubmit: true.

Use stable application-owned selectors for saved values, revision, status, review findings, and handoff readiness. These should represent useful visible UI, not a hidden test-only copy of application state.

Use synthetic fixtures whose dates remain valid relative to the app clock. In tests, inject a fixed clock and time zone through the existing server/test mechanism, not public URL parameters.

### Pass 3 Add two tools and strengthen registration

Keep the three existing tool names and their contracts unless a tested incompatibility requires a documented change.

| Tool | Phase 1 behavior |
| --- | --- |
| get_trip_draft | Read authorized saved state and current revision while preserving the local buffer |
| update_trip_draft | Apply an allowlisted patch using expectedRevision and commandId; refuse dirty, busy, or unresolved state |
| validate_trip_draft | Validate the exact supplied revision without substituting a newer one |
| prepare_trip_review | Validate the supplied revision and open an inline review summary in the current editor; leave the trip in draft |
| recheck_trip_update | Reconcile the editor's existing unresolved update without dispatching another write |

The two new names are proposed application contracts, not existing WebMCP API methods.

prepare_trip_review accepts draftId and expectedRevision. It refuses dirty, busy, unresolved, stale, unauthorized, or wrong-draft contexts. Return the reviewed revision, policy version, field issues, review requirements, canSubmit, and an explicit indication that nothing was submitted. The prepared panel can display blockers; preparation is not an assertion that the trip is ready.

Keep this handoff inside the editor in Phase 1. It avoids making a tool unregister itself halfway through navigation. The person's existing Review request action can continue to the separate review route, where validation is checked again.

recheck_trip_update accepts the current draft ID and pending command ID, verifies both against application-owned pending state, and reuses the existing recovery command. With no matching pending update, return an explicit error. It must not accept arbitrary receipt IDs, replay a PATCH, or claim a missing receipt proves non-application.

Registration follows loaded draft, session, role, and status. Read/validate/prepare can be available for an authorized read-only viewer; mutation and its recovery capability require the corresponding permission. Submitted trips must not retain editing tools. Execution must recheck authorization/context even if a tool was discovered earlier.

Return tool completion only after the promised application state has been applied; when promising visible review readiness, use a bounded application/DOM readiness check. Do not depend on an unbounded animation-frame wait in a background tab.

Report supported, registering, ready, and failed states reactively. Test late registration failures and cleanup on route changes, sign-out, and React remounts. Use current native API/type definitions verified against the installed browser. Consider webmcp-types if compatible; avoid a broad hook migration in this phase.

Do not add a submit/book/purchase WebMCP tool. This limits the exposed tool interface; it does not prove that an agent with unrestricted UI automation cannot click a submit button. Recorded agent trials must explicitly stop at review.

### Pass 4 Verify and capture usable evidence

Keep the existing unit, API, Cypress, and catalog checks. Add targeted regressions and a thin native-browser smoke runner, not a new evaluation framework.

The smoke runner should use a pinned, supported browser automation API after reading its current documentation. It must sign in through the normal synthetic-user flow in its own browser context, create isolated fixtures, discover actual page tools, execute them, and independently verify visible and saved state. Do not call a coordinator directly or install a mock modelContext and label that a native pass.

Use dynamic draft IDs and revisions returned by the application. Reset each case explicitly. A fresh browser page does not reset PostgreSQL. Keep setup actions separate from evaluated actions.

The upstream webmcp-evals CLI launches its own browser. Do not assume it shares Cursor cookies or accepts invented login/storage-state flags. Reuse its smoke mode only if the pinned version supports the required authenticated setup. Otherwise keep the project runner small and move full upstream integration to Phase 2.

Minimum acceptance matrix:

| Case | Required result |
| --- | --- |
| Dirty draft read | Saved values refresh; existing and in-flight local edits remain |
| Competing read/write responses | Saved revision never moves backward; wrong-context results do not apply |
| Agent update while dirty | Explicit refusal and zero mutation requests |
| Stale expected revision | Conflict; saved and local fields remain intact |
| One-way conversion | Saved return date is cleared; visible summary agrees |
| Lost response and recheck | Same operation reconciled; no duplicate write; later edits survive |
| Cancellation before dispatch | No mutation request |
| Cancellation after dispatch | Reconciled outcome or explicit uncertainty; no false rollback claim |
| Prepare review | Correct revision and findings; status remains draft |
| Review becomes stale | Submission requires a fresh review |
| Observer or wrong tenant | Server prevents unauthorized writes and disclosure |
| Route change and sign-out | Old tools/results cannot affect the next context |
| Manual submission | Reviewed snapshot is submitted once; uncertain outcome can be rechecked |
| Unsupported browser | Manual application works; native test is blocked with a reason |

Run three small model-directed tasks twice each when access is available: an exact trip update followed by review; an ambiguous request requiring clarification; and a premium-cabin request whose final explanation must distinguish review from a blocker. Keep all six results, including failures. This is a smoke sample, not a benchmark.

Use the model to choose actions from discovered tools. Record whether Cursor, Inspector, or the upstream runner supplied the model. If UI/API shortcuts were used, label that execution path rather than presenting it as a WebMCP-only journey.

Do not require a new provider key if the existing Cursor connection can complete these trials. If model access is unavailable, finish the application and deterministic checks, then mark the live-agent evidence as blocked.

## Phase 1 deliverables and article gate

Update the existing README and results documents. Add only these focused documents if needed:

- docs/PHASE_1_PLAN.md: scope, checkpoints, and completion status.
- docs/WEBMCP_SETUP.md: browser, Inspector, Cursor connection, credentials, and troubleshooting.
- docs/PHASE_1_EVIDENCE.md: cases, versions, results, limitations, and links to raw evidence.
- docs/PHASE_2_BACKLOG.md: deferred event, evaluation, and tool-exposure work.

Keep evidence under the existing evals/evidence structure. Include commit, full browser version, automation/tool versions, clock/time zone, fixture identity, execution mode, inputs, outputs, independent state checks, and status: pass, fail, blocked, or not_run. Keep secrets and cookies out of reports.

The current inspect.ts helper writes local JSONL. Reuse simple logging where useful, but verify compatibility before calling its output an AgentInspect-supported trace. Full tracing integration is optional later work.

**Application gate:** required code checks pass; the manual trip journey works; regression cases pass; five tool contracts are implemented; native support has either a recorded run or an explicit environment blocker.

**Article gate:** the claims used in an article have actual evidence. An article about model task success needs a real model trajectory and its final-state checks. Direct native invocation supports a narrower tool-integration article. An upstream-evals tutorial additionally needs the upstream integration to run. Adjust the first article title to the completed work.

## Manual setup and credentials

| Item | Needed when | What Raju needs to do |
| --- | --- | --- |
| Node and PostgreSQL | All local application work | Use a compatible Node LTS release, start Docker/PostgreSQL, and verify development/test database URLs |
| Local environment | First boot | Create .env from .env.example only if missing; keep it ignored; use a local session secret |
| Demo login | App and browser tests | Use the seeded synthetic account; the app manages its own session cookie and CSRF token |
| Native WebMCP | Native tool tests | Use a compatible Chrome build, enable WebMCP for testing, relaunch, and verify document.modelContext in the actual test profile |
| Model Context Tool Inspector | Optional manual inspection and agent trials | Install the extension and grant the required local-site access; manual tool calls do not require a Gemini key |
| Chrome DevTools MCP in Cursor | Cursor-based native tests | Enable the experimental WebMCP category, connect the intended browser profile, and approve the local MCP connection when Cursor requests it |
| Gemini application proposals | Optional live proposal mode | Create an API key in Google AI Studio, put GEMINI_API_KEY in the server environment, select an available GEMINI_MODEL, and set AI_MODE=live |
| Gemini through Inspector | Optional alternative model route | Configure the extension separately; the application .env does not configure the extension |
| Model evaluation CLI | Live model evaluations | Supply the selected provider's key to the evaluation process, configure a supported model, and set a small run/step budget |
| GitHub authentication | Pushing or opening a PR later | Use existing Git/gh authorization; no GitHub token belongs in the application |
| Hosting or origin trial | Later public deployment | Address hosting secrets and browser availability separately; local testing can use the browser flag |

Phase 1 needs no Navan authorization, Google Calendar OAuth, Maps key, flight provider key, booking token, or production account.

Startup after environment review:

```bash
npm ci
npm run doctor
npm run db:up
npm run db:migrate
npm run dev
```

Run npm run db:seed only on a fresh or explicitly disposable demo database. It resets existing demo data. Do not run it merely to restart a stopped app. If .env already exists, edit only required values rather than copying over it.

Start with AI_MODE=disabled; use fixture mode for deterministic proposal checks. The repository's current GEMINI_MODEL default is gemini-2.5-flash. Verify current account/model availability before live tests instead of treating that old default as a requirement. A live proposal test and a browser-agent test are different checks.

For Cursor, merge this into the existing MCP configuration rather than replacing other servers:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--categoryExperimentalWebmcp"
      ]
    }
  }
}
```

Use latest for initial setup, then record and pin the resolved working version for evidence runs. Enabling the MCP category does not enable WebMCP in Chrome. Configure the browser flag in the profile the server actually controls. Read the installed server's connection options rather than assuming it attaches to the currently visible Chrome window.

The current upstream browser backend is vercel; a google: model prefix selects Google. That adapter name does not by itself require a Vercel account. Verify key-variable mapping in the pinned release; its README and adapters recognize several Google-key aliases. Keep provider keys in the evaluation process, never VITE_* variables or browser application code.

## Cursor execution verbatim for Phase 1

Copy the following into Cursor with the trip-workbench repository open. It is self-contained and activates only Phase 1.

```text
Implement Phase 1 of Trip Workbench: a reliable existing trip workflow, five scoped WebMCP tools, and reproducible evidence. Work in this repository only. Do not implement the event wizard, tool-count benchmark, public deployment, or upstream contribution in this pass.

Start by reading applicable AGENTS.md instructions, package.json, README.md, docs/RESULTS.md, docs/CONTRACTS_AND_EXAMPLES.md, docs/ENVIRONMENT.md, and the current code. The reviewed reference was commit 9485a47d5a036de0fddc7cd8bc93227fcfc80d98; reconcile the actual checkout rather than resetting it. Preserve unrelated changes.

Use the existing React/TypeScript/Express/PostgreSQL architecture, session/CSRF protection, domain validation, revision checks, and command receipts. Keep manual controls and tools on the same commands. Default to AI_MODE=disabled and synthetic data. Complete work that does not require credentials before reporting a manual blocker.

Execute these checkpoints sequentially. Maintain docs/PHASE_1_PLAN.md and report progress after each checkpoint. Continue through Phase 1 without asking for approval on routine implementation decisions.

1. Baseline and state correctness
Run existing relevant checks using a dedicated test database. Do not overwrite .env or reset an existing development database.
Reproduce and fix:
- refreshSavedDraft losing local edits that existed before the read, plus edits made while it is pending;
- an old read overwriting a newer saved revision or a different draft/session;
- delayed recheckOutcome losing original dispatch context and overwriting intervening edits;
- unresolved updates allowing duplicate mutation attempts or hanging indefinitely;
- review/submission using a revision other than the one actually reviewed.
Use focused failing regressions before each fix. Separate read-refresh merge semantics from mutation-confirmation semantics.
Retain the original command ID and dispatch snapshots during recovery. A timeout or absent receipt is uncertainty, not proof of rollback. Do not retry with a fresh command ID.
Preserve later human edits, reject stale contexts, and handle historical receipts without regressing state. Bind manual submission to the reviewed revision/policy, prevent duplicate dispatch, and reconcile a lost submission response through the existing receipt mechanism.

2. Application UI
Improve the existing trip list, editor, review, and confirmation screens.
Show saved fields, revision, dirty/saving/unknown states, field errors, nonblocking review requirements, and clear recovery actions.
Add an inline prepared-review summary. Invalidate it when local or saved state changes. Keep the existing explicit manual submission path.
Preserve the real PREMIUM_CABIN behavior: review requirements can coexist with canSubmit=true. Do not convert every warning into a blocker.
Keep browser/tool diagnostics in the development view. Add stable selectors for useful visible state. Use fixed clocks in tests and valid synthetic demo dates.

3. Tool contracts and lifecycle
Retain get_trip_draft, update_trip_draft, and validate_trip_draft.
Add prepare_trip_review(draftId, expectedRevision): check the exact saved revision, reject dirty/busy/unresolved/wrong-context input, validate, show an inline review summary without leaving the editor, and return its revision, policy version, findings, canSubmit, and confirmation that nothing was submitted.
Add recheck_trip_update(draftId, commandId): accept only the editor's matching pending update and reconcile it without another PATCH. Return an explicit error when no matching operation exists.
Keep strict schemas and structured error envelopes. Reuse application commands. No booking, purchase, or submit WebMCP tool.
Make actual registration readiness/errors reactive. Ensure tool completion matches applied state and promised visible readiness using bounded checks. Check current API/type definitions against the installed browser. Test registration cleanup and stale execution after route changes, sign-out, submitted status, and React remounts.
Read/validate/prepare are subject to read authorization; mutation/recovery require matching permissions and context. Server enforcement stays authoritative.
Avoid migrating the entire adapter to a new React hook or adding a polyfill unless a concrete verified requirement demands it.

4. Verification and evidence
Run typecheck, lint, build, unit, API, E2E, and existing scenario checks as appropriate. Fix failures introduced by this work. Keep native, fixture, API, and model results separate.
Add a small native smoke runner using a supported pinned browser API after inspecting its current docs. Sign in normally in its own browser context; use an isolated test database and explicit per-case fixtures; discover and invoke real page tools.
Check returned outcomes, visible state, and an independent saved-state read. Derive IDs/revisions from real responses. Do not fake modelContext or invoke the coordinator directly and call it native.
Cover dirty read preservation, stale revisions, one-way date clearing, lost-response recovery, cancellation before/after dispatch, review preparation, stale review, permissions, and cleanup.
Inspect webmcp-evals before reusing it. Do not invent auth flags or assume its fresh browser inherits Cursor cookies. If authenticated setup is unsupported, use a thin project runner and defer broader upstream integration.
If a model is available through Cursor or Inspector, record three small tasks twice: exact update and review, ambiguous request requiring clarification, and premium-cabin review explanation. Retain failures and final-state checks. Do not claim this six-run sample is a benchmark.
If credentials/browser support are missing, finish all independent work and mark affected checks blocked with exact setup instructions.

Update README.md and docs/RESULTS.md. Add docs/WEBMCP_SETUP.md and docs/PHASE_1_EVIDENCE.md; preserve dated prior results. Store sanitized evidence under evals/evidence. Record commit, browser/tool versions, clock, fixture, execution mode, actual commands, and pass/fail/blocked/not_run.
List manual setup without requesting secrets in chat. The core app must work without Gemini. Live app proposals, Inspector Gemini, and external model evals have separate configuration.
Reuse simple existing tracing only where useful; do not claim AgentInspect compatibility without validating it.
End with changed files, completed checkpoints, tests actually run, remaining blockers, exact commands to reproduce the demo, and which article claims are now supported.
Stop after Phase 1. Do not push, publish, deploy, or begin Phase 2 automatically.
```

## Phase 2 backlog and activation prompt

Extend the same repository with a small synthetic event area. Reuse shared primitives where their contracts fit, but keep trip and event identities and rules distinct.

Add an event list and draft wizard with title, explicit dates/time zone, a synthetic/manual location, and review. Persist drafts through the existing authenticated server pattern. Do not send invitations or connect to real calendars. Treat the employer POC as workflow experience; write fresh public code.

Add an authenticated entry capability and page-scoped event read/update/validate/review tools. Test route transitions and availability; aggressive scoping must not hide the entry point needed to open the editor. Explore use-webmcp-tool in the new module after checking lifecycle and result-format behavior.

Exercise declarative forms separately in a supported native browser. Keep a manual fallback. Do not use an imperative-only polyfill result as evidence that declarative behavior works.

Integrate the pinned upstream evaluation package with explicit login, fixture setup, and state checks. Prefer an existing extension point; if none exists, make a small adapter or a focused upstream proposal. Keep authentication bypasses and database-reset endpoints out of the public application.

```text
Activate Phase 2 only after the Phase 1 release and first article evidence are reviewed. Read the current Phase 1 results and deferred backlog. Build one synthetic event-draft wizard in Trip Workbench using fresh public code, existing authorization/persistence patterns, contextual WebMCP tools, and native declarative-form experiments with a manual fallback. Verify prepare, concurrent-edit recovery, and review handoff journeys. Add authenticated upstream eval integration with explicit fixtures. Keep real invites, calendar OAuth, model benchmarks, and public deployment out of scope. Produce tests, a demo runbook, and evidence for the event-workflow article, then stop.
```

## Phase 3 backlog and activation prompt

Add experimental tool exposure only behind development/evaluation configuration. Compare the same three relevant tools alone, with seven unrelated tools, and with seven domain-confusable tools. Keep implementation, prompts, fixtures, clock, and model settings controlled.

Start with ten tasks, three conditions, and five repetitions: 150 journeys. Randomize order, retain failures, and report per-task results, model usage, latency, state correctness, and explanation accuracy. Extend to more tools or models after inspecting the pilot.

Compare global and contextual exposure using the event wizard. Add AgentInspect only after validating its trace contract; independent DOM/server checks still determine outcomes.

Extract a small runnable demo or fixture for upstream consideration after the feature works. Keep Google CLA, maintainer discussion, PR creation, catalog listings, and the separate smoke-resolver/CineFlow fixes in their own contribution tasks.

```text
Activate Phase 3 only after the event workflow is stable. Read the recorded Phase 1 and Phase 2 evidence. Build the bounded tool-exposure experiment with fixed tasks and fixtures, a pinned model, randomized condition order, and a 150-journey pilot. Measure saved/visible outcomes and final explanations separately. Preserve raw results and limitations. Prepare a small reusable fixture/demo and contribution proposal without publishing it automatically. Produce evidence for the tool-count DEV article and contextual-exposure HackerNoon article, then stop.
```

## Reference links

- [Trip Workbench source](https://github.com/rajudandigam/trip-workbench)
- [Coordinator at the reviewed commit](https://github.com/rajudandigam/trip-workbench/blob/9485a47d5a036de0fddc7cd8bc93227fcfc80d98/src/client/lib/coordinator.ts)
- [WebMCP adapter at the reviewed commit](https://github.com/rajudandigam/trip-workbench/blob/9485a47d5a036de0fddc7cd8bc93227fcfc80d98/src/client/lib/webmcp.ts)
- [Chrome WebMCP debugging](https://developer.chrome.com/docs/devtools/agents/webmcp-debugging)
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Model Context Tool Inspector](https://github.com/beaufortfrancois/model-context-tool-inspector)
- [WebMCP Evals](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/webmcp-evals)
- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- [Gemini API key setup](https://ai.google.dev/gemini-api/docs/api-key)
- [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models)
