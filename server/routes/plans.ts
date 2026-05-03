// ============================================
// RUTAS DE PLANES — /api/plans
// ============================================

import { Hono } from 'hono';
import { getDb } from '../db.js';
import { requireAuth } from '../security.js';

const plans = new Hono();

// GET /api/plans — Listar todos los planes
plans.get('/', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const db = getDb();
  const result = await db.execute('SELECT * FROM subscription_plans ORDER BY doc_limit');

  return c.json(
    result.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      limit: Number(row.doc_limit),
      baseCost: Number(row.base_cost),
      extraPageCost: Number(row.extra_page_cost),
    })),
  );
});

export default plans;
