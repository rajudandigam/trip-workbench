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

## Health before a browser demo

```bash
curl --max-time 5 -i http://localhost:3000/api/health
```

Expect HTTP 200 with `"status": "ready"`, `"database": true`, and `"migrations": true`. Then reload the draft editor and confirm it says **Saved**. Sign in again if the session is gone.

If the editor is already open but tool calls return `NETWORK_ERROR` / `Failed to fetch`, the dev server is no longer accepting connections. An open tab can keep the form and its registered tools after Vite and the API stop. Restart `npm run dev`, recheck health, and reload. Do not re-seed.

## WebMCP

Requires a browser with `document.modelContext`. Chrome DevTools can list and execute the page tools. Gemini is not required: the agent chooses the calls, and each tool talks to this app’s API.

Open an editable draft you own. Discover tools on that page and confirm:

| Tool | What it does |
|------|----------------|
| `get_trip_draft` | Reads the saved draft, revision, status, and `hasUnsavedChanges`. Refreshes from the server. |
| `update_trip_draft` | Patches allowlisted fields. Needs `expectedRevision` from a fresh read and a new `commandId`. Refuses when the form has unsaved edits. Cannot submit. |
| `validate_trip_draft` | Checks that saved revision. Returns field issues and policy findings. A stale `expectedRevision` is `REVISION_CONFLICT` and does not substitute a newer revision. |

Operate only through those tools. Do not type into the form, call the API yourself, or press **Suggest trip details**. Do not submit.

1. `get_trip_draft`. Stop if `hasUnsavedChanges` is true.
2. `update_trip_draft` with that revision and a unique `commandId`.
3. `validate_trip_draft` with the revision the update returned.
4. `get_trip_draft` again and compare the saved fields.

Dates are `YYYY-MM-DD`. A one-way change should set `tripType` to `one_way` and `returnDate` to `null`; leave the departure date and the other saved fields alone.

Observed on 2026-10-20 against `http://localhost:3000/trips/d36292f8-1a73-4ab6-b3ed-ffa3039e02fe` while `aiMode` was `fixture`:

- Revision 3 → 4: SFO → JFK, round trip, 2026-11-19 to 2026-11-22, 2 travelers, business, purpose `Customer planning workshop`. Status remained `draft`.
- Validation at revision 4: complete, with `PREMIUM_CABIN` (“Premium cabin requires review.”).
- Revision 4 → 5: one-way, return date cleared, departure 2026-11-19 unchanged. Still `draft`.
- `validate_trip_draft` with `expectedRevision: 3` returned `REVISION_CONFLICT`, `currentRevision: 5`, message “This draft changed.” That call was not retried.

That draft id came from the local database during the demo. After `npm run db:seed`, open whichever draft the editor shows.

Unsupported browsers still run the manual app. Never label a fake dispatcher as native.

## On-device summary

Use **Summarize brief on this device**. If unavailable, the UI explains the gap and does not auto-send the brief to the cloud.

## Uncertain mutation recovery

If a tool or save loses its response after dispatch, the editor may show an unresolved command with **Recheck outcome**. That looks up the original command receipt; it does not invent a new commandId. The direct WebMCP session is recorded above. A live Gemini or model-chosen evaluation is still a separate demonstration.
