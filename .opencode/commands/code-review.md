---
description: Code review for local changes or PR — security, type safety, patterns, performance, and maintainability
agent: build
subtask: true
---

# /code-review [local|pr]

Revisa código con checklist de 6 categorías. Adapta el modo según el scope.

## Modo Local (default)

Para cambios sin commitear o staged:

```bash
git diff              # unstaged changes
git diff --cached     # staged changes
```

## Modo PR

Para revisar un pull request:

```bash
gh pr diff <number>
gh pr view <number> --json title,body,comments
```

## Categorías de revisión

### 1. Seguridad (CRITICAL)

- ¿Se validan inputs del usuario? (Zod schemas en Hono)
- ¿Session auth via X-Session-Id está presente donde se requiere?
- ¿Hay secrets hardcodeados? (API keys, tokens, URLs internas)
- ¿SQL injection? (debe usar parameterized queries de `@libsql/client`)
- ¿Las rutas de API tienen control de acceso adecuado?

### 2. Type Safety (HIGH)

- ¿Hay `any` innecesarios?
- ¿Las interfaces de shared/extractionSchema.ts están completas?
- ¿Los tipos de respuesta de Gemini están validados?
- ¿Los types de `c.req.valid()` en Hono coinciden con los schemas?

### 3. Patrones del proyecto (HIGH)

- Frontend: ¿usa `services/apiClient.ts` para llamadas API? ¿X-Session-Id incluido?
- Backend: ¿usa `app.route()` para montar módulos? ¿c.set()/c.get() para request-scoped data?
- AI: ¿la extracción sigue el pipeline `agentPrompts.ts → extractionSchema.ts → ai.ts`?
- DB: ¿migraciones idempotentes con `IF NOT EXISTS`?

### 4. Rendimiento (MEDIUM)

- Frontend: ¿re-renders innecesarios? ¿memo/useMemo donde aplica?
- Backend: ¿queries libSQL con índices adecuados? ¿N+1 queries?
- AI: ¿se reutilizan prompts cacheados? ¿se evitan llamadas Gemini redundantes?

### 5. Completitud (MEDIUM)

- ¿Manejo de errores? (try-catch, Hono onError)
- ¿Edge cases? (archivos vacíos, PDF corrupto, timeout Gemini)
- ¿Estados de loading/empty/error en UI?

### 6. Mantenibilidad (LOW)

- ¿Nombres descriptivos?
- ¿Funciones pequeñas (<50 líneas)?
- ¿Valores mágicos extraídos a constantes?

## Output

Para cada hallazgo, usa este formato:

```
[SEVERITY] [CATEGORY] file:line — Descripción del issue
  Fix: [Acción correctiva concreta]
```

Severidades: CRITICAL / HIGH / MEDIUM / LOW

Decisión final: APPROVE / REQUEST_CHANGES / BLOCK
