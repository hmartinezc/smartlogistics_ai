import { GoogleGenerativeAI } from '@google/generative-ai';
import { Hono } from 'hono';
import { AI_CONFIG, ERROR_MESSAGES } from '../../config.js';
import { buildExtractionPrompt } from '../../services/agentPrompts.js';
import { invoiceExtractionSchema } from '../../shared/extractionSchema.js';
import { requireAuth } from '../security.js';

const ai = new Hono();

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error(ERROR_MESSAGES.API_KEY_MISSING);
  }
  return apiKey;
}

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
  const format = String(formData.get('format') || 'AGENT_TCBV');

  if (!(file instanceof File)) {
    return c.json({ error: 'Archivo requerido.' }, 400);
  }

  const prompt = buildExtractionPrompt(format as never);
  const genAI = new GoogleGenerativeAI(getApiKey());
  const model = genAI.getGenerativeModel({
    model: AI_CONFIG.MODEL_ID,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: invoiceExtractionSchema,
    },
  });

  try {
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: file.type || 'application/octet-stream',
          data: fileBuffer.toString('base64'),
        },
      },
      { text: prompt },
    ]);

    const text = result.response.text();
    if (!text) {
      return c.json({ error: 'No se recibió respuesta del modelo.' }, 502);
    }

    return c.json(JSON.parse(text));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error(`Error IA para ${authUser.email}:`, error);
    return c.json({ error: `${ERROR_MESSAGES.PROCESSING_ERROR}: ${message}` }, 502);
  }
});

export default ai;
