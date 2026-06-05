# Plan de Evolucion Futura de IA y Agentes

## Objetivo de este documento

Este documento sirve como base tecnica para una futura version del sistema de IA, sin cambiar el codigo actual.

La idea es que puedas:

- Entender exactamente como funciona hoy.
- Ver con claridad que partes estan bien y cuales limitan la escalabilidad.
- Tener una ruta de actualizacion paso a paso para una futura version.
- Reducir el riesgo de romper lo que hoy ya funciona.

## Alcance

Este documento describe:

- El funcionamiento actual del pipeline de extraccion por IA.
- La logica actual de prompts y agentes.
- La limitacion actual del procesamiento batch.
- La arquitectura recomendada para una version futura.
- Un plan de migracion por fases, compatible con la version actual.

No implementa cambios en la aplicacion. Es solo una especificacion tecnica.

## Nota actual: AutoPilot AI

La primera base runtime de mejora continua ya existe como `AutoPilot AI`. Su alcance actual y la siguiente iteracion recomendada estan documentados en `docs/AutoPilotAI.md`.

## 1. Estado actual del sistema

## 1.1 Flujo actual de extremo a extremo

Hoy el flujo funciona asi:

1. El usuario inicia sesion en la aplicacion.
2. El frontend guarda el `sessionId` y luego lo envia al backend en `X-Session-Id`.
3. El usuario carga uno o varios archivos en la interfaz.
4. En el flujo directo, el frontend llama a `POST /api/ai/extract` con `file` y `format`.
5. En el flujo en cola, el frontend llama a `/api/documents/upload` y el worker procesa los documentos despues.
6. El backend valida la sesion.
7. El backend arma el prompt centralizado usando `buildExtractionPrompt(format)`.
8. El backend envia archivo + prompt al modelo Gemini.
9. Gemini responde en JSON estructurado usando `invoiceExtractionSchema`.
10. El backend valida estructura minima y recalcula discrepancias de confianza.
11. En el flujo worker, se normalizan MAWB/HAWB y se persiste el resultado.
12. El frontend muestra estado, resultado e historial para revision operativa.

## 1.2 Donde vive cada responsabilidad hoy

### Frontend

- Permite seleccionar agencia, cargar PDFs y elegir el formato activo.
- Muestra estado de carga, cola, procesamiento, errores y resultados.
- Conserva el flujo directo legacy mediante `BatchProcessor.tsx` para llamadas a `/api/ai/extract`.
- En el flujo actual de workspace, delega la cola persistente al backend.

Archivos principales relacionados:

- `components/BatchProcessor.tsx`
- `components/DocumentProcessingWorkspace.tsx`
- `App.tsx`
- `hooks/index.ts`

### Backend

- Valida autenticacion.
- Recibe el archivo y el tipo de formato.
- Construye el prompt.
- Llama a Gemini.
- Exige salida JSON compatible con schema.
- Recalcula discrepancias de confianza para piezas, EQ y valor.
- Procesa documentos en background mediante `documentWorker` cuando se usa la cola persistente.
- Devuelve el resultado o un error.

Archivos principales relacionados:

- `server/routes/ai.ts`
- `server/routes/documents.ts`
- `server/services/documentExtractionService.ts`
- `server/workers/documentWorker.ts`

### Definicion de prompts

- La composicion de instrucciones esta centralizada.
- Se arma un prompt largo por secciones reutilizables.
- Solo algunos agentes activan logica adicional.

Archivo principal relacionado:

- `services/agentPrompts.ts`

### Schema de salida estructurada

- La respuesta del modelo no es texto libre.
- El backend solicita JSON con estructura fija.
- Esto reduce bastante la variabilidad de salida.

Archivo principal relacionado:

- `shared/extractionSchema.ts`

## 2. Como funciona hoy la parte de agentes y prompts

## 2.1 Prompt base actual

Hoy el prompt se construye uniendo bloques:

- Introduccion del sistema.
- Base de conocimiento para tipos de caja.
- Reglas de header y footer.
- Reglas de extraccion de tablas.
- Logica avanzada de distribucion para ciertos formatos.
- Algoritmo de confidence score.
- Instruccion final para devolver JSON estricto.

Esto significa que el sistema actual ya tiene una buena base porque:

- No depende solo de una instruccion corta y fragil.
- Tiene reglas explicitas del dominio logistico.
- Obliga al modelo a responder en una estructura conocida.

## 2.2 Tipos de agentes actuales

Actualmente el agente activo de extraccion es:

- `AGENT_GENERIC_A`

Tambien existen agentes reservados/deshabilitados para evolucion futura:

- `AGENT_GENERIC_B`
- `AGENT_CUSTOMS`

En la practica, hoy el prompt operativo vive en `AGENT_GENERIC_A`.

La diferencia principal actual es esta:

- `AGENT_GENERIC_A` activa `ADVANCED_DISTRIBUTION_LOGIC`.
- `AGENT_GENERIC_B` y `AGENT_CUSTOMS` permanecen como reservas deshabilitadas.

Conclusion tecnica:

- Hoy existe un agente principal de factura general, no una arquitectura multi-agente especializada.
- Las variantes futuras deben agregarse solo cuando tengan reglas reales distintas y pruebas de regresion.

## 2.3 Fortalezas actuales

- El prompt ya contiene conocimiento de negocio real.
- El uso de `responseSchema` reduce respuestas desordenadas.
- La salida JSON facilita validacion y persistencia.
- El backend protege la API key, porque la llamada a Gemini no ocurre desde el navegador.

## 2.4 Debilidades actuales

- El prompt es monolitico y crecerlo demasiado puede volverlo dificil de mantener.
- No hay versionado explicito de prompts.
- No hay trazabilidad fuerte de que prompt se uso en cada documento procesado.
- La logica deterministica y la logica generativa estan mezcladas conceptualmente.
- El sistema no separa bien extraccion, validacion, correccion y scoring.
- La configuracion tiene `MAX_RETRIES` y `RETRY_DELAY_MS`, pero hoy esa logica no esta implementada realmente en `server/routes/ai.ts`.

## 3. Como funciona hoy el batch

## 3.1 Orquestacion actual

El procesamiento puede ocurrir por dos rutas:

- Ruta directa legacy: `BatchProcessor.tsx` llama a `/api/ai/extract` por archivo.
- Ruta actual de workspace: `DocumentProcessingWorkspace.tsx` sube PDFs a `/api/documents/upload` y `documentWorker` procesa la cola persistente.

En la ruta de workspace:

- El backend conserva jobs persistentes por agencia y lote.
- El worker lee el PDF almacenado, llama a Gemini y guarda el JSON resultante.
- Los estados `UPLOADED`, `QUEUED`, `PROCESSING`, `SUCCESS`, `ERROR` y `CANCELLED` permiten seguimiento operativo.

Esto hoy esta implementado principalmente en `components/DocumentProcessingWorkspace.tsx`, `server/routes/documents.ts` y `server/workers/documentWorker.ts`.

`components/BatchProcessor.tsx` se mantiene como flujo directo compatible, pero no representa la ruta principal de cola persistente.

## 3.2 Que pasa cuando el usuario sube 20 archivos

Hoy, si el usuario sube 20 archivos:

1. El frontend crea una cola local.
2. Procesa el archivo 1.
3. Espera la respuesta completa.
4. Hace una pausa artificial.
5. Procesa el archivo 2.
6. Repite hasta terminar.

Consecuencia:

- El throughput total depende de una sola secuencia.
- Si una llamada tarda mucho, retrasa todo el lote.
- Si el navegador se cierra o refresca, la orquestacion puede perder continuidad.
- No existe una cola durable real del lado del servidor.
- No existe concurrencia controlada del lado backend.

## 3.3 Conclusiones del batch actual

El diseño actual funciona bien para:

- Validacion inicial del producto.
- Lotes pequenos.
- Entornos de desarrollo.
- Casos donde importa mas la simplicidad que el throughput.

El diseño actual no es ideal para:

- Lotes medianos o grandes.
- Operacion semiproduccion o produccion.
- Reintentos automaticos confiables.
- Observabilidad real de trabajos.
- Escalado controlado por concurrencia.

## 4. Problemas que conviene resolver en una version futura

## 4.1 Problema 1: El frontend hoy es el orquestador

Esto hace que el sistema dependa demasiado del navegador.

Riesgos:

- Si el usuario cierra la pestaña, el job se corta.
- Si hay problemas de red, la cola queda a medias.
- El progreso real no vive en el backend.

## 4.2 Problema 2: No hay cola de trabajos en backend

Hoy no existe un concepto formal de:

- Job batch.
- Estado del job.
- Estado por item.
- Reintentos por item.
- Concurrencia maxima.

## 4.3 Problema 3: Prompting y validacion estan demasiado acoplados

Hoy el modelo hace demasiadas cosas de una vez:

- Extraer.
- Corregir.
- Calcular.
- Detectar discrepancias.
- Puntuar confianza.

Eso no siempre es malo, pero si complica:

- Auditoria.
- Ajustes finos.
- Debugging.
- Comparacion entre versiones.

## 4.4 Problema 4: Falta versionado y trazabilidad de prompts

Para una version madura, deberia ser posible responder estas preguntas:

- Que prompt exacto produjo este resultado.
- Que version del schema se uso.
- Que version del modelo se uso.
- Que validaciones pasaron o fallaron despues.

Hoy eso no esta modelado formalmente.

## 5. Arquitectura objetivo recomendada

La recomendacion es evolucionar hacia una arquitectura por etapas, pero sin romper la version actual.

## 5.1 Principio base

Mover la orquestacion al backend, mantener el frontend como cliente de trabajos y separar generacion de validacion deterministica.

## 5.2 Pipeline futuro recomendado

### Etapa A: Creacion del job

El frontend sube varios archivos y crea un `batchJob`.

El backend responde con algo como:

- `jobId`
- estado inicial
- numero de items
- fecha de creacion

### Etapa B: Registro de items

El backend crea un item por archivo.

Cada item debe tener estados como:

- `PENDING`
- `PROCESSING`
- `SUCCESS`
- `ERROR`
- `RETRYING`

### Etapa C: Worker de procesamiento

Un worker o procesador interno toma items pendientes.

Ese worker:

1. Selecciona el siguiente item.
2. Construye el prompt correcto.
3. Llama a Gemini.
4. Guarda la respuesta cruda.
5. Ejecuta validaciones deterministicas.
6. Guarda el resultado final.
7. Marca estado final.

### Etapa D: Consulta de progreso

El frontend ya no procesa archivos uno por uno.

En vez de eso:

- Consulta el progreso del job.
- Escucha actualizaciones del backend.
- Muestra resultados por item.

### Etapa E: Persistencia completa y trazabilidad

Cada item deberia guardar al menos:

- `jobId`
- `fileName`
- `agentType`
- `promptVersion`
- `modelId`
- `schemaVersion`
- resultado crudo
- resultado normalizado
- validaciones ejecutadas
- errores o warnings
- tiempos de inicio y fin

## 5.3 Concurrencia recomendada

Para una primera version segura:

- Concurrencia 2 o 3 en local o cuentas limitadas.
- Concurrencia 3 a 5 en produccion controlada.
- Backoff y retry por item, no por lote completo.

La clave es que la concurrencia no debe depender del navegador.

## 5.4 Separacion recomendada de responsabilidades

### Capa 1: Extraccion por IA

Responsabilidad:

- Leer el documento.
- Devolver una primera extraccion estructurada.

### Capa 2: Normalizacion deterministica

Responsabilidad:

- Limpiar formatos.
- Convertir numeros.
- Homologar tipos de caja.
- Aplicar reglas estables del negocio.

### Capa 3: Validacion y reconciliacion

Responsabilidad:

- Verificar sumas.
- Detectar diferencias entre footer y lineas.
- Detectar campos faltantes.
- Emitir warnings y score final.

### Capa 4: Observabilidad y versionado

Responsabilidad:

- Saber que paso en cada item.
- Poder comparar resultados entre versiones futuras.

## 6. Modelo futuro de agentes recomendado

## 6.1 Que no conviene hacer

No conviene crear muchos agentes solo por nombre si todos hacen lo mismo internamente.

Eso genera:

- Duplicacion.
- Dificultad de mantenimiento.
- Cambios inconsistentes.

## 6.2 Que si conviene hacer

Conviene definir agentes por estrategia real de extraccion.

Ejemplo de categorias futuras:

- `INVOICE_STANDARD_AGENT`
- `INVOICE_DISTRIBUTION_AGENT`
- `CUSTOMS_DOCUMENT_AGENT`
- `AWB_RECON_AGENT`

Pero mas importante que el nombre es que cada uno tenga:

- Reglas propias.
- Prompt propio versionado.
- Validaciones propias.
- Criterios de score propios.

## 6.3 Versionado recomendado

Cada ejecucion futura deberia guardar algo como:

- `agentType`
- `agentVersion`
- `promptVersion`
- `schemaVersion`
- `validationVersion`

Eso permitira comparar calidad entre versiones sin adivinar que cambio.

## 7. Plan de migracion segura por fases

Este es el orden recomendado para no romper lo actual.

## Fase 0: Congelar la base actual

Objetivo:

- Tener el estado actual estable versionado.
- No tocar el flujo actual todavia.

Resultado esperado:

- Base segura para volver atras.

## Fase 1: Crear infraestructura de jobs en backend

Objetivo:

- Introducir el concepto de `batchJob` y `batchJobItem`.

Sin cambiar todavia la extraccion actual.

Se agregaria:

- Tabla de jobs.
- Tabla de job items.
- Endpoints para crear job y consultar progreso.

Compatibilidad:

- El flujo actual puede seguir funcionando mientras esto se introduce.

## Fase 2: Mover la orquestacion del batch al backend

Objetivo:

- Dejar que el frontend solo cree jobs y consulte progreso.

Se cambiaria:

- El loop secuencial de `BatchProcessor.tsx` dejaria de ser el orquestador principal.

Beneficios:

- Mejor tolerancia a fallos.
- Mejor escalabilidad.
- Mejor observabilidad.

## Fase 3: Agregar concurrencia controlada

Objetivo:

- Procesar varios items en paralelo con limites seguros.

Se agregaria:

- Pool de concurrencia.
- Retry con backoff.
- Manejo de rate limits.

Beneficio:

- Mejor tiempo total para lotes de 20 archivos o mas.

## Fase 4: Separar extraccion, normalizacion y validacion

Objetivo:

- Que la IA extraiga.
- Que el sistema valide y corrija lo deterministicamente posible.

Beneficio:

- Mayor control y menor fragilidad del prompt.

## Fase 5: Versionar prompts, schemas y validaciones

Objetivo:

- Poder comparar calidad entre versiones.
- Tener auditoria tecnica real.

## Fase 6: Optimizar observabilidad y calidad

Objetivo:

- Medir tiempos.
- Medir errores por tipo.
- Medir formatos que fallan mas.
- Medir calidad por agente y por prompt.

## 8. Recomendacion concreta para no romper lo actual

Si en el futuro se hace esta evolucion, la recomendacion es:

1. No reemplazar de golpe el flujo actual.
2. Introducir primero las nuevas tablas y endpoints.
3. Mantener temporalmente el flujo actual como fallback.
4. Activar el nuevo batch backend con feature flag o ruta separada.
5. Comparar resultados entre ambos flujos.
6. Migrar completamente solo cuando el nuevo pipeline sea estable.

Esta es la forma mas segura de avanzar sin romper el sistema actual.

## 9. Resumen ejecutivo

Hoy el sistema actual de IA:

- Ya funciona.
- Ya tiene una buena base de prompting estructurado.
- Ya protege la API key desde backend.
- Ya usa JSON schema para controlar salida.

Pero hoy tambien tiene estas limitaciones:

- El batch vive en el frontend.
- No hay cola real en backend.
- No hay concurrencia controlada.
- No hay versionado formal de prompts y validaciones.
- El modelo hace demasiado en una sola etapa.

La mejor evolucion futura es:

- mover el batch al backend,
- agregar concurrencia controlada,
- separar IA de validacion deterministica,
- versionar prompts y resultados,
- y migrar por fases sin apagar el flujo actual de golpe.

## 10. Archivos actuales clave para entender esta futura migracion

- `services/agentPrompts.ts`
- `server/routes/ai.ts`
- `components/BatchProcessor.tsx`
- `hooks/index.ts`
- `services/apiClient.ts`
- `shared/extractionSchema.ts`
- `config.ts`

## 11. Proximo uso recomendado de este documento

Cuando decidas iniciar la nueva version, este documento debe servir como checklist inicial para:

1. definir tablas nuevas,
2. definir endpoints nuevos,
3. decidir el modelo de concurrencia,
4. decidir el versionado de prompts,
5. y ejecutar la migracion por fases.
