// ============================================
// ESQUEMA DE BASE DE DATOS — libSQL / Turso
// ============================================
// Todas las tablas de la aplicación Smart Invoice AI
// Ejecutar con: runMigrations(db)
// ============================================

import type { Client } from '@libsql/client';

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
 * document_processing_audit → Auditoría contable de PDFs procesados
 * booked_awb_records   → Registros de AWBs reservados (operacional)
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
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
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
  `CREATE INDEX IF NOT EXISTS idx_document_audit_agency_date ON document_processing_audit(agency_id, processed_date)`,
  `CREATE INDEX IF NOT EXISTS idx_document_audit_date ON document_processing_audit(processed_date)`,
  `CREATE INDEX IF NOT EXISTS idx_document_audit_status ON document_processing_audit(status)`,
  `CREATE INDEX IF NOT EXISTS idx_document_audit_user_date ON document_processing_audit(user_id, processed_date)`,
  `CREATE INDEX IF NOT EXISTS idx_booked_awb_date ON booked_awb_records(operation_date, agency_id)`,
  `CREATE INDEX IF NOT EXISTS idx_product_matches_agency ON product_matches(agency_id)`,
  `CREATE INDEX IF NOT EXISTS idx_product_matches_agency_product ON product_matches(agency_id, product)`,
  `CREATE INDEX IF NOT EXISTS idx_product_match_master_product ON product_match_master(product)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)`,
];

export async function runMigrations(db: Client): Promise<void> {
  // Habilitar foreign keys (libSQL/SQLite)
  await db.execute('PRAGMA foreign_keys = ON');
  await db.execute('PRAGMA journal_mode = WAL');

  for (const sql of SCHEMA_STATEMENTS) {
    await db.execute(sql);
  }

  await backfillDocumentProcessingAudit(db);

  console.log(`✅ Migraciones ejecutadas: ${SCHEMA_STATEMENTS.length} statements`);
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
