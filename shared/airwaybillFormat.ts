import type { InvoiceData } from '../types';

const HAWB_PATTERN_SLOT = /X/g;
const HAWB_ALLOWED_PATTERN = /^[X\s./-]+$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function applyPattern(value: string, pattern: string): string | null {
  const slots = pattern.match(HAWB_PATTERN_SLOT)?.length ?? 0;
  if (slots === 0 || value.length !== slots) {
    return null;
  }

  let cursor = 0;
  return pattern.replace(HAWB_PATTERN_SLOT, () => value[cursor++] ?? '');
}

export function sanitizeHawbFormatPattern(pattern: string | null | undefined): string | null {
  if (typeof pattern !== 'string') {
    return null;
  }

  const normalized = pattern.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  if (!HAWB_ALLOWED_PATTERN.test(normalized) || !normalized.includes('X')) {
    return null;
  }

  return normalized;
}

export function normalizeMawbForInitialSave(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length !== 11) {
    return trimmed;
  }

  return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 7)}-${digitsOnly.slice(7)}`;
}

export function normalizeHawbForInitialSave(
  value: string,
  pattern: string | null | undefined,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const safePattern = sanitizeHawbFormatPattern(pattern);
  if (!safePattern) {
    return trimmed;
  }

  const compact = trimmed.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!compact) {
    return trimmed;
  }

  return applyPattern(compact, safePattern) ?? trimmed;
}

export function normalizeInvoiceDataAirwaybills(
  invoiceData: InvoiceData,
  options: { hawbPattern?: string | null | undefined } = {},
): InvoiceData {
  const normalizedMawb = normalizeMawbForInitialSave(invoiceData.mawb || '');
  const normalizedHawb = normalizeHawbForInitialSave(invoiceData.hawb || '', options.hawbPattern);

  if (normalizedMawb === invoiceData.mawb && normalizedHawb === invoiceData.hawb) {
    return invoiceData;
  }

  return {
    ...invoiceData,
    mawb: normalizedMawb,
    hawb: normalizedHawb,
  };
}

export function maybeNormalizeInvoiceDataAirwaybills(
  value: unknown,
  options: { hawbPattern?: string | null | undefined } = {},
): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const nextMawb =
    typeof value.mawb === 'string' ? normalizeMawbForInitialSave(value.mawb) : value.mawb;
  const nextHawb =
    typeof value.hawb === 'string'
      ? normalizeHawbForInitialSave(value.hawb, options.hawbPattern)
      : value.hawb;

  if (nextMawb === value.mawb && nextHawb === value.hawb) {
    return value;
  }

  return {
    ...value,
    ...(typeof value.mawb === 'string' ? { mawb: nextMawb } : {}),
    ...(typeof value.hawb === 'string' ? { hawb: nextHawb } : {}),
  };
}
