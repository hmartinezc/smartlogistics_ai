# Optional AI Agent Upgrade

Use this skill only when the user explicitly asks to add AI, agents, extraction, classification, generation, review, or LLM automation.

## Principle

The base app must work without AI. AI is an addon module, not a foundation dependency.

## Required Boundaries

- API keys live only in backend env vars.
- Frontend never imports model SDKs.
- AI routes live under `/api/ai/*` or a clearly named module.
- Prompts live in one composable location.
- Output schema lives in `shared/`.
- Backend validates and normalizes model output before persistence.

## Pipeline Pattern

```text
Input -> classify/route -> prompt build -> model call -> schema validation
-> deterministic validation -> persistence -> review/audit
```

## Long Running Work

Use persistent jobs:

- Store uploaded file in MinIO.
- Create job row in DB.
- Queue job.
- Worker claims with lock.
- Worker writes result/error.
- UI polls status or refreshes list.

## Observability

Track:

- model
- prompt version/hash
- input/output tokens
- duration
- success/error
- retry count
- estimated cost if available
- source job/user/tenant

## Regression Protection

Before changing prompts or model behavior:

- Create golden examples.
- Capture expected structured output.
- Compare field-by-field.
- Mark acceptable tolerance for numeric fields.
- Keep schema compatibility tests.

## Co-Change Matrix

| If you change   | Also change                          |
| --------------- | ------------------------------------ |
| Prompt          | prompt hash/version, tests, docs     |
| Output fields   | shared schema, UI, persistence, docs |
| Model/SDK       | env vars, timeout, retry, telemetry  |
| Validation      | confidence/review UI and audit       |
| Worker behavior | readiness and deploy docs            |
