# Copia Rapida A Un Nuevo Proyecto

## Opcion A: Usar El Kit Como Referencia

1. Copia la carpeta completa `agent-architecture-kit/` al nuevo repo.
2. Abre una nueva sesion de Codex/GPT.
3. Pega `agent-architecture-kit/BOOTSTRAP_PROMPT_CODEX.md`.
4. Pide que construya la base respetando `ARCHITECTURE_BLUEPRINT.md`.

Esta opcion es la mas segura si solo quieres que el agente lea el blueprint.

## Opcion B: Instalar Skills Locales

1. Copia cada carpeta dentro de `agent-architecture-kit/skills/` a `.opencode/skills/`.
2. Copia `agent-architecture-kit/AGENTS_TEMPLATE.md` como `AGENTS.md`.
3. Copia `agent-architecture-kit/templates/.env.example` como `.env.example`.
4. Copia `agent-architecture-kit/templates/Dockerfile` como `Dockerfile`.
5. Copia `agent-architecture-kit/templates/docker-compose.yml` como `docker-compose.yml`.
6. Usa `agent-architecture-kit/templates/package-scripts.json` para actualizar los scripts de `package.json`.

## Opcion C: Modernizar Una App Existente

1. No reemplaces todo.
2. Lee primero la app actual.
3. Introduce capas en este orden:
   - `services/apiClient.ts`
   - `server/db.ts`
   - `server/security.ts`
   - `server/schema.ts`
   - `/api/health` y `/api/ready`
   - Docker/Coolify
   - MinIO solo si hay archivos grandes
4. Migra pantallas y rutas por dominio, no en un cambio masivo.
5. Mantén docs y `.env.example` sincronizados.

## Archivos Del Proyecto Origen Que Conviene Mirar

- `server/index.ts`
- `server/db.ts`
- `server/schema.ts`
- `server/security.ts`
- `server/httpHardening.ts`
- `server/services/minioService.ts`
- `server/workers/documentWorker.ts`
- `services/apiClient.ts`
- `hooks/index.ts`
- `widget.tsx`
- `Dockerfile`
- `docker-compose.yml`
- `.env.example`
- `.opencode/rules/**`
- `.opencode/skills/**`
- `.opencode/agents/**`
- `.opencode/commands/**`

## Recordatorio

Copiar arquitectura no significa copiar dominio. En una app nueva, reemplaza facturas, AWB, product matching y Gemini por las entidades reales del negocio.
