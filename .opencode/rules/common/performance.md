# Performance — Common Rules

## General

- Measure before optimizing. Don't guess about performance bottlenecks.
- Prefer simplicity first. Optimize only when there is a measured problem.
- Every optimization should be verified with before/after measurements.

## Database Performance (libSQL / Turso)

- Use indexes on columns used in WHERE, JOIN, and ORDER BY clauses.
- Use `EXPLAIN QUERY PLAN` to verify index usage for complex queries.
- Batch database operations where possible — avoid N+1 query patterns.
- Keep transactions short. Long transactions block writers.
- Use WAL mode for better concurrent read performance (already default in libSQL).

## Backend Performance (Hono)

- Avoid blocking the event loop with synchronous operations.
- Use streaming for large responses where appropriate.
- Cache frequently-accessed data that changes infrequently.
- Set appropriate timeout values for external API calls (Gemini, Turso remote).

## Frontend Performance (React + Vite)

- Use code splitting for routes: `React.lazy()` + `Suspense`.
- Avoid unnecessary re-renders: use `React.memo`, `useMemo`, `useCallback` judiciously.
- Images should be optimized and properly sized.
- Monitor bundle size: `npx vite build --mode production` and check output.
- Use the React DevTools Profiler to identify rendering bottlenecks.

## AI / LLM Performance

- Cache AI extraction results where possible to avoid redundant Gemini calls.
- Use the smallest effective model for the task (not always the largest/most expensive).
- Batch AI requests when processing multiple documents.
- Implement retry logic with exponential backoff for API rate limits.
