# Base Fullstack Architecture

Use this skill when creating or modernizing a TypeScript fullstack app that should follow the reusable architecture from this kit.

## Core Pattern

- React + Vite SPA.
- Hono API under `/api/*`.
- One frontend HTTP gateway: `services/apiClient.ts`.
- One DB gateway: `server/db.ts`.
- Idempotent schema in `server/schema.ts`.
- Idempotent seed in `server/seed.ts`.
- DB-backed sessions with `X-Session-Id`.
- Tenant/context-aware authorization.
- Docker/Coolify production path.

## Required Files

- `App.tsx`
- `index.tsx`
- `hooks/index.ts`
- `services/apiClient.ts`
- `services/authService.ts`
- `types.ts`
- `server/index.ts`
- `server/db.ts`
- `server/schema.ts`
- `server/seed.ts`
- `server/security.ts`
- `server/httpHardening.ts`
- `server/routes/*`
- `.env.example`
- `Dockerfile`
- `docker-compose.yml`
- `docs/DatabaseSchema.md`

## Non-Negotiables

- Do not call `fetch` directly from React components.
- Do not put SQL access in frontend services.
- Do not concatenate SQL with user input.
- Do not store large files in SQLite.
- Do not expose API keys to frontend code.
- Keep `/api/health` and `/api/ready` separate.

## Build Sequence

1. Create package/scripts/tooling.
2. Create backend entrypoint, DB, schema, seed.
3. Create auth/session/roles.
4. Create frontend app shell and api client.
5. Add first domain route and UI.
6. Add Docker/Coolify files.
7. Add docs and quality gates.
8. Run checks.
