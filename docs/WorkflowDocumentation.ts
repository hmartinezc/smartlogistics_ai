export const WORKFLOW_DOCS = `
# Documentación del Flujo de Trabajo (Workflow Logic)

Este documento detalla la lógica secuencial y las decisiones algorítmicas que toma la aplicación para procesar un documento PDF.

## 1. Fase de Selección (Frontend)
El proceso comienza antes de subir el archivo. El usuario selecciona un **Perfil de Aerolínea** (Botones 369, 406, 729, etc.).
*   **Variable Clave**: \`selectedFormat\` (e.g., '369' | '406_016' | '729' | '865_GROUP').
*   **Propósito**: Esta selección actúa como un "switch" que determina qué set de reglas se enviarán a la IA.

## 2. Fase de Pre-Procesamiento
1.  **Conversión**: El archivo PDF se convierte a **Base64** (cadena de texto) para poder viajar vía API.
2.  **Inyección de Prompt (Dynamic Context Injection)**:
    En \`services/geminiService.ts\`, el sistema evalúa la variable \`selectedFormat\` e inyecta un bloque de texto específico:

    *   **Si es 369 (Atlas/Polar)**:
        *   *Instrucción*: "Busca columnas llamadas EQ, POS o ULD".
        *   *Objetivo*: Diferenciar piezas sueltas de Pallets.
    
    *   **Si es 406 (UPS)**:
        *   *Instrucción*: "Busca la columna Type. 'P'=Full, 'L'=Loose".
        *   *Objetivo*: UPS mezcla tipos en la misma tabla.
    
    *   **Si es 729 (Avianca)**:
        *   *Instrucción*: "Selecciona solo una temperatura (no rangos). Asume Fulls=0 si no hay columna explícita".
        *   *Objetivo*: Limpieza de datos numéricos.

    *   **Si es 865/176 (Aerosan/Otros)**:
        *   *Instrucción*: "Realiza cálculo matemático (Prorrateo). PesoItem = (PiezasItem / TotalPiezas) * PesoTotal".
        *   *Objetivo*: Resolver la falta de pesos individuales en estos formatos.

## 3. Fase de Ejecución (AI Vision)
Se envía a Google Cloud:
*   **Modelo**: \`gemini-2.5-flash\`
*   **Payload**: [Imagen del PDF] + [Prompt Genérico] + [Prompt Específico Inyectado]
*   **Configuración**: \`thinkingBudget: 1024\` (Le da tiempo a la IA para razonar matemáticas y tablas complejas).

## 4. Fase de Post-Procesamiento (Validación)
La IA devuelve un JSON estricto. La aplicación (React) lo recibe y:
1.  **Pinta el Formulario**: Muestra los datos extraídos.
2.  **Auto-Cálculo (Hooks)**:
    *   Si el usuario edita una dimensión, se recalcula el Peso Volumétrico automáticamente.
    *   Si se editan filas, se recalculan los Totales del encabezado (Piezas, Peso).

## 5. Fase de Exportación
Al aprobar:
1.  Se genera un objeto JSON final.
2.  Se añade metadata (fecha, fuente).
3.  Se descarga el archivo para integración con Base de Datos.
`;
