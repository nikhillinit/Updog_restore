---
status: ACTIVE
last_updated: 2026-01-19
---

# Self-Review Checklist

Run this checklist on every documentation file before considering it complete.

## 5 Core Questions

### 1. Understanding

> Can a junior engineer understand this without asking questions?

- [ ] Technical jargon is explained or linked to definitions
- [ ] Assumptions are stated explicitly
- [ ] Examples progress from simple → complex
- [ ] Code snippets include context (imports, setup)

### 2. "Why" Clarity

> Are architectural decisions explained with rationale?

- [ ] Design Rationale section exists with Why-Questions answers
- [ ] Alternatives considered are documented (2-3 options)
- [ ] Trade-offs are clear (pros/cons for each approach)
- [ ] "When to revisit" condition is specified

### 3. Example Verification

> Do examples actually work when copy-pasted?

- [ ] Commands are runnable without modification
- [ ] File paths are correct relative to project root
- [ ] Expected output matches actual behavior
- [ ] Edge cases are demonstrated (not just happy path)

### 4. Failure Modes

> Are common mistakes and errors discussed?

- [ ] "Gotchas" section lists common pitfalls
- [ ] Error messages are explained with fixes
- [ ] Anti-patterns are explicitly called out
- [ ] Troubleshooting steps are actionable

### 5. Cache Expectations

> Are performance characteristics documented?

- [ ] Cache strategy is explained (staleTime, gcTime)
- [ ] Performance targets are stated (p95, p99)
- [ ] When to invalidate cache is clear
- [ ] Memory implications are noted

## Pass Criteria

**Minimum to pass self-review:** 4/5 questions answered "yes"

If ≥3 questions are "no", the documentation needs another iteration.

## Agent Self-Validation

After completing a documentation module, create a `VALIDATION-NOTES.md` file:

```markdown
# Validation Notes: [Module Name]

**Self-Assessment Score:** X/5 (from checklist above)

**Strengths:**

- [List 2-3 things done well]

**Gaps:**

- [List 2-3 areas needing improvement]

**Code Reference Accuracy:**

- [List any file:line references that couldn't be verified]

**Recommendations:**

- [Actions to improve quality]
```

## Quality Evolution

- **80% quality = Good enough** for solo dev internal docs
- **90% quality = Target** for Phase 3 deliverables
- **95-99% quality = Phase 2 standard** for algorithmic correctness (not
  required for architecture docs)

## When to Escalate

If self-review reveals:

- Missing critical information (API contracts, data flows)
- Contradictions between docs and code
- Examples that don't work after copy-paste

→ Add to backlog, don't block delivery. Fix in quarterly maintenance (Week 49).
