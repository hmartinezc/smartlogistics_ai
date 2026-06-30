# AGENTS.md Template

Usa esta plantilla como punto de partida para el `AGENTS.md` de un proyecto nuevo.

```md
# AGENTS.md

## Commands

- Install with `npm install`; this repo uses `package-lock.json` and npm scripts, not pnpm/yarn.
- Local dev is `npm run dev`, which starts Hono backend on `:3001` and Vite on `:5173`.
- Production flow is `npm run build` then `npm run start`; backend serves API and `dist/` from the same process.
- `npm run db:seed` runs migrations and idempotent seed manually, but server startup already runs migrations and seed.

## Quality Checks

- `npm run typecheck` — TypeScript check for root and server tsconfigs.
- `npm run format` — auto-format source files with Prettier.
- `npm run format:check` — verify formatting.
- `npm run quality` — pre-commit quality checks.
- `npm run scan-secrets` — scan for hardcoded secrets.
- `npm run check` — run typecheck + format:check + quality.

## Architecture Rules

- Frontend entrypoint is `index.tsx`; `App.tsx` owns app shell and workflow state.
- Reusable frontend state lives in `hooks/index.ts`.
- Frontend API calls must go through `services/apiClient.ts`.
- Browser sends sessions via `X-Session-Id`; do not introduce cookie/JWT auth unless explicitly required.
- Backend entrypoint is `server/index.ts`.
- Hono route modules mount under `/api/*`.
- `/api/health` is liveness.
- `/api/ready` is production/Docker readiness.
- Database access goes through `server/db.ts`.
- Schema and migrations live in `server/schema.ts`.
- Keep `docs/DatabaseSchema.md` in sync with persisted schema changes.
- Large files belong in MinIO/S3-compatible storage; DB stores metadata and object keys.

## Runtime And Data

- Database defaults to local libSQL/SQLite at `file:./data/app.db`.
- Use `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` only for remote Turso.
- For local SQLite in Docker/Coolify, mount persistence at `/app/data`.
- MinIO variables: `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_USE_SSL`.

## Deployment

- Docker deploy is the preferred Coolify path.
- Dockerfile uses Node 20, builds `dist/`, exposes `3001`, and runs `npm run start`.
- Coolify healthcheck path is `/api/ready`.
- App serves SPA and API from the same Hono process in production.
- Keep README and deployment docs synchronized when changing port, env vars, healthcheck, Docker behavior, or persistence path.

## Optional AI Addon

- Do not add AI code unless explicitly requested.
- If AI is added, API keys must stay backend-only.
- Prompts, schemas, validators, routes, tests, and docs must evolve together.
- Long AI tasks should use a persistent queue/worker, not browser orchestration.
```
