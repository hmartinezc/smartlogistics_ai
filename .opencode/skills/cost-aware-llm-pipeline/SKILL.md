---
name: cost-aware-llm-pipeline
description: Optimize Gemini API costs WITHOUT changing the extraction model. Use when building or modifying AI extraction pipelines, batch processing, or when API costs are increasing. Covers caching, prompt optimization, batching, retry logic, and cost tracking. The current model (gemini-3-flash-preview) is proven for PDF invoice extraction and should NOT be downgraded.
license: MIT
metadata:
  author: smart-logistics
  version: '1.1.0'
---

# Cost-Aware LLM Pipeline

Strategies to minimize Gemini API costs while maintaining extraction quality in this project.

## Current Project Context

This project uses **Gemini Flash 3** (`gemini-3-flash-preview`) for invoice data extraction via `services/geminiService.ts` and `server/routes/ai.ts`. The configuration is in `config.ts`:

```typescript
AI_CONFIG = {
  MODEL_ID: 'gemini-3-flash-preview', // Proven for PDF invoice extraction
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  MAX_PARALLEL_BATCH_REQUESTS: 5,
};
```

## IMPORTANT: Do Not Change the Extraction Model

`gemini-3-flash-preview` has been validated to produce excellent results for PDF invoice extraction in this project. **This model should NOT be downgraded or swapped** for cost reasons unless it starts failing consistently on production invoices.

> Quality of extraction is the core value of this application. Saving cents on API calls is not worth losing extraction accuracy on financial data.

All cost optimization in this skill focuses on strategies **around** the model, never on replacing it.

## Cost Optimization Strategies

### 1. Response Caching (Highest Impact)

The biggest waste is re-processing the same PDF file. Cache extraction results by file hash:

```typescript
// server/cache.ts
import { createHash } from 'crypto';

const extractionCache = new Map<string, { data: InvoiceData; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function computeFileHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function getCachedExtraction(fileHash: string): InvoiceData | null {
  const cached = extractionCache.get(fileHash);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  return null;
}

export function setCachedExtraction(fileHash: string, data: InvoiceData): void {
  extractionCache.set(fileHash, { data, timestamp: Date.now() });
}
```

Integrate in `server/routes/ai.ts`:

```typescript
// Before calling Gemini, check cache
const fileHash = computeFileHash(fileBuffer);
const cached = getCachedExtraction(fileHash);
if (cached) {
  return c.json({ invoiceData: cached, cached: true });
}

// After successful extraction, store in cache
const result = await extractInvoiceData(fileBuffer, agentType);
setCachedExtraction(fileHash, result);
return c.json({ invoiceData: result, cached: false });
```

**When NOT to cache:**

- User-edited extractions (the edited version is the truth, not the AI output).
- Files with the same hash but different agent types selected (cache key should include agent type).

**Improved cache key:**

```typescript
const cacheKey = `${fileHash}:${agentType}:${AI_CONFIG.MODEL_ID}`;
```

### 2. Prompt Optimization (Token Savings)

Every token in the prompt costs money. Audit `buildExtractionPrompt()` in `services/agentPrompts.ts`:

**What to optimize:**

- Remove redundant instructions across knowledge base sections.
- Consolidate repeated rules into a single section.
- Remove verbose examples if the model already understands the pattern.
- Use `responseMimeType: 'application/json'` in Gemini config to force JSON output without verbose "return JSON" instructions in the prompt.

**Token counting helper:**

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function countTokens(prompt: string, modelId: string): Promise<number> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: modelId });
  const result = await model.countTokens(prompt);
  return result.totalTokens;
}

// Usage: log before every extraction
const tokenCount = await countTokens(prompt, AI_CONFIG.MODEL_ID);
console.log(`Extraction prompt: ${tokenCount} tokens`);
```

**Target:** If your prompt exceeds 4,000 tokens, review for redundancy. Most invoice extractions should fit in 1,500-3,000 tokens.

### 3. Batching & Concurrency Control

The current `MAX_PARALLEL_BATCH_REQUESTS: 5` is reasonable, but monitor for rate limits:

```typescript
async function processBatchWithLimit(
  files: { buffer: Buffer; agentType: AgentType }[],
  limit: number = AI_CONFIG.MAX_PARALLEL_BATCH_REQUESTS,
): Promise<InvoiceData[]> {
  const results: InvoiceData[] = [];

  for (let i = 0; i < files.length; i += limit) {
    const batch = files.slice(i, i + limit);
    const batchResults = await Promise.all(
      batch.map(({ buffer, agentType }) => extractInvoiceData(buffer, agentType)),
    );
    results.push(...batchResults);

    // Add small delay between batches to avoid rate limits
    if (i + limit < files.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}
```

**If you hit rate limits:** Reduce `MAX_PARALLEL_BATCH_REQUESTS` to 3 and increase the inter-batch delay to 1 second.

### 4. Retry Logic with Exponential Backoff

Current retry config is linear (`RETRY_DELAY_MS: 1000`). Upgrade to exponential backoff to reduce retry storms:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (attempt === maxRetries) throw error;

      // Exponential backoff: 1s, 2s, 4s
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}
```

**When NOT to retry:**

- Invalid API key errors (retrying won't help).
- Malformed request errors (fix the code first).
- Only retry on rate limits (`429`) and transient server errors (`5xx`).

### 5. Cost Tracking & Telemetry

Add cost telemetry to monitor spending per extraction:

```typescript
// server/costTracker.ts
interface CostEntry {
  timestamp: number;
  agencyId: string;
  agentType: AgentType;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUSD: number;
  fileName?: string;
  cached: boolean;
}

// Gemini pricing (approximate, check Google AI Studio pricing page for current rates)
const PRICING_PER_1K: Record<string, { input: number; output: number }> = {
  'gemini-3-flash-preview': { input: 0.000075, output: 0.0003 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'gemini-2.0-flash-lite': { input: 0.000075, output: 0.0003 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
};

export function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING_PER_1K[modelId];
  if (!pricing) return 0;
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

// Log after each extraction
export function logExtractionCost(entry: CostEntry): void {
  console.log(
    `[COST] ${entry.agentType} | ${entry.inputTokens} in / ${entry.outputTokens} out | $${entry.estimatedCostUSD.toFixed(6)} | cached=${entry.cached}`,
  );
  // In production, store in database or send to monitoring
}
```

**Integration in `server/routes/ai.ts`:**

```typescript
// After extraction
const cost = estimateCost(
  AI_CONFIG.MODEL_ID,
  usageMetadata.promptTokenCount,
  usageMetadata.candidatesTokenCount,
);

logExtractionCost({
  timestamp: Date.now(),
  agencyId: c.get('agencyId'),
  agentType,
  modelId: AI_CONFIG.MODEL_ID,
  inputTokens: usageMetadata.promptTokenCount,
  outputTokens: usageMetadata.candidatesTokenCount,
  estimatedCostUSD: cost,
  cached: false,
});
```

### 6. Avoid Unnecessary Extractions

**Pre-validation before AI call:**

- Check file type: only process PDFs and images. Reject unsupported formats before calling Gemini.
- Check file size: if a PDF exceeds 20MB, it's likely a multi-document scan. Warn the user or split it.
- Check for empty files: verify the file has content before extraction.

```typescript
function validateBeforeExtraction(file: File): { valid: boolean; reason?: string } {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, reason: `Unsupported file type: ${file.type}` };
  }
  if (file.size > 20 * 1024 * 1024) {
    return { valid: false, reason: 'File exceeds 20MB limit' };
  }
  return { valid: true };
}
```

## Quick Wins (Implement Today)

1. **Add file hash caching** — biggest impact, prevents re-processing identical files.
2. **Log token usage** per extraction — visibility into where money goes.
3. **Strip whitespace from prompts** — `buildExtractionPrompt()` may have extra newlines.
4. **Add exponential backoff** — replaces linear retry, reduces retry costs.
5. **Validate files before extraction** — reject bad inputs before paying for an API call.

## When to Consider a Different Model

Only consider changing the model if ALL of these are true:

1. `gemini-3-flash-preview` consistently fails on specific invoice types (not one-off errors).
2. The failures are verified across 10+ real invoices from production.
3. The failures are not fixable with prompt improvements.
4. The cost of wrong extractions (manual correction time) exceeds the API cost difference.

**If all above are true:** Test `gemini-1.5-pro` on the failing subset only, using the same prompts. Compare accuracy side-by-side before switching.

## Anti-Patterns (Don't Do These)

- Do NOT downgrade to `gemini-2.0-flash` just to save money if Flash 3 is working well.
- Do NOT remove validation logic from prompts to save tokens — accuracy matters more.
- Do NOT skip retries entirely — transient failures are common and cheap to retry.
- Do NOT process the same file twice because of missing cache logic.
