# Security — Common Rules

## Secrets & Credentials

- Never hardcode secrets, API keys, or credentials in source code.
- All secrets go through environment variables (`.env` file, never committed).
- Use `dotenv` only in development; production uses actual env vars.
- The `.env.example` must document all required variables without containing real values.

## Authentication & Authorization

- Every API route that accesses protected data must include `requireAuth` middleware.
- Role-based routes must additionally use `requireRole` middleware.
- Session tokens must be transmitted via `X-Session-Id` header (not cookies for API calls).
- Passwords must be hashed with a strong algorithm (scrypt, bcrypt, or argon2). Never store plaintext.

## Input Validation

- Validate all user input on the server side, never trust client-side validation alone.
- Sanitize inputs used in database queries (use parameterized queries — libSQL supports this).
- Sanitize inputs rendered in HTML to prevent XSS (React handles this by default, but be careful with `dangerouslySetInnerHTML`).

## SQL Injection Prevention

- Always use parameterized queries with libSQL. Never concatenate user input into SQL strings.
- Migration files must not contain hardcoded credentials or secrets.

## API Security

- Rate limiting should be considered for AI extraction endpoints (Gemini API calls are costly).
- API responses must not leak internal error details in production.
- CORS configuration must be explicit — never use `*` in production.

## Dependencies

- Regularly audit dependencies: `npm audit`.
- Keep dependencies updated, especially security patches.
- Minimize dependency count — each dependency is a supply chain risk.

## AI-Specific Security

- The Gemini API key must never be exposed to the client-side code.
- AI extraction prompts must be reviewed for injection risks.
- AI-extracted data must be validated before storage — never trust raw AI output.
