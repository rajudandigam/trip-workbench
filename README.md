# Trip Workbench

Business trip request app where people and AI can prepare, validate, review, and submit a request.

Synthetic demo data only. Sessions, PostgreSQL persistence, WebMCP adapter, and Gemini proposal modes are real integrations with explicit `disabled` / `fixture` / `live` labels.

## Quick start

```bash
cp .env.example .env
npm ci
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://127.0.0.1:3000 and sign in as `alex@northstar.demo` / `Password123!`.

Production-style boot:

```bash
npm run build
npm start
```

## Demo accounts

| Email | Role | Tenant |
|-------|------|--------|
| alex@northstar.demo | traveler | Northstar Demo |
| jordan@northstar.demo | traveler | Northstar Demo |
| observer@northstar.demo | observer | Northstar Demo |
| casey@cedar.demo | traveler | Cedar Demo |

Password for all: value of `SEED_PASSWORD` (default `Password123!`).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite `:3000` + API `:3001` |
| `npm run build` / `npm start` | One-origin production server |
| `npm run test:unit` / `test:api` | Domain and API tests |
| `npm run test:e2e` | Cypress manual journey |
| `npm run test:evals` | Scenario catalog runner (labels blocked/not_run honestly) |
| `npm run doctor` | Environment report |

## AI modes

Set `AI_MODE=disabled|fixture|live`. Live requires `GEMINI_API_KEY`. The manual workflow never depends on Gemini or WebMCP.

## Docs

See `START_HERE.md` and `docs/` for the implementation pack, contracts, and stage prompts.
