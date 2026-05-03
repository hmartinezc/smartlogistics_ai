---
description: Validación completa pre-deploy — ejecuta typecheck, build, scan-secrets y revisa documentación
agent: build
model: opencode-go/deepseek-v4-pro
---

Ejecuta esta checklist de validación pre-deploy para el proyecto Smart Logistics Extractor:

## 1. Quality checks automatizados

Ejecuta en orden y reporta cada resultado:

```bash
npm run check
```

Si falla typecheck, format o quality → CORRIGE antes de seguir.

## 2. Build de producción

```bash
npm run build
```

Debe generar `dist/` sin errores.

## 3. Scan de secrets

```bash
npm run scan-secrets
```

No debe encontrar claves, tokens ni contraseñas hardcodeadas.

## 4. Revisión de documentación

Verifica que estos archivos estén sincronizados con los cambios recientes:

- `docs/DatabaseSchema.md` — refleja el schema actual en `server/schema.ts`
- `README.md` — comandos, variables de entorno, stack actualizados
- `docs/CoolifyDeployment.md` — sincronizado con `Dockerfile` y `README.md`
- `.env.example` — documenta todas las variables requeridas

## 5. Revisión de seguridad

Ejecuta el agente `security-reviewer` sobre los archivos modificados:

```
@security-reviewer revisa los cambios staged para vulnerabilidades
```

## 6. Verificación del Dockerfile

Confirma que el Dockerfile incluya:

- [ ] Multi-stage build (builder + runner)
- [ ] `dumb-init` como ENTRYPOINT
- [ ] HEALTHCHECK con wget a `/api/health`
- [ ] `USER` no-root (nodejs)
- [ ] `VOLUME ["/app/data"]`
- [ ] `npm ci --omit=dev` en stage runner

## 7. Reporte final

Al terminar, muestra un resumen con:

- ✅ Pasos que pasaron
- ❌ Pasos que fallaron (con qué acción tomar)
- 📋 Si todo pasó: "LISTO PARA DEPLOY — ejecuta git push y deploya en Coolify"
