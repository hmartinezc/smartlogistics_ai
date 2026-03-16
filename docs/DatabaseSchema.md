# 📦 Smart Invoice AI — Esquema de Base de Datos

## Resumen de Arquitectura

| Componente       | Tecnología            | Descripción                              |
|------------------|-----------------------|------------------------------------------|
| **Frontend**     | React 18 + Vite 5    | SPA con TailwindCSS                      |
| **Backend API**  | Hono (Node.js)       | API REST ligera montada en `/api/*`      |
| **Base de datos**| libSQL (Turso local)  | SQLite fork con WAL + foreign keys       |
| **Archivo DB**   | `data/smart-invoice.db` | Se crea al iniciar el servidor         |

### Modos de Base de Datos

| Variable de Entorno      | Efecto                                           |
|--------------------------|--------------------------------------------------|
| *(sin variables)*        | Usa archivo local: `file:./data/smart-invoice.db` |
| `TURSO_DATABASE_URL`     | Conecta a instancia Turso remota                 |
| `TURSO_AUTH_TOKEN`       | Token de autenticación para Turso remoto         |

---

## Diagrama de Relaciones (ER)

```
subscription_plans ────< agencies ────< agency_emails
                              │
                              ├────< batch_items
                              │
                              ├────< booked_awb_records
                              │
                              └──── user_agencies >──── users ────< auth_sessions

Leyenda:
  ────<  = uno a muchos (1:N)
  >────  = muchos a muchos (M:N) via tabla puente
```

---

## Tablas

### 1. `subscription_plans` — Planes de Suscripción

Define los niveles de servicio disponibles para las agencias.

| Columna          | Tipo    | Restricción     | Descripción                             |
|------------------|---------|-----------------|-----------------------------------------|
| `id`             | TEXT    | **PRIMARY KEY** | ID único (ej: `PLAN_BASIC`)            |
| `name`           | TEXT    | NOT NULL        | Nombre visible (ej: `Starter (5k)`)    |
| `doc_limit`      | INTEGER | NOT NULL        | Límite de documentos del plan           |
| `base_cost`      | REAL    | NOT NULL        | Costo base mensual                      |
| `extra_page_cost`| REAL    | NOT NULL        | Costo por página extra                  |

**Datos seed:** 3 planes — PLAN_BASIC (5k/525), PLAN_PRO (8k/600), PLAN_ENTERPRISE (15k/799)

---

### 2. `agencies` — Agencias / Clientes / Tenants

Cada agencia es un "tenant" del sistema con su propio plan y uso.

| Columna         | Tipo    | Restricción           | Descripción                               |
|-----------------|---------|-----------------------|-------------------------------------------|
| `id`            | TEXT    | **PRIMARY KEY**       | ID único (ej: `AGENCY_HQ`)               |
| `name`          | TEXT    | NOT NULL              | Nombre de la agencia                      |
| `plan_id`       | TEXT    | NOT NULL, **FK** → `subscription_plans.id` | Plan asignado  |
| `current_usage` | INTEGER | NOT NULL, DEFAULT 0   | Documentos procesados en período actual   |
| `is_active`     | INTEGER | NOT NULL, DEFAULT 1   | 1=activa, 0=suspendida                    |
| `created_at`    | TEXT    | DEFAULT now           | Fecha de creación                         |
| `updated_at`    | TEXT    | DEFAULT now           | Última modificación                       |

**Datos seed:** AGENCY_HQ (SmartLogistics HQ, Enterprise), AGENCY_CLIENT_A (Flores Del Valle, Basic), AGENCY_CLIENT_B (Cargo Express, Pro)

---

### 3. `agency_emails` — Correos de Agencia

Emails asociados a cada agencia. Una agencia puede tener múltiples direcciones de correo.

| Columna    | Tipo    | Restricción                                     | Descripción           |
|------------|---------|--------------------------------------------------|-----------------------|
| `id`       | INTEGER | **PRIMARY KEY** AUTOINCREMENT                   | ID autoincremental    |
| `agency_id`| TEXT   | NOT NULL, **FK** → `agencies.id` ON DELETE CASCADE | Agencia propietaria |
| `email`    | TEXT    | NOT NULL                                         | Dirección de correo   |

**Índice:** `idx_agency_emails_agency` en `agency_id`

---

### 4. `users` — Usuarios del Sistema

| Columna     | Tipo | Restricción                                          | Descripción                     |
|-------------|------|------------------------------------------------------|---------------------------------|
| `id`        | TEXT | **PRIMARY KEY**                                      | ID único                        |
| `email`     | TEXT | NOT NULL, **UNIQUE**                                 | Email (login)                   |
| `password`  | TEXT | NOT NULL                                             | Hash de contraseña (`scrypt`)   |
| `name`      | TEXT | NOT NULL                                             | Nombre completo                 |
| `role`      | TEXT | NOT NULL, CHECK(`ADMIN`, `OPERADOR`, `SUPERVISOR`)  | Rol del usuario                 |
| `is_active` | INTEGER | NOT NULL, DEFAULT 1                               | 1=activo, 0=desactivado        |
| `created_at`| TEXT | DEFAULT now                                          | Fecha de creación               |
| `updated_at`| TEXT | DEFAULT now                                          | Última modificación             |

**Datos seed:** admin@smart.com (ADMIN), operador@smart.com (OPERADOR), supervisor@smart.com (SUPERVISOR) — todos con credencial inicial `1234`, almacenada como hash en la BD.

#### Roles y Permisos

| Rol          | Acceso                                                    |
|--------------|-----------------------------------------------------------|
| `ADMIN`      | Todo: usuarios, agencias, configuración, procesamiento    |
| `SUPERVISOR` | Agencias asignadas, ver resultados, panel operativo       |
| `OPERADOR`   | Solo procesamiento de facturas en agencias asignadas      |

---

### 5. `user_agencies` — Relación Usuario ↔ Agencia (M:N)

Tabla puente que permite asignar un usuario a múltiples agencias.

| Columna    | Tipo | Restricción                                         | Descripción      |
|------------|------|------------------------------------------------------|------------------|
| `user_id`  | TEXT | **PK**, **FK** → `users.id` ON DELETE CASCADE       | ID del usuario   |
| `agency_id`| TEXT | **PK**, **FK** → `agencies.id` ON DELETE CASCADE    | ID de la agencia |

**Índices:** `idx_user_agencies_user`, `idx_user_agencies_agency`

---

### 6. `auth_sessions` — Sesiones de Autenticación

Maneja sesiones con expiración de 8 horas.

| Columna     | Tipo | Restricción                                    | Descripción              |
|-------------|------|--------------------------------------------------|--------------------------|
| `id`        | TEXT | **PRIMARY KEY**                                | UUID de la sesión        |
| `user_id`   | TEXT | NOT NULL, **FK** → `users.id` ON DELETE CASCADE| Usuario de la sesión     |
| `expires_at`| TEXT | NOT NULL                                       | Expiración (ISO 8601)    |
| `created_at`| TEXT | DEFAULT now                                    | Fecha de creación        |

**Índice:** `idx_auth_sessions_user`

---

### 7. `batch_items` — Resultados de Procesamiento de Facturas

Cada fila es un documento procesado. El campo `result_json` guarda el `InvoiceData` completo como JSON.

| Columna       | Tipo | Restricción                                | Descripción                       |
|---------------|------|--------------------------------------------|-----------------------------------|
| `id`          | TEXT | **PRIMARY KEY**                            | UUID del item                     |
| `file_name`   | TEXT | NOT NULL                                   | Nombre del archivo original       |
| `status`      | TEXT | NOT NULL, CHECK(`PENDING`, `PROCESSING`, `SUCCESS`, `ERROR`) | Estado del procesamiento |
| `result_json`  | TEXT | nullable                                   | JSON con datos extraídos (InvoiceData) |
| `error`       | TEXT | nullable                                   | Mensaje de error si falló         |
| `processed_at`| TEXT | nullable                                   | Fecha de procesamiento            |
| `user_email`  | TEXT | nullable                                   | Email del usuario que procesó     |
| `agency_id`   | TEXT | **FK** → `agencies.id`                     | Agencia propietaria               |
| `created_at`  | TEXT | DEFAULT now                                | Fecha de creación                 |

**Índices:** `idx_batch_items_agency`, `idx_batch_items_status`

---

### 8. `booked_awb_records` — AWBs Reservados (Panel Operativo)

Registros de AWBs reservados para la conciliación operativa.

| Columna        | Tipo    | Restricción                            | Descripción                        |
|----------------|---------|----------------------------------------|------------------------------------|
| `id`           | INTEGER | **PRIMARY KEY** AUTOINCREMENT         | ID                                 |
| `mawb`         | TEXT    | NOT NULL                               | Número de guía madre               |
| `booked_hijas` | INTEGER | NOT NULL, DEFAULT 0                   | Cantidad de hijas reservadas       |
| `booked_pieces`| INTEGER | NOT NULL, DEFAULT 0                   | Piezas reservadas                  |
| `booked_fulls` | REAL    | NOT NULL, DEFAULT 0                   | Fulls reservados                   |
| `operation_date`| TEXT   | NOT NULL                               | Fecha de operación                 |
| `agency_id`    | TEXT    | NOT NULL, **FK** → `agencies.id`      | Agencia propietaria                |

**Constraint UNIQUE:** `(mawb, operation_date, agency_id)` — evita duplicados por MAWB+fecha+agencia  
**Índice:** `idx_booked_awb_date` en `(operation_date, agency_id)`

---

### 9. `app_settings` — Configuración de la App

Almacén key-value para configuraciones generales.

| Columna     | Tipo | Restricción     | Descripción               |
|-------------|------|-----------------|---------------------------|
| `key`       | TEXT | **PRIMARY KEY** | Clave de configuración    |
| `value`     | TEXT | NOT NULL        | Valor                     |
| `updated_at`| TEXT | DEFAULT now     | Última modificación       |

**Datos seed:** `darkMode` = `false`

---

## Endpoints de la API

### Autenticación (`/api/auth`)

| Método | Ruta               | Descripción                   | Body / Headers                     |
|--------|--------------------|------------------------------ |------------------------------------|
| POST   | `/api/auth/login`  | Iniciar sesión                | `{ email, password }`              |
| GET    | `/api/auth/session`| Validar sesión actual         | Header: `X-Session-Id`            |
| DELETE | `/api/auth/session`| Cerrar sesión                 | Header: `X-Session-Id`            |

### Usuarios (`/api/users`)

| Método | Ruta              | Descripción                   |
|--------|--------------------|-------------------------------|
| GET    | `/api/users`       | Listar todos los usuarios    |
| GET    | `/api/users/:id`   | Obtener un usuario           |
| POST   | `/api/users`       | Crear usuario                |
| PUT    | `/api/users/:id`   | Actualizar usuario           |
| DELETE | `/api/users/:id`   | Eliminar usuario             |

**Autorización:** solo `ADMIN`

### Agencias (`/api/agencies`)

| Método | Ruta                      | Descripción                   |
|--------|---------------------------|-------------------------------|
| GET    | `/api/agencies`           | Listar todas las agencias    |
| GET    | `/api/agencies/:id`       | Obtener una agencia          |
| POST   | `/api/agencies`           | Crear agencia                |
| PUT    | `/api/agencies/:id`       | Actualizar agencia           |
| DELETE | `/api/agencies/:id`       | Eliminar agencia             |
| PATCH  | `/api/agencies/:id/usage` | Incrementar uso (atomic)     |

**Autorización:**
- `ADMIN`: acceso total
- `SUPERVISOR` / `OPERADOR`: solo lectura de sus agencias asignadas
- `PATCH /:id/usage`: permitido solo sobre agencias accesibles para la sesión

### Batch / Facturas (`/api/batch`)

| Método | Ruta            | Descripción                       |
|--------|-----------------|-----------------------------------|
| GET    | `/api/batch`    | Listar items (filtro: `?agencyId=`) |
| POST   | `/api/batch`    | Guardar resultados de batch       |
| PUT    | `/api/batch/:id`| Actualizar un item                |
| DELETE | `/api/batch`    | Limpiar todos los items           |

**Autorización:** cada sesión solo puede leer o modificar batches de sus agencias; `ADMIN` puede ver todo.

### Operacional (`/api/operational`)

| Método | Ruta                            | Descripción                           |
|--------|----------------------------------|---------------------------------------|
| GET    | `/api/operational/reconciliation`| Conciliación AWB (filtros: `agencyId`, `date`) |
| POST   | `/api/operational/booked`       | Guardar AWB reservado (upsert)        |

**Autorización:** acceso restringido por agencia.

### IA / Extracción (`/api/ai`)

| Método | Ruta               | Descripción                                  |
|--------|--------------------|----------------------------------------------|
| POST   | `/api/ai/extract`  | Extrae datos del documento usando Gemini     |

**Body:** `multipart/form-data` con `file` y `format`  
**Autorización:** sesión requerida  
**Nota:** la API key ya no viaja al navegador; la llamada a Gemini sale desde backend.

### Planes (`/api/plans`)

| Método | Ruta          | Descripción                   |
|--------|---------------|-------------------------------|
| GET    | `/api/plans`  | Listar planes de suscripción |

**Autorización:** sesión requerida

### Settings (`/api/settings`)

| Método | Ruta                   | Descripción                   |
|--------|------------------------|-------------------------------|
| GET    | `/api/settings/:key`   | Obtener una configuración    |
| PUT    | `/api/settings/:key`   | Guardar una configuración    |

**Autorización:** sesión requerida

### Utilidad

| Método | Ruta          | Descripción              |
|--------|---------------|--------------------------|
| GET    | `/api/health` | Health check del servidor|

---

## Reglas de Negocio Implementadas en el Backend

1. **Eliminación de agencia** — bloqueada si tiene usuarios asignados
2. **Suspensión de agencia** — bloqueada si deja usuarios sin ninguna agencia activa
3. **Email de usuario** — debe ser único en todo el sistema
4. **Usuario no-admin** — debe tener al menos una agencia activa asignada
5. **Password** — mínimo 4 caracteres
6. **Sesiones** — expiran a las 8 horas automáticamente
7. **AWB duplicados** — constraint UNIQUE previene registros duplicados por MAWB+fecha+agencia
8. **Uso de agencia** — incremento atómico (PATCH) para concurrencia segura
9. **Passwords en seed** — se insertan hasheadas con `scrypt`
10. **Autorización API** — todas las rutas salvo `/api/health` y `/api/auth/login` requieren sesión válida
11. **Aislamiento por rol/agencia** — operador y supervisor no pueden consultar datos administrativos globales

---

## Comandos de Desarrollo

```bash
# Desarrollo (frontend + backend simultáneo con hot-reload)
npm run dev

# Solo frontend
npm run dev:client

# Solo backend
npm run dev:server

# Build producción
npm run build

# Ejecutar en producción
npm run start
# o con puerto personalizado:
PORT=8080 npm run start
```

---

## Configuración para Despliegue (Coolify / Docker)

### Variables de Entorno

| Variable             | Requerida | Descripción                               |
|----------------------|-----------|-------------------------------------------|
| `PORT`               | No        | Puerto del servidor (default: 3001)       |
| `TURSO_DATABASE_URL` | No        | URL de Turso remoto (default: archivo local) |
| `TURSO_AUTH_TOKEN`   | No        | Token de auth de Turso (si es remoto)     |
| `GEMINI_API_KEY`     | Sí        | API key de Google Gemini para IA          |

### Artefactos de despliegue incluidos

- `Dockerfile` multi-stage en la raíz del repo
- `.dockerignore` para evitar subir artefactos locales
- `.env.example` como plantilla de variables
- `docs/CoolifyDeployment.md` como receta operativa final

### Notas para Coolify

- **Método recomendado:** usar el `Dockerfile` del repo
- **Fallback con Nixpacks:** `npm run build` y `npm run start`
- **Port:** `3001`
- **Healthcheck:** `/api/health`
- La base de datos local se guarda en `data/smart-invoice.db`
- Para persistencia: montar volumen en `/app/data`
