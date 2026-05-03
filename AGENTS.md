# AGENTS.md

## Commands

- Install with `npm install`; this repo uses `package-lock.json` and npm scripts, not pnpm/yarn.
- Local dev is `npm run dev`, which starts both `tsx --watch server/index.ts` on `:3001` and Vite on `:5173` with `/api` proxied to the backend.
- Production flow is `npm run build` then `npm run start`; `start` runs `tsx server/index.ts` and serves `dist/` when it exists.
- `npm run build` only typechecks the root `tsconfig.json`, which excludes `server/`; run `npx tsc -p server/tsconfig.json --noEmit` after backend changes.
- There is no configured test, lint, formatter, CI, or pre-commit suite. Use focused manual checks plus the type/build commands above.
- `npm run db:seed` runs migrations and the idempotent seed manually, but normal server startup already runs migrations, seed, and product match master seed.

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
