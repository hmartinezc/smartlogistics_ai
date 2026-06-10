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
- Extracción IA default en Docker: router con Gemini Files API + prompts especializados mediante `@google/genai`
- Extracción IA baseline: SDK legacy `@google/generative-ai`, disponible para rollback y comparación
- Cache IA experimental: cache explicito del super prompt Gemini mediante `@google/genai`, disponible como opt-in

## Variables de entorno

- `GEMINI_API_KEY`: requerida para extracción documental
- `GEMINI_MODEL_ID`: opcional, modelo Gemini usado por extracción/cache; por defecto `gemini-3-flash-preview`
- `GEMINI_EXTRACTION_SDK`: opcional, `legacy`, `legacy-cache`, `genai` o `genai-router-files`; por defecto en Docker y `.env.example` es `genai-router-files` para usar Files API + router sin cache
- `GEMINI_EXTRACTION_PROMPT_PROFILE`: opcional, `full` o `compact`; `compact` reduce tokens para pruebas de latencia/costo, por defecto `full`
- `GEMINI_EXTRACTION_FALLBACK_TO_LEGACY_ON_TRANSIENT_ERROR`: opcional, deja fallback a legacy solo para validaciones locales o escenarios de diagnostico; por defecto `false`
- `GEMINI_GENERATE_TIMEOUT_MS`: opcional, timeout de extracción Gemini para evitar jobs colgados, por defecto `180000`
- `GEMINI_CACHED_GENERATE_TIMEOUT_MS`: opcional, timeout del camino con `cachedContent`, por defecto `180000`
- `GEMINI_MAX_OUTPUT_TOKENS`: opcional, limite de salida de Gemini para controlar costo/latencia, por defecto `4096`
- `GEMINI_AI_REVIEW_MODEL_ID`: opcional, modelo Gemini usado por la revisión IA; por defecto usa `gemini-3-flash-preview`
- `GEMINI_ROUTER_MODEL_ID`: opcional, modelo del clasificador router en modo `genai-router-files`, por defecto `gemini-3.1-flash-lite`
- `GEMINI_ROUTER_EXTRACTOR_MODEL_ID`: opcional, modelo extractor especializado en modo `genai-router-files`, por defecto `gemini-3-flash-preview`
- `GEMINI_ROUTER_CLASSIFIER_CONFIDENCE_THRESHOLD`: opcional, umbral diagnostico de confianza del clasificador, por defecto `0.7`
- `GEMINI_ROUTER_CLASSIFIER_MAX_OUTPUT_TOKENS`: opcional, limite de salida del clasificador, por defecto `512`
- `GEMINI_ROUTER_CLASSIFIER_MEDIA_RESOLUTION`: opcional, `low`, `medium` o `high` para el PDF visto por el clasificador, por defecto `medium`
- `GEMINI_ROUTER_CLASSIFIER_THINKING_LEVEL`: opcional, thinking del primer intento del clasificador, por defecto `medium`
- `GEMINI_ROUTER_CLASSIFIER_TIMEOUT_MS`: opcional, timeout del clasificador router, por defecto `45000`
- `GEMINI_ROUTER_EXTRACTOR_TIMEOUT_MS`: opcional, timeout del extractor especializado, por defecto `180000`
- `GEMINI_THINKING_LEVEL`: opcional, nivel de thinking cuando el modelo lo soporta (`minimal`, `low`, `medium`, `high` u `off`), por defecto `minimal`
- `GEMINI_GENAI_TRANSIENT_RETRY_ATTEMPTS`: opcional, intentos totales del SDK nuevo ante errores transitorios rápidos antes de fallback, por defecto `3`
- `GEMINI_GENAI_TRANSIENT_RETRY_BASE_DELAY_MS`: opcional, espera base entre reintentos transitorios de `genai`, por defecto `15000`
- `GEMINI_LEGACY_TRANSIENT_RETRY_ATTEMPTS`: opcional, intentos totales del SDK legacy ante errores transitorios rápidos antes de fallar el job, por defecto `3`
- `GEMINI_LEGACY_TRANSIENT_RETRY_BASE_DELAY_MS`: opcional, espera base entre reintentos transitorios de `legacy`, por defecto `15000`
- `GEMINI_PROMPT_CACHE_ENABLED`: opcional, activa el cache explicito del prompt Gemini, por defecto `true`
- `GEMINI_PROMPT_CACHE_USE_FOR_EXTRACTION`: opcional, usa `cachedContent` durante extracción cuando `GEMINI_EXTRACTION_SDK=genai` o `legacy-cache`; por defecto `false` para priorizar estabilidad
- `GEMINI_PROMPT_CACHE_AUTO_WARM_ENABLED`: opcional, calienta cache automáticamente durante extracción, por defecto `false`
- `GEMINI_PROMPT_CACHE_TRANSIENT_FALLBACK_TO_UNCACHED`: opcional, si el cache falla por un error transitorio intenta una extracción sin cache antes de reencolar, por defecto `false`
- `GEMINI_PROMPT_CACHE_TTL_SECONDS`: opcional, TTL del cache del prompt, por defecto `14400` (4 horas)
- `GEMINI_PROMPT_CACHE_FAILURE_COOLDOWN_SECONDS`: opcional, pausa nuevos intentos de crear cache si Gemini lo rechaza, por defecto `600`
- `GEMINI_PROMPT_CACHE_CREATE_TIMEOUT_MS`: opcional, timeout para crear cache, por defecto `60000`
- `PORT`: opcional, por defecto `3001`
- `TURSO_DATABASE_URL`: opcional, si quieres usar Turso remoto en lugar de archivo local
- `TURSO_AUTH_TOKEN`: opcional, requerido si `TURSO_DATABASE_URL` apunta a Turso remoto
- `MINIO_ROOT_USER`: opcional como referencia; el `docker-compose.yml` del repo mantiene credenciales internas fijas para MinIO
- `MINIO_ROOT_PASSWORD`: opcional como referencia; el `docker-compose.yml` del repo mantiene credenciales internas fijas para MinIO
- `MINIO_ENDPOINT`: opcional, endpoint MinIO/S3-compatible cuando no lo inyecta `docker-compose.yml`
- `MINIO_PORT`: opcional, puerto MinIO/S3-compatible, por defecto `9000`
- `MINIO_ACCESS_KEY`: opcional, access key para MinIO/S3-compatible; en el compose principal queda fija como variable interna del servicio
- `MINIO_SECRET_KEY`: opcional, secret key para MinIO/S3-compatible; en el compose principal queda fija como variable interna del servicio
- `MINIO_BUCKET`: opcional, bucket de PDFs, por defecto `smart-invoices`
- `MINIO_USE_SSL`: opcional, activa SSL para MinIO/S3-compatible
- `DOCUMENT_UPLOAD_MAX_BYTES`: opcional, tamaño máximo por PDF cargado a MinIO
- `DOCUMENT_UPLOAD_MAX_TOTAL_BYTES`: opcional, tamaño máximo por request de carga
- `DOCUMENT_WORKER_ENABLED`: opcional, activa/desactiva el worker de procesamiento IA
- `DOCUMENT_WORKER_POLL_MS`: opcional, intervalo de polling del worker
- `DOCUMENT_WORKER_CONCURRENCY`: opcional, documentos procesados por ciclo
- `DOCUMENT_WORKER_JOB_TIMEOUT_MS`: opcional, timeout por documento para evitar `PROCESSING` infinito
- `DOCUMENT_WORKER_STALE_PROCESSING_MS`: opcional, tiempo para reencolar jobs interrumpidos
- `API_KEY`: opcional, fallback legacy para Gemini si no se define `GEMINI_API_KEY`

## Desarrollo local

1. Instala dependencias con `npm install`
2. Configura `GEMINI_API_KEY`
3. Ejecuta `npm run dev`

Esto levanta:

- Vite en `http://localhost:5173`
- API Hono en `http://localhost:3001`

## Docker Local

- `npm run docker:up`: levanta el modo nuevo por defecto con `GEMINI_EXTRACTION_SDK=genai-router-files`
- `npm run docker:up:legacy`: levanta el baseline estable con `GEMINI_EXTRACTION_SDK=legacy`
- `npm run docker:up:genai-test`: levanta el SDK nuevo sin cache explicito, dejando que Gemini aplique cache implicito si corresponde
- `npm run docker:up:cache-test`: levanta un modo local de prueba con `GEMINI_EXTRACTION_SDK=genai` + `cachedContent`
- `npm run docker:up:legacy-cache-test`: levanta un modo local de prueba con `GEMINI_EXTRACTION_SDK=legacy-cache` + `cachedContent`
- `npm run docker:down`: baja los contenedores del stack local
- `npm run docker:config`: imprime la configuracion final de Compose para confirmar que el router-files quedo activo
- `npm run docker:config:genai-test`: imprime la configuracion final de Compose para confirmar que el modo genai quedo activo
- `npm run docker:config:cache-test`: imprime la configuracion final de Compose para confirmar que el modo cache quedo activo

El `docker-compose.yml` ahora arranca en `genai-router-files` si no defines `GEMINI_EXTRACTION_SDK`. En producción, el modo recomendado queda sin fallback automático a legacy. Si cambias valores en `.env`, vuelve a levantar el stack con rebuild para que el contenedor use la nueva configuracion.

### GenAI Test Local

El override [docker-compose.genai-test.yml](</C:/Users/hmart/Documents/smart-logistics-extractor-(ai)-facturas/docker-compose.genai-test.yml:1>) usa el SDK nuevo sin cache explicito. Este modo sirve para validar si `@google/genai` funciona estable y si Gemini reporta cache implicito en `usageMetadata`, sin pagar storage de `cachedContent`.

- `GEMINI_EXTRACTION_SDK=genai`
- `GEMINI_PROMPT_CACHE_USE_FOR_EXTRACTION=false`
- `GEMINI_PROMPT_CACHE_AUTO_WARM_ENABLED=false`
- `GEMINI_EXTRACTION_FALLBACK_TO_LEGACY_ON_TRANSIENT_ERROR=true`
- `DOCUMENT_WORKER_CONCURRENCY=5` por defecto para validar el flujo encolado igual que legacy
- `GEMINI_GENAI_TRANSIENT_RETRY_ATTEMPTS=3` para no abandonar `genai` al primer `503`
- `DOCUMENT_WORKER_JOB_TIMEOUT_MS=420000` para dar margen al fallback legacy si `genai` consume tiempo

Comandos recomendados:

```bash
npm run docker:down
npm run docker:up:genai-test
```

En F12 deberias ver:

- `SDK: genai`
- `CACHE CONFIG useForExtraction: false`
- `cacheMode` como `uncached-cache-bypassed`
- `cachedContentTokenCount` puede aparecer si Gemini aplica cache implicito automaticamente

Para aislar errores con un solo PDF a la vez:

```bash
GENAI_TEST_DOCUMENT_WORKER_CONCURRENCY=1 npm run docker:up:genai-test
```

### Router Files Test Local

El modo `genai-router-files` usa el SDK nuevo sin cache y ahora es el default de Docker: sube el PDF una vez con Gemini Files API, clasifica el formato con `GEMINI_ROUTER_MODEL_ID`, extrae con `GEMINI_ROUTER_EXTRACTOR_MODEL_ID` y borra el archivo remoto en `finally`.

Para probarlo en el worker ya no necesitas definir `GEMINI_EXTRACTION_SDK` si usas `npm run docker:up`; estas variables quedan como referencia para validar o ajustar:

```bash
GEMINI_EXTRACTION_SDK=genai-router-files
GEMINI_ROUTER_MODEL_ID=gemini-3.1-flash-lite
GEMINI_ROUTER_EXTRACTOR_MODEL_ID=gemini-3-flash-preview
GEMINI_ROUTER_CLASSIFIER_MEDIA_RESOLUTION=medium
GEMINI_ROUTER_CLASSIFIER_THINKING_LEVEL=medium
GEMINI_ROUTER_CLASSIFIER_CONFIDENCE_THRESHOLD=0.7
```

El clasificador usa `mediaResolution=medium` y `thinkingLevel=medium` desde el primer intento para mantener buen OCR con menor costo. El extractor especializado sigue en `medium`, así que el flujo productivo queda consistente en costo y calidad.

Para comparar manualmente el mismo PDF contra legacy sin cambiar jobs ni persistir resultados, llama `POST /api/ai/compare` con `multipart/form-data` (`file`, `format`) y `X-Session-Id`. La respuesta incluye `legacy.result`, `genaiRouterFiles.result`, métricas por modo y `diff.summary` con diferencias críticas.

### Cache Test Local

El override [docker-compose.cache-test.yml](</C:/Users/hmart/Documents/smart-logistics-extractor-(ai)-facturas/docker-compose.cache-test.yml:1>) activa estas banderas para probar cache fuera del modo router-files por defecto:

- `GEMINI_EXTRACTION_SDK=genai`
- `GEMINI_EXTRACTION_FALLBACK_TO_LEGACY_ON_TRANSIENT_ERROR=true`
- `GEMINI_PROMPT_CACHE_USE_FOR_EXTRACTION=true`
- `GEMINI_PROMPT_CACHE_AUTO_WARM_ENABLED=true`
- `GEMINI_PROMPT_CACHE_TRANSIENT_FALLBACK_TO_UNCACHED=true`
- `GEMINI_PROMPT_CACHE_TTL_SECONDS=900`
- `DOCUMENT_WORKER_CONCURRENCY=1` por defecto para separar problemas de cache de errores temporales por alta demanda

Comandos recomendados:

```bash
npm run docker:down
npm run docker:up:cache-test
```

Luego valida en F12 que el backend realmente arranco en modo cache:

```js
fetch('/api/ai/cache-status', {
  headers: { 'X-Session-Id': localStorage.getItem('smart-invoice-ai.sessionId') || '' },
})
  .then((r) => r.json())
  .then((d) => {
    console.log('MODEL:', d.extractionConfig?.model);
    console.log('SDK:', d.extractionConfig?.extractionSdk);
    console.log('TIMEOUTS:', {
      generateTimeoutMs: d.extractionConfig?.generateTimeoutMs,
      cachedGenerateTimeoutMs: d.extractionConfig?.cachedGenerateTimeoutMs,
    });
    console.log('CACHE CONFIG:', d.config);
    console.log('PROMPT CACHES:', d.promptCaches);
    console.log('WORKER:', d.workerConfig);
    console.table(d.recentExtractions);
  });
```

Si el modo cache quedo bien activo, deberias ver:

- `SDK: genai`
- `CACHE CONFIG useForExtraction: true`
- `CACHE CONFIG autoWarmEnabled: true`
- `cacheMode` en `recentExtractions` como `explicit-cache-hit`, `explicit-cache-created`, `explicit-cache-waited` o `uncached-cache-warming`
- `cacheMode` como `uncached-cache-fallback` cuando `cachedContent` fallo y el modo de prueba intento una extracción sin cache
- `cacheMode` como `legacy-fallback-after-genai-transient` cuando `genai` fallo por alta demanda y el modo de prueba salvo el documento con legacy

Si sigue saliendo `SDK: legacy`, el backend no fue reiniciado con el override correcto.

Para probar mas paralelismo en cache-test despues de validar 1 PDF estable:

```bash
CACHE_TEST_DOCUMENT_WORKER_CONCURRENCY=2 npm run docker:up:cache-test
```

### Legacy Cache Test Local

El override [docker-compose.legacy-cache-test.yml](</C:/Users/hmart/Documents/smart-logistics-extractor-(ai)-facturas/docker-compose.legacy-cache-test.yml:1>) prueba cache explicito con el SDK legacy. Mantiene el mismo flujo encolado que el modo estable: hasta 40 PDFs cargados y `DOCUMENT_WORKER_CONCURRENCY=5` por defecto.

- `GEMINI_EXTRACTION_SDK=legacy-cache`
- `GEMINI_PROMPT_CACHE_USE_FOR_EXTRACTION=true`
- `GEMINI_PROMPT_CACHE_AUTO_WARM_ENABLED=false`
- `GEMINI_PROMPT_CACHE_TTL_SECONDS=900`
- `DOCUMENT_WORKER_CONCURRENCY=5`
- `GEMINI_LEGACY_TRANSIENT_RETRY_ATTEMPTS=3`
- Si crear o usar cache falla, cae a legacy directo con `cacheMode=legacy-cache-fallback-direct`

Comandos recomendados:

```bash
npm run docker:down
npm run docker:up:legacy-cache-test
```

En F12 deberias ver:

- `SDK: legacy-cache`
- `CACHE CONFIG useForExtraction: true`
- `PROMPT CACHES` con `cacheKey` empezando por `legacy-cache:`
- `cacheMode` como `legacy-explicit-cache-created`, `legacy-explicit-cache-hit`, `legacy-explicit-cache-waited` o `legacy-cache-fallback-direct`
- `WORKER concurrency: 5`

Para aislar errores con un solo PDF:

```bash
LEGACY_CACHE_TEST_DOCUMENT_WORKER_CONCURRENCY=1 npm run docker:up:legacy-cache-test
```

## Producción / Coolify

- Build: `npm run build`
- Start: `npm run start`
- La app sirve SPA + API desde el mismo proceso
- El worker backend procesa jobs `QUEUED` desde MinIO sin depender del navegador
- La extracción IA devuelve `confidenceScore` y puede incluir `confidenceReasons`; el backend revalida discrepancias matemáticas antes de persistir el score final
- Diagnóstico de cache Gemini: `GET /api/ai/cache-status` y `POST /api/ai/cache-warm` usando `X-Session-Id`
- Por defecto en Docker, `GEMINI_EXTRACTION_SDK=genai-router-files` procesa cada PDF con Files API, clasificador y extractor especializado sin cache.
- Por defecto en producción, `GEMINI_EXTRACTION_FALLBACK_TO_LEGACY_ON_TRANSIENT_ERROR=false`; el fallback a legacy queda reservado para pruebas locales controladas.
- Para rollback o comparación, `npm run docker:up:legacy` fuerza `GEMINI_EXTRACTION_SDK=legacy` y procesa cada PDF con el SDK anterior y el prompt completo mejorado.
- `POST /api/documents/process` solo prepara cache del prompt si `GEMINI_EXTRACTION_SDK=genai` o `legacy-cache` y `GEMINI_PROMPT_CACHE_USE_FOR_EXTRACTION=true`; el cache queda opt-in hasta completar pruebas de confiabilidad con PDFs.
- Monta persistencia en `/app/data` si usas la BD local
- El repositorio incluye `Dockerfile`, `docker-compose.yml`, `.dockerignore` y `.env.example`
- La receta operativa completa está en `docs/CoolifyDeployment.md`
- El registro rapido de decisiones productivas, limites y ajustes recientes esta en `docs/ProductionReadinessNotes.md`

### Configuración Exacta en Coolify

Usa estos valores literalmente:

| Campo Coolify                | Valor                     |
| ---------------------------- | ------------------------- |
| **Build Pack**               | `Docker Compose`          |
| **Compose File**             | `./docker-compose.yml`    |
| **Build Command**            | no aplica si usas Compose |
| **Start Command**            | no aplica si usas Compose |
| **Port**                     | `3001`                    |
| **Healthcheck Path**         | `/api/ready`              |
| **Persistent Volume**        | `/app/data`               |
| **Node Version recomendada** | `20`                      |

Si prefieres Nixpacks, usa como fallback:

- Build Command: `npm run build`
- Start Command: `npm run start`

### Variables recomendadas para Coolify

| Variable                                                  | Valor ejemplo                                   | Obligatoria                            |
| --------------------------------------------------------- | ----------------------------------------------- | -------------------------------------- |
| `PORT`                                                    | `3001`                                          | No                                     |
| `GEMINI_API_KEY`                                          | `tu-api-key`                                    | Sí                                     |
| `GEMINI_MODEL_ID`                                         | `gemini-3-flash-preview`                        | No                                     |
| `GEMINI_EXTRACTION_SDK`                                   | `genai-router-files`                            | No                                     |
| `GEMINI_EXTRACTION_PROMPT_PROFILE`                        | `full`                                          | No                                     |
| `GEMINI_EXTRACTION_FALLBACK_TO_LEGACY_ON_TRANSIENT_ERROR` | `false`                                         | No                                     |
| `GEMINI_GENERATE_TIMEOUT_MS`                              | `180000`                                        | No                                     |
| `GEMINI_CACHED_GENERATE_TIMEOUT_MS`                       | `180000`                                        | No                                     |
| `GEMINI_MAX_OUTPUT_TOKENS`                                | `4096`                                          | No                                     |
| `GEMINI_ROUTER_MODEL_ID`                                  | `gemini-3.1-flash-lite`                         | No                                     |
| `GEMINI_ROUTER_EXTRACTOR_MODEL_ID`                        | `gemini-3-flash-preview`                        | No                                     |
| `GEMINI_ROUTER_CLASSIFIER_CONFIDENCE_THRESHOLD`           | `0.7`                                           | No                                     |
| `GEMINI_ROUTER_CLASSIFIER_MAX_OUTPUT_TOKENS`              | `512`                                           | No                                     |
| `GEMINI_ROUTER_CLASSIFIER_MEDIA_RESOLUTION`               | `medium`                                        | No                                     |
| `GEMINI_ROUTER_CLASSIFIER_THINKING_LEVEL`                 | `medium`                                        | No                                     |
| `GEMINI_ROUTER_CLASSIFIER_TIMEOUT_MS`                     | `45000`                                         | No                                     |
| `GEMINI_ROUTER_EXTRACTOR_TIMEOUT_MS`                      | `180000`                                        | No                                     |
| `GEMINI_THINKING_LEVEL`                                   | `minimal`                                       | No                                     |
| `GEMINI_GENAI_TRANSIENT_RETRY_ATTEMPTS`                   | `3`                                             | No                                     |
| `GEMINI_GENAI_TRANSIENT_RETRY_BASE_DELAY_MS`              | `15000`                                         | No                                     |
| `GEMINI_LEGACY_TRANSIENT_RETRY_ATTEMPTS`                  | `3`                                             | No                                     |
| `GEMINI_LEGACY_TRANSIENT_RETRY_BASE_DELAY_MS`             | `15000`                                         | No                                     |
| `GEMINI_PROMPT_CACHE_ENABLED`                             | `true`                                          | No                                     |
| `GEMINI_PROMPT_CACHE_USE_FOR_EXTRACTION`                  | `false`                                         | No                                     |
| `GEMINI_PROMPT_CACHE_AUTO_WARM_ENABLED`                   | `false`                                         | No                                     |
| `GEMINI_PROMPT_CACHE_TRANSIENT_FALLBACK_TO_UNCACHED`      | `false`                                         | No                                     |
| `GEMINI_PROMPT_CACHE_TTL_SECONDS`                         | `14400`                                         | No                                     |
| `GEMINI_PROMPT_CACHE_FAILURE_COOLDOWN_SECONDS`            | `600`                                           | No                                     |
| `GEMINI_PROMPT_CACHE_CREATE_TIMEOUT_MS`                   | `60000`                                         | No                                     |
| `TURSO_DATABASE_URL`                                      | `file:./data/smart-invoice.db` o `libsql://...` | No                                     |
| `TURSO_AUTH_TOKEN`                                        | `token-remoto`                                  | Solo si usas Turso remoto              |
| `MINIO_ROOT_USER`                                         | `usuario-minio-interno`                         | No, referencia si parametrizas Compose |
| `MINIO_ROOT_PASSWORD`                                     | `password-fuerte`                               | No, referencia si parametrizas Compose |
| `MINIO_ENDPOINT`                                          | `minio` o hostname S3-compatible                | No, lo inyecta Compose                 |
| `MINIO_PORT`                                              | `9000`                                          | No                                     |
| `MINIO_ACCESS_KEY`                                        | `usuario-minio-interno`                         | No, fijo dentro del Compose principal  |
| `MINIO_SECRET_KEY`                                        | `password-fuerte`                               | No, fijo dentro del Compose principal  |
| `MINIO_BUCKET`                                            | `smart-invoices`                                | No                                     |
| `MINIO_USE_SSL`                                           | `false`                                         | No                                     |
| `DOCUMENT_UPLOAD_MAX_BYTES`                               | `26214400`                                      | No                                     |
| `DOCUMENT_UPLOAD_MAX_TOTAL_BYTES`                         | `104857600`                                     | No                                     |
| `DOCUMENT_WORKER_ENABLED`                                 | `true`                                          | No                                     |
| `DOCUMENT_WORKER_POLL_MS`                                 | `7000`                                          | No                                     |
| `DOCUMENT_WORKER_CONCURRENCY`                             | `5`                                             | No                                     |
| `DOCUMENT_WORKER_JOB_TIMEOUT_MS`                          | `300000`                                        | No                                     |
| `DOCUMENT_WORKER_STALE_PROCESSING_MS`                     | `2100000`                                       | No                                     |
| `API_KEY`                                                 | `tu-api-key`                                    | No, fallback legacy                    |

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
7. Verifica el readiness check en `/api/ready`; `/api/health` queda como liveness básico
8. Ejecuta `npm run db:seed` solo si necesitas rehidratar una base nueva
9. No expongas Vite dev server en producción; solo el proceso de Hono
10. Si mantienes BD local, asegúrate de incluir backup periódico del volumen

### Receta final recomendada

1. Copia los valores de `.env.example` a las variables del servicio en Coolify.
2. Monta un volumen persistente en `/app/data`.
3. Despliega usando `docker-compose.yml`.
4. Confirma `200 OK` en `/api/health` y `/api/ready`.
5. Si la base nació vacía, entra con `admin@smart.com / 1234` y cambia la contraseña antes de compartir la URL.
6. Valida login, agencias y extracción IA.
7. Verifica que integraciones externas rechacen `localhost`, `127.0.0.1` y redes privadas.
8. Verifica un caso de baja confianza donde Gemini reporte motivos y el backend conserve solo discrepancias matemáticas confirmadas.
9. Verifica que `50.5` y `50.50` no disparen `VALUE_TOTAL_MISMATCH`.

### Healthchecks

- `GET /api/health`: liveness simple del proceso HTTP.
- `GET /api/ready`: readiness de producción; valida base de datos, MinIO y worker documental.

Docker y Coolify usan `/api/ready` para evitar marcar sano un contenedor que todavía no puede procesar documentos.

### Backup mínimo

- Respaldar juntos los volúmenes `app_data` y `minio_data`.
- Probar restore levantando un entorno temporal y validando `/api/ready`, login, historial y preview de PDF.
- Si usas Turso remoto, respaldar Turso por separado y mantener `minio_data` como evidencia/documentos.

Detalle completo: `docs/CoolifyDeployment.md` y `docs/ProductionReadinessNotes.md`

### Riesgo pendiente conocido

- Quedan 2 vulnerabilidades moderadas asociadas a `esbuild` vía `vite`; afectan el servidor de desarrollo y requieren salto a `vite@8` para resolverlas por completo sin parche manual.

## Mantenibilidad actual

- Backend separado por dominios en `server/routes/*`
- Seguridad centralizada en `server/security.ts`
- Esquema y seed centralizados en `server/schema.ts` y `server/seed.ts`
- Cliente HTTP centralizado en `services/apiClient.ts`
- Documentación técnica principal en `docs/DatabaseSchema.md`
- Registro de readiness/produccion en `docs/ProductionReadinessNotes.md`

## Documentacion clave

- `docs/ProductionReadinessNotes.md`
- `docs/DatabaseSchema.md`
- `docs/GuiaReplicacionArquitectura.md`
- `docs/AIAgentsFutureUpgradePlan.md`
- `docs/GuiaEvolucionArquitecturaIA.md`

## Utilidades

- Ejecutar seed manual: `npm run db:seed`
