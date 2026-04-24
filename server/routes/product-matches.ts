import { Hono } from 'hono';
import { getDb } from '../db.js';
import { ensureAgencyAccess, requireAuth } from '../security.js';

const productMatches = new Hono();

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

async function ensureAgencyExists(agencyId: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT id FROM agencies WHERE id = ?',
    args: [agencyId],
  });

  return result.rows.length > 0;
}

async function findDuplicateProduct(agencyId: string, product: string, excludedId?: string): Promise<boolean> {
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

export default productMatches;