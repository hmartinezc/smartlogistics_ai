# Receta final de despliegue en Coolify

Esta aplicacion se despliega como un solo servicio Node.js que sirve:

- la SPA compilada desde `dist/`
- la API Hono en `/api/*`
- la base local libSQL/SQLite en `data/smart-invoice.db` cuando no se usa Turso remoto

## Estrategia recomendada

Usa primero SQLite local con volumen persistente en Coolify. Es la opcion mas barata y mas simple para este proyecto.

Pasa a Turso remoto solo si necesitas:

- separar app y base de datos
- mejores backups gestionados
- replicas o acceso externo a la base

## Opcion recomendada: Dockerfile del repo

El repositorio ya incluye un `Dockerfile` multi-stage y `.dockerignore`.

Ventajas:

- fija Node 20
- separa build y runtime
- evita depender del autodetect de Nixpacks
- deja un arranque consistente entre local, Coolify y Hetzner

## Configuracion exacta en Coolify

### Crear servicio

1. Crea un nuevo servicio desde este repositorio.
2. Selecciona `Dockerfile` como metodo de build.
3. Deja el `Dockerfile` de la raiz del proyecto.

### Campos clave

| Campo            | Valor            |
| ---------------- | ---------------- |
| Port             | `3001`           |
| Healthcheck Path | `/api/health`    |
| Restart Policy   | `unless-stopped` |
| Base Directory   | `/`              |

### Variables de entorno

Carga estas variables en Coolify:

| Variable             | Requerida                 | Valor recomendado              |
| -------------------- | ------------------------- | ------------------------------ |
| `PORT`               | No                        | `3001`                         |
| `GEMINI_API_KEY`     | Si                        | tu clave real                  |
| `TURSO_DATABASE_URL` | No                        | `file:./data/smart-invoice.db` |
| `TURSO_AUTH_TOKEN`   | Solo si usas Turso remoto | token real                     |

Puedes partir de `.env.example`.

## Volumen persistente

Si usas base local, monta un volumen persistente exactamente en:

`/app/data`

Eso conserva:

- `smart-invoice.db`
- `smart-invoice.db-wal`
- `smart-invoice.db-shm`

Sin ese volumen perderas la base al recrear el contenedor.

## Primer despliegue

1. Configura variables.
2. Configura volumen `/app/data`.
3. Despliega.
4. Espera healthcheck `200 OK` en `/api/health`.
5. Inicia sesion con el usuario seed solo si la base es nueva.

Credenciales seed iniciales:

- `admin@smart.com`
- password inicial: `1234`

Cambiarlas despues del primer acceso es recomendable si el entorno dejara de ser solo interno.

## Seed de base de datos

No necesitas correr `npm run db:seed` en cada deploy.

El servidor ya ejecuta migraciones y seed idempotente al arrancar. Usa `npm run db:seed` solo para recuperacion manual o inicializacion fuera del flujo normal.

## Checklist de validacion post-deploy

1. `GET /api/health` responde `200`.
2. La pantalla de login carga sin errores.
3. `admin@smart.com / 1234` entra si la base fue creada desde cero.
4. Puedes listar agencias y planes.
5. La extraccion IA funciona con `GEMINI_API_KEY` valida.
6. Tras reiniciar el servicio, los datos siguen presentes si montaste `/app/data`.

## Troubleshooting rapido

### El healthcheck falla

Revisa:

- que el puerto del servicio sea `3001`
- que `npm run start` sea el comando efectivo si no usas Dockerfile
- que no falte `dist/` en la imagen

### La app levanta pero no guarda datos

Casi siempre es volumen mal montado o montado en una ruta distinta de `/app/data`.

### La IA no extrae datos

Revisa `GEMINI_API_KEY`. La clave se usa en backend, no en el navegador.

### Quiero usar Turso remoto

Define:

- `TURSO_DATABASE_URL=libsql://...`
- `TURSO_AUTH_TOKEN=...`

En ese modo el volumen local deja de ser obligatorio para la base.

## Decisiones operativas recomendadas

- Para empezar en Hetzner: SQLite local + backup del volumen.
- Para crecimiento: Turso remoto + mismo contenedor de aplicacion.
- Para cambios de codigo: mantén `README.md` y este archivo sincronizados cuando cambien puertos, healthcheck o variables.
