# Production Readiness Notes

Documento vivo para consultar rapido que quedo endurecido, que limites existen y que decisiones operativas NO se cambiaron antes de produccion.

## Resumen ejecutivo

- El despliegue recomendado sigue siendo Docker Compose + Coolify, con Hono sirviendo API y SPA desde el mismo proceso.
- `GET /api/health` es liveness simple; `GET /api/ready` es readiness real para Docker/Coolify.
- La carga documental NO tiene rate limit por hora para no bloquear al operador en lotes grandes.
- La UI permite seleccionar hasta 200 PDFs por lote visible.
- El cliente sube esos PDFs en grupos internos de hasta 40 archivos para respetar el contrato del backend.
- El worker procesa en background con concurrencia controlada, por defecto 5 documentos a la vez.
- MinIO guarda PDFs; SQLite/libSQL guarda metadatos, estado, resultados y auditoria.
- Las integraciones externas tienen guardia contra endpoints locales/privados y redirecciones.
- Las credenciales seed `1234`, las credenciales internas de MinIO en Compose y la key local de Gemini NO fueron rotadas por decision operativa.

## Cambios aplicados

| Area                           | Estado actual                                                                                                                               | Archivos fuente                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Hardening HTTP                 | Agrega `X-Request-Id`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` y `Cross-Origin-Opener-Policy`. | `server/httpHardening.ts`, `server/index.ts`                                                  |
| Rate limits                    | Solo login, AI Review e integraciones externas. No aplica a carga/proceso/extraccion documental masiva.                                     | `server/index.ts`, `server/httpHardening.ts`                                                  |
| Readiness                      | `/api/ready` valida DB, MinIO y worker antes de declarar sano el contenedor.                                                                | `server/index.ts`, `Dockerfile`, `docker-compose.yml`, `docker-compose.yaml`                  |
| Upload masivo                  | La UI permite 200 PDFs; `apiClient` divide la subida en chunks de 40 archivos o hasta 90 MB por request.                                    | `components/DocumentProcessingWorkspace.tsx`, `services/apiClient.ts`                         |
| Limites tecnicos de documentos | Backend mantiene 40 archivos por request, 25 MB por PDF, 100 MB por request y 200 jobs por `process`.                                       | `server/routes/documents.ts`                                                                  |
| Worker documental              | Procesa cola `QUEUED` desde MinIO, con concurrencia controlada por env.                                                                     | `server/workers/documentWorker.ts`                                                            |
| Integraciones externas         | Bloquea localhost/redes privadas/reservadas, no sigue redirects y guarda log de errores.                                                    | `server/services/egressGuard.ts`, `shared/integrationConfig.ts`, `server/routes/integrate.ts` |
| Dashboard consumo              | La barra mensual usa documentos procesados del mes en vez del uso historico fijo de agencia.                                                | `components/DashboardHome.tsx`                                                                |
| Dependencias                   | Actualizadas librerias principales y overrides para `tmp`, `uuid`, `ws`.                                                                    | `package.json`, `package-lock.json`                                                           |

## Decisiones que NO se cambiaron

Estas decisiones se dejaron asi porque el entorno local/productivo aun depende de ellas:

- No se parametrizaron las credenciales internas de MinIO en `docker-compose.yml`.
- No se roto la key local de Gemini.
- No se bloqueo el seed productivo con `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`.
- Una DB nueva sigue creando `admin@smart.com`, `operador@smart.com` y `supervisor@smart.com` con password inicial `1234`.
- En produccion, si la DB nace vacia, entrar con `admin@smart.com / 1234` y cambiar la contraseña antes de compartir la URL.
- Si la DB ya existia, el seed es idempotente y no resetea contraseñas existentes.

## Rate limits actuales

| Ruta                          | Limite                                | Motivo                                                 |
| ----------------------------- | ------------------------------------- | ------------------------------------------------------ |
| `POST /api/auth/login`        | 20 requests / 15 min por IP + session | Evitar fuerza bruta de login.                          |
| `/api/ai-review/*`            | 30 requests / hora por IP + session   | Ruta admin/costosa, no flujo operativo masivo.         |
| `/api/prompt-lab/*`           | 100 requests / hora por IP + session  | Laboratorio admin para pruebas repetidas de facturas.  |
| `/api/integrate/*`            | 120 requests / hora por IP + session  | Protege llamadas salientes a terceros.                 |
| `POST /api/documents/upload`  | Sin rate limit HTTP por hora          | El operador puede subir muchos documentos.             |
| `POST /api/documents/process` | Sin rate limit HTTP por hora          | El operador puede enviar lotes grandes a cola.         |
| `POST /api/ai/extract`        | Sin rate limit HTTP por hora          | Mantiene compatibilidad con flujo directo/diagnostico. |

Nota: "sin rate limit HTTP por hora" no significa sin control. El control real esta en tamaño, cantidad por request y worker en cola.

## Limites tecnicos de carga documental

| Limite                            | Valor actual        | Donde vive                                   | Para que sirve                                         |
| --------------------------------- | ------------------- | -------------------------------------------- | ------------------------------------------------------ |
| Seleccion visible en UI           | 200 PDFs por lote   | `components/DocumentProcessingWorkspace.tsx` | Ergonomia del operador y compatibilidad con `process`. |
| Chunk de subida del cliente       | 40 PDFs por request | `services/apiClient.ts`                      | Respeta backend y evita requests gigantes.             |
| Presupuesto por chunk cliente     | 90 MB por request   | `services/apiClient.ts`                      | Margen bajo el maximo backend de 100 MB.               |
| Maximo backend por PDF            | 25 MB por defecto   | `DOCUMENT_UPLOAD_MAX_BYTES`                  | Evita PDFs enormes por archivo.                        |
| Maximo backend por request        | 100 MB por defecto  | `DOCUMENT_UPLOAD_MAX_TOTAL_BYTES`            | Evita saturar memoria/red en una sola request.         |
| Maximo backend por upload request | 40 PDFs             | `server/routes/documents.ts`                 | Mantiene payloads acotados.                            |
| Maximo jobs por process request   | 200 jobs            | `server/routes/documents.ts`                 | Coincide con lote visible de la UI.                    |
| Concurrencia worker               | 5 por defecto       | `DOCUMENT_WORKER_CONCURRENCY`                | Controla costo, CPU, IO y presion sobre Gemini.        |

Si se necesita permitir mas de 200 documentos en una sola seleccion, ajustar juntos:

1. `MAX_FILES` en `components/DocumentProcessingWorkspace.tsx`.
2. `MAX_JOB_IDS_PER_REQUEST` o procesar por `batchId` en `server/routes/documents.ts`.
3. Las consultas `limit: 200` del workspace para que la UI pueda listar todo el lote.
4. Pruebas manuales de memoria y tiempo con MinIO + worker.

## Healthchecks

- `GET /api/health`: solo confirma que el proceso HTTP responde.
- `GET /api/ready`: confirma que DB responde, MinIO esta configurado/bucket disponible y el worker esta activo si `DOCUMENT_WORKER_ENABLED=true`.
- Dockerfile y Compose usan `/api/ready`.
- En local sin MinIO completo, `/api/ready` puede devolver `503`; para liveness basico usar `/api/health`.

## Integraciones externas

La app permite configurar endpoints externos por agencia, pero ahora valida destino antes de hacer `fetch`:

- Rechaza `localhost`, `*.localhost`, loopback, link-local, redes privadas y rangos reservados.
- Resuelve DNS y bloquea IPs privadas/reservadas aunque el hostname parezca publico.
- No sigue redirecciones (`redirect: manual`).
- Si el endpoint responde 3xx, se marca como error porque la redireccion podria terminar en un destino no permitido.
- El mensaje al usuario es generico; el detalle tecnico queda en logs y tabla de integraciones.

Esto reduce riesgo SSRF y evita que una configuracion maliciosa use el servidor como puente hacia servicios internos.

## Seguridad pendiente y riesgos aceptados

- El seed inicial `1234` sigue existiendo para una DB nueva. Mitigacion operativa: cambiar password inmediatamente en el primer acceso productivo.
- Las credenciales internas de MinIO siguen fijas en Compose. Mitigacion actual: no exponer puertos de MinIO publicamente y mantenerlo en red interna Docker.
- `npm audit --omit=dev --audit-level=moderate` pasa sin vulnerabilidades productivas.
- `npm audit --audit-level=moderate` completo reporta vulnerabilidades moderadas dev-only via Vite/esbuild; corregirlo fuerza salto mayor de Vite, pendiente para una iteracion separada.
- `npm run docker:config` puede imprimir variables resueltas, incluida la key Gemini local. No pegar esa salida en tickets, chats ni repos publicos.

## Checklist rapido antes de push/deploy

```bash
npm run check
npm run test:integration
npm run test:router
npm run build
npm run scan-secrets
npm audit --omit=dev --audit-level=moderate
```

Validaciones manuales recomendadas en Coolify:

1. `/api/health` responde `200`.
2. `/api/ready` responde `200`.
3. Login funciona.
4. Si la DB es nueva, cambiar password de `admin@smart.com`.
5. Subir un lote de PDFs y confirmar estados `UPLOADED -> QUEUED -> PROCESSING -> SUCCESS/ERROR`.
6. Probar preview de PDF desde historial/storage.
7. Probar que una integracion con `localhost` o IP privada sea rechazada.
8. Confirmar que MinIO no esta expuesto publicamente salvo decision explicita.

## Preguntas rapidas para futuros agentes

| Pregunta                                                | Respuesta corta                                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Que endpoint usa Coolify como healthcheck?              | `/api/ready`.                                                                            |
| Que revisa `/api/ready`?                                | DB, MinIO y worker documental.                                                           |
| Puede el operador subir 200 documentos?                 | Si, la UI permite 200 y el cliente los divide en chunks internos de 40.                  |
| Hay rate limit por hora para upload/proceso?            | No. Se quito para no bloquear operacion.                                                 |
| Donde esta el control de carga real?                    | Tamaño por PDF/request, chunking cliente y worker en cola.                               |
| Cuantos procesa el worker a la vez?                     | 5 por defecto, configurable con `DOCUMENT_WORKER_CONCURRENCY`.                           |
| Cuales rutas siguen con rate limit?                     | Login, AI Review, Prompt Lab e integraciones externas.                                   |
| Que credenciales seed existen en DB nueva?              | `admin@smart.com`, `operador@smart.com`, `supervisor@smart.com`, password `1234`.        |
| El seed resetea passwords en redeploy?                  | No, es idempotente si la DB ya existe.                                                   |
| Se rotaron claves Gemini?                               | No.                                                                                      |
| Se cambiaron credenciales MinIO Compose?                | No.                                                                                      |
| El cache Gemini esta activo para extraccion productiva? | No por defecto; `genai-router-files` no usa `cachedContent` en extraccion.               |
| Que hacer si `/api/ready` falla?                        | Revisar DB, MinIO, bucket y worker; usar `/api/health` solo para confirmar proceso vivo. |
| Donde revisar errores Gemini/costo?                     | Auditoria Gemini y `GET /api/ai/cache-status`.                                           |
| Donde estan los PDFs?                                   | MinIO bucket `smart-invoices` por defecto.                                               |
| Donde estan los metadatos/resultados?                   | SQLite/libSQL, tabla `document_jobs` y tablas de batch/auditoria.                        |

## Mapa de archivos

| Necesidad                                                | Archivo                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| Entrada del servidor, healthchecks, rate limits globales | `server/index.ts`                                               |
| Headers de seguridad y rate limiter in-memory            | `server/httpHardening.ts`                                       |
| Upload/proceso/listado de documentos                     | `server/routes/documents.ts`                                    |
| Worker de cola documental                                | `server/workers/documentWorker.ts`                              |
| Cliente HTTP y chunking de upload                        | `services/apiClient.ts`                                         |
| Pantalla de carga/procesamiento                          | `components/DocumentProcessingWorkspace.tsx`                    |
| MinIO/S3 service                                         | `server/services/minioService.ts`                               |
| Integraciones externas                                   | `server/routes/integrate.ts`                                    |
| Guardia SSRF/egress                                      | `server/services/egressGuard.ts`, `shared/integrationConfig.ts` |
| Deploy Coolify                                           | `docs/CoolifyDeployment.md`                                     |
| Esquema DB                                               | `docs/DatabaseSchema.md`                                        |
| Flujo arquitectonico                                     | `docs/ProcessFlowArchitecture.md`                               |

## Como evolucionar esto

- Si hay que aumentar throughput, primero medir cola, latencia Gemini, errores transitorios y consumo MinIO antes de subir `DOCUMENT_WORKER_CONCURRENCY`.
- Si hay que permitir lotes visibles mayores a 200, actualizar UI, process/list limits y pruebas de memoria.
- Si se exponen integraciones a clientes, mantener egress guard y considerar allowlist por dominio.
- Si se endurece el bootstrap productivo mas adelante, documentar el cambio en `README.md`, `docs/CoolifyDeployment.md`, `docs/DatabaseSchema.md` y este archivo.
- Si se parametrizan credenciales MinIO, actualizar Compose, `.env.example`, README, CoolifyDeployment y runbook de backups.
