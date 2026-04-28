// ============================================
// RUTAS DE AUDITORÍA — /api/audit
// ============================================

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { InValue } from '@libsql/client';
import { getDb } from '../db.js';
import { ensureAgencyAccess, requireAuth } from '../security.js';

const audit = new Hono();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function buildAuditEntry(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    batchItemId: String(row.batch_item_id),
    fileName: String(row.file_name),
    agencyId: String(row.agency_id),
    agencyName: row.agency_name ? String(row.agency_name) : undefined,
    status: String(row.status) as 'SUCCESS' | 'ERROR',
    extractionOk: Boolean(row.extraction_ok),
    error: row.error ? String(row.error) : undefined,
    processedAt: String(row.processed_at),
    processedDate: String(row.processed_date),
    userId: row.user_id ? String(row.user_id) : undefined,
    userEmail: row.user_email ? String(row.user_email) : undefined,
    userName: row.user_name ? String(row.user_name) : undefined,
    source: String(row.source),
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function getNextMonthStart(monthValue: string): string | null {
  if (!MONTH_RE.test(monthValue)) {
    return null;
  }

  const [year, month] = monthValue.split('-').map(Number);
  if (!year || month < 1 || month > 12) {
    return null;
  }

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

function appendDateFilter(c: Context, where: string[], args: InValue[]): Response | null {
  const month = c.req.query('month');
  const date = c.req.query('date');
  const from = c.req.query('from');
  const to = c.req.query('to');

  if (month) {
    const nextMonthStart = getNextMonthStart(month);
    if (!nextMonthStart) {
      return c.json({ error: 'El parámetro month debe tener formato YYYY-MM.' }, 400);
    }

    where.push('processed_date >= ? AND processed_date < ?');
    args.push(`${month}-01`, nextMonthStart);
  }

  if (date) {
    if (!DATE_RE.test(date)) {
      return c.json({ error: 'El parámetro date debe tener formato YYYY-MM-DD.' }, 400);
    }

    where.push('processed_date = ?');
    args.push(date);
  }

  if (from) {
    if (!DATE_RE.test(from)) {
      return c.json({ error: 'El parámetro from debe tener formato YYYY-MM-DD.' }, 400);
    }

    where.push('processed_date >= ?');
    args.push(from);
  }

  if (to) {
    if (!DATE_RE.test(to)) {
      return c.json({ error: 'El parámetro to debe tener formato YYYY-MM-DD.' }, 400);
    }

    where.push('processed_date <= ?');
    args.push(to);
  }

  return null;
}

// GET /api/audit/document-processing
audit.get('/document-processing', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const agencyId = c.req.query('agencyId');
  const where: string[] = [];
  const args: InValue[] = [];

  if (agencyId && agencyId !== 'GLOBAL') {
    const accessError = ensureAgencyAccess(c, authUser, agencyId);
    if (accessError) {
      return accessError;
    }

    where.push('agency_id = ?');
    args.push(agencyId);
  } else if (agencyId === 'GLOBAL' && authUser.role !== 'ADMIN') {
    return c.json({ error: 'No autorizado para consultar auditoría global.' }, 403);
  } else if (authUser.role !== 'ADMIN') {
    if (authUser.agencyIds.length === 0) {
      return c.json([]);
    }

    where.push(`agency_id IN (${authUser.agencyIds.map(() => '?').join(',')})`);
    args.push(...authUser.agencyIds);
  }

  const dateFilterError = appendDateFilter(c, where, args);
  if (dateFilterError) {
    return dateFilterError;
  }

  const sql = `SELECT * FROM document_processing_audit
               ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY processed_date DESC, processed_at DESC`;

  const result = await getDb().execute({ sql, args });
  return c.json(result.rows.map(buildAuditEntry));
});

export default audit;