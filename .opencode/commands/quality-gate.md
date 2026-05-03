---
description: Run quality pipeline on demand — typecheck, format, lint, and security scan for a file or project scope
---

# /quality-gate [path|.] [--fix] [--strict]

Ejecuta el pipeline de calidad del proyecto. Sin argumentos = scope completo.

## Pipeline

### 1. TypeScript Check

```bash
npm run typecheck
```

Si falla → reporta errores y DETENTE. No sigas sin arreglar types.

### 2. Formato (Prettier)

```bash
npm run format:check          # verificar
npm run format                # auto-formatear (si --fix)
```

### 3. Quality Check

```bash
npm run quality
```

Busca: `console.log`, `debugger`, secrets, `.only()` en tests.

### 4. Security Scan

```bash
npm run scan-secrets
```

### 5. Build Verification (opcional)

```bash
npm run build
```

## Reporte final

```
Quality Gate Report
===================
  TypeScript:  ✅ PASS / ❌ FAIL (<n> errors)
  Format:      ✅ PASS / ❌ FAIL (<n> files)
  Quality:     ✅ PASS / ❌ FAIL (<n> issues)
  Secrets:     ✅ PASS / ❌ FAIL (<n> findings)
  Build:       ✅ PASS / ❌ SKIPPED

Verdict: READY / NEEDS FIXES
```

Si `--fix` está presente y algo falla en format → auto-formatea y re-ejecuta.
Si `--strict` está presente → cualquier warning = FAIL.
