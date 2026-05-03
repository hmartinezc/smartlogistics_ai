---
name: deployment-patterns
description: Deployment strategies for Node.js fullstack applications using Coolify, Docker, and self-hosted infrastructure. Use when deploying, configuring production environments, troubleshooting deployment issues, or setting up CI/CD pipelines.
license: MIT
metadata:
  author: smart-logistics
  version: '1.0.0'
---

# Deployment Patterns — Coolify + Docker

Deployment best practices for this project's preferred path: Docker containers managed by Coolify.

## Current Project Deployment Setup

- **Container:** Node 20 Alpine
- **Port:** 3001
- **Healthcheck:** `/api/health`
- **Database:** SQLite (local file) — requires volume mount
- **Build:** `npm run build` produces `dist/`, then `npm run start` serves it
- **Process:** Single Hono process serves both API and SPA static files

## Coolify-Specific Configuration

### 1. Healthcheck

Coolify needs a healthcheck endpoint to know the app is running:

```dockerfile
# Already in Dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1
```

Verify the endpoint works:

```bash
curl http://localhost:3001/api/health
# Expected: {"status":"ok"}
```

### 2. Persistent Storage (CRITICAL)

SQLite databases are files on disk. If the container restarts without a volume mount, the database is lost.

**Coolify volume configuration:**

```yaml
# In Coolify service configuration
volumes:
  - /host/path/to/data:/app/data
```

**In Dockerfile:**

```dockerfile
# Create data directory
RUN mkdir -p /app/data

# The application writes to /app/data/smart-invoice.db
```

**Environment variable for production:**

```bash
TURSO_DATABASE_URL=file:/app/data/smart-invoice.db
# OR if using local SQLite directly:
# The app defaults to file:./data/smart-invoice.db which resolves to /app/data
```

### 3. Environment Variables in Coolify

Set these in the Coolify service environment:

| Variable             | Required | Value                      |
| -------------------- | -------- | -------------------------- |
| `GEMINI_API_KEY`     | YES      | Your Gemini API key        |
| `PORT`               | NO       | 3001 (default)             |
| `NODE_ENV`           | YES      | production                 |
| `TURSO_DATABASE_URL` | NO       | Only if using remote Turso |
| `TURSO_AUTH_TOKEN`   | NO       | Only if using remote Turso |

**Never commit `.env` files.** Use Coolify's environment variable UI.

### 4. Build vs Runtime

Coolify typically handles this, but understand the flow:

```
Build Phase (Coolify runs these in build container):
  1. docker build
  2. npm install
  3. npm run build  (produces dist/)

Runtime Phase (Coolify starts the container):
  1. npm run start  (runs tsx server/index.ts)
  2. Server starts on PORT 3001
  3. Serves dist/ for SPA routes
  4. API routes under /api/*
```

### 5. Zero-Downtime Deployment

Coolify supports rolling updates. Ensure:

- The new container passes healthcheck before the old one is stopped.
- Database migrations are backward-compatible (don't break old running code).
- If migrations are destructive, run them manually before deployment.

## Deployment Checklist (Every Deploy)

- [ ] `npm run check` passes locally
- [ ] `npm run build` succeeds locally
- [ ] `npm run start` starts without errors locally
- [ ] Environment variables are set in Coolify
- [ ] Volume mount for `/app/data` is configured
- [ ] Healthcheck endpoint `/api/health` responds correctly
- [ ] Database schema is compatible with running code
- [ ] No secrets in committed files (run `npm run scan-secrets`)
- [ ] `README.md` and `docs/CoolifyDeployment.md` are synchronized
- [ ] Backup database before major schema changes

## Rollback Strategy

If a deployment breaks:

1. **Immediate:** Coolify can rollback to previous container image.
2. **Database:** If schema changed, restore from backup if needed.
3. **Environment:** Verify env vars weren't accidentally changed.

## Monitoring (Basic)

Add lightweight logging for production:

```typescript
// server/index.ts
import { Hono } from 'hono';
import { logger } from 'hono/logger';

const app = new Hono();

// Only log in production (dev has Vite noise)
if (process.env.NODE_ENV === 'production') {
  app.use('*', logger());
}
```

Log what matters:

- Server startup/shutdown
- Failed auth attempts
- AI extraction failures (with error classification)
- Database connection errors

## Scaling Considerations

This app is currently single-instance. If you need to scale horizontally:

1. **Stateless first:** Move sessions from in-memory to database or Redis.
2. **Database:** Switch from local SQLite to Turso (already supported).
3. **File uploads:** Store uploaded files in S3-compatible storage, not local disk.
4. **AI extraction:** Consider a queue system (BullMQ, Bull) for processing many files.

## Common Issues

### Issue: Database file lost after restart

**Cause:** Volume mount missing or wrong path.
**Fix:** Ensure Coolify mounts `/host/path:/app/data` and app writes to `/app/data/smart-invoice.db`.

### Issue: Healthcheck fails

**Cause:** Server not starting or wrong port.
**Fix:** Check `PORT` env var. Verify `server/index.ts` listens on `process.env.PORT || 3001`.

### Issue: Static files not served

**Cause:** `dist/` directory missing or wrong path.
**Fix:** Verify `npm run build` runs during Docker build. Check `server/index.ts` serves `dist/` correctly.

### Issue: CORS errors in production

**Cause:** Frontend trying to call API on different domain.
**Fix:** In production, API and SPA are served from the same origin (Hono serves both). No CORS needed if same domain.
