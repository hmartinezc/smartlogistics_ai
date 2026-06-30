# Agent Workflow Quality

Use this skill when coordinating agents, updating rules/skills, adding quality gates, or finishing a feature.

## Read First

- `AGENTS.md`
- `.opencode/rules/**` if present
- `.opencode/skills/**/SKILL.md` if present
- `agent-architecture-kit/ARCHITECTURE_BLUEPRINT.md`

## Quality Commands

Run the strongest available subset:

```bash
npm run typecheck
npm run format:check
npm run quality
npm run scan-secrets
npm run build
```

In new projects, prefer a strict `scan-secrets` mode that exits non-zero when secrets are found.

## Review Layers

- TypeScript correctness.
- Auth/authorization.
- SQL safety and migration idempotency.
- Frontend API discipline.
- Deploy/readiness impact.
- Documentation sync.
- Secret leakage.
- Whether `build` covers backend typechecking or CI runs `typecheck` before build.

## Documentation Sync

Update docs when:

- A persisted table or column changes.
- Env vars change.
- Docker/Coolify behavior changes.
- Port/healthcheck changes.
- Public API contract changes.
- IA prompt/schema/output changes.

## Agent Routing

- Architecture decisions: architect/planner.
- Codebase tracing: code-explorer/explore.
- DB changes: database-reviewer.
- TypeScript changes: typescript-reviewer.
- Security-sensitive changes: security-reviewer.
- UI accessibility: a11y-architect.
- Build failures: build-error-resolver.
- Docs: doc-updater.
