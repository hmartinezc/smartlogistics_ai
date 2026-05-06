import { Hono } from 'hono';
import { ERROR_MESSAGES } from '../../config.js';
import { extractInvoiceFromBuffer } from '../services/documentExtractionService.js';
import { requireAuth } from '../security.js';

const ai = new Hono();

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
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error(`Error IA para ${authUser.email}:`, error);
    return c.json({ error: `${ERROR_MESSAGES.PROCESSING_ERROR}: ${message}` }, 502);
  }
});

export default ai;
