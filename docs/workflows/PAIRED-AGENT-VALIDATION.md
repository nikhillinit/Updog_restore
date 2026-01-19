---
status: ACTIVE
last_updated: 2026-01-19
---

# Paired-Agent Validation Workflow

**Created:** 2025-11-09 **Status:** Active **Purpose:** Ensure quality through
real-time independent agent review

---

## Overview

This workflow pairs a **primary agent** (executor) with a **validation agent**
(reviewer) to catch errors before they reach production. The validation agent
independently verifies that changes align with best practices and project
requirements.

---

## When to Use

Apply paired-agent validation for:

- ✅ **Deletions** - Removing code, documentation, or configuration
- ✅ **Structural changes** - Moving files, reorganizing directories
- ✅ **Bulk modifications** - Updating multiple files simultaneously
- ✅ **Configuration changes** - Modifying build systems, CI/CD, dependencies
- ✅ **Documentation references** - Updating cross-file links and dependencies

**Do NOT use for:**

- ❌ Trivial changes (typo fixes, formatting)
- ❌ Isolated feature additions with tests
- ❌ Changes already covered by automated tests

---

## Workflow Pattern

### Phase 1: Plan & Execute (Primary Agent)

```
Primary Agent:
1. Analyze requirements
2. Research codebase context
3. Execute changes (code, docs, config)
4. Report completion
```

### Phase 2: Independent Validation (Validator Agent)

```
Validator Agent:
1. Review PRIMARY AGENT'S changes (not requirements)
2. Verify alignment with best practices
3. Check for:
   - Information loss
   - Broken references
   - Inconsistent state
   - Missing dependencies
4. Provide verdict: APPROVE / CONCERNS / REJECT
```

### Phase 3: Resolution

```
If APPROVED:
  → Commit changes

If CONCERNS:
  → Address issues
  → Re-validate

If REJECTED:
  → Revert changes
  → Revise approach
```

---

## Example: Documentation Cleanup (Session 1)

### Primary Agent Task

```
Agent 1: Delete duplicate ADR-011 (lines 3226-3535)
Agent 2: Update CLAUDE.md references
```

### Validator Agent Review

```
Task: Independently verify deletions and modifications

Findings:
✅ ADR-011 deletion: Correct (verified duplicate)
✅ Table of Contents: Appropriate placement
❌ CLAUDE.md: References non-existent /prompts directory
⚠️ ESLint strategy: Creates documentation debt in ADR-011

Verdict: PROCEED WITH REVISIONS
- MUST FIX: /prompts reference (blocker)
- SHOULD ADD: ADR-011 implementation note
```

### Resolution

```
Action: Create /prompts directory first
Then: Amend commit to resolve blocker
```

---

## Implementation

### Parallel Launch Pattern

```typescript
// Launch primary agents
const agent1 = launchAgent('code-simplifier', taskA);
const agent2 = launchAgent('code-simplifier', taskB);

// Wait for completion
await Promise.all([agent1, agent2]);

// Launch validator AFTER primary agents complete
const validator = launchAgent('code-reviewer', {
  task: 'Validate changes made by agent1 and agent2',
  focus: 'deletions, references, consistency',
});

// Review validation results
const verdict = await validator.result;

if (verdict.blocker) {
  // Fix issues before commit
}
```

### Commit Flow

```bash
# Primary agents complete
git add <files>

# Validator runs
validator-agent --review staged

# If approved
git commit -m "..."

# If blocker found
git reset
# Fix issues
# Re-run validator
```

---

## Validation Checklist

Validator agent MUST verify:

### For Deletions

- [ ] Deleted content was truly duplicate/obsolete
- [ ] No unique information lost
- [ ] No broken cross-references created
- [ ] Deletion reasoning is sound

### For Modifications

- [ ] References point to existing files/sections
- [ ] Cross-file consistency maintained
- [ ] No circular dependencies introduced
- [ ] Documentation matches implementation state

### For Documentation

- [ ] Links are valid
- [ ] Examples reference real code
- [ ] Timestamps are current
- [ ] TOC matches structure

---

## Lessons Learned (Nov 9, 2025)

### Issue 1: Forward References

**Problem:** CLAUDE.md referenced `/prompts` directory before Session 3 created
it **Root Cause:** Commits occurred out of logical order **Fix:** Create
dependencies before referencing them OR use forward-looking language
**Prevention:** Validator checks for file existence before approving
documentation changes

### Issue 2: Documentation Debt

**Problem:** ESLint strategy changed in checklist but not in ADR-011 **Root
Cause:** Primary agents focused on assigned files only **Fix:** Cross-reference
validation across related documents **Prevention:** Validator checks for
consistency across DECISIONS.md, CLAUDE.md, and implementation plans

---

## Agent Roles

### Primary Agent (code-simplifier, code-explorer, etc.)

- **Focus:** Execute the specific task efficiently
- **Scope:** Assigned files only
- **Validation:** Basic (syntax, format)
- **Model:** Usually `haiku` for speed

### Validator Agent (code-reviewer)

- **Focus:** Independent verification of primary agent's work
- **Scope:** All changes + cross-file impacts
- **Validation:** Comprehensive (logic, consistency, references)
- **Model:** Usually `sonnet` for thoroughness

---

## Success Metrics

Track effectiveness:

- **Issues caught:** Count of blockers/concerns identified
- **False positives:** Invalid rejections
- **Missed issues:** Problems found after commit
- **Time overhead:** Validation time vs value

**Target:** 95% issue detection, <5% false positive rate

---

## Future Enhancements

1. **Automated Validation Triggers**
   - Git pre-commit hook launches validator
   - CI/CD pipeline includes validation step

2. **Validation Templates**
   - Checklist per change type (deletion, refactor, config)
   - Domain-specific validators (API, database, UI)

3. **Learning System**
   - Track validation patterns
   - Update checklists based on missed issues

---

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md) - Project conventions
- [DECISIONS.md](../../DECISIONS.md) - Architectural decisions
- [CHANGELOG.md](../../CHANGELOG.md) - Change history
- [cheatsheets/coding-pairs-playbook.md](../../cheatsheets/coding-pairs-playbook.md) -
  Interactive pairing patterns

---

**Maintained by:** Solo Developer **Review Cycle:** After each significant use
**Last Updated:** 2025-11-09
