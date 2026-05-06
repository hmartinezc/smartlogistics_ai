<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Smart Logistics Extractor

Aplicación React + Hono con base local libSQL/SQLite para procesar facturas, administrar agencias y operar conciliación AWB.

## Stack

- Frontend: React + Vite
- Backend: Hono
- Base de datos local: libSQL sobre `data/smart-invoice.db`
- IA: Gemini consumido desde el backend

## Variables de entorno

- `GEMINI_API_KEY`: requerida para extracción documental
- `PORT`: opcional, por defecto `3001`
- `TURSO_DATABASE_URL`: opcional, si quieres usar Turso remoto en lugar de archivo local
- `TURSO_AUTH_TOKEN`: opcional, requerido si `TURSO_DATABASE_URL` apunta a Turso remoto
- `MINIO_ROOT_USER`: requerida cuando despliegas con MinIO en Docker Compose
- `MINIO_ROOT_PASSWORD`: requerida cuando despliegas con MinIO en Docker Compose
- `DOCUMENT_UPLOAD_MAX_BYTES`: opcional, tamaño máximo por PDF cargado a MinIO
- `DOCUMENT_UPLOAD_MAX_TOTAL_BYTES`: opcional, tamaño máximo por request de carga
- `DOCUMENT_WORKER_ENABLED`: opcional, activa/desactiva el worker de procesamiento IA
- `DOCUMENT_WORKER_POLL_MS`: opcional, intervalo de polling del worker
- `DOCUMENT_WORKER_CONCURRENCY`: opcional, documentos procesados por ciclo
- `DOCUMENT_WORKER_STALE_PROCESSING_MS`: opcional, tiempo para reencolar jobs interrumpidos

## Desarrollo local

1. Instala dependencias con `npm install`
2. Configura `GEMINI_API_KEY`
3. Ejecuta `npm run dev`

Esto levanta:

- Vite en `http://localhost:5173`
- API Hono en `http://localhost:3001`

## Producción / Coolify

- Build: `npm run build`
- Start: `npm run start`
- La app sirve SPA + API desde el mismo proceso
- El worker backend procesa jobs `QUEUED` desde MinIO sin depender del navegador
- Monta persistencia en `/app/data` si usas la BD local
- El repositorio incluye `Dockerfile`, `docker-compose.yml`, `.dockerignore` y `.env.example`
- La receta operativa completa está en `docs/CoolifyDeployment.md`

### Configuración Exacta en Coolify

Usa estos valores literalmente:

| Campo Coolify                | Valor                     |
| ---------------------------- | ------------------------- |
| **Build Pack**               | `Docker Compose`          |
| **Compose File**             | `./docker-compose.yml`    |
| **Build Command**            | no aplica si usas Compose |
| **Start Command**            | no aplica si usas Compose |
| **Port**                     | `3001`                    |
| **Healthcheck Path**         | `/api/health`             |
| **Persistent Volume**        | `/app/data`               |
| **Node Version recomendada** | `20`                      |

Si prefieres Nixpacks, usa como fallback:

- Build Command: `npm run build`
- Start Command: `npm run start`

### Variables recomendadas para Coolify

| Variable                              | Valor ejemplo                                   | Obligatoria               |
| ------------------------------------- | ----------------------------------------------- | ------------------------- |
| `PORT`                                | `3001`                                          | No                        |
| `GEMINI_API_KEY`                      | `tu-api-key`                                    | Sí                        |
| `TURSO_DATABASE_URL`                  | `file:./data/smart-invoice.db` o `libsql://...` | No                        |
| `TURSO_AUTH_TOKEN`                    | `token-remoto`                                  | Solo si usas Turso remoto |
| `MINIO_ROOT_USER`                     | `usuario-minio-interno`                         | Sí con Docker Compose     |
| `MINIO_ROOT_PASSWORD`                 | `password-fuerte`                               | Sí con Docker Compose     |
| `DOCUMENT_UPLOAD_MAX_BYTES`           | `26214400`                                      | No                        |
| `DOCUMENT_UPLOAD_MAX_TOTAL_BYTES`     | `104857600`                                     | No                        |
| `DOCUMENT_WORKER_ENABLED`             | `true`                                          | No                        |
| `DOCUMENT_WORKER_POLL_MS`             | `5000`                                          | No                        |
| `DOCUMENT_WORKER_CONCURRENCY`         | `1`                                             | No                        |
| `DOCUMENT_WORKER_STALE_PROCESSING_MS` | `1800000`                                       | No                        |

### Modo recomendado para arrancar barato

- Empieza con BD local montada en volumen persistente: `file:./data/smart-invoice.db`
- Sube a Turso remoto solo cuando necesites réplica, backup gestionado o separar app/db
- Mantén un backup periódico del volumen si sigues con SQLite local

### Checklist Hetzner + Coolify

1. Crea un volumen persistente y móntalo en `/app/data`
2. Define `GEMINI_API_KEY` en variables del servicio
3. Si usarás Turso remoto, define también `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`
4. Usa `Docker Compose` para levantar la app y MinIO juntos
5. No expongas los puertos de MinIO públicamente salvo que necesites administrar la consola
6. Expón el puerto `3001` o configura `PORT` explícitamente
7. Verifica el healthcheck en `/api/health`
8. Ejecuta `npm run db:seed` solo si necesitas rehidratar una base nueva
9. No expongas Vite dev server en producción; solo el proceso de Hono
10. Si mantienes BD local, asegúrate de incluir backup periódico del volumen

### Receta final recomendada

1. Copia los valores de `.env.example` a las variables del servicio en Coolify.
2. Monta un volumen persistente en `/app/data`.
3. Despliega usando `docker-compose.yml`.
4. Confirma `200 OK` en `/api/health`.
5. Valida login, agencias y extracción IA.

Detalle completo: `docs/CoolifyDeployment.md`

### Riesgo pendiente conocido

- Quedan 2 vulnerabilidades moderadas asociadas a `esbuild` vía `vite`; afectan el servidor de desarrollo y requieren salto a `vite@8` para resolverlas por completo sin parche manual.

## Mantenibilidad actual

- Backend separado por dominios en `server/routes/*`
- Seguridad centralizada en `server/security.ts`
- Esquema y seed centralizados en `server/schema.ts` y `server/seed.ts`
- Cliente HTTP centralizado en `services/apiClient.ts`
- Documentación técnica principal en `docs/DatabaseSchema.md`

## Documentacion clave

- `docs/DatabaseSchema.md`
- `docs/GuiaReplicacionArquitectura.md`
- `docs/AIAgentsFutureUpgradePlan.md`
- `docs/GuiaEvolucionArquitecturaIA.md`

## Utilidades

- Ejecutar seed manual: `npm run db:seed`
