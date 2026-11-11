# WebMCP setup

Phase 1 needs a working local app. Native tool checks need a WebMCP-enabled Chrome profile. Live Gemini proposals and external model evals are optional and separate.

## Application (required)

```bash
npm ci
npm run doctor
npm run db:up
npm run db:migrate
npm run dev
```

Use `AI_MODE=disabled` by default. Create `.env` from `.env.example` only if it is missing; never overwrite an existing `.env` in chat. Do not run `db:seed` merely to restart a stopped app; seeding resets demo drafts.

Health check:

```bash
curl --max-time 5 -i http://localhost:3000/api/health
```

Sign in with the synthetic traveler `alex@northstar.demo` / `Password123!` (or `SEED_PASSWORD`).

## Chrome WebMCP

1. Use a Chrome build that exposes WebMCP.
2. Enable the WebMCP testing flag in the **same profile** the automation will control.
3. Relaunch Chrome and confirm `document.modelContext` exists on an open draft page.
4. Open an owned draft and confirm the editor shows **Saved**.

## Cursor Chrome DevTools MCP

Merge into the existing MCP config (do not replace other servers):

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

`--categoryExperimentalWebmcp` enables the MCP tool category. It does **not** enable WebMCP inside Chrome. Pin the resolved working package version after a successful demo and record it in evidence.

## Optional Inspector

Install Model Context Tool Inspector for manual tool execution. Manual calls do not require a Gemini key.

## Optional live Gemini proposals

Server-side only:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` (verify availability; do not treat an old default as required)
- `AI_MODE=live`

Never put provider keys in `VITE_*` variables.

## Scripted native smoke (optional)

```bash
export TW_CHROME_BIN=/path/to/webmcp-chromium
npm run build
npm run test:native-smoke
```

Without `TW_CHROME_BIN`, the script records **blocked** honestly. Use a disposable `TEST_DATABASE_URL` (see `.env.example`). Cite map for article drafts: [ARTICLE_SOURCE_MAP.md](ARTICLE_SOURCE_MAP.md).

## Model-directed journeys

Prefer the existing Cursor model connection. Record three tasks twice when available (needed for the later model-decisions article, not the five current drafts):

1. Exact update + `prepare_trip_review`
2. Ambiguous request requiring clarification
3. Premium-cabin request whose explanation distinguishes review from a blocker

If model access is unavailable, leave those cases blocked. Deterministic application work still completes.

## Troubleshooting

| Symptom | Next step |
|---------|-----------|
| Tool discovery works, then `Failed to fetch` | Restart `npm run dev`, confirm health, reload the editor |
| `document.modelContext` absent | Fix Chrome flag/profile; mark native blocked |
| Tools missing after submit | Expected; submitted trips do not retain editing tools |
| Stale `expectedRevision` | Read again; do not invent a newer revision |

See [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md) and [PHASE_1_EVIDENCE.md](PHASE_1_EVIDENCE.md).
