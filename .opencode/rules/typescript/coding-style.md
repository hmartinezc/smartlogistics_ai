# Coding Style — TypeScript

> This file extends [common/coding-style.md](../common/coding-style.md) with TypeScript-specific content.

## TypeScript-Specific Conventions

### Types vs Interfaces

- Prefer `interface` for object shapes that may be extended.
- Use `type` for unions, intersections, and mapped types.
- Never use `any`. Use `unknown` when the type is truly unknown, then narrow it.

### Strict Mode

- The server uses strict TypeScript (`tsconfig.json` with `strict: true`). The root config should too.
- Enable `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` where practical.
- New code must pass `tsc --noEmit` for both root and server tsconfigs before commit.

### Async Patterns

- Always type the return of async functions: `async function fetchData(): Promise<DataType>`.
- Use `try/catch` around awaited promises that may reject.
- Prefer `async/await` over raw `.then()` chains.
- Never mix `.then()` and `await` in the same function.

### Module Structure

- One exported component/class/function per file as the primary export.
- Co-locate types with their primary consumer when the type is used by a single module.
- Centralized `types.ts` is acceptable for cross-cutting domain types shared across many modules (e.g. `InvoiceData`, `User`, `Agency`, `BatchItem`). Avoid dumping unrelated utility types here.
- Barrel exports (`index.ts` re-exporting everything) are acceptable for libraries, not application code.

### React-Specific

See `.opencode/skills/react-best-practices/SKILL.md` (internal skill name `vercel-react-best-practices`; this does not mean the project uses Vercel) for detailed React rules. Key highlights:

- Components should be functions, not classes.
- Props should be typed with explicit interfaces.
- No `React.FC` — just type the props directly.
- No `defaultProps` — use default parameter values.

### Hono-Specific

See `.opencode/skills/hono/SKILL.md` for detailed Hono patterns. Key highlights:

- Route handlers should return typed responses.
- Use Hono's built-in validation (zod integration) for request validation.
- Middleware should be composable and focused.

### Server-Specific (server/)

- `server/tsconfig.json` uses strict mode. Run `npx tsc -p server/tsconfig.json --noEmit` after backend changes.
- Database types should match the schema defined in `server/schema.ts`.
- API response types should be consistent across all route modules.
