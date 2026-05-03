---
description: Plan implementation of a feature — break down into phases, dependencies, risks, and verification steps before writing code
---

# /plan <feature-description>

Actúa como planificador de features. NO escribas código todavía. Solo produce un plan detallado.

## Proceso

### 1. Entiende el requerimiento

- Lee el mensaje del usuario. Si hay ambigüedad, haz UNA pregunta clarificadora.
- Identifica qué partes del sistema se tocan: frontend (React+Vite), backend (Hono+libSQL), AI (Gemini), o varios.

### 2. Explora el codebase

- Usa `grep` y `glob` para encontrar código relevante, patrones existentes, y convenciones.
- Usa `read` para entender el data flow, contratos de API, y estructura de componentes.
- Mapea dependencias: ¿qué toca qué?

### 3. Produce el plan

Formato exacto:

```markdown
## Plan: [Nombre del Feature]

### Contexto

[1-2 frases sobre qué existe y por qué se necesita este cambio]

### Fases

#### Fase 1: [Nombre]

**Objetivo:** [Qué logra esta fase]
**Archivos a modificar:**

- `path/to/file.ts` — [qué cambia y por qué]
  **Dependencias:** [Qué debe existir antes]
  **Verificación:** [Cómo verificar que está correcto]

#### Fase 2: [Nombre]

...

### Data Flow

[Cómo se mueven los datos para este feature]

### Riesgos

- [Riesgo 1] — [mitigación]
- [Riesgo 2] — [mitigación]

### Edge Cases

- [Edge case 1]
- [Edge case 2]
```

## Reglas

- Cada fase debe ser completable en una sesión (~5-15 archivos max).
- Ordena por dependencia: trabajo fundacional primero.
- Siempre incluye pasos de verificación.
- Tipos compartidos primero — bloquean todo lo demás.
- Stack del proyecto: React + Vite frontend, Hono + libSQL backend, Gemini API para extracción AI, auth via X-Session-Id.
- Arquitectura: `App.tsx` maneja workflow state, `hooks/index.ts` centraliza lógica, `services/apiClient.ts` maneja llamadas API, `server/routes/` monta bajo `/api/*`.
- Pipeline AI: `File → Agent Selection → buildExtractionPrompt() → Gemini API → Validation → Storage`.
- Skills disponibles en `.opencode/skills/`: `hono`, `react-best-practices`, `turso-libsql`, `tailwind-css-patterns`, `vite`, `cost-aware-llm-pipeline`, `database-migrations`.
