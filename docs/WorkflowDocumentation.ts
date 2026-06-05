export const WORKFLOW_DOCS = `
# Documentación del Flujo de Trabajo (Workflow Logic)

Este documento detalla la lógica secuencial y las decisiones algorítmicas actuales para procesar facturas PDF con Gemini.

## 1. Fase de Selección (Frontend)
El usuario carga uno o varios PDFs desde el módulo de procesamiento de facturas.
*   **Variable clave**: \`selectedFormat\` / \`format\`.
*   **Agente activo**: \`AGENT_GENERIC_A\` (Factura General).
*   **Propósito**: usar un único prompt general para facturas comerciales de logística perecedera, con reglas de extracción, matemática y validación.

## 2. Fase de Pre-Procesamiento
1.  **Carga directa**: \`/api/ai/extract\` recibe \`multipart/form-data\` con \`file\` y \`format\`.
2.  **Carga en background**: \`/api/documents/upload\` guarda PDFs y \`documentWorker\` los procesa en cola.
3.  **Estrategia IA**: \`server/services/documentExtractionService.ts\` selecciona el modo con \`GEMINI_EXTRACTION_SDK\`.
4.  **Legacy/genai directo**: el backend convierte el PDF a Base64 y lo envía a Gemini como \`inlineData\` junto con \`buildExtractionPrompt(format)\`.
5.  **Router Files**: si \`GEMINI_EXTRACTION_SDK=genai-router-files\`, el backend sube el PDF una sola vez con Gemini Files API, clasifica el formato, extrae con el prompt corto de esa categoria y borra el archivo remoto en \`finally\`.
6.  **Schema**: se fuerza salida JSON con \`shared/extractionSchema.ts\`.

## 3. Fase de Ejecución (AI Vision)
Se envía a Gemini:
*   **Modelo**: \`gemini-3-flash-preview\`
*   **Payload**: [PDF en Base64] + [Prompt de extracción]
*   **Configuración**: \`responseMimeType: application/json\` y \`responseSchema: invoiceExtractionSchema\`.
*   **Alternativa sin cache**: \`genai-router-files\` usa \`gemini-3.1-flash-lite\` para clasificar y \`gemini-3-flash-preview\` para extraer, \`thinkingLevel: minimal\`, \`responseSchema\` estricto y reutiliza la URI de Files API entre las dos llamadas.

## 4. Fase de Post-Procesamiento (Validación)
La IA devuelve un JSON estricto y el backend valida la estructura mínima esperada.
1.  **Validación de confianza**: el backend recalcula discrepancias de piezas, EQ y valor total.
2.  **Normalización**: en procesamiento por worker se normalizan MAWB/HAWB antes de persistir.
3.  **Revisión UI**: el usuario revisa los datos extraídos en pantalla antes de exportar o integrar.

## 5. Fase de Exportación
Al aprobar:
1.  Se genera un objeto JSON final.
2.  Se añade metadata operativa del documento/procesamiento.
3.  Se descarga o se envía a integración según la configuración de agencia.
`;
