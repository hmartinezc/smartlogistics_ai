export const TECHNICAL_DOCS = `
# Smart Logistics Extractor - Documentación Técnica

## 1. Visión General
Esta aplicación utiliza Inteligencia Artificial Generativa (Multimodal) para extraer datos estructurados de documentos logísticos (PDFs de guías aéreas y recibos de bodega).

## 2. Tecnologías Clave
- **Frontend**: React + TypeScript.
- **AI Model**: Google Gemini Flash 3 \`gemini-3-flash-preview\` (configurado en \`config.ts\`).
- **SDK**: @google/generative-ai (Oficial de Google).

## 3. Flujo de Datos (Paso a Paso)

1.  **Ingesta (Frontend)**: 
    - El usuario selecciona un archivo PDF.
    - El navegador convierte el archivo binario a una cadena Base64.
    
2.  **Autenticación y Envío**:
    - La aplicación utiliza una **API Key** (Variable de entorno \`API_KEY\`).
    - No requiere login de usuario final ("Sign in with Google").
    - La petición viaja segura a los servidores de Google con el PDF y el Prompt.
    
3.  **Procesamiento (Vision Reasoning)**:
    - El modelo Gemini Flash 3 "mira" el documento (no usa OCR tradicional, usa visión cognitiva).
    - Identifica tablas, columnas y relaciones visuales.
    - Aplica reglas de corrección (ej. "OFL" empieza con la letra O, no cero).

4.  **Extracción Estructurada (JSON)**:
    - El modelo rellena un esquema JSON estricto.

5.  **Validación (UI)**:
    - El usuario revisa los datos y la aplicación recalcula totales automáticamente.

## 4. Costos y Gratuidad (Free Tier)

El proyecto utiliza el modelo **Gemini Flash 3** (\`gemini-3-flash-preview\`), bloqueado por calidad de extracción en facturas PDF:

### A. Capa Gratuita (Free Tier)
- **Costo**: $0 USD.
- **Límite Diario**: ~1,500 Peticiones (RPD).
- **Límite Velocidad**: ~15 Peticiones por Minuto (RPM).
- *Nota*: Ideal para desarrollo y pruebas.

### B. Capa de Pago (Pay-as-you-go)
- Se activa al vincular facturación en Google Cloud.
- **Privacidad**: Los datos NO se usan para entrenar modelos.
- **Costo Input**: ~$0.075 USD / 1 millón de tokens.
- **Costo Output**: ~$0.30 USD / 1 millón de tokens.
- **Estimado**: ~$1.00 USD permite procesar aprox. 3,000 documentos.

## 5. Estrategia de Prompting (Schema-First)

En lugar de pedir texto libre, definimos un \`responseSchema\` en TypeScript.
- **Formato 369**: Instrucciones específicas para buscar columnas "EQ" o "POS" para identificar Fulls.
- **Formato 406**: Instrucciones para diferenciar carga "Loose" vs "Pallet".
- **Formato 729**: Lógica para temperatura única y fulls implícitos.
- **Formato 865**: Lógica matemática para prorratear pesos totales.
`;
