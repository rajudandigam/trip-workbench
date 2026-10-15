# Results

| Check | Status | Evidence |
|-------|--------|----------|
| typecheck | pass | `npm run typecheck` |
| lint | pass | `npm run lint` |
| build | pass | `npm run build` |
| client/API boot | pass | `/api/health` → `status: ready` after migrate/seed |
| test:unit | pass | 8 tests (rules, gemini fixture, summarizer unavailable) |
| test:api | pass | create/patch/replay/submit + access matrix + fixture proposal |
| cypress manual journey | pass | `npm run test:e2e` — sign-in → submit → reload |
| native WebMCP | blocked | Adapter present; host lacks `document.modelContext` |
| Gemini fixture | pass | API + unit fixture extraction / clarifications |
| Gemini live | blocked | No `GEMINI_API_KEY` configured |
| eval scenarios (34) | mixed | `pass=18`, `fail=0`, `blocked=10`, `not_run=6` (see `evals/evidence/eval-summary-*.json`) |
| Summarizer | blocked | Global absent in Node/Electron; UI reports unavailable without cloud auto-forward |

## Commands actually run

```bash
npm ci / npm install
npm run db:up && npm run db:migrate && npm run db:seed
npm run typecheck && npm run lint && npm run build
npm run test:unit && npm run test:api
npm run test:e2e
npm run test:evals
npm run doctor
```

## Gaps

- Docker not installed on the implementation host; Homebrew Postgres 16.15 used instead.
- Native WebMCP and live Gemini require external browser/provider setup.
- Full `webmcp-evals` Google runner not pinned; local catalog translator used with login against the real API.
