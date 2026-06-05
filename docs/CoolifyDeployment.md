# Receta final de despliegue en Coolify

Esta aplicacion se despliega con Docker Compose cuando se usa MinIO local/S3-compatible. El servicio `app` sirve:

- la SPA compilada desde `dist/`
- la API Hono en `/api/*`
- la base local libSQL/SQLite en `data/smart-invoice.db` cuando no se usa Turso remoto
- MinIO queda como servicio interno para almacenar PDFs fuera de SQLite

## Estrategia recomendada

Usa primero SQLite local con volumen persistente en Coolify. Es la opcion mas barata y mas simple para este proyecto.

Pasa a Turso remoto solo si necesitas:

- separar app y base de datos
- mejores backups gestionados
- replicas o acceso externo a la base

## Opcion recomendada: Docker Compose del repo

El repositorio incluye un `docker-compose.yml` que levanta la aplicacion y MinIO. La aplicacion sigue usando el `Dockerfile` multi-stage del repo para construir la imagen del servicio `app`.

Ventajas:

- fija Node 20
- separa build y runtime
- evita depender del autodetect de Nixpacks
- crea MinIO junto a la aplicacion en la misma red interna
- deja un arranque consistente entre local, Coolify y Hetzner

Nota operativa:

- El `Dockerfile` actual mantiene el usuario por defecto del contenedor en runtime para evitar problemas de permisos con volúmenes ya existentes en `/app/data`. No cambies eso a no-root sin validar primero ownership/migración del volumen.
- En este proyecto eso NO debe tratarse como fallo de pre-deploy por sí solo. Es una decisión operativa consciente para compatibilidad con Coolify + SQLite persistido en volumen.

## Configuracion exacta en Coolify

### Crear servicio

1. Crea un nuevo servicio desde este repositorio.
2. Selecciona `Docker Compose` como metodo de despliegue.
3. Usa `./docker-compose.yml` como compose file.

### Campos clave

| Campo            | Valor            |
| ---------------- | ---------------- |
| Port             | `3001`           |
| Healthcheck Path | `/api/health`    |
| Restart Policy   | `unless-stopped` |
| Base Directory   | `/`              |

### Variables de entorno

Carga estas variables en Coolify:

Nota:

- El `docker-compose.yml` del repo deja credenciales internas fijas para MinIO.
- Mientras mantengas ese compose tal cual, no necesitas definir `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_ACCESS_KEY` ni `MINIO_SECRET_KEY` en Coolify.

| Variable                                        | Requerida                              | Valor recomendado              |
| ----------------------------------------------- | -------------------------------------- | ------------------------------ |
| `PORT`                                          | No                                     | `3001`                         |
| `GEMINI_API_KEY`                                | Si                                     | tu clave real                  |
| `GEMINI_MODEL_ID`                               | No                                     | `gemini-3-flash-preview`       |
| `GEMINI_EXTRACTION_SDK`                         | No                                     | `genai-router-files`           |
| `GEMINI_EXTRACTION_PROMPT_PROFILE`              | No                                     | `full`                         |
| `GEMINI_GENERATE_TIMEOUT_MS`                    | No                                     | `180000`                       |
| `GEMINI_CACHED_GENERATE_TIMEOUT_MS`             | No                                     | `180000`                       |
| `GEMINI_MAX_OUTPUT_TOKENS`                      | No                                     | `4096`                         |
| `GEMINI_AI_REVIEW_MODEL_ID`                     | No                                     | `gemini-3-flash-preview`       |
| `GEMINI_ROUTER_MODEL_ID`                        | No                                     | `gemini-3.1-flash-lite`        |
| `GEMINI_ROUTER_EXTRACTOR_MODEL_ID`              | No                                     | `gemini-3-flash-preview`       |
| `GEMINI_ROUTER_CLASSIFIER_CONFIDENCE_THRESHOLD` | No                                     | `0.7`                          |
| `GEMINI_ROUTER_CLASSIFIER_MAX_OUTPUT_TOKENS`    | No                                     | `512`                          |
| `GEMINI_ROUTER_CLASSIFIER_MEDIA_RESOLUTION`     | No                                     | `medium`                       |
| `GEMINI_ROUTER_CLASSIFIER_THINKING_LEVEL`       | No                                     | `medium`                       |
| `GEMINI_ROUTER_CLASSIFIER_TIMEOUT_MS`           | No                                     | `45000`                        |
| `GEMINI_ROUTER_EXTRACTOR_TIMEOUT_MS`            | No                                     | `180000`                       |
| `GEMINI_THINKING_LEVEL`                         | No                                     | `minimal`                      |
| `GEMINI_GENAI_TRANSIENT_RETRY_ATTEMPTS`         | No                                     | `3`                            |
| `GEMINI_GENAI_TRANSIENT_RETRY_BASE_DELAY_MS`    | No                                     | `15000`                        |
| `GEMINI_LEGACY_TRANSIENT_RETRY_ATTEMPTS`        | No                                     | `3`                            |
| `GEMINI_LEGACY_TRANSIENT_RETRY_BASE_DELAY_MS`   | No                                     | `15000`                        |
| `GEMINI_PROMPT_CACHE_ENABLED`                   | No                                     | `true`                         |
| `GEMINI_PROMPT_CACHE_USE_FOR_EXTRACTION`        | No                                     | `false`                        |
| `GEMINI_PROMPT_CACHE_AUTO_WARM_ENABLED`         | No                                     | `false`                        |
| `GEMINI_PROMPT_CACHE_TTL_SECONDS`               | No                                     | `14400`                        |
| `GEMINI_PROMPT_CACHE_FAILURE_COOLDOWN_SECONDS`  | No                                     | `600`                          |
| `GEMINI_PROMPT_CACHE_CREATE_TIMEOUT_MS`         | No                                     | `60000`                        |
| `TURSO_DATABASE_URL`                            | No                                     | `file:./data/smart-invoice.db` |
| `TURSO_AUTH_TOKEN`                              | Solo si usas Turso remoto              | token real                     |
| `MINIO_ROOT_USER`                               | No, referencia si parametrizas Compose | usuario interno de MinIO       |
| `MINIO_ROOT_PASSWORD`                           | No, referencia si parametrizas Compose | password fuerte de MinIO       |
| `DOCUMENT_UPLOAD_MAX_BYTES`                     | No                                     | `26214400`                     |
| `DOCUMENT_UPLOAD_MAX_TOTAL_BYTES`               | No                                     | `104857600`                    |
| `DOCUMENT_WORKER_ENABLED`                       | No                                     | `true`                         |
| `DOCUMENT_WORKER_POLL_MS`                       | No                                     | `7000`                         |
| `DOCUMENT_WORKER_CONCURRENCY`                   | No                                     | `5`                            |
| `DOCUMENT_WORKER_JOB_TIMEOUT_MS`                | No                                     | `300000`                       |
| `DOCUMENT_WORKER_STALE_PROCESSING_MS`           | No                                     | `2100000`                      |

Puedes partir de `.env.example`.

## Volumen persistente

Si usas base local, monta un volumen persistente exactamente en:

`/app/data`

Eso conserva:

- `smart-invoice.db`
- `smart-invoice.db-wal`
- `smart-invoice.db-shm`

MinIO usa su propio volumen Docker llamado `minio_data`, definido en `docker-compose.yml`, para conservar los PDFs entre redeploys.

Sin ese volumen perderas la base al recrear el contenedor.

## Primer despliegue

1. Configura variables.
2. Configura volumen `/app/data`.
3. Despliega.
4. Espera healthcheck `200 OK` en `/api/health`.
5. Inicia sesion con el usuario seed solo si la base es nueva.

Credenciales seed iniciales:

- `admin@smart.com`
- password inicial: `1234`

Cambiarlas despues del primer acceso es recomendable si el entorno dejara de ser solo interno.

## Seed de base de datos

No necesitas correr `npm run db:seed` en cada deploy.

El servidor ya ejecuta migraciones y seed idempotente al arrancar. Usa `npm run db:seed` solo para recuperacion manual o inicializacion fuera del flujo normal.

## Checklist de validacion post-deploy

1. `GET /api/health` responde `200`.
2. La pantalla de login carga sin errores.
3. `admin@smart.com / 1234` entra si la base fue creada desde cero.
4. Puedes listar agencias y planes.
5. La extraccion IA funciona con `GEMINI_API_KEY` valida y `GEMINI_EXTRACTION_SDK=genai-router-files`, usando Files API, clasificador en `medium` y extractor especializado sin cache.
6. Para comparar legacy contra el SDK nuevo sin cache, usa `POST /api/ai/compare` con un PDF y revisa `legacy`, `genaiRouterFiles` y `diff.summary`.
7. Para comparar contra el baseline operativo, usa `GEMINI_EXTRACTION_SDK=legacy` o el override `docker-compose.legacy.yml`.
8. Si quieres probar cache explicito fuera del modo estable, usa `GEMINI_EXTRACTION_SDK=genai` o `GEMINI_EXTRACTION_SDK=legacy-cache` y activa `GEMINI_PROMPT_CACHE_USE_FOR_EXTRACTION=true`; `POST /api/documents/process` devuelve `promptCaches` y los logs de Gemini registran uso de cache.
9. Los documentos puestos en cola pasan de `QUEUED` a `PROCESSING` y luego a `SUCCESS` o `ERROR`.
10. Tras reiniciar el servicio, los datos siguen presentes si montaste `/app/data`.
11. Un documento con `invoice.totalValue = 50.5` y suma de lineas `50.50` no queda marcado con `VALUE_TOTAL_MISMATCH`.
12. Un documento con baja confianza visual puede seguir en revision aunque no existan discrepancias matematicas.
13. Si Gemini devuelve `confidenceReasons`, el score persistido refleja solo discrepancias matematicas confirmadas por backend mas razones visuales/OCR no verificables.

## Troubleshooting rapido

### El healthcheck falla

Revisa:

- que el puerto del servicio sea `3001`
- que `npm run start` sea el comando efectivo si no usas Dockerfile
- que no falte `dist/` en la imagen

### La app levanta pero no guarda datos

Casi siempre es volumen mal montado o montado en una ruta distinta de `/app/data`.

### La IA no extrae datos

Revisa `GEMINI_API_KEY`. La clave se usa en backend, no en el navegador.

El default de Docker es `GEMINI_EXTRACTION_SDK=genai-router-files` sin fallback automático a legacy. Si `GET /api/ai/cache-status` muestra errores recurrentes del SDK nuevo o del Files API, cambia manualmente a `legacy` solo para diagnosticar y luego reconstruye el servicio para comparar con el baseline.

### La confianza baja parece incorrecta

Revisa el `result_json` persistido en `batch_items` o `document_jobs`:

- `confidenceScore` es el score final ya revalidado por backend.
- `confidenceReasons` contiene los motivos aceptados para la penalizacion.
- `confidenceAudit` conserva `modelScore`, `backendScore`, `finalScore` y codigos invalidados para debugging.

### Quiero usar Turso remoto

Define:

- `TURSO_DATABASE_URL=libsql://...`
- `TURSO_AUTH_TOKEN=...`

En ese modo el volumen local deja de ser obligatorio para la base.

## Decisiones operativas recomendadas

- Para empezar en Hetzner: SQLite local + backup del volumen.
- Para crecimiento: Turso remoto + mismo contenedor de aplicacion.
- Para cambios de codigo: mantén `README.md` y este archivo sincronizados cuando cambien puertos, healthcheck o variables.

<!-- redeploy-check: Coolify Docker Compose + MinIO -->
