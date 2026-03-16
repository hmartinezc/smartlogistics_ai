import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { getDb } from './db.js';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'OPERADOR' | 'SUPERVISOR';
  isActive: boolean;
  agencyIds: string[];
};

function buildPasswordHash(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

export function isPasswordHashed(value: string): boolean {
  return value.startsWith('scrypt$');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = buildPasswordHash(password, salt);
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedValue: string): boolean {
  if (!isPasswordHashed(storedValue)) {
    return storedValue === password;
  }

  const [, salt, hash] = storedValue.split('$');
  if (!salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, 'hex');
  const actual = Buffer.from(buildPasswordHash(password, salt), 'hex');

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

async function buildAuthUser(userId: string): Promise<AuthUser | null> {
  const db = getDb();
  const userResult = await db.execute({
    sql: 'SELECT id, email, name, role, is_active FROM users WHERE id = ?',
    args: [userId],
  });

  if (userResult.rows.length === 0) {
    return null;
  }

  const row = userResult.rows[0];
  const agencyRows = await db.execute({
    sql: 'SELECT agency_id FROM user_agencies WHERE user_id = ?',
    args: [userId],
  });

  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    role: String(row.role) as AuthUser['role'],
    isActive: Boolean(row.is_active),
    agencyIds: agencyRows.rows.map((agencyRow) => String(agencyRow.agency_id)),
  };
}

export async function requireAuth(c: Context): Promise<AuthUser | Response> {
  const sessionId = c.req.header('X-Session-Id');
  if (!sessionId) {
    return c.json({ error: 'Sesión requerida.' }, 401);
  }

  const db = getDb();
  const sessionResult = await db.execute({
    sql: `SELECT user_id
          FROM auth_sessions
          WHERE id = ?
            AND unixepoch(expires_at) > unixepoch('now')`,
    args: [sessionId],
  });

  if (sessionResult.rows.length === 0) {
    return c.json({ error: 'Sesión inválida o expirada.' }, 401);
  }

  const userId = String(sessionResult.rows[0].user_id);
  const user = await buildAuthUser(userId);

  if (!user || !user.isActive) {
    return c.json({ error: 'Usuario inválido o inactivo.' }, 403);
  }

  return user;
}

export function requireRole(c: Context, user: AuthUser, roles: AuthUser['role'][]): Response | null {
  if (!roles.includes(user.role)) {
    return c.json({ error: 'No autorizado para esta operación.' }, 403);
  }

  return null;
}

export function hasAgencyAccess(user: AuthUser, agencyId: string): boolean {
  if (agencyId === 'GLOBAL') {
    return user.role === 'ADMIN';
  }

  if (user.role === 'ADMIN') {
    return true;
  }

  return user.agencyIds.includes(agencyId);
}

export function ensureAgencyAccess(c: Context, user: AuthUser, agencyId: string): Response | null {
  if (!hasAgencyAccess(user, agencyId)) {
    return c.json({ error: 'No autorizado para acceder a esta agencia.' }, 403);
  }

  return null;
}
