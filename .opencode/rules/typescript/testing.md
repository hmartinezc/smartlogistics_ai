# Testing — TypeScript

> This file extends [common/testing.md](../common/testing.md) with TypeScript-specific content.

## Test Runner & Framework

- Use **Vitest** for unit and integration tests (fast, Vite-native, TypeScript-native).
- Use **Playwright** for E2E tests (cross-browser, reliable selectors).
- No Jest — Vitest is the standard for Vite-based projects.

## Test File Conventions

- Test files live next to their source files: `src/foo.ts` → `src/foo.test.ts`.
- Test files for server code: `server/routes/ai.ts` → `server/routes/ai.test.ts`.
- Test utilities go in `tests/utils/` or `tests/fixtures/`.

## TypeScript-Specific Testing Patterns

- Type your test fixtures and mocks properly — avoid `as any` in tests.
- Use `vi.mocked()` for type-safe mocking of modules.
- For API route testing with Hono, test the handler functions directly rather than starting a server.
- For libSQL testing, use an in-memory database or a test-specific SQLite file.

## What This Project Must Test

### Critical (must have tests)

- `services/agentPrompts.ts` — prompt assembly logic
- `server/routes/ai.ts` — AI extraction endpoint
- `server/schema.ts` — migration logic and idempotency
- `services/geminiService.ts` — Gemini API integration (mock the API)
- `shared/extractionSchema.ts` — data validation and transformation
- `services/apiClient.ts` — request construction and error handling

### Important (should have tests)

- Auth middleware (`requireAuth`, `requireRole`)
- Database queries and seed logic
- Math distribution calculations in extraction logic
- Product matching logic

### Nice to have

- React component rendering and interaction tests
- Widget custom element registration
- Dark mode toggle behavior
