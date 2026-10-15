# Trip Workbench demo runbook

## Prep

```bash
cp .env.example .env
npm ci
npm run db:up && npm run db:migrate && npm run db:seed
AI_MODE=fixture npm run dev
```

Sign in: `alex@northstar.demo` / `Password123!`

## Happy path (manual)

1. New trip request
2. Set JFK, 2026-11-12 → 2026-11-15, purpose `customer workshop`
3. Save draft → Review → Submit
4. Refresh confirmation — same persisted request

## Gemini proposal (fixture)

1. Open a draft assistance panel
2. Paste: “Prepare a round trip from SFO to JFK, departing November 12, 2026 and returning November 15, 2026, for one traveler in economy. Purpose: customer workshop.”
3. Suggest trip details → review diff → Apply
4. Ambiguous brief “Next Friday to Springfield” should ask clarifications (no silent airport invent)

## WebMCP

Requires a browser with `document.modelContext`. Open an editable owned draft, then use diagnostics / Chrome inspector tools. Unsupported browsers still run the manual app. Never label a fake dispatcher as native.

## On-device summary

Use **Summarize brief on this device**. If unavailable, the UI explains the gap and does not auto-send the brief to the cloud.

## Uncertain mutation recovery

If a tool or save loses its response after dispatch, the editor may show an unresolved command with **Recheck outcome**. That looks up the original command receipt; it does not invent a new commandId. Native WebMCP / live model demos remain a separate manual phase.
