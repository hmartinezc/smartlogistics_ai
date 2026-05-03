# AGENTS.md

## Commands

- Install with `npm install`; this repo uses `package-lock.json` and npm scripts, not pnpm/yarn.
- Local dev is `npm run dev`, which starts both `tsx --watch server/index.ts` on `:3001` and Vite on `:5173` with `/api` proxied to the backend.
- Production flow is `npm run build` then `npm run start`; `start` runs `tsx server/index.ts` and serves `dist/` when it exists.
- `npm run db:seed` runs migrations and the idempotent seed manually, but normal server startup already runs migrations, seed, and product match master seed.

## Quality Checks

- `npm run typecheck` — full TypeScript check for both root and server tsconfigs.
- `npm run format` — auto-format all source files with Prettier.
- `npm run format:check` — verify formatting without changing files.
- `npm run quality` — pre-commit quality check (console.log, debugger, secrets, .only() in tests).
- `npm run scan-secrets` — full project scan for hardcoded secrets/keys.
- `npm run check` — run all checks: typecheck + format + quality (what CI would run).

## Rules (active during coding sessions)

- `.opencode/rules/common/` — universal rules: coding style, testing, git workflow, security, performance.
- `.opencode/rules/typescript/` — TypeScript-specific rules extending the common ones.
- Rules are read by the AI during development to enforce standards. See each file for details.

## Skills (domain knowledge for agents)

- `.opencode/skills/` — 13 specialized skill documents loaded by agents as needed.
- Project-specific: `cost-aware-llm-pipeline`, `database-migrations`, `customs-trade-compliance`, `deployment-patterns`, `docker-patterns`, `ai-regression-testing`, `continuous-learning`, `e2e-testing`.
- Stack-specific: `hono` (backend API), `react-best-practices` (frontend Vite+React), `tailwind-css-patterns`, `turso-libsql`, `vite`.

## Runtime And Data

- Backend entrypoint is `server/index.ts`; route modules mount under `/api/*` and `/api/health` is the healthcheck.
- Database defaults to local libSQL/SQLite at `file:./data/smart-invoice.db`; set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` only for remote Turso.
- `GEMINI_API_KEY` is required for backend document extraction; `server/routes/ai.ts` also accepts `API_KEY` as a fallback.
- Seed credentials for a fresh DB are `admin@smart.com`, `operador@smart.com`, and `supervisor@smart.com`, all with password `1234`.
- Auth sessions are stored in `auth_sessions`; browser code sends the session via `X-Session-Id` from `services/apiClient.ts`, not cookies.
- `localStorage` is still used for `smart-invoice-ai.sessionId`, `smart-invoice-ai.currentAgencyId`, and dark mode state.

## Architecture Notes

- Frontend entrypoint is `index.tsx`; it mounts `App.tsx` and imports `widget.tsx`, which registers the `<smart-logistics-widget>` custom element.
- `App.tsx` owns the main workflow state; reusable state/data logic is centralized in `hooks/index.ts`.
- Frontend API calls should go through `services/apiClient.ts`; it handles `/api` paths, JSON headers, FormData exceptions, and session headers.
- Server schema and migrations live in `server/schema.ts`; keep `docs/DatabaseSchema.md` in sync when changing persisted tables or seed assumptions.
- AI extraction prompt/schema flow is shared between `server/routes/ai.ts`, `services/agentPrompts.ts`, and `shared/extractionSchema.ts`; update these together when changing invoice output shape.
- TypeScript path alias `@/*` maps to the repo root, but most existing imports are relative; preserve nearby style unless there is a clear reason to switch.

## Deployment Gotchas

- Docker deploy is the preferred Coolify path; the `Dockerfile` uses Node 20, builds `dist/`, exposes `3001`, and runs `npm run start`.
- For local SQLite in Docker/Coolify, mount persistence at `/app/data`; otherwise `smart-invoice.db`, WAL, and SHM files are lost on container recreation.
- Coolify healthcheck path is `/api/health`; the app serves SPA and API from the same Hono process in production, not a separate Vite server.
- Keep `README.md` and `docs/CoolifyDeployment.md` synchronized when changing port, env vars, healthcheck, Docker behavior, or persistence path.
