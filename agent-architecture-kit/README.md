# Agent Architecture Kit

Este kit empaqueta la arquitectura reusable extraida de este proyecto para iniciar o modernizar futuras aplicaciones con una base seria: React + Vite, Hono, libSQL/SQLite con opcion Turso, MinIO/S3-compatible, Docker/Coolify, reglas de calidad y skills de agente.

El objetivo no es copiar el dominio de facturas ni la IA actual. El objetivo es copiar la forma de construir: capas claras, seguridad propia, datos persistentes, despliegue simple y espacio preparado para agregar IA despues como modulo.

## Como Usarlo

1. Copia esta carpeta `agent-architecture-kit/` al nuevo proyecto.
2. En la nueva sesion de Codex/GPT, pega el contenido de `BOOTSTRAP_PROMPT_CODEX.md`.
3. Pide al agente que lea `ARCHITECTURE_BLUEPRINT.md` antes de generar codigo.
4. Si usas OpenCode o un sistema compatible con skills locales, copia `skills/*` a `.opencode/skills/` del nuevo repo.
5. Usa `AGENTS_TEMPLATE.md` como base del `AGENTS.md` del nuevo proyecto.
6. Usa `CHECKLIST_NEW_PROJECT.md` para validar que la app nueva queda lista para Coolify.

## Contenido

| Archivo / carpeta           | Uso                                                                      |
| --------------------------- | ------------------------------------------------------------------------ |
| `ARCHITECTURE_BLUEPRINT.md` | Documento maestro de arquitectura reusable.                              |
| `BOOTSTRAP_PROMPT_CODEX.md` | Prompt listo para pegar en una nueva sesion de Codex/GPT.                |
| `COPY_TO_NEW_PROJECT.md`    | Pasos para copiar el kit a un proyecto nuevo o modernizar uno existente. |
| `AGENTS_TEMPLATE.md`        | Plantilla de instrucciones para agentes en un nuevo repo.                |
| `CHECKLIST_NEW_PROJECT.md`  | Checklist de creacion, modernizacion y deploy.                           |
| `SKILLS_INDEX.md`           | Inventario de skills base, opcionales e IA.                              |
| `skills/*/SKILL.md`         | Skills custom portables para nuevos proyectos.                           |
| `templates/*`               | Plantillas base de Docker, Compose, env vars y scripts npm.              |

## Decision Principal

La base de cualquier app nueva debe arrancar sin IA obligatoria:

- React + Vite para SPA operacional.
- Hono para API bajo `/api/*`.
- `services/apiClient.ts` como unico cliente HTTP frontend.
- `server/db.ts` como singleton libSQL/Turso.
- `server/schema.ts` con migraciones idempotentes.
- `server/security.ts` con sesiones DB, roles y tenant/contexto.
- Docker Node 20 multi-stage.
- Coolify en puerto `3001`.
- `/api/health` para liveness.
- `/api/ready` para readiness real.
- Persistencia local en `/app/data`.
- MinIO/S3-compatible para archivos, no blobs grandes en SQLite.

La IA entra despues como addon:

- API key solo en backend.
- Prompts versionados.
- Schema compartido.
- Validacion deterministica.
- Cola/worker si hay procesos largos.
- Telemetria y golden tests.

## Instalar Los Skills En Otro Proyecto

Opcion simple:

1. Copia `agent-architecture-kit/skills/*` al nuevo repo en `.opencode/skills/`.
2. Copia `agent-architecture-kit/AGENTS_TEMPLATE.md` como `AGENTS.md`.
3. Pide al agente: "lee AGENTS.md y los skills de `.opencode/skills/` antes de implementar".

Opcion sin instalar:

1. Mantén esta carpeta dentro del repo.
2. Pide al agente que lea `agent-architecture-kit/skills/*/SKILL.md` cuando toque esa capa.
3. Usa `BOOTSTRAP_PROMPT_CODEX.md` como instruccion inicial.
