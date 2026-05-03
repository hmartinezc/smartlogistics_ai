---
description: Analyze git history to extract coding patterns and generate reusable SKILL.md files for .opencode/skills/
---

# /skill-create [scope] [--instincts]

Analiza el historial de git del proyecto para detectar patrones y generar archivos SKILL.md.

## Proceso

### 1. Analiza el historial de git

```bash
git log --oneline --name-only -50
git log --pretty=format:"%h %s" -50
```

Busca:

- **Convenciones de commits** — formato, categorías, scope
- **Patrones de co-cambio** — archivos que siempre cambian juntos
- **Flujos de trabajo** — secuencias repetidas (ej: schema.ts → seed.ts → docs/)
- **Patrones de testing** — cómo se estructuran los tests
- **Patrones de API** — convenciones en server/routes/

### 2. Detecta patrones específicos del proyecto

- Schema changes: `server/schema.ts` + `docs/DatabaseSchema.md`
- AI pipeline: `services/agentPrompts.ts` + `shared/extractionSchema.ts` + `server/routes/ai.ts`
- Frontend state: `App.tsx` + `hooks/index.ts`
- API client: `services/apiClient.ts` cambios de headers/auth

### 3. Genera SKILL.md

Formato:

```markdown
---
name: skill-name
description: One-line description of when to use this skill
---

# Skill Title

## When to Use

...

## Patterns

...

## Examples

...
```

Guarda en `.opencode/skills/<skill-name>/SKILL.md`.

### 4. Revisión

Muestra el skill generado al usuario para revisión. NO guardes sin confirmación explícita.

## Flags

- `--instincts` — También genera `.yaml` para integración con continuous-learning (format ECC instincts)
