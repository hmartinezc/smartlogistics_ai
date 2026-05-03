---
description: Fix TypeScript build errors incrementally — one error at a time with re-build verification
---

# /build-fix [scope]

Corrige errores de build/typecheck incrementalmente. NO hagas refactors ni cambios de arquitectura.

## Workflow

### 1. Detecta el scope

Si el usuario especifica un archivo o directorio, enfócate ahí. Si no, ejecuta el check completo:

```bash
npm run typecheck
```

Esto corre `tsc --noEmit` en root Y `tsc -p server/tsconfig.json --noEmit`.

### 2. Agrupa errores por archivo

Categoriza los errores:

- **Type inference** — implicit any, unknown types
- **Missing types** — falta type annotation o interface
- **Import/export** — cannot find module, wrong path
- **Config** — tsconfig paths, module resolution
- **React** — hooks en condicionales, missing deps

### 3. Corrige UN error a la vez

Para cada error:

1. Lee el mensaje de error y el archivo
2. Encuentra la solución mínima
3. Aplica el fix
4. Re-ejecuta `npm run typecheck`
5. Si pasa → siguiente error. Si no → vuelve al paso 1.

### 4. Guardrails

- Si el mismo error persiste 3 intentos → PIDE ayuda al usuario
- Si un fix requiere cambios de arquitectura → PIDE confirmación
- Si tocas `server/schema.ts` → verifica que `docs/DatabaseSchema.md` siga sincronizado
- Nunca uses `any` sin justificación explícita

## Comandos de diagnóstico

```bash
npm run typecheck                          # Full check (root + server)
npx tsc --noEmit --pretty                  # Solo root
npx tsc -p server/tsconfig.json --noEmit   # Solo server
npm run build                              # Build de producción (Vite)
```

## Fixes comunes

| Error                | Fix                                  |
| -------------------- | ------------------------------------ |
| Implicit `any`       | Agrega type annotation               |
| Possibly `undefined` | Agrega guard u optional chaining     |
| Cannot find module   | Corrige import path o tsconfig alias |
| Type not assignable  | Convierte valor o corrige tipo       |
| Conditional hook     | Mueve hook al top level              |
