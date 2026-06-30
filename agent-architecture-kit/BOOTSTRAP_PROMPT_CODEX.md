# Prompt Maestro Para Nueva Sesion Codex / GPT

Copia y pega este prompt al iniciar una nueva aplicacion o modernizar una existente.

```md
Actua como arquitecto senior fullstack y crea/moderniza esta aplicacion usando el blueprint portable de `agent-architecture-kit/`.

Primero lee:

- `agent-architecture-kit/ARCHITECTURE_BLUEPRINT.md`
- `agent-architecture-kit/AGENTS_TEMPLATE.md`
- `agent-architecture-kit/CHECKLIST_NEW_PROJECT.md`
- `agent-architecture-kit/SKILLS_INDEX.md`
- los `SKILL.md` dentro de `agent-architecture-kit/skills/`
- las plantillas dentro de `agent-architecture-kit/templates/`

Objetivo:

Construir una aplicacion fullstack TypeScript lista para produccion con React + Vite, Hono, libSQL/SQLite local, Turso remoto opcional, MinIO/S3-compatible opcional para archivos, Docker multi-stage y despliegue Coolify.

Base obligatoria:

- React 18 + Vite SPA.
- `App.tsx` como shell/orquestador.
- `hooks/index.ts` para auth, datos base, tenant/contexto y preferencias.
- `services/apiClient.ts` como unico cliente HTTP del frontend.
- Backend Hono en `server/index.ts` con rutas bajo `/api/*`.
- `server/db.ts` singleton libSQL.
- `server/schema.ts` con DDL idempotente.
- `server/seed.ts` idempotente.
- `server/security.ts` con scrypt, sesiones DB, `requireAuth`, `requireRole` y acceso por tenant/contexto.
- `server/httpHardening.ts` con headers de seguridad y rate limit.
- `GET /api/health` como liveness.
- `GET /api/ready` como readiness real.
- Dockerfile Node 20 multi-stage.
- `docker-compose.yml` listo para Coolify.
- Persistencia local en `/app/data`.
- `.env.example` completo y sin secretos.
- Plantillas parametrizadas para MinIO, sin credenciales fijas.
- Scripts npm: dev, build, start, typecheck, format, format:check, quality, scan-secrets, check.

No incluir IA al inicio salvo que se pida explicitamente. Dejar la arquitectura preparada para agregar IA despues como addon:

- API key solo backend.
- Prompts versionados.
- Schema compartido.
- Validacion deterministica.
- Worker/cola para procesos largos.
- Telemetria y golden tests.

Reglas de implementacion:

- No llames `fetch` directamente desde componentes; usa `services/apiClient.ts`.
- No concatenes SQL con input de usuario; usa queries parametrizadas.
- No guardes secretos en codigo.
- No guardes archivos grandes en SQLite; usa MinIO/S3-compatible.
- Mantener docs sincronizados cuando cambien DB, env vars, puertos, Docker o healthchecks.
- `npm run build` debe incluir typecheck completo o el pipeline debe ejecutar `npm run typecheck` antes.
- Al terminar, ejecutar los checks disponibles y reportar que paso y que no se pudo ejecutar.

Quiero que tomes decisiones conservadoras y coherentes con el blueprint. Si el dominio del negocio no esta claro, crea una base generica multi-tenant con usuarios, roles, dashboard operacional, CRUD de una entidad principal y espacio para integraciones.
```
