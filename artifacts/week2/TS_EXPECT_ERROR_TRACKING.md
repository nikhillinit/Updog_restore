# @ts-expect-error / @ts-ignore Tracking

> **Policy:** Keep this list empty where possible. Every suppression must be documented here with a removal plan.

**Last Updated:** 2025-01-14
**Current Count:** 0

---

## Active Suppressions

| File | Line(s) | Code | Reason | Owner | Remove By | Created |
|------|---------|------|--------|-------|-----------|---------|
| _(none)_ | - | - | - | - | - | - |

---

## Removed Suppressions (History)

| File | Line(s) | Code | Reason | Removed | How Fixed |
|------|---------|------|--------|---------|-----------|
| _(none yet)_ | - | - | - | - | - |

---

## Guidelines

### When to Use
- **NEVER** as a permanent solution
- **ONLY** as a temporary bridge when:
  1. The fix is known but time-constrained
  2. The error is a false positive from tooling
  3. External dependency types are incorrect (pending upstream fix)

### How to Document
When adding a suppression:

```typescript
// @ts-expect-error TODO(Session X): Fix [CODE] - [REASON]
// Tracked in: artifacts/week2/TS_EXPECT_ERROR_TRACKING.md
const problematic = thing;
```

Then immediately add to this file with:
- **File path** (relative to repo root)
- **Line number(s)** (keep updated if code moves)
- **Error code** (e.g., TS2345, TS7006)
- **Reason** (why suppression is needed)
- **Owner** (who's responsible for removing it)
- **Remove By** (target session or date)
- **Created** (when suppression was added)

### Quality Gates

❌ **DO NOT suppress if:**
- You haven't investigated the root cause
- There's a proper fix available now
- It's hiding a real bug
- You're adding more than 3 suppressions in a single session

✅ **DO suppress ONLY if:**
- Documented in this file immediately
- Issue has a removal plan
- Team agrees it's temporary
- Alternative fixes are prohibitively expensive

---

## Review Schedule

**Weekly:** Check this file for suppressions approaching removal deadline
**Session 8+:** Priority to remove oldest suppressions first
**Monthly:** Review all suppressions, escalate any >30 days old

---

## Escalation

If a suppression remains >60 days:
1. Create GitHub issue with full context
2. Schedule dedicated session to resolve
3. Consider if underlying type system assumptions need revision

---

**Maintained By:** TypeScript Remediation Team
**Policy Owner:** Engineering Leadership
**Zero-Suppression Goal:** Q1 2025
