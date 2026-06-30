import {
  createPartFromUri,
  FileState,
  GoogleGenAI,
  MediaResolution,
  ThinkingLevel,
  type Content,
  type File as GeminiFile,
  type GenerateContentConfig,
  type GenerateContentResponse,
} from '@google/genai';
import { Blob } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  GoogleGenerativeAI,
  type GenerateContentResult as LegacyGenerateContentResult,
  type Part as LegacyPart,
  type Schema as LegacySchema,
  type UsageMetadata as LegacyUsageMetadata,
} from '@google/generative-ai';
import {
  GoogleAICacheManager,
  type CachedContent as LegacyCachedContent,
  type Content as LegacyContent,
} from '@google/generative-ai/server';
import { AI_CONFIG, ERROR_MESSAGES } from '../../config.js';
import {
  buildExtractionPrompt,
  type ExtractionPromptProfile,
} from '../../services/agentPrompts.js';
import {
  buildRouterExtractorPrompt,
  isRouterInvoiceCategory,
  ROUTER_CLASSIFICATION_PROMPT,
  routerClassificationSchema,
  type RouterInvoiceCategory,
} from '../../services/extractionRouterPrompts.js';
import { invoiceExtractionSchema } from '../../shared/extractionSchema.js';
import type {
  AgentType,
  ConfidenceReason,
  ConfidenceReasonCode,
  InvoiceData,
} from '../../types.js';
import {
  getGeminiPromptCacheConfig,
  getGeminiPromptCache,
  getGeminiPromptHash,
  getReadyGeminiPromptCache,
  isGeminiPromptCacheAutoWarmEnabled,
  isGeminiPromptCacheEnabled,
  isGeminiPromptCacheTransientFallbackEnabled,
  isGeminiPromptCacheUsedForExtraction,
  removeGeminiPromptCache,
  warmGeminiPromptCache,
  type PromptCacheDiagnostic,
  type PromptCacheHandle,
} from './geminiPromptCache.js';
import {
  persistGeminiExtractionEvent,
  type GeminiExtractionTelemetryContext,
} from './geminiExtractionEvents.js';

export interface ExtractInvoiceFromBufferInput {
  buffer: Buffer;
  mimeType?: string;
  format?: string;
  telemetryContext?: GeminiExtractionTelemetryContext;
}

const ALLOWED_AGENT_TYPES = new Set<AgentType>([
  'AGENT_GENERIC_A',
  'AGENT_GENERIC_B',
  'AGENT_CUSTOMS',
]);

const VALID_REASON_CODES = new Set<ConfidenceReasonCode>([
  'PIECES_TOTAL_MISMATCH',
  'EQ_TOTAL_MISMATCH',
  'VALUE_TOTAL_MISMATCH',
  'OCR_UNCERTAIN',
  'MISSING_FIELD',
  'AMBIGUOUS_TABLE',
  'DOCUMENT_INCOMPLETE',
  'OTHER',
]);

const MATH_REASON_CODES = new Set<ConfidenceReasonCode>([
  'PIECES_TOTAL_MISMATCH',
  'EQ_TOTAL_MISMATCH',
  'VALUE_TOTAL_MISMATCH',
]);

const VISUAL_REASON_DEFAULTS: Record<
  Exclude<
    ConfidenceReasonCode,
    'PIECES_TOTAL_MISMATCH' | 'EQ_TOTAL_MISMATCH' | 'VALUE_TOTAL_MISMATCH'
  >,
  Pick<ConfidenceReason, 'penalty' | 'message'>
> = {
  OCR_UNCERTAIN: {
    penalty: 10,
    message: 'OCR or text legibility was uncertain.',
  },
  MISSING_FIELD: {
    penalty: 12,
    message: 'A required field was missing or unreadable.',
  },
  AMBIGUOUS_TABLE: {
    penalty: 10,
    message: 'The table structure or grouping was ambiguous.',
  },
  DOCUMENT_INCOMPLETE: {
    penalty: 20,
    message: 'The document appears incomplete or partially visible.',
  },
  OTHER: {
    penalty: 8,
    message: 'A visual extraction uncertainty was detected.',
  },
};

const EQ_TOLERANCE = 0.05;
const VALUE_TOLERANCE_CENTS = 2;
const DEFAULT_DOCUMENT_MIME_TYPE = 'application/pdf';
const EXTRACTION_REQUEST_TEXT =
  'Extract visual/OCR invoice data using the cached rules. Return concise strict JSON only; backend recalculates math confidence.';
const MAX_GEMINI_EXTRACTION_EVENTS = 50;
const LEGACY_CACHE_EXPIRY_SAFETY_WINDOW_MS = 30_000;
const LEGACY_PROMPT_CACHE_KEY_PREFIX = 'legacy-cache';
const DEFAULT_GEMINI_GENERATE_TIMEOUT_MS = 180_000;
const DEFAULT_GEMINI_CACHED_GENERATE_TIMEOUT_MS = 180_000;
const DEFAULT_GEMINI_MAX_OUTPUT_TOKENS = 4096;
const DEFAULT_GEMINI_THINKING_LEVEL = 'minimal';
const DEFAULT_GENAI_TRANSIENT_RETRY_ATTEMPTS = 3;
const DEFAULT_GENAI_TRANSIENT_RETRY_BASE_DELAY_MS = 15_000;
const DEFAULT_LEGACY_TRANSIENT_RETRY_ATTEMPTS = 3;
const DEFAULT_LEGACY_TRANSIENT_RETRY_BASE_DELAY_MS = 15_000;
const DEFAULT_GEMINI_EXTRACTION_SDK: ExtractionSdk = 'legacy';
const DEFAULT_GEMINI_ROUTER_MODEL_ID = 'gemini-3.1-flash-lite';
const DEFAULT_GEMINI_ROUTER_EXTRACTOR_MODEL_ID = 'gemini-3-flash-preview';
const DEFAULT_GEMINI_ROUTER_CLASSIFIER_TIMEOUT_MS = 45_000;
const DEFAULT_GEMINI_ROUTER_EXTRACTOR_TIMEOUT_MS = 180_000;
const DEFAULT_GEMINI_ROUTER_CLASSIFIER_CONFIDENCE_THRESHOLD = 0.7;
const DEFAULT_GEMINI_ROUTER_CLASSIFIER_MAX_OUTPUT_TOKENS = 512;
const DEFAULT_GEMINI_ROUTER_CLASSIFIER_MEDIA_RESOLUTION = 'medium';
const DEFAULT_GEMINI_ROUTER_CLASSIFIER_THINKING_LEVEL = 'medium';

let genAIInstance: GoogleGenAI | null = null;
let genAIApiKey: string | null = null;
let legacyGenAIInstance: GoogleGenerativeAI | null = null;
let legacyGenAIApiKey: string | null = null;
let legacyCacheManagerInstance: GoogleAICacheManager | null = null;
let legacyCacheManagerApiKey: string | null = null;

type ExtractionSdk = 'legacy' | 'legacy-cache' | 'genai' | 'genai-router-files';
type GeminiThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high';

export interface GeminiExtractionDiagnostic {
  agentType: AgentType;
  agencyId?: string;
  batchId?: string;
  cacheMode: string;
  cacheTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  documentJobId?: string;
  durationMs: number;
  error?: string;
  fileDeleteDurationMs?: number;
  fileDeleteOk?: boolean;
  fileInputMode?: 'files-api' | 'inline-fallback';
  fileUploadDurationMs?: number;
  model: string;
  originalFileName?: string;
  promptHash: string;
  promptTokenCount?: number;
  routerCategory?: RouterInvoiceCategory;
  routerConfidence?: number;
  routerVisualSignals?: string[];
  sdk: ExtractionSdk;
  source?: GeminiExtractionTelemetryContext['source'];
  stage?: string;
  success: boolean;
  thoughtsTokenCount?: number;
  timestamp: string;
  totalTokenCount?: number;
  userEmail?: string;
  userId?: string;
  userName?: string;
}

export interface ExtractionUsageMetrics {
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  promptTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

export interface ExtractionRunMetrics extends ExtractionUsageMetrics {
  cacheMode: string;
  classifier?: ExtractionUsageMetrics & {
    durationMs: number;
    mediaResolution: string;
    model: string;
  };
  durationMs: number;
  extractor?: ExtractionUsageMetrics & {
    durationMs: number;
    mediaResolution: string;
    model: string;
    promptHash: string;
  };
  fileDeleteDurationMs?: number;
  fileDeleteOk?: boolean;
  fileInputMode?: 'files-api' | 'inline-fallback';
  fileUploadError?: string;
  fileUploadDurationMs?: number;
  model: string;
  promptHash: string;
  routerCategory?: RouterInvoiceCategory;
  routerConfidence?: number;
  routerVisualSignals?: string[];
  sdk: ExtractionSdk;
}

export interface ExtractionRunResult {
  metrics: ExtractionRunMetrics;
  result: InvoiceData;
}

export interface ExtractionDiffItem {
  field: string;
  genaiRouterFiles: unknown;
  legacy: unknown;
}

export interface ExtractionComparisonResult {
  diff: {
    summary: ExtractionDiffItem[];
  };
  genaiRouterFiles: ExtractionRunResult;
  legacy: ExtractionRunResult;
}

interface LegacyPromptCacheEntry {
  cache?: LegacyCachedContent;
  cacheTokenCount?: number;
  createDurationMs?: number;
  createPromise?: Promise<LegacyPromptCacheCreated>;
  createdAtMs?: number;
  expiresAtMs: number;
  failedUntilMs?: number;
  lastError?: string;
  updatedAtMs?: number;
  warmStartedAtMs?: number;
}

interface LegacyPromptCacheCreated {
  cache: LegacyCachedContent;
  cacheTokenCount?: number;
  createDurationMs: number;
  expiresAtMs: number;
}

interface LegacyPromptCacheHandle {
  cache: LegacyCachedContent;
  cacheKey: string;
  cacheName: string;
  cacheTokenCount?: number;
  promptHash: string;
  reusedExisting: boolean;
  waitedForCreate: boolean;
}

export interface ExtractionPromptCacheResult {
  agentType: AgentType;
  cacheName?: string;
  cacheTokenCount?: number;
  error?: string;
  promptHash: string;
  reusedExisting?: boolean;
  state: 'disabled' | 'ready' | 'error';
  waitedForCreate?: boolean;
}

const geminiExtractionEvents: GeminiExtractionDiagnostic[] = [];
const legacyPromptCacheEntries = new Map<string, LegacyPromptCacheEntry>();

export function getGeminiExtractionDiagnostics(): GeminiExtractionDiagnostic[] {
  return [...geminiExtractionEvents].reverse();
}

export function getGeminiExtractionRuntimeConfig() {
  return {
    apiKey: getGeminiApiKeyDiagnostics(),
    cachedGenerateTimeoutMs: readGeminiCachedGenerateTimeoutMs(),
    extractionSdk: readGeminiExtractionSdk(),
    fallbackToLegacyOnTransientError: isGeminiExtractionFallbackToLegacyEnabled(),
    generateTimeoutMs: readGeminiGenerateTimeoutMs(),
    maxOutputTokens: readGeminiMaxOutputTokens(),
    genaiTransientRetryAttempts: readGenaiTransientRetryAttempts(),
    genaiTransientRetryBaseDelayMs: readGenaiTransientRetryBaseDelayMs(),
    legacyTransientRetryAttempts: readLegacyTransientRetryAttempts(),
    legacyTransientRetryBaseDelayMs: readLegacyTransientRetryBaseDelayMs(),
    model: getGeminiModelId(),
    promptProfile: readGeminiExtractionPromptProfile(),
    routerClassifierConfidenceThreshold: readGeminiRouterClassifierConfidenceThreshold(),
    routerClassifierMaxOutputTokens: readGeminiRouterClassifierMaxOutputTokens(),
    routerClassifierMediaResolution: readGeminiRouterClassifierMediaResolution(),
    routerClassifierThinkingLevel: readGeminiRouterClassifierThinkingLevel(),
    routerClassifierTimeoutMs: readGeminiRouterClassifierTimeoutMs(),
    routerExtractorModel: getGeminiRouterExtractorModelId(),
    routerExtractorTimeoutMs: readGeminiRouterExtractorTimeoutMs(),
    routerModel: getGeminiRouterModelId(),
    thinkingLevel: readGeminiThinkingLevel(),
  };
}

export function getGeminiModelId(): string {
  const configuredModel = process.env.GEMINI_MODEL_ID?.trim();
  return configuredModel || AI_CONFIG.MODEL_ID;
}

function getGeminiRouterModelId(): string {
  return process.env.GEMINI_ROUTER_MODEL_ID?.trim() || DEFAULT_GEMINI_ROUTER_MODEL_ID;
}

function getGeminiRouterExtractorModelId(): string {
  return (
    process.env.GEMINI_ROUTER_EXTRACTOR_MODEL_ID?.trim() || DEFAULT_GEMINI_ROUTER_EXTRACTOR_MODEL_ID
  );
}

function getGeminiApiKeyDiagnostics() {
  const source = process.env.GEMINI_API_KEY
    ? 'GEMINI_API_KEY'
    : process.env.API_KEY
      ? 'API_KEY'
      : 'missing';
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

  return {
    fingerprint: apiKey ? createHash('sha256').update(apiKey).digest('hex').slice(0, 12) : null,
    present: Boolean(apiKey),
    source,
  };
}

function readGeminiExtractionSdk(): ExtractionSdk {
  const value = String(process.env.GEMINI_EXTRACTION_SDK || DEFAULT_GEMINI_EXTRACTION_SDK)
    .trim()
    .toLowerCase();

  if (value === 'legacy-cache') {
    return 'legacy-cache';
  }

  if (value === 'genai-router-files') {
    return 'genai-router-files';
  }

  return value === 'genai' ? 'genai' : 'legacy';
}

function readGeminiExtractionPromptProfile(): ExtractionPromptProfile {
  const value = String(process.env.GEMINI_EXTRACTION_PROMPT_PROFILE || 'full')
    .trim()
    .toLowerCase();

  return value === 'compact' ? 'compact' : 'full';
}

function isGeminiExtractionFallbackToLegacyEnabled(): boolean {
  const rawValue = process.env.GEMINI_EXTRACTION_FALLBACK_TO_LEGACY_ON_TRANSIENT_ERROR;
  if (rawValue === undefined || rawValue.trim() === '') {
    return false;
  }

  return !['0', 'false', 'no', 'off'].includes(rawValue.trim().toLowerCase());
}

function readGeminiCachedGenerateTimeoutMs(): number {
  const rawValue = Number(process.env.GEMINI_CACHED_GENERATE_TIMEOUT_MS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return DEFAULT_GEMINI_CACHED_GENERATE_TIMEOUT_MS;
  }

  return Math.floor(rawValue);
}

function readGeminiGenerateTimeoutMs(): number {
  const rawValue = Number(process.env.GEMINI_GENERATE_TIMEOUT_MS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return DEFAULT_GEMINI_GENERATE_TIMEOUT_MS;
  }

  return Math.floor(rawValue);
}

function readPositiveTimeoutMs(value: string | undefined, fallback: number): number {
  const rawValue = Number(value);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return fallback;
  }

  return Math.floor(rawValue);
}

function readGeminiRouterClassifierTimeoutMs(): number {
  return readPositiveTimeoutMs(
    process.env.GEMINI_ROUTER_CLASSIFIER_TIMEOUT_MS,
    DEFAULT_GEMINI_ROUTER_CLASSIFIER_TIMEOUT_MS,
  );
}

function readGeminiRouterExtractorTimeoutMs(): number {
  return readPositiveTimeoutMs(
    process.env.GEMINI_ROUTER_EXTRACTOR_TIMEOUT_MS,
    DEFAULT_GEMINI_ROUTER_EXTRACTOR_TIMEOUT_MS,
  );
}

function readGeminiRouterClassifierMaxOutputTokens(): number {
  const rawValue = Number(process.env.GEMINI_ROUTER_CLASSIFIER_MAX_OUTPUT_TOKENS);
  if (!Number.isInteger(rawValue) || rawValue <= 0) {
    return DEFAULT_GEMINI_ROUTER_CLASSIFIER_MAX_OUTPUT_TOKENS;
  }

  return Math.min(Math.floor(rawValue), 4096);
}

function readGeminiRouterClassifierConfidenceThreshold(): number {
  const rawValue = Number(process.env.GEMINI_ROUTER_CLASSIFIER_CONFIDENCE_THRESHOLD);
  if (!Number.isFinite(rawValue)) {
    return DEFAULT_GEMINI_ROUTER_CLASSIFIER_CONFIDENCE_THRESHOLD;
  }

  return Math.min(Math.max(rawValue, 0), 1);
}

function readGeminiRouterClassifierThinkingLevel(): Exclude<GeminiThinkingLevel, 'off'> {
  const value = String(
    process.env.GEMINI_ROUTER_CLASSIFIER_THINKING_LEVEL ||
      DEFAULT_GEMINI_ROUTER_CLASSIFIER_THINKING_LEVEL,
  )
    .trim()
    .toLowerCase();

  return value === 'minimal' || value === 'medium' || value === 'high' ? value : 'low';
}

function readGeminiRouterClassifierMediaResolution(): MediaResolution {
  const value = String(
    process.env.GEMINI_ROUTER_CLASSIFIER_MEDIA_RESOLUTION ||
      DEFAULT_GEMINI_ROUTER_CLASSIFIER_MEDIA_RESOLUTION,
  )
    .trim()
    .toLowerCase();

  if (value === 'high') {
    return MediaResolution.MEDIA_RESOLUTION_HIGH;
  }

  if (value === 'low') {
    return MediaResolution.MEDIA_RESOLUTION_LOW;
  }

  return MediaResolution.MEDIA_RESOLUTION_MEDIUM;
}

function readGeminiMaxOutputTokens(): number {
  const rawValue = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS);
  if (!Number.isInteger(rawValue) || rawValue <= 0) {
    return DEFAULT_GEMINI_MAX_OUTPUT_TOKENS;
  }

  return Math.min(Math.floor(rawValue), 8192);
}

function readGeminiThinkingLevel(): GeminiThinkingLevel {
  const value = String(process.env.GEMINI_THINKING_LEVEL || DEFAULT_GEMINI_THINKING_LEVEL)
    .trim()
    .toLowerCase();

  if (value === 'off' || value === 'none' || value === 'false' || value === '0') {
    return 'off';
  }

  return value === 'low' || value === 'medium' || value === 'high' ? value : 'minimal';
}

function toGenaiThinkingLevel(level: Exclude<GeminiThinkingLevel, 'off'>): ThinkingLevel {
  switch (level) {
    case 'high':
      return ThinkingLevel.HIGH;
    case 'medium':
      return ThinkingLevel.MEDIUM;
    case 'low':
      return ThinkingLevel.LOW;
    case 'minimal':
    default:
      return ThinkingLevel.MINIMAL;
  }
}

function readGenaiTransientRetryAttempts(): number {
  const rawValue = Number(process.env.GEMINI_GENAI_TRANSIENT_RETRY_ATTEMPTS);
  if (!Number.isInteger(rawValue) || rawValue <= 0) {
    return DEFAULT_GENAI_TRANSIENT_RETRY_ATTEMPTS;
  }

  return Math.min(Math.floor(rawValue), 5);
}

function readGenaiTransientRetryBaseDelayMs(): number {
  const rawValue = Number(process.env.GEMINI_GENAI_TRANSIENT_RETRY_BASE_DELAY_MS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return DEFAULT_GENAI_TRANSIENT_RETRY_BASE_DELAY_MS;
  }

  return Math.floor(rawValue);
}

function readLegacyTransientRetryAttempts(): number {
  const rawValue = Number(process.env.GEMINI_LEGACY_TRANSIENT_RETRY_ATTEMPTS);
  if (!Number.isInteger(rawValue) || rawValue <= 0) {
    return DEFAULT_LEGACY_TRANSIENT_RETRY_ATTEMPTS;
  }

  return Math.min(Math.floor(rawValue), 5);
}

function readLegacyTransientRetryBaseDelayMs(): number {
  const rawValue = Number(process.env.GEMINI_LEGACY_TRANSIENT_RETRY_BASE_DELAY_MS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return DEFAULT_LEGACY_TRANSIENT_RETRY_BASE_DELAY_MS;
  }

  return Math.floor(rawValue);
}

export function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error(ERROR_MESSAGES.API_KEY_MISSING);
  }

  return apiKey;
}

export function isDocumentExtractionConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.API_KEY);
}

function getGenAI(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!genAIInstance || genAIApiKey !== apiKey) {
    genAIInstance = new GoogleGenAI({ apiKey });
    genAIApiKey = apiKey;
  }

  return genAIInstance;
}

function getLegacyGenAI(): GoogleGenerativeAI {
  const apiKey = getGeminiApiKey();
  if (!legacyGenAIInstance || legacyGenAIApiKey !== apiKey) {
    legacyGenAIInstance = new GoogleGenerativeAI(apiKey);
    legacyGenAIApiKey = apiKey;
  }

  return legacyGenAIInstance;
}

function getLegacyCacheManager(): GoogleAICacheManager {
  const apiKey = getGeminiApiKey();
  if (!legacyCacheManagerInstance || legacyCacheManagerApiKey !== apiKey) {
    legacyCacheManagerInstance = new GoogleAICacheManager(apiKey, {
      apiVersion: 'v1beta',
      timeout: getGeminiPromptCacheConfig().createTimeoutMs,
    });
    legacyCacheManagerApiKey = apiKey;
  }

  return legacyCacheManagerInstance;
}

function getLegacyPromptCacheLookup(input: {
  agentType: AgentType;
  model: string;
  prompt: string;
}) {
  const promptHash = getGeminiPromptHash(input.prompt);
  return {
    cacheKey: `${LEGACY_PROMPT_CACHE_KEY_PREFIX}:${input.model}:${input.agentType}:${promptHash}`,
    promptHash,
  };
}

function getLegacyCacheName(cache: LegacyCachedContent): string | undefined {
  return typeof cache.name === 'string' && cache.name.trim() ? cache.name : undefined;
}

function getLegacyCacheTokenCount(cache: LegacyCachedContent): number | undefined {
  const usageMetadata = (cache as { usageMetadata?: { totalTokenCount?: unknown } }).usageMetadata;
  const tokenCount = Number(usageMetadata?.totalTokenCount);
  return Number.isFinite(tokenCount) ? tokenCount : undefined;
}

function normalizeLegacyCachedContent(
  cache: LegacyCachedContent,
  fallbackModel: string,
): LegacyCachedContent {
  return {
    ...cache,
    model: cache.model || (fallbackModel.includes('/') ? fallbackModel : `models/${fallbackModel}`),
  };
}

function buildLegacyPromptCacheContents(prompt: string): LegacyContent[] {
  return [{ role: 'user', parts: [{ text: prompt }] }];
}

function buildLegacyCachedInvoiceParts(
  input: ExtractInvoiceFromBufferInput,
): Array<string | LegacyPart> {
  return [
    { text: EXTRACTION_REQUEST_TEXT },
    {
      inlineData: {
        mimeType: input.mimeType || DEFAULT_DOCUMENT_MIME_TYPE,
        data: input.buffer.toString('base64'),
      },
    },
  ];
}

function legacyPromptCacheHandleFromEntry(input: {
  cacheKey: string;
  entry: LegacyPromptCacheEntry;
  promptHash: string;
  reusedExisting: boolean;
  waitedForCreate: boolean;
}): LegacyPromptCacheHandle | null {
  if (!input.entry.cache) {
    return null;
  }

  const cacheName = getLegacyCacheName(input.entry.cache);
  if (!cacheName) {
    return null;
  }

  return {
    cache: input.entry.cache,
    cacheKey: input.cacheKey,
    cacheName,
    cacheTokenCount: input.entry.cacheTokenCount,
    promptHash: input.promptHash,
    reusedExisting: input.reusedExisting,
    waitedForCreate: input.waitedForCreate,
  };
}

function getReadyLegacyPromptCache(input: {
  agentType: AgentType;
  model: string;
  prompt: string;
}): LegacyPromptCacheHandle | null {
  if (!isGeminiPromptCacheEnabled()) {
    return null;
  }

  const { cacheKey, promptHash } = getLegacyPromptCacheLookup(input);
  const existingEntry = legacyPromptCacheEntries.get(cacheKey);
  if (
    !existingEntry?.cache ||
    existingEntry.expiresAtMs <= Date.now() + LEGACY_CACHE_EXPIRY_SAFETY_WINDOW_MS
  ) {
    return null;
  }

  return legacyPromptCacheHandleFromEntry({
    cacheKey,
    entry: existingEntry,
    promptHash,
    reusedExisting: true,
    waitedForCreate: false,
  });
}

async function createLegacyPromptCache(input: {
  agentType: AgentType;
  model: string;
  prompt: string;
}): Promise<LegacyPromptCacheCreated> {
  const startedAtMs = Date.now();
  const ttlSeconds = getGeminiPromptCacheConfig().ttlSeconds;
  const cache = normalizeLegacyCachedContent(
    await getLegacyCacheManager().create({
      contents: buildLegacyPromptCacheContents(input.prompt),
      displayName: `smart-invoice-legacy-${input.agentType}-${getGeminiPromptHash(
        input.prompt,
      ).slice(0, 12)}`,
      model: input.model,
      ttlSeconds,
    }),
    input.model,
  );

  if (!getLegacyCacheName(cache)) {
    throw new Error('Gemini legacy cache did not return a cached content name.');
  }

  return {
    cache,
    cacheTokenCount: getLegacyCacheTokenCount(cache),
    createDurationMs: Date.now() - startedAtMs,
    expiresAtMs: Date.now() + ttlSeconds * 1000,
  };
}

async function getLegacyPromptCache(input: {
  agentType: AgentType;
  model: string;
  prompt: string;
}): Promise<LegacyPromptCacheHandle | null> {
  if (!isGeminiPromptCacheEnabled()) {
    return null;
  }

  const { cacheKey, promptHash } = getLegacyPromptCacheLookup(input);
  const now = Date.now();
  const existingEntry = legacyPromptCacheEntries.get(cacheKey);

  if (
    existingEntry?.cache &&
    existingEntry.expiresAtMs > now + LEGACY_CACHE_EXPIRY_SAFETY_WINDOW_MS
  ) {
    return legacyPromptCacheHandleFromEntry({
      cacheKey,
      entry: existingEntry,
      promptHash,
      reusedExisting: true,
      waitedForCreate: false,
    });
  }

  if (existingEntry?.createPromise) {
    const created = await existingEntry.createPromise;
    return legacyPromptCacheHandleFromEntry({
      cacheKey,
      entry: {
        cache: created.cache,
        cacheTokenCount: created.cacheTokenCount,
        expiresAtMs: created.expiresAtMs,
      },
      promptHash,
      reusedExisting: true,
      waitedForCreate: true,
    });
  }

  if (existingEntry?.failedUntilMs && existingEntry.failedUntilMs > now) {
    throw new Error(
      'Gemini legacy prompt cache creation is cooling down after a previous failure.',
    );
  }

  const createPromise = createLegacyPromptCache(input);
  legacyPromptCacheEntries.set(cacheKey, {
    ...(existingEntry || {}),
    createPromise,
    expiresAtMs: 0,
    updatedAtMs: now,
    warmStartedAtMs: now,
  });

  try {
    const created = await createPromise;
    const entry: LegacyPromptCacheEntry = {
      cache: created.cache,
      cacheTokenCount: created.cacheTokenCount,
      createDurationMs: created.createDurationMs,
      createdAtMs: Date.now(),
      expiresAtMs: created.expiresAtMs,
      updatedAtMs: Date.now(),
    };
    legacyPromptCacheEntries.set(cacheKey, entry);

    return legacyPromptCacheHandleFromEntry({
      cacheKey,
      entry,
      promptHash,
      reusedExisting: false,
      waitedForCreate: false,
    });
  } catch (error) {
    legacyPromptCacheEntries.set(cacheKey, {
      expiresAtMs: 0,
      failedUntilMs: Date.now() + getGeminiPromptCacheConfig().failureCooldownSeconds * 1000,
      lastError: getErrorMessage(error),
      updatedAtMs: Date.now(),
    });
    throw error;
  }
}

export function getLegacyPromptCacheDiagnostics(): PromptCacheDiagnostic[] {
  const now = Date.now();

  return Array.from(legacyPromptCacheEntries.entries()).map(([cacheKey, entry]) => {
    const [, model = '', agentType = '', promptHash = ''] = cacheKey.split(':');
    const state: PromptCacheDiagnostic['state'] = entry.createPromise
      ? 'warming'
      : entry.failedUntilMs && entry.failedUntilMs > now
        ? 'cooldown'
        : entry.cache && entry.expiresAtMs > now + LEGACY_CACHE_EXPIRY_SAFETY_WINDOW_MS
          ? 'ready'
          : 'expired';

    return {
      cacheKey,
      agentType,
      cacheName: getLegacyCacheName(entry.cache || ({} as LegacyCachedContent)),
      cacheTokenCount: entry.cacheTokenCount,
      createDurationMs: entry.createDurationMs,
      createdAt: entry.createdAtMs ? new Date(entry.createdAtMs).toISOString() : undefined,
      expiresAt: entry.expiresAtMs ? new Date(entry.expiresAtMs).toISOString() : undefined,
      failedUntil: entry.failedUntilMs ? new Date(entry.failedUntilMs).toISOString() : undefined,
      lastError: entry.lastError,
      model,
      promptHash,
      state,
      updatedAt: entry.updatedAtMs ? new Date(entry.updatedAtMs).toISOString() : undefined,
      warmStartedAt: entry.warmStartedAtMs
        ? new Date(entry.warmStartedAtMs).toISOString()
        : undefined,
    };
  });
}

export function normalizeAgentType(value: string | undefined): AgentType {
  const normalized = String(value || 'AGENT_GENERIC_A')
    .trim()
    .toUpperCase() as AgentType;
  return ALLOWED_AGENT_TYPES.has(normalized) ? normalized : 'AGENT_GENERIC_A';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string';
}

function hasNumber(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'number' && Number.isFinite(value[key]);
}

function isInvoiceLineItem(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasString(value, 'boxType') &&
    hasNumber(value, 'totalPieces') &&
    hasNumber(value, 'eqFull') &&
    hasString(value, 'productDescription') &&
    hasNumber(value, 'totalValue')
  );
}

function isInvoiceData(value: unknown): value is InvoiceData {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasString(value, 'invoiceNumber') &&
    hasString(value, 'date') &&
    hasString(value, 'shipperName') &&
    hasNumber(value, 'totalValue') &&
    hasNumber(value, 'confidenceScore') &&
    Array.isArray(value.lineItems) &&
    value.lineItems.every(isInvoiceLineItem)
  );
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function toMoneyCents(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

function roundNumber(value: number, decimals = 4): number {
  return Number(value.toFixed(decimals));
}

function toConfidenceReasonCode(value: unknown): ConfidenceReasonCode | null {
  if (typeof value !== 'string') {
    return null;
  }

  const code = value as ConfidenceReasonCode;
  return VALID_REASON_CODES.has(code) ? code : null;
}

function getNumberField(value: Record<string, unknown>, key: string): number | undefined {
  return typeof value[key] === 'number' && Number.isFinite(value[key])
    ? Number(value[key])
    : undefined;
}

function getModelConfidenceReasons(invoice: InvoiceData): ConfidenceReason[] {
  const rawReasons = (invoice as { confidenceReasons?: unknown }).confidenceReasons;
  if (!Array.isArray(rawReasons)) {
    return [];
  }

  const seenCodes = new Set<ConfidenceReasonCode>();

  return rawReasons.flatMap((reason): ConfidenceReason[] => {
    if (!isRecord(reason)) {
      return [];
    }

    const code = toConfidenceReasonCode(reason.code);
    if (
      !code ||
      MATH_REASON_CODES.has(code) ||
      seenCodes.has(code) ||
      !(code in VISUAL_REASON_DEFAULTS)
    ) {
      return [];
    }

    seenCodes.add(code);
    const defaults = VISUAL_REASON_DEFAULTS[code as keyof typeof VISUAL_REASON_DEFAULTS];

    return [
      {
        code,
        penalty: defaults.penalty,
        message: defaults.message,
      },
    ];
  });
}

function getBackendConfidenceReasons(invoice: InvoiceData): ConfidenceReason[] {
  const calculatedPieces = invoice.lineItems.reduce(
    (sum, item) => sum + (Number(item.totalPieces) || 0),
    0,
  );
  const calculatedEq = invoice.lineItems.reduce((sum, item) => sum + (Number(item.eqFull) || 0), 0);
  const calculatedLineValue = invoice.lineItems.reduce(
    (sum, item) => sum + (Number(item.totalValue) || 0),
    0,
  );

  const reasons: ConfidenceReason[] = [];

  if (invoice.totalPieces > 0 && calculatedPieces !== invoice.totalPieces) {
    reasons.push({
      code: 'PIECES_TOTAL_MISMATCH',
      penalty: 50,
      message: 'Footer total pieces differs from line-item total pieces.',
      footerTotal: invoice.totalPieces,
      calculatedTotal: calculatedPieces,
      tolerance: 0,
    });
  }

  if (invoice.totalEq > 0 && Math.abs(calculatedEq - invoice.totalEq) > EQ_TOLERANCE) {
    reasons.push({
      code: 'EQ_TOTAL_MISMATCH',
      penalty: 40,
      message: 'Footer EQ/full differs from line-item EQ/full.',
      footerTotal: invoice.totalEq,
      calculatedTotal: roundNumber(calculatedEq),
      tolerance: EQ_TOLERANCE,
    });
  }

  const invoiceValueCents = toMoneyCents(invoice.totalValue);
  const calculatedValueCents = toMoneyCents(calculatedLineValue);
  if (Math.abs(invoiceValueCents - calculatedValueCents) > VALUE_TOLERANCE_CENTS) {
    reasons.push({
      code: 'VALUE_TOTAL_MISMATCH',
      penalty: 50,
      message: 'Invoice total value differs from sum of line-item total values.',
      invoiceTotal: invoice.totalValue,
      calculatedLineTotal: calculatedValueCents / 100,
      tolerance: VALUE_TOLERANCE_CENTS / 100,
    });
  }

  return reasons;
}

function scoreFromReasons(reasons: ConfidenceReason[]): number {
  return clampScore(100 - reasons.reduce((sum, reason) => sum + reason.penalty, 0));
}

const MIXED_PRODUCT_DESCRIPTION = 'MIXTAS';
const STEM_SUFFIX_PATTERN = /\s*:\s*-?\d+(?:[.,]\d+)?\s*$/;
const PRODUCT_FAMILY_PATTERNS: Array<{ family: string; pattern: RegExp }> = [
  { family: 'ROSES', pattern: /\b(ROSA|ROSAS|ROSE|ROSES)\b/ },
  { family: 'RUSCUS', pattern: /\bRUSCUS\b/ },
  { family: 'GYPSO', pattern: /\b(GYPSO|GYPSOPHILA|GIPSO)\b/ },
  { family: 'LISIANTHUS', pattern: /\b(LISIANTHUS|EUSTOMA)\b/ },
  { family: 'ALSTROEMERIA', pattern: /\bALSTROEMERIA\b/ },
  { family: 'ASTER', pattern: /\bASTER\b/ },
  { family: 'TRACHELLIUM', pattern: /\bTRACHELLIUM\b/ },
  { family: 'LILIES', pattern: /\b(LILY|LILIES|LIRIO|LIRIOS)\b/ },
  { family: 'SUNFLOWER', pattern: /\b(SUNFLOWER|GIRASOL|GIRASOLES)\b/ },
  { family: 'STOCK', pattern: /\b(STOCK|MATTHIOLA)\b/ },
  { family: 'HYDRANGEA', pattern: /\b(HYDRANGEA|HORTENSIA|HORTENSIAS)\b/ },
  { family: 'CARNATION', pattern: /\b(CARNATION|CARNATIONS|CLAVEL|CLAVELES)\b/ },
  { family: 'DIANTHUS', pattern: /\bDIANTHUS\b/ },
  { family: 'PROTEA', pattern: /\bPROTEA\b/ },
  { family: 'LEUCADENDRON', pattern: /\bLEUCADENDRON\b/ },
  { family: 'EUCALYPTUS', pattern: /\bEUCALYPTUS\b/ },
  { family: 'SOLIDAGO', pattern: /\bSOLIDAGO\b/ },
  { family: 'LIMONIUM', pattern: /\bLIMONIUM\b/ },
  { family: 'HYPERICUM', pattern: /\bHYPERICUM\b/ },
  { family: 'DELPHINIUM', pattern: /\bDELPHINIUM\b/ },
  { family: 'SNAPDRAGON', pattern: /\b(SNAPDRAGON|ANTIRRHINUM)\b/ },
  { family: 'GERBERA', pattern: /\bGERBERA\b/ },
  { family: 'CHRYSANTHEMUM', pattern: /\b(CHRYSANTHEMUM|MUMS?|POMPON)\b/ },
  { family: 'ORCHID', pattern: /\b(ORCHID|ORQUIDEA|ORQUIDEAS)\b/ },
  { family: 'TULIP', pattern: /\b(TULIP|TULIPS|TULIPAN|TULIPANES)\b/ },
  { family: 'PEONY', pattern: /\b(PEONY|PEONIA|PEONIAS)\b/ },
  { family: 'RANUNCULUS', pattern: /\bRANUNCULUS\b/ },
  { family: 'ANEMONE', pattern: /\bANEMONE\b/ },
  { family: 'AMMI', pattern: /\bAMMI\b/ },
  { family: 'ERYNGIUM', pattern: /\bERYNGIUM\b/ },
];

function parseStemSuffix(value: string): { name: string; stems?: number } {
  const match = value.match(/^(.*?)\s*:\s*(-?\d+(?:[.,]\d+)?)\s*$/);
  if (!match) {
    return { name: value.trim() };
  }

  const stems = Number(match[2].replace(',', '.'));
  return {
    name: match[1].trim(),
    stems: Number.isFinite(stems) ? stems : undefined,
  };
}

function formatStemCount(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return String(roundNumber(value));
}

function formatVarietyEntry(
  description: string | undefined,
  stems: number | undefined,
): string | undefined {
  const trimmed = description?.trim();
  if (!trimmed) {
    return undefined;
  }

  const stemCount = formatStemCount(stems);
  return stemCount ? `${trimmed}:${stemCount}` : trimmed;
}

function getVarietyIdentity(value: string): string {
  return value.replace(STEM_SUFFIX_PATTERN, '').trim().toUpperCase();
}

function normalizeProductFamilyText(value: string): string {
  return getVarietyIdentity(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getKnownProductFamily(value: string): string | null {
  const normalized = normalizeProductFamilyText(value);

  for (const entry of PRODUCT_FAMILY_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      return entry.family;
    }
  }

  return null;
}

function getKnownProductFamilyCount(varieties: string[]): number {
  const families = new Set<string>();

  for (const variety of varieties) {
    const family = getKnownProductFamily(variety);
    if (family) {
      families.add(family);
    }
  }

  return families.size;
}

function getDistinctMixedVarieties(values: Array<string | undefined>): string[] {
  const entriesByIdentity = new Map<string, { name: string; stems?: number }>();
  const orderedIdentities: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }

    const parsed = parseStemSuffix(trimmed);
    const identity = getVarietyIdentity(parsed.name);
    if (!identity) {
      continue;
    }

    const existing = entriesByIdentity.get(identity);
    if (!existing) {
      orderedIdentities.push(identity);
      entriesByIdentity.set(identity, parsed);
      continue;
    }

    if (parsed.stems !== undefined) {
      existing.stems = roundNumber((existing.stems || 0) + parsed.stems);
    }
  }

  return orderedIdentities.flatMap((identity) => {
    const entry = entriesByIdentity.get(identity);
    if (!entry) {
      return [];
    }

    const stemCount = formatStemCount(entry.stems);
    return [stemCount ? `${entry.name}:${stemCount}` : entry.name];
  });
}

function hasVarietyIdentity(
  values: string[] | undefined,
  identityValue: string | undefined,
): boolean {
  const identity = getVarietyIdentity(identityValue || '');
  if (!identity) {
    return false;
  }

  return (values || []).some((value) => getVarietyIdentity(value) === identity);
}

function isPositiveZeroPieceChildRow(item: InvoiceData['lineItems'][number]): boolean {
  return (
    Number(item.totalPieces) <= 0 &&
    ((Number(item.totalStems) || 0) > 0 || (Number(item.totalValue) || 0) > 0)
  );
}

function normalizeTaxCode(value: string | undefined): string {
  return (value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function hasDifferentTaxCode(
  parent: InvoiceData['lineItems'][number],
  child: InvoiceData['lineItems'][number],
): boolean {
  const parentHts = normalizeTaxCode(parent.hts);
  const childHts = normalizeTaxCode(child.hts);
  const parentNandina = normalizeTaxCode(parent.nandina);
  const childNandina = normalizeTaxCode(child.nandina);

  return (
    (parentHts.length > 0 && childHts.length > 0 && parentHts !== childHts) ||
    (parentNandina.length > 0 && childNandina.length > 0 && parentNandina !== childNandina)
  );
}

function mergeChildRowIntoParent(
  parent: InvoiceData['lineItems'][number],
  child: InvoiceData['lineItems'][number],
): InvoiceData['lineItems'][number] {
  const totalStems = roundNumber(
    (Number(parent.totalStems) || 0) + (Number(child.totalStems) || 0),
  );
  const totalValue = roundNumber(
    (Number(parent.totalValue) || 0) + (Number(child.totalValue) || 0),
  );
  const parentVarietyEntries =
    parent.productDescription === MIXED_PRODUCT_DESCRIPTION
      ? parent.varieties || []
      : hasVarietyIdentity(parent.varieties, parent.productDescription)
        ? parent.varieties || []
        : [
            formatVarietyEntry(parent.productDescription, Number(parent.totalStems) || undefined),
            ...(parent.varieties || []),
          ];
  const childVarietyEntries = [
    formatVarietyEntry(child.productDescription, Number(child.totalStems) || undefined),
    ...(child.varieties || []),
  ];
  const mixedVarieties = getDistinctMixedVarieties([
    ...parentVarietyEntries,
    ...childVarietyEntries,
  ]);
  const knownProductFamilyCount = getKnownProductFamilyCount(mixedVarieties);
  const isMixedComposition =
    parent.productDescription === MIXED_PRODUCT_DESCRIPTION ||
    knownProductFamilyCount > 1 ||
    (knownProductFamilyCount === 0 && hasDifferentTaxCode(parent, child));

  return {
    ...parent,
    hts: parent.hts || child.hts,
    nandina: parent.nandina || child.nandina,
    productDescription: isMixedComposition ? MIXED_PRODUCT_DESCRIPTION : parent.productDescription,
    totalStems,
    totalValue,
    unitPrice: totalStems > 0 ? roundNumber(totalValue / totalStems, 6) : parent.unitPrice,
    varieties: mixedVarieties,
  };
}

function normalizePositiveZeroPieceChildRows(invoice: InvoiceData): InvoiceData {
  const lineItems: InvoiceData['lineItems'] = [];
  let changed = false;

  for (const item of invoice.lineItems) {
    if (isPositiveZeroPieceChildRow(item) && lineItems.length > 0) {
      const parentIndex = lineItems.length - 1;
      lineItems[parentIndex] = mergeChildRowIntoParent(lineItems[parentIndex], item);
      changed = true;
      continue;
    }

    lineItems.push(item);
  }

  return changed ? { ...invoice, lineItems } : invoice;
}

function applyBackendConfidenceValidation(invoice: InvoiceData): InvoiceData {
  const normalizedInvoice = normalizePositiveZeroPieceChildRows(invoice);
  const modelScore = clampScore(normalizedInvoice.confidenceScore);
  const modelReasons = getModelConfidenceReasons(normalizedInvoice);
  const backendReasons = getBackendConfidenceReasons(normalizedInvoice);
  const backendReasonCodes = new Set(backendReasons.map((reason) => reason.code));
  const rejectedMathReasons = modelReasons.filter(
    (reason) => MATH_REASON_CODES.has(reason.code) && !backendReasonCodes.has(reason.code),
  );
  const acceptedModelReasons = modelReasons.filter(
    (reason) => !MATH_REASON_CODES.has(reason.code) || backendReasonCodes.has(reason.code),
  );
  const overriddenReasonCodes = Array.from(
    new Set(rejectedMathReasons.map((reason) => reason.code)),
  );
  const acceptedReasonCodes = new Set<ConfidenceReasonCode>();
  const finalReasons: ConfidenceReason[] = [];

  for (const reason of acceptedModelReasons) {
    if (!MATH_REASON_CODES.has(reason.code)) {
      finalReasons.push(reason);
      acceptedReasonCodes.add(reason.code);
    }
  }

  for (const reason of backendReasons) {
    finalReasons.push(reason);
    acceptedReasonCodes.add(reason.code);
  }

  const backendScore = scoreFromReasons(backendReasons);
  const rejectedMathPenalty = rejectedMathReasons.reduce((sum, reason) => sum + reason.penalty, 0);
  const adjustedModelScore = clampScore(modelScore + rejectedMathPenalty);
  const finalScore =
    modelReasons.length > 0
      ? Math.min(adjustedModelScore, scoreFromReasons(finalReasons))
      : Math.min(modelScore, backendScore);

  return {
    ...normalizedInvoice,
    confidenceScore: finalScore,
    confidenceReasons: finalReasons,
    confidenceAudit: {
      modelScore,
      backendScore,
      finalScore,
      acceptedReasonCodes: Array.from(acceptedReasonCodes),
      overriddenReasonCodes,
      backendReasonCodes: Array.from(backendReasonCodes),
    },
  };
}

function getExtractionConfig(cachedContent?: string): GenerateContentConfig {
  const thinkingLevel = readGeminiThinkingLevel();

  return {
    maxOutputTokens: readGeminiMaxOutputTokens(),
    responseMimeType: 'application/json',
    responseSchema: invoiceExtractionSchema,
    ...(thinkingLevel === 'off'
      ? {}
      : { thinkingConfig: { thinkingLevel: toGenaiThinkingLevel(thinkingLevel) } }),
    ...(cachedContent ? { cachedContent } : {}),
  };
}

function getLegacyGenerationConfig(): {
  maxOutputTokens: number;
  responseMimeType: string;
  responseSchema: LegacySchema;
  thinkingConfig?: { thinkingLevel: ThinkingLevel };
} {
  const thinkingLevel = readGeminiThinkingLevel();

  return {
    maxOutputTokens: readGeminiMaxOutputTokens(),
    responseMimeType: 'application/json',
    responseSchema: toLegacySchema(invoiceExtractionSchema),
    ...(thinkingLevel === 'off'
      ? {}
      : { thinkingConfig: { thinkingLevel: toGenaiThinkingLevel(thinkingLevel) } }),
  };
}

function buildInlineDocumentPart(
  input: ExtractInvoiceFromBufferInput,
): NonNullable<Content['parts']>[number] {
  return {
    inlineData: {
      mimeType: input.mimeType || DEFAULT_DOCUMENT_MIME_TYPE,
      data: input.buffer.toString('base64'),
    },
  };
}

function buildCachedInvoiceContents(input: ExtractInvoiceFromBufferInput): Content[] {
  return [
    { role: 'user', parts: [{ text: EXTRACTION_REQUEST_TEXT }, buildInlineDocumentPart(input)] },
  ];
}

function buildUncachedInvoiceContents(
  input: ExtractInvoiceFromBufferInput,
  prompt: string,
): Content[] {
  return [{ role: 'user', parts: [{ text: prompt }, buildInlineDocumentPart(input)] }];
}

function buildLegacyInvoiceParts(
  input: ExtractInvoiceFromBufferInput,
  prompt: string,
): Array<string | LegacyPart> {
  return [
    {
      inlineData: {
        mimeType: input.mimeType || DEFAULT_DOCUMENT_MIME_TYPE,
        data: input.buffer.toString('base64'),
      },
    },
    { text: prompt },
  ];
}

function toLegacySchema(value: unknown): LegacySchema {
  if (Array.isArray(value)) {
    return value.map((item) => toLegacySchema(item)) as unknown as LegacySchema;
  }

  if (!isRecord(value)) {
    return value as LegacySchema;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => {
      if (key === 'type' && typeof nestedValue === 'string') {
        return [key, nestedValue.toLowerCase()];
      }

      if (key === 'properties' && isRecord(nestedValue)) {
        return [
          key,
          Object.fromEntries(
            Object.entries(nestedValue).map(([propertyKey, propertyValue]) => [
              propertyKey,
              toLegacySchema(propertyValue),
            ]),
          ),
        ];
      }

      if (key === 'items') {
        return [key, toLegacySchema(nestedValue)];
      }

      if ((key === 'maxItems' || key === 'minItems') && typeof nestedValue === 'string') {
        const numericValue = Number(nestedValue);
        return [key, Number.isFinite(numericValue) ? numericValue : nestedValue];
      }

      return [key, nestedValue];
    }),
  ) as unknown as LegacySchema;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isGeminiTimeoutError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('timed out') || message.includes('timeout');
}

function getGenaiRetryDelayMs(retryIndex: number): number {
  const baseDelayMs = readGenaiTransientRetryBaseDelayMs();
  const jitterMs = Math.floor(Math.random() * 3_000);
  return Math.min(120_000, baseDelayMs * 2 ** Math.max(0, retryIndex)) + jitterMs;
}

function getLegacyRetryDelayMs(retryIndex: number): number {
  const baseDelayMs = readLegacyTransientRetryBaseDelayMs();
  const jitterMs = Math.floor(Math.random() * 3_000);
  return Math.min(120_000, baseDelayMs * 2 ** Math.max(0, retryIndex)) + jitterMs;
}

async function generateContentWithConfigAttempt(input: {
  ai: GoogleGenAI;
  config: GenerateContentConfig;
  contents: Content[];
  model: string;
  timeoutMs: number;
}): Promise<GenerateContentResponse> {
  const abortController = new AbortController();
  let timeoutId: NodeJS.Timeout | null = null;

  const generationPromise = input.ai.models.generateContent({
    model: input.model,
    contents: input.contents,
    config: {
      ...input.config,
      abortSignal: abortController.signal,
      httpOptions: {
        ...input.config.httpOptions,
        retryOptions: { attempts: 1 },
        timeout: input.timeoutMs,
      },
    },
  });

  try {
    const response = await Promise.race([
      generationPromise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          abortController.abort();
          reject(new Error(`Gemini extraction timed out after ${input.timeoutMs}ms.`));
        }, input.timeoutMs);
      }),
    ]);

    return response;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    generationPromise.catch(() => undefined);
  }
}

async function generateContentWithConfig(input: {
  ai: GoogleGenAI;
  config: GenerateContentConfig;
  contents: Content[];
  model: string;
  timeoutMs?: number;
}): Promise<{ durationMs: number; response: GenerateContentResponse }> {
  const startedAtMs = Date.now();
  const timeoutMs = input.timeoutMs ?? readGeminiGenerateTimeoutMs();
  const maxAttempts = readGenaiTransientRetryAttempts();
  let attempt = 0;

  while (true) {
    try {
      const response = await generateContentWithConfigAttempt({
        ...input,
        timeoutMs,
      });

      return {
        durationMs: Date.now() - startedAtMs,
        response,
      };
    } catch (error) {
      const canRetry =
        attempt < maxAttempts - 1 && isTransientGeminiError(error) && !isGeminiTimeoutError(error);

      if (!canRetry) {
        throw error;
      }

      const delayMs = getGenaiRetryDelayMs(attempt);
      console.warn('Gemini genai transient error; retrying before fallback.', {
        attempt: attempt + 1,
        delayMs,
        error: getErrorMessage(error),
        maxAttempts,
        model: input.model,
      });
      attempt += 1;
      await delay(delayMs);
    }
  }
}

async function generateInvoiceContentAttempt(input: {
  ai: GoogleGenAI;
  cachedContent?: string;
  contents: Content[];
  model: string;
  timeoutMs: number;
}): Promise<GenerateContentResponse> {
  return generateContentWithConfigAttempt({
    ai: input.ai,
    config: getExtractionConfig(input.cachedContent),
    contents: input.contents,
    model: input.model,
    timeoutMs: input.timeoutMs,
  });
}

async function generateInvoiceContent(input: {
  ai: GoogleGenAI;
  cachedContent?: string;
  contents: Content[];
  model: string;
  timeoutMs?: number;
}): Promise<{ durationMs: number; response: GenerateContentResponse }> {
  return generateContentWithConfig({
    ai: input.ai,
    config: getExtractionConfig(input.cachedContent),
    contents: input.contents,
    model: input.model,
    timeoutMs: input.timeoutMs,
  });
}

async function generateInvoiceContentWithLegacySdk(input: {
  document: ExtractInvoiceFromBufferInput;
  model: string;
  prompt: string;
}): Promise<{ durationMs: number; result: LegacyGenerateContentResult }> {
  const startedAtMs = Date.now();
  const timeoutMs = readGeminiGenerateTimeoutMs();
  const legacyModel = getLegacyGenAI().getGenerativeModel(
    {
      model: input.model,
      generationConfig: getLegacyGenerationConfig(),
    },
    {
      apiVersion: 'v1beta',
      timeout: timeoutMs,
    },
  );

  const result = await legacyModel.generateContent(
    buildLegacyInvoiceParts(input.document, input.prompt),
    {
      timeout: timeoutMs,
    },
  );

  return {
    durationMs: Date.now() - startedAtMs,
    result,
  };
}

async function generateInvoiceContentWithLegacyCachedSdk(input: {
  cache: LegacyCachedContent;
  document: ExtractInvoiceFromBufferInput;
}): Promise<{ durationMs: number; result: LegacyGenerateContentResult }> {
  const startedAtMs = Date.now();
  const timeoutMs = readGeminiCachedGenerateTimeoutMs();
  const legacyModel = getLegacyGenAI().getGenerativeModelFromCachedContent(
    input.cache,
    {
      generationConfig: getLegacyGenerationConfig(),
    },
    {
      apiVersion: 'v1beta',
      timeout: timeoutMs,
    },
  );

  const result = await legacyModel.generateContent(buildLegacyCachedInvoiceParts(input.document), {
    timeout: timeoutMs,
  });

  return {
    durationMs: Date.now() - startedAtMs,
    result,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTransientGeminiError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
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

function pushGeminiExtractionEvent(event: GeminiExtractionDiagnostic): void {
  geminiExtractionEvents.push(event);
  if (geminiExtractionEvents.length > MAX_GEMINI_EXTRACTION_EVENTS) {
    geminiExtractionEvents.splice(0, geminiExtractionEvents.length - MAX_GEMINI_EXTRACTION_EVENTS);
  }

  persistGeminiExtractionEvent(event).catch((error) => {
    console.warn('Gemini extraction observability persistence failed.', {
      error: getErrorMessage(error),
      promptHash: event.promptHash,
      stage: event.stage,
    });
  });
}

function logGeminiUsage(input: {
  agentType: AgentType;
  cacheMode: string;
  cacheTokenCount?: number;
  durationMs: number;
  model: string;
  promptHash: string;
  response: GenerateContentResponse;
  routerCategory?: RouterInvoiceCategory;
  routerConfidence?: number;
  routerVisualSignals?: string[];
  sdk?: ExtractionSdk;
  stage?: string;
  telemetryContext?: GeminiExtractionTelemetryContext;
}): void {
  const usage = input.response.usageMetadata;
  const event: GeminiExtractionDiagnostic = {
    agentType: input.agentType,
    ...input.telemetryContext,
    cacheMode: input.cacheMode,
    cacheTokenCount: input.cacheTokenCount,
    cachedContentTokenCount: usage?.cachedContentTokenCount,
    candidatesTokenCount: usage?.candidatesTokenCount,
    durationMs: input.durationMs,
    model: input.model,
    promptHash: input.promptHash.slice(0, 12),
    promptTokenCount: usage?.promptTokenCount,
    routerCategory: input.routerCategory,
    routerConfidence: input.routerConfidence,
    routerVisualSignals: input.routerVisualSignals,
    sdk: input.sdk || 'genai',
    stage: input.stage,
    success: true,
    thoughtsTokenCount: usage?.thoughtsTokenCount,
    timestamp: new Date().toISOString(),
    totalTokenCount: usage?.totalTokenCount,
  };
  pushGeminiExtractionEvent(event);

  if (!usage) {
    return;
  }

  console.info('Gemini extraction usage', event);
}

function logGeminiFileEvent(input: {
  agentType: AgentType;
  cacheMode: string;
  durationMs: number;
  error?: unknown;
  fileDeleteDurationMs?: number;
  fileDeleteOk?: boolean;
  fileInputMode: 'files-api' | 'inline-fallback';
  fileUploadDurationMs?: number;
  model: string;
  promptHash: string;
  routerCategory?: RouterInvoiceCategory;
  routerConfidence?: number;
  routerVisualSignals?: string[];
  stage: string;
  success: boolean;
  telemetryContext?: GeminiExtractionTelemetryContext;
}): void {
  const event: GeminiExtractionDiagnostic = {
    agentType: input.agentType,
    ...input.telemetryContext,
    cacheMode: input.cacheMode,
    durationMs: input.durationMs,
    error: input.error ? getErrorMessage(input.error) : undefined,
    fileDeleteDurationMs: input.fileDeleteDurationMs,
    fileDeleteOk: input.fileDeleteOk,
    fileInputMode: input.fileInputMode,
    fileUploadDurationMs: input.fileUploadDurationMs,
    model: input.model,
    promptHash: input.promptHash.slice(0, 12),
    routerCategory: input.routerCategory,
    routerConfidence: input.routerConfidence,
    routerVisualSignals: input.routerVisualSignals,
    sdk: 'genai-router-files',
    stage: input.stage,
    success: input.success,
    timestamp: new Date().toISOString(),
  };
  pushGeminiExtractionEvent(event);

  if (input.success) {
    console.info('Gemini Files API event', event);
    return;
  }

  console.warn('Gemini Files API event failed', event);
}

function logLegacyGeminiUsage(input: {
  agentType: AgentType;
  cacheMode: string;
  cacheTokenCount?: number;
  durationMs: number;
  model: string;
  promptHash: string;
  sdk?: ExtractionSdk;
  usage?: LegacyUsageMetadata;
  telemetryContext?: GeminiExtractionTelemetryContext;
}): void {
  const event: GeminiExtractionDiagnostic = {
    agentType: input.agentType,
    ...input.telemetryContext,
    cacheMode: input.cacheMode,
    cacheTokenCount: input.cacheTokenCount,
    cachedContentTokenCount: input.usage?.cachedContentTokenCount,
    candidatesTokenCount: input.usage?.candidatesTokenCount,
    durationMs: input.durationMs,
    model: input.model,
    promptHash: input.promptHash.slice(0, 12),
    promptTokenCount: input.usage?.promptTokenCount,
    sdk: input.sdk || 'legacy',
    success: true,
    thoughtsTokenCount: getUsageNumber(input.usage, 'thoughtsTokenCount'),
    timestamp: new Date().toISOString(),
    totalTokenCount: input.usage?.totalTokenCount,
  };
  pushGeminiExtractionEvent(event);

  if (!input.usage) {
    return;
  }

  console.info('Gemini legacy extraction usage', event);
}

function logGeminiFailure(input: {
  agentType: AgentType;
  cacheMode: string;
  cacheTokenCount?: number;
  durationMs: number;
  error: unknown;
  model: string;
  promptHash: string;
  routerCategory?: RouterInvoiceCategory;
  routerConfidence?: number;
  routerVisualSignals?: string[];
  sdk?: ExtractionSdk;
  stage?: string;
  telemetryContext?: GeminiExtractionTelemetryContext;
}): void {
  const event: GeminiExtractionDiagnostic = {
    agentType: input.agentType,
    ...input.telemetryContext,
    cacheMode: input.cacheMode,
    cacheTokenCount: input.cacheTokenCount,
    durationMs: input.durationMs,
    error: getErrorMessage(input.error),
    model: input.model,
    promptHash: input.promptHash.slice(0, 12),
    routerCategory: input.routerCategory,
    routerConfidence: input.routerConfidence,
    routerVisualSignals: input.routerVisualSignals,
    sdk: input.sdk || 'genai',
    stage: input.stage,
    success: false,
    timestamp: new Date().toISOString(),
  };
  pushGeminiExtractionEvent(event);
  console.warn('Gemini extraction failed', event);
}

function parseInvoiceResponse(response: GenerateContentResponse): InvoiceData {
  const text = response.text;
  return parseInvoiceResponseText(text);
}

function parseInvoiceResponseText(text: string | undefined): InvoiceData {
  if (!text) {
    throw new Error('No se recibió respuesta del modelo.');
  }

  const parsed: unknown = JSON.parse(text);
  if (!isInvoiceData(parsed)) {
    throw new Error('La respuesta del modelo no cumple el esquema esperado.');
  }

  return applyBackendConfidenceValidation(parsed);
}

function getUsageNumber(usage: unknown, key: keyof ExtractionUsageMetrics): number | undefined {
  if (!isRecord(usage)) {
    return undefined;
  }

  const value = usage[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function buildUsageMetrics(usage: unknown): ExtractionUsageMetrics {
  return {
    cachedContentTokenCount: getUsageNumber(usage, 'cachedContentTokenCount'),
    candidatesTokenCount: getUsageNumber(usage, 'candidatesTokenCount'),
    promptTokenCount: getUsageNumber(usage, 'promptTokenCount'),
    thoughtsTokenCount: getUsageNumber(usage, 'thoughtsTokenCount'),
    totalTokenCount: getUsageNumber(usage, 'totalTokenCount'),
  };
}

function addOptionalNumbers(left?: number, right?: number): number | undefined {
  if (left === undefined && right === undefined) {
    return undefined;
  }

  return (left || 0) + (right || 0);
}

function combineUsageMetrics(
  left: ExtractionUsageMetrics,
  right: ExtractionUsageMetrics,
): ExtractionUsageMetrics {
  return {
    cachedContentTokenCount: addOptionalNumbers(
      left.cachedContentTokenCount,
      right.cachedContentTokenCount,
    ),
    candidatesTokenCount: addOptionalNumbers(left.candidatesTokenCount, right.candidatesTokenCount),
    promptTokenCount: addOptionalNumbers(left.promptTokenCount, right.promptTokenCount),
    thoughtsTokenCount: addOptionalNumbers(left.thoughtsTokenCount, right.thoughtsTokenCount),
    totalTokenCount: addOptionalNumbers(left.totalTokenCount, right.totalTokenCount),
  };
}

function buildRouterThinkingConfig(
  level: Exclude<GeminiThinkingLevel, 'off'> = 'minimal',
): NonNullable<GenerateContentConfig['thinkingConfig']> {
  return {
    includeThoughts: false,
    thinkingLevel: toGenaiThinkingLevel(level),
  };
}

function getRouterClassificationConfig(): GenerateContentConfig {
  return {
    maxOutputTokens: readGeminiRouterClassifierMaxOutputTokens(),
    mediaResolution: readGeminiRouterClassifierMediaResolution(),
    responseMimeType: 'application/json',
    responseSchema: routerClassificationSchema,
    temperature: 0,
    thinkingConfig: buildRouterThinkingConfig(readGeminiRouterClassifierThinkingLevel()),
  };
}

function getRouterClassificationConfigForThinkingLevel(
  thinkingLevel: Exclude<GeminiThinkingLevel, 'off'>,
): GenerateContentConfig {
  return {
    ...getRouterClassificationConfig(),
    thinkingConfig: buildRouterThinkingConfig(thinkingLevel),
  };
}

function getRouterExtractionConfig(): GenerateContentConfig {
  return {
    maxOutputTokens: readGeminiMaxOutputTokens(),
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    responseMimeType: 'application/json',
    responseSchema: invoiceExtractionSchema,
    temperature: 0,
    thinkingConfig: buildRouterThinkingConfig(),
  };
}

function getUploadedGeminiFileUri(file: GeminiFile): string {
  if (!file.uri || !file.uri.trim()) {
    throw new Error('Gemini Files API no devolvió URI para el documento.');
  }

  return file.uri;
}

function getUploadedGeminiFileName(file: GeminiFile): string {
  if (!file.name || !file.name.trim()) {
    throw new Error('Gemini Files API no devolvió nombre para borrar el documento.');
  }

  return file.name;
}

function buildFileContent(prompt: string, fileUri: string, mimeType: string): Content[] {
  return [
    {
      role: 'user',
      parts: [{ text: prompt }, createPartFromUri(fileUri, mimeType)],
    },
  ];
}

function buildRouterDocumentContent(input: {
  document: ExtractInvoiceFromBufferInput;
  fileUri?: string;
  mimeType: string;
  prompt: string;
}): Content[] {
  if (input.fileUri) {
    return buildFileContent(input.prompt, input.fileUri, input.mimeType);
  }

  return [
    { role: 'user', parts: [{ text: input.prompt }, buildInlineDocumentPart(input.document)] },
  ];
}

interface RouterClassificationResult {
  category: RouterInvoiceCategory;
  confidence: number;
  visualSignals: string[];
}

function parseRouterClassification(response: GenerateContentResponse): RouterClassificationResult {
  const text = response.text;
  if (!text) {
    return { category: 'UNKNOWN_GENERAL', confidence: 0, visualSignals: [] };
  }

  const parsed: unknown = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();
  if (!isRecord(parsed)) {
    return { category: 'UNKNOWN_GENERAL', confidence: 0, visualSignals: [] };
  }

  const value = parsed.tipoFactura || parsed.tipo_factura;
  const parsedCategory = isRouterInvoiceCategory(value) ? value : 'UNKNOWN_GENERAL';
  const confidence =
    typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
      ? Math.min(Math.max(parsed.confidence, 0), 1)
      : parsedCategory === 'UNKNOWN_GENERAL'
        ? 0
        : 1;
  const visualSignals = Array.isArray(parsed.visualSignals)
    ? parsed.visualSignals
        .filter((signal): signal is string => typeof signal === 'string')
        .slice(0, 3)
    : [];

  return {
    category: parsedCategory,
    confidence,
    visualSignals,
  };
}

function shouldRetryRouterClassification(classification: RouterClassificationResult): boolean {
  return (
    classification.category === 'UNKNOWN_GENERAL' ||
    classification.confidence < readGeminiRouterClassifierConfidenceThreshold()
  );
}

async function uploadGeminiDocumentFile(input: {
  ai: GoogleGenAI;
  document: ExtractInvoiceFromBufferInput;
  displayName: string;
}): Promise<{ durationMs: number; file: GeminiFile }> {
  const startedAtMs = Date.now();
  const mimeType = input.document.mimeType || DEFAULT_DOCUMENT_MIME_TYPE;
  const file = await input.ai.files.upload({
    file: new Blob([input.document.buffer], { type: mimeType }),
    config: {
      displayName: input.displayName,
      mimeType,
    },
  });

  return {
    durationMs: Date.now() - startedAtMs,
    file,
  };
}

async function waitForGeminiDocumentFileActive(input: {
  ai: GoogleGenAI;
  file: GeminiFile;
  timeoutMs: number;
}): Promise<GeminiFile> {
  const fileName = getUploadedGeminiFileName(input.file);
  const startedAtMs = Date.now();
  let file = input.file;

  while (file.state === FileState.PROCESSING) {
    if (Date.now() - startedAtMs > input.timeoutMs) {
      throw new Error(`Gemini Files API file did not become ACTIVE after ${input.timeoutMs}ms.`);
    }

    await delay(2_000);
    file = await input.ai.files.get({ name: fileName });
  }

  if (file.state === FileState.FAILED) {
    throw new Error(`Gemini Files API file processing failed: ${file.error?.message || fileName}`);
  }

  return file;
}

async function deleteGeminiDocumentFile(input: {
  ai: GoogleGenAI;
  fileName: string | null;
}): Promise<{ durationMs: number; ok: boolean }> {
  if (!input.fileName) {
    return { durationMs: 0, ok: false };
  }

  const startedAtMs = Date.now();
  try {
    await input.ai.files.delete({ name: input.fileName });
    return { durationMs: Date.now() - startedAtMs, ok: true };
  } catch (error) {
    console.warn('No se pudo borrar el archivo temporal de Gemini Files API.', {
      error: getErrorMessage(error),
      fileName: input.fileName,
    });
    return { durationMs: Date.now() - startedAtMs, ok: false };
  }
}

function buildRouterRunMetrics(input: {
  cacheMode: string;
  classifierDurationMs: number;
  classifierModel: string;
  classifierUsage: unknown;
  durationMs: number;
  extractorDurationMs: number;
  extractorModel: string;
  extractorPromptHash: string;
  extractorUsage: unknown;
  fileInputMode: 'files-api' | 'inline-fallback';
  fileUploadError?: string;
  fileUploadDurationMs: number;
  routerCategory: RouterInvoiceCategory;
  routerConfidence?: number;
  routerVisualSignals?: string[];
}): ExtractionRunMetrics {
  const classifierMetrics = buildUsageMetrics(input.classifierUsage);
  const extractorMetrics = buildUsageMetrics(input.extractorUsage);
  const aggregateUsage = combineUsageMetrics(classifierMetrics, extractorMetrics);

  return {
    ...aggregateUsage,
    cacheMode: input.cacheMode,
    classifier: {
      ...classifierMetrics,
      durationMs: input.classifierDurationMs,
      mediaResolution: readGeminiRouterClassifierMediaResolution(),
      model: input.classifierModel,
    },
    durationMs: input.durationMs,
    extractor: {
      ...extractorMetrics,
      durationMs: input.extractorDurationMs,
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      model: input.extractorModel,
      promptHash: input.extractorPromptHash.slice(0, 12),
    },
    fileUploadDurationMs: input.fileUploadDurationMs,
    fileInputMode: input.fileInputMode,
    fileUploadError: input.fileUploadError,
    model: input.extractorModel,
    promptHash: input.extractorPromptHash.slice(0, 12),
    routerCategory: input.routerCategory,
    routerConfidence: input.routerConfidence,
    routerVisualSignals: input.routerVisualSignals,
    sdk: 'genai-router-files',
  };
}

export async function generateInvoiceWithGenaiRouterFilesDetailed(input: {
  agentType: AgentType;
  ai?: GoogleGenAI;
  document: ExtractInvoiceFromBufferInput;
}): Promise<ExtractionRunResult> {
  const ai = input.ai || getGenAI();
  const classifierModel = getGeminiRouterModelId();
  const extractorModel = getGeminiRouterExtractorModelId();
  const classifierPromptHash = getGeminiPromptHash(ROUTER_CLASSIFICATION_PROMPT);
  const documentHash = createHash('sha256')
    .update(input.document.buffer)
    .digest('hex')
    .slice(0, 12);
  const startedAtMs = Date.now();
  let currentStage = 'files-upload';
  let routerCategory: RouterInvoiceCategory | undefined;
  let routerConfidence: number | undefined;
  let routerVisualSignals: string[] | undefined;
  let uploadedFileName: string | null = null;
  let runResult: ExtractionRunResult | null = null;

  try {
    currentStage = 'files-upload';
    const uploaded = await uploadGeminiDocumentFile({
      ai,
      displayName: `smart-invoice-router-${documentHash}.pdf`,
      document: input.document,
    });
    uploadedFileName = getUploadedGeminiFileName(uploaded.file);
    logGeminiFileEvent({
      agentType: input.agentType,
      cacheMode: 'router-files-upload',
      durationMs: uploaded.durationMs,
      fileInputMode: 'files-api',
      fileUploadDurationMs: uploaded.durationMs,
      model: classifierModel,
      promptHash: classifierPromptHash,
      stage: 'files-upload',
      success: true,
      telemetryContext: input.document.telemetryContext,
    });

    currentStage = 'files-active';
    const activationStartedAtMs = Date.now();
    const activeFile = await waitForGeminiDocumentFileActive({
      ai,
      file: uploaded.file,
      timeoutMs: readGeminiRouterClassifierTimeoutMs(),
    });
    logGeminiFileEvent({
      agentType: input.agentType,
      cacheMode: 'router-files-active',
      durationMs: Date.now() - activationStartedAtMs,
      fileInputMode: 'files-api',
      model: classifierModel,
      promptHash: classifierPromptHash,
      stage: 'files-active',
      success: true,
      telemetryContext: input.document.telemetryContext,
    });

    const fileUri = getUploadedGeminiFileUri(activeFile);
    const mimeType = activeFile.mimeType || input.document.mimeType || DEFAULT_DOCUMENT_MIME_TYPE;

    currentStage = 'classifier';
    const classifierThinkingLevel = readGeminiRouterClassifierThinkingLevel();
    let classifier = await generateContentWithConfig({
      ai,
      config: getRouterClassificationConfigForThinkingLevel(classifierThinkingLevel),
      contents: buildFileContent(ROUTER_CLASSIFICATION_PROMPT, fileUri, mimeType),
      model: classifierModel,
      timeoutMs: readGeminiRouterClassifierTimeoutMs(),
    });
    let classifierDurationMs = classifier.durationMs;
    let classifierUsage = buildUsageMetrics(classifier.response.usageMetadata);
    let classification = parseRouterClassification(classifier.response);
    routerCategory = classification.category;
    routerConfidence = classification.confidence;
    routerVisualSignals = classification.visualSignals;

    logGeminiUsage({
      agentType: input.agentType,
      cacheMode: 'router-files-classifier',
      durationMs: classifier.durationMs,
      model: classifierModel,
      promptHash: classifierPromptHash,
      response: classifier.response,
      routerCategory,
      routerConfidence,
      routerVisualSignals,
      sdk: 'genai-router-files',
      stage: 'classifier',
      telemetryContext: input.document.telemetryContext,
    });

    if (
      shouldRetryRouterClassification(classification) &&
      classifierThinkingLevel !== 'medium' &&
      classifierThinkingLevel !== 'high'
    ) {
      currentStage = 'classifier-medium';
      const classifierRetry = await generateContentWithConfig({
        ai,
        config: getRouterClassificationConfigForThinkingLevel('medium'),
        contents: buildFileContent(ROUTER_CLASSIFICATION_PROMPT, fileUri, mimeType),
        model: classifierModel,
        timeoutMs: readGeminiRouterClassifierTimeoutMs(),
      });
      const retryClassification = parseRouterClassification(classifierRetry.response);
      classifier = classifierRetry;
      classifierDurationMs += classifierRetry.durationMs;
      classifierUsage = combineUsageMetrics(
        classifierUsage,
        buildUsageMetrics(classifierRetry.response.usageMetadata),
      );
      classification = retryClassification;
      routerCategory = retryClassification.category;
      routerConfidence = retryClassification.confidence;
      routerVisualSignals = retryClassification.visualSignals;

      logGeminiUsage({
        agentType: input.agentType,
        cacheMode: 'router-files-classifier-medium',
        durationMs: classifierRetry.durationMs,
        model: classifierModel,
        promptHash: classifierPromptHash,
        response: classifierRetry.response,
        routerCategory,
        routerConfidence,
        routerVisualSignals,
        sdk: 'genai-router-files',
        stage: 'classifier-medium',
        telemetryContext: input.document.telemetryContext,
      });
    }

    const extractorPrompt = buildRouterExtractorPrompt(input.agentType, routerCategory);
    const extractorPromptHash = getGeminiPromptHash(extractorPrompt);
    currentStage = 'extractor';
    const extractor = await generateContentWithConfig({
      ai,
      config: getRouterExtractionConfig(),
      contents: buildFileContent(extractorPrompt, fileUri, mimeType),
      model: extractorModel,
      timeoutMs: readGeminiRouterExtractorTimeoutMs(),
    });

    logGeminiUsage({
      agentType: input.agentType,
      cacheMode: 'router-files-extractor',
      durationMs: extractor.durationMs,
      model: extractorModel,
      promptHash: extractorPromptHash,
      response: extractor.response,
      routerCategory,
      routerConfidence,
      routerVisualSignals,
      sdk: 'genai-router-files',
      stage: 'extractor',
      telemetryContext: input.document.telemetryContext,
    });

    runResult = {
      metrics: buildRouterRunMetrics({
        cacheMode: 'router-files',
        classifierDurationMs,
        classifierModel,
        classifierUsage,
        durationMs: Date.now() - startedAtMs,
        extractorDurationMs: extractor.durationMs,
        extractorModel,
        extractorPromptHash,
        extractorUsage: extractor.response.usageMetadata,
        fileInputMode: 'files-api',
        fileUploadDurationMs: uploaded.durationMs,
        routerCategory,
        routerConfidence,
        routerVisualSignals,
      }),
      result: parseInvoiceResponse(extractor.response),
    };

    return runResult;
  } catch (error) {
    logGeminiFailure({
      agentType: input.agentType,
      cacheMode: 'router-files',
      durationMs: Date.now() - startedAtMs,
      error,
      model: currentStage === 'extractor' ? extractorModel : classifierModel,
      promptHash: classifierPromptHash,
      routerCategory,
      routerConfidence,
      routerVisualSignals,
      sdk: 'genai-router-files',
      stage: currentStage,
      telemetryContext: input.document.telemetryContext,
    });
    throw error;
  } finally {
    const deleted = await deleteGeminiDocumentFile({ ai, fileName: uploadedFileName });
    if (uploadedFileName) {
      logGeminiFileEvent({
        agentType: input.agentType,
        cacheMode: 'router-files-delete',
        durationMs: deleted.durationMs,
        error: deleted.ok ? undefined : 'Gemini Files API delete failed.',
        fileDeleteDurationMs: deleted.durationMs,
        fileDeleteOk: deleted.ok,
        fileInputMode: 'files-api',
        model: extractorModel,
        promptHash: classifierPromptHash,
        routerCategory,
        routerConfidence,
        routerVisualSignals,
        stage: 'files-delete',
        success: deleted.ok,
        telemetryContext: input.document.telemetryContext,
      });
    }
    if (runResult) {
      runResult.metrics.fileDeleteDurationMs = deleted.durationMs;
      runResult.metrics.fileDeleteOk = deleted.ok;
    }
  }
}

async function generateInvoiceWithLegacySdkDetailed(input: {
  agentType: AgentType;
  cacheMode: string;
  document: ExtractInvoiceFromBufferInput;
  model: string;
  prompt: string;
  promptHash: string;
  sdk?: ExtractionSdk;
}): Promise<ExtractionRunResult> {
  const startedAtMs = Date.now();
  const maxAttempts = readLegacyTransientRetryAttempts();
  let attempt = 0;

  while (true) {
    try {
      const generated = await generateInvoiceContentWithLegacySdk({
        document: input.document,
        model: input.model,
        prompt: input.prompt,
      });
      const durationMs = Date.now() - startedAtMs;
      const usage = generated.result.response.usageMetadata;
      logLegacyGeminiUsage({
        agentType: input.agentType,
        cacheMode: input.cacheMode,
        durationMs,
        model: input.model,
        promptHash: input.promptHash,
        sdk: input.sdk,
        telemetryContext: input.document.telemetryContext,
        usage,
      });

      return {
        metrics: {
          ...buildUsageMetrics(usage),
          cacheMode: input.cacheMode,
          durationMs,
          model: input.model,
          promptHash: input.promptHash.slice(0, 12),
          sdk: input.sdk || 'legacy',
        },
        result: parseInvoiceResponseText(generated.result.response.text()),
      };
    } catch (error) {
      const canRetry =
        attempt < maxAttempts - 1 && isTransientGeminiError(error) && !isGeminiTimeoutError(error);

      if (canRetry) {
        const delayMs = getLegacyRetryDelayMs(attempt);
        console.warn('Gemini legacy transient error; retrying before job failure.', {
          attempt: attempt + 1,
          cacheMode: input.cacheMode,
          delayMs,
          error: getErrorMessage(error),
          maxAttempts,
          model: input.model,
          promptHash: input.promptHash.slice(0, 12),
        });

        attempt += 1;
        await delay(delayMs);
        continue;
      }

      logGeminiFailure({
        agentType: input.agentType,
        cacheMode: input.cacheMode,
        durationMs: Date.now() - startedAtMs,
        error,
        model: input.model,
        promptHash: input.promptHash,
        sdk: input.sdk || 'legacy',
        telemetryContext: input.document.telemetryContext,
      });
      throw error;
    }
  }
}

function normalizeForDiff(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number(value.toFixed(4));
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForDiff(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeForDiff(nestedValue)]),
    );
  }

  return value ?? '';
}

function areDiffValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeForDiff(left)) === JSON.stringify(normalizeForDiff(right));
}

function addDiffIfChanged(
  summary: ExtractionDiffItem[],
  field: string,
  legacy: unknown,
  genaiRouterFiles: unknown,
): void {
  if (areDiffValuesEqual(legacy, genaiRouterFiles)) {
    return;
  }

  summary.push({
    field,
    genaiRouterFiles: normalizeForDiff(genaiRouterFiles),
    legacy: normalizeForDiff(legacy),
  });
}

function getConfidenceReasonCodes(invoice: InvoiceData): string[] {
  return (invoice.confidenceReasons || []).map((reason) => reason.code).sort();
}

function buildLineItemComparisonSnapshot(invoice: InvoiceData) {
  return invoice.lineItems.map((item) => ({
    boxType: item.boxType,
    eqFull: item.eqFull,
    productDescription: item.productDescription,
    totalPieces: item.totalPieces,
    totalStems: item.totalStems,
    totalValue: item.totalValue,
    unitPrice: item.unitPrice,
  }));
}

export function buildExtractionDiffSummary(
  legacy: InvoiceData,
  genaiRouterFiles: InvoiceData,
): ExtractionDiffItem[] {
  const summary: ExtractionDiffItem[] = [];

  addDiffIfChanged(summary, 'invoiceNumber', legacy.invoiceNumber, genaiRouterFiles.invoiceNumber);
  addDiffIfChanged(summary, 'date', legacy.date, genaiRouterFiles.date);
  addDiffIfChanged(summary, 'shipperName', legacy.shipperName, genaiRouterFiles.shipperName);
  addDiffIfChanged(summary, 'consigneeName', legacy.consigneeName, genaiRouterFiles.consigneeName);
  addDiffIfChanged(summary, 'mawb', legacy.mawb, genaiRouterFiles.mawb);
  addDiffIfChanged(summary, 'hawb', legacy.hawb, genaiRouterFiles.hawb);
  addDiffIfChanged(summary, 'totalPieces', legacy.totalPieces, genaiRouterFiles.totalPieces);
  addDiffIfChanged(summary, 'totalEq', legacy.totalEq, genaiRouterFiles.totalEq);
  addDiffIfChanged(summary, 'totalStems', legacy.totalStems, genaiRouterFiles.totalStems);
  addDiffIfChanged(summary, 'totalValue', legacy.totalValue, genaiRouterFiles.totalValue);
  addDiffIfChanged(
    summary,
    'lineItems.length',
    legacy.lineItems.length,
    genaiRouterFiles.lineItems.length,
  );
  addDiffIfChanged(
    summary,
    'lineItems',
    buildLineItemComparisonSnapshot(legacy),
    buildLineItemComparisonSnapshot(genaiRouterFiles),
  );
  addDiffIfChanged(
    summary,
    'confidenceScore',
    legacy.confidenceScore,
    genaiRouterFiles.confidenceScore,
  );
  addDiffIfChanged(
    summary,
    'confidenceReasons',
    getConfidenceReasonCodes(legacy),
    getConfidenceReasonCodes(genaiRouterFiles),
  );

  return summary.slice(0, 25);
}

function getCacheMode(cacheHandle: PromptCacheHandle): string {
  if (cacheHandle.waitedForCreate) {
    return 'explicit-cache-waited';
  }

  return cacheHandle.reusedExisting ? 'explicit-cache-hit' : 'explicit-cache-created';
}

function getLegacyCacheMode(cacheHandle: LegacyPromptCacheHandle): string {
  if (cacheHandle.waitedForCreate) {
    return 'legacy-explicit-cache-waited';
  }

  return cacheHandle.reusedExisting ? 'legacy-explicit-cache-hit' : 'legacy-explicit-cache-created';
}

function warmPromptCacheInBackground(input: {
  ai: GoogleGenAI;
  agentType: AgentType;
  model: string;
  prompt: string;
}): void {
  warmGeminiPromptCache(
    {
      ai: input.ai,
      agentType: input.agentType,
      model: input.model,
      prompt: input.prompt,
    },
    (error, promptHash) => {
      console.warn('Gemini prompt cache warm-up failed; continuing with uncached extraction.', {
        agentType: input.agentType,
        error: getErrorMessage(error),
        model: input.model,
        promptHash: promptHash.slice(0, 12),
      });
    },
  );
}

export function warmExtractionPromptCache(formatValue?: string): {
  agentType: AgentType;
  promptHash: string;
  state: 'disabled' | 'ready' | 'warming';
} {
  const agentType = normalizeAgentType(formatValue);
  const prompt = buildExtractionPrompt(agentType, {
    profile: readGeminiExtractionPromptProfile(),
  });
  const model = getGeminiModelId();
  const promptHash = getGeminiPromptHash(prompt);

  if (readGeminiExtractionSdk() === 'legacy-cache') {
    const cacheHandle = getReadyLegacyPromptCache({
      agentType,
      model,
      prompt,
    });

    if (!isGeminiPromptCacheEnabled()) {
      return { agentType, promptHash: promptHash.slice(0, 12), state: 'disabled' };
    }

    if (cacheHandle) {
      return { agentType, promptHash: promptHash.slice(0, 12), state: 'ready' };
    }

    void getLegacyPromptCache({
      agentType,
      model,
      prompt,
    }).catch((error) => {
      console.warn(
        'Gemini legacy prompt cache warm-up failed; continuing with direct legacy extraction.',
        {
          agentType,
          error: getErrorMessage(error),
          model,
          promptHash: promptHash.slice(0, 12),
        },
      );
    });

    return { agentType, promptHash: promptHash.slice(0, 12), state: 'warming' };
  }

  const ai = getGenAI();
  const cacheHandle = getReadyGeminiPromptCache({
    ai,
    agentType,
    model,
    prompt,
  });

  if (!isGeminiPromptCacheEnabled()) {
    return { agentType, promptHash: promptHash.slice(0, 12), state: 'disabled' };
  }

  if (cacheHandle) {
    return { agentType, promptHash: promptHash.slice(0, 12), state: 'ready' };
  }

  warmPromptCacheInBackground({
    ai,
    agentType,
    model,
    prompt,
  });

  return { agentType, promptHash: promptHash.slice(0, 12), state: 'warming' };
}

async function ensureLegacyExtractionPromptCache(
  formatValue?: string,
): Promise<ExtractionPromptCacheResult> {
  const agentType = normalizeAgentType(formatValue);
  const prompt = buildExtractionPrompt(agentType, {
    profile: readGeminiExtractionPromptProfile(),
  });
  const model = getGeminiModelId();
  const promptHash = getGeminiPromptHash(prompt);
  const baseResult = {
    agentType,
    promptHash: promptHash.slice(0, 12),
  };

  if (!isGeminiPromptCacheEnabled()) {
    return { ...baseResult, state: 'disabled' };
  }

  try {
    const cacheHandle = await getLegacyPromptCache({
      agentType,
      model,
      prompt,
    });

    if (!cacheHandle) {
      return { ...baseResult, state: 'disabled' };
    }

    return {
      ...baseResult,
      cacheName: cacheHandle.cacheName,
      cacheTokenCount: cacheHandle.cacheTokenCount,
      reusedExisting: cacheHandle.reusedExisting,
      state: 'ready',
      waitedForCreate: cacheHandle.waitedForCreate,
    };
  } catch (error) {
    console.warn('Gemini legacy prompt cache ensure failed; documents will process directly.', {
      agentType,
      error: getErrorMessage(error),
      model,
      promptHash: promptHash.slice(0, 12),
    });

    return {
      ...baseResult,
      error: getErrorMessage(error),
      state: 'error',
    };
  }
}

export async function ensureExtractionPromptCache(
  formatValue?: string,
): Promise<ExtractionPromptCacheResult> {
  if (readGeminiExtractionSdk() === 'legacy-cache') {
    return ensureLegacyExtractionPromptCache(formatValue);
  }

  const agentType = normalizeAgentType(formatValue);
  const prompt = buildExtractionPrompt(agentType, {
    profile: readGeminiExtractionPromptProfile(),
  });
  const model = getGeminiModelId();
  const promptHash = getGeminiPromptHash(prompt);
  const baseResult = {
    agentType,
    promptHash: promptHash.slice(0, 12),
  };

  if (!isGeminiPromptCacheEnabled()) {
    return { ...baseResult, state: 'disabled' };
  }

  try {
    const cacheHandle = await getGeminiPromptCache({
      ai: getGenAI(),
      agentType,
      model,
      prompt,
    });

    if (!cacheHandle) {
      return { ...baseResult, state: 'disabled' };
    }

    return {
      ...baseResult,
      cacheName: cacheHandle.cacheName,
      cacheTokenCount: cacheHandle.cacheTokenCount,
      reusedExisting: cacheHandle.reusedExisting,
      state: 'ready',
      waitedForCreate: cacheHandle.waitedForCreate,
    };
  } catch (error) {
    console.warn('Gemini prompt cache ensure failed; documents will process uncached.', {
      agentType,
      error: getErrorMessage(error),
      model,
      promptHash: promptHash.slice(0, 12),
    });

    return {
      ...baseResult,
      error: getErrorMessage(error),
      state: 'error',
    };
  }
}

async function tryGenerateWithPromptCache(input: {
  ai: GoogleGenAI;
  agentType: AgentType;
  cacheHandle: PromptCacheHandle;
  document: ExtractInvoiceFromBufferInput;
  model: string;
  prompt: string;
}): Promise<InvoiceData | null> {
  const contents = buildCachedInvoiceContents(input.document);
  const cacheMode = getCacheMode(input.cacheHandle);
  const startedAtMs = Date.now();

  try {
    const generated = await generateInvoiceContent({
      ai: input.ai,
      cachedContent: input.cacheHandle.cacheName,
      contents,
      model: input.model,
      timeoutMs: readGeminiCachedGenerateTimeoutMs(),
    });
    logGeminiUsage({
      agentType: input.agentType,
      cacheMode,
      cacheTokenCount: input.cacheHandle.cacheTokenCount,
      durationMs: generated.durationMs,
      model: input.model,
      promptHash: input.cacheHandle.promptHash,
      response: generated.response,
      telemetryContext: input.document.telemetryContext,
    });
    return parseInvoiceResponse(generated.response);
  } catch (error) {
    const isTransientError = isTransientGeminiError(error);
    const shouldFallbackToUncached =
      !isTransientError || isGeminiPromptCacheTransientFallbackEnabled();

    logGeminiFailure({
      agentType: input.agentType,
      cacheMode,
      cacheTokenCount: input.cacheHandle.cacheTokenCount,
      durationMs: Date.now() - startedAtMs,
      error,
      model: input.model,
      promptHash: input.cacheHandle.promptHash,
      telemetryContext: input.document.telemetryContext,
    });

    console.warn(
      !shouldFallbackToUncached
        ? 'Gemini cached extraction failed with a transient error; preserving cache and letting the queue retry.'
        : 'Gemini cached extraction failed; falling back to uncached extraction.',
      {
        agentType: input.agentType,
        error: getErrorMessage(error),
        fallbackToUncached: shouldFallbackToUncached,
        preservedCache: isTransientError,
        model: input.model,
        promptHash: input.cacheHandle.promptHash.slice(0, 12),
      },
    );

    if (!shouldFallbackToUncached) {
      throw error;
    }

    if (!isTransientError) {
      removeGeminiPromptCache(input.cacheHandle.cacheKey);
    }

    return null;
  }
}

async function tryGenerateWithLegacyPromptCache(input: {
  agentType: AgentType;
  cacheHandle: LegacyPromptCacheHandle;
  document: ExtractInvoiceFromBufferInput;
  model: string;
}): Promise<InvoiceData | null> {
  const cacheMode = getLegacyCacheMode(input.cacheHandle);
  const startedAtMs = Date.now();

  try {
    const generated = await generateInvoiceContentWithLegacyCachedSdk({
      cache: input.cacheHandle.cache,
      document: input.document,
    });
    logLegacyGeminiUsage({
      agentType: input.agentType,
      cacheMode,
      cacheTokenCount: input.cacheHandle.cacheTokenCount,
      durationMs: generated.durationMs,
      model: input.model,
      promptHash: input.cacheHandle.promptHash,
      sdk: 'legacy-cache',
      telemetryContext: input.document.telemetryContext,
      usage: generated.result.response.usageMetadata,
    });

    return parseInvoiceResponseText(generated.result.response.text());
  } catch (error) {
    const isTransientError = isTransientGeminiError(error);
    const shouldFallbackToDirect =
      !isTransientError || isGeminiPromptCacheTransientFallbackEnabled();

    logGeminiFailure({
      agentType: input.agentType,
      cacheMode,
      cacheTokenCount: input.cacheHandle.cacheTokenCount,
      durationMs: Date.now() - startedAtMs,
      error,
      model: input.model,
      promptHash: input.cacheHandle.promptHash,
      sdk: 'legacy-cache',
      telemetryContext: input.document.telemetryContext,
    });

    console.warn(
      !shouldFallbackToDirect
        ? 'Gemini legacy cached extraction failed with a transient error; preserving cache and letting the queue retry.'
        : 'Gemini legacy cached extraction failed; falling back to direct legacy extraction.',
      {
        agentType: input.agentType,
        error: getErrorMessage(error),
        fallbackToDirect: shouldFallbackToDirect,
        preservedCache: isTransientError,
        model: input.model,
        promptHash: input.cacheHandle.promptHash.slice(0, 12),
      },
    );

    if (!shouldFallbackToDirect) {
      throw error;
    }

    return null;
  }
}

async function generateInvoiceWithLegacySdk(input: {
  agentType: AgentType;
  cacheMode: string;
  document: ExtractInvoiceFromBufferInput;
  model: string;
  prompt: string;
  promptHash: string;
  sdk?: ExtractionSdk;
}): Promise<InvoiceData> {
  const startedAtMs = Date.now();
  const maxAttempts = readLegacyTransientRetryAttempts();
  let attempt = 0;

  while (true) {
    try {
      const generated = await generateInvoiceContentWithLegacySdk({
        document: input.document,
        model: input.model,
        prompt: input.prompt,
      });
      logLegacyGeminiUsage({
        agentType: input.agentType,
        cacheMode: input.cacheMode,
        durationMs: Date.now() - startedAtMs,
        model: input.model,
        promptHash: input.promptHash,
        sdk: input.sdk,
        telemetryContext: input.document.telemetryContext,
        usage: generated.result.response.usageMetadata,
      });

      return parseInvoiceResponseText(generated.result.response.text());
    } catch (error) {
      const canRetry =
        attempt < maxAttempts - 1 && isTransientGeminiError(error) && !isGeminiTimeoutError(error);

      if (canRetry) {
        const delayMs = getLegacyRetryDelayMs(attempt);
        console.warn('Gemini legacy transient error; retrying before job failure.', {
          attempt: attempt + 1,
          cacheMode: input.cacheMode,
          delayMs,
          error: getErrorMessage(error),
          maxAttempts,
          model: input.model,
          promptHash: input.promptHash.slice(0, 12),
        });

        attempt += 1;
        await delay(delayMs);
        continue;
      }

      logGeminiFailure({
        agentType: input.agentType,
        cacheMode: input.cacheMode,
        durationMs: Date.now() - startedAtMs,
        error,
        model: input.model,
        promptHash: input.promptHash,
        sdk: input.sdk || 'legacy',
        telemetryContext: input.document.telemetryContext,
      });
      throw error;
    }
  }
}

async function generateInvoiceWithLegacyPromptCache(input: {
  agentType: AgentType;
  document: ExtractInvoiceFromBufferInput;
  model: string;
  prompt: string;
  promptHash: string;
}): Promise<InvoiceData> {
  if (!isGeminiPromptCacheEnabled()) {
    return generateInvoiceWithLegacySdk({
      ...input,
      cacheMode: 'legacy-cache-disabled-direct',
      sdk: 'legacy-cache',
    });
  }

  if (!isGeminiPromptCacheUsedForExtraction()) {
    return generateInvoiceWithLegacySdk({
      ...input,
      cacheMode: 'legacy-cache-bypassed-direct',
      sdk: 'legacy-cache',
    });
  }

  let cacheHandle: LegacyPromptCacheHandle | null = getReadyLegacyPromptCache({
    agentType: input.agentType,
    model: input.model,
    prompt: input.prompt,
  });

  if (!cacheHandle) {
    try {
      cacheHandle = await getLegacyPromptCache({
        agentType: input.agentType,
        model: input.model,
        prompt: input.prompt,
      });
    } catch (error) {
      logGeminiFailure({
        agentType: input.agentType,
        cacheMode: 'legacy-explicit-cache-create',
        durationMs: 0,
        error,
        model: input.model,
        promptHash: input.promptHash,
        sdk: 'legacy-cache',
        telemetryContext: input.document.telemetryContext,
      });

      console.warn(
        'Gemini legacy prompt cache creation failed; falling back to direct legacy extraction.',
        {
          agentType: input.agentType,
          error: getErrorMessage(error),
          model: input.model,
          promptHash: input.promptHash.slice(0, 12),
        },
      );
    }
  }

  if (cacheHandle) {
    const cachedInvoice = await tryGenerateWithLegacyPromptCache({
      agentType: input.agentType,
      cacheHandle,
      document: input.document,
      model: input.model,
    });

    if (cachedInvoice) {
      return cachedInvoice;
    }
  }

  return generateInvoiceWithLegacySdk({
    ...input,
    cacheMode: 'legacy-cache-fallback-direct',
    sdk: 'legacy-cache',
  });
}

export async function compareInvoiceExtractionModes(
  input: ExtractInvoiceFromBufferInput,
): Promise<ExtractionComparisonResult> {
  const format = normalizeAgentType(input.format);
  const legacyPrompt = buildExtractionPrompt(format, {
    profile: readGeminiExtractionPromptProfile(),
  });
  const legacyModel = getGeminiModelId();
  const legacyPromptHash = getGeminiPromptHash(legacyPrompt);

  const legacy = await generateInvoiceWithLegacySdkDetailed({
    agentType: format,
    cacheMode: 'legacy-compare-direct',
    document: input,
    model: legacyModel,
    prompt: legacyPrompt,
    promptHash: legacyPromptHash,
    sdk: 'legacy',
  });
  const genaiRouterFiles = await generateInvoiceWithGenaiRouterFilesDetailed({
    agentType: format,
    document: input,
  });

  return {
    diff: {
      summary: buildExtractionDiffSummary(legacy.result, genaiRouterFiles.result),
    },
    genaiRouterFiles,
    legacy,
  };
}

export async function extractInvoiceFromBuffer(
  input: ExtractInvoiceFromBufferInput,
): Promise<InvoiceData> {
  const format = normalizeAgentType(input.format);
  const prompt = buildExtractionPrompt(format, {
    profile: readGeminiExtractionPromptProfile(),
  });
  const model = getGeminiModelId();
  const promptHash = getGeminiPromptHash(prompt);
  const extractionSdk = readGeminiExtractionSdk();

  if (extractionSdk === 'legacy-cache') {
    return generateInvoiceWithLegacyPromptCache({
      agentType: format,
      document: input,
      model,
      prompt,
      promptHash,
    });
  }

  if (extractionSdk === 'genai-router-files') {
    const run = await generateInvoiceWithGenaiRouterFilesDetailed({
      agentType: format,
      document: input,
    });
    return run.result;
  }

  if (extractionSdk === 'legacy') {
    return generateInvoiceWithLegacySdk({
      agentType: format,
      cacheMode: 'legacy-direct',
      document: input,
      model,
      prompt,
      promptHash,
    });
  }

  const ai = getGenAI();
  let uncachedFallbackMode: string | null = null;

  const shouldUsePromptCache =
    isGeminiPromptCacheEnabled() && isGeminiPromptCacheUsedForExtraction();

  if (shouldUsePromptCache) {
    const cacheHandle = getReadyGeminiPromptCache({
      ai,
      agentType: format,
      model,
      prompt,
    });

    if (cacheHandle) {
      const cachedInvoice = await tryGenerateWithPromptCache({
        ai,
        agentType: format,
        cacheHandle,
        document: input,
        model,
        prompt,
      });

      if (cachedInvoice) {
        return cachedInvoice;
      }

      uncachedFallbackMode = 'uncached-cache-fallback';
    } else if (isGeminiPromptCacheAutoWarmEnabled()) {
      warmPromptCacheInBackground({
        ai,
        agentType: format,
        model,
        prompt,
      });
    }
  }

  const cacheMode =
    uncachedFallbackMode ??
    (!isGeminiPromptCacheEnabled()
      ? 'uncached-cache-disabled'
      : !isGeminiPromptCacheUsedForExtraction()
        ? 'uncached-cache-bypassed'
        : isGeminiPromptCacheAutoWarmEnabled()
          ? 'uncached-cache-warming'
          : 'uncached-cache-not-ready');

  const startedAtMs = Date.now();
  try {
    const generated = await generateInvoiceContent({
      ai,
      contents: buildUncachedInvoiceContents(input, prompt),
      model,
    });
    logGeminiUsage({
      agentType: format,
      cacheMode,
      durationMs: generated.durationMs,
      model,
      promptHash,
      response: generated.response,
      telemetryContext: input.telemetryContext,
    });

    return parseInvoiceResponse(generated.response);
  } catch (error) {
    logGeminiFailure({
      agentType: format,
      cacheMode,
      durationMs: Date.now() - startedAtMs,
      error,
      model,
      promptHash,
      telemetryContext: input.telemetryContext,
    });

    if (isTransientGeminiError(error) && isGeminiExtractionFallbackToLegacyEnabled()) {
      console.warn('Gemini genai extraction failed transiently; falling back to legacy SDK.', {
        agentType: format,
        cacheMode,
        error: getErrorMessage(error),
        model,
        promptHash: promptHash.slice(0, 12),
      });

      return generateInvoiceWithLegacySdk({
        agentType: format,
        cacheMode: 'legacy-fallback-after-genai-transient',
        document: input,
        model,
        prompt,
        promptHash,
      });
    }

    throw error;
  }
}
