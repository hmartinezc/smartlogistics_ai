# Coolify Docker MinIO

Use this skill when preparing deployment, Docker, Compose, healthchecks, persistence, or object storage.

## Dockerfile Pattern

- Builder: `node:20-alpine`.
- Runtime: `node:20-alpine`.
- Use `npm ci`.
- Build with `npm run build`.
- Runtime uses `npm ci --omit=dev`.
- Copy `dist`, `server`, `services`, `shared`, `types.ts` and config files needed at runtime.
- Create `/app/data`.
- Declare `VOLUME ["/app/data"]`.
- Expose `3001`.
- Use `dumb-init`.
- Healthcheck `/api/ready`.

## Coolify Settings

- Method: Docker Compose.
- Port: `3001`.
- Healthcheck path: `/api/ready`.
- Base directory: `/`.
- Persist local DB volume at `/app/data`.

## MinIO Pattern

- Use MinIO/S3-compatible for files.
- App env points to internal compose hostname `minio`.
- Persist MinIO data in `minio_data`.
- Do not expose MinIO publicly unless explicitly required.
- DB stores object keys and metadata.
- Parametrize MinIO credentials with env vars or platform secrets.
- Pin the MinIO image tag for production; avoid `latest`.

## Healthchecks

- `/api/health`: process alive.
- `/api/ready`: DB, MinIO and mandatory workers are ready.

## Common Failure Modes

- DB disappears after deploy: `/app/data` volume missing.
- `/api/ready` fails: DB, MinIO, bucket or worker unavailable.
- Static app missing: `dist/` not copied into runtime image.
- SQLite readonly: runtime user/volume ownership mismatch.
- Secrets leaked in logs: avoid pasting `docker compose config` output.
