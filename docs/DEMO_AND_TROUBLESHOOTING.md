# Trip Workbench: demonstration and troubleshooting

These are proposed demonstrations and expected outcomes. Replace expected outcomes with recorded observations as Cursor implements the app. Do not present this document as a completed test report.

## The story you should be able to explain

“Trip Workbench is a normal business trip request app. I added two ways AI can help: Gemini can propose fields from a brief, and a browser agent can operate an existing draft through WebMCP. Both eventually use the same application commands. The server owns authorization, validation and persistence. The interesting part is preserving human edits and checking whether an apparent success actually saved the intended state.”

You can connect the example to your experience with TypeScript enterprise workflows, travel systems, testing and AgentInspect. Describe this application as a synthetic reference implementation. Use production experience as context without claiming that this demo is deployed inside Navan.

## Start with one reliable manual journey

Use the synthetic traveler and the exact request below:

> Prepare a round trip from SFO to JFK, departing November 12, 2026 and returning November 15, 2026, for one traveler in economy. Purpose: customer workshop.

1. Sign in through the normal login screen.
2. Create a new trip draft; note its ID and visible default values.
3. Enter the details manually and save.
4. Open review. Confirm there are no missing fields or policy review requirements with the fixed October 14 test clock.
5. Submit. Confirm the wording is “Trip request submitted.”
6. Refresh and reopen the direct URL. Confirm the same ID, fields and submission.

For a normal live demonstration after the example dates have passed, choose fresh future dates and record them. Keep automated fixtures on their injected clock so tests remain deterministic.

## Four separate integration demonstrations

| Demonstration | What to do | What to verify |
|---|---|---|
| Embedded Gemini | Paste the exact brief; choose Suggest; inspect diff; choose Apply | Suggest alone does not mutate; Apply persists the accepted fields |
| Direct native tool | Open a clean draft in supported Chrome; discover tools; invoke read/update/validate | Actual browser API; saved values and refreshed UI agree |
| Browser agent | Give the exact brief to the configured native model-evaluation path | The model selects tools and the independent observer checks the outcome |
| Optional local summary | Choose on-device summary on a supported machine | Real local result, cleanup, and no automatic off-device fallback |

Use a fresh draft for each demonstration. A direct tool invocation is not a live model run. A fixture extraction is not a Gemini result. Label a recording as a recording.

## Three-minute primary demonstration

| Time | Action | Point to explain |
|---|---|---|
| 0:00–0:25 | Show the ordinary editable trip form | A complete application exists before AI integration |
| 0:25–1:00 | Fill through the actual native tool path | Agent actions call the existing application operations |
| 1:00–1:35 | Save a human change, then attempt an update with the earlier revision | The server rejects stale changes |
| 1:35–2:10 | Review, submit through UI and refresh | A reported success must agree with persisted state |
| 2:10–2:45 | Show an executed model evaluation and its independent result | Model choice, execution and task outcome are separate checks |
| 2:45–3:00 | State actual live/fixture/synthetic boundaries | Explain one observed limitation accurately |

Keep a separate two-minute Gemini demonstration ready for follow-up questions. Do not try to demonstrate every failure case in the opening three minutes.

## Worked failure demonstrations

**Ambiguity.** “Prepare my trip next Friday to Springfield.” Expected: ask which airport and exact date; saved destination/dates remain unchanged. Explain that the application deliberately asks for confirmation of that relative-date phrase.

**Unsaved human input.** Type a purpose change without saving, then invoke the update tool. Expected: `USER_EDIT_IN_PROGRESS`, zero mutation, local input retained. Explain why a database revision alone cannot protect unsaved keystrokes.

**Edit while an agent write is running.** Hold a response with a test harness barrier. Agent sets return to November 16. Human types November 17. Release response. Expected: saved November 16, local November 17 visibly unsaved. Keep this fault-control mechanism in the test harness, not a publicly reachable product switch.

**Stale proposal.** Generate a proposal, change the brief or form before it returns, then release it. Expected: read-only stale proposal, no Apply, no lost edits. Do not silently regenerate or apply based on a different brief.

**Uncertain cancellation.** Cancel after a mutation may have reached the server. Expected: reconciliation by command ID and current resource, with unknown status if confirmation is unavailable. Explain that transport cancellation is not a transactional rollback.

**False success.** Inject a test-only response that says success without the intended saved change. Expected: independent outcome check fails; the test itself passes because it detected the injected mismatch. This is a demonstration of the checker, not a discovered production incident.

## Troubleshooting

| Symptom | Check next | Correct response |
|---|---|---|
| Cursor made a pretty screen but no real API | Inspect network calls, migrations and service implementation | Run the repair prompt for the missing server/manual stage |
| Database tests cannot connect | Doctor output, local Compose status and designated test URL | Fix local setup or report blocked; do not replace PostgreSQL evidence with a mock |
| Sign-in works but writes fail | Actual origin, proxy, cookie and CSRF flow | Repair same-origin/session integration; preserve protection |
| `document.modelContext` is absent | Browser version, documented exposure setup, managed policy | Use permitted supported environment or mark native blocked |
| Adapter tests pass but native smoke fails | Which test actually used the browser API? | Report both results; fix native integration separately |
| Tools remain after logout/remount | Pending registration cleanup, stale actor generation | Repair lifecycle; retest the concrete race |
| Evaluation opens the login page | Fresh context and login fixture | Add normal authentication to the wrapper before tool discovery |
| Gemini is unavailable | AI_MODE, server-only key presence, configured model access | Keep manual UI working; show explicit failure; no fixture substitution |
| Valid JSON fails server checks | Calendar values, enum/airport allowlist, protected keys | Report invalid proposal; preserve draft; distinguish shape from domain |
| Retrying causes revision increments | Command identity retention and DB receipt constraints | Fix idempotency and assert one logical mutation |
| UI goes backwards after a retry | Old receipt versus current resource revision | Reconcile latest state; preserve local edits |
| Review becomes stale | Draft revision or policy version changed | Rerun review before submit |
| Article claims cannot be reproduced | Actual commit, environment and evidence manifest | Narrow the claim to observations or omit it |

Do not paste secrets into chat or disable authorization to make a demonstration work. Missing credentials and managed browser restrictions are environment facts to report, not reasons to fabricate evidence.

## Interview questions this app prepares you to answer

- Why use a direct SDK rather than an agent framework for structured extraction?
- What does WebMCP add beyond the app's ordinary API and accessible UI?
- What happens when a human and an agent edit the same draft?
- Why do structured outputs still need runtime and domain validation?
- What does cancellation actually guarantee?
- How do you distinguish a model choosing the right tool from a completed task?
- What evidence does AgentInspect display, and where does that evidence come from?
- When should an optional local feature offer an explicit cloud alternative?

Answer from the code and recorded results. If a path was not run, say what is implemented and what remains unverified.

## Bring back for review

Share Cursor's stage report and repository/commit when available. Include relevant modules and the failing case if something is wrong. For a completed core build, the useful review bundle contains the trip service, client coordinator, native adapter, Gemini adapter, race/idempotency tests and one sanitized native-model evaluation result.
