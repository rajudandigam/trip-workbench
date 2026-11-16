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

Allowlisted metadata only (domain, operation, revisions, opaque aliases, outcome
codes). No prompts, proposal text, cookies, CSRF, emails, or free-form provider
errors.

## Commands

```bash
npm run test:unit
npm run test:api
npm run test:native-smoke          # informational; blocked exits 0
npm run test:webmcp-evidence       # strict; blocked mandatory → exit 2
npm run test:lost-response-evidence  # API-labeled check + Evidence verify
```

## Lost-response demo (API-labeled)

`npm run test:lost-response-evidence` commits an update, independently reads the
receipt and saved row, records `observeOutcome` facts, runs
`--required-tool update_trip_draft --fail-on-observation failed,unknown,skipped`,
and verifies an Evidence v2 directory. Label: **api** (not native).

Native Chromium proof requires `TW_CHROME_BIN` and a WebMCP-capable build; until
that executes, do not cite native coverage from this host.

## Related AgentInspect recipe

Synthetic portable packaging (no browser dependency at AgentInspect root):

`examples/recipes/webmcp-native-evidence/` in the AgentInspect repository.
Binding/forged-label ablations remain in `browser-mcp-observed-outcomes` (#485).
