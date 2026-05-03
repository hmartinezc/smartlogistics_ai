---
description: Recommend the best AI model for a task based on complexity and cost budget
---

# /model-route [task-description] [--budget low|med|high]

Recomienda qué modelo usar para una tarea. Contexto del proyecto: Gemini Flash para extracción (LOCKED), DeepSeek para agentes.

## Modelos disponibles

| Modelo                          | Para                                                         | Costo           |
| ------------------------------- | ------------------------------------------------------------ | --------------- |
| `gemini-2.5-flash-preview`      | Extracción AI de facturas PDF (LOCKED — probado excelente)   | Medio           |
| `opencode-go/deepseek-v4-pro`   | Arquitectura, planning, code review profundo, security audit | Alto (contexto) |
| `opencode-go/deepseek-v4-flash` | Build fixes, exploración, refactors mecánicos, docs          | Bajo (contexto) |

## Categorías de tareas

| Complejidad        | Tarea típica                                                    | Recomendación                       |
| ------------------ | --------------------------------------------------------------- | ----------------------------------- |
| **Mecánica**       | Fix type errors, format, dead code removal                      | `deepseek-v4-flash`                 |
| **Implementación** | Nuevas rutas API, componentes React, cambios en schema          | `deepseek-v4-pro`                   |
| **Arquitectura**   | Decisiones de diseño, pipeline AI, seguridad, refactors grandes | `deepseek-v4-pro`                   |
| **Extracción AI**  | Procesar PDFs de facturas con Gemini                            | `gemini-2.5-flash-preview` (LOCKED) |

## Output

```
Task: <descripción>
Complexity: <mecánica|implementación|arquitectura|extracción>
Recommendation: <modelo>
Budget tier: <low|med|high>
Rationale: <1 frase de por qué>
Fallback: <modelo alternativo si el principal no está disponible>
```
