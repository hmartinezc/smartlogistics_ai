import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Client, InStatement } from '@libsql/client';

export type ProductMatchMasterRow = {
  id: string;
  product: string;
  clientProductCode: string;
  productMatch: string;
  htsMatch: string;
  sourceOrder: number;
};

const MASTER_DATA_PATH = resolve(process.cwd(), 'server', 'product-match-master.tsv');

function normalizeCell(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildRowId(sourceOrder: number): string {
  return `PMMASTER_${String(sourceOrder).padStart(6, '0')}`;
}

function buildRowSignature(row: Omit<ProductMatchMasterRow, 'id' | 'sourceOrder'>): string {
  return [
    row.product,
    row.clientProductCode,
    row.productMatch,
    row.htsMatch,
  ].map((value) => value.toLowerCase()).join('|');
}

export function loadProductMatchMasterRows(): ProductMatchMasterRow[] {
  const rawData = readFileSync(MASTER_DATA_PATH, 'utf8');
  const lines = rawData
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const dataLines = lines.slice(1);

  const parsedRows = dataLines
    .map((line, index) => {
      const [productRaw = '', clientProductCodeRaw = '', productMatchRaw = '', htsMatchRaw = ''] = line.split('\t');
      const sourceOrder = index + 1;
      const product = normalizeCell(productRaw);

      if (!product) {
        return null;
      }

      return {
        id: buildRowId(sourceOrder),
        product,
        clientProductCode: normalizeCell(clientProductCodeRaw),
        productMatch: normalizeCell(productMatchRaw),
        htsMatch: normalizeCell(htsMatchRaw),
        sourceOrder,
      } satisfies ProductMatchMasterRow;
    })
    .filter((row): row is ProductMatchMasterRow => row !== null);

  const seenSignatures = new Set<string>();
  const dedupedRows: ProductMatchMasterRow[] = [];

  for (const row of parsedRows) {
    const signature = buildRowSignature(row);
    if (seenSignatures.has(signature)) {
      continue;
    }

    seenSignatures.add(signature);
    dedupedRows.push(row);
  }

  return dedupedRows;
}

export async function ensureProductMatchMasterSeed(db: Client): Promise<void> {
  const existingCountResult = await db.execute('SELECT COUNT(*) as count FROM product_match_master');
  const existingCount = Number(existingCountResult.rows[0]?.count ?? 0);

  if (existingCount === 0) {
    const rows = loadProductMatchMasterRows();

    if (rows.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const statements: InStatement[] = rows.map((row) => ({
      sql: `
        INSERT INTO product_match_master (
          id,
          product,
          client_product_code,
          product_match,
          hts_match,
          source_order,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        row.id,
        row.product,
        row.clientProductCode,
        row.productMatch,
        row.htsMatch,
        row.sourceOrder,
        now,
        now,
      ],
    }));

    await db.batch(statements, 'write');
    console.log(`✅ Catalogo maestro de match productos cargado: ${rows.length} filas base.`);
  }

  const cleanupResult = await db.execute(`
    DELETE FROM product_match_master
    WHERE EXISTS (
      SELECT 1
      FROM product_match_master previous
      WHERE lower(trim(previous.product)) = lower(trim(product_match_master.product))
        AND lower(trim(previous.client_product_code)) = lower(trim(product_match_master.client_product_code))
        AND lower(trim(previous.product_match)) = lower(trim(product_match_master.product_match))
        AND lower(trim(previous.hts_match)) = lower(trim(product_match_master.hts_match))
        AND previous.source_order < product_match_master.source_order
    )
  `);

  const removedExactDuplicates = Number(cleanupResult.rowsAffected ?? 0);
  if (removedExactDuplicates > 0) {
    console.log(`✅ Catalogo maestro depurado: ${removedExactDuplicates} filas duplicadas exactas eliminadas.`);
  }
}
