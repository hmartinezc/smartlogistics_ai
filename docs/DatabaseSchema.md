# 📦 Smart Invoice AI — Esquema de Base de Datos

## Resumen de Arquitectura

| Componente        | Tecnología              | Descripción                         |
| ----------------- | ----------------------- | ----------------------------------- |
| **Frontend**      | React 18 + Vite 5       | SPA con TailwindCSS                 |
| **Backend API**   | Hono (Node.js)          | API REST ligera montada en `/api/*` |
| **Base de datos** | libSQL (Turso local)    | SQLite fork con WAL + foreign keys  |
| **Archivo DB**    | `data/smart-invoice.db` | Se crea al iniciar el servidor      |
| **Storage PDFs**  | MinIO / S3-compatible   | PDFs fuera de SQLite                |

### Modos de Base de Datos

| Variable de Entorno  | Efecto                                            |
| -------------------- | ------------------------------------------------- |
| _(sin variables)_    | Usa archivo local: `file:./data/smart-invoice.db` |
| `TURSO_DATABASE_URL` | Conecta a instancia Turso remota                  |
| `TURSO_AUTH_TOKEN`   | Token de autenticación para Turso remoto          |

---

## Diagrama de Relaciones (ER)

```
subscription_plans ────< agencies ────< agency_emails
                              │
                              ├────< batch_items
                              │       └──── document_processing_audit (referencia lógica por batch_item_id)
                              │
                              ├────< document_jobs (PDFs en MinIO, cola async)
                              │       └────< ai_review_items >──── ai_review_runs
                              │
                               ├────< integration_delivery_logs
                               │
                               ├────< booked_awb_records
                              │
                              ├────< product_matches ────< (product_match_master) (referencia lógica por producto)
                              │
                              └──── user_agencies >──── users ────< auth_sessions

Leyenda:
  ────<  = uno a muchos (1:N)
  >────  = muchos a muchos (M:N) via tabla puente
```

---

## Tablas

### 1. `subscription_plans` — Planes de Suscripción

Define los niveles de servicio disponibles para las agencias.

| Columna           | Tipo    | Restricción     | Descripción                         |
| ----------------- | ------- | --------------- | ----------------------------------- |
| `id`              | TEXT    | **PRIMARY KEY** | ID único (ej: `PLAN_BASIC`)         |
| `name`            | TEXT    | NOT NULL        | Nombre visible (ej: `Starter (5k)`) |
| `doc_limit`       | INTEGER | NOT NULL        | Límite de documentos del plan       |
| `base_cost`       | REAL    | NOT NULL        | Costo base mensual                  |
| `extra_page_cost` | REAL    | NOT NULL        | Costo por página extra              |

**Datos seed:** 3 planes — PLAN_BASIC (5k/525), PLAN_PRO (8k/600), PLAN_ENTERPRISE (15k/799)

---

### 2. `agencies` — Agencias / Clientes / Tenants

Cada agencia es un "tenant" del sistema con su propio plan y uso.

| Columna               | Tipo    | Restricción                                | Descripción                                                                         |
| --------------------- | ------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `id`                  | TEXT    | **PRIMARY KEY**                            | ID único (ej: `AGENCY_HQ`)                                                          |
| `name`                | TEXT    | NOT NULL                                   | Nombre de la agencia                                                                |
| `plan_id`             | TEXT    | NOT NULL, **FK** → `subscription_plans.id` | Plan asignado                                                                       |
| `current_usage`       | INTEGER | NOT NULL, DEFAULT 0                        | Documentos procesados en período actual                                             |
| `is_active`           | INTEGER | NOT NULL, DEFAULT 1                        | 1=activa, 0=suspendida                                                              |
| `hawb_format_pattern` | TEXT    | nullable                                   | Patrón opcional para normalizar HAWB al guardado inicial desde IA                   |
| `integration_config`  | TEXT    | nullable                                   | Configuración JSON de integración externa (endpoint, autenticación, field mappings) |
| `created_at`          | TEXT    | DEFAULT now                                | Fecha de creación                                                                   |
| `updated_at`          | TEXT    | DEFAULT now                                | Última modificación                                                                 |

**Datos seed:** AGENCY_HQ (SmartLogistics HQ, Enterprise), AGENCY_CLIENT_A (Flores Del Valle, Basic), AGENCY_CLIENT_B (Cargo Express, Pro)

---

### 3. `agency_emails` — Correos de Agencia

Emails asociados a cada agencia. Una agencia puede tener múltiples direcciones de correo.

| Columna     | Tipo    | Restricción                                        | Descripción         |
| ----------- | ------- | -------------------------------------------------- | ------------------- |
| `id`        | INTEGER | **PRIMARY KEY** AUTOINCREMENT                      | ID autoincremental  |
| `agency_id` | TEXT    | NOT NULL, **FK** → `agencies.id` ON DELETE CASCADE | Agencia propietaria |
| `email`     | TEXT    | NOT NULL                                           | Dirección de correo |

**Índice:** `idx_agency_emails_agency` en `agency_id`

---

### 4. `users` — Usuarios del Sistema

| Columna      | Tipo    | Restricción                                        | Descripción                   |
| ------------ | ------- | -------------------------------------------------- | ----------------------------- |
| `id`         | TEXT    | **PRIMARY KEY**                                    | ID único                      |
| `email`      | TEXT    | NOT NULL, **UNIQUE**                               | Email (login)                 |
| `password`   | TEXT    | NOT NULL                                           | Hash de contraseña (`scrypt`) |
| `name`       | TEXT    | NOT NULL                                           | Nombre completo               |
| `role`       | TEXT    | NOT NULL, CHECK(`ADMIN`, `OPERADOR`, `SUPERVISOR`) | Rol del usuario               |
| `is_active`  | INTEGER | NOT NULL, DEFAULT 1                                | 1=activo, 0=desactivado       |
| `created_at` | TEXT    | DEFAULT now                                        | Fecha de creación             |
| `updated_at` | TEXT    | DEFAULT now                                        | Última modificación           |

**Datos seed:** admin@smart.com (ADMIN), operador@smart.com (OPERADOR), supervisor@smart.com (SUPERVISOR) — todos con credencial inicial `1234`, almacenada como hash en la BD.

#### Roles y Permisos

| Rol          | Acceso                                                 |
| ------------ | ------------------------------------------------------ |
| `ADMIN`      | Todo: usuarios, agencias, configuración, procesamiento |
| `SUPERVISOR` | Agencias asignadas, ver resultados, panel operativo    |
| `OPERADOR`   | Solo procesamiento de facturas en agencias asignadas   |

---

### 5. `user_agencies` — Relación Usuario ↔ Agencia (M:N)

Tabla puente que permite asignar un usuario a múltiples agencias.

| Columna     | Tipo | Restricción                                      | Descripción      |
| ----------- | ---- | ------------------------------------------------ | ---------------- |
| `user_id`   | TEXT | **PK**, **FK** → `users.id` ON DELETE CASCADE    | ID del usuario   |
| `agency_id` | TEXT | **PK**, **FK** → `agencies.id` ON DELETE CASCADE | ID de la agencia |

**Índices:** `idx_user_agencies_user`, `idx_user_agencies_agency`

---

### 6. `auth_sessions` — Sesiones de Autenticación

Maneja sesiones con expiración de 8 horas.

| Columna      | Tipo | Restricción                                     | Descripción           |
| ------------ | ---- | ----------------------------------------------- | --------------------- |
| `id`         | TEXT | **PRIMARY KEY**                                 | UUID de la sesión     |
| `user_id`    | TEXT | NOT NULL, **FK** → `users.id` ON DELETE CASCADE | Usuario de la sesión  |
| `expires_at` | TEXT | NOT NULL                                        | Expiración (ISO 8601) |
| `created_at` | TEXT | DEFAULT now                                     | Fecha de creación     |

**Índice:** `idx_auth_sessions_user`

---

### 7. `batch_items` — Resultados de Procesamiento de Facturas

Cada fila es un documento procesado. El campo `result_json` guarda el `InvoiceData` completo como JSON, incluyendo `confidenceScore` y, cuando aplica, `confidenceReasons` y `confidenceAudit`.

| Columna        | Tipo | Restricción                                                  | Descripción                            |
| -------------- | ---- | ------------------------------------------------------------ | -------------------------------------- |
| `id`           | TEXT | **PRIMARY KEY**                                              | UUID del item                          |
| `file_name`    | TEXT | NOT NULL                                                     | Nombre del archivo original            |
| `status`       | TEXT | NOT NULL, CHECK(`PENDING`, `PROCESSING`, `SUCCESS`, `ERROR`) | Estado del procesamiento               |
| `result_json`  | TEXT | nullable                                                     | JSON con datos extraídos (InvoiceData) |
| `error`        | TEXT | nullable                                                     | Mensaje de error si falló              |
| `processed_at` | TEXT | nullable                                                     | Fecha de procesamiento                 |
| `user_email`   | TEXT | nullable                                                     | Email del usuario que procesó          |
| `agency_id`    | TEXT | **FK** → `agencies.id`                                       | Agencia propietaria                    |
| `created_at`   | TEXT | DEFAULT now                                                  | Fecha de creación                      |

**Índices:** `idx_batch_items_agency`, `idx_batch_items_status`, `idx_batch_items_agency_created` en `(agency_id, created_at DESC)`, `idx_batch_items_agency_status_processed` en `(agency_id, status, processed_at)`

---

### 8. `document_jobs` — Cola de Documentos PDF en MinIO

Cada fila representa un PDF cargado fuera de SQLite y preparado para procesamiento asíncrono. `object_key` apunta al archivo en MinIO; SQLite solo guarda metadatos, estado y resultado JSON.

| Columna              | Tipo    | Restricción                                                                | Descripción                                |
| -------------------- | ------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| `id`                 | TEXT    | **PRIMARY KEY**                                                            | UUID del job/documento                     |
| `batch_id`           | TEXT    | NOT NULL                                                                   | ID del lote de carga                       |
| `agency_id`          | TEXT    | NOT NULL, **FK** → `agencies.id` ON DELETE CASCADE                         | Agencia propietaria                        |
| `user_id`            | TEXT    | **FK** → `users.id` ON DELETE SET NULL                                     | Usuario que cargó el PDF                   |
| `user_email`         | TEXT    | nullable                                                                   | Email capturado al cargar                  |
| `user_name`          | TEXT    | nullable                                                                   | Nombre capturado al cargar                 |
| `status`             | TEXT    | CHECK(`UPLOADED`, `QUEUED`, `PROCESSING`, `SUCCESS`, `ERROR`, `CANCELLED`) | Estado del job                             |
| `storage_bucket`     | TEXT    | NOT NULL                                                                   | Bucket MinIO usado                         |
| `object_key`         | TEXT    | NOT NULL, **UNIQUE**                                                       | Ruta interna del PDF en MinIO              |
| `original_file_name` | TEXT    | NOT NULL                                                                   | Nombre original del archivo                |
| `file_size_bytes`    | INTEGER | NOT NULL, DEFAULT 0                                                        | Tamaño del PDF                             |
| `mime_type`          | TEXT    | NOT NULL, DEFAULT `application/pdf`                                        | MIME recibido                              |
| `extraction_format`  | TEXT    | NOT NULL, DEFAULT `AGENT_GENERIC_A`                                        | Formato/prompt de extracción               |
| `result_json`        | TEXT    | nullable                                                                   | JSON extraído cuando termina correctamente |
| `error`              | TEXT    | nullable                                                                   | Mensaje de error                           |
| `retry_count`        | INTEGER | NOT NULL, DEFAULT 0                                                        | Reintentos consumidos                      |
| `max_retries`        | INTEGER | NOT NULL, DEFAULT 3                                                        | Límite de reintentos                       |
| `locked_by`          | TEXT    | nullable                                                                   | ID interno del worker que reclamó el job   |
| `lock_expires_at`    | TEXT    | nullable                                                                   | Vencimiento del lease del worker           |
| `queued_at`          | TEXT    | nullable                                                                   | Fecha en que se puso en cola               |
| `started_at`         | TEXT    | nullable                                                                   | Fecha en que el worker inició              |
| `processed_at`       | TEXT    | nullable                                                                   | Fecha final de procesamiento               |
| `created_at`         | TEXT    | DEFAULT now                                                                | Fecha de carga                             |
| `updated_at`         | TEXT    | DEFAULT now                                                                | Última actualización                       |

**Índices:** `idx_document_jobs_batch`, `idx_document_jobs_agency_status`, `idx_document_jobs_status_created`, `idx_document_jobs_status_lock`, `idx_document_jobs_user_created`

---

### 9. `document_processing_audit` — Auditoría de Procesamiento de PDFs

Cada fila representa un documento PDF terminado (`SUCCESS` o `ERROR`) para fines de auditoría, métricas y facturación. Esta tabla es independiente de `batch_items`: si se limpian los datos extraídos, el histórico contable permanece.

| Columna          | Tipo    | Restricción               | Descripción                        |
| ---------------- | ------- | ------------------------- | ---------------------------------- |
| `id`             | TEXT    | **PRIMARY KEY**           | ID del registro de auditoría       |
| `batch_item_id`  | TEXT    | NOT NULL, **UNIQUE**      | ID lógico del item procesado       |
| `file_name`      | TEXT    | NOT NULL                  | Nombre del PDF original            |
| `agency_id`      | TEXT    | NOT NULL                  | Agencia propietaria                |
| `agency_name`    | TEXT    | nullable                  | Nombre de agencia al procesar      |
| `status`         | TEXT    | CHECK(`SUCCESS`, `ERROR`) | Resultado de la extracción         |
| `extraction_ok`  | INTEGER | CHECK(0, 1)               | 1 si fue correcta, 0 si falló      |
| `error`          | TEXT    | nullable                  | Mensaje de error si falló          |
| `processed_at`   | TEXT    | NOT NULL                  | Fecha/hora exacta de procesamiento |
| `processed_date` | TEXT    | NOT NULL                  | Fecha `YYYY-MM-DD` para reportes   |
| `user_id`        | TEXT    | nullable                  | Usuario autenticado que procesó    |
| `user_email`     | TEXT    | nullable                  | Email del usuario autenticado      |
| `user_name`      | TEXT    | nullable                  | Nombre del usuario autenticado     |
| `source`         | TEXT    | NOT NULL                  | Origen del registro                |
| `created_at`     | TEXT    | DEFAULT now               | Fecha de creación                  |
| `updated_at`     | TEXT    | DEFAULT now               | Última actualización               |

**Índices:** `idx_document_audit_agency_date`, `idx_document_audit_date`, `idx_document_audit_status`, `idx_document_audit_user_date`

**Backfill:** durante `runMigrations`, se insertan de forma idempotente los registros históricos existentes en `batch_items` que estén en estado `SUCCESS` o `ERROR`.

---

### 10. `booked_awb_records` — AWBs Reservados (Panel Operativo)

Registros de AWBs reservados para la conciliación operativa.

| Columna          | Tipo    | Restricción                      | Descripción                  |
| ---------------- | ------- | -------------------------------- | ---------------------------- |
| `id`             | INTEGER | **PRIMARY KEY** AUTOINCREMENT    | ID                           |
| `mawb`           | TEXT    | NOT NULL                         | Número de guía madre         |
| `booked_hijas`   | INTEGER | NOT NULL, DEFAULT 0              | Cantidad de hijas reservadas |
| `booked_pieces`  | INTEGER | NOT NULL, DEFAULT 0              | Piezas reservadas            |
| `booked_fulls`   | REAL    | NOT NULL, DEFAULT 0              | Fulls reservados             |
| `operation_date` | TEXT    | NOT NULL                         | Fecha de operación           |
| `agency_id`      | TEXT    | NOT NULL, **FK** → `agencies.id` | Agencia propietaria          |

**Constraint UNIQUE:** `(mawb, operation_date, agency_id)` — evita duplicados por MAWB+fecha+agencia  
**Índice:** `idx_booked_awb_date` en `(operation_date, agency_id)`

---

### 11. `product_matches` — Match de Productos por Agencia

Permite a cada agencia mapear sus códigos de producto internos a los del catálogo maestro.

| Columna               | Tipo | Restricción                                        | Descripción            |
| --------------------- | ---- | -------------------------------------------------- | ---------------------- |
| `id`                  | TEXT | **PRIMARY KEY**                                    | ID único               |
| `agency_id`           | TEXT | NOT NULL, **FK** → `agencies.id` ON DELETE CASCADE | Agencia propietaria    |
| `category`            | TEXT | NOT NULL, DEFAULT ''                               | Categoría del producto |
| `product`             | TEXT | NOT NULL                                           | Nombre del producto    |
| `client_product_code` | TEXT | NOT NULL, DEFAULT ''                               | Código del cliente     |
| `product_match`       | TEXT | NOT NULL, DEFAULT ''                               | Producto equivalente   |
| `hts`                 | TEXT | NOT NULL, DEFAULT ''                               | Código HTS original    |
| `hts_match`           | TEXT | NOT NULL, DEFAULT ''                               | Código HTS equivalente |
| `created_at`          | TEXT | DEFAULT now                                        | Fecha de creación      |
| `updated_at`          | TEXT | DEFAULT now                                        | Última modificación    |

**Constraint UNIQUE:** `(agency_id, product)`  
**Índices:** `idx_product_matches_agency`, `idx_product_matches_agency_product`

---

### 12. `product_match_master` — Catálogo Maestro de Match de Productos

Catálogo global de productos con sus equivalencias estándar, usado como referencia para el matching por agencia.

| Columna               | Tipo    | Restricción          | Descripción                 |
| --------------------- | ------- | -------------------- | --------------------------- |
| `id`                  | TEXT    | **PRIMARY KEY**      | ID único                    |
| `product`             | TEXT    | NOT NULL             | Nombre del producto         |
| `client_product_code` | TEXT    | NOT NULL, DEFAULT '' | Código del cliente          |
| `product_match`       | TEXT    | NOT NULL, DEFAULT '' | Producto equivalente        |
| `hts_match`           | TEXT    | NOT NULL, DEFAULT '' | Código HTS equivalente      |
| `source_order`        | INTEGER | NOT NULL             | Orden de prioridad (fuente) |
| `created_at`          | TEXT    | DEFAULT now          | Fecha de creación           |
| `updated_at`          | TEXT    | DEFAULT now          | Última modificación         |

**Índice:** `idx_product_match_master_product`

---

### 13. `ai_prompt_snapshots` — Snapshots de Prompts AutoPilot AI

Guarda copias trazables de prompts usados por AutoPilot AI. Es aditiva y no cambia prompts activos.

| Columna           | Tipo | Restricción     | Descripción                              |
| ----------------- | ---- | --------------- | ---------------------------------------- |
| `id`              | TEXT | **PRIMARY KEY** | ID determinístico del snapshot           |
| `prompt_hash`     | TEXT | NOT NULL        | Hash corto registrado por observabilidad |
| `prompt_kind`     | TEXT | NOT NULL        | `classifier`, `extractor`, etc.          |
| `agent_type`      | TEXT | nullable        | Agente/formato asociado                  |
| `router_category` | TEXT | nullable        | Categoría visual del router              |
| `model`           | TEXT | NOT NULL        | Modelo asociado al evento                |
| `prompt_profile`  | TEXT | nullable        | Perfil `full`/`compact` cuando aplica    |
| `prompt_text`     | TEXT | NOT NULL        | Texto del prompt                         |
| `source`          | TEXT | NOT NULL        | Origen del snapshot                      |
| `created_at`      | TEXT | DEFAULT now     | Fecha de creación                        |

**Índice:** `idx_ai_prompt_snapshots_hash`

---

### 14. `ai_review_runs` — Muestras AutoPilot AI

Cada fila representa una ejecución manual del admin para seleccionar las facturas más costosas de una fecha.

| Columna                    | Tipo    | Restricción                            | Descripción                     |
| -------------------------- | ------- | -------------------------------------- | ------------------------------- |
| `id`                       | TEXT    | **PRIMARY KEY**                        | UUID de la carpeta              |
| `review_date`              | TEXT    | NOT NULL                               | Fecha revisada `YYYY-MM-DD`     |
| `agency_id`                | TEXT    | nullable                               | Agencia filtrada; null = global |
| `status`                   | TEXT    | CHECK(`READY`, `EMPTY`, `ERROR`)       | Estado de selección             |
| `selected_count`           | INTEGER | NOT NULL, DEFAULT 0                    | Cantidad seleccionada           |
| `total_input_tokens`       | INTEGER | NOT NULL, DEFAULT 0                    | Tokens de entrada agregados     |
| `total_output_tokens`      | INTEGER | NOT NULL, DEFAULT 0                    | Tokens de salida agregados      |
| `total_tokens`             | INTEGER | NOT NULL, DEFAULT 0                    | Tokens totales agregados        |
| `total_estimated_cost_usd` | REAL    | NOT NULL, DEFAULT 0                    | Costo estimado agregado         |
| `created_by_user_id`       | TEXT    | **FK** → `users.id` ON DELETE SET NULL | Admin que creó la carpeta       |
| `created_by_email`         | TEXT    | nullable                               | Email capturado                 |
| `created_by_name`          | TEXT    | nullable                               | Nombre capturado                |
| `error`                    | TEXT    | nullable                               | Error de selección si aplica    |
| `created_at`               | TEXT    | DEFAULT now                            | Fecha de creación               |
| `updated_at`               | TEXT    | DEFAULT now                            | Última actualización            |

**Índices:** `idx_ai_review_runs_date`, `idx_ai_review_runs_agency_date`

---

### 15. `ai_review_items` — Facturas Seleccionadas por AutoPilot AI

Referencia documentos procesados y conserva una copia independiente del PDF bajo `autopilot-ai/` en MinIO.

| Columna                  | Tipo    | Restricción                                             | Descripción                     |
| ------------------------ | ------- | ------------------------------------------------------- | ------------------------------- |
| `id`                     | TEXT    | **PRIMARY KEY**                                         | UUID del item                   |
| `run_id`                 | TEXT    | NOT NULL, **FK** → `ai_review_runs.id` CASCADE          | Carpeta propietaria             |
| `document_job_id`        | TEXT    | NOT NULL                                                | ID del documento original       |
| `batch_id`               | TEXT    | nullable                                                | Lote original                   |
| `agency_id`              | TEXT    | NOT NULL, **FK** → `agencies.id` ON DELETE CASCADE      | Agencia propietaria             |
| `agency_name`            | TEXT    | nullable                                                | Nombre de agencia capturado     |
| `original_file_name`     | TEXT    | NOT NULL                                                | Nombre original del PDF         |
| `review_storage_bucket`  | TEXT    | nullable                                                | Bucket de la copia preservada   |
| `review_object_key`      | TEXT    | nullable                                                | Ruta MinIO de AutoPilot AI      |
| `review_file_size_bytes` | INTEGER | NOT NULL, DEFAULT 0                                     | Tamaño de la copia preservada   |
| `extraction_format`      | TEXT    | NOT NULL                                                | Formato/agente usado            |
| `model_summary`          | TEXT    | nullable                                                | Modelos involucrados            |
| `prompt_hashes`          | TEXT    | nullable                                                | Hashes de prompts involucrados  |
| `status`                 | TEXT    | CHECK(`PENDING_ANALYSIS`, `ANALYZED`, `ANALYSIS_ERROR`) | Estado de revisión              |
| `input_tokens`           | INTEGER | NOT NULL, DEFAULT 0                                     | Tokens de entrada agregados     |
| `output_tokens`          | INTEGER | NOT NULL, DEFAULT 0                                     | Tokens de salida agregados      |
| `total_tokens`           | INTEGER | NOT NULL, DEFAULT 0                                     | Tokens totales agregados        |
| `estimated_cost_usd`     | REAL    | NOT NULL, DEFAULT 0                                     | Costo estimado agregado         |
| `processed_at`           | TEXT    | nullable                                                | Fecha de procesamiento original |
| `analysis_error`         | TEXT    | nullable                                                | Error del agente revisor        |
| `created_at`             | TEXT    | DEFAULT now                                             | Fecha de creación               |
| `updated_at`             | TEXT    | DEFAULT now                                             | Última actualización            |

**Constraint UNIQUE:** `(run_id, document_job_id)`  
**Índices:** `idx_ai_review_items_run`, `idx_ai_review_items_document`, `idx_ai_review_items_review_object`

---

### 16. `ai_review_analyses` — Análisis del Agente Revisor

Guarda diagnósticos y propuestas. No aplica cambios automáticos a prompts ni al extractor.

| Columna                  | Tipo    | Restricción                                                | Descripción                    |
| ------------------------ | ------- | ---------------------------------------------------------- | ------------------------------ |
| `id`                     | TEXT    | **PRIMARY KEY**                                            | UUID del análisis              |
| `item_id`                | TEXT    | NOT NULL, **FK** → `ai_review_items.id` CASCADE            | Factura revisada               |
| `status`                 | TEXT    | CHECK(`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`) | Estado humano                  |
| `reviewer_model`         | TEXT    | NOT NULL                                                   | Modelo usado por el revisor    |
| `verdict`                | TEXT    | NOT NULL                                                   | Veredicto resumido             |
| `confidence_score`       | INTEGER | nullable                                                   | Confianza del revisor          |
| `analysis_json`          | TEXT    | NOT NULL                                                   | JSON estructurado del análisis |
| `recommendation_summary` | TEXT    | nullable                                                   | Resumen visible                |
| `input_tokens`           | INTEGER | NOT NULL, DEFAULT 0                                        | Tokens de entrada del análisis |
| `output_tokens`          | INTEGER | NOT NULL, DEFAULT 0                                        | Tokens de salida del análisis  |
| `total_tokens`           | INTEGER | NOT NULL, DEFAULT 0                                        | Tokens totales del análisis    |
| `estimated_cost_usd`     | REAL    | NOT NULL, DEFAULT 0                                        | Costo estimado del análisis    |
| `created_by_user_id`     | TEXT    | **FK** → `users.id` ON DELETE SET NULL                     | Admin que ejecutó el análisis  |
| `created_by_email`       | TEXT    | nullable                                                   | Email capturado                |
| `created_at`             | TEXT    | DEFAULT now                                                | Fecha de creación              |
| `updated_at`             | TEXT    | DEFAULT now                                                | Última actualización           |

**Índice:** `idx_ai_review_analyses_item`

---

### 17. `app_settings` — Configuración de la App

Almacén key-value para configuraciones generales.

| Columna      | Tipo | Restricción     | Descripción            |
| ------------ | ---- | --------------- | ---------------------- |
| `key`        | TEXT | **PRIMARY KEY** | Clave de configuración |
| `value`      | TEXT | NOT NULL        | Valor                  |
| `updated_at` | TEXT | DEFAULT now     | Última modificación    |

**Datos seed:** `darkMode` = `false`

---

### 18. `integration_delivery_logs` — Logs de Envíos de Integración

Cada registro documenta un envío a un endpoint externo de integración (test o exportación).

| Columna                  | Tipo    | Restricción                                        | Descripción                          |
| ------------------------ | ------- | -------------------------------------------------- | ------------------------------------ |
| `id`                     | TEXT    | **PRIMARY KEY**                                    | ID único                             |
| `agency_id`              | TEXT    | NOT NULL, **FK** → `agencies.id` ON DELETE CASCADE | Agencia propietaria                  |
| `event_type`             | TEXT    | NOT NULL, CHECK(`TEST`, `EXPORT`)                  | Tipo de evento                       |
| `source`                 | TEXT    | NOT NULL                                           | Origen del envío                     |
| `export_reference`       | TEXT    | nullable                                           | Referencia de exportación            |
| `export_filename`        | TEXT    | nullable                                           | Nombre de archivo exportado          |
| `endpoint_url`           | TEXT    | NOT NULL                                           | URL de destino                       |
| `request_document_count` | INTEGER | NOT NULL, DEFAULT 0                                | Documentos incluidos en la petición  |
| `used_client_mapping`    | INTEGER | NOT NULL, DEFAULT 0                                | 1 si usó mapping de cliente, 0 si no |
| `response_status`        | INTEGER | nullable                                           | Código HTTP de respuesta             |
| `response_body`          | TEXT    | nullable                                           | Cuerpo de la respuesta               |
| `success`                | INTEGER | NOT NULL, CHECK(0, 1)                              | 1 si fue exitoso, 0 si falló         |
| `error`                  | TEXT    | nullable                                           | Mensaje de error                     |
| `created_at`             | TEXT    | DEFAULT now                                        | Fecha del envío                      |

**Índice:** `idx_integration_delivery_logs_agency_created` en `(agency_id, created_at DESC)`

---

## Endpoints de la API

### Autenticación (`/api/auth`)

| Método | Ruta                | Descripción           | Body / Headers         |
| ------ | ------------------- | --------------------- | ---------------------- |
| POST   | `/api/auth/login`   | Iniciar sesión        | `{ email, password }`  |
| GET    | `/api/auth/session` | Validar sesión actual | Header: `X-Session-Id` |
| DELETE | `/api/auth/session` | Cerrar sesión         | Header: `X-Session-Id` |

### Usuarios (`/api/users`)

| Método | Ruta             | Descripción               |
| ------ | ---------------- | ------------------------- |
| GET    | `/api/users`     | Listar todos los usuarios |
| GET    | `/api/users/:id` | Obtener un usuario        |
| POST   | `/api/users`     | Crear usuario             |
| PUT    | `/api/users/:id` | Actualizar usuario        |
| DELETE | `/api/users/:id` | Eliminar usuario          |

**Autorización:** solo `ADMIN`

### Agencias (`/api/agencies`)

| Método | Ruta                      | Descripción               |
| ------ | ------------------------- | ------------------------- |
| GET    | `/api/agencies`           | Listar todas las agencias |
| GET    | `/api/agencies/:id`       | Obtener una agencia       |
| POST   | `/api/agencies`           | Crear agencia             |
| PUT    | `/api/agencies/:id`       | Actualizar agencia        |
| DELETE | `/api/agencies/:id`       | Eliminar agencia          |
| PATCH  | `/api/agencies/:id/usage` | Incrementar uso (atomic)  |

**Autorización:**

- `ADMIN`: acceso total
- `SUPERVISOR` / `OPERADOR`: solo lectura de sus agencias asignadas
- `PATCH /:id/usage`: permitido solo sobre agencias accesibles para la sesión

### Batch / Facturas (`/api/batch`)

| Método | Ruta             | Descripción                                 |
| ------ | ---------------- | ------------------------------------------- |
| GET    | `/api/batch`     | Listar items (filtros: `?agencyId=&limit=`) |
| POST   | `/api/batch`     | Guardar resultados de batch                 |
| PUT    | `/api/batch/:id` | Actualizar un item                          |
| DELETE | `/api/batch`     | Limpiar todos los items                     |

**Autorización:** cada sesión solo puede leer o modificar batches de sus agencias; `ADMIN` puede ver todo.

### Documentos / Cola IA (`/api/documents`)

| Método | Ruta                        | Descripción                                     |
| ------ | --------------------------- | ----------------------------------------------- |
| GET    | `/api/documents`            | Listar documentos cargados y resumen por estado |
| GET    | `/api/documents/status/:id` | Consultar estado de un documento                |
| POST   | `/api/documents/upload`     | Cargar uno o varios PDFs a MinIO y crear jobs   |
| POST   | `/api/documents/process`    | Poner jobs `UPLOADED`/`ERROR` en cola `QUEUED`  |
| DELETE | `/api/documents`            | Eliminar PDFs inactivos de MinIO y sus jobs     |

**Filtros de listado:** `agencyId`, `status`, `batchId`, `limit`  
**Upload:** `multipart/form-data` con `file` o `files`, `agencyId`, `batchId` opcional, `format` opcional.  
**Process:** JSON con `jobIds` o `batchId` + `agencyId`; si `GEMINI_EXTRACTION_SDK=genai` o `legacy-cache` y `GEMINI_PROMPT_CACHE_USE_FOR_EXTRACTION=true`, prepara el cache del prompt Gemini por formato antes de encolar y devuelve `promptCaches` con `ready/error/disabled`. Con `GEMINI_EXTRACTION_SDK=genai-router-files`, el worker sube cada PDF a Gemini Files API, clasifica, extrae y borra el archivo remoto sin usar cache.
**Delete:** JSON con `jobIds` y `agencyId`; solo elimina estados `UPLOADED`, `SUCCESS`, `ERROR` o `CANCELLED` para no interrumpir documentos `QUEUED`/`PROCESSING`.  
**Worker:** procesa jobs `QUEUED` en backend, lee el PDF desde MinIO, llama a Gemini y actualiza `document_jobs`, `batch_items` y `document_processing_audit`.  
**Autorización:** acceso restringido por agencia; `ADMIN` puede consultar global.

### Auditoría (`/api/audit`)

| Método | Ruta                             | Descripción                        |
| ------ | -------------------------------- | ---------------------------------- |
| GET    | `/api/audit/document-processing` | Lista auditoría de PDFs procesados |

**Filtros:** `agencyId`, `month=YYYY-MM`, `date=YYYY-MM-DD`, `from=YYYY-MM-DD`, `to=YYYY-MM-DD`  
**Autorización:** `ADMIN` puede consultar global; operadores/supervisores solo sus agencias asignadas.

### Operacional (`/api/operational`)

| Método | Ruta                              | Descripción                                    |
| ------ | --------------------------------- | ---------------------------------------------- |
| GET    | `/api/operational/reconciliation` | Conciliación AWB (filtros: `agencyId`, `date`) |
| POST   | `/api/operational/booked`         | Guardar AWB reservado (upsert)                 |

**Autorización:** acceso restringido por agencia.

### IA / Extracción (`/api/ai`)

| Método | Ruta                   | Descripción                                                                                          |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| POST   | `/api/ai/extract`      | Extrae datos del documento usando Gemini                                                             |
| GET    | `/api/ai/cache-status` | Diagnóstico del SDK activo, modelo, key fingerprint, worker, cache del prompt y últimas extracciones |
| POST   | `/api/ai/cache-warm`   | Crea/reusa manualmente el cache explícito del prompt para un formato                                 |

**Body:** `multipart/form-data` con `file` y `format`  
**Autorización:** sesión requerida  
**Respuesta:** `InvoiceData` con `confidenceScore` final; opcionalmente incluye `confidenceReasons[]` y `confidenceAudit` dentro del JSON persistido.
**Nota:** la API key ya no viaja al navegador; la llamada a Gemini sale desde backend. Por defecto en Docker `GEMINI_EXTRACTION_SDK=genai-router-files` usa el SDK nuevo `@google/genai`, Gemini Files API, clasificador y extractor especializado sin cache. El SDK legacy sigue disponible con `GEMINI_EXTRACTION_SDK=legacy` para rollback y comparación contra el prompt completo anterior. El backend revalida discrepancias matemáticas (`PIECES_TOTAL_MISMATCH`, `EQ_TOTAL_MISMATCH`, `VALUE_TOTAL_MISMATCH`) antes de devolver el score final.

### Planes (`/api/plans`)

| Método | Ruta         | Descripción                  |
| ------ | ------------ | ---------------------------- |
| GET    | `/api/plans` | Listar planes de suscripción |

**Autorización:** sesión requerida

### Settings (`/api/settings`)

| Método | Ruta                 | Descripción               |
| ------ | -------------------- | ------------------------- |
| GET    | `/api/settings/:key` | Obtener una configuración |
| PUT    | `/api/settings/:key` | Guardar una configuración |

**Autorización:** sesión requerida

### Integración (`/api/integrate`)

| Método | Ruta                      | Descripción                                        |
| ------ | ------------------------- | -------------------------------------------------- |
| POST   | `/api/integrate/test`     | Probar envío a endpoint externo con docs dummy     |
| POST   | `/api/integrate/send`     | Enviar documentos transformados a endpoint externo |
| GET    | `/api/integrate/logs/:id` | Listar historial de envíos de una agencia          |

**Body (send):** `{ agencyId, documents[], useClientMapping?, source?, exportReference?, exportFilename? }`  
**Body (test):** `{ agencyId }`  
**Autorización:** sesión requerida + acceso a la agencia

### Utilidad

| Método | Ruta          | Descripción               |
| ------ | ------------- | ------------------------- |
| GET    | `/api/health` | Health check del servidor |

---

## Reglas de Negocio Implementadas en el Backend

1. **Eliminación de agencia** — bloqueada si tiene usuarios asignados
2. **Suspensión de agencia** — bloqueada si deja usuarios sin ninguna agencia activa
3. **Email de usuario** — debe ser único en todo el sistema
4. **Usuario no-admin** — debe tener al menos una agencia activa asignada
5. **Password** — mínimo 4 caracteres
6. **Sesiones** — expiran a las 8 horas automáticamente
7. **AWB duplicados** — constraint UNIQUE previene registros duplicados por MAWB+fecha+agencia
8. **Uso de agencia** — incremento atómico (PATCH) para concurrencia segura
9. **Passwords en seed** — se insertan hasheadas con `scrypt`
10. **Autorización API** — todas las rutas salvo `/api/health` y `/api/auth/login` requieren sesión válida
11. **Aislamiento por rol/agencia** — operador y supervisor no pueden consultar datos administrativos globales
12. **Auditoría de PDFs** — cada batch terminado persiste un registro independiente de `batch_items`; Admin Metrics usa esta tabla como fuente de verdad
13. **Carga asíncrona de PDFs** — los archivos se guardan en MinIO y SQLite conserva solo metadatos/estado en `document_jobs`
14. **Worker de documentos** — procesa jobs `QUEUED` en backend y refleja resultados en `batch_items` para conservar compatibilidad con vistas existentes
15. **Scoring de confianza** — Gemini puede proponer `confidenceReasons`, pero el backend confirma de forma determinística las discrepancias matemáticas y ajusta el `confidenceScore` final antes de persistirlo

---

## Comandos de Desarrollo

```bash
# Desarrollo (frontend + backend simultáneo con hot-reload)
npm run dev

# Solo frontend
npm run dev:client

# Solo backend
npm run dev:server

# Build producción
npm run build

# Ejecutar en producción
npm run start
# o con puerto personalizado:
PORT=8080 npm run start
```

---

## Configuración para Despliegue (Coolify / Docker)

### Variables de Entorno

| Variable                                      | Requerida | Descripción                                                                                                           |
| --------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                        | No        | Puerto del servidor (default: 3001)                                                                                   |
| `TURSO_DATABASE_URL`                          | No        | URL de Turso remoto (default: archivo local)                                                                          |
| `TURSO_AUTH_TOKEN`                            | No        | Token de auth de Turso (si es remoto)                                                                                 |
| `GEMINI_API_KEY`                              | Sí        | API key de Google Gemini para IA                                                                                      |
| `GEMINI_MODEL_ID`                             | No        | Modelo Gemini activo (default: `gemini-3-flash-preview`)                                                              |
| `GEMINI_EXTRACTION_SDK`                       | No        | `genai-router-files` por defecto en Docker; `legacy` para baseline/rollback; `genai` para pruebas con SDK nuevo/cache |
| `GEMINI_EXTRACTION_PROMPT_PROFILE`            | No        | `full` por defecto; `compact` reduce tokens para pruebas de latencia/costo                                            |
| `GEMINI_GENERATE_TIMEOUT_MS`                  | No        | Timeout de extracción Gemini (default: 180000)                                                                        |
| `GEMINI_CACHED_GENERATE_TIMEOUT_MS`           | No        | Timeout del camino con `cachedContent` (default: 180000)                                                              |
| `GEMINI_MAX_OUTPUT_TOKENS`                    | No        | Limite de salida de Gemini para controlar costo/latencia (default: 4096)                                              |
| `GEMINI_THINKING_LEVEL`                       | No        | Nivel de thinking: `minimal`, `low`, `medium`, `high` u `off` (default: minimal)                                      |
| `GEMINI_GENAI_TRANSIENT_RETRY_ATTEMPTS`       | No        | Intentos totales de `genai` ante errores transitorios rápidos (default: 3)                                            |
| `GEMINI_GENAI_TRANSIENT_RETRY_BASE_DELAY_MS`  | No        | Espera base entre reintentos transitorios de `genai` (default: 15000)                                                 |
| `GEMINI_LEGACY_TRANSIENT_RETRY_ATTEMPTS`      | No        | Intentos totales de `legacy` ante errores transitorios rápidos (default: 3)                                           |
| `GEMINI_LEGACY_TRANSIENT_RETRY_BASE_DELAY_MS` | No        | Espera base entre reintentos transitorios de `legacy` (default: 15000)                                                |
| `GEMINI_PROMPT_CACHE_ENABLED`                 | No        | Activa creación/diagnóstico de cache explícito (default: true)                                                        |
| `GEMINI_PROMPT_CACHE_USE_FOR_EXTRACTION`      | No        | Usa `cachedContent` con `GEMINI_EXTRACTION_SDK=genai` o `legacy-cache` (default: false)                               |
| `GEMINI_PROMPT_CACHE_TTL_SECONDS`             | No        | TTL del cache explícito del prompt (default: 14400)                                                                   |
| `MINIO_ROOT_USER`                             | Sí        | Usuario interno de MinIO en Docker Compose                                                                            |
| `MINIO_ROOT_PASSWORD`                         | Sí        | Password interno de MinIO en Docker Compose                                                                           |
| `MINIO_ENDPOINT`                              | No        | Host MinIO/S3-compatible (en Docker Compose: `minio`)                                                                 |
| `MINIO_PORT`                                  | No        | Puerto MinIO/S3-compatible (default: `9000`)                                                                          |
| `MINIO_ACCESS_KEY`                            | No        | Access key MinIO; si falta usa `MINIO_ROOT_USER`                                                                      |
| `MINIO_SECRET_KEY`                            | No        | Secret key MinIO; si falta usa `MINIO_ROOT_PASSWORD`                                                                  |
| `MINIO_BUCKET`                                | No        | Bucket de PDFs (default: `smart-invoices`)                                                                            |
| `MINIO_USE_SSL`                               | No        | Activa SSL para MinIO/S3-compatible (default: `false`)                                                                |
| `DOCUMENT_UPLOAD_MAX_BYTES`                   | No        | Tamaño máximo por PDF (default: 25 MB)                                                                                |
| `DOCUMENT_UPLOAD_MAX_TOTAL_BYTES`             | No        | Tamaño máximo total por carga (default: 100 MB)                                                                       |
| `DOCUMENT_WORKER_ENABLED`                     | No        | Activa/desactiva el worker (default: `true`)                                                                          |
| `DOCUMENT_WORKER_POLL_MS`                     | No        | Intervalo de polling del worker (default: 1000)                                                                       |
| `DOCUMENT_WORKER_CONCURRENCY`                 | No        | Jobs procesados por ciclo (default: 5, max: 5)                                                                        |
| `DOCUMENT_WORKER_JOB_TIMEOUT_MS`              | No        | Timeout duro por documento (default: 210000)                                                                          |
| `DOCUMENT_WORKER_STALE_PROCESSING_MS`         | No        | Tiempo para reencolar `PROCESSING` vencidos (default: 4 min)                                                          |
| `API_KEY`                                     | No        | Fallback legacy para Gemini si no se define `GEMINI_API_KEY`                                                          |

### Artefactos de despliegue incluidos

- `Dockerfile` multi-stage en la raíz del repo
- `.dockerignore` para evitar subir artefactos locales
- `.env.example` como plantilla de variables
- `docs/CoolifyDeployment.md` como receta operativa final

### Notas para Coolify

- **Método recomendado:** usar `Docker Compose` del repo para levantar app + MinIO
- **Fallback sin MinIO:** `Dockerfile` o Nixpacks con `npm run build` y `npm run start`
- **Port:** `3001`
- **Healthcheck:** `/api/health`
- La base de datos local se guarda en `data/smart-invoice.db`
- Para persistencia: montar volumen en `/app/data`
