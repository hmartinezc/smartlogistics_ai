---
name: continuous-learning
description: Extract reusable patterns from coding sessions to improve future AI agent behavior. Use at the end of sessions or when noticing repeated patterns, common mistakes, or successful workflows worth preserving.
license: MIT
metadata:
  author: smart-logistics
  version: '1.0.0'
---

# Continuous Learning

Capture patterns from coding sessions and turn them into reusable skills, rules, or agent instructions.

## Why This Matters

Every session teaches something. Without capture, those lessons are lost. This skill provides a lightweight system to:

1. **Identify patterns** — What worked well? What failed repeatedly?
2. **Document decisions** — Why was X chosen over Y?
3. **Create reusable skills** — Turn session insights into permanent `.opencode/skills/`
4. **Update rules** — Refine `.opencode/rules/` based on real experience

## When to Use

- At the **end of a significant coding session** (2+ hours or complex feature)
- When you notice a **mistake that repeats** across sessions
- When a **new pattern emerges** that should be standard
- When **architecture decisions** are made that affect future work
- When **agent behavior** needs adjustment based on observed performance

## The Learning Cycle

### Step 1: Observe (During Session)

Note these as they happen:

- **What worked:** Prompts, approaches, or tools that produced good results
- **What failed:** Approaches that wasted time or produced bad output
- **Surprises:** Unexpected behavior from the AI, framework, or database
- **Repetition:** Tasks that had to be done the same way multiple times

### Step 2: Extract (End of Session)

Answer these questions:

1. **Did any new architectural pattern emerge?**
   - If yes → Update `.opencode/rules/typescript/patterns.md`

2. **Did the agent make consistent errors or miss things?**
   - If yes → Update the agent's `.agent.md` file with clarifications

3. **Was there a workflow that should be standardized?**
   - If yes → Create or update a skill in `.opencode/skills/`

4. **Did any decision need justification for future reference?**
   - If yes → Add to `.opencode/session-context.md` under Architecture Decisions

5. **Were there any security or quality issues discovered?**
   - If yes → Update `.opencode/rules/common/security.md`

### Step 3: Document (Create Artifacts)

#### Pattern A: Update Existing Rules

If a rule was violated or unclear:

```markdown
# In .opencode/rules/common/coding-style.md

## Updated: [Date]

> Clarification: When handling AI extraction errors, always classify as one of:
> network, parsing, validation, or rate-limit. Each has a specific user message.
> Do not show raw error details to users in production.
```

#### Pattern B: Create a New Skill

If a reusable workflow was discovered:

```markdown
# .opencode/skills/new-pattern/SKILL.md

---

name: new-pattern
description: [What it does and when to use]

---

# [Skill Name]

[Detailed instructions based on what worked in the session]
```

#### Pattern C: Update Session Context

If decisions or state changed:

```markdown
# In .opencode/session-context.md

## Recent Changes

- [Date]: Added [feature] — [brief description]

## Architecture Decisions

| Decision       | Status | Rationale         |
| -------------- | ------ | ----------------- |
| [New decision] | ACTIVE | [Why it was made] |
```

### Step 4: Verify (Next Session)

In the next session, check if the captured patterns are being followed:

- Does the agent use the updated rules?
- Are new skills being invoked correctly?
- Did the same mistake repeat despite the documentation?

If a pattern didn't stick, refine it — it may be too vague or in the wrong place.

## Template: Session Learning Log

At the end of every significant session, append to `.opencode/session-context.md` or a dedicated `SESSIONS.md`:

```markdown
## Session: [YYYY-MM-DD] — [Feature/Bug Name]

### What Was Done

[1-3 sentences]

### Patterns Discovered

- [Pattern 1] — [Where to apply]
- [Pattern 2] — [Where to apply]

### Decisions Made

- [Decision] — [Rationale]

### Issues Found

- [Issue] — [File:line] — [Fix or workaround]

### Agent Behavior Notes

- [Agent name] — [What worked / what didn't]

### Next Session Should Start With

- [ ] Task 1
- [ ] Task 2
```

## Anti-Patterns (Avoid These)

- **Over-documenting:** Don't capture every detail. Focus on patterns that will repeat.
- **Stale context:** Remove or archive decisions that are no longer active.
- **Vague rules:** "Be careful with X" is useless. "Validate Y before Z" is actionable.
- **Never reviewing:** Learning is useless if you don't read it in the next session.

## Quick Checklist (End of Session)

- [ ] Any new patterns worth capturing?
- [ ] Any rules that need updating?
- [ ] Any agent behavior that should be adjusted?
- [ ] Session context updated with recent changes?
- [ ] Any new skills created from this session?
