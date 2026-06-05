// ============================================
// ESQUEMA DE BASE DE DATOS — libSQL / Turso
// ============================================
// Todas las tablas de la aplicación Smart Invoice AI
// Ejecutar con: runMigrations(db)
// ============================================

import type { Client } from '@libsql/client';

const GEMINI_PROMPT_CACHES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS gemini_prompt_caches (
  cache_key          TEXT PRIMARY KEY,
  model              TEXT NOT NULL,
  agent_type         TEXT NOT NULL,
  prompt_hash        TEXT NOT NULL,
  cache_name         TEXT NOT NULL,
  cache_token_count  INTEGER,
  create_duration_ms INTEGER,
  expires_at         TEXT NOT NULL,
  created_at         TEXT DEFAULT (datetime('now')),
  updated_at         TEXT DEFAULT (datetime('now'))
)`;

const GEMINI_PROMPT_CACHES_EXPIRES_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_gemini_prompt_caches_expires ON gemini_prompt_caches(expires_at)`;

const GEMINI_EXTRACTION_EVENTS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS gemini_extraction_events (
  id                         TEXT PRIMARY KEY,
  timestamp                  TEXT NOT NULL,
  expires_at                 TEXT NOT NULL,
  source                     TEXT NOT NULL DEFAULT 'unknown',
  document_job_id            TEXT,
  batch_id                   TEXT,
  agency_id                  TEXT,
  user_id                    TEXT,
  user_email                 TEXT,
  user_name                  TEXT,
  original_file_name         TEXT,
  agent_type                 TEXT NOT NULL,
  sdk                        TEXT NOT NULL,
  stage                      TEXT,
  cache_mode                 TEXT NOT NULL,
  model                      TEXT NOT NULL,
  prompt_hash                TEXT NOT NULL,
  success                    INTEGER NOT NULL CHECK(success IN (0, 1)),
  error                      TEXT,
  prompt_token_count         INTEGER,
  candidates_token_count     INTEGER,
  thoughts_token_count       INTEGER,
  total_token_count          INTEGER,
  cached_content_token_count INTEGER,
  cache_token_count          INTEGER,
  duration_ms                INTEGER NOT NULL DEFAULT 0,
  file_upload_duration_ms    INTEGER,
  file_delete_duration_ms    INTEGER,
  file_delete_ok             INTEGER CHECK(file_delete_ok IN (0, 1)),
  file_input_mode            TEXT,
  router_category            TEXT,
  router_confidence          REAL,
  router_visual_signals      TEXT,
  created_at                 TEXT DEFAULT (datetime('now'))
)`;

const GEMINI_EXTRACTION_EVENT_INDEX_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS idx_gemini_extraction_events_timestamp ON gemini_extraction_events(timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_gemini_extraction_events_expires ON gemini_extraction_events(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_gemini_extraction_events_stage_timestamp ON gemini_extraction_events(stage, timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_gemini_extraction_events_success_timestamp ON gemini_extraction_events(success, timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_gemini_extraction_events_job ON gemini_extraction_events(document_job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gemini_extraction_events_agency_timestamp ON gemini_extraction_events(agency_id, timestamp DESC)`,
];

const AI_PROMPT_SNAPSHOTS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ai_prompt_snapshots (
  id              TEXT PRIMARY KEY,
  prompt_hash     TEXT NOT NULL,
  prompt_kind     TEXT NOT NULL,
  agent_type      TEXT,
  router_category TEXT,
  model           TEXT NOT NULL,
  prompt_profile  TEXT,
  prompt_text     TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'current-code',
  created_at      TEXT DEFAULT (datetime('now'))
)`;

const AI_REVIEW_RUNS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ai_review_runs (
  id                       TEXT PRIMARY KEY,
  review_date              TEXT NOT NULL,
  agency_id                TEXT,
  status                   TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY', 'EMPTY', 'ERROR')),
  selected_count           INTEGER NOT NULL DEFAULT 0,
  total_input_tokens       INTEGER NOT NULL DEFAULT 0,
  total_output_tokens      INTEGER NOT NULL DEFAULT 0,
  total_tokens             INTEGER NOT NULL DEFAULT 0,
  total_estimated_cost_usd REAL NOT NULL DEFAULT 0,
  created_by_user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_email         TEXT,
  created_by_name          TEXT,
  error                    TEXT,
  created_at               TEXT DEFAULT (datetime('now')),
  updated_at               TEXT DEFAULT (datetime('now'))
)`;

const AI_REVIEW_ITEMS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ai_review_items (
  id                       TEXT PRIMARY KEY,
  run_id                   TEXT NOT NULL REFERENCES ai_review_runs(id) ON DELETE CASCADE,
  document_job_id          TEXT NOT NULL,
  batch_id                 TEXT,
  agency_id                TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  agency_name              TEXT,
  original_file_name       TEXT NOT NULL,
  review_storage_bucket    TEXT,
  review_object_key        TEXT,
  review_file_size_bytes   INTEGER NOT NULL DEFAULT 0,
  extraction_format        TEXT NOT NULL,
  model_summary            TEXT,
  prompt_hashes            TEXT,
  status                   TEXT NOT NULL DEFAULT 'PENDING_ANALYSIS' CHECK(status IN ('PENDING_ANALYSIS', 'ANALYZED', 'ANALYSIS_ERROR')),
  input_tokens             INTEGER NOT NULL DEFAULT 0,
  output_tokens            INTEGER NOT NULL DEFAULT 0,
  total_tokens             INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd       REAL NOT NULL DEFAULT 0,
  processed_at             TEXT,
  analysis_error           TEXT,
  created_at               TEXT DEFAULT (datetime('now')),
  updated_at               TEXT DEFAULT (datetime('now')),
  UNIQUE(run_id, document_job_id)
)`;

const AI_REVIEW_ANALYSES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ai_review_analyses (
  id                       TEXT PRIMARY KEY,
  item_id                  TEXT NOT NULL REFERENCES ai_review_items(id) ON DELETE CASCADE,
  status                   TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  reviewer_model           TEXT NOT NULL,
  verdict                  TEXT NOT NULL,
  confidence_score         INTEGER,
  analysis_json            TEXT NOT NULL,
  recommendation_summary   TEXT,
  input_tokens             INTEGER NOT NULL DEFAULT 0,
  output_tokens            INTEGER NOT NULL DEFAULT 0,
  total_tokens             INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd       REAL NOT NULL DEFAULT 0,
  created_by_user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_email         TEXT,
  created_at               TEXT DEFAULT (datetime('now')),
  updated_at               TEXT DEFAULT (datetime('now'))
)`;

const AI_REVIEW_INDEX_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS idx_ai_prompt_snapshots_hash ON ai_prompt_snapshots(prompt_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_review_runs_date ON ai_review_runs(review_date DESC, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_review_runs_agency_date ON ai_review_runs(agency_id, review_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_review_items_run ON ai_review_items(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_review_items_document ON ai_review_items(document_job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_review_items_review_object ON ai_review_items(review_object_key)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_review_analyses_item ON ai_review_analyses(item_id, created_at DESC)`,
];

/**
 * ESQUEMA COMPLETO DE TABLAS
 * ──────────────────────────
 * subscription_plans   → Planes de suscripción (Starter, Growth, Scale)
 * agencies             → Agencias / Clientes / Tenants
 * agency_emails        → Correos asociados a cada agencia (1:N)
 * users                → Usuarios del sistema
 * user_agencies        → Asignación usuario ↔ agencia (M:N)
 * auth_sessions        → Sesiones de autenticación activas
 * batch_items          → Resultados de procesamiento de facturas
 * document_jobs        → Cola de PDFs almacenados en MinIO para procesamiento asíncrono
 * document_processing_audit → Auditoría contable de PDFs procesados
 * booked_awb_records   → Registros de AWBs reservados (operacional)
 * gemini_prompt_caches → Referencias persistidas a context caches de Gemini
 * gemini_extraction_events → Observabilidad histórica de etapas Gemini durante 2 días
 * ai_review_*       → Carpeta lógica admin para revisión IA y propuestas de mejora
 * app_settings         → Configuración de la app (key-value)
 */

const SCHEMA_STATEMENTS: string[] = [
  // ── Planes de Suscripción ──
  `CREATE TABLE IF NOT EXISTS subscription_plans (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    doc_limit      INTEGER NOT NULL,
    base_cost      REAL NOT NULL,
    extra_page_cost REAL NOT NULL
  )`,

  // ── Agencias ──
  `CREATE TABLE IF NOT EXISTS agencies (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    plan_id        TEXT NOT NULL REFERENCES subscription_plans(id),
    current_usage  INTEGER NOT NULL DEFAULT 0,
    is_active      INTEGER NOT NULL DEFAULT 1,
    hawb_format_pattern TEXT,
    integration_config TEXT,
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  )`,

  // ── Logs de Integración Externa por Agencia ──
  `CREATE TABLE IF NOT EXISTS integration_delivery_logs (
    id                   TEXT PRIMARY KEY,
    agency_id            TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    event_type           TEXT NOT NULL CHECK(event_type IN ('TEST', 'EXPORT')),
    source               TEXT NOT NULL,
    export_reference     TEXT,
    export_filename      TEXT,
    endpoint_url         TEXT NOT NULL,
    request_document_count INTEGER NOT NULL DEFAULT 0,
    used_client_mapping  INTEGER NOT NULL DEFAULT 0,
    response_status      INTEGER,
    response_body        TEXT,
    success              INTEGER NOT NULL CHECK(success IN (0, 1)),
    error                TEXT,
    created_at           TEXT DEFAULT (datetime('now'))
  )`,

  // ── Emails de Agencia (1 agencia → N emails) ──
  `CREATE TABLE IF NOT EXISTS agency_emails (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    agency_id      TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    email          TEXT NOT NULL
  )`,

  // ── Usuarios ──
  `CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,
    password       TEXT NOT NULL,
    name           TEXT NOT NULL,
    role           TEXT NOT NULL CHECK(role IN ('ADMIN', 'OPERADOR', 'SUPERVISOR')),
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  )`,

  // ── Asignación Usuario ↔ Agencia (M:N) ──
  `CREATE TABLE IF NOT EXISTS user_agencies (
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agency_id      TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, agency_id)
  )`,

  // ── Sesiones de Autenticación ──
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at     TEXT NOT NULL,
    created_at     TEXT DEFAULT (datetime('now'))
  )`,

  // ── Items de Batch (Facturas Procesadas) ──
  // result_json guarda InvoiceData completo como JSON
  `CREATE TABLE IF NOT EXISTS batch_items (
    id             TEXT PRIMARY KEY,
    file_name      TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'ERROR')),
    result_json    TEXT,
    error          TEXT,
    processed_at   TEXT,
    user_email     TEXT,
    agency_id      TEXT REFERENCES agencies(id),
    created_at     TEXT DEFAULT (datetime('now'))
  )`,

  // ── Jobs de Documentos (PDFs en MinIO para procesamiento asíncrono) ──
  `CREATE TABLE IF NOT EXISTS document_jobs (
    id                 TEXT PRIMARY KEY,
    batch_id           TEXT NOT NULL,
    agency_id          TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    user_id            TEXT REFERENCES users(id) ON DELETE SET NULL,
    user_email         TEXT,
    user_name          TEXT,
    status             TEXT NOT NULL DEFAULT 'UPLOADED' CHECK(status IN ('UPLOADED', 'QUEUED', 'PROCESSING', 'SUCCESS', 'ERROR', 'CANCELLED')),
    storage_bucket     TEXT NOT NULL,
    object_key         TEXT NOT NULL UNIQUE,
    original_file_name TEXT NOT NULL,
    file_size_bytes    INTEGER NOT NULL DEFAULT 0,
    mime_type          TEXT NOT NULL DEFAULT 'application/pdf',
    extraction_format  TEXT NOT NULL DEFAULT 'AGENT_GENERIC_A',
    result_json        TEXT,
    error              TEXT,
    retry_count        INTEGER NOT NULL DEFAULT 0,
    max_retries        INTEGER NOT NULL DEFAULT 3,
    locked_by          TEXT,
    lock_expires_at    TEXT,
    queued_at          TEXT,
    started_at         TEXT,
    processed_at       TEXT,
    created_at         TEXT DEFAULT (datetime('now')),
    updated_at         TEXT DEFAULT (datetime('now'))
  )`,

  // ── Auditoría Contable de Procesamiento de Documentos ──
  // Independiente de batch_items para no perder métricas al limpiar datos extraídos.
  `CREATE TABLE IF NOT EXISTS document_processing_audit (
    id             TEXT PRIMARY KEY,
    batch_item_id  TEXT NOT NULL UNIQUE,
    file_name      TEXT NOT NULL,
    agency_id      TEXT NOT NULL,
    agency_name    TEXT,
    status         TEXT NOT NULL CHECK(status IN ('SUCCESS', 'ERROR')),
    extraction_ok  INTEGER NOT NULL CHECK(extraction_ok IN (0, 1)),
    error          TEXT,
    processed_at   TEXT NOT NULL,
    processed_date TEXT NOT NULL,
    user_id        TEXT,
    user_email     TEXT,
    user_name      TEXT,
    source         TEXT NOT NULL DEFAULT 'batch_processing',
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  )`,

  // ── AWBs Reservados (Panel Operativo) ──
  `CREATE TABLE IF NOT EXISTS booked_awb_records (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    mawb           TEXT NOT NULL,
    booked_hijas   INTEGER NOT NULL DEFAULT 0,
    booked_pieces  INTEGER NOT NULL DEFAULT 0,
    booked_fulls   REAL NOT NULL DEFAULT 0,
    operation_date TEXT NOT NULL,
    agency_id      TEXT NOT NULL REFERENCES agencies(id),
    UNIQUE(mawb, operation_date, agency_id)
  )`,

  // ── Match Productos por Agencia ──
  `CREATE TABLE IF NOT EXISTS product_matches (
    id                  TEXT PRIMARY KEY,
    agency_id           TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    category            TEXT NOT NULL DEFAULT '',
    product             TEXT NOT NULL,
    client_product_code TEXT NOT NULL DEFAULT '',
    product_match       TEXT NOT NULL DEFAULT '',
    hts                 TEXT NOT NULL DEFAULT '',
    hts_match           TEXT NOT NULL DEFAULT '',
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now')),
    UNIQUE(agency_id, product)
  )`,

  // ── Catalogo Maestro de Match Productos ──
  `CREATE TABLE IF NOT EXISTS product_match_master (
    id                  TEXT PRIMARY KEY,
    product             TEXT NOT NULL,
    client_product_code TEXT NOT NULL DEFAULT '',
    product_match       TEXT NOT NULL DEFAULT '',
    hts_match           TEXT NOT NULL DEFAULT '',
    source_order        INTEGER NOT NULL,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
  )`,

  // ── Cache Persistente del Super Prompt Gemini ──
  GEMINI_PROMPT_CACHES_TABLE_SQL,

  // ── Observabilidad Histórica de Extracción Gemini ──
  GEMINI_EXTRACTION_EVENTS_TABLE_SQL,

  // ── Revisión IA Admin (aditiva, no altera extracción operativa) ──
  AI_PROMPT_SNAPSHOTS_TABLE_SQL,
  AI_REVIEW_RUNS_TABLE_SQL,
  AI_REVIEW_ITEMS_TABLE_SQL,
  AI_REVIEW_ANALYSES_TABLE_SQL,

  // ── Configuración General (key-value) ──
  `CREATE TABLE IF NOT EXISTS app_settings (
    key            TEXT PRIMARY KEY,
    value          TEXT NOT NULL,
    updated_at     TEXT DEFAULT (datetime('now'))
  )`,

  // ── Índices para rendimiento ──
  `CREATE INDEX IF NOT EXISTS idx_agency_emails_agency ON agency_emails(agency_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_agencies_user ON user_agencies(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_agencies_agency ON user_agencies(agency_id)`,
  `CREATE INDEX IF NOT EXISTS idx_batch_items_agency ON batch_items(agency_id)`,
  `CREATE INDEX IF NOT EXISTS idx_batch_items_status ON batch_items(status)`,
  `CREATE INDEX IF NOT EXISTS idx_batch_items_agency_created ON batch_items(agency_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_batch_items_agency_status_processed ON batch_items(agency_id, status, processed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_document_jobs_batch ON document_jobs(batch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_document_jobs_agency_status ON document_jobs(agency_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_document_jobs_status_created ON document_jobs(status, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_document_jobs_status_lock ON document_jobs(status, lock_expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_document_jobs_user_created ON document_jobs(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_document_audit_agency_date ON document_processing_audit(agency_id, processed_date)`,
  `CREATE INDEX IF NOT EXISTS idx_document_audit_date ON document_processing_audit(processed_date)`,
  `CREATE INDEX IF NOT EXISTS idx_document_audit_status ON document_processing_audit(status)`,
  `CREATE INDEX IF NOT EXISTS idx_document_audit_user_date ON document_processing_audit(user_id, processed_date)`,
  `CREATE INDEX IF NOT EXISTS idx_booked_awb_date ON booked_awb_records(operation_date, agency_id)`,
  `CREATE INDEX IF NOT EXISTS idx_product_matches_agency ON product_matches(agency_id)`,
  `CREATE INDEX IF NOT EXISTS idx_product_matches_agency_product ON product_matches(agency_id, product)`,
  `CREATE INDEX IF NOT EXISTS idx_product_match_master_product ON product_match_master(product)`,
  GEMINI_PROMPT_CACHES_EXPIRES_INDEX_SQL,
  ...GEMINI_EXTRACTION_EVENT_INDEX_STATEMENTS,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_integration_delivery_logs_agency_created ON integration_delivery_logs(agency_id, created_at DESC)`,
];

export async function runMigrations(db: Client): Promise<void> {
  // Habilitar foreign keys (libSQL/SQLite)
  await db.execute('PRAGMA foreign_keys = ON');
  await db.execute('PRAGMA journal_mode = WAL');

  for (const sql of SCHEMA_STATEMENTS) {
    await db.execute(sql);
  }

  await ensureColumn(db, 'document_jobs', 'locked_by', 'TEXT');
  await ensureColumn(db, 'document_jobs', 'lock_expires_at', 'TEXT');
  await ensureColumn(db, 'agencies', 'hawb_format_pattern', 'TEXT');
  await ensureColumn(db, 'agencies', 'integration_config', 'TEXT');
  await ensureTableExists(db, 'gemini_prompt_caches', GEMINI_PROMPT_CACHES_TABLE_SQL);
  await ensureTableExists(db, 'gemini_extraction_events', GEMINI_EXTRACTION_EVENTS_TABLE_SQL);
  await ensureTableExists(db, 'ai_prompt_snapshots', AI_PROMPT_SNAPSHOTS_TABLE_SQL);
  await ensureTableExists(db, 'ai_review_runs', AI_REVIEW_RUNS_TABLE_SQL);
  await ensureTableExists(db, 'ai_review_items', AI_REVIEW_ITEMS_TABLE_SQL);
  await ensureTableExists(db, 'ai_review_analyses', AI_REVIEW_ANALYSES_TABLE_SQL);
  await migrateAiReviewItemsForPersistentArtifacts(db);
  await ensureColumn(db, 'ai_review_items', 'review_storage_bucket', 'TEXT');
  await ensureColumn(db, 'ai_review_items', 'review_object_key', 'TEXT');
  await ensureColumn(db, 'ai_review_items', 'review_file_size_bytes', 'INTEGER NOT NULL DEFAULT 0');
  await ensureIndexExists(
    db,
    'idx_gemini_prompt_caches_expires',
    GEMINI_PROMPT_CACHES_EXPIRES_INDEX_SQL,
  );
  for (const indexStatement of GEMINI_EXTRACTION_EVENT_INDEX_STATEMENTS) {
    const match = indexStatement.match(/CREATE INDEX IF NOT EXISTS\s+(\S+)/i);
    if (match) {
      await ensureIndexExists(db, match[1], indexStatement);
    }
  }
  for (const indexStatement of AI_REVIEW_INDEX_STATEMENTS) {
    const match = indexStatement.match(/CREATE INDEX IF NOT EXISTS\s+(\S+)/i);
    if (match) {
      await ensureIndexExists(db, match[1], indexStatement);
    }
  }

  await backfillDocumentProcessingAudit(db);

  console.log(`✅ Migraciones ejecutadas: ${SCHEMA_STATEMENTS.length} statements`);
}

async function ensureColumn(
  db: Client,
  tableName: string,
  columnName: string,
  columnDefinition: string,
): Promise<void> {
  const result = await db.execute(`PRAGMA table_info(${tableName})`);
  const hasColumn = result.rows.some((row) => String(row.name) === columnName);

  if (!hasColumn) {
    await db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

async function ensureTableExists(
  db: Client,
  tableName: string,
  createStatement: string,
): Promise<void> {
  const result = await db.execute({
    sql: `SELECT name
          FROM sqlite_master
          WHERE type = 'table' AND name = ?
          LIMIT 1`,
    args: [tableName],
  });

  if (result.rows.length === 0) {
    await db.execute(createStatement);
  }
}

async function ensureIndexExists(
  db: Client,
  indexName: string,
  createStatement: string,
): Promise<void> {
  const result = await db.execute({
    sql: `SELECT name
          FROM sqlite_master
          WHERE type = 'index' AND name = ?
          LIMIT 1`,
    args: [indexName],
  });

  if (result.rows.length === 0) {
    await db.execute(createStatement);
  }
}

async function migrateAiReviewItemsForPersistentArtifacts(db: Client): Promise<void> {
  const tableResult = await db.execute({
    sql: `SELECT name
          FROM sqlite_master
          WHERE type = 'table' AND name = 'ai_review_items'
          LIMIT 1`,
    args: [],
  });
  if (tableResult.rows.length === 0) {
    return;
  }

  const [columnResult, foreignKeyResult] = await Promise.all([
    db.execute('PRAGMA table_info(ai_review_items)'),
    db.execute('PRAGMA foreign_key_list(ai_review_items)'),
  ]);
  const existingColumns = new Set(columnResult.rows.map((row) => String(row.name)));
  const hasReviewObjectKey = columnResult.rows.some(
    (row) => String(row.name) === 'review_object_key',
  );
  const hasDocumentCascade = foreignKeyResult.rows.some(
    (row) =>
      String(row.table) === 'document_jobs' &&
      String(row.from) === 'document_job_id' &&
      String(row.on_delete).toUpperCase() === 'CASCADE',
  );

  if (hasReviewObjectKey && !hasDocumentCascade) {
    return;
  }

  await db.execute('PRAGMA foreign_keys = OFF');
  try {
    await db.execute('BEGIN IMMEDIATE TRANSACTION');
    await db.execute(AI_REVIEW_ITEMS_TABLE_SQL.replace('ai_review_items', 'ai_review_items_next'));
    const reviewStorageBucketSelect = existingColumns.has('review_storage_bucket')
      ? 'review_storage_bucket'
      : 'NULL';
    const reviewObjectKeySelect = existingColumns.has('review_object_key')
      ? 'review_object_key'
      : 'NULL';
    const reviewFileSizeSelect = existingColumns.has('review_file_size_bytes')
      ? 'review_file_size_bytes'
      : '0';
    await db.execute(`
      INSERT OR IGNORE INTO ai_review_items_next (
        id,
        run_id,
        document_job_id,
        batch_id,
        agency_id,
        agency_name,
        original_file_name,
        review_storage_bucket,
        review_object_key,
        review_file_size_bytes,
        extraction_format,
        model_summary,
        prompt_hashes,
        status,
        input_tokens,
        output_tokens,
        total_tokens,
        estimated_cost_usd,
        processed_at,
        analysis_error,
        created_at,
        updated_at
      )
      SELECT
        id,
        run_id,
        document_job_id,
        batch_id,
        agency_id,
        agency_name,
        original_file_name,
        ${reviewStorageBucketSelect},
        ${reviewObjectKeySelect},
        ${reviewFileSizeSelect},
        extraction_format,
        model_summary,
        prompt_hashes,
        status,
        input_tokens,
        output_tokens,
        total_tokens,
        estimated_cost_usd,
        processed_at,
        analysis_error,
        created_at,
        updated_at
      FROM ai_review_items
    `);
    await db.execute('DROP TABLE ai_review_items');
    await db.execute('ALTER TABLE ai_review_items_next RENAME TO ai_review_items');
    await db.execute('COMMIT');
  } catch (error) {
    await db.execute('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await db.execute('PRAGMA foreign_keys = ON');
  }
}

async function backfillDocumentProcessingAudit(db: Client): Promise<void> {
  await db.execute(`
    INSERT OR IGNORE INTO document_processing_audit (
      id,
      batch_item_id,
      file_name,
      agency_id,
      agency_name,
      status,
      extraction_ok,
      error,
      processed_at,
      processed_date,
      user_id,
      user_email,
      user_name,
      source,
      created_at,
      updated_at
    )
    SELECT
      'audit_' || b.id,
      b.id,
      b.file_name,
      COALESCE(b.agency_id, 'UNKNOWN'),
      a.name,
      b.status,
      CASE WHEN b.status = 'SUCCESS' THEN 1 ELSE 0 END,
      b.error,
      COALESCE(b.processed_at, b.created_at, datetime('now')),
      substr(COALESCE(b.processed_at, b.created_at, datetime('now')), 1, 10),
      u.id,
      u.email,
      COALESCE(u.name, b.user_email),
      'batch_items_backfill',
      COALESCE(b.created_at, datetime('now')),
      datetime('now')
    FROM batch_items b
    LEFT JOIN agencies a ON a.id = b.agency_id
    LEFT JOIN users u ON u.email = b.user_email OR u.name = b.user_email
    WHERE b.status IN ('SUCCESS', 'ERROR')
  `);
}
