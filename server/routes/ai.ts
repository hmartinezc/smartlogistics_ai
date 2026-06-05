import { Hono } from 'hono';
import { ERROR_MESSAGES } from '../../config.js';
import {
  compareInvoiceExtractionModes,
  ensureExtractionPromptCache,
  extractInvoiceFromBuffer,
  getGeminiExtractionDiagnostics,
  getGeminiExtractionRuntimeConfig,
  getGeminiModelId,
  getLegacyPromptCacheDiagnostics,
} from '../services/documentExtractionService.js';
import {
  getGeminiPromptCacheConfig,
  getGeminiPromptCacheDiagnostics,
  isGeminiPromptCacheEnabled,
} from '../services/geminiPromptCache.js';
import { requireAuth, requireRole } from '../security.js';
import { getDocumentWorkerRuntimeConfig } from '../workers/documentWorker.js';

const ai = new Hono();

ai.get('/cache-status', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const roleError = requireRole(c, authUser, ['ADMIN']);
  if (roleError) {
    return roleError;
  }

  const promptCaches = [
    ...(await getGeminiPromptCacheDiagnostics()),
    ...getLegacyPromptCacheDiagnostics(),
  ];

  return c.json({
    enabled: isGeminiPromptCacheEnabled(),
    config: getGeminiPromptCacheConfig(),
    extractionConfig: getGeminiExtractionRuntimeConfig(),
    model: getGeminiModelId(),
    promptCaches,
    recentExtractions: getGeminiExtractionDiagnostics(),
    workerConfig: getDocumentWorkerRuntimeConfig(),
  });
});

ai.post('/cache-warm', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const roleError = requireRole(c, authUser, ['ADMIN']);
  if (roleError) {
    return roleError;
  }

  const body = await c.req.json().catch(() => ({}));
  const result = await ensureExtractionPromptCache(
    typeof body.format === 'string' ? body.format : 'AGENT_GENERIC_A',
  );

  const promptCaches = [
    ...(await getGeminiPromptCacheDiagnostics()),
    ...getLegacyPromptCacheDiagnostics(),
  ];

  return c.json({
    ...result,
    config: getGeminiPromptCacheConfig(),
    promptCaches,
  });
});

ai.post('/extract', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Solicitud inválida. Use multipart/form-data.' }, 400);
  }

  const file = formData.get('file');
  const format = String(formData.get('format') || 'AGENT_GENERIC_A');

  if (!(file instanceof File)) {
    return c.json({ error: 'Archivo requerido.' }, 400);
  }

  try {
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const result = await extractInvoiceFromBuffer({
      buffer: fileBuffer,
      mimeType: file.type || 'application/octet-stream',
      format,
      telemetryContext: {
        originalFileName: file.name,
        source: 'api-extract',
        userEmail: authUser.email,
        userId: authUser.id,
        userName: authUser.name,
      },
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error(`Error IA para ${authUser.email}:`, error);
    return c.json({ error: `${ERROR_MESSAGES.PROCESSING_ERROR}: ${message}` }, 502);
  }
});

ai.post('/compare', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const roleError = requireRole(c, authUser, ['ADMIN']);
  if (roleError) {
    return roleError;
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Solicitud inválida. Use multipart/form-data.' }, 400);
  }

  const file = formData.get('file');
  const format = String(formData.get('format') || 'AGENT_GENERIC_A');

  if (!(file instanceof File)) {
    return c.json({ error: 'Archivo requerido.' }, 400);
  }

  try {
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const result = await compareInvoiceExtractionModes({
      buffer: fileBuffer,
      mimeType: file.type || 'application/octet-stream',
      format,
      telemetryContext: {
        originalFileName: file.name,
        source: 'api-compare',
        userEmail: authUser.email,
        userId: authUser.id,
        userName: authUser.name,
      },
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error(`Error comparando IA para ${authUser.email}:`, error);
    return c.json({ error: `${ERROR_MESSAGES.PROCESSING_ERROR}: ${message}` }, 502);
  }
});

export default ai;
