// ============================================
// RUTAS DE BATCH — /api/batch
// ============================================

import { Hono } from 'hono';
import type { InValue } from '@libsql/client';
import { getDb } from '../db.js';
import type { AuthUser } from '../security.js';
import { ensureAgencyAccess, requireAuth } from '../security.js';

const batch = new Hono();

const AUDITABLE_STATUSES = new Set(['SUCCESS', 'ERROR']);

// Helper: reconstruir BatchItem desde DB row
function buildBatchItem(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    fileName: String(row.file_name),
    status: String(row.status) as 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR',
    result: row.result_json ? JSON.parse(String(row.result_json)) : undefined,
    error: row.error ? String(row.error) : undefined,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    processedAt: row.processed_at ? String(row.processed_at) : undefined,
    user: row.user_email ? String(row.user_email) : undefined,
    agencyId: row.agency_id ? String(row.agency_id) : undefined,
  };
}

function getAuditTimestamp(item: Record<string, unknown>): string {
  const candidate = item.processedAt || item.createdAt;
  return typeof candidate === 'string' && candidate.trim() ? candidate : new Date().toISOString();
}

function buildAuditStatement(item: Record<string, unknown>, authUser: AuthUser, agencyNames: Map<string, string>) {
  const status = String(item.status || '');
  const batchItemId = String(item.id);
  const agencyId = String(item.agencyId || 'UNKNOWN');
  const processedAt = getAuditTimestamp(item);
  const now = new Date().toISOString();

  return {
    sql: `INSERT INTO document_processing_audit (
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(batch_item_id) DO UPDATE SET
            file_name = excluded.file_name,
            agency_id = excluded.agency_id,
            agency_name = excluded.agency_name,
            status = excluded.status,
            extraction_ok = excluded.extraction_ok,
            error = excluded.error,
            processed_at = excluded.processed_at,
            processed_date = excluded.processed_date,
            user_id = excluded.user_id,
            user_email = excluded.user_email,
            user_name = excluded.user_name,
            source = excluded.source,
            updated_at = excluded.updated_at`,
    args: [
      `audit_${batchItemId}`,
      batchItemId,
      String(item.fileName || ''),
      agencyId,
      agencyNames.get(agencyId) || null,
      status,
      status === 'SUCCESS' ? 1 : 0,
      item.error || null,
      processedAt,
      processedAt.slice(0, 10),
      authUser.id,
      authUser.email,
      authUser.name,
      'batch_processing',
      now,
      now,
    ] as InValue[],
  };
}

// GET /api/batch — Listar resultados (con filtro opcional por agencia)
batch.get('/', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const db = getDb();
  const agencyId = c.req.query('agencyId');

  let result;
  if (agencyId && agencyId !== 'GLOBAL') {
    const accessError = ensureAgencyAccess(c, authUser, agencyId);
    if (accessError) {
      return accessError;
    }

    result = await db.execute({
      sql: 'SELECT * FROM batch_items WHERE agency_id = ? ORDER BY created_at DESC',
      args: [agencyId],
    });
  } else if (authUser.role !== 'ADMIN') {
    result = await db.execute({
      sql: `SELECT * FROM batch_items
            WHERE agency_id IN (${authUser.agencyIds.map(() => '?').join(',')})
            ORDER BY created_at DESC`,
      args: authUser.agencyIds,
    });
  } else {
    result = await db.execute('SELECT * FROM batch_items ORDER BY created_at DESC');
  }

  return c.json(result.rows.map(buildBatchItem));
});

// POST /api/batch — Guardar resultados de un batch
batch.post('/', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const items = await c.req.json();
  const db = getDb();

  if (!Array.isArray(items) || items.length === 0) {
    return c.json({ error: 'Se requiere un array de items' }, 400);
  }

  for (const item of items as Array<Record<string, unknown>>) {
    const agencyId = String(item.agencyId || '');
    const accessError = ensureAgencyAccess(c, authUser, agencyId);
    if (accessError) {
      return accessError;
    }
  }

  const agencyIds = Array.from(new Set(
    (items as Array<Record<string, unknown>>)
      .map((item) => String(item.agencyId || ''))
      .filter(Boolean)
  ));
  const agencyNames = new Map<string, string>();
  if (agencyIds.length > 0) {
    const agencyRows = await db.execute({
      sql: `SELECT id, name FROM agencies WHERE id IN (${agencyIds.map(() => '?').join(',')})`,
      args: agencyIds,
    });

    for (const row of agencyRows.rows) {
      agencyNames.set(String(row.id), String(row.name));
    }
  }

  const batchItemStatements = items.map((item: Record<string, unknown>) => ({
      sql: `INSERT INTO batch_items (id, file_name, status, result_json, error, processed_at, user_email, agency_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        ON CONFLICT(id) DO NOTHING`,
      args: [
        item.id,
        item.fileName,
        item.status,
        item.result ? JSON.stringify(item.result) : null,
        item.error || null,
        item.processedAt || null,
        item.user || null,
        item.agencyId || null,
        item.createdAt || null,
      ] as InValue[],
    }));

  const auditStatements = (items as Array<Record<string, unknown>>)
    .filter((item) => AUDITABLE_STATUSES.has(String(item.status || '')))
    .map((item) => buildAuditStatement(item, authUser, agencyNames));

  await db.batch([...batchItemStatements, ...auditStatements]);

  return c.json({ ok: true, count: items.length }, 201);
});

// PUT /api/batch/:id — Actualizar un item
batch.put('/:id', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const id = c.req.param('id');
  const body = await c.req.json();
  const db = getDb();

  const existing = await db.execute({ sql: 'SELECT file_name, agency_id, created_at FROM batch_items WHERE id = ?', args: [id] });
  if (existing.rows.length === 0) {
    return c.json({ error: 'Item no encontrado' }, 404);
  }

  const existingRow = existing.rows[0];
  const agencyId = String(existingRow.agency_id || '');
  const accessError = ensureAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  const updateStatement = {
    sql: `UPDATE batch_items SET
            status = ?,
            result_json = ?,
            error = ?,
            processed_at = ?
          WHERE id = ?`,
    args: [
      body.status,
      body.result ? JSON.stringify(body.result) : null,
      body.error || null,
      body.processedAt || null,
      id,
    ],
  };

  if (AUDITABLE_STATUSES.has(String(body.status || ''))) {
    const agencyNames = new Map<string, string>();
    const agencyRows = await db.execute({ sql: 'SELECT id, name FROM agencies WHERE id = ?', args: [agencyId] });
    if (agencyRows.rows.length > 0) {
      agencyNames.set(String(agencyRows.rows[0].id), String(agencyRows.rows[0].name));
    }

    await db.batch([
      updateStatement,
      buildAuditStatement({
        ...body,
        id,
        fileName: body.fileName || existingRow.file_name,
        agencyId,
        createdAt: body.createdAt || existingRow.created_at,
      }, authUser, agencyNames),
    ]);
  } else {
    await db.execute(updateStatement);
  }

  const result = await db.execute({ sql: 'SELECT * FROM batch_items WHERE id = ?', args: [id] });
  if (result.rows.length === 0) {
    return c.json({ error: 'Item no encontrado' }, 404);
  }

  return c.json(buildBatchItem(result.rows[0]));
});

// DELETE /api/batch/items — Eliminar uno o varios items específicos
batch.delete('/items', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const body = await c.req.json().catch(() => null);
  const rawIds: unknown[] = Array.isArray(body?.ids) ? body.ids : [];
  const ids: string[] = Array.from(new Set(rawIds.map((id: unknown) => String(id)).filter(Boolean)));
  const db = getDb();

  if (ids.length === 0) {
    return c.json({ error: 'Se requiere al menos un id para eliminar.' }, 400);
  }

  const placeholders = ids.map(() => '?').join(',');
  const existing = await db.execute({
    sql: `SELECT id, agency_id FROM batch_items WHERE id IN (${placeholders})`,
    args: ids,
  });

  if (existing.rows.length === 0) {
    return c.json({ error: 'No se encontraron items para eliminar.' }, 404);
  }

  for (const row of existing.rows) {
    const accessError = ensureAgencyAccess(c, authUser, String(row.agency_id || ''));
    if (accessError) {
      return accessError;
    }
  }

  const existingIds: string[] = existing.rows.map((row) => String(row.id));
  const existingPlaceholders = existingIds.map(() => '?').join(',');
  await db.execute({
    sql: `DELETE FROM batch_items WHERE id IN (${existingPlaceholders})`,
    args: existingIds,
  });

  return c.json({ ok: true, count: existingIds.length, deletedIds: existingIds });
});

// DELETE /api/batch — Limpiar historial completo
batch.delete('/', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  if (authUser.role !== 'ADMIN') {
    return c.json({ error: 'Solo un administrador puede limpiar el historial completo.' }, 403);
  }

  const db = getDb();
  const agencyId = c.req.query('agencyId');

  if (agencyId && agencyId !== 'GLOBAL') {
    const accessError = ensureAgencyAccess(c, authUser, agencyId);
    if (accessError) {
      return accessError;
    }

    await db.execute({ sql: 'DELETE FROM batch_items WHERE agency_id = ?', args: [agencyId] });
  } else {
    await db.execute('DELETE FROM batch_items');
  }

  return c.json({ ok: true });
});

export default batch;
