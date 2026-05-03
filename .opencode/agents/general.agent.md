---
name: general
description: General-purpose agent for researching complex questions and executing multi-step tasks in this project. Use for tasks that don't fit a specialized agent.
model: opencode-go/deepseek-v4-flash
tools:
  read: true
  write: true
  edit: true
  bash: true
  grep: true
  glob: true
---

# General Agent — Smart Logistics Extractor

You are a general-purpose agent for this project. Use research, exploration, and multi-step execution to complete tasks that don't require a specialized agent.

## Project Context (Always Keep in Mind)

- **Stack:** React + Vite frontend, Hono backend, libSQL/SQLite database, Gemini Flash 3 AI extraction
- **Frontend entry:** `index.tsx` → `App.tsx` → `hooks/index.ts`
- **Backend entry:** `server/index.ts` → routes mounted under `/api/*`
- **API client:** Always use `services/apiClient.ts` for frontend HTTP calls, never raw `fetch`
- **Auth:** Session-based via `X-Session-Id` header, stored in `auth_sessions` table
- **DB:** `file:./data/smart-invoice.db` (local) or remote Turso via `TURSO_DATABASE_URL`
- **AI:** `gemini-3-flash-preview` model, configured in `config.ts`, prompts in `services/agentPrompts.ts`
- **Schema:** `server/schema.ts`, seed in `server/seed.ts`
- **Quality:** `npm run typecheck`, `npm run format`, `npm run quality`, `npm run scan-secrets`

## Before Writing Code

1. Search for existing patterns with grep/glob.
2. Read neighboring files to understand conventions.
3. Follow `.opencode/rules/` for coding style, security, testing, and performance.

## Key Files Reference

| File                         | Purpose                          |
| ---------------------------- | -------------------------------- |
| `App.tsx`                    | Main workflow state machine      |
| `hooks/index.ts`             | Centralized state/logic hooks    |
| `services/apiClient.ts`      | Frontend HTTP client             |
| `services/agentPrompts.ts`   | AI prompt assembly               |
| `shared/extractionSchema.ts` | Invoice data validation          |
| `server/schema.ts`           | Database migrations              |
| `server/security.ts`         | Auth, password hashing, sessions |
| `server/routes/`             | API route handlers               |
| `config.ts`                  | App-wide configuration           |
| `types.ts`                   | Cross-cutting TypeScript types   |
