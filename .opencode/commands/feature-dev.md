---
description: Complete feature development workflow — discover, explore, design, implement, test, review, and document. Uses project agents at each phase.
---

# /feature-dev <feature-description>

Workflow completo de desarrollo de features para Smart Logistics Extractor. 7 fases con agentes especializados en cada una.

## Workflow

### Fase 1: Discovery

Lee el requerimiento. Identifica:

- Qué subsystems se tocan (frontend, backend, AI pipeline, database)
- Constraints: cost (Gemini), performance, security, schema
- Acceptance criteria concretos

Si hay ambigüedad → pregunta UNA cosa y espera respuesta.

### Fase 2: Codebase Exploration

Usa `@code-explorer` para analizar el código existente relevante:

```
@code-explorer analiza cómo funciona actualmente [área relacionada] y mapea:
- Archivos que se tocarían
- Patrones existentes
- Puntos de integración
- Dependencias entre módulos
```

### Fase 3: Clarifying Questions

Presenta hallazgos de exploración. Haz preguntas específicas sobre:

- Diseño de API (si es nueva ruta Hono)
- Esquema de datos (si toca DB)
- Flujo de UI (si es frontend)
- Impacto en pipeline AI (si toca extracción)
- Edge cases identificados

ESPERA respuesta del usuario.

### Fase 4: Architecture Design

Usa `@architect` para diseñar la feature:

```
@architect diseña la arquitectura para [feature]. Produce un ADR con:
- Decisión de diseño
- Alternativas consideradas
- Plan de migración (si aplica)
- Archivos afectados
```

ESPERA aprobación del usuario antes de implementar.

### Fase 5: Implementation

Implementa siguiendo el diseño aprobado. Reglas:

- Usa `@tdd-guide` si la feature tiene lógica testeable
- Commits pequeños y enfocados (un archivo/grupo lógico por commit)
- Sigue las convenciones del proyecto:
  - Frontend: `services/apiClient.ts` para API calls, `hooks/index.ts` para lógica
  - Backend: `app.route()` para montar módulos, Zod validation en inputs
  - DB: migraciones idempotentes con `IF NOT EXISTS`
  - AI: pipeline `agentPrompts.ts → extractionSchema.ts → ai.ts`
- Después de cada grupo de cambios: `npm run typecheck`

### Fase 6: Quality Review

Verificación en capas:

**Build:**

```bash
npm run typecheck
npm run build
```

**Quality:**

```bash
npm run quality
npm run scan-secrets
```

**Review:** Usa `@code-reviewer` para revisar los cambios:

```
@code-reviewer revisa los cambios staged/uncommitted para esta feature
```

**Docs:** Si se tocó `server/schema.ts` → verifica `docs/DatabaseSchema.md`

### Fase 7: Summary

Resume:

- Qué se construyó
- Archivos modificados/creados
- Limitaciones conocidas
- Instrucciones para probar
- Si requiere deploy o migración

Usa `@doc-updater` si se necesita actualizar documentación:

```
@doc-updater actualiza la documentación afectada por los cambios de [feature]
```

## Reglas de Hierro

- NUNCA saltes la fase de diseño para features que tocan schema, AI pipeline, o auth
- NUNCA merges sin pasar quality review
- Si el typecheck falla → corrige ANTES de seguir
- Si tocas `shared/extractionSchema.ts` → actualiza `services/agentPrompts.ts` para consistencia
- Si tocas `server/schema.ts` → actualiza `docs/DatabaseSchema.md`
- Si agregas variables de entorno → actualiza `.env.example`
