# Trip Workbench implementation pack — revision 2

Prepared for Raju Dandigam, October 14, 2026.

This is a clearer, expanded implementation handoff for Cursor. It contains plans, concrete contracts, copy-paste prompts and scenario definitions. It does not contain a built application or completed application test results.

## Start here

1. Open the new `trip-workbench` repository in Cursor.
2. Add `flight-search-demo` and `cypress-test-trust-demo` as read-only reference folders when available.
3. Copy this pack's `docs` and `evals` folders into your repository root.
4. Open [CURSOR_PROMPTS.md](docs/CURSOR_PROMPTS.md) and paste **Prompt 0** into Cursor Agent.
5. Run Prompts 1–5 one at a time. Prompt 6 is optional. Use the included resume/repair prompts when needed.

The earlier four-prompt sequence is replaced by six smaller core stages: foundation, backend, manual UI, native WebMCP, Gemini proposals, and evidence. Existing implemented work should be preserved and mapped to these stages.

## The application

A traveler prepares a business trip request, resolves missing details, reviews deterministic findings and submits a saved request. Gemini proposes fields for review; native WebMCP lets a browser agent read, update and validate the open draft. All paths use the existing application commands.

Example: SFO to JFK, November 12–15, 2026, round trip, one traveler, economy, purpose customer workshop. The documented fixed test clock is October 14, 2026. Live demos should use suitable future dates if this example is later reused.

The product ends at a submitted request. Identities, airports and policies are synthetic demonstration data. Sessions, database persistence and configured browser/provider integrations are actual implementations Cursor must build and verify.

## Contents

| File | What it gives you |
|---|---|
| [CURSOR_PROMPTS.md](docs/CURSOR_PROMPTS.md) | Seven verbatim stage prompts, setup, commands, resume/repair prompts and finish lines |
| [CONTRACTS_AND_EXAMPLES.md](docs/CONTRACTS_AND_EXAMPLES.md) | Exact screens, field rules, API inputs/outputs, concurrency and Gemini examples |
| [BUILD_SPEC.md](docs/BUILD_SPEC.md) | Architecture and product rationale |
| [VERIFICATION_AND_EVIDENCE.md](docs/VERIFICATION_AND_EVIDENCE.md) | Test boundaries, independent outcomes and live/native reporting |
| [DEMO_AND_TROUBLESHOOTING.md](docs/DEMO_AND_TROUBLESHOOTING.md) | Walkthrough, failure examples, diagnosis and interview discussion |
| [SOURCE_REVIEW.md](docs/SOURCE_REVIEW.md) | Reference provenance and official API links |
| [cases.seed.json](evals/cases.seed.json) | 34 harness-neutral scenarios, all not_run |

The scenario catalog is not a drop-in Google runner configuration. Cursor must translate cases into the pinned runner's supported format and implement independent outcome checks.

## What is clearer in revision 2

- Manual backend and UI work have separate stages before native/model integrations.
- Screen behavior, defaults, allowed fields, access, errors and API examples are specified.
- Unsaved input, stale brief/proposal, old receipt replay and uncertain cancellation have explicit behavior.
- Prompts say what to build, what to verify, what to return and where to stop.
- Current contracts distinguish model extraction, direct native calls and model-driven browser evaluation.
- Resume and repair prompts help preserve progress across Cursor chats.

Start with Prompt 0. The manual app should work by Prompt 2; native and live-provider gaps stay visible while independent work continues.
