# Testing — Common Rules

## What to Test

- Every new feature must include tests before merging.
- Test the behavior, not the implementation. Tests should survive refactors.
- Focus tests on: happy path, edge cases, error states, and boundary values.
- Business-critical logic (like invoice extraction math) must have 100% coverage of calculation paths.

## Test Structure

- Use `describe` / `it` blocks with clear, human-readable names.
- Each `it` block should test exactly one behavior.
- Follow AAA pattern: Arrange, Act, Assert.
- Use factories or fixtures for test data — never hardcode production-like data inline.

## Test Types by Priority

1. **Unit tests** — for all utility functions, data transformations, and business logic.
2. **Integration tests** — for API routes, database operations, and middleware chains.
3. **E2E tests** — for critical user flows (invoice upload, AI extraction, review workflow).

## Coverage Targets

- New code: minimum 80% line coverage for business logic modules.
- Critical paths (auth, data extraction, billing calculations): 100% coverage.
- UI components: focus on behavior tests, not snapshot tests.

## What NOT to Test

- Third-party library internals (test your integration, not the library).
- Trivial getters/setters with no logic.
- Configuration objects and constants.
- Framework boilerplate (route registration, component mounting).

## Running Tests

- Tests must pass before committing.
- Tests must be runnable with a single command: `npm test`.
- CI (when configured) must run the full test suite on every PR.
