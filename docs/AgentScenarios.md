
# Lógica de Razonamiento del Agente IA (Scenarios)

Este documento detalla los escenarios lógicos programados en `geminiService.ts`. El agente evalúa la estructura visual de la factura y decide qué escenario aplicar línea por línea o globalmente.

## 0. Base de Conocimiento (Matemática Estricta)
Antes de aplicar cualquier escenario, el agente normaliza los tipos de caja usando esta tabla maestra:

| Código Visual | Tipo Normalizado | Factor Matemático (EQ) |
| :--- | :--- | :--- |
| F, FX, PL, FULL | **FB** | 1.00 |
| HB, H, 1/2 | **HB** | 0.50 |
| QB, Q, 1/4 | **QB** | 0.25 |
| EB, E, 1/8 | **EB** | 0.125 |
| DS, D, SPLIT | **DS** | 0.0625 |

---

## Escenario A: Extracción Estándar ("Happy Path")
**Condición:** La tabla tiene columnas explícitas para "Piezas" (Pieces) y "Tipo de Caja" (Box Type) en cada fila.
**Comportamiento:**
1.  Extrae el valor tal cual aparece.
2.  Si existe la columna EQ, la valida.
3.  Si NO existe la columna EQ, la calcula (Piezas * Factor).

> **Ejemplo:**
> *   Imagen: Columna Pieces="10", Columna Type="HB".
> *   Output: `{ totalPieces: 10, boxType: "HB", eqFull: 5.0 }`

---

## Escenario B: Calculadora de EQ Faltante
**Condición:** La tabla tiene Piezas y Tipo, pero **NO** tiene columna de "Full Equivalent" o "EQ".
**Comportamiento:**
El agente actúa como calculadora forzosa.
1.  Lee Piezas (ej. 4).
2.  Lee Tipo (ej. QB).
3.  Aplica Factor (0.25).
4.  Resultado EQ = 1.00.

---

## Escenario C: Distribución Avanzada (Solo Agentes TCBV/Genérico A)
**Condición:** La factura agrupa los valores financieros (Total Value, Stems) en una línea resumen o encabezado, pero detalla las cajas abajo.
**Comportamiento:**
1.  Calcula el EQ de cada fila individual.
2.  Calcula el EQ Total.
3.  Prorratea (distribuye) el valor monetario total a cada fila basándose en su peso (EQ).

---

## Escenario D: Explosión de "Master Box" (Prorrateo)
**Condición:** 
1.  La tabla dice "1 Box" o "1 Bulto" (agrupado).
2.  El Pie de Página (Footer) dice algo diferente, ej: "Total Pieces: 4", "Type: QB".
3.  Hay múltiples líneas de productos dentro de ese bulto.

**Comportamiento:**
1.  **Ignora** la columna "Boxes" de la tabla (que dice 1).
2.  **Confía** en el Pie de Página (4 Piezas, Tipo QB).
3.  Distribuye esas 4 piezas entre las filas basándose en la cantidad de Tallos (Stems) o Valor.
4.  Asigna el tipo de caja real (QB) a cada ítem extraído.

> **Caso de Uso:** Facturas donde meten 4 Quarter Boxes dentro de 1 caja grande de cartón para el envío, pero comercialmente son 4 QBs.

---

## Escenario E: Variedades Agrupadas (Nuevo)
**Condición:**
1.  Una fila "Padre" tiene datos completos (Piezas: 2, Tipo: EB, Descripción: "Lisianthus").
2.  Las filas siguientes ("Hijas") están **vacías** en las columnas de Piezas/Cajas, pero tienen texto en la Descripción (ej: "Pink", "White", "Purple").

**Comportamiento:**
1.  **NO** crea nuevos ítems para las filas hijas (evita duplicar costos/piezas).
2.  Agrega los textos de las hijas a un array `varieties` dentro del objeto del Padre.
3.  Mantiene los totales del Padre intactos.

> **Resultado UI:**
> *   Item 1: 2 EB - Lisianthus
>     *   *Variedades: Pink, White, Purple*

---

## Matriz de Decisión de Errores (Penalizaciones)

El agente reduce el `confidenceScore` (100) si:

1.  **Math Mismatch (-50 pts):** La suma de las líneas extraídas no coincide con el total impreso en el pie de página.
2.  **EQ Mismatch (-40 pts):** El cálculo de Fulls no coincide con el footer.
3.  **Uncertainty (-20 pts):** Texto ilegible o tipos de caja desconocidos (ej. "XB").
