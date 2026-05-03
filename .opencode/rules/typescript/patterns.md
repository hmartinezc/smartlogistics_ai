# Patterns — TypeScript

> This file extends common rules with TypeScript-specific design patterns for this project.

## Architecture Patterns

### Backend (Hono)

- **Route → Service → Database** layering: routes handle HTTP, services hold business logic, database layer handles queries.
- Use Hono's `c.get()` / `c.set()` for request-scoped context, not global state.
- Prefer functional composition over class-based services unless state management is needed.

### AI Extraction Pipeline

- The extraction flow follows: `File Upload → Agent Selection → Prompt Construction → Gemini API → Response Validation → Storage`.
- Agent prompts are assembled by `buildExtractionPrompt()` using composable knowledge base sections.
- Each agent type (`AGENT_TCBV`, `AGENT_GENERIC_A`, etc.) adds its specific sections on top of the base prompt.

### Frontend (React)

- State management: `App.tsx` owns the main workflow state, shared via `hooks/index.ts`.
- API calls go through `services/apiClient.ts` only — never call `fetch` directly in components.
- Session management: `localStorage` stores session ID, sent via `X-Session-Id` header on every request.

## Error Handling Patterns

- API errors: return structured JSON `{ error: string, code?: number }` — never raw stack traces.
- AI extraction errors: classify as network, parsing, validation, or rate-limit errors. Each has a specific user message.
- Frontend errors: show user-friendly messages via Toast/notification component, log details to console in dev.

## Data Flow Patterns

- Invoice data flows through `shared/extractionSchema.ts` for validation — single source of truth for data shape.
- Changes to AI prompts must be reflected in: `server/routes/ai.ts`, `services/agentPrompts.ts`, and `shared/extractionSchema.ts` together.
- Database schema changes in `server/schema.ts` must be documented in `docs/DatabaseSchema.md`.

## Anti-Patterns to Avoid

- Direct `fetch` or `XMLHttpRequest` in components (use `apiClient.ts`).
- Raw SQL string concatenation (use parameterized queries with libSQL).
- Storing sensitive data in `localStorage` beyond session ID and preferences.
- Giant files (>500 lines) — split by concern.
- Deeply nested callbacks — use `async/await`.
