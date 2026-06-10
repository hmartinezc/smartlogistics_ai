import type { InvoiceData } from '../types';

const HAWB_PATTERN_SLOT = /X/g;
const HAWB_ALLOWED_PATTERN = /^[X\s./-]+$/i;
const HAWB_PATTERN_CONFIDENCE_CAP = 70;
const HAWB_PATTERN_REASON_CODE = 'OCR_UNCERTAIN';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function countPatternSlots(pattern: string): number {
  return pattern.match(HAWB_PATTERN_SLOT)?.length ?? 0;
}

function compactAirwaybill(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function applyPattern(value: string, pattern: string): string | null {
  const slots = countPatternSlots(pattern);
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

  const compact = compactAirwaybill(trimmed);
  if (!compact) {
    return trimmed;
  }

  return applyPattern(compact, safePattern) ?? trimmed;
}

function getHawbPatternLengthMismatch(
  value: string,
  pattern: string | null | undefined,
): { actualLength: number; expectedLength: number } | null {
  const safePattern = sanitizeHawbFormatPattern(pattern);
  if (!safePattern) {
    return null;
  }

  const compact = compactAirwaybill(value);
  if (!compact) {
    return null;
  }

  const expectedLength = countPatternSlots(safePattern);
  return compact.length === expectedLength
    ? null
    : { actualLength: compact.length, expectedLength };
}

function buildHawbPatternReason(mismatch: { actualLength: number; expectedLength: number }) {
  return {
    code: HAWB_PATTERN_REASON_CODE,
    penalty: 30,
    message: `HAWB length does not match the configured agency pattern (${mismatch.actualLength}/${mismatch.expectedLength}). Review the HAWB; an OCR zero may be missing.`,
  };
}

function addHawbPatternReason(
  reasons: unknown,
  mismatch: { actualLength: number; expectedLength: number },
): unknown[] {
  const currentReasons = Array.isArray(reasons) ? reasons : [];
  let replaced = false;
  const hawbReason = buildHawbPatternReason(mismatch);
  const nextReasons = currentReasons.map((reason) => {
    if (!replaced && isRecord(reason) && reason.code === HAWB_PATTERN_REASON_CODE) {
      replaced = true;
      return hawbReason;
    }

    return reason;
  });

  return replaced ? nextReasons : [...nextReasons, hawbReason];
}

function addReasonCode(codes: unknown, code: typeof HAWB_PATTERN_REASON_CODE): string[] {
  const currentCodes = Array.isArray(codes) ? codes.map(String) : [];
  return currentCodes.includes(code) ? currentCodes : [...currentCodes, code];
}

function applyHawbPatternConfidenceGuard<T extends Record<string, unknown>>(
  value: T,
  pattern: string | null | undefined,
): T {
  if (
    typeof value.hawb !== 'string' ||
    typeof value.confidenceScore !== 'number' ||
    !Number.isFinite(value.confidenceScore)
  ) {
    return value;
  }

  const mismatch = getHawbPatternLengthMismatch(value.hawb, pattern);
  if (!mismatch) {
    return value;
  }

  const confidenceScore = Math.min(value.confidenceScore, HAWB_PATTERN_CONFIDENCE_CAP);
  const confidenceAudit = isRecord(value.confidenceAudit)
    ? {
        ...value.confidenceAudit,
        acceptedReasonCodes: addReasonCode(
          value.confidenceAudit.acceptedReasonCodes,
          HAWB_PATTERN_REASON_CODE,
        ),
        backendReasonCodes: addReasonCode(
          value.confidenceAudit.backendReasonCodes,
          HAWB_PATTERN_REASON_CODE,
        ),
        backendScore:
          typeof value.confidenceAudit.backendScore === 'number'
            ? Math.min(value.confidenceAudit.backendScore, HAWB_PATTERN_CONFIDENCE_CAP)
            : HAWB_PATTERN_CONFIDENCE_CAP,
        finalScore: confidenceScore,
      }
    : value.confidenceAudit;

  return {
    ...value,
    ...(confidenceAudit === undefined ? {} : { confidenceAudit }),
    confidenceReasons: addHawbPatternReason(value.confidenceReasons, mismatch),
    confidenceScore,
  };
}

export function normalizeInvoiceDataAirwaybills(
  invoiceData: InvoiceData,
  options: { hawbPattern?: string | null | undefined } = {},
): InvoiceData {
  const normalizedMawb = normalizeMawbForInitialSave(invoiceData.mawb || '');
  const normalizedHawb = normalizeHawbForInitialSave(invoiceData.hawb || '', options.hawbPattern);
  const normalizedInvoice =
    normalizedMawb === invoiceData.mawb && normalizedHawb === invoiceData.hawb
      ? invoiceData
      : {
          ...invoiceData,
          mawb: normalizedMawb,
          hawb: normalizedHawb,
        };

  return applyHawbPatternConfidenceGuard(
    normalizedInvoice as unknown as Record<string, unknown>,
    options.hawbPattern,
  ) as unknown as InvoiceData;
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

  const normalizedValue =
    nextMawb === value.mawb && nextHawb === value.hawb
      ? value
      : {
          ...value,
          ...(typeof value.mawb === 'string' ? { mawb: nextMawb } : {}),
          ...(typeof value.hawb === 'string' ? { hawb: nextHawb } : {}),
        };

  return applyHawbPatternConfidenceGuard(normalizedValue, options.hawbPattern);
}
