# AutoPilot AI

## Objetivo

AutoPilot AI es la base de mejora continua del sistema de extracción de facturas. Su objetivo es revisar resultados reales, entender el costo de cada ejecución y proponer mejoras técnicas al clasificador, extractor y prompts sin romper el flujo operativo actual.

La premisa principal es: mejorar precisión y confiabilidad sin disparar costos, y nunca aplicar cambios automáticamente sin aprobación humana.

## Alcance actual

La versión actual es manual y 100% aditiva.

- Solo usuarios `ADMIN` pueden usar la vista.
- La vista aparece como `AutoPilot AI` en el menú lateral.
- El admin selecciona fecha y agencia, o vista global.
- Al ejecutar la validación, el backend revisa `gemini_extraction_events`, agrupa eventos por `document_job_id`, suma tokens/costos de clasificador y extractor, y selecciona hasta 3 facturas con mayor costo estimado.
- Las muestras se guardan en base de datos y cada PDF seleccionado se copia a una zona dedicada de MinIO bajo `autopilot-ai/`.
- Cada item permite ver PDF, JSON extraído, eventos Gemini, tokens, costo estimado y snapshots de prompts.
- El admin puede ejecutar manualmente un agente revisor sobre el documento seleccionado.
- El agente revisor recibe el PDF, el resultado extraído, los prompts usados, eventos y métricas.
- El agente revisor guarda un análisis estructurado con problemas detectados, mejoras técnicas, recomendaciones de prompt, guardrails de costo y plan de validación.

## Lo que no hace todavía

- No analiza automáticamente todos los días.
- No modifica prompts activos.
- No cambia el modelo de extracción.
- No corrige resultados extraídos.
- No crea nuevas categorías de documentos.
- No ejecuta pruebas de regresión antes de aprobar una recomendación.

## Modelo usado

El agente revisor usa:

1. `GEMINI_AI_REVIEW_MODEL_ID`, si está configurado.
2. Si no existe, `GEMINI_MODEL_ID`.
3. Si no existe, el modelo por defecto del proyecto: `gemini-3-flash-preview`.

Esto mantiene consistencia con el extractor validado y permite cambiar el modelo del revisor en el futuro sin tocar el extractor principal.

## Persistencia

Las tablas actuales son:

- `ai_review_runs`: carpeta/muestra de AutoPilot AI para una fecha y filtro.
- `ai_review_items`: facturas seleccionadas para revisión.
- `ai_review_analyses`: análisis del agente revisor y propuestas pendientes.
- `ai_prompt_snapshots`: snapshots trazables de prompts usados.

Los PDFs operativos siguen viviendo en `document_jobs.object_key`, pero AutoPilot AI conserva una copia independiente en MinIO:

- `ai_review_items.review_storage_bucket`
- `ai_review_items.review_object_key`
- `ai_review_items.review_file_size_bytes`

Esto permite seguir revisando muestras aunque luego se limpien documentos operativos antiguos.

## Próxima iteración recomendada

La siguiente fase debería convertir AutoPilot AI en un ciclo de aprendizaje más robusto, todavía con aprobación humana.

1. **Análisis múltiple**
   - Permitir analizar los 3 documentos de una muestra en una sola acción.
   - Agregar estado por item y estado agregado de la muestra.

2. **Gestión de retención**
   - Definir política de limpieza para copias `autopilot-ai/`.
   - Marcar muestras como dataset dorado para conservarlas indefinidamente.

3. **Registro de propuestas**
   - Convertir recomendaciones de prompt en propuestas versionadas.
   - Separar propuestas para clasificador, extractor y reglas determinísticas.
   - Mantener estados `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`.

4. **Pruebas antes de aprobar**
   - Crear dataset dorado con facturas reales seleccionadas.
   - Ejecutar comparación antes/después para medir precisión, tokens y costo.
   - Bloquear aprobación si sube mucho el costo sin mejora clara.

5. **Prompts dinámicos aprobados**
   - Permitir activar una versión aprobada de prompt sin desplegar código.
   - Guardar qué versión se usó en cada extracción.
   - Mantener rollback rápido a la versión anterior.

6. **Automatización controlada**
   - Crear una tarea diaria opcional que genere la muestra automáticamente.
   - Mantener ejecución del agente revisor como manual al inicio.
   - Más adelante permitir análisis automático con presupuesto máximo diario.

## Criterios de seguridad y costo

- Todo cambio debe ser reversible.
- Ninguna propuesta debe tocar producción sin aprobación admin.
- El extractor principal debe seguir funcionando si AutoPilot AI falla.
- Toda recomendación debe incluir impacto esperado y costo estimado.
- Aumentar tokens solo es aceptable si mejora precisión en casos reales.
- Crear una categoría nueva implica trabajo de desarrollo, pruebas y documentación.
