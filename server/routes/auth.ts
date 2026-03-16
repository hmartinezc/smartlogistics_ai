// ============================================
// RUTAS DE AUTENTICACIÓN — /api/auth
// ============================================

import { Hono } from 'hono';
import { getDb } from '../db.js';
import { hashPassword, isPasswordHashed, verifyPassword } from '../security.js';

const auth = new Hono();

// POST /api/auth/login
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  const db = getDb();

  // Buscar usuario por email
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE email = ?',
    args: [email],
  });

  if (result.rows.length === 0) {
    return c.json({ error: 'Credenciales inválidas.' }, 401);
  }

  const row = result.rows[0];
  const storedPassword = String(row.password);

  if (!verifyPassword(password, storedPassword)) {
    return c.json({ error: 'Credenciales inválidas.' }, 401);
  }

  if (!isPasswordHashed(storedPassword)) {
    await db.execute({
      sql: 'UPDATE users SET password = ?, updated_at = ? WHERE id = ?',
      args: [hashPassword(password), new Date().toISOString(), String(row.id)],
    });
  }

  if (!row.is_active) {
    return c.json({ error: 'Usuario inactivo. Contacte al administrador.' }, 403);
  }

  // Verificar que tiene agencia activa
  const agencyCheck = await db.execute({
    sql: `SELECT a.id FROM user_agencies ua
          JOIN agencies a ON a.id = ua.agency_id
          WHERE ua.user_id = ? AND a.is_active = 1
          LIMIT 1`,
    args: [String(row.id)],
  });

  if (row.role !== 'ADMIN' && agencyCheck.rows.length === 0) {
    return c.json({ error: 'Acceso denegado: Su agencia se encuentra suspendida.' }, 403);
  }

  // Obtener agencyIds del usuario
  const agencyRows = await db.execute({
    sql: 'SELECT agency_id FROM user_agencies WHERE user_id = ?',
    args: [String(row.id)],
  });
  const agencyIds = agencyRows.rows.map(r => String(r.agency_id));

  // Crear sesión (8 horas)
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

  await db.execute({
    sql: 'INSERT INTO auth_sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
    args: [sessionId, String(row.id), expiresAt],
  });

  return c.json({
    session: { id: sessionId, userId: String(row.id), expiresAt },
    user: {
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      role: String(row.role),
      agencyIds,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at ? String(row.created_at) : undefined,
      updatedAt: row.updated_at ? String(row.updated_at) : undefined,
    },
  });
});

// GET /api/auth/session — Validar sesión activa
auth.get('/session', async (c) => {
  const sessionId = c.req.header('X-Session-Id');
  if (!sessionId) {
    return c.json({ error: 'No session' }, 401);
  }

  const db = getDb();
  const result = await db.execute({
    sql: `SELECT s.*, u.id as uid, u.email, u.name, u.role, u.is_active
          FROM auth_sessions s
          JOIN users u ON u.id = s.user_id
          WHERE s.id = ? AND unixepoch(s.expires_at) > unixepoch('now')`,
    args: [sessionId],
  });

  if (result.rows.length === 0) {
    return c.json({ error: 'Session expired' }, 401);
  }

  const row = result.rows[0];

  const agencyRows = await db.execute({
    sql: 'SELECT agency_id FROM user_agencies WHERE user_id = ?',
    args: [String(row.uid)],
  });
  const agencyIds = agencyRows.rows.map(r => String(r.agency_id));

  return c.json({
    session: {
      id: sessionId,
      userId: String(row.user_id),
      expiresAt: String(row.expires_at),
    },
    user: {
      id: String(row.uid),
      email: String(row.email),
      name: String(row.name),
      role: String(row.role),
      agencyIds,
      isActive: Boolean(row.is_active),
    },
  });
});

// DELETE /api/auth/session — Cerrar sesión
auth.delete('/session', async (c) => {
  const sessionId = c.req.header('X-Session-Id');
  if (!sessionId) {
    return c.json({ ok: true });
  }

  const db = getDb();
  await db.execute({
    sql: 'DELETE FROM auth_sessions WHERE id = ?',
    args: [sessionId],
  });

  return c.json({ ok: true });
});

export default auth;
