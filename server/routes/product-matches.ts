import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';

import { getDb } from '../db.js';
import { ensureAgencyAccess, requireAuth } from '../security.js';

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

async function ensureAgencyExists(agencyId: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT id FROM agencies WHERE id = ?',
    args: [agencyId],
  });

  return result.rows.length > 0;
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
productMatches.get('/', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const agencyId = asText(c.req.query('agencyId'));
  if (!agencyId || agencyId === 'GLOBAL') {
    return c.json({ error: 'Se requiere un agencyId valido.' }, 400);
  }

  const accessError = ensureAgencyAccess(c, authUser, agencyId);
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

  const accessError = ensureAgencyAccess(c, authUser, agencyId);
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

  const accessError = ensureAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  if (!(await ensureAgencyExists(agencyId))) {
    return c.json({ error: 'Agencia no encontrada.' }, 404);
  }

  if (!asText(body.id)) {
    return c.json({ error: 'Se requiere id para crear el match.' }, 400);
  }

  if (!product) {
    return c.json({ error: 'El campo Product es obligatorio.' }, 400);
  }

  if (await findDuplicateProduct(agencyId, product)) {
    return c.json({ error: 'Ya existe un match para ese Product en la agencia.' }, 400);
  }

  const now = new Date().toISOString();
  const db = getDb();

  await db.execute({
    sql: `INSERT INTO product_matches (
            id, agency_id, category, product, client_product_code, product_match, hts, hts_match, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      asText(body.id),
      agencyId,
      asText(body.category),
      product,
      asText(body.clientProductCode),
      asText(body.productMatch),
      asText(body.hts),
      asText(body.htsMatch),
      now,
      now,
    ],
  });

  const created = await db.execute({
    sql: `SELECT id, agency_id, category, product, client_product_code, product_match, hts, hts_match, created_at, updated_at
          FROM product_matches
          WHERE id = ?`,
    args: [asText(body.id)],
  });

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
  const accessError = ensureAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  const product = asText(body.product);
  if (!product) {
    return c.json({ error: 'El campo Product es obligatorio.' }, 400);
  }

  if (await findDuplicateProduct(agencyId, product, id)) {
    return c.json({ error: 'Ya existe un match para ese Product en la agencia.' }, 400);
  }

  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE product_matches
          SET category = ?,
              product = ?,
              client_product_code = ?,
              product_match = ?,
              hts = ?,
              hts_match = ?,
              updated_at = ?
          WHERE id = ?`,
    args: [
      asText(body.category),
      product,
      asText(body.clientProductCode),
      asText(body.productMatch),
      asText(body.hts),
      asText(body.htsMatch),
      now,
      id,
    ],
  });

  const updated = await db.execute({
    sql: `SELECT id, agency_id, category, product, client_product_code, product_match, hts, hts_match, created_at, updated_at
          FROM product_matches
          WHERE id = ?`,
    args: [id],
  });

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

  const accessError = ensureAgencyAccess(c, authUser, String(existing.rows[0].agency_id));
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

  const accessError = ensureAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  // Construir el workbook con SheetJS usando solo los campos visibles en la UI.
  const worksheet = XLSX.utils.aoa_to_sheet([VISIBLE_TEMPLATE_HEADERS, VISIBLE_TEMPLATE_EXAMPLE]);

  // Ancho de columnas para mejor legibilidad
  worksheet['!cols'] = [{ wch: 30 }, { wch: 26 }, { wch: 32 }, { wch: 20 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Match Productos');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

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

  const accessError = ensureAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  if (!file) {
    return c.json({ error: 'Se requiere un archivo Excel (.xlsx) o CSV para importar.' }, 400);
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

  // Leer el archivo como ArrayBuffer y parsear con SheetJS
  let workbook: XLSX.WorkBook;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    return c.json(
      { error: 'No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) o CSV válido.' },
      400,
    );
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return c.json({ error: 'El archivo no contiene ninguna hoja de datos.' }, 400);
  }

  const worksheet = workbook.Sheets[sheetName];

  // Convertir a array de arrays (SheetJS)
  const rawData: (string | number | boolean | null)[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
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
