# Event workflow demo runbook

## Prep

```bash
npm run db:migrate
AI_MODE=disabled npm run dev
```

Sign in as `alex@northstar.demo` / `Password123!`.

## Happy path

1. Open **Events**
2. **New event draft**
3. Title `Customer planning workshop`
4. Start `2026-12-01`, end `2026-12-02`, time zone `America/Los_Angeles`
5. Synthetic venue `Northstar Demo Campus — Atrium`
6. Save draft → Review event → Record event request
7. Refresh confirmation — same title, location, submitted status

## Policy review demo

Use a five-or-more-day span or **Manual label** location. Validation stays complete (`canSubmit: true`) while `LONG_EVENT` / `MANUAL_LOCATION` appear as review requirements.

## WebMCP

Open an owned draft editor. Discover:

- `get_event_draft`
- `update_event_draft` (mutate only)
- `validate_event_draft`
- `prepare_event_review`

Tools unregister when you leave the editor. The Events list remains the authenticated entry point.

## Declarative experiment

Toggle **Try declarative field experiment**. If no declarative surface exists, the UI says so and keeps the manual fallback. Do not claim declarative success from that path.

## Limits

No invitations, Calendar OAuth, Maps keys, or venue booking. Recording is a synthetic submission snapshot only.
