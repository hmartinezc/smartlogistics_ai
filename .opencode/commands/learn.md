---
description: Extract reusable patterns from the current session and save them as skills for future use
---

# /learn [pattern-name]

Extrae patrones reutilizables de la sesión actual y los guarda como skill.

## Proceso

### 1. Identifica patrones

Revisa la sesión actual y detecta:

- **Resolución de errores** — ¿qué error apareció y cómo se solucionó?
- **Técnicas de debugging** — ¿qué comando o approach funcionó?
- **Workarounds** — ¿qué limitación se encontró y cómo se rodeó?
- **Patrones del proyecto** — ¿alguna convención o estructura que no estaba documentada?
- **Flujo de trabajo** — ¿secuencia de pasos que resolvió un problema complejo?

### 2. Valida con el usuario

Muestra el patrón detectado y pregunta:

```
Pattern detected: <descripción breve>
Context: <cuándo ocurrió>
Solution: <qué funcionó>
Save as skill? (y/n)
```

### 3. Guarda el skill

Si el usuario confirma, crea:

```
.opencode/skills/learned/<pattern-name>.md
```

Formato:

```markdown
# <Pattern Name>

## When This Applies

[Condiciones que disparan este patrón]

## Solution

[Pasos concretos para resolver]

## Context

[Stack, archivos, herramientas involucradas]

## Learned From

[Session date, task context]
```

## Reglas

- NUNCA guardes sin confirmación explícita del usuario
- NUNCA incluyas secrets, tokens, o datos sensibles
- Si el patrón ya existe → sugiere actualizarlo, no duplicar
- Skills aprendidos van en `.opencode/skills/learned/` (separados de los skills base)
