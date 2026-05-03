---

# Session Context — Smart Logistics Extractor

> This file persists key project state across coding sessions. Read this at the start of every session to understand the current state.
> Update this file when significant changes happen (new features, architectural decisions, deployment changes).

## Current Session State

**Last updated:** 2026-05-03
**Project version:** 1.0.0
**Active branch:** main

## Recent Changes (Last 3 Sessions)

- Phase 1: Added quality rules, hooks, Prettier, npm scripts, e2e-testing skill
- Phase 2: Added planner, database-reviewer, tdd-guide agents; fixed all models to DeepSeek/Qwen/Kimi
- Phase 3: Added cost-aware-llm, customs-trade-compliance, ai-regression-testing, database-migrations skills
- Phase 4: Added session memory, continuous-learning, deployment-patterns, docker-patterns skills
- Phase 5: Cleaned up skills — removed 6 irrelevant skills, trimmed 3 to project scope, moved .agents/skills/ → .opencode/skills/
- Phase 6: Added 11 commands (plan, build-fix, code-review, checkpoint, quality-gate, skill-create, model-route, learn, update-docs, refactor-clean, feature-dev) and 8 agents (architect, code-reviewer, refactor-cleaner, e2e-runner, performance-optimizer, loop-operator, conversation-analyzer, type-design-analyzer) adapted from ECC

## Architecture Decisions (Active)

| Decision                               | Status | Rationale                                                                               |
| -------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| Gemini Flash 3 for extraction          | LOCKED | Proven excellent results for PDF invoices. Do not change without 10+ verified failures. |
| libSQL/SQLite (local) + Turso (remote) | ACTIVE | Default local dev, optional remote via env vars                                         |
| Session auth via X-Session-Id header   | ACTIVE | Not cookies. Used by apiClient.ts                                                       |
| React + Vite frontend, Hono backend    | ACTIVE | Fullstack TypeScript, same process in production                                        |
| Docker + Coolify deployment            | ACTIVE | Preferred path, healthcheck at /api/health                                              |

## Known Issues / Tech Debt

- [ ] No test suite configured (Vitest not installed yet)
- [ ] No CI/CD pipeline
- [ ] AGENT_GENERIC_B and AGENT_CUSTOMS are disabled
- [ ] No caching layer for AI extractions
- [ ] No cost tracking for Gemini API calls
- [ ] No E2E tests (Playwright not installed)

## Environment Requirements

| Variable           | Required | Notes                                    |
| ------------------ | -------- | ---------------------------------------- |
| GEMINI_API_KEY     | YES      | For AI extraction. Falls back to API_KEY |
| TURSO_DATABASE_URL | NO       | Only for remote Turso                    |
| TURSO_AUTH_TOKEN   | NO       | Only for remote Turso                    |
| PORT               | NO       | Defaults to 3001                         |

## Database State

- Schema managed in `server/schema.ts`
- Migrations run automatically on server startup
- Seed data is idempotent (checks existing data before inserting)
- Product match master seed runs on startup
- DB file: `./data/smart-invoice.db` (DO NOT COMMIT)

## Deployment Checklist (Before Each Deploy)

- [ ] `npm run check` passes (typecheck + format + quality)
- [ ] `npm run build` succeeds
- [ ] `npm run start` starts without errors locally
- [ ] `docs/DatabaseSchema.md` is up to date
- [ ] `README.md` and `docs/CoolifyDeployment.md` are synchronized
- [ ] No secrets in committed files
- [ ] `.env.example` documents all required variables

## Quick Commands Reference

```bash
npm run dev          # Start dev server (backend + frontend)
npm run build        # Production build
npm run start        # Start production server
npm run db:seed      # Run migrations and seed manually
npm run typecheck    # TypeScript check root + server
npm run format       # Format all files
npm run quality      # Pre-commit quality check
npm run scan-secrets # Scan for leaked secrets
npm run check        # All checks combined
```

## Agent Model Assignment (Current)

| Agent                 | Model                         | Use                    |
| --------------------- | ----------------------------- | ---------------------- |
| architect             | opencode-go/deepseek-v4-pro   | Architecture decisions |
| type-design-analyzer  | opencode-go/deepseek-v4-pro   | Type design review     |
| planner               | opencode-go/deepseek-v4-pro   | Feature planning       |
| code-reviewer         | opencode-go/deepseek-v4-pro   | Code review            |
| security-reviewer     | opencode-go/deepseek-v4-pro   | Security audit         |
| performance-optimizer | opencode-go/deepseek-v4-pro   | Performance tuning     |
| typescript-reviewer   | opencode-go/deepseek-v4-pro   | TS code review         |
| a11y-architect        | opencode-go/deepseek-v4-pro   | Accessibility          |
| tdd-guide             | opencode-go/deepseek-v4-pro   | Test-first development |
| database-reviewer     | opencode-go/deepseek-v4-flash | Schema/query review    |
| code-explorer         | opencode-go/deepseek-v4-flash | Codebase exploration   |
| general               | opencode-go/deepseek-v4-flash | General-purpose tasks  |
| explore               | opencode-go/deepseek-v4-flash | Fast codebase search   |
| build-error-resolver  | opencode-go/deepseek-v4-flash | Fix build errors       |
| refactor-cleaner      | opencode-go/deepseek-v4-flash | Dead code removal      |
| e2e-runner            | opencode-go/deepseek-v4-flash | E2E testing            |
| loop-operator         | opencode-go/deepseek-v4-flash | Extraction refinement  |
| conversation-analyzer | opencode-go/deepseek-v4-flash | Session analysis       |
| silent-failure-hunter | opencode-go/deepseek-v4-flash | Find silent failures   |
| doc-updater           | opencode-go/deepseek-v4-flash | Documentation          |

## Session Notes

> Use this section to jot down temporary notes during a session. Clean up at session end.
