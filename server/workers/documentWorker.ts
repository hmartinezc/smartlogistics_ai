import { randomUUID } from 'node:crypto';
import type { InValue } from '@libsql/client';
import { ERROR_MESSAGES } from '../../config.js';
import type { InvoiceData } from '../../types.js';
import { getDb } from '../db.js';
import {
  extractInvoiceFromBuffer,
  isDocumentExtractionConfigured,
} from '../services/documentExtractionService.js';
import { getDocumentObject, isMinioConfigured } from '../services/minioService.js';

type DocumentJobStatus = 'QUEUED' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

type DocumentJobRow = Record<string, unknown>;

interface DocumentWorkerConfig {
  enabled: boolean;
  pollIntervalMs: number;
  concurrency: number;
  staleProcessingMs: number;
}

interface BatchSyncInput {
  job: DocumentJobRow;
  status: Extract<DocumentJobStatus, 'SUCCESS' | 'ERROR'>;
  processedAt: string;
  result?: InvoiceData;
  error?: string;
}

export interface DocumentWorkerHandle {
  stop: () => Promise<void>;
}

let activeWorker: DocumentWorker | null = null;
let transactionQueue: Promise<void> = Promise.resolve();

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value || fallback);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getDocumentWorkerConfig(): DocumentWorkerConfig {
  return {
    enabled: String(process.env.DOCUMENT_WORKER_ENABLED || 'true').toLowerCase() !== 'false',
    pollIntervalMs: parsePositiveInteger(process.env.DOCUMENT_WORKER_POLL_MS, 5000),
    concurrency: Math.min(parsePositiveInteger(process.env.DOCUMENT_WORKER_CONCURRENCY, 1), 5),
    staleProcessingMs: parsePositiveInteger(
      process.env.DOCUMENT_WORKER_STALE_PROCESSING_MS,
      30 * 60 * 1000,
    ),
  };
}

function getString(row: DocumentJobRow, key: string, fallback = ''): string {
  const value = row[key];
  return value === null || value === undefined ? fallback : String(value);
}

function getNumber(row: DocumentJobRow, key: string, fallback = 0): number {
  const value = Number(row[key] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function getSqliteIntervalModifier(milliseconds: number): string {
  return `+${Math.ceil(milliseconds / 1000)} seconds`;
}

function buildPublicProcessingError(errorId: string): string {
  return `${ERROR_MESSAGES.PROCESSING_ERROR} Referencia: ${errorId}`;
}

async function resetInterruptedJobs(staleProcessingMs: number): Promise<void> {
  const database = getDb();
  const staleProcessingSeconds = Math.ceil(staleProcessingMs / 1000);

  await database.execute({
    sql: `UPDATE document_jobs SET
            status = 'QUEUED',
            started_at = NULL,
            updated_at = datetime('now'),
            error = 'Procesamiento reiniciado después de una interrupción.'
          WHERE status = 'PROCESSING'
            AND (
              lock_expires_at IS NULL
              OR unixepoch(lock_expires_at) <= unixepoch('now')
              OR (started_at IS NOT NULL AND unixepoch(started_at) <= unixepoch('now') - ?)
            )`,
    args: [staleProcessingSeconds],
  });
}

async function listQueuedJobIds(limit: number): Promise<string[]> {
  const database = getDb();
  const result = await database.execute({
    sql: `SELECT id
          FROM document_jobs
          WHERE status = 'QUEUED'
          ORDER BY COALESCE(queued_at, created_at), created_at
          LIMIT ?`,
    args: [limit],
  });

  return result.rows.map((row) => String(row.id));
}

async function claimJob(
  jobId: string,
  workerId: string,
  staleProcessingMs: number,
): Promise<DocumentJobRow | null> {
  const database = getDb();
  const result = await database.execute({
    sql: `UPDATE document_jobs SET
            status = 'PROCESSING',
            started_at = datetime('now'),
            updated_at = datetime('now'),
            locked_by = ?,
            lock_expires_at = datetime('now', ?),
            error = NULL
          WHERE id = ? AND status = 'QUEUED'
          RETURNING *`,
    args: [workerId, getSqliteIntervalModifier(staleProcessingMs), jobId],
  });

  return (result.rows[0] as DocumentJobRow | undefined) || null;
}

async function claimQueuedJobs(
  limit: number,
  workerId: string,
  staleProcessingMs: number,
): Promise<DocumentJobRow[]> {
  const jobIds = await listQueuedJobIds(limit);
  const claimedJobs: DocumentJobRow[] = [];

  for (const jobId of jobIds) {
    const claimedJob = await claimJob(jobId, workerId, staleProcessingMs);
    if (claimedJob) {
      claimedJobs.push(claimedJob);
    }
  }

  return claimedJobs;
}

async function getAgencyName(agencyId: string): Promise<string | null> {
  const database = getDb();
  const result = await database.execute({
    sql: 'SELECT name FROM agencies WHERE id = ?',
    args: [agencyId],
  });

  return result.rows[0]?.name ? String(result.rows[0].name) : null;
}

function buildBatchItemStatement(input: BatchSyncInput) {
  const resultJson = input.result ? JSON.stringify(input.result) : null;
  const error = input.error || null;

  return {
    sql: `INSERT INTO batch_items (
            id,
            file_name,
            status,
            result_json,
            error,
            processed_at,
            user_email,
            agency_id,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
          ON CONFLICT(id) DO UPDATE SET
            file_name = excluded.file_name,
            status = excluded.status,
            result_json = excluded.result_json,
            error = excluded.error,
            processed_at = excluded.processed_at,
            user_email = excluded.user_email,
            agency_id = excluded.agency_id`,
    args: [
      getString(input.job, 'id'),
      getString(input.job, 'original_file_name', 'document.pdf'),
      input.status,
      resultJson,
      error,
      input.processedAt,
      getString(input.job, 'user_email') || null,
      getString(input.job, 'agency_id') || null,
      getString(input.job, 'created_at') || null,
    ] as InValue[],
  };
}

function buildAuditStatement(input: BatchSyncInput, agencyName: string | null) {
  const jobId = getString(input.job, 'id');
  const processedDate = input.processedAt.slice(0, 10);
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
      `audit_${jobId}`,
      jobId,
      getString(input.job, 'original_file_name', 'document.pdf'),
      getString(input.job, 'agency_id'),
      agencyName,
      input.status,
      input.status === 'SUCCESS' ? 1 : 0,
      input.error || null,
      input.processedAt,
      processedDate,
      getString(input.job, 'user_id') || null,
      getString(input.job, 'user_email') || null,
      getString(input.job, 'user_name') || null,
      'document_worker',
      now,
      now,
    ] as InValue[],
  };
}

async function buildBatchAndAuditStatements(input: BatchSyncInput) {
  const agencyName = await getAgencyName(getString(input.job, 'agency_id'));

  return [buildBatchItemStatement(input), buildAuditStatement(input, agencyName)];
}

async function runTransaction(work: () => Promise<void>): Promise<void> {
  let releaseTransaction: () => void = () => undefined;
  const previousTransaction = transactionQueue;
  transactionQueue = new Promise<void>((resolve) => {
    releaseTransaction = resolve;
  });

  await previousTransaction;

  try {
    const database = getDb();
    await database.execute('BEGIN IMMEDIATE TRANSACTION');
    await work();
    await database.execute('COMMIT');
  } catch (error) {
    const database = getDb();
    await database.execute('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    releaseTransaction();
  }
}

async function markJobSuccess(
  job: DocumentJobRow,
  result: InvoiceData,
  workerId: string,
): Promise<void> {
  const processedAt = new Date().toISOString();
  const resultJson = JSON.stringify(result);
  const syncStatements = await buildBatchAndAuditStatements({
    job,
    status: 'SUCCESS',
    processedAt,
    result,
  });

  await runTransaction(async () => {
    const database = getDb();
    const updateResult = await database.execute({
      sql: `UPDATE document_jobs SET
              status = 'SUCCESS',
              result_json = ?,
              error = NULL,
              processed_at = ?,
              locked_by = NULL,
              lock_expires_at = NULL,
              updated_at = datetime('now')
            WHERE id = ? AND status = 'PROCESSING' AND locked_by = ?
            RETURNING id`,
      args: [resultJson, processedAt, getString(job, 'id'), workerId],
    });

    if (updateResult.rows.length === 0) {
      return;
    }

    for (const statement of syncStatements) {
      await database.execute(statement);
    }
  });
}

async function requeueJob(
  job: DocumentJobRow,
  errorMessage: string,
  workerId: string,
): Promise<void> {
  const database = getDb();
  await database.execute({
    sql: `UPDATE document_jobs SET
            status = 'QUEUED',
            retry_count = retry_count + 1,
            queued_at = datetime('now'),
            started_at = NULL,
            result_json = NULL,
            processed_at = NULL,
            locked_by = NULL,
            lock_expires_at = NULL,
            error = ?,
            updated_at = datetime('now')
          WHERE id = ? AND status = 'PROCESSING' AND locked_by = ?`,
    args: [errorMessage, getString(job, 'id'), workerId],
  });
}

async function markJobFailure(
  job: DocumentJobRow,
  errorMessage: string,
  workerId: string,
): Promise<void> {
  const processedAt = new Date().toISOString();
  const syncStatements = await buildBatchAndAuditStatements({
    job,
    status: 'ERROR',
    processedAt,
    error: errorMessage,
  });

  await runTransaction(async () => {
    const database = getDb();
    const updateResult = await database.execute({
      sql: `UPDATE document_jobs SET
              status = 'ERROR',
              retry_count = retry_count + 1,
              result_json = NULL,
              error = ?,
              processed_at = ?,
              locked_by = NULL,
              lock_expires_at = NULL,
              updated_at = datetime('now')
            WHERE id = ? AND status = 'PROCESSING' AND locked_by = ?
            RETURNING id`,
      args: [errorMessage, processedAt, getString(job, 'id'), workerId],
    });

    if (updateResult.rows.length === 0) {
      return;
    }

    for (const statement of syncStatements) {
      await database.execute(statement);
    }
  });
}

async function handleJobError(
  job: DocumentJobRow,
  error: unknown,
  workerId: string,
): Promise<void> {
  const errorId = randomUUID();
  const publicError = buildPublicProcessingError(errorId);
  const retryCount = getNumber(job, 'retry_count');
  const maxRetries = getNumber(job, 'max_retries', 3);

  console.error(`[${errorId}] Error procesando documento ${getString(job, 'id')}:`, error);

  if (retryCount < maxRetries) {
    await requeueJob(job, publicError, workerId);
    return;
  }

  await markJobFailure(job, publicError, workerId);
}

async function processJob(job: DocumentJobRow, workerId: string): Promise<void> {
  try {
    const pdfBuffer = await getDocumentObject(getString(job, 'object_key'));
    const result = await extractInvoiceFromBuffer({
      buffer: pdfBuffer,
      mimeType: getString(job, 'mime_type', 'application/pdf'),
      format: getString(job, 'extraction_format', 'AGENT_GENERIC_A'),
    });

    await markJobSuccess(job, result, workerId);
  } catch (error) {
    await handleJobError(job, error, workerId);
  }
}

class DocumentWorker {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isStopping = false;
  private currentTick: Promise<void> | null = null;
  private readonly workerId = randomUUID();

  constructor(private readonly config: DocumentWorkerConfig) {}

  async start(): Promise<void> {
    await resetInterruptedJobs(this.config.staleProcessingMs);
    this.timer = setInterval(() => {
      this.runTick();
    }, this.config.pollIntervalMs);
    this.timer.unref?.();
    this.runTick();
  }

  async stop(): Promise<void> {
    this.isStopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.currentTick) {
      await this.currentTick;
    }
  }

  private runTick(): void {
    if (this.currentTick || this.isStopping) {
      return;
    }

    this.currentTick = this.tick().finally(() => {
      this.currentTick = null;
    });
  }

  private async tick(): Promise<void> {
    if (this.isRunning || this.isStopping) {
      return;
    }

    this.isRunning = true;
    try {
      await resetInterruptedJobs(this.config.staleProcessingMs);

      const jobs = await claimQueuedJobs(
        this.config.concurrency,
        this.workerId,
        this.config.staleProcessingMs,
      );
      if (jobs.length === 0) {
        return;
      }

      await Promise.allSettled(jobs.map((job) => processJob(job, this.workerId)));
    } catch (error) {
      console.error('Error en document worker:', error);
    } finally {
      this.isRunning = false;
    }
  }
}

export async function startDocumentWorker(): Promise<DocumentWorkerHandle | null> {
  if (activeWorker) {
    return activeWorker;
  }

  const config = getDocumentWorkerConfig();
  if (!config.enabled) {
    console.log('Document worker deshabilitado por DOCUMENT_WORKER_ENABLED=false.');
    return null;
  }

  if (!isMinioConfigured()) {
    console.log('Document worker deshabilitado: MinIO no está configurado.');
    return null;
  }

  if (!isDocumentExtractionConfigured()) {
    console.log('Document worker deshabilitado: GEMINI_API_KEY no está configurada.');
    return null;
  }

  activeWorker = new DocumentWorker(config);
  await activeWorker.start();
  console.log(
    `Document worker activo: concurrency=${config.concurrency}, poll=${config.pollIntervalMs}ms`,
  );

  return activeWorker;
}
