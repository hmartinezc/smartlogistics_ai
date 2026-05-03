import { GoogleGenerativeAI } from '@google/generative-ai';
import { InvoiceData, AgentType } from '../types';
import { AI_CONFIG, ERROR_MESSAGES } from '../config';
import { buildExtractionPrompt } from './agentPrompts';
import { invoiceExtractionSchema } from '../shared/extractionSchema';

// Inicialización lazy del cliente de Gemini
let genAIInstance: GoogleGenerativeAI | null = null;

const getGenAI = (): GoogleGenerativeAI => {
  if (!process.env.API_KEY) {
    throw new Error(ERROR_MESSAGES.API_KEY_MISSING);
  }
  if (!genAIInstance) {
    genAIInstance = new GoogleGenerativeAI(process.env.API_KEY);
  }
  return genAIInstance;
};

// Utility: Delay para reintentos
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Utility: Convertir File a Base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const extractLogisticsData = async (
  file: File,
  format: AgentType,
  retryCount = 0,
): Promise<InvoiceData> => {
  const genAI = getGenAI();
  const base64Data = await fileToBase64(file);

  // Generar prompt usando el módulo de agentes
  const prompt = buildExtractionPrompt(format);

  try {
    const model = genAI.getGenerativeModel({
      model: AI_CONFIG.MODEL_ID,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: invoiceExtractionSchema,
      },
    });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: file.type,
          data: base64Data,
        },
      },
      { text: prompt },
    ]);

    const response = result.response;
    const text = response.text();

    if (!text) {
      throw new Error('No se recibió respuesta del modelo');
    }

    const parsedData = JSON.parse(text) as InvoiceData;

    // Validación básica de datos requeridos
    if (!parsedData.invoiceNumber || !parsedData.lineItems) {
      throw new Error('Datos incompletos en la respuesta');
    }

    return parsedData;
  } catch (error: any) {
    console.error(`AI Error (intento ${retryCount + 1}/${AI_CONFIG.MAX_RETRIES}):`, error);

    // Reintentar si no hemos alcanzado el máximo
    if (retryCount < AI_CONFIG.MAX_RETRIES - 1) {
      const isRateLimitError =
        error?.message?.includes('429') ||
        error?.message?.includes('rate') ||
        error?.message?.includes('quota');

      const waitTime = isRateLimitError
        ? AI_CONFIG.RETRY_DELAY_MS * (retryCount + 2) // Backoff exponencial para rate limit
        : AI_CONFIG.RETRY_DELAY_MS;

      await delay(waitTime);
      return extractLogisticsData(file, format, retryCount + 1);
    }

    // Error final después de todos los reintentos
    const errorMessage = error?.message || ERROR_MESSAGES.PROCESSING_ERROR;
    throw new Error(`${ERROR_MESSAGES.PROCESSING_ERROR}: ${errorMessage}`);
  }
};
