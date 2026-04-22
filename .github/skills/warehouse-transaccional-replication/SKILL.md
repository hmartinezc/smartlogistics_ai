---
name: warehouse-transaccional-replication
description: "Use when: replicar la arquitectura del Smart Logistics Extractor sin IA en cualquier nuevo proyecto transaccional, crear un sistema web con React + Hono + libSQL/Turso, validar que otro repo sigue el mismo patron arquitectonico, preparar despliegue en Coolify o Hetzner."
---

# Patron Arquitectonico Reutilizable — Sistemas Transaccionales

Esta skill existe para que otro agente pueda replicar el patron arquitectonico del Smart Logistics Extractor en cualquier nuevo sistema transaccional, sin importar el dominio de negocio (bodega, ventas, clinica, CRM, etc.).

## Objetivo

Construir o validar una aplicacion web con estas propiedades:

- frontend React + TypeScript + Vite
- backend Hono organizado por dominios de negocio
- una sola capa de acceso a base de datos con `@libsql/client` (singleton)
- compatibilidad con modo local `file:` y modo remoto Turso `libsql://`
- autenticacion con scrypt, timingSafeEqual, sesiones persistidas en DB
- seguridad centralizada: requireAuth, requireRole, ensureContextAccess
- despliegue simple con Docker multi-stage y Coolify

## Fuente de verdad

Antes de proponer arquitectura o escribir codigo, toma como referencia principal:

- `docs/GuiaReplicacionArquitectura.md`

Lee ese documento COMPLETO. Contiene el patron de seguridad, el flujo de login, la estructura de backend, el patron de migraciones, el seed idempotente, y el contrato de replicacion.

## Patron obligatorio a replicar

### Capas (en orden de flujo)

1. React SPA (`App.tsx` como orquestador)
2. Hooks por responsabilidad (`useAuth`, `useApiData`, `useContextSelector`, hooks de dominio)
3. `apiClient` centralizado (inyecta `X-Session-Id` automaticamente)
4. Hono API por dominios de negocio
5. `security.ts` centralizado (hash, sesiones, roles, tenant)
6. `db.ts` como punto unico de acceso SQL (singleton con soporte dual)
7. Docker multi-stage para despliegue

### Patron de seguridad obligatorio

- passwords con scrypt: formato `scrypt$salt$hash`
- verificacion con timingSafeEqual (resistente a timing attacks)
- migracion transparente de passwords legacy en el login
- sesiones en tabla `auth_sessions` (UUID v4, 8h expiracion)
- header `X-Session-Id` (no JWT, no cookies)
- `requireAuth` → `requireRole` → `ensureContextAccess` en cada endpoint protegido
- apiClient inyecta sessionId automaticamente — componentes nunca manipulan headers

### Patron de arranque del servidor

Secuencia exacta en `server/index.ts`:

1. `fs.mkdirSync('data', { recursive: true })`
2. `const db = getDb()`
3. `await runMigrations(db)` — `CREATE TABLE IF NOT EXISTS` + PRAGMAs
4. `await runSeed(db)` — idempotente, verifica antes de insertar
5. `serve({ fetch: app.fetch, port })`

### Restricciones

- no agregar IA, prompts ni Gemini
- no poner SQL en componentes React ni en hooks
- no usar multiples clientes de base de datos segun entorno
- no hardcodear credenciales de Turso
- no mezclar autenticacion con estado visual de frontend
- no crear sesiones con JWT ni cookies — siempre tabla + header
- no omitir PRAGMAs (foreign_keys, journal_mode WAL)
- no hacer seed no-idempotente

## Modelo tecnico esperado

### Archivos de infraestructura (siempre presentes)

- `server/index.ts` — arranque, CORS, rutas, SPA fallback
- `server/db.ts` — singleton libSQL con soporte dual
- `server/schema.ts` — CREATE TABLE IF NOT EXISTS + PRAGMAs
- `server/seed.ts` — datos iniciales idempotentes
- `server/security.ts` — hash, sesiones, requireAuth, requireRole, ensureContextAccess
- `server/routes/auth.ts` — login, sesion, logout
- `server/routes/users.ts` — CRUD de usuarios
- `server/routes/settings.ts` — configuracion key-value
- `services/apiClient.ts` — requests HTTP con X-Session-Id
- `hooks/index.ts` — useAuth, useApiData, useContextSelector, etc.

### Archivos de dominio (varian por proyecto)

Cada dominio de negocio agrega sus propios archivos de rutas, hooks y componentes. La skill NO define cuales son — el agente los diseña segun el dominio del nuevo proyecto.

### Base de datos esperada

- soporte local: `TURSO_DATABASE_URL=file:./data/app.db`
- soporte remoto: `TURSO_DATABASE_URL=libsql://...`
- token remoto opcional via `TURSO_AUTH_TOKEN`
- queries parametrizadas (nunca interpolar valores)
- `PRAGMA foreign_keys = ON`
- `PRAGMA journal_mode = WAL`

## Checklist de validacion

Antes de dar por terminado el trabajo, el agente debe validar que:

- [ ] existe `server/db.ts` singleton con soporte `file:` y `libsql://`
- [ ] existe `server/security.ts` con scrypt, timingSafeEqual, requireAuth, requireRole
- [ ] sesiones usan UUID + header X-Session-Id + tabla auth_sessions
- [ ] existe migracion transparente de passwords legacy
- [ ] el apiClient inyecta X-Session-Id automaticamente
- [ ] useAuth restaura sesion al montar y expone sessionReady
- [ ] schema.ts usa CREATE TABLE IF NOT EXISTS y corre PRAGMAs
- [ ] seed.ts es idempotente
- [ ] secuencia de arranque: mkdir → getDb → migrations → seed → serve
- [ ] existe GET /api/health
- [ ] Dockerfile multi-stage (builder + runner)
- [ ] en produccion el mismo proceso sirve SPA y API
- [ ] el cambio de local a Turso es por variables de entorno solamente
- [ ] ningun componente React ni hook accede a SQL ni hace fetch directo

## Resultado esperado

El agente debe producir una de estas salidas:

1. **Implementacion nueva** siguiendo este patron, adaptada al dominio del nuevo proyecto
2. **Validacion tecnica** que indique si otro repo cumple o no con el patron y que le falta