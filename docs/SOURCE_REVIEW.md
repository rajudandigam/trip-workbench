# Source review and current API notes

Original pack review: October 14, 2026. That review recorded GitHub source inspections below; no application execution was claimed. Revision 2 retained this provenance, read the existing pack, and rechecked the official WebMCP imperative API/evaluation guidance, Gemini SDK/structured-output pages, Summarizer documentation, specification draft and evaluation-runner README on October 14. The reference repository commits and runner source findings below are inherited from the original review, not newly re-executed or independently re-inspected source in revision 2. Cursor must check the actual local/pinned versions. No application or model execution was performed for this expanded plan.

## Reference repositories

| Repository | Reviewed default-branch commit | Useful evidence |
|---|---|---|
| [flight-search-demo](https://github.com/rajudandigam/flight-search-demo) | `5724318ae5544fdec299685cdf6aa5d51b5f1af9` | React/Vite form, component stories/tests, accessibility patterns |
| [cypress-test-trust-demo](https://github.com/rajudandigam/cypress-test-trust-demo) | `5324585f50de080621945bf1f93497b450d3e8b9` | Express, PostgreSQL, sessions, idempotency, persisted-resource checks |
| [GoogleChromeLabs/webmcp-tools](https://github.com/GoogleChromeLabs/webmcp-tools) | `21874557fbad000216996f76f823b0f521085877` | Experimental evaluation runner and browser integration |

The first reference's inspected commit dates to October 2025; the second to October 11, 2026. Resolve the local state before adapting either. A reference dependency or test being present does not establish that it passes in the new app.

### Files inspected

- [Flight SearchForm](https://github.com/rajudandigam/flight-search-demo/blob/5724318ae5544fdec299685cdf6aa5d51b5f1af9/src/features/flights/components/SearchForm.tsx): controlled input layout and form errors; currently includes permissive types and date conversion behavior to revisit.
- [Flight package.json](https://github.com/rajudandigam/flight-search-demo/blob/5724318ae5544fdec299685cdf6aa5d51b5f1af9/package.json): React/Vite, Storybook and Cypress dependencies.
- [Trust README](https://github.com/rajudandigam/cypress-test-trust-demo/blob/5324585f50de080621945bf1f93497b450d3e8b9/README.md): real client/API/database path with a simulated airline/payment provider.
- [Trust package.json](https://github.com/rajudandigam/cypress-test-trust-demo/blob/5324585f50de080621945bf1f93497b450d3e8b9/package.json): client/server build and separate unit/API/critical scripts.
- [Booking service](https://github.com/rajudandigam/cypress-test-trust-demo/blob/5324585f50de080621945bf1f93497b450d3e8b9/src/server/services/booking-service.ts): scoped access, idempotency and transaction patterns; contains an intentional demonstration defect path that must not be copied.
- [Session middleware](https://github.com/rajudandigam/cypress-test-trust-demo/blob/5324585f50de080621945bf1f93497b450d3e8b9/src/server/middleware/session.ts): session resolution and required authentication.
- [Booking API tests](https://github.com/rajudandigam/cypress-test-trust-demo/blob/5324585f50de080621945bf1f93497b450d3e8b9/tests/api/booking.test.ts): tampering, access, expiry, idempotency and concurrency examples.
- [Critical Cypress tests](https://github.com/rajudandigam/cypress-test-trust-demo/blob/5324585f50de080621945bf1f93497b450d3e8b9/cypress/e2e/critical/booking-contract.cy.ts): saved resource and refreshed UI checks.
- [AgentInspect README](https://github.com/rajudandigam/agent-inspect/blob/main/README.md): manual integration and explicit outcome evidence; verify the installed package before selecting APIs.

## Corrections to the supplied research

| Topic | Implementation guidance |
|---|---|
| WebMCP API location | Current official docs and the October 13 draft use `document.modelContext`. Keep that accurate detail; do not substitute older snippets from memory. |
| Tool input schema | Use the current `inputSchema` contract, not an invented `parameters` property. |
| Registration cleanup | Current guidance uses an AbortSignal passed to registration. Do not assume a returned object has `.unregister()`. Test late registration and execution separately. |
| Tool returns | Verify the native return contract. Updating the UI while an async operation runs is different from a standard streaming tool-return protocol. |
| Standard status | The specification is a W3C Community Group draft and explicitly not a W3C Standard. Chrome documents an origin trial and local development flag. |
| MCP interoperability | The browser tool API does not automatically make the application a remotely reachable HTTP/stdio MCP service. Bridges and clients are additional components. |
| Authentication | Existing browser sessions can be used by application calls, but every server operation still needs authorization and appropriate CSRF controls. |
| Tool hints and visibility | Hints and visible UI are not enforcement guarantees. Tool calls can change background state; the application must make relevant outcomes visible. |
| Browser support | Verify the actual browser/version. A polyfill or internal tool dispatcher must have its own label and test results. |
| Built-in AI globals | Current APIs use `LanguageModel`, `Summarizer`, `Translator`, and `LanguageDetector`; do not treat old `window.ai.*` examples as current. |
| Built-in AI lifecycle | Handle availability, user activation, download, cancellation, and late-created sessions. Current download examples use normalized `e.loaded`, not an assumed `e.total`. |
| Prompt parameters | Current web and extension capabilities differ; web numeric sampling parameters cannot be assumed from extension examples. |
| Local AI claims | On-device processing does not establish that the entire app is offline, has no telemetry, costs nothing to operate, or has universally low latency. Cloud fallback changes the data path. |
| Hardware figures | Free disk-space requirements and downloaded model size are different. Do not describe “22 GB required free space” as a 22 GB model. |
| Supplied React hook | It needs a redesign for user activation, late session cleanup, overlapping requests, abort propagation, and explicit off-device choice. It also risks mixing partial local output with a new cloud answer. |
| Company case-study numbers | The supplied savings and latency figures were not verified for this plan and are not project evidence. Omit them from the implementation/article claims until sourced. |
| Gemini integration | Use a supported pinned `@google/genai` API surface and current model configuration. Current docs use Interactions examples; check output shape instead of pasting old SDK code unchanged. |

The useful research themes remain shared application commands, progressive enhancement, contextual validation, and tests of actual outcomes. Numerical benefits are questions to measure.

## Evaluation runner findings

Reviewed source:

- [README](https://github.com/GoogleChromeLabs/webmcp-tools/blob/21874557fbad000216996f76f823b0f521085877/webmcp-evals/README.md)
- [Gemini backend](https://github.com/GoogleChromeLabs/webmcp-tools/blob/21874557fbad000216996f76f823b0f521085877/webmcp-evals/src/backends/gemini.ts)
- [Browser evaluator](https://github.com/GoogleChromeLabs/webmcp-tools/blob/21874557fbad000216996f76f823b0f521085877/webmcp-evals/src/evaluator/browserEvaluator.ts)
- [Browser integration](https://github.com/GoogleChromeLabs/webmcp-tools/blob/21874557fbad000216996f76f823b0f521085877/webmcp-evals/src/evaluator/browser.ts)
- [Package manifest](https://github.com/GoogleChromeLabs/webmcp-tools/blob/21874557fbad000216996f76f823b0f521085877/webmcp-evals/package.json)

The manifest reports version 0.0.4 in this source snapshot; npm publication and runtime compatibility were not tested.

The README describes static-schema, browser, keyless smoke, and conversation-simulation modes. It directs browser evaluation to the Vercel AI SDK backend; the direct Gemini browser method throws an unimplemented error. The browser evaluator launches a browser, opens a page, and navigates to the configured URL. Authentication setup must therefore be verified and integrated explicitly for this application.

Pin and test a small wrapper before investing in extensive datasets. Translate the included harness-neutral catalog into the actual runner schema. No CLI command in this pack is claimed to have been executed.

## Official references

Use the relevant current references during implementation:

1. [WebMCP overview, origin trial and local setup](https://developer.chrome.com/docs/ai/webmcp)
2. [WebMCP imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
3. [WebMCP specification draft](https://webmachinelearning.github.io/webmcp/)
4. [WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
5. [WebMCP evaluation guidance](https://developer.chrome.com/docs/ai/webmcp/evals)
6. [Chrome DevTools WebMCP panel](https://developer.chrome.com/docs/devtools/application/webmcp)
7. [Google GenAI SDK libraries](https://ai.google.dev/gemini-api/docs/libraries)
8. [Gemini getting started](https://ai.google.dev/gemini-api/docs/get-started)
9. [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
10. [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling)
11. [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models)
12. [Gemini API key handling](https://ai.google.dev/gemini-api/docs/api-key)
13. [Chrome Summarizer API](https://developer.chrome.com/docs/ai/summarizer-api)
14. [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
15. [Get started with built-in AI](https://developer.chrome.com/docs/ai/get-started)

This is a product/engineering plan, not a claim about GDE selection requirements. Use Kasper's actual agenda to guide the interview story; do not present externally supplied “strict pillars” or guaranteed program benefits as verified criteria.

