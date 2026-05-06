// ============================================
// RUTAS DE DOCUMENTOS — /api/documents
// ============================================
// Carga PDFs a MinIO y prepara una cola persistente para procesamiento en background.
// No reemplaza /api/ai ni /api/batch; convive con el flujo actual.
// ============================================

import { randomUUID } from 'node:crypto';
import type { InValue } from '@libsql/client';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getDb } from '../db.js';
import type { AuthUser } from '../security.js';
import { ensureAgencyAccess, hasAgencyAccess, requireAuth } from '../security.js';
import {
  buildDocumentObjectKey,
  getInvoiceBucketName,
  putDocumentObject,
  removeDocumentObject,
} from '../services/minioService.js';

const documents = new Hono();

const DOCUMENT_JOB_STATUSES = new Set([
  'UPLOADED',
  'QUEUED',
  'PROCESSING',
  'SUCCESS',
  'ERROR',
  'CANCELLED',
]);
const QUEUEABLE_STATUSES = new Set(['UPLOADED', 'ERROR']);
const DELETABLE_STATUSES = new Set(['UPLOADED', 'SUCCESS', 'ERROR', 'CANCELLED']);
const ALLOWED_EXTRACTION_FORMATS = new Set([
  'AGENT_TCBV',
  'AGENT_GENERIC_A',
  'AGENT_GENERIC_B',
  'AGENT_CUSTOMS',
]);
const DEFAULT_EXTRACTION_FORMAT = 'AGENT_GENERIC_A';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;
const MAX_FILES_PER_UPLOAD = 50;
const MAX_JOB_IDS_PER_REQUEST = 200;
const MAX_BATCH_ID_LENGTH = 80;
const MAX_ORIGINAL_FILE_NAME_LENGTH = 180;
const MAX_JSON_BODY_BYTES = 64 * 1024;
const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_UPLOAD_TOTAL_BYTES = 100 * 1024 * 1024;
const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DocumentJobStatus = 'UPLOADED' | 'QUEUED' | 'PROCESSING' | 'SUCCESS' | 'ERROR' | 'CANCELLED';

type DocumentJobRow = Record<string, unknown>;

interface PreparedUploadFile {
  file: File;
  buffer: Buffer;
  originalFileName: string;
}

documents.use(
  '/upload',
  bodyLimit({
    maxSize: getMaxUploadTotalBytes(),
    onError: (c) => c.json({ error: 'La carga supera el tamaño máximo permitido.' }, 413),
  }),
);

function getMaxUploadBytes(): number {
  const value = Number(process.env.DOCUMENT_UPLOAD_MAX_BYTES || DEFAULT_MAX_UPLOAD_BYTES);

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_UPLOAD_BYTES;
  }

  return Math.floor(value);
}

function getMaxUploadTotalBytes(): number {
  const value = Number(
    process.env.DOCUMENT_UPLOAD_MAX_TOTAL_BYTES || DEFAULT_MAX_UPLOAD_TOTAL_BYTES,
  );

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_UPLOAD_TOTAL_BYTES;
  }

  return Math.floor(value);
}

function getFormDataValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStatus(value: string | undefined): DocumentJobStatus | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (!DOCUMENT_JOB_STATUSES.has(normalized)) {
    return null;
  }

  return normalized as DocumentJobStatus;
}

function parseLimit(value: string | undefined): number {
  const parsed = Number(value || DEFAULT_LIST_LIMIT);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_LIST_LIMIT;
  }

  return Math.min(parsed, MAX_LIST_LIMIT);
}

function parseOffset(value: string | undefined): number {
  const parsed = Number(value || 0);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function parseMaxRetries(value: string): number {
  if (!value) {
    return DEFAULT_MAX_RETRIES;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10) {
    return DEFAULT_MAX_RETRIES;
  }

  return parsed;
}

function normalizeJobIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)),
  );
}

function hasInvalidJobId(jobIds: string[]): boolean {
  return jobIds.some((jobId) => jobId.length > 80 || !JOB_ID_PATTERN.test(jobId));
}

function isSafeRequestIdentifier(value: string): boolean {
  return value.length <= 80 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function getOriginalFileName(file: File): string {
  return sanitizeText(file.name || 'document.pdf', MAX_ORIGINAL_FILE_NAME_LENGTH) || 'document.pdf';
}

function normalizeBatchId(value: string): string | null {
  if (!value) {
    return randomUUID();
  }

  if (value.length > MAX_BATCH_ID_LENGTH || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    return null;
  }

  return value;
}

function normalizeExtractionFormat(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return ALLOWED_EXTRACTION_FORMATS.has(normalized) ? normalized : null;
}

function isFileLike(value: unknown): value is File {
  return value instanceof File;
}

function collectUploadFiles(formData: FormData): File[] {
  const files: File[] = [];

  for (const value of [...formData.getAll('file'), ...formData.getAll('files')]) {
    if (isFileLike(value)) {
      files.push(value);
    }
  }

  return files;
}

function isPdfFile(file: File): boolean {
  const fileName = file.name.toLowerCase();
  const mimeType = file.type.toLowerCase();

  return (
    fileName.endsWith('.pdf') &&
    (!mimeType || mimeType === 'application/pdf' || mimeType === 'application/octet-stream')
  );
}

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function parseResultJson(value: unknown): unknown | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function buildDocumentJob(row: DocumentJobRow) {
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    agencyId: String(row.agency_id),
    status: String(row.status) as DocumentJobStatus,
    originalFileName: String(row.original_file_name),
    fileSizeBytes: Number(row.file_size_bytes || 0),
    mimeType: String(row.mime_type || 'application/pdf'),
    extractionFormat: String(row.extraction_format || DEFAULT_EXTRACTION_FORMAT),
    retryCount: Number(row.retry_count || 0),
    maxRetries: Number(row.max_retries || DEFAULT_MAX_RETRIES),
    result: parseResultJson(row.result_json),
    error: row.error ? String(row.error) : null,
    queuedAt: row.queued_at ? String(row.queued_at) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    processedAt: row.processed_at ? String(row.processed_at) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    user: {
      id: row.user_id ? String(row.user_id) : null,
      email: row.user_email ? String(row.user_email) : null,
      name: row.user_name ? String(row.user_name) : null,
    },
  };
}

function buildStatusSummary(rows: DocumentJobRow[]): Record<string, number> {
  const summary: Record<string, number> = {
    UPLOADED: 0,
    QUEUED: 0,
    PROCESSING: 0,
    SUCCESS: 0,
    ERROR: 0,
    CANCELLED: 0,
  };

  for (const row of rows) {
    const status = String(row.status || '');
    summary[status] = Number(row.total || 0);
  }

  return summary;
}

async function ensureAgencyExists(agencyId: string): Promise<boolean> {
  const database = getDb();
  const result = await database.execute({
    sql: 'SELECT id FROM agencies WHERE id = ? AND is_active = 1',
    args: [agencyId],
  });

  return result.rows.length > 0;
}

function getAccessibleAgencyFilter(authUser: AuthUser, args: InValue[]): string | null {
  if (authUser.role === 'ADMIN') {
    return null;
  }

  if (authUser.agencyIds.length === 0) {
    return '1 = 0';
  }

  args.push(...authUser.agencyIds);
  return `agency_id IN (${authUser.agencyIds.map(() => '?').join(',')})`;
}

async function getDocumentRowsByIds(jobIds: string[]): Promise<DocumentJobRow[]> {
  if (jobIds.length === 0) {
    return [];
  }

  const database = getDb();
  const result = await database.execute({
    sql: `SELECT * FROM document_jobs WHERE id IN (${jobIds.map(() => '?').join(',')})`,
    args: jobIds,
  });

  return result.rows as DocumentJobRow[];
}

async function queueEligibleJobs(
  rows: DocumentJobRow[],
): Promise<{ queuedCount: number; rows: DocumentJobRow[] }> {
  const eligibleJobIds = rows
    .filter((row) => QUEUEABLE_STATUSES.has(String(row.status || '')))
    .map((row) => String(row.id));

  let queuedCount = 0;

  if (eligibleJobIds.length > 0) {
    const database = getDb();
    const result = await database.execute({
      sql: `UPDATE document_jobs SET
              status = 'QUEUED',
              queued_at = datetime('now'),
              started_at = NULL,
              processed_at = NULL,
              error = NULL,
              updated_at = datetime('now'),
              retry_count = CASE WHEN status = 'ERROR' THEN 0 ELSE retry_count END
            WHERE id IN (${eligibleJobIds.map(() => '?').join(',')})
              AND status IN ('UPLOADED', 'ERROR')
              AND locked_by IS NULL
            RETURNING id`,
      args: eligibleJobIds,
    });

    queuedCount = result.rows.length;
  }

  return {
    queuedCount,
    rows: await getDocumentRowsByIds(rows.map((row) => String(row.id))),
  };
}

// GET /api/documents — Listar jobs con filtros opcionales
// Filtros: agencyId, status, batchId, limit, offset, dateFrom, dateTo
documents.get('/', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const agencyId = c.req.query('agencyId');
  const status = normalizeStatus(c.req.query('status'));
  const statusQuery = c.req.query('status');
  const batchId = c.req.query('batchId')?.trim();
  const limit = parseLimit(c.req.query('limit'));
  const offset = parseOffset(c.req.query('offset'));
  const dateFrom = c.req.query('dateFrom')?.trim();
  const dateTo = c.req.query('dateTo')?.trim();
  const whereParts: string[] = [];
  const args: InValue[] = [];
  const countArgs: InValue[] = [];

  if (statusQuery && !status) {
    return c.json({ error: 'Estado de documento inválido.' }, 400);
  }

  if (agencyId) {
    const accessError = ensureAgencyAccess(c, authUser, agencyId);
    if (accessError) {
      return accessError;
    }

    whereParts.push('agency_id = ?');
    args.push(agencyId);
    countArgs.push(agencyId);
  } else {
    const agencyFilter = getAccessibleAgencyFilter(authUser, args);
    const countAgencyFilter = getAccessibleAgencyFilter(authUser, countArgs);
    if (agencyFilter) {
      whereParts.push(agencyFilter);
    }
  }

  if (status) {
    whereParts.push('status = ?');
    args.push(status);
    countArgs.push(status);
  }

  if (batchId) {
    whereParts.push('batch_id = ?');
    args.push(batchId);
    countArgs.push(batchId);
  }

  if (dateFrom) {
    whereParts.push('created_at >= ?');
    args.push(dateFrom);
    countArgs.push(dateFrom);
  }

  if (dateTo) {
    whereParts.push('created_at <= ?');
    args.push(dateTo + ' 23:59:59');
    countArgs.push(dateTo + ' 23:59:59');
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const database = getDb();
  const result = await database.execute({
    sql: `SELECT * FROM document_jobs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  });

  const countResult = await database.execute({
    sql: `SELECT COUNT(*) as total FROM document_jobs ${whereClause}`,
    args: countArgs,
  });
  const total = Number(countResult.rows[0]?.total || 0);

  const summaryResult = await database.execute({
    sql: `SELECT status, COUNT(*) as total FROM document_jobs ${whereClause} GROUP BY status`,
    args: countArgs,
  });

  return c.json({
    jobs: result.rows.map((row) => buildDocumentJob(row as DocumentJobRow)),
    summary: buildStatusSummary(summaryResult.rows as DocumentJobRow[]),
    limit,
    offset,
    total,
  });
});

// GET /api/documents/status/:id — Estado de un job
documents.get('/status/:id', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const rows = await getDocumentRowsByIds([c.req.param('id')]);
  if (rows.length === 0) {
    return c.json({ error: 'Documento no encontrado.' }, 404);
  }

  const row = rows[0];
  if (!hasAgencyAccess(authUser, String(row.agency_id || ''))) {
    return c.json({ error: 'Documento no encontrado.' }, 404);
  }

  return c.json(buildDocumentJob(row));
});

// POST /api/documents/upload — Cargar uno o varios PDFs a MinIO
documents.post('/upload', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Solicitud inválida. Use multipart/form-data.' }, 400);
  }

  const agencyId = getFormDataValue(formData, 'agencyId');
  if (!agencyId) {
    return c.json({ error: 'Se requiere agencyId.' }, 400);
  }

  const accessError = ensureAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  if (!(await ensureAgencyExists(agencyId))) {
    return c.json({ error: 'Agencia no encontrada o inactiva.' }, 404);
  }

  const files = collectUploadFiles(formData);
  if (files.length === 0) {
    return c.json({ error: 'Archivo PDF requerido.' }, 400);
  }

  if (files.length > MAX_FILES_PER_UPLOAD) {
    return c.json({ error: `Máximo ${MAX_FILES_PER_UPLOAD} archivos por carga.` }, 400);
  }

  const maxUploadBytes = getMaxUploadBytes();
  const maxUploadTotalBytes = getMaxUploadTotalBytes();
  const totalUploadBytes = files.reduce((total, file) => total + file.size, 0);

  if (totalUploadBytes > maxUploadTotalBytes) {
    return c.json({ error: 'La carga supera el tamaño máximo permitido.' }, 413);
  }

  for (const file of files) {
    const originalFileName = getOriginalFileName(file);

    if (!isPdfFile(file)) {
      return c.json({ error: `Solo se aceptan PDFs: ${originalFileName}.` }, 400);
    }

    if (file.size <= 0) {
      return c.json({ error: `El archivo está vacío: ${originalFileName}.` }, 400);
    }

    if (file.size > maxUploadBytes) {
      return c.json(
        { error: `El archivo supera el tamaño máximo permitido: ${originalFileName}.` },
        400,
      );
    }
  }

  const batchId = normalizeBatchId(getFormDataValue(formData, 'batchId'));
  if (!batchId) {
    return c.json({ error: 'batchId inválido.' }, 400);
  }

  const extractionFormat = normalizeExtractionFormat(
    getFormDataValue(formData, 'format') || DEFAULT_EXTRACTION_FORMAT,
  );
  if (!extractionFormat) {
    return c.json({ error: 'Formato de extracción inválido.' }, 400);
  }

  const maxRetries = parseMaxRetries(getFormDataValue(formData, 'maxRetries'));
  const database = getDb();

  const agencyNameRow = await database.execute({
    sql: 'SELECT name FROM agencies WHERE id = ?',
    args: [agencyId],
  });
  const agencyName = agencyNameRow.rows.length > 0 ? String(agencyNameRow.rows[0].name) : '';

  const jobs: ReturnType<typeof buildDocumentJob>[] = [];
  const errors: Array<{ fileName: string; error: string; errorId: string }> = [];
  const preparedFiles: PreparedUploadFile[] = [];

  for (const file of files) {
    const originalFileName = getOriginalFileName(file);
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!isPdfBuffer(buffer)) {
      return c.json({ error: `El archivo no parece ser un PDF válido: ${originalFileName}.` }, 400);
    }

    preparedFiles.push({ file, buffer, originalFileName });
  }

  for (const { file, buffer, originalFileName } of preparedFiles) {
    const documentId = randomUUID();
    const objectKey = buildDocumentObjectKey({
      agencyId,
      agencyName,
      originalFilename: originalFileName,
      documentId,
    });
    let uploaded = false;

    try {
      await putDocumentObject({
        objectKey,
        buffer,
        contentType: 'application/pdf',
      });
      uploaded = true;

      await database.execute({
        sql: `INSERT INTO document_jobs (
                id,
                batch_id,
                agency_id,
                user_id,
                user_email,
                user_name,
                status,
                storage_bucket,
                object_key,
                original_file_name,
                file_size_bytes,
                mime_type,
                extraction_format,
                max_retries,
                created_at,
                updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, 'UPLOADED', ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: [
          documentId,
          batchId,
          agencyId,
          authUser.id,
          authUser.email,
          authUser.name,
          getInvoiceBucketName(),
          objectKey,
          originalFileName,
          file.size,
          'application/pdf',
          extractionFormat,
          maxRetries,
        ],
      });

      const rows = await getDocumentRowsByIds([documentId]);
      if (rows[0]) {
        jobs.push(buildDocumentJob(rows[0]));
      }
    } catch (error) {
      if (uploaded) {
        await removeDocumentObject(objectKey).catch(() => undefined);
      }

      const errorId = randomUUID();
      console.error(`[${errorId}] Error cargando documento ${originalFileName}:`, error);
      errors.push({
        fileName: originalFileName,
        error: 'No se pudo cargar el documento.',
        errorId,
      });
    }
  }

  if (jobs.length === 0) {
    return c.json({ error: 'No se pudo cargar ningún documento.', errors }, 503);
  }

  return c.json(
    {
      batchId,
      count: jobs.length,
      jobs,
      errors,
    },
    201,
  );
});

// POST /api/documents/process — Poner jobs cargados en cola
documents.post(
  '/process',
  bodyLimit({
    maxSize: MAX_JSON_BODY_BYTES,
    onError: (c) => c.json({ error: 'La solicitud supera el tamaño máximo permitido.' }, 413),
  }),
  async (c) => {
    const authUser = await requireAuth(c);
    if (authUser instanceof Response) {
      return authUser;
    }

    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Solicitud JSON inválida.' }, 400);
    }

    let rows: DocumentJobRow[] = [];
    const requestedAgencyId = typeof body.agencyId === 'string' ? body.agencyId.trim() : '';

    if (!requestedAgencyId || !isSafeRequestIdentifier(requestedAgencyId)) {
      return c.json({ error: 'Se requiere agencyId válido.' }, 400);
    }

    const accessError = ensureAgencyAccess(c, authUser, requestedAgencyId);
    if (accessError) {
      return accessError;
    }

    if (Array.isArray(body.jobIds)) {
      const jobIds = normalizeJobIds(body.jobIds);

      if (jobIds.length === 0) {
        return c.json({ error: 'Se requiere al menos un jobId.' }, 400);
      }

      if (hasInvalidJobId(jobIds)) {
        return c.json({ error: 'Uno o más jobIds son inválidos.' }, 400);
      }

      if (jobIds.length > MAX_JOB_IDS_PER_REQUEST) {
        return c.json({ error: `Máximo ${MAX_JOB_IDS_PER_REQUEST} jobs por solicitud.` }, 400);
      }

      rows = await getDocumentRowsByIds(jobIds);
      if (rows.length !== jobIds.length) {
        return c.json({ error: 'Uno o más documentos no existen.' }, 404);
      }
    } else {
      const batchId = typeof body.batchId === 'string' ? body.batchId.trim() : '';

      if (!batchId || !isSafeRequestIdentifier(batchId)) {
        return c.json({ error: 'Se requiere jobIds o batchId con agencyId.' }, 400);
      }

      const database = getDb();
      const result = await database.execute({
        sql: 'SELECT * FROM document_jobs WHERE batch_id = ? AND agency_id = ?',
        args: [batchId, requestedAgencyId],
      });
      rows = result.rows as DocumentJobRow[];
    }

    if (rows.length === 0) {
      return c.json({ error: 'No hay documentos para procesar.' }, 404);
    }

    const hasRestrictedRows = rows.some(
      (row) => !hasAgencyAccess(authUser, String(row.agency_id || '')),
    );
    if (hasRestrictedRows) {
      return c.json({ error: 'Uno o más documentos no existen.' }, 404);
    }

    if (
      requestedAgencyId &&
      rows.some((row) => String(row.agency_id || '') !== requestedAgencyId)
    ) {
      return c.json({ error: 'Uno o más documentos no existen.' }, 404);
    }

    const queuedResult = await queueEligibleJobs(rows);

    return c.json({
      queuedCount: queuedResult.queuedCount,
      skippedCount: rows.length - queuedResult.queuedCount,
      jobs: queuedResult.rows.map(buildDocumentJob),
    });
  },
);

// DELETE /api/documents — Eliminar PDFs de MinIO y sus jobs inactivos
documents.delete(
  '/',
  bodyLimit({
    maxSize: MAX_JSON_BODY_BYTES,
    onError: (c) => c.json({ error: 'La solicitud supera el tamaño máximo permitido.' }, 413),
  }),
  async (c) => {
    const authUser = await requireAuth(c);
    if (authUser instanceof Response) {
      return authUser;
    }

    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Solicitud JSON inválida.' }, 400);
    }

    const jobIds = normalizeJobIds(body.jobIds);
    if (jobIds.length === 0) {
      return c.json({ error: 'Se requiere al menos un jobId.' }, 400);
    }

    if (hasInvalidJobId(jobIds)) {
      return c.json({ error: 'Uno o más jobIds son inválidos.' }, 400);
    }

    if (jobIds.length > MAX_JOB_IDS_PER_REQUEST) {
      return c.json({ error: `Máximo ${MAX_JOB_IDS_PER_REQUEST} jobs por solicitud.` }, 400);
    }

    const requestedAgencyId = typeof body.agencyId === 'string' ? body.agencyId.trim() : '';
    if (!requestedAgencyId || !isSafeRequestIdentifier(requestedAgencyId)) {
      return c.json({ error: 'Se requiere agencyId válido.' }, 400);
    }

    const accessError = ensureAgencyAccess(c, authUser, requestedAgencyId);
    if (accessError) {
      return accessError;
    }

    const rows = await getDocumentRowsByIds(jobIds);
    if (rows.length !== jobIds.length) {
      return c.json({ error: 'Uno o más documentos no existen.' }, 404);
    }

    const hasRestrictedRows = rows.some(
      (row) => !hasAgencyAccess(authUser, String(row.agency_id || '')),
    );
    if (hasRestrictedRows) {
      return c.json({ error: 'Uno o más documentos no existen.' }, 404);
    }

    if (rows.some((row) => String(row.agency_id || '') !== requestedAgencyId)) {
      return c.json({ error: 'Uno o más documentos no existen.' }, 404);
    }

    const blockedRows = rows.filter((row) => !DELETABLE_STATUSES.has(String(row.status || '')));
    if (blockedRows.length > 0) {
      return c.json(
        {
          error: 'No se pueden eliminar documentos en cola o procesamiento.',
          blockedIds: blockedRows.map((row) => String(row.id)),
        },
        409,
      );
    }

    const database = getDb();
    const deletionLockId = `delete:${randomUUID()}`;
    const deletedIds: string[] = [];
    const errors: Array<{ id: string; fileName: string; error: string; errorId: string }> = [];
    let freedBytes = 0;

    for (const row of rows) {
      const id = String(row.id);
      const fileName = String(row.original_file_name || 'documento.pdf');
      const objectKey = String(row.object_key || '');
      let objectRemoved = false;

      try {
        if (!objectKey) {
          throw new Error('Documento sin object_key.');
        }

        const claimResult = await database.execute({
          sql: `UPDATE document_jobs SET
                locked_by = ?,
                lock_expires_at = datetime('now', '+10 minutes'),
                updated_at = datetime('now')
              WHERE id = ?
                AND agency_id = ?
                AND status IN ('UPLOADED', 'SUCCESS', 'ERROR', 'CANCELLED')
                AND (
                  locked_by IS NULL
                  OR (locked_by LIKE 'delete:%' AND lock_expires_at < datetime('now'))
                )
              RETURNING id`,
          args: [deletionLockId, id, requestedAgencyId],
        });

        if (claimResult.rows.length === 0) {
          throw new Error('El documento cambió de estado antes de eliminarse.');
        }

        await removeDocumentObject(objectKey);
        objectRemoved = true;

        const deleteResult = await database.execute({
          sql: `DELETE FROM document_jobs
              WHERE id = ? AND locked_by = ?
              RETURNING id`,
          args: [id, deletionLockId],
        });

        if (deleteResult.rows.length === 0) {
          throw new Error('El documento cambió de estado antes de eliminarse.');
        }

        deletedIds.push(id);
        freedBytes += Number(row.file_size_bytes || 0);
      } catch (error) {
        if (!objectRemoved) {
          await database
            .execute({
              sql: `UPDATE document_jobs SET
                    locked_by = NULL,
                    lock_expires_at = NULL,
                    updated_at = datetime('now')
                  WHERE id = ? AND locked_by = ?`,
              args: [id, deletionLockId],
            })
            .catch(() => undefined);
        }

        const errorId = randomUUID();
        console.error(`[${errorId}] Error eliminando documento ${id}:`, error);
        errors.push({
          id,
          fileName,
          error: 'No se pudo eliminar el documento.',
          errorId,
        });
      }
    }

    return c.json(
      {
        deletedCount: deletedIds.length,
        deletedIds,
        freedBytes,
        errors,
      },
      deletedIds.length === 0 && errors.length > 0 ? 503 : 200,
    );
  },
);

export default documents;
