---
description: Save, verify, or list git-based workflow checkpoints for complex multi-step changes
---

# /checkpoint <create|verify|list|clear> [name]

Workflow checkpoints basados en git SHAs. Útil antes de cambios complejos en schema, AI pipeline, o refactors grandes.

## Comandos

### `create <name>`

Guarda el SHA actual en `.opencode/checkpoints.log`:

```bash
echo "$(date -Iseconds) <name> $(git rev-parse HEAD)" >> .opencode/checkpoints.log
```

### `verify <name>`

Compara el estado actual con el checkpoint:

- Archivos modificados desde el checkpoint
- Si hay tests configurados, su pass rate
- Cambios en schema.ts vs DatabaseSchema.md

### `list`

Muestra todos los checkpoints registrados:

```bash
cat .opencode/checkpoints.log 2>/dev/null || echo "No checkpoints found"
```

### `clear`

Elimina el archivo de checkpoints:

```bash
rm -f .opencode/checkpoints.log
```

## Cuándo usar

- Antes de modificar `server/schema.ts` (migraciones)
- Antes de cambiar `services/agentPrompts.ts` o `shared/extractionSchema.ts`
- Antes de refactors en `server/routes/ai.ts`
- Antes de mergear branches con conflictos
