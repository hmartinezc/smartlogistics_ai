# Coding Style — Common Rules

> These are universal principles that apply to all languages in this project.
> Language-specific rules in `typescript/coding-style.md` override where idiomatic differences exist.

## General Principles

- Prefer readability over cleverness. Code is read far more often than it is written.
- Functions should do one thing and have a clear name that describes that thing.
- Avoid deep nesting (max 3-4 levels). Extract nested logic into named functions.
- Keep files focused: one primary concern per file. If a file exceeds 400 lines, consider splitting.
- No commented-out code. Delete it — git history preserves the past.
- No `TODO` or `FIXME` comments without a tracking issue reference.

## Naming Conventions

- Use descriptive, pronounceable names. No single-letter variables except in trivial loops.
- Boolean variables should start with `is`, `has`, `should`, or `can`.
- Event handlers should start with `handle` or `on` (e.g., `handleClick`, `onSubmit`).
- Constants use UPPER_SNAKE_CASE for primitive values, camelCase for object/array constants.

## Error Handling

- Never silently swallow errors. Every `catch` block must either handle, rethrow, or explicitly log.
- Use custom error classes with descriptive messages, not raw `Error('something failed')`.
- Always `await` promises or explicitly handle them with `.catch()`.
- No `catch (e) {}` — empty catch blocks are forbidden.

## Imports & Dependencies

- Group imports: external libraries first, then internal modules, then relative imports.
- Prefer named exports over default exports for better IDE support and refactoring safety.
- Never import side-effect-only modules at the top of a file without a clear comment.

## Comments

- Comments explain _why_, not _what_. The code should explain _what_.
- Update or remove comments when the code changes. Stale comments are worse than no comments.
- Use JSDoc for public API functions (exported functions that other modules consume).

## Language Note

> This rule may be overridden by language-specific rules for languages where these patterns are not idiomatic.
