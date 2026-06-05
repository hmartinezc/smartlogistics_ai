import { createHash } from 'node:crypto';
import type { CachedContent, GoogleGenAI } from '@google/genai';
import type { AgentType } from '../../types.js';
import { getDb } from '../db.js';

const DEFAULT_CACHE_TTL_SECONDS = 4 * 60 * 60;
const CACHE_EXPIRY_SAFETY_WINDOW_MS = 30_000;
const DEFAULT_FAILURE_COOLDOWN_SECONDS = 10 * 60;
const DEFAULT_CACHE_CREATE_TIMEOUT_MS = 60_000;

interface PromptCacheEntry {
  cacheName?: string;
  cacheTokenCount?: number;
  createDurationMs?: number;
  createPromise?: Promise<PromptCacheCreated>;
  createdAtMs?: number;
  expiresAtMs: number;
  failedUntilMs?: number;
  lastError?: string;
  updatedAtMs?: number;
  warmStartedAtMs?: number;
}

interface PromptCacheCreated {
  cacheName: string;
  cacheTokenCount?: number;
  createDurationMs: number;
  expiresAtMs: number;
}

export interface PromptCacheHandle {
  cacheKey: string;
  cacheName: string;
  cacheTokenCount?: number;
  promptHash: string;
  reusedExisting: boolean;
  waitedForCreate: boolean;
}

export interface PromptCacheRequest {
  ai: GoogleGenAI;
  agentType: AgentType;
  model: string;
  prompt: string;
}

export interface PromptCacheDiagnostic {
  agentType: string;
  cacheKey: string;
  cacheName?: string;
  cacheTokenCount?: number;
  createDurationMs?: number;
  createdAt?: string;
  expiresAt?: string;
  failedUntil?: string;
  lastError?: string;
  model: string;
  promptHash: string;
  state: 'ready' | 'warming' | 'cooldown' | 'expired';
  updatedAt?: string;
  warmStartedAt?: string;
}

interface PersistentPromptCacheRow {
  agent_type: unknown;
  cache_key: unknown;
  cache_name: unknown;
  cache_token_count: unknown;
  create_duration_ms: unknown;
  created_at: unknown;
  expires_at: unknown;
  model: unknown;
  prompt_hash: unknown;
  updated_at: unknown;
}

const promptCacheEntries = new Map<string, PromptCacheEntry>();

function getPromptCacheLookup(input: Pick<PromptCacheRequest, 'agentType' | 'model' | 'prompt'>) {
  const promptHash = getGeminiPromptHash(input.prompt);
  return {
    cacheKey: `${input.model}:${input.agentType}:${promptHash}`,
    promptHash,
  };
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue.trim() === '') {
    return defaultValue;
  }

  return !['0', 'false', 'no', 'off'].includes(rawValue.trim().toLowerCase());
}

function readCacheTtlSeconds(): number {
  const rawValue = Number(process.env.GEMINI_PROMPT_CACHE_TTL_SECONDS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return DEFAULT_CACHE_TTL_SECONDS;
  }

  return Math.floor(rawValue);
}

function readFailureCooldownSeconds(): number {
  const rawValue = Number(process.env.GEMINI_PROMPT_CACHE_FAILURE_COOLDOWN_SECONDS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return DEFAULT_FAILURE_COOLDOWN_SECONDS;
  }

  return Math.floor(rawValue);
}

function readCacheCreateTimeoutMs(): number {
  const rawValue = Number(process.env.GEMINI_PROMPT_CACHE_CREATE_TIMEOUT_MS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return DEFAULT_CACHE_CREATE_TIMEOUT_MS;
  }

  return Math.floor(rawValue);
}

export function isGeminiPromptCacheEnabled(): boolean {
  return readBooleanEnv('GEMINI_PROMPT_CACHE_ENABLED', true);
}

export function isGeminiPromptCacheAutoWarmEnabled(): boolean {
  return readBooleanEnv('GEMINI_PROMPT_CACHE_AUTO_WARM_ENABLED', false);
}

export function isGeminiPromptCacheUsedForExtraction(): boolean {
  return readBooleanEnv('GEMINI_PROMPT_CACHE_USE_FOR_EXTRACTION', false);
}

export function isGeminiPromptCacheTransientFallbackEnabled(): boolean {
  return readBooleanEnv('GEMINI_PROMPT_CACHE_TRANSIENT_FALLBACK_TO_UNCACHED', false);
}

export function getGeminiPromptCacheConfig() {
  return {
    autoWarmEnabled: isGeminiPromptCacheAutoWarmEnabled(),
    createTimeoutMs: readCacheCreateTimeoutMs(),
    enabled: isGeminiPromptCacheEnabled(),
    failureCooldownSeconds: readFailureCooldownSeconds(),
    ttlSeconds: readCacheTtlSeconds(),
    transientFallbackToUncached: isGeminiPromptCacheTransientFallbackEnabled(),
    useForExtraction: isGeminiPromptCacheUsedForExtraction(),
  };
}

export function getGeminiPromptHash(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex');
}

export function removeGeminiPromptCache(cacheKey: string): void {
  promptCacheEntries.delete(cacheKey);
  void deletePersistentPromptCache(cacheKey);
}

export async function getGeminiPromptCacheDiagnostics(): Promise<PromptCacheDiagnostic[]> {
  const now = Date.now();
  const entries = new Map(promptCacheEntries);

  for (const row of await loadPersistentPromptCacheRows()) {
    const cacheKey = String(row.cache_key || '');
    if (!cacheKey || entries.has(cacheKey)) {
      continue;
    }

    const entry = promptCacheEntryFromPersistentRow(row);
    if (entry) {
      entries.set(cacheKey, entry);
    }
  }

  return Array.from(entries.entries()).map(([cacheKey, entry]) => {
    const [model = '', agentType = '', promptHash = ''] = cacheKey.split(':');
    const state: PromptCacheDiagnostic['state'] = entry.createPromise
      ? 'warming'
      : entry.failedUntilMs && entry.failedUntilMs > now
        ? 'cooldown'
        : entry.cacheName && entry.expiresAtMs > now + CACHE_EXPIRY_SAFETY_WINDOW_MS
          ? 'ready'
          : 'expired';

    return {
      cacheKey,
      agentType,
      cacheName: entry.cacheName,
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

export function getReadyGeminiPromptCache(input: PromptCacheRequest): PromptCacheHandle | null {
  if (!isGeminiPromptCacheEnabled()) {
    return null;
  }

  const { cacheKey, promptHash } = getPromptCacheLookup(input);
  const existingEntry = promptCacheEntries.get(cacheKey);
  if (
    !existingEntry?.cacheName ||
    existingEntry.expiresAtMs <= Date.now() + CACHE_EXPIRY_SAFETY_WINDOW_MS
  ) {
    return null;
  }

  return {
    cacheKey,
    cacheName: existingEntry.cacheName,
    cacheTokenCount: existingEntry.cacheTokenCount,
    promptHash,
    reusedExisting: true,
    waitedForCreate: false,
  };
}

export function warmGeminiPromptCache(
  input: PromptCacheRequest,
  onError?: (error: unknown, promptHash: string) => void,
): void {
  if (!isGeminiPromptCacheEnabled()) {
    return;
  }

  const { cacheKey, promptHash } = getPromptCacheLookup(input);
  const now = Date.now();
  const existingEntry = promptCacheEntries.get(cacheKey);
  const hasReadyCache =
    existingEntry?.cacheName && existingEntry.expiresAtMs > now + CACHE_EXPIRY_SAFETY_WINDOW_MS;
  if (
    hasReadyCache ||
    existingEntry?.createPromise ||
    (existingEntry?.failedUntilMs && existingEntry.failedUntilMs > now)
  ) {
    return;
  }

  void getGeminiPromptCache(input).catch((error) => {
    onError?.(error, promptHash);
  });
}

export async function getGeminiPromptCache(
  input: PromptCacheRequest,
): Promise<PromptCacheHandle | null> {
  if (!isGeminiPromptCacheEnabled()) {
    return null;
  }

  const ttlSeconds = readCacheTtlSeconds();
  const { cacheKey, promptHash } = getPromptCacheLookup(input);
  const now = Date.now();
  const existingEntry = promptCacheEntries.get(cacheKey);

  if (existingEntry?.cacheName && existingEntry.expiresAtMs > now + CACHE_EXPIRY_SAFETY_WINDOW_MS) {
    return {
      cacheKey,
      cacheName: existingEntry.cacheName,
      cacheTokenCount: existingEntry.cacheTokenCount,
      promptHash,
      reusedExisting: true,
      waitedForCreate: false,
    };
  }

  if (existingEntry?.createPromise) {
    const created = await existingEntry.createPromise;
    return {
      cacheKey,
      cacheName: created.cacheName,
      cacheTokenCount: created.cacheTokenCount,
      promptHash,
      reusedExisting: true,
      waitedForCreate: true,
    };
  }

  if (existingEntry?.failedUntilMs && existingEntry.failedUntilMs > now) {
    throw new Error('Gemini prompt cache creation is in cooldown after a previous failure.');
  }

  const persistentEntry = await loadPersistentPromptCache(cacheKey);
  if (persistentEntry) {
    promptCacheEntries.set(cacheKey, persistentEntry);
    return {
      cacheKey,
      cacheName: persistentEntry.cacheName as string,
      cacheTokenCount: persistentEntry.cacheTokenCount,
      promptHash,
      reusedExisting: true,
      waitedForCreate: false,
    };
  }

  const createPromise = createGeminiPromptCache(input, ttlSeconds);
  promptCacheEntries.set(cacheKey, {
    ...(existingEntry || {}),
    createPromise,
    expiresAtMs: 0,
    updatedAtMs: now,
    warmStartedAtMs: now,
  });

  try {
    const created = await createPromise;
    promptCacheEntries.set(cacheKey, {
      cacheName: created.cacheName,
      cacheTokenCount: created.cacheTokenCount,
      createDurationMs: created.createDurationMs,
      createdAtMs: Date.now(),
      expiresAtMs: created.expiresAtMs,
      updatedAtMs: Date.now(),
    });
    await persistPromptCache({
      agentType: input.agentType,
      cacheKey,
      created,
      model: input.model,
      promptHash,
    });

    return {
      cacheKey,
      cacheName: created.cacheName,
      cacheTokenCount: created.cacheTokenCount,
      promptHash,
      reusedExisting: false,
      waitedForCreate: false,
    };
  } catch (error) {
    promptCacheEntries.set(cacheKey, {
      expiresAtMs: 0,
      failedUntilMs: Date.now() + readFailureCooldownSeconds() * 1000,
      lastError: error instanceof Error ? error.message : String(error),
      updatedAtMs: Date.now(),
    });
    throw error;
  }
}

function promptCacheEntryFromPersistentRow(row: PersistentPromptCacheRow): PromptCacheEntry | null {
  const cacheName = String(row.cache_name || '');
  const expiresAtMs = Date.parse(String(row.expires_at || ''));

  if (!cacheName || !Number.isFinite(expiresAtMs)) {
    return null;
  }

  const cacheTokenCount = Number(row.cache_token_count);
  const createDurationMs = Number(row.create_duration_ms);
  const createdAtMs = Date.parse(String(row.created_at || ''));
  const updatedAtMs = Date.parse(String(row.updated_at || ''));

  return {
    cacheName,
    cacheTokenCount: Number.isFinite(cacheTokenCount) ? cacheTokenCount : undefined,
    createDurationMs: Number.isFinite(createDurationMs) ? createDurationMs : undefined,
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : undefined,
    expiresAtMs,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : undefined,
  };
}

async function loadPersistentPromptCache(cacheKey: string): Promise<PromptCacheEntry | null> {
  try {
    const result = await getDb().execute({
      sql: `SELECT *
            FROM gemini_prompt_caches
            WHERE cache_key = ?
              AND unixepoch(expires_at) > unixepoch('now') + ?
            LIMIT 1`,
      args: [cacheKey, Math.ceil(CACHE_EXPIRY_SAFETY_WINDOW_MS / 1000)],
    });
    const row = result.rows[0] as unknown as PersistentPromptCacheRow | undefined;
    if (!row) {
      await deletePersistentPromptCache(cacheKey);
      return null;
    }

    return promptCacheEntryFromPersistentRow(row);
  } catch (error) {
    console.warn('Could not load persisted Gemini prompt cache; creating a new cache if needed.', {
      cacheKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function loadPersistentPromptCacheRows(): Promise<PersistentPromptCacheRow[]> {
  try {
    const result = await getDb().execute({
      sql: `SELECT *
            FROM gemini_prompt_caches
            WHERE unixepoch(expires_at) > unixepoch('now') + ?
            ORDER BY updated_at DESC`,
      args: [Math.ceil(CACHE_EXPIRY_SAFETY_WINDOW_MS / 1000)],
    });
    return result.rows as unknown as PersistentPromptCacheRow[];
  } catch (error) {
    console.warn('Could not read persisted Gemini prompt cache diagnostics.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function persistPromptCache(input: {
  agentType: AgentType;
  cacheKey: string;
  created: PromptCacheCreated;
  model: string;
  promptHash: string;
}): Promise<void> {
  try {
    await getDb().execute({
      sql: `INSERT INTO gemini_prompt_caches (
              cache_key,
              model,
              agent_type,
              prompt_hash,
              cache_name,
              cache_token_count,
              create_duration_ms,
              expires_at,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(cache_key) DO UPDATE SET
              model = excluded.model,
              agent_type = excluded.agent_type,
              prompt_hash = excluded.prompt_hash,
              cache_name = excluded.cache_name,
              cache_token_count = excluded.cache_token_count,
              create_duration_ms = excluded.create_duration_ms,
              expires_at = excluded.expires_at,
              updated_at = datetime('now')`,
      args: [
        input.cacheKey,
        input.model,
        input.agentType,
        input.promptHash,
        input.created.cacheName,
        input.created.cacheTokenCount ?? null,
        input.created.createDurationMs,
        new Date(input.created.expiresAtMs).toISOString(),
      ],
    });
  } catch (error) {
    console.warn('Could not persist Gemini prompt cache; in-memory cache remains active.', {
      agentType: input.agentType,
      error: error instanceof Error ? error.message : String(error),
      model: input.model,
      promptHash: input.promptHash.slice(0, 12),
    });
  }
}

async function deletePersistentPromptCache(cacheKey: string): Promise<void> {
  try {
    await getDb().execute({
      sql: 'DELETE FROM gemini_prompt_caches WHERE cache_key = ?',
      args: [cacheKey],
    });
  } catch (error) {
    console.warn('Could not delete persisted Gemini prompt cache.', {
      cacheKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function createGeminiPromptCache(
  input: PromptCacheRequest,
  ttlSeconds: number,
): Promise<PromptCacheCreated> {
  const startedAtMs = Date.now();
  const timeoutMs = readCacheCreateTimeoutMs();
  const abortController = new AbortController();

  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  let cache: CachedContent;
  try {
    cache = await input.ai.caches.create({
      model: input.model,
      config: {
        abortSignal: abortController.signal,
        displayName: `smart-invoice-${input.agentType}-${getGeminiPromptHash(input.prompt).slice(0, 12)}`,
        httpOptions: {
          retryOptions: { attempts: 1 },
          timeout: timeoutMs,
        },
        contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
        ttl: `${ttlSeconds}s`,
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!cache.name) {
    throw new Error('Gemini did not return a cached content name.');
  }

  return {
    cacheName: cache.name,
    cacheTokenCount: cache.usageMetadata?.totalTokenCount,
    createDurationMs: Date.now() - startedAtMs,
    expiresAtMs: Date.now() + ttlSeconds * 1000,
  };
}
