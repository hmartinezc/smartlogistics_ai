---
description: Complete feature development workflow — discover, explore, design, implement, test, review, and document. Uses project agents at each phase.
agent: build
subtask: true
---

# /feature-dev <feature-description>

Workflow completo de desarrollo de features para Smart Logistics Extractor. 7 fases con agentes especializados en cada una. El agente `build` orquesta el pipeline completo.

**Antes de empezar:** Carga los skills relevantes según el tipo de feature:
- Si toca DB → `skill: database-migrations`
- Si toca AI pipeline → `skill: cost-aware-llm-pipeline`
- Si toca customs → `skill: customs-trade-compliance`

---

## Workflow

### Fase 1: Discovery

Lee el requerimiento del usuario. Identifica y registra:

```
## Discovery Analysis

### Subsystems Impactados
- [ ] Frontend (React + Vite) — ¿Nuevos componentes? ¿Nuevas rutas?
- [ ] Backend (Hono + libSQL) — ¿Nuevas rutas API? ¿Nuevos middleware?
- [ ] AI Pipeline (Gemini) — ¿Cambios en prompts? ¿Nuevo tipo de extracción?
- [ ] Database — ¿Nuevas tablas? ¿Nuevas columnas? ¿Migraciones?
- [ ] Auth/Security — ¿Nuevos roles? ¿Nuevos permisos?

### Constraints
- 💰 Cost (Gemini API): ¿Aumenta el uso? ¿Requiere caching?
- ⚡ Performance: ¿Impacto en queries? ¿Tamaño de bundle?
- 🔒 Security: ¿Nuevos endpoints? ¿Datos sensibles?
- 📐 Schema: ¿Cambios en extractionSchema o DB schema?

### Acceptance Criteria
1. [Criterio 1 — concreto y verificable]
2. [Criterio 2 — concreto y verificable]
3. ...
```

**Regla:** Si hay ambigüedad → pregunta UNA sola cosa clara y concreta. Espera respuesta del usuario antes de continuar.

---

### Fase 2: Codebase Exploration

Delega la exploración al agente especializado:

```
@code-explorer analiza cómo funciona actualmente [área relacionada con el feature] y produce un reporte con:

1. ARCHIVOS QUE SE TOCARÍAN — lista concreta de paths
2. PATRONES EXISTENTES — convenciones de código, estructura de archivos, naming
3. PUNTOS DE INTEGRACIÓN — dónde se conecta con otros módulos (imports, API calls, DB queries)
4. DEPENDENCIAS ENTRE MÓDULOS — qué depende de qué, orden de implementación
5. RIESGOS DE MODIFICACIÓN — qué podría romperse, edge cases específicos del feature

Incluye en el reporte:
- Frontend: patterns en components/, hooks/index.ts, services/apiClient.ts
- Backend: patterns en server/routes/, server/schema.ts, middleware
- DB: estado actual del schema, migraciones existentes, seed data relevante
- AI: pipeline actual, prompts existentes, flujo de extracción
```

**Output esperado:** Un mapa claro del terreno antes de diseñar. No escribas código todavía.

---

### Fase 3: Clarifying Questions

Basado en los hallazgos de la exploración, presenta preguntas específicas. Agrupa por área:

```
## Preguntas de Diseño

### API (si es nueva ruta Hono)
- ¿Qué método HTTP? ¿Path bajo /api/...?
- ¿Requiere auth? ¿Qué roles?
- ¿Request body / query params? ¿Formato de respuesta?

### Database (si toca schema)
- ¿Nueva tabla o columna en tabla existente?
- ¿Relaciones con datos existentes?
- ¿Necesita seed data?

### Frontend (si es UI nueva)
- ¿Dónde se inserta en el flujo de App.tsx?
- ¿Qué estados necesita? (loading, empty, error, success)
- ¿Reutiliza componentes existentes o son nuevos?

### AI Pipeline (si toca extracción)
- ¿Nuevo tipo de documento o modificación de existente?
- ¿Cambios en el prompt o en el schema de salida?
- ¿Impacto en costos de Gemini?

### Edge Cases Identificados
- [Lista de edge cases descubiertos en la exploración]
```

ESPERA respuesta del usuario antes de pasar a diseño.

---

### Fase 4: Architecture Design

**Paso 4a — Diseño principal (SIEMPRE):**

```
@architect diseña la arquitectura para [feature]. Produce un ADR (Architecture Decision Record) con:

1. DECISIÓN DE DISEÑO — enfoque elegido y justificación
2. ALTERNATIVAS CONSIDERADAS — qué otras opciones se evaluaron y por qué se descartaron
3. PLAN DE IMPLEMENTACIÓN — fases ordenadas por dependencia
4. ARCHIVOS AFECTADOS — lista completa con [CREATE], [MODIFY], [DELETE]
5. DATA FLOW — cómo se mueven los datos (diagrama textual o mermaid)
6. PLAN DE MIGRACIÓN — si aplica (DB migrations, cambios de API, breaking changes)
```

**Paso 4b — Revisión de schema (CONDICIONAL):**

```
IF el diseño toca server/schema.ts (nuevas tablas, columnas, índices):

@database-reviewer revisa el diseño de schema propuesto para [feature]. Verifica:
- Idempotencia de migraciones (IF NOT EXISTS)
- Índices necesarios para las queries planeadas
- Tipos de datos correctos (TEXT vs INTEGER vs REAL)
- Foreign keys y constraints apropiados
- Compatibilidad con seed data existente
```

ESPERA aprobación explícita del usuario antes de implementar. El usuario debe decir "aprobado", "ok", "procede" o similar.

---

### Fase 5: Implementation

Implementa siguiendo el diseño aprobado. Trabaja en mini-ciclos:

#### Sub-fase 5a: Preparación

```
Plan de commits:
1. [ ] [CREATE/MODIFY] path/to/file1.ts — descripción breve
2. [ ] [CREATE/MODIFY] path/to/file2.ts — descripción breve
3. [ ] ...
```

Orden de implementación: **tipos compartidos → DB schema → backend → frontend**.

#### Sub-fase 5b: Ciclo de implementación (repetir por cada grupo lógico)

Para cada grupo de archivos (1-5 archivos relacionados):

1. **Implementa** los cambios del grupo actual
2. **Ejecuta** `npm run typecheck`
3. **Si typecheck falla** → corrige los errores inmediatamente. No sigas al siguiente grupo con errores pendientes.
4. **Si typecheck pasa** → continúa al siguiente grupo

```
Ciclo actual: [1/4] — Grupo: shared/extractionSchema.ts + services/agentPrompts.ts
✅ Implementado
✅ npm run typecheck → PASS
⏭️ Siguiente grupo...
```

#### Sub-fase 5c: TDD (CONDICIONAL)

```
IF la feature tiene lógica testeable (funciones puras, validación, transformación de datos):

@tdd-guide escribe tests para [feature] siguiendo el ciclo Red-Green-Refactor.
Usa Vitest (si está instalado) o tests manuales verificables.

Tests mínimos requeridos:
- Happy path
- Error path
- Edge case identificado en Fase 3
```

#### Reglas de implementación:

| Área | Convención |
|------|-----------|
| Frontend API calls | `services/apiClient.ts` con `X-Session-Id` |
| Frontend state | `hooks/index.ts` centraliza lógica reutilizable |
| Backend rutas | `app.route()` para montar módulos bajo `/api/*` |
| Backend validación | Zod schemas en inputs (c.req.valid()) |
| DB migraciones | Idempotentes con `IF NOT EXISTS` |
| AI pipeline | `agentPrompts.ts → extractionSchema.ts → ai.ts` |
| Auth | Verificar sesión con `X-Session-Id` donde se requiera |

---

### Fase 6: Quality Review

Verificación en capas con agentes especializados. El orden importa: corrige cada capa antes de pasar a la siguiente.

#### Capa 6a: Build (SIEMPRE)

```bash
npm run typecheck
npm run build
```

```
IF typecheck o build falla:
  → @build-error-resolver corrige los errores de typecheck/build para [feature]
  → Re-ejecuta npm run typecheck && npm run build
  → Repite hasta PASS
```

#### Capa 6b: Quality & Secrets (SIEMPRE)

```bash
npm run quality
npm run scan-secrets
```

```
IF quality o scan-secrets falla:
  → Corrige los issues reportados (console.log, debugger, secrets)
  → Re-ejecuta hasta PASS
```

#### Capa 6c: TypeScript Review (SIEMPRE)

```
@typescript-reviewer revisa el diff de [feature]. Enfócate en:
- Type safety (no any innecesarios, tipos completos)
- Async correctness (promesas no flotantes, error handling)
- Zod validation coverage
- Hono route type safety (c.req.valid() vs schema)
```

#### Capa 6d: Code Review (SIEMPRE)

```
@code-reviewer revisa los cambios staged/uncommitted para [feature].
Aplica las 6 categorías: Seguridad, Type Safety, Patrones, Rendimiento, Completitud, Mantenibilidad.
```

#### Capa 6e: Security Review (CONDICIONAL)

```
IF el feature toca auth (login, sesiones, roles), rutas API nuevas, o manejo de datos sensibles:

@security-reviewer audita los cambios de [feature]. Verifica:
- OWASP Top 10 (injection, XSS, broken auth, etc.)
- Secrets hardcodeados
- Control de acceso en nuevas rutas
- Validación de inputs (Zod schemas completos)
- SQL injection (parameterized queries)
- Session management (X-Session-Id)
```

#### Capa 6f: AI Regression (CONDICIONAL)

```
IF el feature modifica alguno de estos archivos:
  - services/agentPrompts.ts
  - shared/extractionSchema.ts
  - server/routes/ai.ts
  - config.ts (modelo o parámetros de AI)

→ Carga el skill ai-regression-testing y ejecuta:
  1. Golden test set (si existen fixtures en tests/fixtures/invoices/golden/)
  2. Diff testing: compara extracciones antes/después de los cambios
  3. Confidence score: verifica que no haya regresión en confianza

Reporta: ✅ Sin regresión / ⚠️ Cambios detectados / ❌ Regresión
```

#### Capa 6g: Schema Docs (CONDICIONAL)

```
IF se modificó server/schema.ts → Verifica que docs/DatabaseSchema.md refleje los cambios.
Si está desactualizado → @doc-updater actualiza docs/DatabaseSchema.md con los cambios de schema.
```

---

### Fase 7: Summary

Produce un resumen ejecutivo y delega actualización de docs:

#### Output del resumen:

```markdown
## Feature Complete: [Nombre del Feature]

### Qué se construyó
[2-3 frases explicando el feature y su propósito]

### Archivos modificados
- [CREATE] path/to/new/file.ts — propósito
- [MODIFY] path/to/existing/file.ts — qué cambió
- [DELETE] path/to/removed/file.ts — por qué

### Cómo probar
1. [Paso concreto 1]
2. [Paso concreto 2]
3. [Resultado esperado]

### Limitaciones conocidas
- [Limitación 1 — si aplica]

### Requiere
- [ ] Deploy
- [ ] Migración de base de datos
- [ ] Nuevas variables de entorno
- [ ] Actualización de documentación
```

#### Actualización de docs (CONDICIONAL):

```
IF se crearon/modificaron features documentables:

@doc-updater actualiza la documentación afectada por los cambios de [feature].
Verifica: README.md, docs/, y cualquier archivo .md relevante.
```

---

## Reglas de Hierro

| # | Regla | Consecuencia si se ignora |
|---|-------|--------------------------|
| 1 | NUNCA saltes Fase 4 (diseño) para features que tocan schema, AI pipeline, o auth | Diseño frágil, refactors costosos |
| 2 | NUNCA merges sin pasar todas las capas de Fase 6 | Bugs en producción, regresiones |
| 3 | Si typecheck falla en cualquier punto → corrige ANTES de seguir | Errores acumulados, debugging difícil |
| 4 | Si tocas `shared/extractionSchema.ts` → actualiza `services/agentPrompts.ts` para consistencia | Extracciones inconsistentes, datos perdidos |
| 5 | Si tocas `server/schema.ts` → actualiza `docs/DatabaseSchema.md` | Documentación desactualizada, onboarding roto |
| 6 | Si agregas variables de entorno → actualiza `.env.example` | Deploys fallidos por variables faltantes |
| 7 | Si la feature tiene lógica testeable → escribe tests (Fase 5c) | Regresiones no detectadas |
| 8 | Espera confirmación EXPLÍCITA del usuario en Fase 3 y Fase 4 | Implementar algo que el usuario no quiere |
| 9 | NUNCA commits sin que el usuario lo pida explícitamente | Pérdida de control del usuario sobre git |

---

## Quick Reference: Qué agente usar y cuándo

| Gatillo | Agente | Fase |
|---------|--------|------|
| Explorar codebase | `@code-explorer` | 2 |
| Diseñar arquitectura | `@architect` | 4a |
| Revisar schema DB | `@database-reviewer` | 4b |
| Escribir tests | `@tdd-guide` | 5c |
| Corregir type errors | `@build-error-resolver` | 6a |
| Revisar types | `@typescript-reviewer` | 6c |
| Revisar código | `@code-reviewer` | 6d |
| Auditar seguridad | `@security-reviewer` | 6e |
| Actualizar docs | `@doc-updater` | 6g, 7 |
