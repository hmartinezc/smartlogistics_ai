import { GoogleGenerativeAI } from '@google/generative-ai';
import { AI_CONFIG, ERROR_MESSAGES } from '../../config.js';
import { buildExtractionPrompt } from '../../services/agentPrompts.js';
import { invoiceExtractionSchema } from '../../shared/extractionSchema.js';
import type { AgentType, InvoiceData } from '../../types.js';

export interface ExtractInvoiceFromBufferInput {
  buffer: Buffer;
  mimeType?: string;
  format?: string;
}

const ALLOWED_AGENT_TYPES = new Set<AgentType>([
  'AGENT_TCBV',
  'AGENT_GENERIC_A',
  'AGENT_GENERIC_B',
  'AGENT_CUSTOMS',
]);

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

export async function extractInvoiceFromBuffer(
  input: ExtractInvoiceFromBufferInput,
): Promise<InvoiceData> {
  const format = normalizeAgentType(input.format);
  const prompt = buildExtractionPrompt(format);
  const genAI = new GoogleGenerativeAI(getGeminiApiKey());
  const model = genAI.getGenerativeModel({
    model: AI_CONFIG.MODEL_ID,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: invoiceExtractionSchema,
    },
  });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: input.mimeType || 'application/pdf',
        data: input.buffer.toString('base64'),
      },
    },
    { text: prompt },
  ]);

  const text = result.response.text();
  if (!text) {
    throw new Error('No se recibió respuesta del modelo.');
  }

  const parsed: unknown = JSON.parse(text);
  if (!isInvoiceData(parsed)) {
    throw new Error('La respuesta del modelo no cumple el esquema esperado.');
  }

  return parsed;
}
