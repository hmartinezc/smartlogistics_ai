# Git Workflow — Common Rules

## Commits

- Commit messages follow conventional commits: `type(scope): description`
- Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`
- Keep commits focused: one logical change per commit.
- Never commit secrets, `.env` files, or credentials.

## Branches

- `main` is always deployable. Never push directly to `main`.
- Feature branches: `feat/short-description` or `fix/short-description`.
- Delete branches after merge.

## Before Committing

1. Run type checks: `npx tsc -p tsconfig.json --noEmit && npx tsc -p server/tsconfig.json --noEmit`
2. Run the quality pre-commit check: `node scripts/quality/pre-commit-check.js`
3. Verify no `console.log` or `debugger` statements remain in staged files.
4. Verify no secrets (`GEMINI_API_KEY`, `TURSO_AUTH_TOKEN`, passwords) are staged.

## Pull Requests

- Description must include: what changed, why, and how to test.
- Link related issues with `Closes #123` or `Refs #123`.
- Keep PRs small: ideally under 400 lines changed. Split large changes into stacked PRs.
- Request review from at least one team member.
- All checks must pass before merging (typecheck, lint, tests).
