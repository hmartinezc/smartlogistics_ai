// ============================================
// RUTAS DE CONFIGURACIÓN — /api/settings
// ============================================

import { Hono } from 'hono';
import { getDb } from '../db.js';
import { requireAuth, requireRole } from '../security.js';

const settings = new Hono();

// GET /api/settings/:key
settings.get('/:key', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const roleError = requireRole(c, authUser, ['ADMIN']);
  if (roleError) return roleError;

  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT value FROM app_settings WHERE key = ?',
    args: [c.req.param('key')],
  });

  if (result.rows.length === 0) {
    return c.json({ key: c.req.param('key'), value: null });
  }

  return c.json({ key: c.req.param('key'), value: String(result.rows[0].value) });
});

// PUT /api/settings/:key
settings.put('/:key', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const roleError = requireRole(c, authUser, ['ADMIN']);
  if (roleError) return roleError;

  const { value } = await c.req.json();
  const db = getDb();

  await db.execute({
    sql: `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [c.req.param('key'), String(value)],
  });

  return c.json({ key: c.req.param('key'), value: String(value) });
});

export default settings;
