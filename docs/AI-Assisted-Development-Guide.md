# Guía de Desarrollo Asistido por IA — Smart Logistics Extractor

> Documentación exhaustiva validada de todos los agentes, comandos, skills, reglas y flujos reales de trabajo.
> Incluye ejemplos concretos con archivos reales del proyecto.

---

## Índice

1. [Visión General del Sistema](#1-visión-general-del-sistema)
2. [Agentes (20)](#2-agentes-20)
3. [Comandos (11)](#3-comandos-11)
4. [Skills de Proyecto (8)](#4-skills-de-proyecto-8)
5. [Skills de Stack (5)](#5-skills-de-stack-5)
6. [Reglas (8)](#6-reglas-8)
7. [Flujos de Trabajo Diario](#7-flujos-de-trabajo-diario)
8. [Flujo Completo de Deploy al Repositorio](#8-flujo-completo-de-deploy-al-repositorio)
9. [Ejemplos Reales con Archivos del Proyecto](#9-ejemplos-reales-con-archivos-del-proyecto)
10. [Mejores Prácticas](#10-mejores-prácticas)
11. [Referencia Rápida](#11-referencia-rápida)

---

## 1. Visión General del Sistema

El sistema de desarrollo asistido tiene 4 capas que trabajan en conjunto:

```
┌──────────────────────────────────────────────────────────┐
│  COMANDOS (/comando)                                      │
│  Flujos de trabajo completos que orquestan agentes        │
│  Ej: /feature-dev, /check-deploy, /code-review           │
├──────────────────────────────────────────────────────────┤
│  AGENTES (@agente)                                        │
│  Especialistas que ejecutan tareas específicas             │
│  Ej: @architect, @code-explorer, @database-reviewer      │
├──────────────────────────────────────────────────────────┤
│  SKILLS (cargados automáticamente según contexto)         │
│  Conocimiento profundo de dominio/stack                   │
│  Ej: cost-aware-llm-pipeline, hono, database-migrations  │
├──────────────────────────────────────────────────────────┤
│  REGLAS (aplicadas automáticamente en cada sesión)        │
│  Estándares de código, seguridad, testing, git            │
│  Ej: .opencode/rules/common/security.md                  │
└──────────────────────────────────────────────────────────┘
```

**Modelo mental:** Un comando es un "workflow completo", un agente es un "especialista", un skill es "conocimiento experto", y una regla es una "ley que se cumple siempre".

### Stack Real del Proyecto

| Capa     | Tecnología                             | Archivos clave                                                                               |
| -------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| Frontend | React 18 + Vite 5 + Tailwind CSS 3     | `App.tsx`, `hooks/index.ts`, `components/*`                                                  |
| Backend  | Hono 4 (Node.js adapter)               | `server/index.ts`, `server/routes/*.ts` (10 rutas)                                           |
| Database | libSQL/SQLite (local) + Turso (remoto) | `server/schema.ts` (234 líneas, 10 tablas), `server/seed.ts`                                 |
| AI       | Gemini 2.5 Flash Preview (LOCKED)      | `services/agentPrompts.ts` (257 líneas), `shared/extractionSchema.ts`, `server/routes/ai.ts` |
| Auth     | Sesiones via `X-Session-Id` header     | `server/security.ts`, `services/apiClient.ts`                                                |
| Deploy   | Docker multi-stage + Coolify           | `Dockerfile` (33 líneas), `docs/CoolifyDeployment.md`                                        |

### Jerarquía de Modelos

| Tier       | Modelo                          | Cuándo                                                                    | Costo                   |
| ---------- | ------------------------------- | ------------------------------------------------------------------------- | ----------------------- |
| **Pro**    | `opencode-go/deepseek-v4-pro`   | Arquitectura, planning, code review, seguridad, tipos, TDD, accesibilidad | Alto (contexto grande)  |
| **Flash**  | `opencode-go/deepseek-v4-flash` | Exploración, build fixes, docs, refactors mecánicos, E2E                  | Bajo (contexto pequeño) |
| **Locked** | `gemini-2.5-flash-preview`      | Extracción AI de facturas PDF                                             | Medio (API paga)        |

---

## 2. Agentes (20)

Cada agente es un especialista con scope definido. Se invocan con `@nombre-agente`.

### Agentes de Diseño y Planificación

| Agente                    | Modelo | Cuándo usarlo                                              | Qué produce                                                                   |
| ------------------------- | ------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **@planner**              | v4-pro | Antes de escribir código para un feature nuevo             | Plan con fases, archivos exactos, dependencias, riesgos y edge cases          |
| **@architect**            | v4-pro | Decisiones de arquitectura, nuevos subsistemas, trade-offs | ADR con alternativas, consecuencias y migration path                          |
| **@type-design-analyzer** | v4-pro | Auditoría de tipos en shared/, server/routes/, hooks/      | Score 0-5 en 4 dimensiones: encapsulación, invariantes, utilidad, enforcement |

### Agentes de Exploración

| Agente             | Modelo   | Cuándo usarlo                              | Qué hace                                                                    |
| ------------------ | -------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| **@code-explorer** | v4-flash | Antes de tocar área desconocida            | Traza execution paths completos, mapea dependencias, documenta entry points |
| **@explore**       | v4-flash | Búsquedas rápidas, preguntas de estructura | Encuentra archivos por glob, busca código por regex                         |

### Agentes de Implementación

| Agente                    | Modelo   | Cuándo usarlo                                    | Qué hace                                                                      |
| ------------------------- | -------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| **@tdd-guide**            | v4-pro   | Features con lógica testeable, al escribir tests | Ciclo Red→Green→Refactor; escribe test primero, implementación mínima después |
| **@build-error-resolver** | v4-flash | typecheck falla, build roto                      | Corrige errores uno a uno con re-verificación, cambios mínimos, sin refactors |

### Agentes de Revisión

| Agente                     | Modelo   | Cuándo usarlo                                     | Scope de revisión                                                                        |
| -------------------------- | -------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **@code-reviewer**         | v4-pro   | Después de escribir código, antes de mergear      | 6 categorías: seguridad, type safety, patrones, rendimiento, completitud, mantenibilidad |
| **@typescript-reviewer**   | v4-pro   | TODO cambio de TypeScript/JS                      | Type safety, async correctness, error handling, React/Node patterns                      |
| **@security-reviewer**     | v4-pro   | Código con user input, auth, API, datos sensibles | OWASP Top 10, secrets, SQL injection, XSS, SSRF, auth bypass                             |
| **@database-reviewer**     | v4-flash | Cambios en schema.ts, migraciones, queries        | Idempotencia, índices, FK con ON DELETE, performance, integridad                         |
| **@silent-failure-hunter** | v4-flash | Auditoría pre-release, debugging                  | catch{} vacíos, fallbacks peligrosos, errores swallowed, logs sin contexto               |
| **@performance-optimizer** | v4-pro   | Problemas de rendimiento medidos o sospechados    | Gemini costs, React re-renders, libSQL queries, bundle size                              |
| **@a11y-architect**        | v4-pro   | Diseño de UI, design systems, auditorías a11y     | WCAG 2.2 AA, ARIA roles/labels, keyboard navigation, focus management                    |

### Agentes de Mantenimiento

| Agente                     | Modelo   | Cuándo usarlo                                       | Qué hace                                                                                  |
| -------------------------- | -------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **@refactor-cleaner**      | v4-flash | Limpieza de código muerto                           | Detecta deps/imports/exports no usados, elimina uno a la vez con verificación typecheck   |
| **@doc-updater**           | v4-flash | Después de cambios en API, schema, env vars, deploy | Sincroniza docs desde fuentes de verdad (schema.ts→DatabaseSchema.md, etc.)               |
| **@loop-operator**         | v4-flash | Mejora iterativa de calidad de extracción AI        | Ciclo EXTRACT→EVALUATE→IDENTIFY→FIX→VERIFY, max 10 iteraciones                            |
| **@conversation-analyzer** | v4-flash | Al final de sesiones productivas                    | Analiza transcripciones para extraer patrones, errores repetidos, oportunidades de skills |

### Agentes de Testing

| Agente          | Modelo   | Cuándo usarlo                   | Qué hace                                                                     |
| --------------- | -------- | ------------------------------- | ---------------------------------------------------------------------------- |
| **@e2e-runner** | v4-flash | Setup/testeo E2E con Playwright | 5 flujos críticos: auth, upload+extraction, batch, review, agency management |

### Agente Comodín

| Agente       | Modelo   | Cuándo usarlo                          | Qué hace                                                |
| ------------ | -------- | -------------------------------------- | ------------------------------------------------------- |
| **@general** | v4-flash | Tareas que no encajan en especialistas | Ejecución multi-step con contexto completo del proyecto |

---

## 3. Comandos (11)

Los comandos son workflows completos. Se ejecutan con `/comando`.

### Desarrollo

| Comando          | Propósito                               | Ejemplo de uso                                                                     |
| ---------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| **/feature-dev** | Feature completo en 7 fases (discovery → explore → design → implement → quality → security → summary) con agentes condicionales: @database-reviewer si toca schema, @security-reviewer si toca auth/rutas, @ai-regression-testing si toca AI pipeline | `/feature-dev agregar exportación de facturas a Excel con impuestos discriminados` |
| **/plan**        | Planificar sin escribir código          | `/plan agregar filtro por rango de fechas en batch history`                        |
| **/build-fix**   | Corregir type errors incrementalmente   | `/build-fix server/routes/ai.ts`                                                   |

### Calidad

| Comando           | Propósito                                                         | Ejemplo de uso                                   |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| **/quality-gate** | Pipeline completo: typecheck + format + quality + secrets + build | `/quality-gate` o `/quality-gate --fix --strict` |
| **/code-review**  | Revisión en 6 categorías (local o PR)                             | `/code-review local` o `/code-review pr 42`      |
| **/check-deploy** | 7 validaciones pre-deploy                                         | `/check-deploy`                                  |

### Mantenimiento

| Comando             | Propósito                                        | Ejemplo de uso                                                    |
| ------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| **/refactor-clean** | Eliminar código muerto con verificación          | `/refactor-clean` o `/refactor-clean server/`                     |
| **/update-docs**    | Sincronizar docs desde código fuente             | `/update-docs` o `/update-docs schema`                            |
| **/checkpoint**     | Git SHA checkpoints para rollback                | `/checkpoint create antes-de-migracion-v5`                        |
| **/learn**          | Extraer patrón de sesión como skill reutilizable | `/learn debugging-gemini-timeouts`                                |
| **/skill-create**   | Generar SKILL.md desde patrones en git history   | `/skill-create --scope extraction`                                |
| **/model-route**    | Recomendar modelo AI para una tarea              | `/model-route "refactor grande de tipos en shared/" --budget med` |

---

## 4. Skills de Proyecto (8)

Se cargan automáticamente cuando el contexto coincide con su descripción.

### Extracción AI

| Skill                        | Disparador                                            | Conocimiento que aporta                                                                                                                        |
| ---------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **cost-aware-llm-pipeline**  | Pipeline AI, batch processing, costos subiendo        | File-hash caching, prompt optimization, batching con rate limiting, exponential backoff, cost tracking por extracción, validación pre-API call |
| **ai-regression-testing**    | Modificar agentPrompts.ts, extractionSchema.ts, ai.ts | Golden test sets con .expected.json, baseline recording, diff testing, confidence score regression >85%, schema compatibility                  |
| **customs-trade-compliance** | Features de aduanas, freight docs, HS codes           | HS Capítulo 06 flores (0603.11-0603.19), Incoterms 2020, phytosanitary certificates, AWB números, valoración aduanera, AGENT_CUSTOMS           |

### Base de Datos

| Skill                   | Disparador                                         | Conocimiento que aporta                                                                                                                                                                      |
| ----------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **database-migrations** | Modificar server/schema.ts, tablas, columnas, seed | DDL idempotente (`IF NOT EXISTS`), rollback con backup table, tipos de columna (TEXT/INTEGER/REAL), FK con `ON DELETE CASCADE`, sync obligatorio con DatabaseSchema.md, checklist pre-commit |

### DevOps

| Skill                   | Disparador                                 | Conocimiento que aporta                                                                          |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **deployment-patterns** | Deploy, producción, CI/CD, troubleshooting | Coolify + Docker flow, healthcheck `/api/health`, persistencia en `/app/data`, multi-stage build |
| **docker-patterns**     | Dockerfile, optimización de imagen         | Node 20-alpine, dumb-init, HEALTHCHECK con wget, USER no-root, `npm ci --omit=dev`, VOLUME       |

### Testing y Aprendizaje

| Skill                   | Disparador                        | Conocimiento que aporta                                                                     |
| ----------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| **e2e-testing**         | Setup/testeo E2E, flaky tests     | Playwright + Page Object Model, 5 flujos críticos, `test.slow()` para Gemini, retries en CI |
| **continuous-learning** | Fin de sesión, patrones repetidos | Extracción de patrones → `.opencode/skills/learned/`, actualización de session-context.md   |

---

## 5. Skills de Stack (5)

Se cargan cuando el código importa/usa la tecnología correspondiente.

| Skill                     | Stack          | Se activa con...                                                                  |
| ------------------------- | -------------- | --------------------------------------------------------------------------------- |
| **hono**                  | Backend API    | `import { Hono } from 'hono'`, rutas, middleware, Zod validation, `c.req.valid()` |
| **react-best-practices**  | Frontend React | Componentes, hooks, `useMemo`, `useCallback`, `React.memo`, data fetching         |
| **tailwind-css-patterns** | Estilos        | `className="..."`, responsive design, layout, dark mode                           |
| **turso-libsql**          | Base de datos  | `@libsql/client`, `createClient()`, queries parameterized, Turso remote           |
| **vite**                  | Build tool     | `vite.config.ts`, plugins, env variables, build optimization                      |

---

## 6. Reglas (8)

Aplicadas automáticamente en cada sesión. No requieren invocación.

### Reglas Comunes (5)

| Archivo                        | Qué enforza                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `rules/common/coding-style.md` | Funciones <50 líneas, no código comentado, no TODOs sin issue, catch nunca vacío, imports agrupados            |
| `rules/common/git-workflow.md` | Conventional commits (`feat:`, `fix:`, `refactor:`), branches `feat/` `fix/`, no push a main, PRs <400 líneas  |
| `rules/common/security.md`     | Secrets solo en env vars, `X-Session-Id` header, Zod en toda ruta, parameterized queries, `npm audit`          |
| `rules/common/testing.md`      | Tests en cada feature, AAA pattern, 80%+ cobertura en business logic, test de comportamiento no implementación |
| `rules/common/performance.md`  | Medir antes de optimizar, índices DB donde hay WHERE, cachear AI results, code splitting, no N+1 queries       |

### Reglas TypeScript (3)

| Archivo                            | Qué enforza                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `rules/typescript/coding-style.md` | `interface` para objetos, `type` para unions/mapped, no `any`, `strict: true`, `async/await` sobre `.then()`              |
| `rules/typescript/testing.md`      | Vitest para unit/integration, Playwright para E2E, test files junto a source, tipos en mocks                              |
| `rules/typescript/patterns.md`     | Route→Service→Database layering, `apiClient.ts` único HTTP client, extraction pipeline integrity, no archivos >500 líneas |

---

## 7. Flujos de Trabajo Diario

### 7.1 Feature Nuevo (flujo completo)

```
Paso 1: /plan "agregar dashboard de costos por agencia"
        → @planner produce plan con fases, archivos, dependencias

Paso 2: /checkpoint create feature-cost-dashboard
        → Guarda SHA actual como punto de restauración

Paso 3: /feature-dev "agregar dashboard de costos por agencia"
        → Fase 1: Discovery — entiende req, identifica subsystems, constraints, acceptance criteria
        → Fase 2: @code-explorer analiza server/routes/agencies.ts, hooks/index.ts
        → Fase 3: Preguntas clarificadoras (¿gráfico o tabla? ¿filtros?)
        → Fase 4a: @architect diseña — ADR con nueva ruta /api/agencies/:id/costs
        → Fase 4b: @database-reviewer (CONDICIONAL — si toca schema) revisa migraciones
        → Fase 5: Implementación en mini-ciclos (implementar → typecheck → corregir → repetir)
        → Fase 5c: @tdd-guide (CONDICIONAL — si hay lógica testeable) escribe tests
        → Fase 6a: npm run typecheck && npm run build → si falla @build-error-resolver
        → Fase 6b: npm run quality && npm run scan-secrets
        → Fase 6c: @typescript-reviewer revisa type safety
        → Fase 6d: @code-reviewer revisa cambios staged (6 categorías)
        → Fase 6e: @security-reviewer (CONDICIONAL — si toca auth/rutas) audita OWASP Top 10
        → Fase 6f: ai-regression-testing (CONDICIONAL — si toca AI pipeline) valida extracciones
        → Fase 7: Resumen ejecutivo + @doc-updater actualiza docs

Paso 4: /quality-gate
        → npm run check (typecheck + format + quality)

Paso 5: /check-deploy
        → Validación completa pre-deploy
```

### 7.2 Bug Fix (flujo rápido)

```
1. @explore busca el código relevante al bug
2. @silent-failure-hunter revisa el área sospechosa (catch vacíos, fallbacks)
3. Implementar fix mínimo
4. npm run typecheck
5. @code-reviewer revisa el cambio
6. /quality-gate
```

### 7.3 Cambio en Schema de Base de Datos

```
⚠️ ALTO RIESGO — checkpoint obligatorio

1. /checkpoint create antes-de-migracion-v6
2. @database-reviewer revisa server/schema.ts actual y cambio propuesto:
   → ¿idempotente? ¿IF NOT EXISTS?
   → ¿índices necesarios en nuevas columnas?
   → ¿ON DELETE behavior correcto?
   → ¿rompe seed data existente?
3. Implementar migración al final de runMigrations() en server/schema.ts
4. Actualizar seed data si hay nuevas columnas requeridas
5. @database-reviewer revisa el diff final
6. @doc-updater → sincroniza docs/DatabaseSchema.md
7. /quality-gate --strict
```

### 7.4 Cambio en AI Pipeline

```
⚠️ ALTO RIESGO — checkpoint + regresión obligatorios

1. /checkpoint create antes-de-cambiar-prompt-facturas
2. Determinar tipo de cambio:
   → Mejora de calidad → @loop-operator (ciclo iterativo)
   → Cambio estructural → @architect (ADR primero)
3. skill cost-aware-llm-pipeline → ¿estamos optimizando costos o degradando?
4. skill ai-regression-testing:
   a. Grabar baseline: node scripts/regression/baseline.js
   b. Hacer cambios en agentPrompts.ts / extractionSchema.ts
   c. Validar consistencia entre ambos archivos (co-change)
   d. Correr regresión: npx vitest run tests/regression/
   e. Verificar confidence scores >85% en todos los agents
5. @code-reviewer revisa diff completo
6. /quality-gate --strict
```

### 7.5 Limpieza Periódica

```
1. /refactor-clean
   → npx depcheck → dependencias no usadas
   → grep exports sin imports
   → archivos .ts/.tsx no referenciados
   → bloques de código comentado >10 líneas
   → Elimina UNO a la vez, verifica typecheck, continúa
```

### 7.6 Extraer Aprendizaje de Sesión

```
1. /learn "debugging-gemini-429-rate-limits"
   → Identifica el patrón de la sesión
   → Pregunta confirmación al developer
   → Guarda en .opencode/skills/learned/
```

---

## 8. Flujo Completo de Deploy al Repositorio

Este es el flujo end-to-end real para validar y pushear cambios al repositorio. Cubre todas las áreas de validación antes del push.

### Fase 1: Verificación de Estado Local

```
# Verificar en qué branch estamos y estado del working tree
git status
git branch

# Ver qué cambió exactamente
git diff              # cambios sin staged
git diff --cached     # cambios staged
git log --oneline -5  # últimos commits
```

### Fase 2: Quality Gate Automatizado

```
/quality-gate --strict
```

Esto ejecuta secuencialmente y se DETIENE si algo falla:

1. **TypeScript Check** — `npm run typecheck`
   - `tsc --noEmit` (root tsconfig)
   - `tsc -p server/tsconfig.json --noEmit` (server strict mode)
   - Si falla → `/build-fix` para corregir incrementalmente. NO seguir sin types verdes.

2. **Formato** — `npm run format:check`
   - Si falla → `npm run format` para auto-corregir, re-ejecutar check.

3. **Quality** — `npm run quality`
   - Busca `console.log`, `debugger`, secrets, `.only()` en tests.
   - Si encuentra → eliminar manualmente.

4. **Security Scan** — `npm run scan-secrets`
   - Escanea TODO el proyecto por API keys, tokens, passwords hardcodeados.
   - Si encuentra → mover a `.env` inmediatamente.

### Fase 3: Build de Producción

```
npm run build
```

Verifica que:

- `tsc --noEmit` pasa (parte del build)
- `vite build` genera `dist/` sin errores
- No hay warnings de bundle size excesivo

### Fase 4: Revisión de Seguridad

```
@security-reviewer revisa los cambios staged para vulnerabilidades OWASP Top 10
```

El security-reviewer verifica específicamente:

- `server/routes/auth.ts` — ¿sesiones validadas? ¿passwords hasheados?
- `server/routes/ai.ts` — ¿API key de Gemini expuesta al frontend?
- `server/routes/*` — ¿Zod validation en todas las rutas nuevas?
- `server/schema.ts` — ¿queries parameterizados? ¿no string concatenation?
- `services/apiClient.ts` — ¿X-Session-Id en todas las requests?
- `.env.example` — ¿documenta todas las variables sin valores reales?

### Fase 5: Revisión de Documentación

```
@doc-updater verifica sincronización de docs con código fuente
```

Verifica estas fuentes de verdad contra sus documentos:

| Fuente                 | Debe coincidir con                     | Qué revisar                                                 |
| ---------------------- | -------------------------------------- | ----------------------------------------------------------- |
| `server/schema.ts`     | `docs/DatabaseSchema.md`               | Tablas, columnas, constraints actuales                      |
| `Dockerfile`           | `docs/CoolifyDeployment.md`            | Puerto 3001, healthcheck `/api/health`, volumen `/app/data` |
| `package.json` scripts | `README.md`                            | Comandos npm documentados                                   |
| `.env.example`         | `README.md`                            | Variables de entorno listadas                               |
| `server/index.ts`      | `README.md` o `docs/DatabaseSchema.md` | Rutas API montadas bajo `/api/*`                            |

### Fase 6: Code Review Final

```
@code-reviewer revisa diff completo antes del commit
```

El code-reviewer emite veredicto:

- **APPROVE** — sin issues o solo LOW
- **REQUEST_CHANGES** — issues MEDIUM
- **BLOCK** — issues HIGH o CRITICAL

### Fase 7: Revisión de Tipos (TypeScript)

```
@typescript-reviewer revisa cambios TypeScript
```

Verifica específicamente:

- No `any` sin justificación
- No `as` casts que bypassean type checking
- Async functions con `Promise<T>` explícito
- No `.forEach(async fn)` (error común)
- No empty catch blocks

### Fase 8: Revisión de Errores Silenciosos

```
@silent-failure-hunter revisa archivos modificados
```

Busca:

- `catch {}` o `catch (e) {}` vacíos
- `catch(() => [])` que esconde errores
- Fallbacks que ocultan fallas reales
- Errores sin logging o con `console.log` en vez de `console.error`

### Fase 9: Commit y Push

Solo si TODAS las fases anteriores pasaron:

```bash
# Agregar archivos (NUNCA data/smart-invoice.db ni .env)
git add <archivos>

# Verificar qué se va a commitear
git diff --cached --stat

# Commit con formato conventional commit
git commit -m "feat(scope): descripción concisa del cambio"

# Verificar que el commit se creó correctamente
git log -1 --oneline

# Push al remoto
git push origin <branch>
```

### Fase 10: Post-Push (si aplica)

```
# Si el push es a main y hay Coolify configurado:
# Coolify detecta el push y ejecuta el deploy automáticamente
# Healthcheck: curl https://<url>/api/health debe devolver 200

# Verificar migraciones en producción:
# Revisar logs del contenedor para "Migrations completed successfully"
```

### Resumen Visual del Flujo de Deploy

```
git status/diff
    ↓
/quality-gate --strict    ← typecheck + format + quality + secrets
    ↓ (¿pasó?)
npm run build             ← tsc + vite build
    ↓ (¿pasó?)
@security-reviewer        ← OWASP Top 10 en staged changes
    ↓ (¿pasó?)
@doc-updater              ← schema→DatabaseSchema.md, Dockerfile→CoolifyDeployment.md
    ↓ (¿pasó?)
@code-reviewer            ← 6 categorías, emite APPROVE/CHANGES/BLOCK
    ↓ (¿pasó?)
@typescript-reviewer      ← type safety, async correctness
    ↓ (¿pasó?)
@silent-failure-hunter    ← catch{} vacíos, fallbacks peligrosos
    ↓ (¿pasó?)
git add && git commit && git push
    ↓
Coolify auto-deploy (si main) → healthcheck /api/health
```

---

## 9. Ejemplos Reales con Archivos del Proyecto

### 9.1 Co-Cambio del AI Pipeline

Cuando modificas la extracción de facturas, estos 3 archivos DEBEN cambiar juntos:

```
Archivos en el grupo AI Pipeline:
├── services/agentPrompts.ts      (257 líneas) — Prompts y knowledge bases
├── shared/extractionSchema.ts    (79 líneas)  — Schema de salida Gemini
└── server/routes/ai.ts           — Endpoint /api/ai/extract

Ejemplo real: Si agregas un campo "currency" al schema de extracción:

1. shared/extractionSchema.ts → agregar property "currency"
2. services/agentPrompts.ts → agregar instrucción en el prompt
   "Extract the currency code (ISO 4217) from the invoice header."
3. server/routes/ai.ts → validar que el campo llegue en la respuesta

Si tocas uno sin los otros → extracción rota.
Usa skill ai-regression-testing para validar.
```

### 9.2 Co-Cambio de Base de Datos

```
Archivos en el grupo Database:
├── server/schema.ts              (234 líneas, 10 tablas) — Migraciones
├── server/seed.ts                — Datos iniciales idempotentes
└── docs/DatabaseSchema.md        — Documentación del schema

Ejemplo real: Agregar tabla "cost_tracking" para monitorear gastos Gemini:

1. server/schema.ts → agregar al array SCHEMA_STATEMENTS:
   `CREATE TABLE IF NOT EXISTS cost_tracking (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      tokens_in INTEGER NOT NULL,
      tokens_out INTEGER NOT NULL,
      cost_usd REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`
   + índice: `CREATE INDEX IF NOT EXISTS idx_cost_agency ON cost_tracking(agency_id)`

2. server/seed.ts → no necesita seed (tabla de runtime)

3. docs/DatabaseSchema.md → agregar sección de tabla cost_tracking

4. @database-reviewer revisa el cambio
   → ¿IF NOT EXISTS? ✓
   → ¿ON DELETE CASCADE? ✓
   → ¿Índice en agency_id? ✓
   → ¿Tipo correcto para cost_usd? ✓ (REAL)
```

### 9.3 Estructura Real de Rutas API

```
server/routes/    (10 módulos de ruta)
├── ai.ts              ← POST /api/ai/extract       (extracción Gemini)
├── auth.ts            ← POST /api/auth/*           (login, logout, session)
├── agencies.ts        ← CRUD /api/agencies         (gestión de agencias)
├── users.ts           ← CRUD /api/users            (gestión de usuarios)
├── batch.ts           ← /api/batch/*               (procesamiento por lotes)
├── plans.ts           ← GET /api/plans             (planes de suscripción)
├── audit.ts           ← GET /api/audit             (auditoría de documentos)
├── operational.ts     ← /api/operational/*         (AWBs, operaciones)
├── product-matches.ts ← /api/product-matches       (matching de productos)
└── settings.ts        ← /api/settings              (configuración key-value)

Cada módulo se monta en server/index.ts con app.route('/api/<prefix>', modulo)
```

### 9.4 Ejemplo de Uso de Agentes para una Ruta Nueva

```
Escenario: Crear endpoint GET /api/agencies/:id/stats

1. @code-explorer analiza server/routes/agencies.ts
   → "La ruta usa app.route('/api/agencies', agenciesRoute).
      Las queries están en el mismo archivo, usan parameterized queries.
      El patrón es: router.get('/path', requireAuth, async (c) => {...})"

2. @planner produce plan:
   → Fase 1: Agregar query SQL en agencies.ts (1 archivo)
   → Fase 2: Agregar ruta GET /:id/stats con requireAuth (mismo archivo)
   → Fase 3: @typescript-reviewer validar tipos de respuesta
   → Verificación: curl -H "X-Session-Id: ..." /api/agencies/:id/stats

3. @tdd-guide escribe test primero:
   → server/routes/agencies.test.ts (nuevo)
   → test('GET /:id/stats returns agency statistics', async () => {...})

4. Implementar ruta siguiendo patrón existente
5. @code-reviewer revisa
6. /quality-gate
```

### 9.5 Ejemplo Real de Dockerfile Validation

```bash
# El /check-deploy verifica que el Dockerfile (33 líneas) cumpla:

✅ Multi-stage build        → FROM node:20-alpine AS builder + AS runner
✅ dumb-init ENTRYPOINT     → ENTRYPOINT ["dumb-init", "--"]
✅ HEALTHCHECK              → wget http://localhost:3001/api/health
✅ USER no-root             → (no tiene USER, se ejecuta como root — WARNING)
✅ VOLUME /app/data          → VOLUME ["/app/data"]
✅ npm ci --omit=dev         → en stage runner
✅ PORT=3001                 → ENV PORT=3001 + EXPOSE 3001

⚠️ Mejora pendiente: agregar USER node para no ejecutar como root
```

### 9.6 Tabla de Decisiones: ¿Qué Agente Uso?

| Me encuentro con...                             | Agente correcto        | Por qué                                           |
| ----------------------------------------------- | ---------------------- | ------------------------------------------------- |
| "No sé cómo funciona el batch processing"       | @code-explorer         | Traza el flujo completo batch.ts → ai.ts → Gemini |
| "Quiero agregar filtro por fecha en invoices"   | @planner               | Planifica fases: schema, ruta, UI                 |
| "¿Debo usar SQLite o Turso para esto?"          | @architect             | Evalúa trade-off local-first vs cloud             |
| "El typecheck falla con 23 errores"             | @build-error-resolver  | Corrige uno a uno, solo cambios mínimos (úsalo en Fase 6a de /feature-dev si falla)           |
| "Escribí 200 líneas, ¿está bien?"               | @code-reviewer         | Revisa seguridad, tipos, patrones, rendimiento. /feature-dev lo usa en Fase 6d                |
| "Toqué server/schema.ts"                        | @database-reviewer     | Idempotencia, índices, FK, Documentación sync. /feature-dev lo usa en Fase 4b (condicional)   |
| "Agregué un endpoint nuevo"                     | @security-reviewer     | Zod validation, auth check, injection. /feature-dev lo usa en Fase 6e (condicional)           |
| "Los tipos de extractionSchema son un desastre" | @type-design-analyzer  | Score 0-5, sugerencias concretas                  |
| "La extracción de facturas falla a veces"       | @loop-operator         | Ciclo iterativo de mejora de prompts              |
| "Hay mucho código comentado"                    | @refactor-cleaner      | Eliminación segura con verificación               |
| "Los docs están desactualizados"                | @doc-updater           | Sincroniza desde código fuente                    |
| "El bundle de React pesa 2MB"                   | @performance-optimizer | Profiling, code splitting, lazy loading           |
| "El dropdown no es accesible con teclado"       | @a11y-architect        | ARIA roles, focus management, keyboard nav        |
| "No sé qué modelo usar para esta tarea"         | /model-route           | Recomienda pro vs flash según complejidad         |

---

## 10. Mejores Prácticas

### 10.1 Reglas de Oro

| #   | Regla                                                                  | Consecuencia de ignorarla                                    |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | NUNCA saltes diseño para features que tocan schema, AI pipeline o auth | Feature mal diseñado, refactor costoso después               |
| 2   | NUNCA merges sin quality review                                        | Bugs en producción, secrets expuestos, tipos rotos           |
| 3   | NUNCA cambies `gemini-2.5-flash-preview`                               | Degradación de extracción en facturas — el core del producto |
| 4   | NUNCA modifiques `server/schema.ts` sin `docs/DatabaseSchema.md`       | Documentación falsa, equipo desinformado                     |
| 5   | NUNCA deploy sin `/check-deploy`                                       | Podrías pushear secrets, builds rotos, healthcheck fallido   |
| 6   | SIEMPRE usa `/checkpoint` antes de cambios de alto riesgo              | Sin checkpoint = sin rollback fácil                          |
| 7   | SIEMPRE `npm run typecheck` después de cada grupo de cambios           | Acumular type errors = sesión de debugging larga             |

### 10.2 Co-Cambio Obligatorio

Estos archivos DEBEN modificarse juntos. Si tocas uno, tocas todos:

| Grupo              | Archivos                                                                          | Skill de referencia                  |
| ------------------ | --------------------------------------------------------------------------------- | ------------------------------------ |
| **AI Pipeline**    | `services/agentPrompts.ts` ↔ `shared/extractionSchema.ts` ↔ `server/routes/ai.ts` | ai-regression-testing                |
| **Database**       | `server/schema.ts` ↔ `server/seed.ts` ↔ `docs/DatabaseSchema.md`                  | database-migrations                  |
| **Frontend State** | `App.tsx` ↔ `hooks/index.ts`                                                      | react-best-practices                 |
| **Auth**           | `server/security.ts` ↔ `services/apiClient.ts`                                    | (reglas security.md)                 |
| **Config**         | `config.ts` ↔ `.env.example`                                                      | (reglas security.md)                 |
| **Deploy**         | `Dockerfile` ↔ `docs/CoolifyDeployment.md` ↔ `README.md`                          | docker-patterns, deployment-patterns |

### 10.3 Costo de Contexto por Agente

| Tier     | Agentes                                                                                                                                                                          | Costo relativo | Regla de uso                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------- |
| v4-pro   | architect, planner, code-reviewer, security-reviewer, typescript-reviewer, tdd-guide, performance-optimizer, a11y-architect, type-design-analyzer                                | 3×             | Solo para decisiones y revisiones que requieren juicio experto |
| v4-flash | code-explorer, explore, build-error-resolver, database-reviewer, refactor-cleaner, doc-updater, loop-operator, e2e-runner, silent-failure-hunter, conversation-analyzer, general | 1×             | Para tareas mecánicas, búsqueda y exploración                  |

**Principio:** "Pro para pensar, Flash para hacer."

### 10.4 Anti-Patrones Comunes

| Anti-Patrón                              | Por qué es malo                              | Qué hacer en su lugar                            |
| ---------------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| Escribir 500 líneas y luego revisar      | Revisión abrumadora, bugs escondidos         | Commits pequeños + @code-reviewer incremental    |
| Usar `any` para callar al typechecker    | Pierdes type safety, bugs en runtime         | Tipar correctamente o usar `unknown` + narrowing |
| Modificar solo `server/schema.ts`        | `docs/DatabaseSchema.md` queda obsoleto      | Co-cambio obligatorio + @doc-updater             |
| `catch (e) {}` vacío                     | Errores swallowed, debugging imposible       | Mínimo `console.error('contexto', e)` o rethrow  |
| Raw `fetch()` en componentes             | By-passea `X-Session-Id`, sin error handling | Usar `services/apiClient.ts` siempre             |
| No usar checkpoints antes de migraciones | Sin rollback fácil si la migración falla     | `/checkpoint create antes-de-migracion`          |
| Llamar a Gemini sin cache                | $$ desperdiciado en re-procesar mismos PDFs  | skill cost-aware-llm-pipeline → file hash cache  |

---

## 11. Referencia Rápida

### 11.1 Comandos npm (package.json)

```bash
npm run dev              # Dev: backend :3001 + frontend :5173 (concurrently)
npm run dev:server       # Solo backend con hot reload (tsx --watch)
npm run dev:client       # Solo frontend con HMR (vite)
npm run build            # tsc --noEmit + vite build → dist/
npm run start            # Producción: tsx server/index.ts
npm run db:seed          # Migraciones + seed manual (tsx server/seed-cli.ts)
npm run typecheck        # tsc --noEmit (root + server/tsconfig.json)
npm run typecheck:root   # Solo root
npm run typecheck:server # Solo server (strict mode)
npm run format           # Prettier write en todos los archivos
npm run format:check     # Prettier check sin escribir
npm run quality          # Pre-commit check: console.log, debugger, secrets, .only()
npm run scan-secrets     # Scan completo de secrets hardcodeados
npm run check            # typecheck + format:check + quality (todo junto)
```

### 11.2 Slash Commands

```
/plan <descripción>          Planificar feature sin escribir código
/feature-dev <descripción>   Feature completo en 7 fases (discovery→explore→design→implement→quality→security→summary) con 6 agentes condicionales (@database-reviewer, @tdd-guide, @build-error-resolver, @typescript-reviewer, @security-reviewer, @ai-regression-testing)
/build-fix [scope]           Corregir type errors incrementalmente
/quality-gate [--fix] [--strict]  Pipeline typecheck+format+quality+secrets+build
/code-review [local|pr]      Revisión en 6 categorías
/check-deploy                7 validaciones pre-deploy
/refactor-clean [scope]      Eliminar código muerto seguro
/update-docs [scope]         Sincronizar docs desde código fuente
/checkpoint <create|verify|list|clear>  Git SHA checkpoints
/learn <nombre>              Extraer patrón de sesión como skill
/skill-create [--instincts]  Generar skill desde git history
/model-route <tarea>         Recomendar modelo AI (pro vs flash)
```

### 11.3 Decision Tree Rápido

```
¿Feature nuevo?           → /plan → /feature-dev → /quality-gate → /check-deploy
¿Bug fix?                 → @code-explorer → fix → @code-reviewer → /quality-gate
¿Cambio en schema.ts?     → /checkpoint → @database-reviewer → cambiar → @doc-updater → /quality-gate --strict
¿Cambio en AI pipeline?   → /checkpoint → @loop-operator → skill ai-regression-testing → /quality-gate --strict
¿Deploy a producción?     → /check-deploy → git push
¿Type errors?             → /build-fix
¿Código muerto?           → /refactor-clean
¿Docs desactualizados?    → /update-docs
¿No sé qué agente usar?   → revisar §9.6 de esta guía
¿No sé qué modelo usar?   → /model-route
```

### 11.4 Ubicaciones Clave

```
.opencode/
├── agents/           ← 20 definiciones de agentes (.agent.md)
├── commands/         ← 11 definiciones de comandos (.md)
├── skills/           ← 8 skills de proyecto + 5 de stack
├── rules/            ← 8 reglas (5 common + 3 typescript)
├── session-context.md ← Estado actual del proyecto
└── .gitignore

docs/
├── AI-Assisted-Development-Guide.md  ← ESTE DOCUMENTO
├── DatabaseSchema.md                 ← Schema documentado (sync con server/schema.ts)
├── CoolifyDeployment.md              ← Guía de deploy en Coolify
├── AgentScenarios.md                 ← Escenarios de agentes de extracción
├── AIAgentsFutureUpgradePlan.md      ← Plan de evolución de agentes IA
├── GuiaReplicacionArquitectura.md    ← Guía de replicación
└── GuiaEvolucionArquitecturaIA.md    ← Guía de evolución de arquitectura IA

server/
├── schema.ts         ← Migraciones (234 líneas, 10 tablas)
├── seed.ts           ← Datos iniciales idempotentes
├── security.ts       ← Auth, password hashing
├── db.ts             ← Conexión libSQL + migraciones
├── index.ts          ← Entry point Hono
└── routes/           ← 10 módulos de ruta (ai, auth, agencies, users, batch, etc.)
```

---

> **Mantenimiento:** Actualizar este documento cuando se agreguen/quiten agentes, comandos, skills o reglas.
> Usar `@doc-updater` para mantenerlo sincronizado. La fuente de verdad son los archivos en `.opencode/`.
>
> **Última actualización:** 2026-05-03 (v1.1 — /feature-dev optimizado con agentes condicionales)
> **Validado contra:** AGENTS.md, session-context.md, package.json, Dockerfile, server/schema.ts
