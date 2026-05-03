---
description: Safely detect and remove dead code — unused imports, exports, dependencies, and duplicated logic
agent: build
subtask: true
---

# /refactor-clean [scope]

Elimina código muerto de forma segura. Un archivo/dependencia a la vez, con verificación entre cada cambio.

## Detección

### 1. Dependencias no usadas

```bash
npx depcheck
```

Analiza el output. Categoriza:

- **SAFE** — dependencia no importada en ningún archivo → remover con `npm uninstall`
- **CAUTION** — dependencia usada solo en scripts/build → preguntar antes de remover
- **DANGER** — dependencia runtime cargada dinámicamente → NO remover

### 2. Imports/Exports no usados

Busca con grep:

```bash
# Encuentra exports que no se importan en ningún lado
grep -r "export const\|export function\|export class" --include="*.ts" --include="*.tsx" -l
```

Para cada export encontrado, verifica si se usa en otro archivo:

```bash
grep -r "import.*<exportName>" --include="*.ts" --include="*.tsx" -l
```

### 3. Archivos no referenciados

Detecta archivos `.ts`/`.tsx` que no son importados por nadie y no son entry points (verifica `package.json`, `vite.config.ts`, `server/index.ts`).

### 4. Código comentado extenso

Busca bloques grandes de código comentado (>10 líneas):

```bash
grep -r "// \|/\*" --include="*.ts" --include="*.tsx" -A 10
```

## Proceso de eliminación

Para cada hallazgo:

1. Identifica → categoriza (SAFE/CAUTION/DANGER)
2. Si SAFE → elimina UN hallazgo
3. Ejecuta `npm run typecheck`
4. Si pasa → commit. Si falla → revierte.
5. Repite con el siguiente hallazgo.

## Reglas de seguridad

- NUNCA elimines más de un archivo/dependencia sin verificación intermedia
- NUNCA elimines archivos en `server/schema.ts`, `server/seed.ts`, o `shared/`
- Si no estás seguro → PREGUNTA
- Ejecuta `npm run check` después de cada batch de eliminaciones
