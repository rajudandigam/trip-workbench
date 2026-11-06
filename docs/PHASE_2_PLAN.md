# Phase 2 plan and progress

Activated after Phase 1 commit `e711e20` on main.  
Roadmap: [WEBMCP_ROADMAP.md](WEBMCP_ROADMAP.md)

## Scope

Synthetic event draft wizard, page-scoped WebMCP tools, declarative-form experiment with manual fallback, tests and evidence. No calendar OAuth, real invites, model benchmarks, or public deployment.

## Checkpoints

| Area | Status | Notes |
|------|--------|-------|
| Domain + DB + API | complete | `002_events.sql`, `EventService`, `/api/events*` |
| List + wizard UI | complete | Events nav, editor, review, confirmation |
| WebMCP tools | complete | Four page-scoped tools; list remains entry point |
| Declarative forms | complete | Probe + honest manual fallback |
| Tests + evidence | complete | Unit/API/e2e coverage + docs |

## Out of scope (unchanged)

Phase 3 tool-count experiments, AgentInspect full integration, upstream PR publication.
