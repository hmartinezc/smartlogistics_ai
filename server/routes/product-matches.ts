import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import type {
  PendingProductMatchCreateInput,
  PendingProductMatchExample,
  PendingProductMatchItem,
} from '../../types.js';

import { getDb } from '../db.js';
import { ensureAgencyAccess, requireAuth } from '../security.js';
import type { AuthUser } from '../security.js';

const productMatches = new Hono();

const VISIBLE_TEMPLATE_HEADERS = [
  'Descripción Product',
  'Código producto cliente',
  'Descripción producto cliente',
  'HTS Match',
];
const VISIBLE_TEMPLATE_EXAMPLE = ['Rosa Roja', 'FLR-001', 'Rosa Roja Premium', '0603.11.00.10'];

const HEADER_ALIASES: Record<string, string[]> = {
  product: ['product', 'descripcion product', 'descripcion producto'],
  clientProductCode: ['client_product_code', 'codigo producto cliente', 'codigo cliente'],
  productMatch: ['product_match', 'descripcion producto cliente', 'descripcion cliente'],
  htsMatch: ['hts_match', 'hts match'],
  category: ['category', 'categoria'],
  hts: ['hts'],
};

function normalizeHeader(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function findHeaderIndex(headers: string[], key: keyof typeof HEADER_ALIASES): number {
  const aliases = HEADER_ALIASES[key];
  return headers.findIndex((header) => aliases.includes(header));
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildProductMatch(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    agencyId: String(row.agency_id),
    category: String(row.category || ''),
    product: String(row.product || ''),
    clientProductCode: String(row.client_product_code || ''),
    productMatch: String(row.product_match || ''),
    hts: String(row.hts || ''),
    htsMatch: String(row.hts_match || ''),
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

type MasterBootstrapCandidate = {
  product: string;
  clientProductCode: string;
  productMatch: string;
  htsMatch: string;
};

type PendingProductAccumulator = {
  key: string;
  product: string;
  occurrenceCount: number;
  invoiceIds: Set<string>;
  htsCounts: Map<string, number>;
  latestProcessedAt?: string;
  latestTimestamp: number;
  examples: PendingProductMatchExample[];
};

const MAX_PENDING_PRODUCT_EXAMPLES = 5;
const MAX_PENDING_BATCH_ITEMS = 2000;
const MAX_PENDING_HTS_CANDIDATES = 10;
const MAX_PENDING_PRODUCT_LENGTH = 240;
const MAX_PENDING_CLIENT_CODE_LENGTH = 120;
const MAX_PENDING_PRODUCT_MATCH_LENGTH = 240;
const MAX_PENDING_HTS_LENGTH = 60;
const MAX_PRODUCT_MATCH_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PRODUCT_MATCH_IMPORT_ROWS = 5000;
const MAX_PENDING_LINE_ITEMS_PER_INVOICE = 200;
const MAX_PENDING_TOTAL_LINE_ITEMS = 10000;
const MAX_PENDING_RETURN_ITEMS = 500;
const MAX_PENDING_DISPLAY_TEXT_LENGTH = 180;

function normalizeProductKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildMasterCandidate(row: Record<string, unknown>): MasterBootstrapCandidate {
  return {
    product: asText(row.product),
    clientProductCode: asText(row.client_product_code),
    productMatch: asText(row.product_match),
    htsMatch: asText(row.hts_match),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(String(value));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function toTimestamp(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function exceedsMaxLength(value: string, maxLength: number): boolean {
  return value.length > maxLength;
}

function hasProductMatchFieldLengthError(fields: {
  product: string;
  clientProductCode: string;
  productMatch: string;
  hts: string;
  htsMatch: string;
}): boolean {
  return (
    exceedsMaxLength(fields.product, MAX_PENDING_PRODUCT_LENGTH) ||
    exceedsMaxLength(fields.clientProductCode, MAX_PENDING_CLIENT_CODE_LENGTH) ||
    exceedsMaxLength(fields.productMatch, MAX_PENDING_PRODUCT_MATCH_LENGTH) ||
    exceedsMaxLength(fields.hts, MAX_PENDING_HTS_LENGTH) ||
    exceedsMaxLength(fields.htsMatch, MAX_PENDING_HTS_LENGTH)
  );
}

function clampText(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}

function getCompactVarietyProduct(value: string): string {
  const match = value.match(/^(.*?)\s*:\s*-?\d+(?:[.,]\d+)?\s*$/);
  return match ? match[1].trim() : '';
}

function buildPendingProductMatches(
  rows: Record<string, unknown>[],
  matchedKeys: Set<string>,
): { items: PendingProductMatchItem[]; truncated: boolean } {
  const pendingByKey = new Map<string, PendingProductAccumulator>();
  let processedLineItems = 0;
  let truncated = false;

  rowLoop: for (const row of rows) {
    const parsedResult = parseJsonRecord(row.result_json);
    const lineItems = parsedResult?.lineItems;
    if (!Array.isArray(lineItems)) {
      continue;
    }

    const batchItemId = asText(row.id);
    const fileName = clampText(asText(row.file_name), MAX_PENDING_DISPLAY_TEXT_LENGTH);
    const invoiceNumber = clampText(
      asText(parsedResult?.invoiceNumber),
      MAX_PENDING_DISPLAY_TEXT_LENGTH,
    );
    const hawb = clampText(asText(parsedResult?.hawb), MAX_PENDING_DISPLAY_TEXT_LENGTH);
    const processedAt = asText(row.processed_at) || asText(row.created_at) || undefined;
    const processedTimestamp = toTimestamp(processedAt);

    if (lineItems.length > MAX_PENDING_LINE_ITEMS_PER_INVOICE) {
      truncated = true;
    }

    for (const rawLineItem of lineItems.slice(0, MAX_PENDING_LINE_ITEMS_PER_INVOICE)) {
      if (processedLineItems >= MAX_PENDING_TOTAL_LINE_ITEMS) {
        truncated = true;
        break rowLoop;
      }

      processedLineItems += 1;

      if (!isRecord(rawLineItem)) {
        continue;
      }

      const hts = clampText(asText(rawLineItem.hts), MAX_PENDING_HTS_LENGTH);
      const addPendingProduct = (rawProduct: string, rawExampleText = rawProduct) => {
        if (!rawProduct) {
          return;
        }

        if (exceedsMaxLength(rawProduct, MAX_PENDING_PRODUCT_LENGTH)) {
          truncated = true;
          return;
        }

        const normalizedKey = normalizeProductKey(rawProduct);
        if (!normalizedKey || matchedKeys.has(normalizedKey)) {
          return;
        }

        const productDescription = clampText(rawExampleText, MAX_PENDING_DISPLAY_TEXT_LENGTH);
        let pendingItem = pendingByKey.get(normalizedKey);

        if (!pendingItem) {
          pendingItem = {
            key: normalizedKey,
            product: rawProduct,
            occurrenceCount: 0,
            invoiceIds: new Set<string>(),
            htsCounts: new Map<string, number>(),
            latestProcessedAt: processedAt,
            latestTimestamp: processedTimestamp,
            examples: [],
          };
          pendingByKey.set(normalizedKey, pendingItem);
        }

        pendingItem.occurrenceCount += 1;
        if (batchItemId) {
          pendingItem.invoiceIds.add(batchItemId);
        }

        if (hts) {
          pendingItem.htsCounts.set(hts, (pendingItem.htsCounts.get(hts) || 0) + 1);
        }

        if (processedTimestamp > pendingItem.latestTimestamp) {
          pendingItem.latestTimestamp = processedTimestamp;
          pendingItem.latestProcessedAt = processedAt;
          pendingItem.product = rawProduct;
        }

        if (pendingItem.examples.length < MAX_PENDING_PRODUCT_EXAMPLES) {
          pendingItem.examples.push({
            batchItemId,
            fileName,
            invoiceNumber: invoiceNumber || undefined,
            hawb: hawb || undefined,
            productDescription,
            hts: hts || undefined,
          });
        }
      };

      addPendingProduct(asText(rawLineItem.productDescription));

      if (Array.isArray(rawLineItem.varieties)) {
        for (const rawVariety of rawLineItem.varieties) {
          const varietyText = asText(rawVariety);
          addPendingProduct(getCompactVarietyProduct(varietyText), varietyText);
        }
      }
    }
  }

  const items = [...pendingByKey.values()]
    .map((item) => ({
      key: item.key,
      product: item.product,
      occurrenceCount: item.occurrenceCount,
      invoiceCount: item.invoiceIds.size,
      htsCandidates: [...item.htsCounts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'es'))
        .slice(0, MAX_PENDING_HTS_CANDIDATES)
        .map(([hts]) => hts),
      latestProcessedAt: item.latestProcessedAt,
      examples: item.examples,
    }))
    .sort((left, right) => {
      const occurrenceDiff = right.occurrenceCount - left.occurrenceCount;
      if (occurrenceDiff !== 0) {
        return occurrenceDiff;
      }

      const latestDiff = toTimestamp(right.latestProcessedAt) - toTimestamp(left.latestProcessedAt);
      if (latestDiff !== 0) {
        return latestDiff;
      }

      return left.product.localeCompare(right.product, 'es', { sensitivity: 'base' });
    });

  if (items.length > MAX_PENDING_RETURN_ITEMS) {
    truncated = true;
  }

  return {
    items: items.slice(0, MAX_PENDING_RETURN_ITEMS),
    truncated,
  };
}

async function ensureAgencyExists(agencyId: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT id FROM agencies WHERE id = ?',
    args: [agencyId],
  });

  return result.rows.length > 0;
}

async function ensureProductMatchAgencyAccess(
  c: Parameters<typeof ensureAgencyAccess>[0],
  user: AuthUser,
  agencyId: string,
): Promise<Response | null> {
  const accessError = ensureAgencyAccess(c, user, agencyId);
  if (accessError) {
    return accessError;
  }

  if (user.role === 'ADMIN' || agencyId === 'GLOBAL') {
    return null;
  }

  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT is_active FROM agencies WHERE id = ?',
    args: [agencyId],
  });

  if (result.rows.length === 0 || !Boolean(result.rows[0].is_active)) {
    return c.json({ error: 'No autorizado para acceder a esta agencia.' }, 403);
  }

  return null;
}

async function findDuplicateProduct(
  agencyId: string,
  product: string,
  excludedId?: string,
): Promise<boolean> {
  const db = getDb();
  const result = excludedId
    ? await db.execute({
        sql: `SELECT id
              FROM product_matches
              WHERE agency_id = ?
                AND lower(trim(product)) = lower(trim(?))
                AND id != ?
              LIMIT 1`,
        args: [agencyId, product, excludedId],
      })
    : await db.execute({
        sql: `SELECT id
              FROM product_matches
              WHERE agency_id = ?
                AND lower(trim(product)) = lower(trim(?))
              LIMIT 1`,
        args: [agencyId, product],
      });

  return result.rows.length > 0;
}

// GET /api/product-matches?agencyId=...
productMatches.get('/pending', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const agencyId = asText(c.req.query('agencyId'));
  if (!agencyId || agencyId === 'GLOBAL') {
    return c.json({ error: 'Se requiere un agencyId valido.' }, 400);
  }

  const accessError = await ensureProductMatchAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  const db = getDb();
  const [matchesResult, batchResult] = await Promise.all([
    db.execute({
      sql: `SELECT product
            FROM product_matches
            WHERE agency_id = ?`,
      args: [agencyId],
    }),
    db.execute({
      sql: `SELECT id, file_name, result_json, processed_at, created_at
            FROM batch_items
            WHERE agency_id = ?
              AND status = 'SUCCESS'
              AND result_json IS NOT NULL
            ORDER BY COALESCE(processed_at, created_at) DESC, created_at DESC
            LIMIT ?`,
      args: [agencyId, MAX_PENDING_BATCH_ITEMS + 1],
    }),
  ]);

  const truncated = batchResult.rows.length > MAX_PENDING_BATCH_ITEMS;
  const scannedRows = truncated
    ? (batchResult.rows.slice(0, MAX_PENDING_BATCH_ITEMS) as Record<string, unknown>[])
    : (batchResult.rows as Record<string, unknown>[]);

  const matchedKeys = new Set(
    matchesResult.rows
      .map((row) => normalizeProductKey(asText((row as Record<string, unknown>).product)))
      .filter(Boolean),
  );

  const pendingResult = buildPendingProductMatches(scannedRows, matchedKeys);

  return c.json({
    items: pendingResult.items,
    truncated: truncated || pendingResult.truncated,
    scannedBatchItems: scannedRows.length,
    scanLimit: MAX_PENDING_BATCH_ITEMS,
  });
});

productMatches.post('/pending', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const body = (await c.req
    .json()
    .catch(() => null)) as Partial<PendingProductMatchCreateInput> | null;
  if (!body) {
    return c.json({ error: 'JSON inválido para crear el match pendiente.' }, 400);
  }

  const agencyId = asText(body.agencyId);
  const product = asText(body.product);
  const clientProductCode = asText(body.clientProductCode);
  const productMatch = asText(body.productMatch);
  const htsMatch = asText(body.htsMatch);
  const sourceHts = asText(body.sourceHts);

  if (!agencyId || agencyId === 'GLOBAL') {
    return c.json({ error: 'Se requiere una agencia valida.' }, 400);
  }

  const accessError = await ensureProductMatchAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  if (!(await ensureAgencyExists(agencyId))) {
    return c.json({ error: 'Agencia no encontrada.' }, 404);
  }

  if (!product) {
    return c.json({ error: 'El producto pendiente es obligatorio.' }, 400);
  }

  if (!clientProductCode) {
    return c.json({ error: 'El código producto cliente es obligatorio.' }, 400);
  }

  if (!productMatch) {
    return c.json({ error: 'La descripción producto cliente es obligatoria.' }, 400);
  }

  if (!htsMatch) {
    return c.json({ error: 'El HTS Match es obligatorio.' }, 400);
  }

  if (
    exceedsMaxLength(product, MAX_PENDING_PRODUCT_LENGTH) ||
    exceedsMaxLength(clientProductCode, MAX_PENDING_CLIENT_CODE_LENGTH) ||
    exceedsMaxLength(productMatch, MAX_PENDING_PRODUCT_MATCH_LENGTH) ||
    exceedsMaxLength(htsMatch, MAX_PENDING_HTS_LENGTH) ||
    exceedsMaxLength(sourceHts, MAX_PENDING_HTS_LENGTH)
  ) {
    return c.json({ error: 'Uno o más campos exceden el tamaño permitido.' }, 400);
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  const db = getDb();

  const created = await db.execute({
    sql: `INSERT INTO product_matches (
            id, agency_id, category, product, client_product_code, product_match, hts, hts_match, created_at, updated_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1
            FROM product_matches
            WHERE agency_id = ?
              AND lower(trim(product)) = lower(trim(?))
          )
          RETURNING id, agency_id, category, product, client_product_code, product_match, hts, hts_match, created_at, updated_at`,
    args: [
      id,
      agencyId,
      product,
      product,
      clientProductCode,
      productMatch,
      sourceHts,
      htsMatch,
      now,
      now,
      agencyId,
      product,
    ],
  });

  if (created.rows.length === 0) {
    return c.json({ error: 'Ya existe un match para ese Product en la agencia.' }, 400);
  }

  return c.json(buildProductMatch(created.rows[0] as Record<string, unknown>), 201);
});

// GET /api/product-matches?agencyId=...
productMatches.get('/', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const agencyId = asText(c.req.query('agencyId'));
  if (!agencyId || agencyId === 'GLOBAL') {
    return c.json({ error: 'Se requiere un agencyId valido.' }, 400);
  }

  const accessError = await ensureProductMatchAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, agency_id, category, product, client_product_code, product_match, hts, hts_match, created_at, updated_at
          FROM product_matches
          WHERE agency_id = ?
          ORDER BY category ASC, product ASC`,
    args: [agencyId],
  });

  return c.json(result.rows.map((row) => buildProductMatch(row as Record<string, unknown>)));
});

// POST /api/product-matches/bootstrap
productMatches.post('/bootstrap', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const body = await c.req.json();
  const agencyId = asText(body.agencyId);

  if (!agencyId || agencyId === 'GLOBAL') {
    return c.json({ error: 'Se requiere una agencia valida.' }, 400);
  }

  const accessError = await ensureProductMatchAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  if (!(await ensureAgencyExists(agencyId))) {
    return c.json({ error: 'Agencia no encontrada.' }, 404);
  }

  const db = getDb();
  const existingCatalogResult = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM product_matches WHERE agency_id = ?',
    args: [agencyId],
  });
  const existingCatalogCount = Number(existingCatalogResult.rows[0]?.count ?? 0);

  if (existingCatalogCount > 0) {
    return c.json(
      {
        error:
          'La agencia ya tiene registros en Match Productos. La carga inicial solo aplica cuando el catalogo esta vacio.',
      },
      400,
    );
  }

  const masterResult = await db.execute({
    sql: `SELECT product, client_product_code, product_match, hts_match
          FROM product_match_master
          ORDER BY source_order ASC`,
  });

  if (masterResult.rows.length === 0) {
    return c.json({ error: 'No existe un catalogo maestro disponible para cargar.' }, 404);
  }

  const resolvedCandidates = new Map<string, MasterBootstrapCandidate>();

  for (const rawRow of masterResult.rows) {
    const candidate = buildMasterCandidate(rawRow as Record<string, unknown>);
    if (!candidate.product) {
      continue;
    }

    resolvedCandidates.set(normalizeProductKey(candidate.product), candidate);
  }

  const acceptedCandidates = [...resolvedCandidates.values()];

  if (acceptedCandidates.length === 0) {
    return c.json(
      {
        error: 'La matriz base no tiene filas utilizables para copiar a la agencia.',
      },
      409,
    );
  }

  const now = new Date().toISOString();
  await db.batch(
    acceptedCandidates.map((candidate) => ({
      sql: `INSERT INTO product_matches (
              id, agency_id, category, product, client_product_code, product_match, hts, hts_match, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        agencyId,
        candidate.product,
        candidate.product,
        candidate.clientProductCode,
        candidate.productMatch,
        '',
        candidate.htsMatch,
        now,
        now,
      ],
    })),
    'write',
  );

  return c.json(
    {
      ok: true,
      insertedCount: acceptedCandidates.length,
      masterRowCount: masterResult.rows.length,
    },
    201,
  );
});

// POST /api/product-matches
productMatches.post('/', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const body = await c.req.json();
  const agencyId = asText(body.agencyId);
  const product = asText(body.product);

  if (!agencyId || agencyId === 'GLOBAL') {
    return c.json({ error: 'Se requiere una agencia valida.' }, 400);
  }

  const accessError = await ensureProductMatchAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  if (!(await ensureAgencyExists(agencyId))) {
    return c.json({ error: 'Agencia no encontrada.' }, 404);
  }

  const requestedId = asText(body.id);
  if (!requestedId) {
    return c.json({ error: 'Se requiere id para crear el match.' }, 400);
  }

  if (!product) {
    return c.json({ error: 'El campo Product es obligatorio.' }, 400);
  }

  if (
    hasProductMatchFieldLengthError({
      product,
      clientProductCode: asText(body.clientProductCode),
      productMatch: asText(body.productMatch),
      hts: asText(body.hts),
      htsMatch: asText(body.htsMatch),
    })
  ) {
    return c.json({ error: 'Uno o más campos exceden el tamaño permitido.' }, 400);
  }

  const now = new Date().toISOString();
  const db = getDb();

  const created = await db.execute({
    sql: `INSERT INTO product_matches (
            id, agency_id, category, product, client_product_code, product_match, hts, hts_match, created_at, updated_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1
            FROM product_matches
            WHERE agency_id = ?
              AND lower(trim(product)) = lower(trim(?))
          )
          RETURNING id, agency_id, category, product, client_product_code, product_match, hts, hts_match, created_at, updated_at`,
    args: [
      requestedId,
      agencyId,
      asText(body.category),
      product,
      asText(body.clientProductCode),
      asText(body.productMatch),
      asText(body.hts),
      asText(body.htsMatch),
      now,
      now,
      agencyId,
      product,
    ],
  });

  if (created.rows.length === 0) {
    return c.json({ error: 'Ya existe un match para ese Product en la agencia.' }, 400);
  }

  return c.json(buildProductMatch(created.rows[0] as Record<string, unknown>), 201);
});

// PUT /api/product-matches/:id
productMatches.put('/:id', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const id = c.req.param('id');
  const body = await c.req.json();
  const db = getDb();
  const existing = await db.execute({
    sql: `SELECT id, agency_id
          FROM product_matches
          WHERE id = ?`,
    args: [id],
  });

  if (existing.rows.length === 0) {
    return c.json({ error: 'Match de producto no encontrado.' }, 404);
  }

  const agencyId = String(existing.rows[0].agency_id);
  const accessError = await ensureProductMatchAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  const product = asText(body.product);
  if (!product) {
    return c.json({ error: 'El campo Product es obligatorio.' }, 400);
  }

  if (
    hasProductMatchFieldLengthError({
      product,
      clientProductCode: asText(body.clientProductCode),
      productMatch: asText(body.productMatch),
      hts: asText(body.hts),
      htsMatch: asText(body.htsMatch),
    })
  ) {
    return c.json({ error: 'Uno o más campos exceden el tamaño permitido.' }, 400);
  }

  const now = new Date().toISOString();
  const updated = await db.execute({
    sql: `UPDATE product_matches
          SET category = ?,
              product = ?,
              client_product_code = ?,
              product_match = ?,
              hts = ?,
              hts_match = ?,
              updated_at = ?
          WHERE id = ?
            AND NOT EXISTS (
              SELECT 1
              FROM product_matches
              WHERE agency_id = ?
                AND lower(trim(product)) = lower(trim(?))
                AND id != ?
            )
          RETURNING id, agency_id, category, product, client_product_code, product_match, hts, hts_match, created_at, updated_at`,
    args: [
      asText(body.category),
      product,
      asText(body.clientProductCode),
      asText(body.productMatch),
      asText(body.hts),
      asText(body.htsMatch),
      now,
      id,
      agencyId,
      product,
      id,
    ],
  });

  if (updated.rows.length === 0) {
    return c.json({ error: 'Ya existe un match para ese Product en la agencia.' }, 400);
  }

  return c.json(buildProductMatch(updated.rows[0] as Record<string, unknown>));
});

// DELETE /api/product-matches/:id
productMatches.delete('/:id', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const id = c.req.param('id');
  const db = getDb();
  const existing = await db.execute({
    sql: `SELECT agency_id
          FROM product_matches
          WHERE id = ?`,
    args: [id],
  });

  if (existing.rows.length === 0) {
    return c.json({ error: 'Match de producto no encontrado.' }, 404);
  }

  const accessError = await ensureProductMatchAgencyAccess(
    c,
    authUser,
    String(existing.rows[0].agency_id),
  );
  if (accessError) {
    return accessError;
  }

  await db.execute({
    sql: 'DELETE FROM product_matches WHERE id = ?',
    args: [id],
  });

  return c.json({ ok: true });
});

// GET /api/product-matches/template?agencyId=...
// Descarga una plantilla Excel (.xlsx) con las columnas del catálogo para que el usuario
// la llene y luego la importe. Incluye una fila de ejemplo.
productMatches.get('/template', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const agencyId = asText(c.req.query('agencyId'));
  if (!agencyId || agencyId === 'GLOBAL') {
    return c.json({ error: 'Se requiere un agencyId valido.' }, 400);
  }

  const accessError = await ensureProductMatchAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  // Construir el workbook con ExcelJS usando solo los campos visibles en la UI.
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Match Productos');

  worksheet.columns = [
    { header: VISIBLE_TEMPLATE_HEADERS[0], key: 'product', width: 30 },
    { header: VISIBLE_TEMPLATE_HEADERS[1], key: 'clientProductCode', width: 26 },
    { header: VISIBLE_TEMPLATE_HEADERS[2], key: 'productMatch', width: 32 },
    { header: VISIBLE_TEMPLATE_HEADERS[3], key: 'htsMatch', width: 20 },
  ];

  worksheet.addRow(VISIBLE_TEMPLATE_EXAMPLE);

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="plantilla-match-productos-${agencyId}.xlsx"`,
    },
  });
});

// POST /api/product-matches/import
// Importa un archivo Excel (.xlsx) o CSV con registros de match de productos para una agencia.
// Solo permite importar si el catálogo de la agencia está vacío (carga inicial).
productMatches.post('/import', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const formData = await c.req.formData();
  const agencyId = asText(formData.get('agencyId'));
  const file = formData.get('file') as File | null;

  if (!agencyId || agencyId === 'GLOBAL') {
    return c.json({ error: 'Se requiere una agencia valida.' }, 400);
  }

  const accessError = await ensureProductMatchAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  if (!file) {
    return c.json({ error: 'Se requiere un archivo Excel (.xlsx) o CSV para importar.' }, 400);
  }

  if (file.size > MAX_PRODUCT_MATCH_IMPORT_FILE_BYTES) {
    return c.json(
      {
        error: `El archivo excede el tamaño permitido para importación (${Math.floor(MAX_PRODUCT_MATCH_IMPORT_FILE_BYTES / (1024 * 1024))} MB).`,
      },
      400,
    );
  }

  // Validar extensión
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.csv')) {
    return c.json(
      {
        error:
          'El archivo debe ser .xlsx (Excel) o .csv. Descarga la plantilla para obtener el formato correcto.',
      },
      400,
    );
  }

  if (!(await ensureAgencyExists(agencyId))) {
    return c.json({ error: 'Agencia no encontrada.' }, 404);
  }

  const db = getDb();

  // Verificar que el catálogo esté vacío para esta agencia
  const existingCountResult = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM product_matches WHERE agency_id = ?',
    args: [agencyId],
  });
  const existingCount = Number(existingCountResult.rows[0]?.count ?? 0);

  if (existingCount > 0) {
    return c.json(
      {
        error:
          'La agencia ya tiene registros en Match Productos. La importación solo aplica cuando el catálogo está vacío.',
      },
      400,
    );
  }

  // Leer el archivo como ArrayBuffer y parsear con ExcelJS
  const workbook = new ExcelJS.Workbook();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (fileName.endsWith('.csv')) {
      await workbook.csv.read(buffer as any);
    } else {
      await workbook.xlsx.load(buffer as any);
    }
  } catch {
    return c.json(
      { error: 'No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) o CSV válido.' },
      400,
    );
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return c.json({ error: 'El archivo no contiene ninguna hoja de datos.' }, 400);
  }

  // Convertir a array de arrays (ExcelJS row.values es 1-based: [undefined, col1, col2, ...])
  const rawData: (string | number | boolean | null)[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    if (row.values && Array.isArray(row.values)) {
      rawData.push(row.values.slice(1) as (string | number | boolean | null)[]);
    }
  });

  if (rawData.length < 2) {
    return c.json(
      {
        error:
          'El archivo está vacío o solo contiene la cabecera. Agrega al menos una fila de datos.',
      },
      400,
    );
  }

  if (rawData.length > MAX_PRODUCT_MATCH_IMPORT_ROWS + 1) {
    return c.json(
      {
        error: `El archivo supera el límite de ${MAX_PRODUCT_MATCH_IMPORT_ROWS} filas de datos para una importación inicial.`,
      },
      400,
    );
  }

  // Primera fila como cabeceras. Solo se aceptan las 4 columnas visibles de la plantilla.
  const headers = (rawData[0] as unknown[]).map((h) => normalizeHeader(h));
  const productIndex = findHeaderIndex(headers, 'product');
  const clientProductCodeIndex = findHeaderIndex(headers, 'clientProductCode');
  const productMatchIndex = findHeaderIndex(headers, 'productMatch');
  const htsMatchIndex = findHeaderIndex(headers, 'htsMatch');

  if (
    productIndex < 0 ||
    clientProductCodeIndex < 0 ||
    productMatchIndex < 0 ||
    htsMatchIndex < 0
  ) {
    return c.json(
      {
        error: `El archivo debe incluir exactamente estas columnas: ${VISIBLE_TEMPLATE_HEADERS.join(', ')}. Cabeceras encontradas: ${headers.join(', ')}. Descarga la plantilla para obtener el formato correcto.`,
      },
      400,
    );
  }

  // Parsear filas de datos (saltar cabecera)
  const now = new Date().toISOString();
  const duplicates: string[] = [];
  let importedCount = 0;

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i] as unknown[];
    const cells = row.map((cell) => String(cell ?? '').trim());

    const product = cells[productIndex] || '';
    if (!product) {
      continue; // Saltar filas sin product (requerido)
    }

    // Verificar duplicado por product dentro de la agencia
    const duplicateCheck = await db.execute({
      sql: `SELECT id FROM product_matches
            WHERE agency_id = ? AND lower(trim(product)) = lower(trim(?))
            LIMIT 1`,
      args: [agencyId, product],
    });

    if (duplicateCheck.rows.length > 0) {
      duplicates.push(product);
      continue;
    }

    const id = randomUUID();
    const category = product;
    const clientProductCode = cells[clientProductCodeIndex] || '';
    const productMatch = cells[productMatchIndex] || '';
    const hts = '';
    const htsMatch = cells[htsMatchIndex] || '';

    if (
      exceedsMaxLength(product, MAX_PENDING_PRODUCT_LENGTH) ||
      exceedsMaxLength(clientProductCode, MAX_PENDING_CLIENT_CODE_LENGTH) ||
      exceedsMaxLength(productMatch, MAX_PENDING_PRODUCT_MATCH_LENGTH) ||
      exceedsMaxLength(htsMatch, MAX_PENDING_HTS_LENGTH)
    ) {
      return c.json(
        {
          error: `La fila ${i + 1} contiene valores que exceden el tamaño permitido.`,
        },
        400,
      );
    }

    await db.execute({
      sql: `INSERT INTO product_matches (
              id, agency_id, category, product, client_product_code, product_match, hts, hts_match, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        agencyId,
        category,
        product,
        clientProductCode,
        productMatch,
        hts,
        htsMatch,
        now,
        now,
      ],
    });

    importedCount++;
  }

  if (importedCount === 0) {
    return c.json(
      {
        error: `No se importó ningún registro.${duplicates.length > 0 ? ` ${duplicates.length} producto(s) ya existían: ${duplicates.slice(0, 5).join(', ')}${duplicates.length > 5 ? '...' : ''}` : ' Verifica que el archivo tenga datos válidos.'}`,
      },
      400,
    );
  }

  return c.json(
    {
      ok: true,
      importedCount,
      duplicateCount: duplicates.length,
      message: `Se importaron ${importedCount} registros correctamente.${duplicates.length > 0 ? ` ${duplicates.length} producto(s) fueron omitidos por estar duplicados.` : ''}`,
    },
    201,
  );
});

export default productMatches;
