// ============================================
// SERVIDOR API — Hono + libSQL
// ============================================
// Punto de entrada del backend.
// En desarrollo: solo API en :3001 (Vite hace el proxy)
// En producción: sirve API + archivos estáticos del SPA
// ============================================

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getDb, closeDb } from './db.js';
import { ensureProductMatchMasterSeed } from './productMatchMasterSeed.js';
import { runMigrations } from './schema.js';
import { runSeed } from './seed.js';

// Rutas
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import agenciesRoutes from './routes/agencies.js';
import batchRoutes from './routes/batch.js';
import operationalRoutes from './routes/operational.js';
import productMatchesRoutes from './routes/product-matches.js';
import settingsRoutes from './routes/settings.js';
import plansRoutes from './routes/plans.js';
import aiRoutes from './routes/ai.js';

import fs from 'node:fs';
import path from 'node:path';

const app = new Hono();

// ── CORS (solo necesario en desarrollo; en producción el SPA y la API comparten origen) ──
app.use('/api/*', cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));

// ── Montar rutas de API ──
app.route('/api/auth', authRoutes);
app.route('/api/users', usersRoutes);
app.route('/api/agencies', agenciesRoutes);
app.route('/api/batch', batchRoutes);
app.route('/api/operational', operationalRoutes);
app.route('/api/product-matches', productMatchesRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/plans', plansRoutes);
app.route('/api/ai', aiRoutes);

// ── Health check ──
app.get('/api/health', (c) => c.json({ status: 'ok', db: 'libsql', time: new Date().toISOString() }));

// ── Servir archivos estáticos del SPA en producción ──
const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use('/*', serveStatic({ root: './dist' }));

  // Fallback: SPA routing (cualquier ruta no-API sirve index.html)
  app.get('*', async (c) => {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, 'utf-8');
      return c.html(html);
    }
    return c.text('Not Found', 404);
  });
}

// ── Inicializar BD y arrancar servidor ──
async function start() {
  // Crear directorio de datos si no existe
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = getDb();
  await runMigrations(db);
  await runSeed(db);
  await ensureProductMatchMasterSeed(db);

  const port = Number(process.env.PORT) || 3001;

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`\n🚀 Smart Invoice AI — API Server`);
    console.log(`   Puerto:  ${info.port}`);
    console.log(`   BD:      ${process.env.TURSO_DATABASE_URL || 'file:./data/smart-invoice.db'}`);
    console.log(`   Modo:    ${fs.existsSync(distPath) ? 'Producción (SPA + API)' : 'Desarrollo (solo API)'}`);
    console.log('');
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏹  Cerrando...');
  await closeDb();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDb();
  process.exit(0);
});

start().catch((err) => {
  console.error('❌ Error al iniciar servidor:', err);
  process.exit(1);
});
