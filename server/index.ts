// ============================================
// SERVIDOR API — Hono + libSQL
// ============================================
// Punto de entrada del backend.
// En desarrollo: solo API en :3001 (Vite hace el proxy)
// En producción: sirve API + archivos estáticos del SPA
// ============================================

import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { randomUUID } from 'node:crypto';
import { getDb, closeDb } from './db.js';
import { rateLimit, securityHeaders } from './httpHardening.js';
import { ensureProductMatchMasterSeed } from './productMatchMasterSeed.js';
import { runMigrations } from './schema.js';
import { runSeed } from './seed.js';
import { cleanupExpiredGeminiExtractionEvents } from './services/geminiExtractionEvents.js';
import { ensureInvoiceBucket, isMinioConfigured } from './services/minioService.js';
import {
  getDocumentWorkerRuntimeConfig,
  startDocumentWorker,
  type DocumentWorkerHandle,
} from './workers/documentWorker.js';

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
import aiReviewRoutes from './routes/ai-review.js';
import auditRoutes from './routes/audit.js';
import documentsRoutes from './routes/documents.js';
import integrateRoutes from './routes/integrate.js';

import fs from 'node:fs';
import path from 'node:path';

const app = new Hono();
let documentWorker: DocumentWorkerHandle | null = null;

type ReadinessCheck = {
  ok: boolean;
  error?: string;
};

type ReadinessResponse = {
  checks: {
    db: ReadinessCheck;
    minio: ReadinessCheck;
    worker: ReadinessCheck;
  };
  status: 'ok' | 'degraded';
  time: string;
};

function getPublicErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function buildReadinessResponse(): Promise<ReadinessResponse> {
  const checks: ReadinessResponse['checks'] = {
    db: { ok: false },
    minio: { ok: false },
    worker: { ok: false },
  };

  try {
    await getDb().execute('SELECT 1');
    checks.db = { ok: true };
  } catch (error) {
    checks.db = { ok: false, error: getPublicErrorMessage(error) };
  }

  try {
    if (!isMinioConfigured()) {
      throw new Error('MinIO no está configurado.');
    }
    await ensureInvoiceBucket();
    checks.minio = { ok: true };
  } catch (error) {
    checks.minio = { ok: false, error: getPublicErrorMessage(error) };
  }

  const workerConfig = getDocumentWorkerRuntimeConfig();
  checks.worker =
    !workerConfig.enabled || workerConfig.active
      ? { ok: true }
      : { ok: false, error: 'Document worker no está activo.' };

  const ok = Object.values(checks).every((check) => check.ok);

  return {
    checks,
    status: ok ? 'ok' : 'degraded',
    time: new Date().toISOString(),
  };
}

app.onError((error, c) => {
  const errorId = randomUUID();
  console.error(`[${errorId}] Error no controlado en API:`, error);

  return c.json(
    {
      error: 'Error interno del servidor.',
      errorId,
    },
    500,
  );
});

// ── CORS (solo necesario en desarrollo; en producción el SPA y la API comparten origen) ──
app.use('*', securityHeaders());
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  }),
);

// ── Rate limits de protección para rutas sensibles/no masivas ──
app.use('/api/auth/login', rateLimit({ keyPrefix: 'auth-login', max: 20, windowMs: 15 * 60_000 }));
app.use(
  '/api/ai-review/*',
  rateLimit({ keyPrefix: 'ai-review', max: 30, windowMs: 60 * 60_000 }),
);
app.use(
  '/api/integrate/*',
  rateLimit({ keyPrefix: 'integrate', max: 120, windowMs: 60 * 60_000 }),
);

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
app.route('/api/ai-review', aiReviewRoutes);
app.route('/api/audit', auditRoutes);
app.route('/api/documents', documentsRoutes);
app.route('/api/integrate', integrateRoutes);

// ── Health check ──
app.get('/api/health', (c) =>
  c.json({ status: 'ok', db: 'libsql', time: new Date().toISOString() }),
);

// ── Readiness check: valida dependencias necesarias para procesar documentos ──
app.get('/api/ready', async (c) => {
  const readiness = await buildReadinessResponse();
  return c.json(readiness, readiness.status === 'ok' ? 200 : 503);
});

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
  cleanupExpiredGeminiExtractionEvents().catch((error) => {
    console.warn('No se pudo limpiar observabilidad Gemini expirada al iniciar.', error);
  });
  await runSeed(db);
  await ensureProductMatchMasterSeed(db);
  documentWorker = await startDocumentWorker();

  const port = Number(process.env.PORT) || 3001;

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`\n🚀 Smart Invoice AI — API Server`);
    console.log(`   Puerto:  ${info.port}`);
    console.log(`   BD:      ${process.env.TURSO_DATABASE_URL || 'file:./data/smart-invoice.db'}`);
    console.log(
      `   Modo:    ${fs.existsSync(distPath) ? 'Producción (SPA + API)' : 'Desarrollo (solo API)'}`,
    );
    console.log('');
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏹  Cerrando...');
  await documentWorker?.stop();
  await closeDb();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await documentWorker?.stop();
  await closeDb();
  process.exit(0);
});

start().catch((err) => {
  console.error('❌ Error al iniciar servidor:', err);
  process.exit(1);
});
