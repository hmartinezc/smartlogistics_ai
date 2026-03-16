// ============================================
// CONEXIÓN libSQL / Turso — Capa de Base de Datos
// ============================================
// En desarrollo local: usa archivo SQLite local (file:./data/smart-invoice.db)
// En producción Turso: cambia a URL remota con authToken
// ============================================

import { createClient, type Client } from '@libsql/client';

let _client: Client | null = null;

export interface DbConfig {
  url: string;       // "file:./data/smart-invoice.db" o "libsql://tu-db.turso.io"
  authToken?: string; // Solo para Turso remoto
}

function getConfig(): DbConfig {
  return {
    url: process.env.TURSO_DATABASE_URL || 'file:./data/smart-invoice.db',
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  };
}

export function getDb(): Client {
  if (!_client) {
    const config = getConfig();
    _client = createClient({
      url: config.url,
      authToken: config.authToken,
    });
  }
  return _client;
}

export async function closeDb(): Promise<void> {
  if (_client) {
    _client.close();
    _client = null;
  }
}
