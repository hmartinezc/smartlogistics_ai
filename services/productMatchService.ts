import { api } from './apiClient';
import {
  BatchItem,
  ExportInvoiceData,
  ExportInvoiceItem,
  InvoiceData,
  ProductMatchCatalogItem,
  ProductMatchExport,
} from '../types';

export interface EnrichedBatchExportItem {
  item: BatchItem;
  data: ExportInvoiceData;
}

export interface EnrichedBatchExportResult {
  items: EnrichedBatchExportItem[];
  missingMatches: number;
}

export interface BatchExportDocument extends ExportInvoiceData {
  filename: string;
  processedAt?: string;
}

const EMPTY_MATCH: ProductMatchExport = {
  clientProductCode: '',
  clientProductDescription: '',
  htsMatch: '',
};

export function normalizeProductMatchKey(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function buildAgencyLookup(items: ProductMatchCatalogItem[]): Map<string, ProductMatchCatalogItem> {
  const lookup = new Map<string, ProductMatchCatalogItem>();

  items.forEach((item) => {
    const key = normalizeProductMatchKey(item.product);
    if (!key || lookup.has(key)) {
      return;
    }

    lookup.set(key, item);
  });

  return lookup;
}

export function enrichInvoiceDataWithMatches(
  invoiceData: InvoiceData,
  lookup?: Map<string, ProductMatchCatalogItem>,
): { data: ExportInvoiceData; missingMatches: number } {
  let missingMatches = 0;

  const lineItems: ExportInvoiceItem[] = invoiceData.lineItems.map((lineItem) => {
    const matchRecord = lookup?.get(normalizeProductMatchKey(lineItem.productDescription));
    if (!matchRecord) {
      missingMatches += 1;
    }

    return {
      ...lineItem,
      match: matchRecord
        ? {
            clientProductCode: matchRecord.clientProductCode,
            clientProductDescription: matchRecord.productMatch,
            htsMatch: matchRecord.htsMatch,
          }
        : EMPTY_MATCH,
    };
  });

  return {
    data: {
      ...invoiceData,
      lineItems,
    },
    missingMatches,
  };
}

export async function enrichBatchItemsForExport(
  batchItems: BatchItem[],
): Promise<EnrichedBatchExportResult> {
  const uniqueAgencyIds = Array.from(
    new Set(
      batchItems
        .map((item) => item.agencyId)
        .filter((agencyId): agencyId is string => Boolean(agencyId) && agencyId !== 'GLOBAL'),
    ),
  );

  const lookups = new Map<string, Map<string, ProductMatchCatalogItem>>();

  await Promise.all(
    uniqueAgencyIds.map(async (agencyId) => {
      const catalog = await api.getProductMatches(agencyId);
      lookups.set(agencyId, buildAgencyLookup(catalog));
    }),
  );

  let missingMatches = 0;
  const items: EnrichedBatchExportItem[] = [];

  batchItems.forEach((item) => {
    if (!item.result) {
      return;
    }

    const lookup = item.agencyId ? lookups.get(item.agencyId) : undefined;
    const enriched = enrichInvoiceDataWithMatches(item.result, lookup);
    missingMatches += enriched.missingMatches;
    items.push({ item, data: enriched.data });
  });

  return { items, missingMatches };
}

export function buildBatchExportDocuments(
  exportItems: EnrichedBatchExportItem[],
): BatchExportDocument[] {
  return exportItems.map(({ item, data }) => ({
    filename: item.fileName,
    processedAt: item.processedAt,
    ...data,
  }));
}

export function buildAwbExportFilename(awb: string): string {
  const awbSuffix = awb.replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `TCBV_SESSION_EXPORT_${awbSuffix}_${new Date().getTime()}.json`;
}
