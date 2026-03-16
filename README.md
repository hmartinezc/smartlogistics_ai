<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Smart Logistics Extractor

Aplicación React + Hono con base local libSQL/SQLite para procesar facturas, administrar agencias y operar conciliación AWB.

## Stack

- Frontend: React + Vite
- Backend: Hono
- Base de datos local: libSQL sobre `data/smart-invoice.db`
- IA: Gemini consumido desde el backend

## Variables de entorno

- `GEMINI_API_KEY`: requerida para extracción documental
- `PORT`: opcional, por defecto `3001`
- `TURSO_DATABASE_URL`: opcional, si quieres usar Turso remoto en lugar de archivo local
- `TURSO_AUTH_TOKEN`: opcional, requerido si `TURSO_DATABASE_URL` apunta a Turso remoto

## Desarrollo local

1. Instala dependencias con `npm install`
2. Configura `GEMINI_API_KEY`
3. Ejecuta `npm run dev`

Esto levanta:

- Vite en `http://localhost:5173`
- API Hono en `http://localhost:3001`

## Producción / Coolify

- Build: `npm run build`
- Start: `npm run start`
- La app sirve SPA + API desde el mismo proceso
- Monta persistencia en `/app/data` si usas la BD local
- El repositorio incluye `Dockerfile`, `.dockerignore` y `.env.example`
- La receta operativa completa está en `docs/CoolifyDeployment.md`

### Configuración Exacta en Coolify

Usa estos valores literalmente:

| Campo Coolify | Valor |
|---|---|
| **Build Pack** | `Dockerfile` del repo |
| **Build Command** | no aplica si usas `Dockerfile` |
| **Start Command** | no aplica si usas `Dockerfile` |
| **Port** | `3001` |
| **Healthcheck Path** | `/api/health` |
| **Persistent Volume** | `/app/data` |
| **Node Version recomendada** | `20` |

Si prefieres Nixpacks, usa como fallback:

- Build Command: `npm run build`
- Start Command: `npm run start`

### Variables recomendadas para Coolify

| Variable | Valor ejemplo | Obligatoria |
|---|---|---|
| `PORT` | `3001` | No |
| `GEMINI_API_KEY` | `tu-api-key` | Sí |
| `TURSO_DATABASE_URL` | `file:./data/smart-invoice.db` o `libsql://...` | No |
| `TURSO_AUTH_TOKEN` | `token-remoto` | Solo si usas Turso remoto |

### Modo recomendado para arrancar barato

- Empieza con BD local montada en volumen persistente: `file:./data/smart-invoice.db`
- Sube a Turso remoto solo cuando necesites réplica, backup gestionado o separar app/db
- Mantén un backup periódico del volumen si sigues con SQLite local

### Checklist Hetzner + Coolify

1. Crea un volumen persistente y móntalo en `/app/data`
2. Define `GEMINI_API_KEY` en variables del servicio
3. Si usarás Turso remoto, define también `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`
4. Usa el `Dockerfile` incluido como método de despliegue preferido
5. Si no usas `Dockerfile`, entonces sí usa `npm run build` y `npm run start`
6. Expón el puerto `3001` o configura `PORT` explícitamente
7. Verifica el healthcheck en `/api/health`
8. Ejecuta `npm run db:seed` solo si necesitas rehidratar una base nueva
9. No expongas Vite dev server en producción; solo el proceso de Hono
10. Si mantienes BD local, asegúrate de incluir backup periódico del volumen

### Receta final recomendada

1. Copia los valores de `.env.example` a las variables del servicio en Coolify.
2. Monta un volumen persistente en `/app/data`.
3. Despliega usando el `Dockerfile` del repo.
4. Confirma `200 OK` en `/api/health`.
5. Valida login, agencias y extracción IA.

Detalle completo: `docs/CoolifyDeployment.md`

### Riesgo pendiente conocido

- Quedan 2 vulnerabilidades moderadas asociadas a `esbuild` vía `vite`; afectan el servidor de desarrollo y requieren salto a `vite@8` para resolverlas por completo sin parche manual.

## Mantenibilidad actual

- Backend separado por dominios en `server/routes/*`
- Seguridad centralizada en `server/security.ts`
- Esquema y seed centralizados en `server/schema.ts` y `server/seed.ts`
- Cliente HTTP centralizado en `services/apiClient.ts`
- Documentación técnica principal en `docs/DatabaseSchema.md`

## Utilidades

- Ejecutar seed manual: `npm run db:seed`
