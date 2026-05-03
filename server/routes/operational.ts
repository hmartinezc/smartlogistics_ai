// ============================================
// RUTAS OPERACIONALES — /api/operational
// ============================================
// AWB Reconciliación: Booked vs Invoiced
// ============================================

import { Hono } from 'hono';
import { getDb } from '../db.js';
import { ensureAgencyAccess, requireAuth } from '../security.js';

const operational = new Hono();

// GET /api/operational/reconciliation?agencyId=X&date=YYYY-MM-DD
operational.get('/reconciliation', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const agencyId = c.req.query('agencyId');
  const date = c.req.query('date');

  if (!agencyId || !date) {
    return c.json({ error: 'Se requiere agencyId y date' }, 400);
  }

  const accessError = ensureAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  const db = getDb();

  // Obtener AWBs reservados
  const booked = await db.execute({
    sql: `SELECT mawb, booked_hijas, booked_pieces, booked_fulls, operation_date, agency_id
          FROM booked_awb_records
          WHERE agency_id = ? AND operation_date = ?`,
    args: [agencyId, date],
  });

  // Obtener AWBs facturados (agregados desde batch_items por fecha)
  const dateEnd = `${date}T23:59:59.999Z`;
  const invoiced = await db.execute({
    sql: `SELECT
            json_extract(result_json, '$.mawb') as mawb,
            COUNT(*) as invoiced_hijas,
            COALESCE(SUM(json_extract(result_json, '$.totalPieces')), 0) as invoiced_pieces,
            COALESCE(SUM(json_extract(result_json, '$.totalEq')), 0) as invoiced_fulls
          FROM batch_items
          WHERE agency_id = ?
            AND status = 'SUCCESS'
            AND result_json IS NOT NULL
            AND processed_at >= ? AND processed_at <= ?
          GROUP BY json_extract(result_json, '$.mawb')`,
    args: [agencyId, date, dateEnd],
  });

  // Construir mapa de invoiced
  const invoicedMap = new Map<string, { hijas: number; pieces: number; fulls: number }>();
  for (const row of invoiced.rows) {
    const mawb = String(row.mawb || '');
    if (mawb) {
      invoicedMap.set(mawb, {
        hijas: Number(row.invoiced_hijas),
        pieces: Number(row.invoiced_pieces),
        fulls: Number(row.invoiced_fulls),
      });
    }
  }

  // Construir rows de reconciliación
  const allMawbs = new Set<string>();
  for (const row of booked.rows) allMawbs.add(String(row.mawb));
  for (const mawb of invoicedMap.keys()) allMawbs.add(mawb);

  const reconciliation = [];
  for (const mawb of allMawbs) {
    const b = booked.rows.find((r) => String(r.mawb) === mawb);
    const inv = invoicedMap.get(mawb);

    const bookedHijas = b ? Number(b.booked_hijas) : 0;
    const bookedPieces = b ? Number(b.booked_pieces) : 0;
    const bookedFulls = b ? Number(b.booked_fulls) : 0;
    const invoicedHijas = inv?.hijas || 0;
    const invoicedPieces = inv?.pieces || 0;
    const invoicedFulls = inv?.fulls || 0;

    let status: string;
    if (!b) {
      status = 'PENDING_DOCUMENTS';
    } else if (!inv) {
      status = 'PENDING_DOCUMENTS';
    } else if (
      bookedHijas === invoicedHijas &&
      bookedPieces === invoicedPieces &&
      Math.abs(bookedFulls - invoicedFulls) < 0.01
    ) {
      status = 'MATCHED';
    } else if (invoicedHijas > 0 && invoicedHijas < bookedHijas) {
      status = 'PARTIAL';
    } else {
      status = 'DISCREPANCY';
    }

    reconciliation.push({
      mawb,
      bookedHijas,
      bookedPieces,
      bookedFulls,
      invoicedHijas,
      invoicedPieces,
      invoicedFulls,
      operationDate: date,
      agencyId,
      status,
    });
  }

  return c.json(reconciliation);
});

// POST /api/operational/booked — Crear/actualizar AWB reservado
operational.post('/booked', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const body = await c.req.json();
  const accessError = ensureAgencyAccess(c, authUser, String(body.agencyId || ''));
  if (accessError) {
    return accessError;
  }

  const db = getDb();

  await db.execute({
    sql: `INSERT INTO booked_awb_records (mawb, booked_hijas, booked_pieces, booked_fulls, operation_date, agency_id)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(mawb, operation_date, agency_id) DO UPDATE SET
            booked_hijas = excluded.booked_hijas,
            booked_pieces = excluded.booked_pieces,
            booked_fulls = excluded.booked_fulls`,
    args: [
      body.mawb,
      body.bookedHijas,
      body.bookedPieces,
      body.bookedFulls,
      body.operationDate,
      body.agencyId,
    ],
  });

  return c.json({ ok: true }, 201);
});

export default operational;
