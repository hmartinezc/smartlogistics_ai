# Hono libSQL Turso

Use this skill when implementing backend routes, database access, migrations, seeds, or Turso compatibility.

## Hono Rules

- Mount route modules in `server/index.ts` with `app.route('/api/<domain>', routes)`.
- Keep HTTP parsing and permission checks in routes.
- Put reusable business logic in `server/services/*`.
- Return structured JSON errors.
- Never leak stack traces to clients.

## Auth Rules

- Every protected route calls `requireAuth(c)`.
- Role-restricted routes call `requireRole(c, user, roles)`.
- Tenant-specific routes call `ensureAgencyAccess` or a domain-equivalent helper.
- Session ID comes from `X-Session-Id`.

## libSQL Rules

- Use `getDb()` from `server/db.ts`.
- Use parameterized queries: `{ sql, args }`.
- Prefer `db.batch()` for multi-statement writes.
- Enable foreign keys and WAL in migrations.
- Add indexes for tenant/status/date query patterns.

## Migration Rules

- `CREATE TABLE IF NOT EXISTS`.
- `CREATE INDEX IF NOT EXISTS`.
- Use `ensureColumn` for additive columns.
- Avoid destructive migration unless explicitly planned and backed up.
- Keep `docs/DatabaseSchema.md` synchronized.

## Turso Compatibility

Use env vars:

```env
TURSO_DATABASE_URL=file:./data/app.db
# TURSO_DATABASE_URL=libsql://your-db.turso.io
# TURSO_AUTH_TOKEN=replace-with-real-token
```

Local file mode must work first. Turso remote should be a configuration change, not a code rewrite.
