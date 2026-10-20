# Environment

Recorded during Prompt 0–5 local implementation on 2026-10-14.

## Runtime

| Item | Value |
|------|-------|
| Node | v24.12.0 (nvm; engines `>=22`) |
| npm | 11.6.2 |
| PostgreSQL | 16.15 (Homebrew); Docker Compose unavailable in this host |
| Cypress | 16.1.1 |
| Vite | 7.x |
| Express | 5.x |
| React | 19.x |
| Zod | 4.x |
| `@google/genai` | installed; used only when `AI_MODE=live` |

## Configuration

| Item | Value |
|------|-------|
| AI_MODE default | `disabled` in `.env.example`; local verification used `fixture` |
| Database (this host) | `postgresql://dand@127.0.0.1:5432/trip_workbench` (+ `_test`) |
| Docker Compose port | Host `5433` → container `5432` when Docker is available |
| Timezone | `America/Los_Angeles` |
| Fixed test clock | `2026-10-14T19:00:00.000Z` via `DEMO_FIXED_NOW` in tests only |

## Browser / Google APIs

| Capability | Status on this host |
|------------|---------------------|
| Native WebMCP (`document.modelContext`) | Adapter implemented. Electron/Node eval harness still **blocked**. On 2026-10-20, Chrome DevTools listed and invoked `get_trip_draft`, `update_trip_draft`, and `validate_trip_draft` against the running dev server. See [RESULTS.md](RESULTS.md). |
| Gemini live | **blocked** without `GEMINI_API_KEY` |
| Chrome Summarizer | Adapter implemented; global absent in Node/Electron — reported unavailable honestly |

## Assumptions

- One origin: Vite proxies `/api` in dev; Express serves client+API in production.
- Secrets stay server-side (`GEMINI_API_KEY` never `VITE_`).
- No orchestration framework (ADK/Genkit/LangGraph).
