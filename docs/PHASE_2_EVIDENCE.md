# Phase 2 evidence

Activated after Phase 1 `e711e20`. Evidence date: 2026-11-06.

## Application gate

| Check | Status | Evidence |
|-------|--------|----------|
| typecheck / lint / build | pass | local verification |
| test:unit | pass | 38 tests including `event-rules` |
| test:api | pass | trips (3) + events (2) |
| test:e2e | pass | Cypress trip + event journeys (`event-request.cy.ts`) |
| Migration `002_events.sql` | applied | `npm run db:migrate` |
| Event WebMCP tools | implemented | `get_event_draft`, `update_event_draft`, `validate_event_draft`, `prepare_event_review` |
| Declarative forms | manual fallback | `DeclarativeEventFields` probes for declarative surface; never labels fallback as native proof |
| Upstream webmcp-evals | documented adapter gap | See below; authenticated login fixture approach noted, not a fake bypass |

## What was built

- Synthetic event drafts with title, start/end dates, time zone, synthetic/manual location, notes
- Same session/CSRF/revision/receipt patterns as trips; distinct event identity and policy version `demo-event-policy-v1`
- Authenticated **Events** nav entry that remains visible; tools register only on the open editor
- Review requirements: `LONG_EVENT`, `MANUAL_LOCATION` (non-blocking with `canSubmit: true` when fields are complete)
- Recording an event stores a submission snapshot only — no invites, calendars, or venue bookings

## Upstream eval integration note

The pinned upstream `webmcp-evals` runner launches its own browser and does not inherit Cursor cookies. Phase 2 keeps authentication on the normal `/api/session` path. A focused project adapter should:

1. Start the app against an isolated test DB
2. Sign in with a synthetic traveler inside the eval browser context
3. Navigate to `/events`, create/open a draft
4. Discover page tools and assert independent saved state

Do not add public auth-bypass or database-reset endpoints for the eval runner.

## Article claims supported

Supported:

- A second workflow (events) can reuse authorization, revision, and receipt patterns without sharing trip identity
- Page-scoped tools can stay off the list route while the Events entry remains discoverable
- Declarative-form experiments can ship with an honest manual fallback

Not yet supported:

- Live native discovery of event tools in CI
- Declarative WebMCP form success claims
- Model-directed event journeys

## Repro

```bash
npm run db:migrate
npm run typecheck
npm run lint
npm run test:unit
npm run test:api
npm run test:e2e
npm run dev
# open /events after sign-in
```
