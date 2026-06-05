export const TECHNICAL_DOCS = `
# Smart Logistics Extractor - Documentación Técnica

## 1. Visión General
Esta aplicación utiliza Inteligencia Artificial Generativa multimodal para extraer datos estructurados de facturas comerciales de logística perecedera en PDF.

## 2. Tecnologías Clave
- **Frontend**: React + TypeScript.
- **AI Model**: Google Gemini Flash 3 \`gemini-3-flash-preview\` (configurado en \`config.ts\` o \`GEMINI_MODEL_ID\`).
- **Extracción default en Docker**: \`@google/genai\` con \`GEMINI_EXTRACTION_SDK=genai-router-files\`, Files API, clasificador y extractor especializado.
- **Baseline estable**: \`@google/generative-ai\` con \`GEMINI_EXTRACTION_SDK=legacy\` para rollback y comparación.
- **Cache/diagnóstico**: \`@google/genai\` para \`cachedContent\` explícito y endpoints de inspección.

## 3. Flujo de Datos (Paso a Paso)

1.  **Ingesta (Frontend)**: 
    - El usuario selecciona un archivo PDF.
    - La UI envía el archivo al backend mediante \`multipart/form-data\`.
    
2.  **Autenticación y Envío**:
    - Las rutas de extracción requieren sesión de la aplicación.
    - El backend usa \`GEMINI_API_KEY\` o \`API_KEY\` para llamar a Gemini.
    - En el modo Docker default, el backend sube el PDF una vez a Gemini Files API, clasifica el formato y reutiliza la URI para extraer con el prompt especializado.
    - El flujo \`legacy\` sigue disponible para comparar contra el prompt completo anterior. El camino \`genai\` con \`cachedContent\` queda disponible solo para pruebas controladas.
    
3.  **Procesamiento (Vision Reasoning)**:
    - El modelo Gemini Flash 3 "mira" el documento (no usa OCR tradicional, usa visión cognitiva).
    - Identifica tablas, columnas y relaciones visuales.
    - Aplica reglas de extracción, cálculo de EQ, distribución de tallos y validación matemática.

4.  **Extracción Estructurada (JSON)**:
    - El modelo rellena un esquema JSON estricto.

5.  **Validación (UI)**:
    - El backend recalcula razones de confianza para piezas, EQ y valor.
    - El usuario revisa los datos antes de exportar o integrar.

## 4. Costos y Cache del Prompt

El proyecto utiliza el modelo **Gemini Flash 3** (\`gemini-3-flash-preview\`) para extracción y **Gemini Flash Lite 3.1** (\`gemini-3.1-flash-lite\`) para clasificación. La prioridad operativa actual es validar el router sin cache, manteniendo legacy como baseline de comparación. El ahorro con cache explícito queda opt-in mientras se valida su confiabilidad con PDFs reales.

### A. Cache explicito del super prompt
- El backend crea un cache por \`model + agentType + hash(prompt)\`.
- El TTL se controla con \`GEMINI_PROMPT_CACHE_TTL_SECONDS\` y por defecto dura 4 horas.
- El uso de \`cachedContent\` durante extracción requiere \`GEMINI_EXTRACTION_SDK=genai\` y \`GEMINI_PROMPT_CACHE_USE_FOR_EXTRACTION=true\`; ambos deben probarse deliberadamente.
- Con el valor recomendado \`GEMINI_EXTRACTION_SDK=genai-router-files\`, el cache puede crearse/consultarse, pero no participa en la extracción.
- Si el camino \`genai\` queda activado, al llamar \`POST /api/documents/process\` el backend intenta dejar listo el cache de cada formato antes de encolar jobs; asi el primer ciclo del worker puede usar \`cachedContent\`.
- El calentamiento automático está apagado por defecto con \`GEMINI_PROMPT_CACHE_AUTO_WARM_ENABLED=false\`; el cache se puede calentar manualmente con \`POST /api/ai/cache-warm\`.
- Si Gemini rechaza o expira el cache, el backend cae a extracción normal sin romper el procesamiento y respeta un cooldown antes de volver a intentar.

### B. Telemetria
- Cada extracción loguea \`sdk\`, \`cacheMode\`, duración, \`promptTokenCount\`, \`cachedContentTokenCount\` y \`candidatesTokenCount\` cuando Gemini los devuelve.
- \`GET /api/ai/cache-status\` devuelve caches en memoria, estado \`warming/ready/cooldown/expired\`, duración de creación, timeout de cache, SDK activo, modelo activo, huella segura de API key, configuración del worker y últimas extracciones.
- La tarifa exacta debe revisarse en la página vigente de precios de Gemini antes de proyectar costos.

## 5. Estrategia de Prompting (Schema-First)

En lugar de pedir texto libre, definimos un \`responseSchema\` en TypeScript y usamos un prompt centralizado.
- **Agente activo**: \`AGENT_GENERIC_A\` / Factura General.
- **Prompt**: \`services/agentPrompts.ts\`.
- **Schema**: \`shared/extractionSchema.ts\`.
- **Endpoint directo**: \`POST /api/ai/extract\`.
- **Procesamiento en cola**: \`/api/documents/upload\` + \`documentWorker\`.
- **Reglas clave**: extraer footer impreso sin autocorregir, calcular EQ por tipo de caja, corregir \`lineItems.totalValue\` con \`totalStems * unitPrice\`, y reportar discrepancias mediante \`confidenceReasons\`.
`;
