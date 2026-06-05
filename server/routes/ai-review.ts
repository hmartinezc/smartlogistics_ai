import { createHash, randomUUID } from 'node:crypto';
import type { InValue } from '@libsql/client';
import { GoogleGenerativeAI, type Part as LegacyPart } from '@google/generative-ai';
import { Hono } from 'hono';
import type { AgentType, InvoiceData } from '../../types.js';
import {
  buildExtractionPrompt,
  type ExtractionPromptProfile,
} from '../../services/agentPrompts.js';
import {
  getRouterCategoryConfig,
  isRouterInvoiceCategory,
  ROUTER_CLASSIFICATION_PROMPT,
  type RouterInvoiceCategory,
} from '../../services/extractionRouterPrompts.js';
import { getDb } from '../db.js';
import { requireAuth, requireRole, type AuthUser } from '../security.js';
import { getGeminiApiKey, getGeminiModelId } from '../services/documentExtractionService.js';
import { getGeminiPromptHash } from '../services/geminiPromptCache.js';
import {
  buildAutoPilotReviewObjectKey,
  getDocumentObject,
  getInvoiceBucketName,
  putDocumentObject,
} from '../services/minioService.js';

const aiReview = new Hono<{ Variables: { authUser: AuthUser } }>();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_AGENT_TYPES = new Set<AgentType>([
  'AGENT_GENERIC_A',
  'AGENT_GENERIC_B',
  'AGENT_CUSTOMS',
]);
const MAX_REVIEW_ITEMS = 3;
const DEFAULT_REVIEWER_MAX_OUTPUT_TOKENS = 2048;
const DEFAULT_REVIEWER_TIMEOUT_MS = 180_000;

type Row = Record<string, unknown>;

interface SelectedDocumentRow extends Row {
  agency_id: string;
  agency_name?: string;
  batch_id: string;
  document_job_id: string;
  extraction_format: string;
  input_tokens: number;
  mime_type?: string;
  model_summary?: string;
  object_key: string;
  original_file_name: string;
  output_tokens: number;
  processed_at?: string;
  prompt_hashes?: string;
  total_tokens: number;
  estimated_cost_usd: number;
}

function getString(row: Row, key: string): string | undefined {
  const value = row[key];
  return value === null || value === undefined || value === '' ? undefined : String(value);
}

function getNumber(row: Row, key: string): number {
  const value = Number(row[key] || 0);
  return Number.isFinite(value) ? value : 0;
}

function roundCost(value: number): number {
  return Number(value.toFixed(6));
}

function normalizeReviewDate(value: unknown): string | null {
  if (typeof value !== 'string' || !DATE_RE.test(value.trim())) {
    return null;
  }

  return value.trim();
}

function normalizeAgencyId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || normalized === 'GLOBAL') {
    return null;
  }

  return /^[A-Za-z0-9._:-]{1,80}$/.test(normalized) ? normalized : '';
}

function normalizeAgentType(value: unknown): AgentType {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return ALLOWED_AGENT_TYPES.has(normalized as AgentType)
    ? (normalized as AgentType)
    : 'AGENT_GENERIC_A';
}

function readPromptProfile(): ExtractionPromptProfile {
  return String(process.env.GEMINI_EXTRACTION_PROMPT_PROFILE || 'full')
    .trim()
    .toLowerCase() === 'compact'
    ? 'compact'
    : 'full';
}

function getReviewerModelId(): string {
  return process.env.GEMINI_AI_REVIEW_MODEL_ID?.trim() || getGeminiModelId();
}

function estimateGeminiCostUsd(input: {
  inputTokens: number;
  model: string;
  outputTokens: number;
}): number {
  const model = input.model.toLowerCase();
  if (model.includes('gemini-3.1-flash-lite')) {
    return roundCost(
      (input.inputTokens / 1_000_000) * 0.25 + (input.outputTokens / 1_000_000) * 1.5,
    );
  }

  if (model.includes('gemini-3-flash-preview')) {
    return roundCost((input.inputTokens / 1_000_000) * 0.5 + (input.outputTokens / 1_000_000) * 3);
  }

  return 0;
}

function buildRouterExtractorPrompt(agentType: AgentType, category: RouterInvoiceCategory): string {
  if (category === 'UNKNOWN_GENERAL') {
    return buildExtractionPrompt(agentType, { profile: 'compact' });
  }

  const config = getRouterCategoryConfig(category);

  return [
    'You are a specialist in perishable flower logistics invoice extraction.',
    `Detected format: ${config.category}. ${config.description}`,
    config.extractorPrompt,
    'Return only strict JSON matching the provided response schema.',
  ].join('\n');
}

function buildPromptSnapshotFromEvent(event: Row) {
  const agentType = normalizeAgentType(event.agent_type);
  const stage = String(event.stage || '');
  const cacheMode = String(event.cache_mode || '');
  const sdk = String(event.sdk || '');
  const model = String(event.model || getGeminiModelId());
  const eventPromptHash = String(event.prompt_hash || '').trim();
  const routerCategoryRaw = getString(event, 'router_category');
  const routerCategory = isRouterInvoiceCategory(routerCategoryRaw) ? routerCategoryRaw : undefined;
  let promptKind = 'extraction';
  let promptProfile: string | undefined = readPromptProfile();
  let promptText = buildExtractionPrompt(agentType, { profile: readPromptProfile() });
  let source = 'current-code';

  if (stage.includes('classifier') || cacheMode.includes('classifier')) {
    promptKind = 'classifier';
    promptProfile = undefined;
    promptText = ROUTER_CLASSIFICATION_PROMPT;
    source = 'router-classifier-current-code';
  } else if (sdk === 'genai-router-files' && routerCategory) {
    promptKind = 'router-extractor';
    promptProfile = routerCategory === 'UNKNOWN_GENERAL' ? 'compact' : undefined;
    promptText = buildRouterExtractorPrompt(agentType, routerCategory);
    source = 'router-extractor-current-code';
  }

  const calculatedHash = getGeminiPromptHash(promptText).slice(0, 12);
  const promptHash = eventPromptHash || calculatedHash;
  const idSource = [promptKind, agentType, routerCategory || 'none', model, promptHash].join(':');
  const id = `snapshot_${createHash('sha256').update(idSource).digest('hex').slice(0, 24)}`;

  return {
    agentType,
    id,
    model,
    promptHash,
    promptKind,
    promptProfile,
    promptText,
    routerCategory,
    source,
  };
}

async function persistPromptSnapshotsForJob(documentJobId: string): Promise<void> {
  const result = await getDb().execute({
    sql: `SELECT *
          FROM gemini_extraction_events
          WHERE document_job_id = ?
          ORDER BY timestamp ASC, created_at ASC`,
    args: [documentJobId],
  });

  const snapshots = new Map<string, ReturnType<typeof buildPromptSnapshotFromEvent>>();
  for (const row of result.rows as Row[]) {
    const snapshot = buildPromptSnapshotFromEvent(row);
    snapshots.set(snapshot.id, snapshot);
  }

  for (const snapshot of snapshots.values()) {
    await getDb().execute({
      sql: `INSERT OR IGNORE INTO ai_prompt_snapshots (
              id,
              prompt_hash,
              prompt_kind,
              agent_type,
              router_category,
              model,
              prompt_profile,
              prompt_text,
              source,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        snapshot.id,
        snapshot.promptHash,
        snapshot.promptKind,
        snapshot.agentType,
        snapshot.routerCategory || null,
        snapshot.model,
        snapshot.promptProfile || null,
        snapshot.promptText,
        snapshot.source,
      ],
    });
  }
}

function buildRun(row: Row) {
  return {
    id: String(row.id),
    reviewDate: String(row.review_date),
    agencyId: getString(row, 'agency_id') || null,
    status: String(row.status),
    selectedCount: getNumber(row, 'selected_count'),
    totalInputTokens: getNumber(row, 'total_input_tokens'),
    totalOutputTokens: getNumber(row, 'total_output_tokens'),
    totalTokens: getNumber(row, 'total_tokens'),
    totalEstimatedCostUsd: getNumber(row, 'total_estimated_cost_usd'),
    createdBy: {
      id: getString(row, 'created_by_user_id') || null,
      email: getString(row, 'created_by_email') || null,
      name: getString(row, 'created_by_name') || null,
    },
    error: getString(row, 'error') || null,
    createdAt: getString(row, 'created_at') || null,
    updatedAt: getString(row, 'updated_at') || null,
  };
}

function buildItem(row: Row) {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    documentJobId: String(row.document_job_id),
    batchId: getString(row, 'batch_id') || null,
    agencyId: String(row.agency_id),
    agencyName: getString(row, 'agency_name') || null,
    originalFileName: String(row.original_file_name),
    reviewStorageBucket: getString(row, 'review_storage_bucket') || null,
    reviewObjectKey: getString(row, 'review_object_key') || null,
    reviewFileSizeBytes: getNumber(row, 'review_file_size_bytes'),
    extractionFormat: String(row.extraction_format),
    modelSummary: getString(row, 'model_summary') || null,
    promptHashes:
      getString(row, 'prompt_hashes')
        ?.split(',')
        .map((hash) => hash.trim())
        .filter(Boolean) || [],
    status: String(row.status),
    inputTokens: getNumber(row, 'input_tokens'),
    outputTokens: getNumber(row, 'output_tokens'),
    totalTokens: getNumber(row, 'total_tokens'),
    estimatedCostUsd: getNumber(row, 'estimated_cost_usd'),
    processedAt: getString(row, 'processed_at') || null,
    analysisError: getString(row, 'analysis_error') || null,
    createdAt: getString(row, 'created_at') || null,
    updatedAt: getString(row, 'updated_at') || null,
  };
}

function buildInlinePdfFileName(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
    .replace(/"/g, '');
}

function parseJsonValue(value: unknown): unknown | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function buildAnalysis(row: Row) {
  return {
    id: String(row.id),
    itemId: String(row.item_id),
    status: String(row.status),
    reviewerModel: String(row.reviewer_model),
    verdict: String(row.verdict),
    confidenceScore: row.confidence_score === null ? null : getNumber(row, 'confidence_score'),
    analysis: parseJsonValue(row.analysis_json),
    recommendationSummary: getString(row, 'recommendation_summary') || null,
    inputTokens: getNumber(row, 'input_tokens'),
    outputTokens: getNumber(row, 'output_tokens'),
    totalTokens: getNumber(row, 'total_tokens'),
    estimatedCostUsd: getNumber(row, 'estimated_cost_usd'),
    createdBy: {
      id: getString(row, 'created_by_user_id') || null,
      email: getString(row, 'created_by_email') || null,
    },
    createdAt: getString(row, 'created_at') || null,
    updatedAt: getString(row, 'updated_at') || null,
  };
}

function buildGeminiEvent(row: Row) {
  const inputTokenCount = getNumber(row, 'prompt_token_count');
  const explicitOutput =
    getNumber(row, 'candidates_token_count') + getNumber(row, 'thoughts_token_count');
  const outputTokenCount =
    explicitOutput > 0
      ? explicitOutput
      : Math.max(getNumber(row, 'total_token_count') - inputTokenCount, 0);

  return {
    id: String(row.id),
    timestamp: String(row.timestamp),
    source: String(row.source),
    documentJobId: getString(row, 'document_job_id') || null,
    batchId: getString(row, 'batch_id') || null,
    agencyId: getString(row, 'agency_id') || null,
    originalFileName: getString(row, 'original_file_name') || null,
    agentType: String(row.agent_type),
    sdk: String(row.sdk),
    stage: getString(row, 'stage') || null,
    cacheMode: String(row.cache_mode),
    model: String(row.model),
    promptHash: String(row.prompt_hash),
    success: Boolean(row.success),
    error: getString(row, 'error') || null,
    inputTokenCount,
    outputTokenCount,
    totalTokenCount: getNumber(row, 'total_token_count'),
    estimatedCostUsd: estimateGeminiCostUsd({
      inputTokens: inputTokenCount,
      model: String(row.model),
      outputTokens: outputTokenCount,
    }),
    durationMs: getNumber(row, 'duration_ms'),
    routerCategory: getString(row, 'router_category') || null,
    routerConfidence: row.router_confidence === null ? null : getNumber(row, 'router_confidence'),
  };
}

function buildPromptSnapshot(row: Row) {
  return {
    id: String(row.id),
    promptHash: String(row.prompt_hash),
    promptKind: String(row.prompt_kind),
    agentType: getString(row, 'agent_type') || null,
    routerCategory: getString(row, 'router_category') || null,
    model: String(row.model),
    promptProfile: getString(row, 'prompt_profile') || null,
    promptText: String(row.prompt_text),
    source: String(row.source),
    createdAt: getString(row, 'created_at') || null,
  };
}

async function getRunWithItems(runId: string) {
  const runResult = await getDb().execute({
    sql: 'SELECT * FROM ai_review_runs WHERE id = ?',
    args: [runId],
  });

  if (runResult.rows.length === 0) {
    return null;
  }

  const itemsResult = await getDb().execute({
    sql: 'SELECT * FROM ai_review_items WHERE run_id = ? ORDER BY estimated_cost_usd DESC, total_tokens DESC',
    args: [runId],
  });

  return {
    ...buildRun(runResult.rows[0] as Row),
    items: (itemsResult.rows as Row[]).map(buildItem),
  };
}

async function getReviewItemRow(itemId: string): Promise<Row | null> {
  const result = await getDb().execute({
    sql: `SELECT
              ri.*,
              COALESCE(dj.result_json, bi.result_json) AS result_json,
              dj.object_key,
              dj.mime_type
          FROM ai_review_items ri
          LEFT JOIN document_jobs dj ON dj.id = ri.document_job_id
          LEFT JOIN batch_items bi ON bi.id = ri.document_job_id
          WHERE ri.id = ?`,
    args: [itemId],
  });

  return (result.rows[0] as Row | undefined) || null;
}

async function getItemDetail(itemId: string) {
  const itemRow = await getReviewItemRow(itemId);
  if (!itemRow) {
    return null;
  }

  const [eventsResult, snapshotsResult, analysesResult] = await Promise.all([
    getDb().execute({
      sql: `SELECT *
            FROM gemini_extraction_events
            WHERE document_job_id = ?
            ORDER BY timestamp ASC, created_at ASC`,
      args: [String(itemRow.document_job_id)],
    }),
    getDb().execute({
      sql: `SELECT DISTINCT ps.*
            FROM ai_prompt_snapshots ps
            JOIN gemini_extraction_events ge ON ge.prompt_hash = ps.prompt_hash
            WHERE ge.document_job_id = ?
            ORDER BY ps.prompt_kind, ps.created_at DESC`,
      args: [String(itemRow.document_job_id)],
    }),
    getDb().execute({
      sql: `SELECT *
            FROM ai_review_analyses
            WHERE item_id = ?
            ORDER BY created_at DESC`,
      args: [itemId],
    }),
  ]);

  return {
    item: buildItem(itemRow),
    invoiceResult: parseJsonValue(itemRow.result_json) as InvoiceData | null,
    pdfPreviewUrl: `/api/ai-review/items/${encodeURIComponent(itemId)}/pdf`,
    events: (eventsResult.rows as Row[]).map(buildGeminiEvent),
    promptSnapshots: (snapshotsResult.rows as Row[]).map(buildPromptSnapshot),
    analyses: (analysesResult.rows as Row[]).map(buildAnalysis),
  };
}

async function selectTopReviewDocuments(input: {
  agencyId: string | null;
  reviewDate: string;
}): Promise<SelectedDocumentRow[]> {
  const where = [
    'substr(ge.timestamp, 1, 10) = ?',
    'ge.document_job_id IS NOT NULL',
    "ge.document_job_id <> ''",
    "dj.status = 'SUCCESS'",
    'dj.object_key IS NOT NULL',
    "dj.object_key <> ''",
  ];
  const args: InValue[] = [input.reviewDate];

  if (input.agencyId) {
    where.push('dj.agency_id = ?');
    args.push(input.agencyId);
  }

  const outputSql = `(COALESCE(ge.candidates_token_count, 0) + COALESCE(ge.thoughts_token_count, 0))`;
  const fallbackOutputSql = `CASE
    WHEN ${outputSql} > 0 THEN ${outputSql}
    ELSE MAX(COALESCE(ge.total_token_count, 0) - COALESCE(ge.prompt_token_count, 0), 0)
  END`;

  const result = await getDb().execute({
    sql: `SELECT
            dj.id AS document_job_id,
            dj.batch_id,
            dj.agency_id,
            a.name AS agency_name,
            dj.original_file_name,
            dj.object_key,
            dj.file_size_bytes,
            dj.mime_type,
            dj.extraction_format,
            dj.processed_at,
            COALESCE(SUM(COALESCE(ge.prompt_token_count, 0)), 0) AS input_tokens,
            COALESCE(SUM(${fallbackOutputSql}), 0) AS output_tokens,
            COALESCE(SUM(COALESCE(ge.total_token_count, 0)), 0) AS total_tokens,
            GROUP_CONCAT(DISTINCT ge.model) AS model_summary,
            GROUP_CONCAT(DISTINCT ge.prompt_hash) AS prompt_hashes,
            COALESCE(SUM(
              CASE
                WHEN lower(ge.model) LIKE '%gemini-3.1-flash-lite%' THEN
                  (COALESCE(ge.prompt_token_count, 0) / 1000000.0) * 0.25 +
                  (${fallbackOutputSql} / 1000000.0) * 1.5
                WHEN lower(ge.model) LIKE '%gemini-3-flash-preview%' THEN
                  (COALESCE(ge.prompt_token_count, 0) / 1000000.0) * 0.5 +
                  (${fallbackOutputSql} / 1000000.0) * 3
                ELSE 0
              END
            ), 0) AS estimated_cost_usd
          FROM gemini_extraction_events ge
          JOIN document_jobs dj ON dj.id = ge.document_job_id
          LEFT JOIN agencies a ON a.id = dj.agency_id
          WHERE ${where.join(' AND ')}
          GROUP BY dj.id
          HAVING total_tokens > 0
          ORDER BY estimated_cost_usd DESC, total_tokens DESC, dj.processed_at DESC
          LIMIT ?`,
    args: [...args, MAX_REVIEW_ITEMS],
  });

  return result.rows as unknown as SelectedDocumentRow[];
}

async function copyDocumentToAutoPilotStorage(input: {
  agencyId: string;
  agencyName?: string;
  documentJobId: string;
  mimeType?: string;
  objectKey: string;
  originalFileName: string;
  reviewDate: string;
  runId: string;
}): Promise<{ buffer: Buffer; objectKey: string; storageBucket: string }> {
  const buffer = await getDocumentObject(input.objectKey);
  const reviewObjectKey = buildAutoPilotReviewObjectKey({
    agencyId: input.agencyId,
    agencyName: input.agencyName,
    documentId: input.documentJobId,
    originalFilename: input.originalFileName,
    reviewDate: input.reviewDate,
    runId: input.runId,
  });

  await putDocumentObject({
    buffer,
    contentType: input.mimeType || 'application/pdf',
    metadata: {
      'x-amz-meta-autopilot-review-date': input.reviewDate,
      'x-amz-meta-source-document-job-id': input.documentJobId,
    },
    objectKey: reviewObjectKey,
  });

  return {
    buffer,
    objectKey: reviewObjectKey,
    storageBucket: getInvoiceBucketName(),
  };
}

function buildReviewerPrompt(input: {
  events: ReturnType<typeof buildGeminiEvent>[];
  invoiceResult: InvoiceData | null;
  item: ReturnType<typeof buildItem>;
  promptSnapshots: ReturnType<typeof buildPromptSnapshot>[];
}): string {
  const prompts = input.promptSnapshots.map((snapshot) => ({
    kind: snapshot.promptKind,
    hash: snapshot.promptHash,
    category: snapshot.routerCategory,
    model: snapshot.model,
    prompt: snapshot.promptText.slice(0, 12_000),
  }));

  return `
You are an internal QA reviewer for a flower logistics invoice extraction system.
Review the attached PDF, the extracted JSON, the Gemini events, and the prompts used.
Do not rewrite operational prompts. Only propose improvements for human approval.

Return strict JSON with this shape:
{
  "verdict": "OK" | "REVIEW_NEEDED" | "PROMPT_IMPROVEMENT_SUGGESTED",
  "confidenceScore": number,
  "summary": string,
  "suspectedIssues": [{"field": string, "reason": string, "severity": "LOW" | "MEDIUM" | "HIGH"}],
  "extractorTechnicalImprovements": [{"area": string, "recommendation": string, "expectedImpact": string, "costImpact": "LOWER" | "NEUTRAL" | "HIGHER"}],
  "classifierTechnicalImprovements": [{"area": string, "recommendation": string, "expectedImpact": string, "costImpact": "LOWER" | "NEUTRAL" | "HIGHER"}],
  "costEfficiencyNotes": string[],
  "costGuardrails": string[],
  "promptRecommendations": [{"target": "classifier" | "extractor" | "none", "promptHash": string, "recommendation": string, "risk": string}],
  "validationPlan": string[],
  "requiresDeveloperWork": boolean,
  "developerWorkReason": string | null
}

Reviewer constraints:
- Extraction accuracy is more important than token savings.
- First validate whether the extracted invoice JSON matches the PDF evidence.
- Separate classifier improvements from extractor improvements.
- Always explain cost impact before recommending longer prompts, higher thinking, extra calls, or a new model.
- If a new category or schema field is needed, set requiresDeveloperWork=true.
- Prefer prompt/rule improvements that reduce repeated tokens or avoid unnecessary classifier retries.
- Keep recommendations concise and actionable.
- Never say a prompt was changed; only recommend.

Review item:
${JSON.stringify(input.item)}

Extraction result:
${JSON.stringify(input.invoiceResult)}

Gemini events:
${JSON.stringify(input.events)}

Prompt snapshots:
${JSON.stringify(prompts)}
`.trim();
}

function parseReviewerJson(text: string): Row {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  return JSON.parse(withoutFence) as Row;
}

async function runReviewer(input: {
  detail: NonNullable<Awaited<ReturnType<typeof getItemDetail>>>;
  pdfBuffer: Buffer;
}) {
  const model = getReviewerModelId();
  const startedAtMs = Date.now();
  const ai = new GoogleGenerativeAI(getGeminiApiKey());
  const reviewerModel = ai.getGenerativeModel(
    {
      generationConfig: {
        maxOutputTokens: DEFAULT_REVIEWER_MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
      },
      model,
    },
    {
      apiVersion: 'v1beta',
      timeout: DEFAULT_REVIEWER_TIMEOUT_MS,
    },
  );
  const prompt = buildReviewerPrompt({
    events: input.detail.events,
    invoiceResult: input.detail.invoiceResult,
    item: input.detail.item,
    promptSnapshots: input.detail.promptSnapshots,
  });
  const parts: Array<string | LegacyPart> = [
    {
      inlineData: {
        data: input.pdfBuffer.toString('base64'),
        mimeType: 'application/pdf',
      },
    },
    { text: prompt },
  ];
  const result = await reviewerModel.generateContent(parts, {
    timeout: DEFAULT_REVIEWER_TIMEOUT_MS,
  });
  const text = result.response.text();
  const analysis = parseReviewerJson(text);
  const usage = result.response.usageMetadata;
  const inputTokens = Number(usage?.promptTokenCount || 0);
  const outputTokens = Number(usage?.candidatesTokenCount || 0);
  const totalTokens = Number(usage?.totalTokenCount || inputTokens + outputTokens);

  return {
    analysis,
    durationMs: Date.now() - startedAtMs,
    estimatedCostUsd: estimateGeminiCostUsd({ inputTokens, model, outputTokens }),
    inputTokens,
    model,
    outputTokens,
    totalTokens,
  };
}

aiReview.use('*', async (c, next) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const roleError = requireRole(c, authUser, ['ADMIN']);
  if (roleError) {
    return roleError;
  }

  c.set('authUser', authUser);
  return next();
});

aiReview.get('/runs/latest', async (c) => {
  const reviewDate = c.req.query('date');
  const agencyId = normalizeAgencyId(c.req.query('agencyId'));
  const where: string[] = [];
  const args: InValue[] = [];

  if (reviewDate) {
    if (!DATE_RE.test(reviewDate)) {
      return c.json({ error: 'El parámetro date debe tener formato YYYY-MM-DD.' }, 400);
    }

    where.push('review_date = ?');
    args.push(reviewDate);
  }

  if (agencyId === '') {
    return c.json({ error: 'agencyId inválido.' }, 400);
  }

  if (agencyId) {
    where.push('agency_id = ?');
    args.push(agencyId);
  } else if (c.req.query('agencyId') === 'GLOBAL') {
    where.push('agency_id IS NULL');
  }

  const result = await getDb().execute({
    sql: `SELECT id
          FROM ai_review_runs
          ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY created_at DESC
          LIMIT 1`,
    args,
  });

  if (result.rows.length === 0) {
    return c.json({ run: null });
  }

  return c.json({ run: await getRunWithItems(String(result.rows[0].id)) });
});

aiReview.get('/runs/:id', async (c) => {
  const run = await getRunWithItems(c.req.param('id'));
  if (!run) {
    return c.json({ error: 'Carpeta de revisión no encontrada.' }, 404);
  }

  return c.json({ run });
});

aiReview.post('/runs', async (c) => {
  const authUser = c.get('authUser') as {
    email: string;
    id: string;
    name: string;
  };
  const body = (await c.req.json().catch(() => ({}))) as Row;
  const reviewDate = normalizeReviewDate(body.reviewDate);
  const agencyId = normalizeAgencyId(body.agencyId);

  if (!reviewDate) {
    return c.json({ error: 'reviewDate debe tener formato YYYY-MM-DD.' }, 400);
  }

  if (agencyId === '') {
    return c.json({ error: 'agencyId inválido.' }, 400);
  }

  const selected = await selectTopReviewDocuments({ agencyId, reviewDate });
  const runId = randomUUID();
  const copiedSelected = [];
  for (const row of selected) {
    const copy = await copyDocumentToAutoPilotStorage({
      agencyId: String(row.agency_id),
      agencyName: row.agency_name ? String(row.agency_name) : undefined,
      documentJobId: String(row.document_job_id),
      mimeType: row.mime_type ? String(row.mime_type) : undefined,
      objectKey: String(row.object_key),
      originalFileName: String(row.original_file_name),
      reviewDate,
      runId,
    });
    copiedSelected.push({ copy, row });
  }
  const totals = selected.reduce(
    (acc, row) => {
      acc.inputTokens += getNumber(row, 'input_tokens');
      acc.outputTokens += getNumber(row, 'output_tokens');
      acc.totalTokens += getNumber(row, 'total_tokens');
      acc.estimatedCostUsd += getNumber(row, 'estimated_cost_usd');
      return acc;
    },
    { estimatedCostUsd: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );

  await getDb().execute({
    sql: `INSERT INTO ai_review_runs (
            id,
            review_date,
            agency_id,
            status,
            selected_count,
            total_input_tokens,
            total_output_tokens,
            total_tokens,
            total_estimated_cost_usd,
            created_by_user_id,
            created_by_email,
            created_by_name,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: [
      runId,
      reviewDate,
      agencyId,
      selected.length > 0 ? 'READY' : 'EMPTY',
      selected.length,
      totals.inputTokens,
      totals.outputTokens,
      totals.totalTokens,
      roundCost(totals.estimatedCostUsd),
      authUser.id,
      authUser.email,
      authUser.name,
    ],
  });

  for (const { copy, row } of copiedSelected) {
    await persistPromptSnapshotsForJob(String(row.document_job_id));
    await getDb().execute({
      sql: `INSERT INTO ai_review_items (
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
              input_tokens,
              output_tokens,
              total_tokens,
              estimated_cost_usd,
              processed_at,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      args: [
        randomUUID(),
        runId,
        String(row.document_job_id),
        String(row.batch_id || ''),
        String(row.agency_id),
        row.agency_name ? String(row.agency_name) : null,
        String(row.original_file_name),
        copy.storageBucket,
        copy.objectKey,
        copy.buffer.length,
        String(row.extraction_format || 'AGENT_GENERIC_A'),
        row.model_summary ? String(row.model_summary) : null,
        row.prompt_hashes ? String(row.prompt_hashes) : null,
        getNumber(row, 'input_tokens'),
        getNumber(row, 'output_tokens'),
        getNumber(row, 'total_tokens'),
        roundCost(getNumber(row, 'estimated_cost_usd')),
        row.processed_at ? String(row.processed_at) : null,
      ],
    });
  }

  return c.json({ run: await getRunWithItems(runId) }, 201);
});

aiReview.get('/items/:id/pdf', async (c) => {
  const itemRow = await getReviewItemRow(c.req.param('id'));
  if (!itemRow) {
    return c.json({ error: 'Documento de revisión no encontrado.' }, 404);
  }

  const reviewObjectKey = getString(itemRow, 'review_object_key');
  const sourceObjectKey = getString(itemRow, 'object_key');
  const objectKey = reviewObjectKey || sourceObjectKey;
  if (!objectKey) {
    return c.json({ error: 'PDF de AutoPilot AI no disponible.' }, 404);
  }

  try {
    const buffer = await getDocumentObject(objectKey);
    const fileName = buildInlinePdfFileName(String(itemRow.original_file_name || 'document.pdf'));

    return new Response(buffer, {
      headers: {
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Content-Length': String(buffer.length),
        'Content-Type': 'application/pdf',
        'X-Content-Type-Options': 'nosniff',
      },
      status: 200,
    });
  } catch (error) {
    const errorId = randomUUID();
    console.error(`[${errorId}] Error leyendo PDF AutoPilot ${c.req.param('id')}:`, error);
    return c.json({ error: 'No se pudo cargar el PDF de AutoPilot AI.', errorId }, 502);
  }
});

aiReview.get('/items/:id', async (c) => {
  const detail = await getItemDetail(c.req.param('id'));
  if (!detail) {
    return c.json({ error: 'Documento de revisión no encontrado.' }, 404);
  }

  return c.json(detail);
});

aiReview.post('/items/:id/analyze', async (c) => {
  const authUser = c.get('authUser') as {
    email: string;
    id: string;
  };
  const itemId = c.req.param('id');
  const itemRow = await getReviewItemRow(itemId);
  if (!itemRow) {
    return c.json({ error: 'Documento de revisión no encontrado.' }, 404);
  }

  const detail = await getItemDetail(itemId);
  if (!detail) {
    return c.json({ error: 'Documento de revisión no encontrado.' }, 404);
  }

  try {
    const pdfObjectKey =
      getString(itemRow, 'review_object_key') || getString(itemRow, 'object_key');
    if (!pdfObjectKey) {
      return c.json({ error: 'PDF de AutoPilot AI no disponible.' }, 404);
    }

    const pdfBuffer = await getDocumentObject(pdfObjectKey);
    const review = await runReviewer({ detail, pdfBuffer });
    const recommendationCount = Array.isArray(review.analysis.promptRecommendations)
      ? review.analysis.promptRecommendations.length
      : 0;
    const analysisId = randomUUID();
    const verdict =
      typeof review.analysis.verdict === 'string' ? review.analysis.verdict : 'REVIEW_NEEDED';
    const confidenceScore = Number(review.analysis.confidenceScore);
    const summary =
      typeof review.analysis.summary === 'string'
        ? review.analysis.summary.slice(0, 500)
        : 'Análisis generado.';

    await getDb().execute({
      sql: `INSERT INTO ai_review_analyses (
              id,
              item_id,
              status,
              reviewer_model,
              verdict,
              confidence_score,
              analysis_json,
              recommendation_summary,
              input_tokens,
              output_tokens,
              total_tokens,
              estimated_cost_usd,
              created_by_user_id,
              created_by_email,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      args: [
        analysisId,
        itemId,
        recommendationCount > 0 ? 'PENDING_APPROVAL' : 'DRAFT',
        review.model,
        verdict,
        Number.isFinite(confidenceScore) ? Math.round(confidenceScore) : null,
        JSON.stringify(review.analysis),
        summary,
        review.inputTokens,
        review.outputTokens,
        review.totalTokens,
        review.estimatedCostUsd,
        authUser.id,
        authUser.email,
      ],
    });

    await getDb().execute({
      sql: `UPDATE ai_review_items SET
              status = 'ANALYZED',
              analysis_error = NULL,
              updated_at = datetime('now')
            WHERE id = ?`,
      args: [itemId],
    });

    return c.json({ detail: await getItemDetail(itemId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await getDb().execute({
      sql: `UPDATE ai_review_items SET
              status = 'ANALYSIS_ERROR',
              analysis_error = ?,
              updated_at = datetime('now')
            WHERE id = ?`,
      args: [message.slice(0, 500), itemId],
    });

    return c.json({ error: 'No se pudo ejecutar el agente revisor.', detail: message }, 502);
  }
});

export default aiReview;
