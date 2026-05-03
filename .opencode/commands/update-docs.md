---
description: Sync project documentation from source-of-truth files — schema, env vars, API endpoints, and deployment config
agent: build
subtask: true
---

# /update-docs [scope]

Sincroniza la documentación del proyecto desde las fuentes de verdad.

## Fuentes → Documentos

| Source of Truth           | Updates                                                |
| ------------------------- | ------------------------------------------------------ |
| `server/schema.ts`        | `docs/DatabaseSchema.md`                               |
| `package.json` scripts    | `README.md` (sección de comandos)                      |
| `.env.example`            | `README.md` (sección de env vars)                      |
| `server/index.ts` (rutas) | `docs/DatabaseSchema.md` o `README.md` (API endpoints) |
| `Dockerfile`              | `docs/CoolifyDeployment.md`                            |

## Proceso

### 1. Detecta qué cambió

```bash
git diff HEAD -- server/schema.ts .env.example Dockerfile server/index.ts
```

### 2. Actualiza los docs afectados

Para cada archivo fuente modificado, actualiza el doc correspondiente:

- **`server/schema.ts`** → Verifica que `docs/DatabaseSchema.md` refleje las tablas, columnas, y constraints actuales
- **`.env.example`** → Verifica que `README.md` liste todas las variables requeridas
- **`Dockerfile`** → Verifica que `docs/CoolifyDeployment.md` refleje el puerto, healthcheck, y volumen actuales
- **`server/index.ts`** → Si se agregaron/quitaron rutas, actualiza la documentación de endpoints

### 3. Staleness check

Si algún doc no se ha actualizado en 90+ días:

```bash
git log --since="90 days ago" -- docs/DatabaseSchema.md README.md docs/CoolifyDeployment.md
```

Reporta archivos stale como WARNING.

### 4. Preserva secciones manuales

Los docs pueden tener secciones marcadas con:

```
<!-- MANUAL-START -->
... contenido escrito a mano ...
<!-- MANUAL-END -->
```

NUNCA modifiques estas secciones. Solo actualiza fuera de estos marcadores.
