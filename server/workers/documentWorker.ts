import { randomUUID } from 'node:crypto';
import type { InValue } from '@libsql/client';
import { ERROR_MESSAGES } from '../../config.js';
import {
  normalizeInvoiceDataAirwaybills,
  sanitizeHawbFormatPattern,
} from '../../shared/airwaybillFormat.js';
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
  jobTimeoutMs: number;
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

const DEFAULT_WORKER_CONCURRENCY = 5;
const MAX_WORKER_CONCURRENCY = 5;
const DEFAULT_WORKER_POLL_MS = 7_000;
const DEFAULT_WORKER_JOB_TIMEOUT_MS = 300_000;
const DEFAULT_STALE_PROCESSING_MS = 2_100_000;

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
    pollIntervalMs: parsePositiveInteger(
      process.env.DOCUMENT_WORKER_POLL_MS,
      DEFAULT_WORKER_POLL_MS,
    ),
    concurrency: Math.min(
      parsePositiveInteger(process.env.DOCUMENT_WORKER_CONCURRENCY, DEFAULT_WORKER_CONCURRENCY),
      MAX_WORKER_CONCURRENCY,
    ),
    jobTimeoutMs: parsePositiveInteger(
      process.env.DOCUMENT_WORKER_JOB_TIMEOUT_MS,
      DEFAULT_WORKER_JOB_TIMEOUT_MS,
    ),
    staleProcessingMs: parsePositiveInteger(
      process.env.DOCUMENT_WORKER_STALE_PROCESSING_MS,
      DEFAULT_STALE_PROCESSING_MS,
    ),
  };
}

export function getDocumentWorkerRuntimeConfig(): DocumentWorkerConfig & { active: boolean } {
  return {
    ...getDocumentWorkerConfig(),
    active: Boolean(activeWorker),
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
            AND (
              queued_at IS NULL
              OR unixepoch(queued_at) <= unixepoch('now')
            )
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
    const claimedJob = await claimJob(jobId, `${workerId}:${randomUUID()}`, staleProcessingMs);
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

async function getAgencyHawbFormatPattern(agencyId: string): Promise<string | null> {
  const database = getDb();
  const result = await database.execute({
    sql: 'SELECT hawb_format_pattern FROM agencies WHERE id = ?',
    args: [agencyId],
  });

  return sanitizeHawbFormatPattern(
    result.rows[0]?.hawb_format_pattern ? String(result.rows[0].hawb_format_pattern) : null,
  );
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
  const normalizedResult = normalizeInvoiceDataAirwaybills(result, {
    hawbPattern: await getAgencyHawbFormatPattern(getString(job, 'agency_id')),
  });
  const processedAt = new Date().toISOString();
  const resultJson = JSON.stringify(normalizedResult);
  const syncStatements = await buildBatchAndAuditStatements({
    job,
    status: 'SUCCESS',
    processedAt,
    result: normalizedResult,
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
  delayMs = 0,
): Promise<void> {
  const database = getDb();
  await database.execute({
    sql: `UPDATE document_jobs SET
            status = 'QUEUED',
            retry_count = retry_count + 1,
            queued_at = datetime('now', ?),
            started_at = NULL,
            result_json = NULL,
            processed_at = NULL,
            locked_by = NULL,
            lock_expires_at = NULL,
            error = ?,
            updated_at = datetime('now')
          WHERE id = ? AND status = 'PROCESSING' AND locked_by = ?`,
    args: [getSqliteIntervalModifier(delayMs), errorMessage, getString(job, 'id'), workerId],
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
              retry_count = max_retries,
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

function isTransientProcessingError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes('499') ||
    message.includes('429') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('cancelled') ||
    message.includes('deadline_exceeded') ||
    message.includes('high demand') ||
    message.includes('operation was cancelled') ||
    message.includes('overloaded') ||
    message.includes('resource_exhausted') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('unavailable')
  );
}

function getRetryDelayMs(retryCount: number, error: unknown): number {
  if (!isTransientProcessingError(error)) {
    return 0;
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const isHighDemandError =
    message.includes('429') ||
    message.includes('503') ||
    message.includes('high demand') ||
    message.includes('overloaded') ||
    message.includes('resource_exhausted') ||
    message.includes('unavailable');
  const baseDelayMs = isHighDemandError ? 30_000 : 5_000;
  const maxDelayMs = isHighDemandError ? 180_000 : 60_000;
  const jitterMs = Math.floor(Math.random() * (isHighDemandError ? 5_000 : 2_000));

  const backoffMs = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, retryCount));
  return backoffMs + jitterMs;
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
  const isTransientError = isTransientProcessingError(error);

  console.error(`[${errorId}] Error procesando documento ${getString(job, 'id')}:`, error);

  // Only transient Gemini/runtime failures should return to the queue.
  if (isTransientError && retryCount < maxRetries) {
    await requeueJob(job, publicError, workerId, getRetryDelayMs(retryCount, error));
    return;
  }

  await markJobFailure(job, publicError, workerId);
}

async function runJobExtraction(job: DocumentJobRow, lockId: string): Promise<void> {
  const pdfBuffer = await getDocumentObject(getString(job, 'object_key'));
  const result = await extractInvoiceFromBuffer({
    buffer: pdfBuffer,
    mimeType: getString(job, 'mime_type', 'application/pdf'),
    format: getString(job, 'extraction_format', 'AGENT_GENERIC_A'),
    telemetryContext: {
      agencyId: getString(job, 'agency_id'),
      batchId: getString(job, 'batch_id'),
      documentJobId: getString(job, 'id'),
      originalFileName: getString(job, 'original_file_name'),
      source: 'document-worker',
      userEmail: getString(job, 'user_email'),
      userId: getString(job, 'user_id'),
      userName: getString(job, 'user_name'),
    },
  });

  await markJobSuccess(job, result, lockId);
}

async function runWithTimeout(work: Promise<void>, timeoutMs: number): Promise<void> {
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Document job timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    work.catch(() => undefined);
  }
}

async function processJob(job: DocumentJobRow, jobTimeoutMs: number): Promise<void> {
  const lockId = getString(job, 'locked_by');
  try {
    await runWithTimeout(runJobExtraction(job, lockId), jobTimeoutMs);
  } catch (error) {
    await handleJobError(job, error, lockId);
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

      await Promise.allSettled(jobs.map((job) => processJob(job, this.config.jobTimeoutMs)));
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
    `Document worker activo: concurrency=${config.concurrency}, poll=${config.pollIntervalMs}ms, jobTimeout=${config.jobTimeoutMs}ms`,
  );

  return activeWorker;
}
