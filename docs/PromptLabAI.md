# Prompt Lab AI

## Objetivo

Prompt Lab AI es un laboratorio admin-only para validar facturas nuevas antes de tocar el flujo operativo. Permite subir un PDF, ejecutar el clasificador y extractor actuales, guardar el resultado y recibir un diagnóstico sobre si el sistema ya puede extraer bien o si hace falta ajustar el clasificador, un extractor existente, una regla determinística, el schema o una nueva categoría visual.

La regla central es: **diagnosticar y documentar primero; aplicar cambios solo después de aprobación humana y pruebas de regresión.**

## V1: Laboratorio guardado

- Solo usuarios `ADMIN` pueden abrir la vista.
- La vista aparece como `Prompt Lab AI` en el menú lateral.
- Cada caso usa una agencia específica y un PDF.
- El PDF se guarda en MinIO bajo `prompt-lab-ai/`.
- El caso no crea `document_jobs`, no crea `batch_items`, no aparece en historial operativo y no envía integraciones.
- El análisis ejecuta el flujo router-files actual: Files API, clasificador, extractor especializado y schema estricto.
- El agente validador revisa PDF, JSON extraído, categoría detectada, señales visuales, métricas y prompts usados.
- El admin puede guardar notas o un JSON esperado como referencia humana.
- El PDF puede eliminarse del caso sin borrar el diagnóstico ni las recomendaciones.

## Persistencia

Las tablas de V1 son:

- `prompt_lab_cases`: caso guardado, agencia, PDF, estado, notas humanas y referencia esperada.
- `prompt_lab_analyses`: extracción, métricas, snapshots de prompts, análisis del validador y propuesta V2.

Los PDFs se guardan fuera de SQLite en el bucket configurado por `MINIO_BUCKET`, con prefijo `prompt-lab-ai/`.

## Veredictos

El agente validador devuelve uno de estos veredictos:

- `OK`: el clasificador y extractor actuales parecen suficientes.
- `REVIEW_NEEDED`: hay dudas o diferencias que requieren revisión humana.
- `PROMPT_IMPROVEMENT_SUGGESTED`: conviene ajustar el clasificador o un extractor existente.
- `NEW_CATEGORY_SUGGESTED`: el documento parece requerir una categoría visual nueva.

El análisis separa recomendaciones para:

- Clasificador.
- Extractor por categoría.
- Nueva categoría visual.
- Cambios de schema o código.
- Reglas determinísticas/backend.
- Costos y plan de validación.

## V2 documentada: aprendizaje guiado

V2 debe convertir un análisis aprobado en una propuesta versionada de cambio. La propuesta sigue siendo humana y auditable; no se aplica automáticamente por defecto.

Estados sugeridos:

- `DRAFT`
- `PENDING_APPROVAL`
- `APPROVED`
- `APPLIED`
- `REJECTED`
- `ROLLED_BACK`

Tipos de propuesta:

- `CLASSIFIER_PROMPT_ADJUSTMENT`
- `EXTRACTOR_PROMPT_ADJUSTMENT`
- `NEW_ROUTER_CATEGORY`
- `SCHEMA_CHANGE`
- `DETERMINISTIC_RULE_CHANGE`

## Flujo V2 propuesto

1. El admin analiza un caso en Prompt Lab AI.
2. El agente propone un parche con tipo, target, racional, diff propuesto, riesgo y plan de validación.
3. El admin revisa la propuesta y la pasa a `PENDING_APPROVAL`.
4. Antes de aplicar, el sistema debe ejecutar pruebas con casos golden/regresión.
5. Si pasa validación, la propuesta puede pasar a `APPROVED`.
6. La aplicación real del cambio debe quedar registrada con versión y posibilidad de rollback.

## Ajustes existentes

Cuando el problema está dentro de una categoría ya soportada, V2 debe proponer cambios sobre:

- `ROUTER_CLASSIFICATION_PROMPT` si el clasificador eligió mal la categoría.
- El extractor de la categoría correspondiente en `services/extractionRouterPrompts.ts`.

La UI debe mostrar la propuesta como diff editable antes de aplicarla.

## Nuevas categorías

Cuando el documento no encaja bien en las categorías actuales, V2 debe proponer:

- Nombre de categoría.
- Señales visuales del clasificador.
- Prompt extractor inicial.
- Casos de prueba requeridos.
- Riesgo y costo esperado.

Crear una categoría nueva implica tocar prompts, pruebas y documentación. No debe activarse sin validación contra facturas existentes.

## Guardrails

- No cambiar el modelo de extracción por costo.
- No aplicar cambios a producción sin aprobación humana.
- No activar una propuesta que aumente tokens sin justificar mejora de precisión.
- No borrar el análisis aunque se elimine el PDF del caso.
- No mezclar Prompt Lab con historial operativo.
