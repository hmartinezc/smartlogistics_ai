// ============================================
// RUTAS DE USUARIOS — /api/users
// ============================================

import { Hono } from 'hono';
import { getDb } from '../db.js';
import { hashPassword, requireAuth, requireRole } from '../security.js';

const users = new Hono();

const USER_SELECT = `SELECT
  u.id,
  u.email,
  u.name,
  u.role,
  u.is_active,
  u.created_at,
  u.updated_at,
  COALESCE(GROUP_CONCAT(DISTINCT ua.agency_id), '') AS agency_ids
FROM users u
LEFT JOIN user_agencies ua ON ua.user_id = u.id`;

// Helper: reconstruir User desde DB rows
function buildUser(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    role: String(row.role),
    agencyIds: String(row.agency_ids || '')
      .split(',')
      .map((agencyId) => agencyId.trim())
      .filter(Boolean),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

// GET /api/users — Listar todos
users.get('/', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const roleError = requireRole(c, authUser, ['ADMIN']);
  if (roleError) {
    return roleError;
  }

  const db = getDb();
  const result = await db.execute(`${USER_SELECT} GROUP BY u.id ORDER BY u.name`);

  return c.json(result.rows.map(buildUser));
});

// GET /api/users/:id
users.get('/:id', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const roleError = requireRole(c, authUser, ['ADMIN']);
  if (roleError) {
    return roleError;
  }

  const db = getDb();
  const result = await db.execute({
    sql: `${USER_SELECT} WHERE u.id = ? GROUP BY u.id`,
    args: [c.req.param('id')],
  });

  if (result.rows.length === 0) {
    return c.json({ error: 'Usuario no encontrado' }, 404);
  }

  return c.json(buildUser(result.rows[0]));
});

// POST /api/users — Crear usuario
users.post('/', async (c) => {
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

  // Validar email único
  const existing = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [body.email],
  });
  if (existing.rows.length > 0) {
    return c.json({ error: `El email "${body.email}" ya está registrado.` }, 400);
  }

  // Validar password mínimo
  if (!body.password || body.password.length < 4) {
    return c.json({ error: 'La contraseña debe tener al menos 4 caracteres.' }, 400);
  }

  // Validar agencias para no-admin
  if (body.role !== 'ADMIN') {
    if (!body.agencyIds || body.agencyIds.length === 0) {
      return c.json({ error: 'Usuarios no-admin deben tener al menos una agencia asignada.' }, 400);
    }

    // Verificar que al menos una agencia esté activa
    const activeCheck = await db.execute({
      sql: `SELECT id FROM agencies WHERE id IN (${body.agencyIds.map(() => '?').join(',')}) AND is_active = 1`,
      args: body.agencyIds,
    });
    if (activeCheck.rows.length === 0) {
      return c.json({ error: 'Al menos una agencia asignada debe estar activa.' }, 400);
    }
  }

  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO users (id, email, password, name, role, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [body.id, body.email, hashPassword(body.password), body.name, body.role, body.isActive ? 1 : 0, now, now],
  });

  // Insertar agencias
  if (body.agencyIds && body.agencyIds.length > 0) {
    await db.batch(
      body.agencyIds.map((agencyId: string) => ({
        sql: 'INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?)',
        args: [body.id, agencyId],
      }))
    );
  }

  const result = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [body.id] });
  const hydrated = await db.execute({
    sql: `${USER_SELECT} WHERE u.id = ? GROUP BY u.id`,
    args: [body.id],
  });
  return c.json(buildUser(hydrated.rows[0]), 201);
});

// PUT /api/users/:id — Actualizar usuario
users.put('/:id', async (c) => {
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
  const exists = await db.execute({ sql: 'SELECT id FROM users WHERE id = ?', args: [id] });
  if (exists.rows.length === 0) {
    return c.json({ error: 'Usuario no encontrado' }, 404);
  }

  // Validar email único (excluyendo el usuario actual)
  const emailCheck = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ? AND id != ?',
    args: [body.email, id],
  });
  if (emailCheck.rows.length > 0) {
    return c.json({ error: `El email "${body.email}" ya está registrado.` }, 400);
  }

  // Validar agencias para no-admin
  if (body.role !== 'ADMIN') {
    if (!body.agencyIds || body.agencyIds.length === 0) {
      return c.json({ error: 'Usuarios no-admin deben tener al menos una agencia asignada.' }, 400);
    }

    const activeCheck = await db.execute({
      sql: `SELECT id FROM agencies WHERE id IN (${body.agencyIds.map(() => '?').join(',')}) AND is_active = 1`,
      args: body.agencyIds,
    });
    if (activeCheck.rows.length === 0) {
      return c.json({ error: 'Al menos una agencia asignada debe estar activa.' }, 400);
    }
  }

  const now = new Date().toISOString();

  // Update user fields (password only if provided)
  if (body.password && body.password.length >= 4) {
    await db.execute({
      sql: `UPDATE users SET email = ?, password = ?, name = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ?`,
      args: [body.email, hashPassword(body.password), body.name, body.role, body.isActive ? 1 : 0, now, id],
    });
  } else {
    await db.execute({
      sql: `UPDATE users SET email = ?, name = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ?`,
      args: [body.email, body.name, body.role, body.isActive ? 1 : 0, now, id],
    });
  }

  // Reemplazar agencias
  await db.execute({ sql: 'DELETE FROM user_agencies WHERE user_id = ?', args: [id] });
  if (body.agencyIds && body.agencyIds.length > 0) {
    await db.batch(
      body.agencyIds.map((agencyId: string) => ({
        sql: 'INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?)',
        args: [id, agencyId],
      }))
    );
  }

  const result = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
  const hydrated = await db.execute({
    sql: `${USER_SELECT} WHERE u.id = ? GROUP BY u.id`,
    args: [id],
  });
  return c.json(buildUser(hydrated.rows[0]));
});

// DELETE /api/users/:id
users.delete('/:id', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const roleError = requireRole(c, authUser, ['ADMIN']);
  if (roleError) {
    return roleError;
  }

  const db = getDb();
  const id = c.req.param('id');

  await db.execute({ sql: 'DELETE FROM user_agencies WHERE user_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM auth_sessions WHERE user_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] });

  return c.json({ ok: true });
});

export default users;
