// ============================================
// RUTAS DE AGENCIAS — /api/agencies
// ============================================

import { Hono } from 'hono';
import { getDb } from '../db.js';
import { ensureAgencyAccess, requireAuth, requireRole } from '../security.js';

const agencies = new Hono();

const AGENCY_SELECT = `SELECT
  a.id,
  a.name,
  a.plan_id,
  a.current_usage,
  a.is_active,
  a.created_at,
  a.updated_at,
  COALESCE(GROUP_CONCAT(DISTINCT ae.email), '') AS emails
FROM agencies a
LEFT JOIN agency_emails ae ON ae.agency_id = a.id`;

// Helper: reconstruir Agency desde DB row
function buildAgency(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    planId: String(row.plan_id),
    emails: String(row.emails || '')
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean),
    currentUsage: Number(row.current_usage),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

// GET /api/agencies — Listar todas
agencies.get('/', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const db = getDb();
  const result = authUser.role === 'ADMIN'
    ? await db.execute(`${AGENCY_SELECT} GROUP BY a.id ORDER BY a.name`)
    : await db.execute({
        sql: `SELECT
                a.id,
                a.name,
                a.plan_id,
                a.current_usage,
                a.is_active,
                a.created_at,
                a.updated_at,
                COALESCE(GROUP_CONCAT(DISTINCT ae.email), '') AS emails
              FROM agencies a
              JOIN user_agencies ua ON ua.agency_id = a.id
              LEFT JOIN agency_emails ae ON ae.agency_id = a.id
              WHERE ua.user_id = ?
              GROUP BY a.id
              ORDER BY a.name`,
        args: [authUser.id],
      });

  return c.json(result.rows.map(buildAgency));
});

// GET /api/agencies/:id
agencies.get('/:id', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const accessError = ensureAgencyAccess(c, authUser, c.req.param('id'));
  if (accessError) {
    return accessError;
  }

  const db = getDb();
  const result = await db.execute({
    sql: `${AGENCY_SELECT} WHERE a.id = ? GROUP BY a.id`,
    args: [c.req.param('id')],
  });

  if (result.rows.length === 0) {
    return c.json({ error: 'Agencia no encontrada' }, 404);
  }

  return c.json(buildAgency(result.rows[0]));
});

// POST /api/agencies — Crear agencia
agencies.post('/', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const roleError = requireRole(c, authUser, ['ADMIN']);
  if (roleError) {
    return roleError;
  }

  const body = await c.req.json();
  const db = getDb();

  // Validar plan existe
  const planCheck = await db.execute({
    sql: 'SELECT id FROM subscription_plans WHERE id = ?',
    args: [body.planId],
  });
  if (planCheck.rows.length === 0) {
    return c.json({ error: `Plan "${body.planId}" no existe.` }, 400);
  }

  // Validar emails
  if (!body.emails || body.emails.length === 0) {
    return c.json({ error: 'La agencia debe tener al menos un email.' }, 400);
  }

  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO agencies (id, name, plan_id, current_usage, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [body.id, body.name, body.planId, body.currentUsage || 0, body.isActive ? 1 : 0, now, now],
  });

  // Insertar emails
  await db.batch(
    body.emails.map((email: string) => ({
      sql: 'INSERT INTO agency_emails (agency_id, email) VALUES (?, ?)',
      args: [body.id, email],
    }))
  );

  const result = await db.execute({ sql: 'SELECT * FROM agencies WHERE id = ?', args: [body.id] });
  const hydrated = await db.execute({
    sql: `${AGENCY_SELECT} WHERE a.id = ? GROUP BY a.id`,
    args: [body.id],
  });
  return c.json(buildAgency(hydrated.rows[0]), 201);
});

// PUT /api/agencies/:id — Actualizar agencia
agencies.put('/:id', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const roleError = requireRole(c, authUser, ['ADMIN']);
  if (roleError) {
    return roleError;
  }

  const id = c.req.param('id');
  const body = await c.req.json();
  const db = getDb();

  // Verificar existencia
  const exists = await db.execute({ sql: 'SELECT id FROM agencies WHERE id = ?', args: [id] });
  if (exists.rows.length === 0) {
    return c.json({ error: 'Agencia no encontrada' }, 404);
  }

  // Validar plan
  const planCheck = await db.execute({
    sql: 'SELECT id FROM subscription_plans WHERE id = ?',
    args: [body.planId],
  });
  if (planCheck.rows.length === 0) {
    return c.json({ error: `Plan "${body.planId}" no existe.` }, 400);
  }

  // Validar emails
  if (!body.emails || body.emails.length === 0) {
    return c.json({ error: 'La agencia debe tener al menos un email.' }, 400);
  }

  // Si se está suspendiendo, verificar que no deje usuarios sin agencia activa
  if (!body.isActive) {
    const affectedUsers = await db.execute({
      sql: `SELECT u.name FROM users u
            JOIN user_agencies ua ON ua.user_id = u.id
            WHERE ua.agency_id = ?
            AND u.role != 'ADMIN'
            AND u.is_active = 1
            AND NOT EXISTS (
              SELECT 1 FROM user_agencies ua2
              JOIN agencies a2 ON a2.id = ua2.agency_id
              WHERE ua2.user_id = u.id AND a2.id != ? AND a2.is_active = 1
            )`,
      args: [id, id],
    });

    if (affectedUsers.rows.length > 0) {
      const names = affectedUsers.rows.map(r => String(r.name)).join(', ');
      return c.json({
        error: `Suspender esta agencia dejaría sin acceso a: ${names}. Reasigne primero.`,
      }, 400);
    }
  }

  const now = new Date().toISOString();

  await db.execute({
    sql: `UPDATE agencies SET name = ?, plan_id = ?, current_usage = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    args: [body.name, body.planId, body.currentUsage || 0, body.isActive ? 1 : 0, now, id],
  });

  // Reemplazar emails
  await db.execute({ sql: 'DELETE FROM agency_emails WHERE agency_id = ?', args: [id] });
  if (body.emails.length > 0) {
    await db.batch(
      body.emails.map((email: string) => ({
        sql: 'INSERT INTO agency_emails (agency_id, email) VALUES (?, ?)',
        args: [id, email],
      }))
    );
  }

  const result = await db.execute({ sql: 'SELECT * FROM agencies WHERE id = ?', args: [id] });
  const hydrated = await db.execute({
    sql: `${AGENCY_SELECT} WHERE a.id = ? GROUP BY a.id`,
    args: [id],
  });
  return c.json(buildAgency(hydrated.rows[0]));
});

// DELETE /api/agencies/:id
agencies.delete('/:id', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const roleError = requireRole(c, authUser, ['ADMIN']);
  if (roleError) {
    return roleError;
  }

  const id = c.req.param('id');
  const db = getDb();

  // Proteger eliminación si tiene usuarios asignados
  const assignedUsers = await db.execute({
    sql: `SELECT u.name FROM users u
          JOIN user_agencies ua ON ua.user_id = u.id
          WHERE ua.agency_id = ?`,
    args: [id],
  });

  if (assignedUsers.rows.length > 0) {
    const names = assignedUsers.rows.map(r => String(r.name)).join(', ');
    return c.json({
      error: `No se puede eliminar la agencia mientras siga asignada a: ${names}.`,
    }, 400);
  }

  await db.execute({ sql: 'DELETE FROM agency_emails WHERE agency_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM agencies WHERE id = ?', args: [id] });

  return c.json({ ok: true });
});

// PATCH /api/agencies/:id/usage — Incrementar uso (batch processing)
agencies.patch('/:id/usage', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const id = c.req.param('id');
  const accessError = ensureAgencyAccess(c, authUser, id);
  if (accessError) {
    return accessError;
  }

  const { increment } = await c.req.json();
  const db = getDb();

  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE agencies SET current_usage = current_usage + ?, updated_at = ? WHERE id = ?`,
    args: [increment, now, id],
  });

  const result = await db.execute({ sql: 'SELECT * FROM agencies WHERE id = ?', args: [id] });
  const hydrated = await db.execute({
    sql: `${AGENCY_SELECT} WHERE a.id = ? GROUP BY a.id`,
    args: [id],
  });
  return c.json(buildAgency(hydrated.rows[0]));
});

export default agencies;
