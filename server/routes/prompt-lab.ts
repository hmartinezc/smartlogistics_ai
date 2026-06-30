import { createHash, randomUUID } from 'node:crypto';
import type { InValue } from '@libsql/client';
import { GoogleGenerativeAI, type Part as LegacyPart } from '@google/generative-ai';
import { Hono } from 'hono';
import type { AgentType, InvoiceData } from '../../types.js';
import {
  buildRouterExtractorPrompt,
  ROUTER_CLASSIFICATION_PROMPT,
  type RouterInvoiceCategory,
} from '../../services/extractionRouterPrompts.js';
import { getDb } from '../db.js';
import { requireAuth, requireRole, type AuthUser } from '../security.js';
import {
  generateInvoiceWithGenaiRouterFilesDetailed,
  getGeminiApiKey,
  getGeminiModelId,
  normalizeAgentType,
  type ExtractionRunMetrics,
} from '../services/documentExtractionService.js';
import { getGeminiPromptHash } from '../services/geminiPromptCache.js';
import {
  buildPromptLabObjectKey,
  getDocumentObject,
  getInvoiceBucketName,
  putDocumentObject,
  removeDocumentObject,
} from '../services/minioService.js';

const promptLab = new Hono<{ Variables: { authUser: AuthUser } }>();

const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_ORIGINAL_FILE_NAME_LENGTH = 180;
const MAX_TEXT_FIELD_LENGTH = 40_000;
const DEFAULT_REVIEWER_MAX_OUTPUT_TOKENS = 6144;
const DEFAULT_REVIEWER_RETRY_ATTEMPTS = 3;
const DEFAULT_REVIEWER_RETRY_BASE_DELAY_MS = 5000;
const DEFAULT_REVIEWER_TIMEOUT_MS = 180_000;

type Row = Record<string, unknown>;

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

function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeLongText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_TEXT_FIELD_LENGTH) : null;
}

function parseJsonText(value: unknown): string | null {
  const text = sanitizeLongText(value);
  if (!text) {
    return null;
  }

  JSON.parse(text);
  return text;
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

function getOriginalFileName(file: File): string {
  return sanitizeText(file.name || 'document.pdf', MAX_ORIGINAL_FILE_NAME_LENGTH) || 'document.pdf';
}

function buildInlinePdfFileName(value: string): string {
  return sanitizeText(value || 'document.pdf', MAX_ORIGINAL_FILE_NAME_LENGTH).replace(/"/g, '');
}

function readMaxUploadBytes(): number {
  const value = Number(process.env.DOCUMENT_UPLOAD_MAX_BYTES || DEFAULT_MAX_UPLOAD_BYTES);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_UPLOAD_BYTES;
  }

  return Math.floor(value);
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

async function getAgencyName(agencyId: string): Promise<string | null> {
  const result = await getDb().execute({
    sql: 'SELECT name FROM agencies WHERE id = ? LIMIT 1',
    args: [agencyId],
  });

  return result.rows[0]?.name ? String(result.rows[0].name) : null;
}

function getReviewerModelId(): string {
  return process.env.GEMINI_PROMPT_LAB_REVIEW_MODEL_ID?.trim() || getGeminiModelId();
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.floor(value);
}

function readReviewerMaxOutputTokens(): number {
  return readPositiveIntegerEnv(
    'GEMINI_PROMPT_LAB_REVIEW_MAX_OUTPUT_TOKENS',
    DEFAULT_REVIEWER_MAX_OUTPUT_TOKENS,
  );
}

function readReviewerRetryAttempts(): number {
  return readPositiveIntegerEnv(
    'GEMINI_PROMPT_LAB_REVIEW_RETRY_ATTEMPTS',
    DEFAULT_REVIEWER_RETRY_ATTEMPTS,
  );
}

function readReviewerRetryBaseDelayMs(): number {
  return readPositiveIntegerEnv(
    'GEMINI_PROMPT_LAB_REVIEW_RETRY_BASE_DELAY_MS',
    DEFAULT_REVIEWER_RETRY_BASE_DELAY_MS,
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isJsonParseError(error: unknown): boolean {
  return error instanceof SyntaxError;
}

function isTransientReviewerError(error: unknown): boolean {
  const status = (error as { status?: unknown } | undefined)?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error || '');
  return /429|500|502|503|504|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|timeout/i.test(message);
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

function getOutputTokenCount(metrics: {
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
}): number {
  return Number(metrics.candidatesTokenCount || 0) + Number(metrics.thoughtsTokenCount || 0);
}

function summarizeMetrics(metrics: ExtractionRunMetrics) {
  const classifierInputTokens = Number(metrics.classifier?.promptTokenCount || 0);
  const classifierOutputTokens = getOutputTokenCount(metrics.classifier || {});
  const extractorInputTokens = Number(metrics.extractor?.promptTokenCount || 0);
  const extractorOutputTokens = getOutputTokenCount(metrics.extractor || {});
  const inputTokens =
    classifierInputTokens + extractorInputTokens || Number(metrics.promptTokenCount || 0);
  const outputTokens =
    classifierOutputTokens + extractorOutputTokens || getOutputTokenCount(metrics);
  const totalTokens = Number(metrics.totalTokenCount || inputTokens + outputTokens);
  const classifierCost = metrics.classifier
    ? estimateGeminiCostUsd({
        inputTokens: classifierInputTokens,
        model: metrics.classifier.model,
        outputTokens: classifierOutputTokens,
      })
    : 0;
  const extractorCost = metrics.extractor
    ? estimateGeminiCostUsd({
        inputTokens: extractorInputTokens,
        model: metrics.extractor.model,
        outputTokens: extractorOutputTokens,
      })
    : estimateGeminiCostUsd({
        inputTokens,
        model: metrics.model,
        outputTokens,
      });

  return {
    estimatedCostUsd: roundCost(classifierCost + extractorCost),
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function buildPromptSnapshot(input: {
  agentType: AgentType;
  model: string;
  promptKind: string;
  promptText: string;
  routerCategory?: string | null;
  source: string;
}) {
  const promptHash = getGeminiPromptHash(input.promptText).slice(0, 12);
  const idSource = [
    input.promptKind,
    input.agentType,
    input.routerCategory || 'none',
    input.model,
    promptHash,
  ].join(':');

  return {
    agentType: input.agentType,
    id: `snapshot_${createHash('sha256').update(idSource).digest('hex').slice(0, 24)}`,
    model: input.model,
    promptHash,
    promptKind: input.promptKind,
    promptProfile: input.routerCategory === 'UNKNOWN_GENERAL' ? 'compact' : null,
    promptText: input.promptText,
    routerCategory: input.routerCategory || null,
    source: input.source,
  };
}

function buildPromptSnapshots(input: { agentType: AgentType; metrics: ExtractionRunMetrics }) {
  const snapshots = [
    buildPromptSnapshot({
      agentType: input.agentType,
      model: input.metrics.classifier?.model || input.metrics.model,
      promptKind: 'classifier',
      promptText: ROUTER_CLASSIFICATION_PROMPT,
      source: 'router-classifier-current-code',
    }),
  ];

  const routerCategory = input.metrics.routerCategory || 'UNKNOWN_GENERAL';
  snapshots.push(
    buildPromptSnapshot({
      agentType: input.agentType,
      model: input.metrics.extractor?.model || input.metrics.model,
      promptKind: 'router-extractor',
      promptText: buildRouterExtractorPrompt(
        input.agentType,
        routerCategory as RouterInvoiceCategory,
      ),
      routerCategory,
      source: 'router-extractor-current-code',
    }),
  );

  return snapshots;
}

function buildValidatorPrompt(input: {
  analysisCostUsd: number;
  caseRow: ReturnType<typeof buildCase>;
  expectedData: unknown | null;
  extraction: InvoiceData;
  extractionCostUsd: number;
  metrics: ExtractionRunMetrics;
  promptSnapshots: ReturnType<typeof buildPromptSnapshots>;
}): string {
  const prompts = input.promptSnapshots.map((snapshot) => ({
    kind: snapshot.promptKind,
    hash: snapshot.promptHash,
    category: snapshot.routerCategory,
    model: snapshot.model,
    prompt: snapshot.promptText.slice(0, 12_000),
  }));

  return `
You are Prompt Lab AI, an internal validator for a flower logistics invoice extraction system.
Review the attached PDF, the extracted JSON, the detected classifier category, run metrics, prompt snapshots, and optional human expected data.
Do not change production prompts. Recommend only, for human approval.

Return strict JSON with this shape:
{
  "verdict": "OK" | "REVIEW_NEEDED" | "PROMPT_IMPROVEMENT_SUGGESTED" | "NEW_CATEGORY_SUGGESTED",
  "confidenceScore": number,
  "summary": string,
  "fieldFindings": [{"field": string, "actual": string, "expected": string, "reason": string, "severity": "LOW" | "MEDIUM" | "HIGH"}],
  "classifierRecommendations": [{"area": string, "recommendation": string, "expectedImpact": string, "costImpact": "LOWER" | "NEUTRAL" | "HIGHER"}],
  "extractorRecommendations": [{"category": string, "area": string, "recommendation": string, "expectedImpact": string, "costImpact": "LOWER" | "NEUTRAL" | "HIGHER"}],
  "newCategoryRecommendation": {"needed": boolean, "suggestedName": string | null, "visualSignals": string[], "extractorPromptDraft": string | null, "testCases": string[]},
  "schemaOrCodeRecommendations": string[],
  "deterministicRuleRecommendations": string[],
  "costNotes": string[],
  "validationPlan": string[],
  "patchProposal": {"type": "CLASSIFIER_PROMPT_ADJUSTMENT" | "EXTRACTOR_PROMPT_ADJUSTMENT" | "NEW_ROUTER_CATEGORY" | "SCHEMA_CHANGE" | "DETERMINISTIC_RULE_CHANGE" | "NONE", "target": string, "rationale": string, "proposedDiff": string, "risk": string, "requiresDeveloperWork": boolean}
}

Decision rules:
- If the current classifier category and extractor can handle the invoice with small wording changes, prefer PROMPT_IMPROVEMENT_SUGGESTED.
- Recommend NEW_CATEGORY_SUGGESTED only when the invoice has a visual layout not covered by the current categories.
- Separate classifier issues from extractor issues.
- Mention schema/code changes only when the current output shape cannot represent the needed data.
- Always include cost impact before recommending more tokens, retries, higher thinking, extra calls, or model changes.
- Extraction accuracy is more important than token savings.
- Keep patchProposal as a proposal only. Never claim it was applied.

Response budget:
- Return valid JSON only. No markdown, comments, trailing commas, or unescaped newlines inside strings.
- Keep arrays concise: at most 5 fieldFindings, 3 classifierRecommendations, 3 extractorRecommendations, 3 schemaOrCodeRecommendations, 3 deterministicRuleRecommendations, 3 costNotes and 5 validationPlan items.
- Keep summary under 500 characters and each recommendation under 350 characters.
- Keep patchProposal.proposedDiff under 1200 characters. If no patch is needed, use type "NONE" and short empty-safe strings.
- If the extraction is mostly correct, prefer a compact OK or REVIEW_NEEDED response instead of verbose recommendations.

Prompt Lab case:
${JSON.stringify(input.caseRow)}

Detected category and metrics:
${JSON.stringify(input.metrics)}

Extraction cost estimate: ${input.extractionCostUsd}
Reviewer cost estimate before response: ${input.analysisCostUsd}

Extracted JSON:
${JSON.stringify(input.extraction)}

Human expected data or notes:
${JSON.stringify(input.expectedData)}

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

async function runValidator(input: {
  caseRow: ReturnType<typeof buildCase>;
  expectedData: unknown | null;
  extraction: InvoiceData;
  extractionCostUsd: number;
  metrics: ExtractionRunMetrics;
  pdfBuffer: Buffer;
  promptSnapshots: ReturnType<typeof buildPromptSnapshots>;
}) {
  const model = getReviewerModelId();
  const startedAtMs = Date.now();
  const maxAttempts = readReviewerRetryAttempts();
  const maxOutputTokens = readReviewerMaxOutputTokens();
  const retryBaseDelayMs = readReviewerRetryBaseDelayMs();
  const ai = new GoogleGenerativeAI(getGeminiApiKey());
  const reviewerModel = ai.getGenerativeModel(
    {
      generationConfig: {
        maxOutputTokens,
        responseMimeType: 'application/json',
      },
      model,
    },
    {
      apiVersion: 'v1beta',
      timeout: DEFAULT_REVIEWER_TIMEOUT_MS,
    },
  );
  const basePrompt = buildValidatorPrompt({
    analysisCostUsd: 0,
    caseRow: input.caseRow,
    expectedData: input.expectedData,
    extraction: input.extraction,
    extractionCostUsd: input.extractionCostUsd,
    metrics: input.metrics,
    promptSnapshots: input.promptSnapshots,
  });
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const retryInstruction =
      attempt === 1
        ? ''
        : [
            '',
            'RETRY INSTRUCTION:',
            'The previous validator response failed or was not parseable. Return a shorter valid JSON object only. Close every string and array. Prefer concise findings over long prose.',
          ].join('\n');
    const parts: Array<string | LegacyPart> = [
      {
        inlineData: {
          data: input.pdfBuffer.toString('base64'),
          mimeType: 'application/pdf',
        },
      },
      { text: `${basePrompt}${retryInstruction}` },
    ];

    try {
      const result = await reviewerModel.generateContent(parts, {
        timeout: DEFAULT_REVIEWER_TIMEOUT_MS,
      });
      const text = result.response.text();
      const analysis = parseReviewerJson(text);
      const usage = result.response.usageMetadata;
      const inputTokens = Number(usage?.promptTokenCount || 0);
      const thoughtsTokenCount = Number(
        (usage as { thoughtsTokenCount?: number } | undefined)?.thoughtsTokenCount || 0,
      );
      const outputTokens = Number(usage?.candidatesTokenCount || 0) + thoughtsTokenCount;
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
    } catch (error) {
      lastError = error;
      const retryable = isJsonParseError(error) || isTransientReviewerError(error);
      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }

      const delayMs = retryBaseDelayMs * attempt;
      console.warn('Prompt Lab validator retrying after transient/JSON error.', {
        attempt,
        delayMs,
        error: error instanceof Error ? error.message : String(error || 'unknown'),
        maxAttempts,
        model,
      });
      await delay(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Prompt Lab validator failed.');
}

function buildCase(row: Row) {
  return {
    id: String(row.id),
    agencyId: String(row.agency_id),
    agencyName: getString(row, 'agency_name') || null,
    originalFileName: String(row.original_file_name),
    storageBucket: getString(row, 'storage_bucket') || null,
    objectKey: getString(row, 'object_key') || null,
    fileSizeBytes: getNumber(row, 'file_size_bytes'),
    mimeType: String(row.mime_type || 'application/pdf'),
    extractionFormat: String(row.extraction_format || 'AGENT_GENERIC_A'),
    status: String(row.status),
    expectedJson: getString(row, 'expected_json') || null,
    adminNotes: getString(row, 'admin_notes') || null,
    latestAnalysisId: getString(row, 'latest_analysis_id') || null,
    pdfDeletedAt: getString(row, 'pdf_deleted_at') || null,
    analysisError: getString(row, 'analysis_error') || null,
    createdBy: {
      id: getString(row, 'created_by_user_id') || null,
      email: getString(row, 'created_by_email') || null,
      name: getString(row, 'created_by_name') || null,
    },
    createdAt: getString(row, 'created_at') || null,
    updatedAt: getString(row, 'updated_at') || null,
  };
}

function buildAnalysis(row: Row) {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    reviewerModel: String(row.reviewer_model),
    verdict: String(row.verdict),
    confidenceScore:
      row.confidence_score === null || row.confidence_score === undefined
        ? null
        : getNumber(row, 'confidence_score'),
    extraction: parseJsonValue(row.extraction_json),
    extractionMetrics: parseJsonValue(row.extraction_metrics_json),
    promptSnapshots: parseJsonValue(row.prompt_snapshots_json) || [],
    analysis: parseJsonValue(row.analysis_json),
    patchProposal: parseJsonValue(row.patch_proposal_json),
    inputTokens: getNumber(row, 'input_tokens'),
    outputTokens: getNumber(row, 'output_tokens'),
    totalTokens: getNumber(row, 'total_tokens'),
    estimatedCostUsd: getNumber(row, 'estimated_cost_usd'),
    createdBy: {
      id: getString(row, 'created_by_user_id') || null,
      email: getString(row, 'created_by_email') || null,
    },
    createdAt: getString(row, 'created_at') || null,
  };
}

async function getCaseRow(caseId: string): Promise<Row | null> {
  const result = await getDb().execute({
    sql: 'SELECT * FROM prompt_lab_cases WHERE id = ? LIMIT 1',
    args: [caseId],
  });

  return (result.rows[0] as Row | undefined) || null;
}

async function getCaseDetail(caseId: string) {
  const caseRow = await getCaseRow(caseId);
  if (!caseRow) {
    return null;
  }

  const analysesResult = await getDb().execute({
    sql: `SELECT *
          FROM prompt_lab_analyses
          WHERE case_id = ?
          ORDER BY created_at DESC`,
    args: [caseId],
  });

  return {
    analyses: (analysesResult.rows as Row[]).map(buildAnalysis),
    case: buildCase(caseRow),
  };
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value || 25);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 25;
  }

  return Math.min(parsed, 100);
}

promptLab.use('*', async (c, next) => {
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

promptLab.get('/cases', async (c) => {
  const agencyId = c.req.query('agencyId')?.trim();
  const limit = normalizeLimit(c.req.query('limit'));
  const where: string[] = [];
  const args: InValue[] = [];

  if (agencyId && agencyId !== 'GLOBAL') {
    where.push('agency_id = ?');
    args.push(agencyId);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await getDb().execute({
    sql: `SELECT *
          FROM prompt_lab_cases
          ${whereSql}
          ORDER BY created_at DESC
          LIMIT ?`,
    args: [...args, limit],
  });

  return c.json({ cases: (result.rows as Row[]).map(buildCase) });
});

promptLab.post('/cases', async (c) => {
  const authUser = c.get('authUser');
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Solicitud inválida. Use multipart/form-data.' }, 400);
  }

  const file = formData.get('file');
  const agencyId = String(formData.get('agencyId') || '').trim();
  const format = normalizeAgentType(String(formData.get('format') || 'AGENT_GENERIC_A'));
  const adminNotes = sanitizeLongText(formData.get('adminNotes'));
  let expectedJson: string | null = null;

  if (!agencyId || agencyId === 'GLOBAL') {
    return c.json({ error: 'Se requiere una agencia específica para Prompt Lab AI.' }, 400);
  }

  if (!(file instanceof File)) {
    return c.json({ error: 'Archivo PDF requerido.' }, 400);
  }

  if (!isPdfFile(file)) {
    return c.json({ error: 'Prompt Lab AI solo acepta archivos PDF.' }, 400);
  }

  if (file.size <= 0) {
    return c.json({ error: 'El PDF está vacío.' }, 400);
  }

  const maxUploadBytes = readMaxUploadBytes();
  if (file.size > maxUploadBytes) {
    return c.json(
      { error: `El PDF supera el límite de ${Math.floor(maxUploadBytes / 1024 / 1024)} MB.` },
      400,
    );
  }

  try {
    expectedJson = parseJsonText(formData.get('expectedJson'));
  } catch {
    return c.json({ error: 'expectedJson debe ser JSON válido.' }, 400);
  }

  const agencyName = await getAgencyName(agencyId);
  if (!agencyName) {
    return c.json({ error: 'Agencia no encontrada.' }, 404);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isPdfBuffer(buffer)) {
    return c.json({ error: 'El archivo no parece ser un PDF válido.' }, 400);
  }

  const caseId = randomUUID();
  const originalFileName = getOriginalFileName(file);
  const objectKey = buildPromptLabObjectKey({
    agencyId,
    agencyName,
    caseId,
    originalFilename: originalFileName,
  });

  try {
    await putDocumentObject({
      buffer,
      contentType: 'application/pdf',
      metadata: {
        'x-amz-meta-agency-id': agencyId,
        'x-amz-meta-prompt-lab-case-id': caseId,
      },
      objectKey,
    });
  } catch (error) {
    const errorId = randomUUID();
    console.error(`[${errorId}] Error guardando PDF Prompt Lab:`, error);
    return c.json({ error: 'No se pudo guardar el PDF de Prompt Lab AI.', errorId }, 502);
  }

  await getDb().execute({
    sql: `INSERT INTO prompt_lab_cases (
            id,
            agency_id,
            agency_name,
            original_file_name,
            storage_bucket,
            object_key,
            file_size_bytes,
            mime_type,
            extraction_format,
            expected_json,
            admin_notes,
            created_by_user_id,
            created_by_email,
            created_by_name,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: [
      caseId,
      agencyId,
      agencyName,
      originalFileName,
      getInvoiceBucketName(),
      objectKey,
      buffer.length,
      'application/pdf',
      format,
      expectedJson,
      adminNotes,
      authUser.id,
      authUser.email,
      authUser.name,
    ],
  });

  return c.json(await getCaseDetail(caseId), 201);
});

promptLab.get('/cases/:id', async (c) => {
  const detail = await getCaseDetail(c.req.param('id'));
  if (!detail) {
    return c.json({ error: 'Caso de Prompt Lab AI no encontrado.' }, 404);
  }

  return c.json(detail);
});

promptLab.get('/cases/:id/pdf', async (c) => {
  const caseRow = await getCaseRow(c.req.param('id'));
  if (!caseRow) {
    return c.json({ error: 'Caso de Prompt Lab AI no encontrado.' }, 404);
  }

  const objectKey = getString(caseRow, 'object_key');
  if (!objectKey) {
    return c.json({ error: 'El PDF de este caso fue eliminado o no está disponible.' }, 404);
  }

  try {
    const buffer = await getDocumentObject(objectKey);
    const fileName = buildInlinePdfFileName(String(caseRow.original_file_name || 'document.pdf'));

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
    console.error(`[${errorId}] Error leyendo PDF Prompt Lab ${c.req.param('id')}:`, error);
    return c.json({ error: 'No se pudo cargar el PDF de Prompt Lab AI.', errorId }, 502);
  }
});

promptLab.delete('/cases/:id/pdf', async (c) => {
  const caseId = c.req.param('id');
  const caseRow = await getCaseRow(caseId);
  if (!caseRow) {
    return c.json({ error: 'Caso de Prompt Lab AI no encontrado.' }, 404);
  }

  const objectKey = getString(caseRow, 'object_key');
  if (objectKey) {
    try {
      await removeDocumentObject(objectKey);
    } catch (error) {
      const errorId = randomUUID();
      console.error(`[${errorId}] Error eliminando PDF Prompt Lab ${caseId}:`, error);
      return c.json({ error: 'No se pudo eliminar el PDF de Prompt Lab AI.', errorId }, 502);
    }
  }

  await getDb().execute({
    sql: `UPDATE prompt_lab_cases
          SET object_key = NULL,
              storage_bucket = NULL,
              pdf_deleted_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?`,
    args: [caseId],
  });

  return c.json(await getCaseDetail(caseId));
});

promptLab.patch('/cases/:id/expected', async (c) => {
  const caseId = c.req.param('id');
  const caseRow = await getCaseRow(caseId);
  if (!caseRow) {
    return c.json({ error: 'Caso de Prompt Lab AI no encontrado.' }, 404);
  }

  const body = (await c.req.json().catch(() => ({}))) as Row;
  let expectedJson: string | null;
  try {
    expectedJson = parseJsonText(body.expectedJson);
  } catch {
    return c.json({ error: 'expectedJson debe ser JSON válido.' }, 400);
  }
  const adminNotes = sanitizeLongText(body.adminNotes);

  await getDb().execute({
    sql: `UPDATE prompt_lab_cases
          SET expected_json = ?,
              admin_notes = ?,
              updated_at = datetime('now')
          WHERE id = ?`,
    args: [expectedJson, adminNotes, caseId],
  });

  return c.json(await getCaseDetail(caseId));
});

promptLab.post('/cases/:id/analyze', async (c) => {
  const authUser = c.get('authUser');
  const caseId = c.req.param('id');
  const caseRow = await getCaseRow(caseId);
  if (!caseRow) {
    return c.json({ error: 'Caso de Prompt Lab AI no encontrado.' }, 404);
  }

  const caseInfo = buildCase(caseRow);
  if (!caseInfo.objectKey) {
    return c.json({ error: 'No se puede analizar porque el PDF fue eliminado.' }, 400);
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await getDocumentObject(caseInfo.objectKey);
  } catch (error) {
    const errorId = randomUUID();
    console.error(`[${errorId}] Error leyendo PDF Prompt Lab ${caseId}:`, error);
    return c.json({ error: 'No se pudo leer el PDF de Prompt Lab AI.', errorId }, 502);
  }

  const format = normalizeAgentType(caseInfo.extractionFormat);
  try {
    const extractionRun = await generateInvoiceWithGenaiRouterFilesDetailed({
      agentType: format,
      document: {
        buffer: pdfBuffer,
        format,
        mimeType: caseInfo.mimeType || 'application/pdf',
        telemetryContext: {
          agencyId: caseInfo.agencyId,
          originalFileName: caseInfo.originalFileName,
          source: 'prompt-lab',
          userEmail: authUser.email,
          userId: authUser.id,
          userName: authUser.name,
        },
      },
    });
    const extractionTotals = summarizeMetrics(extractionRun.metrics);
    const promptSnapshots = buildPromptSnapshots({
      agentType: format,
      metrics: extractionRun.metrics,
    });
    const expectedData = caseInfo.expectedJson ? parseJsonValue(caseInfo.expectedJson) : null;
    const validator = await runValidator({
      caseRow: caseInfo,
      expectedData:
        expectedData || caseInfo.adminNotes
          ? {
              expectedJson: expectedData,
              notes: caseInfo.adminNotes,
            }
          : null,
      extraction: extractionRun.result,
      extractionCostUsd: extractionTotals.estimatedCostUsd,
      metrics: extractionRun.metrics,
      pdfBuffer,
      promptSnapshots,
    });
    const analysis = validator.analysis;
    const analysisId = randomUUID();
    const verdict = typeof analysis.verdict === 'string' ? analysis.verdict : 'REVIEW_NEEDED';
    const confidenceScore = Number(analysis.confidenceScore);
    const totalInputTokens = extractionTotals.inputTokens + validator.inputTokens;
    const totalOutputTokens = extractionTotals.outputTokens + validator.outputTokens;
    const totalTokens = extractionTotals.totalTokens + validator.totalTokens;
    const totalCost = roundCost(extractionTotals.estimatedCostUsd + validator.estimatedCostUsd);

    await getDb().execute({
      sql: `INSERT INTO prompt_lab_analyses (
              id,
              case_id,
              reviewer_model,
              verdict,
              confidence_score,
              extraction_json,
              extraction_metrics_json,
              prompt_snapshots_json,
              analysis_json,
              patch_proposal_json,
              input_tokens,
              output_tokens,
              total_tokens,
              estimated_cost_usd,
              created_by_user_id,
              created_by_email,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        analysisId,
        caseId,
        validator.model,
        verdict,
        Number.isFinite(confidenceScore) ? Math.round(confidenceScore) : null,
        JSON.stringify(extractionRun.result),
        JSON.stringify({
          ...extractionRun.metrics,
          estimatedCostUsd: extractionTotals.estimatedCostUsd,
          validatorDurationMs: validator.durationMs,
          validatorEstimatedCostUsd: validator.estimatedCostUsd,
        }),
        JSON.stringify(promptSnapshots),
        JSON.stringify(analysis),
        analysis.patchProposal ? JSON.stringify(analysis.patchProposal) : null,
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
        totalCost,
        authUser.id,
        authUser.email,
      ],
    });

    await getDb().execute({
      sql: `UPDATE prompt_lab_cases
            SET status = 'ANALYZED',
                latest_analysis_id = ?,
                analysis_error = NULL,
                updated_at = datetime('now')
            WHERE id = ?`,
      args: [analysisId, caseId],
    });

    return c.json(await getCaseDetail(caseId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    await getDb().execute({
      sql: `UPDATE prompt_lab_cases
            SET status = 'ANALYSIS_ERROR',
                analysis_error = ?,
                updated_at = datetime('now')
            WHERE id = ?`,
      args: [message.slice(0, 1000), caseId],
    });
    const errorId = randomUUID();
    console.error(`[${errorId}] Error analizando Prompt Lab ${caseId}:`, error);
    return c.json(
      { error: `No se pudo analizar el caso de Prompt Lab AI: ${message}`, errorId },
      502,
    );
  }
});

export default promptLab;
