# Checklist Para Nuevo Proyecto

## Fase 1: Base Tecnica

- [ ] `package.json` usa npm y `package-lock.json`.
- [ ] Scripts base: `dev`, `dev:client`, `dev:server`, `build`, `start`, `typecheck`, `format`, `format:check`, `quality`, `scan-secrets`, `check`.
- [ ] `build` valida backend o CI ejecuta `npm run typecheck` antes del build.
- [ ] Vite proxy `/api` a `http://localhost:3001`.
- [ ] TypeScript root y `server/tsconfig.json`.
- [ ] Tailwind configurado si hay UI.
- [ ] Prettier configurado.

## Fase 2: Frontend

- [ ] `index.tsx` monta `App.tsx`.
- [ ] `App.tsx` controla auth, navegacion y contexto.
- [ ] `hooks/index.ts` incluye `useAuth`, `useApiData`, `useTenantContext` o equivalente.
- [ ] `services/apiClient.ts` es la unica puerta HTTP.
- [ ] `apiClient` inyecta `X-Session-Id`.
- [ ] No hay `fetch` directo en componentes.
- [ ] La UI tiene login, dashboard, administracion basica y flujo principal del dominio.
- [ ] Primitivas UI base: `cn`, Button, Badge, Tooltip, Progress, Skeleton o equivalentes.
- [ ] Widget custom element solo si el producto necesita embebido.

## Fase 3: Backend

- [ ] `server/index.ts` arranca Hono.
- [ ] Rutas montadas bajo `/api/*`.
- [ ] CORS dev acotado.
- [ ] `server/httpHardening.ts` aplicado globalmente.
- [ ] `server/security.ts` implementa scrypt, sesiones DB, roles y tenant/contexto.
- [ ] `server/db.ts` usa `@libsql/client`.
- [ ] `server/schema.ts` ejecuta DDL idempotente.
- [ ] `server/seed.ts` es idempotente.
- [ ] `GET /api/health` existe.
- [ ] `GET /api/ready` valida dependencias reales.

## Fase 4: Datos

- [ ] DB local por defecto: `file:./data/app.db`.
- [ ] Turso remoto opcional por env vars.
- [ ] Tablas base: users, tenants/agencies, user_tenants, auth_sessions, app_settings.
- [ ] Indices para queries por tenant, estado y fecha.
- [ ] Migraciones probadas en DB vacia.
- [ ] Migraciones probadas en DB existente.
- [ ] `docs/DatabaseSchema.md` creado o actualizado.

## Fase 5: Archivos y MinIO

- [ ] Si hay archivos, usar MinIO/S3-compatible.
- [ ] DB guarda bucket, object_key, filename, size, mime.
- [ ] Object keys saneadas.
- [ ] Bucket se asegura antes de uso.
- [ ] Compose incluye `minio` y volumen `minio_data`.
- [ ] No se exponen puertos MinIO publicamente sin decision explicita.
- [ ] Credenciales MinIO vienen de env vars/secretos, no hardcodeadas en la plantilla productiva.
- [ ] Imagen MinIO usa tag fijado cuando sea produccion.

## Fase 6: Workers

- [ ] Procesos largos usan tabla de jobs.
- [ ] Estados claros: uploaded/queued/processing/success/error/cancelled.
- [ ] Concurrencia configurable.
- [ ] Locks y timeout.
- [ ] Reset de jobs interrumpidos.
- [ ] Readiness revisa worker si es obligatorio.

## Fase 7: Docker / Coolify

- [ ] Dockerfile multi-stage con Node 20.
- [ ] Runtime instala solo dependencias productivas.
- [ ] `dist/` se copia al runtime.
- [ ] `/app/data` existe y es volumen.
- [ ] `EXPOSE 3001`.
- [ ] Healthcheck usa `/api/ready`.
- [ ] `docker-compose.yml` levanta app y MinIO si aplica.
- [ ] Coolify usa Docker Compose, puerto `3001`, healthcheck `/api/ready`.
- [ ] Existe un solo compose canonico.

## Fase 8: Calidad

- [ ] `npm run typecheck` pasa.
- [ ] `npm run format:check` pasa.
- [ ] `npm run quality` pasa.
- [ ] `npm run scan-secrets` pasa.
- [ ] `scan-secrets` falla con exit code distinto de 0 en CI si encuentra secretos.
- [ ] `npm run build` pasa.
- [ ] README, `.env.example` y docs de deploy estan sincronizados.

## Fase 9: IA Opcional

- [ ] No hay IA si el usuario no la pidio.
- [ ] Si hay IA, key solo backend.
- [ ] Prompts versionados.
- [ ] Schema compartido.
- [ ] Validadores deterministas.
- [ ] Worker/cola para procesamiento largo.
- [ ] Telemetria de costo/tokens/duracion.
- [ ] Golden tests/regression tests.
