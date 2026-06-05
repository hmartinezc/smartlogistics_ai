import { randomUUID } from 'node:crypto';
import type { InValue } from '@libsql/client';
import { getDb } from '../db.js';

const GEMINI_EVENT_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const GEMINI_EVENT_CLEANUP_THROTTLE_MS = 5 * 60 * 1000;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 1000;
const GEMINI_TOKEN_PRICES_USD_PER_1M: Record<string, { input: number; output: number }> = {
  'gemini-3-flash-preview': { input: 0.5, output: 3 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
};

let lastCleanupAtMs = 0;

export interface GeminiExtractionTelemetryContext {
  agencyId?: string;
  batchId?: string;
  documentJobId?: string;
  originalFileName?: string;
  source?: 'document-worker' | 'api-extract' | 'api-compare' | 'cache' | 'unknown';
  userEmail?: string;
  userId?: string;
  userName?: string;
}

export interface GeminiExtractionEventInput extends GeminiExtractionTelemetryContext {
  agentType: string;
  cacheMode: string;
  cacheTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  durationMs: number;
  error?: string;
  fileDeleteDurationMs?: number;
  fileDeleteOk?: boolean;
  fileInputMode?: string;
  fileUploadDurationMs?: number;
  model: string;
  promptHash: string;
  promptTokenCount?: number;
  routerCategory?: string;
  routerConfidence?: number;
  routerVisualSignals?: string[];
  sdk: string;
  stage?: string;
  success: boolean;
  thoughtsTokenCount?: number;
  timestamp: string;
  totalTokenCount?: number;
}

export interface GeminiExtractionEventQuery {
  agencyId?: string;
  from?: string;
  jobId?: string;
  limit?: number;
  model?: string;
  offset?: number;
  routerCategory?: string;
  sdk?: string;
  stage?: string;
  success?: boolean;
  to?: string;
}

export interface GeminiExtractionEventSummary {
  averageDurationMs: number;
  byCategory: Array<{ category: string; count: number }>;
  byModel: Array<{
    estimatedCostUsd: number;
    inputTokens: number;
    model: string;
    outputTokens: number;
  }>;
  byStage: Array<{ stage: string; count: number }>;
  estimatedCostUsd: number;
  error: number;
  inputTokens: number;
  outputTokens: number;
  success: number;
  total: number;
  totalTokens: number;
}

export interface GeminiExtractionEventRow {
  agencyId?: string;
  agentType: string;
  batchId?: string;
  cacheMode: string;
  cacheTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  createdAt?: string;
  documentJobId?: string;
  durationMs: number;
  error?: string;
  estimatedCostUsd: number;
  expiresAt: string;
  fileDeleteDurationMs?: number;
  fileDeleteOk?: boolean;
  fileInputMode?: string;
  fileUploadDurationMs?: number;
  id: string;
  model: string;
  originalFileName?: string;
  inputTokenCount: number;
  outputTokenCount: number;
  promptHash: string;
  promptTokenCount?: number;
  routerCategory?: string;
  routerConfidence?: number;
  routerVisualSignals?: string[];
  sdk: string;
  source: string;
  stage?: string;
  success: boolean;
  thoughtsTokenCount?: number;
  timestamp: string;
  totalTokenCount?: number;
  userEmail?: string;
  userId?: string;
  userName?: string;
}

export interface GeminiExtractionEventListResponse {
  events: GeminiExtractionEventRow[];
  limit: number;
  offset: number;
  summary: GeminiExtractionEventSummary;
  total: number;
}

function toNullableNumber(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toNullableString(value: string | undefined): string | null {
  return value && value.trim() ? value : null;
}

function toIsoTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function toExpiresAt(timestamp: string): string {
  return new Date(new Date(timestamp).getTime() + GEMINI_EVENT_RETENTION_MS).toISOString();
}

function getNumber(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function getString(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  return value === null || value === undefined || value === '' ? undefined : String(value);
}

function getBoolean(row: Record<string, unknown>, key: string): boolean | undefined {
  const value = row[key];
  if (value === null || value === undefined) {
    return undefined;
  }

  if (value === 0 || value === '0' || value === false) {
    return false;
  }

  if (value === 1 || value === '1' || value === true) {
    return true;
  }

  return Boolean(value);
}

function getGeminiTokenPrices(model: string): { input: number; output: number } | null {
  const normalizedModel = model.toLowerCase();
  return (
    Object.entries(GEMINI_TOKEN_PRICES_USD_PER_1M).find(([modelId]) =>
      normalizedModel.includes(modelId),
    )?.[1] || null
  );
}

function roundCost(value: number): number {
  return Number(value.toFixed(6));
}

function getOutputTokenCount(row: {
  candidatesTokenCount?: number;
  promptTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}): number {
  const explicitOutput = (row.candidatesTokenCount || 0) + (row.thoughtsTokenCount || 0);
  if (explicitOutput > 0) {
    return explicitOutput;
  }

  return Math.max((row.totalTokenCount || 0) - (row.promptTokenCount || 0), 0);
}

function estimateGeminiCostUsd(input: {
  inputTokens: number;
  model: string;
  outputTokens: number;
}): number {
  const prices = getGeminiTokenPrices(input.model);
  if (!prices) {
    return 0;
  }

  return roundCost(
    (input.inputTokens / 1_000_000) * prices.input +
      (input.outputTokens / 1_000_000) * prices.output,
  );
}

function parseSignals(value: unknown): string[] | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String) : undefined;
  } catch {
    return undefined;
  }
}

function buildEventRow(row: Record<string, unknown>): GeminiExtractionEventRow {
  const inputTokenCount = getNumber(row, 'prompt_token_count') || 0;
  const outputTokenCount = getOutputTokenCount({
    candidatesTokenCount: getNumber(row, 'candidates_token_count'),
    promptTokenCount: inputTokenCount,
    thoughtsTokenCount: getNumber(row, 'thoughts_token_count'),
    totalTokenCount: getNumber(row, 'total_token_count'),
  });
  const model = String(row.model);

  return {
    agencyId: getString(row, 'agency_id'),
    agentType: String(row.agent_type),
    batchId: getString(row, 'batch_id'),
    cacheMode: String(row.cache_mode),
    cacheTokenCount: getNumber(row, 'cache_token_count'),
    cachedContentTokenCount: getNumber(row, 'cached_content_token_count'),
    candidatesTokenCount: getNumber(row, 'candidates_token_count'),
    createdAt: getString(row, 'created_at'),
    documentJobId: getString(row, 'document_job_id'),
    durationMs: getNumber(row, 'duration_ms') || 0,
    error: getString(row, 'error'),
    estimatedCostUsd: estimateGeminiCostUsd({
      inputTokens: inputTokenCount,
      model,
      outputTokens: outputTokenCount,
    }),
    expiresAt: String(row.expires_at),
    fileDeleteDurationMs: getNumber(row, 'file_delete_duration_ms'),
    fileDeleteOk: getBoolean(row, 'file_delete_ok'),
    fileInputMode: getString(row, 'file_input_mode'),
    fileUploadDurationMs: getNumber(row, 'file_upload_duration_ms'),
    id: String(row.id),
    model,
    originalFileName: getString(row, 'original_file_name'),
    inputTokenCount,
    outputTokenCount,
    promptHash: String(row.prompt_hash),
    promptTokenCount: getNumber(row, 'prompt_token_count'),
    routerCategory: getString(row, 'router_category'),
    routerConfidence: getNumber(row, 'router_confidence'),
    routerVisualSignals: parseSignals(row.router_visual_signals),
    sdk: String(row.sdk),
    source: String(row.source),
    stage: getString(row, 'stage'),
    success: getBoolean(row, 'success') || false,
    thoughtsTokenCount: getNumber(row, 'thoughts_token_count'),
    timestamp: String(row.timestamp),
    totalTokenCount: getNumber(row, 'total_token_count'),
    userEmail: getString(row, 'user_email'),
    userId: getString(row, 'user_id'),
    userName: getString(row, 'user_name'),
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) {
    return DEFAULT_LIST_LIMIT;
  }

  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIST_LIMIT);
}

function normalizeOffset(offset: number | undefined): number {
  if (!offset || !Number.isFinite(offset)) {
    return 0;
  }

  return Math.max(Math.floor(offset), 0);
}

function appendQueryFilters(query: GeminiExtractionEventQuery, where: string[], args: InValue[]) {
  const now = new Date().toISOString();
  where.push('expires_at > ?');
  args.push(now);

  if (query.from) {
    where.push('timestamp >= ?');
    args.push(`${query.from}T00:00:00.000Z`);
  } else {
    where.push('timestamp >= ?');
    args.push(new Date(Date.now() - GEMINI_EVENT_RETENTION_MS).toISOString());
  }

  if (query.to) {
    where.push('timestamp <= ?');
    args.push(`${query.to}T23:59:59.999Z`);
  }

  if (query.agencyId) {
    where.push('agency_id = ?');
    args.push(query.agencyId);
  }

  if (query.jobId) {
    where.push('document_job_id = ?');
    args.push(query.jobId);
  }

  if (query.stage) {
    const stages = query.stage
      .split(',')
      .map((stage) => stage.trim())
      .filter(Boolean);
    if (stages.length > 1) {
      where.push(`stage IN (${stages.map(() => '?').join(',')})`);
      args.push(...stages);
    } else if (stages.length === 1) {
      where.push('stage = ?');
      args.push(stages[0]);
    }
  }

  if (query.sdk) {
    where.push('sdk = ?');
    args.push(query.sdk);
  }

  if (query.model) {
    where.push('model = ?');
    args.push(query.model);
  }

  if (query.routerCategory) {
    where.push('router_category = ?');
    args.push(query.routerCategory);
  }

  if (typeof query.success === 'boolean') {
    where.push('success = ?');
    args.push(query.success ? 1 : 0);
  }
}

export async function cleanupExpiredGeminiExtractionEvents(): Promise<number> {
  const result = await getDb().execute({
    sql: 'DELETE FROM gemini_extraction_events WHERE expires_at <= ?',
    args: [new Date().toISOString()],
  });

  lastCleanupAtMs = Date.now();
  return result.rowsAffected;
}

async function cleanupExpiredGeminiExtractionEventsIfDue(): Promise<void> {
  if (Date.now() - lastCleanupAtMs < GEMINI_EVENT_CLEANUP_THROTTLE_MS) {
    return;
  }

  try {
    await cleanupExpiredGeminiExtractionEvents();
  } catch (error) {
    lastCleanupAtMs = Date.now();
    console.warn('Gemini extraction observability cleanup failed.', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function persistGeminiExtractionEvent(
  event: GeminiExtractionEventInput,
): Promise<void> {
  await cleanupExpiredGeminiExtractionEventsIfDue();

  const timestamp = toIsoTimestamp(event.timestamp);
  await getDb().execute({
    sql: `INSERT INTO gemini_extraction_events (
      id, timestamp, expires_at, source, document_job_id, batch_id, agency_id,
      user_id, user_email, user_name, original_file_name, agent_type, sdk, stage,
      cache_mode, model, prompt_hash, success, error, prompt_token_count,
      candidates_token_count, thoughts_token_count, total_token_count,
      cached_content_token_count, cache_token_count, duration_ms,
      file_upload_duration_ms, file_delete_duration_ms, file_delete_ok,
      file_input_mode, router_category, router_confidence, router_visual_signals
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
      timestamp,
      toExpiresAt(timestamp),
      event.source || 'unknown',
      toNullableString(event.documentJobId),
      toNullableString(event.batchId),
      toNullableString(event.agencyId),
      toNullableString(event.userId),
      toNullableString(event.userEmail),
      toNullableString(event.userName),
      toNullableString(event.originalFileName),
      event.agentType,
      event.sdk,
      toNullableString(event.stage),
      event.cacheMode,
      event.model,
      event.promptHash,
      event.success ? 1 : 0,
      toNullableString(event.error),
      toNullableNumber(event.promptTokenCount),
      toNullableNumber(event.candidatesTokenCount),
      toNullableNumber(event.thoughtsTokenCount),
      toNullableNumber(event.totalTokenCount),
      toNullableNumber(event.cachedContentTokenCount),
      toNullableNumber(event.cacheTokenCount),
      toNullableNumber(event.durationMs) || 0,
      toNullableNumber(event.fileUploadDurationMs),
      toNullableNumber(event.fileDeleteDurationMs),
      typeof event.fileDeleteOk === 'boolean' ? (event.fileDeleteOk ? 1 : 0) : null,
      toNullableString(event.fileInputMode),
      toNullableString(event.routerCategory),
      toNullableNumber(event.routerConfidence),
      event.routerVisualSignals ? JSON.stringify(event.routerVisualSignals) : null,
    ],
  });
}

export async function listGeminiExtractionEvents(
  query: GeminiExtractionEventQuery = {},
): Promise<GeminiExtractionEventListResponse> {
  const where: string[] = [];
  const args: InValue[] = [];
  appendQueryFilters(query, where, args);
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);

  const [rowsResult, countResult, totalsResult, stageResult, categoryResult, modelResult] =
    await Promise.all([
      getDb().execute({
        sql: `SELECT * FROM gemini_extraction_events
            ${whereSql}
            ORDER BY timestamp DESC, created_at DESC
            LIMIT ? OFFSET ?`,
        args: [...args, limit, offset],
      }),
      getDb().execute({
        sql: `SELECT COUNT(*) AS total FROM gemini_extraction_events ${whereSql}`,
        args,
      }),
      getDb().execute({
        sql: `SELECT
              COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) AS success,
              COALESCE(SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END), 0) AS error,
              COALESCE(SUM(prompt_token_count), 0) AS input_tokens,
              COALESCE(SUM(candidates_token_count), 0) + COALESCE(SUM(thoughts_token_count), 0) AS output_tokens,
              COALESCE(SUM(total_token_count), 0) AS total_tokens,
              COALESCE(AVG(duration_ms), 0) AS average_duration_ms
            FROM gemini_extraction_events
            ${whereSql}`,
        args,
      }),
      getDb().execute({
        sql: `SELECT COALESCE(stage, 'sin-etapa') AS stage, COUNT(*) AS count
            FROM gemini_extraction_events
            ${whereSql}
            GROUP BY COALESCE(stage, 'sin-etapa')
            ORDER BY count DESC`,
        args,
      }),
      getDb().execute({
        sql: `SELECT COALESCE(router_category, 'sin-categoria') AS category, COUNT(*) AS count
            FROM gemini_extraction_events
            ${whereSql}
            GROUP BY COALESCE(router_category, 'sin-categoria')
            ORDER BY count DESC`,
        args,
      }),
      getDb().execute({
        sql: `SELECT
              model,
              COALESCE(SUM(prompt_token_count), 0) AS input_tokens,
              COALESCE(SUM(candidates_token_count), 0) + COALESCE(SUM(thoughts_token_count), 0) AS output_tokens
            FROM gemini_extraction_events
            ${whereSql}
            GROUP BY model
            ORDER BY model`,
        args,
      }),
    ]);

  const totals = (totalsResult.rows[0] || {}) as Record<string, unknown>;
  const byModel = modelResult.rows.map((row) => {
    const model = String(row.model);
    const inputTokens = getNumber(row as Record<string, unknown>, 'input_tokens') || 0;
    const outputTokens = getNumber(row as Record<string, unknown>, 'output_tokens') || 0;

    return {
      estimatedCostUsd: estimateGeminiCostUsd({ inputTokens, model, outputTokens }),
      inputTokens,
      model,
      outputTokens,
    };
  });
  const estimatedCostUsd = roundCost(
    byModel.reduce((total, item) => total + item.estimatedCostUsd, 0),
  );

  return {
    events: rowsResult.rows.map((row) => buildEventRow(row as Record<string, unknown>)),
    limit,
    offset,
    summary: {
      averageDurationMs: Math.round(getNumber(totals, 'average_duration_ms') || 0),
      byCategory: categoryResult.rows.map((row) => ({
        category: String(row.category),
        count: getNumber(row as Record<string, unknown>, 'count') || 0,
      })),
      byModel,
      byStage: stageResult.rows.map((row) => ({
        stage: String(row.stage),
        count: getNumber(row as Record<string, unknown>, 'count') || 0,
      })),
      estimatedCostUsd,
      error: getNumber(totals, 'error') || 0,
      inputTokens: getNumber(totals, 'input_tokens') || 0,
      outputTokens: getNumber(totals, 'output_tokens') || 0,
      success: getNumber(totals, 'success') || 0,
      total: getNumber(totals, 'total') || 0,
      totalTokens: getNumber(totals, 'total_tokens') || 0,
    },
    total: getNumber((countResult.rows[0] || {}) as Record<string, unknown>, 'total') || 0,
  };
}
