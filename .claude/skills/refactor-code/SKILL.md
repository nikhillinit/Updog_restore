---
name: refactor-code
description:
  Safely improve code quality through test-driven refactoring with automatic
  validation and rollback. Use during quality review to reduce technical debt
  while preserving behavior.
last_updated: 2026-04-03
---

# Refactor Code Skill

## Purpose

Safely improve code quality through automated refactoring while maintaining
behavioral correctness. This skill identifies refactoring opportunities from
quality findings and applies them incrementally with continuous test validation.

**Core Capabilities:**

- Test-driven refactoring (run tests after each change)
- Automatic rollback on test failures
- Risk-based prioritization (P0-P3, Low/Medium/High risk)
- Incremental application (one refactoring at a time)
- Full traceability (log all changes with rationale)
- Quality metrics tracking (before/after comparison)

## Prerequisites

- Tests exist and are currently passing
- Code to refactor has been identified

## Workflow

### Step 1: Validate Prerequisites

1. Verify tests exist and are passing: `npm test`
2. Capture baseline metrics (test count, pass rate)
3. Create git checkpoint: `git stash` or ensure clean working tree

**Halt if:**

- No tests exist (can't validate safety)
- Tests are currently failing

### Step 2: Analyze Code for Refactoring Opportunities

Scan implementation files and identify patterns:

- **Extract Method**: Long methods (>50 lines)
- **Extract Variable**: Complex expressions
- **Rename**: Unclear variable/function names
- **Remove Duplication**: Repeated code blocks (2+ occurrences)
- **Simplify Conditionals**: Nested if/else chains
- **Extract Class**: Classes with too many responsibilities
- **Inline**: Unnecessary indirection

**Prioritize refactorings:**

- **P0 (Critical):** Addresses critical/high severity quality issues
- **P1 (High):** Reduces technical debt
- **P2 (Medium):** Improves maintainability
- **P3 (Low):** Nice-to-have improvements

**Estimate risk for each:**

- **Low Risk:** Rename, extract variable, inline
- **Medium Risk:** Extract method, simplify conditionals
- **High Risk:** Extract class, move method, large-scale changes

**Filter by aggressiveness level:**

- **Conservative:** P0 only, low-risk refactorings
- **Moderate:** P0 + P1, low-to-medium risk refactorings
- **Aggressive:** P0 + P1 + P2, all risk levels

### Step 3: Apply Refactorings Incrementally

**For each selected refactoring (in priority order):**

1. Announce what's being refactored (file, type, risk)
2. Apply single refactoring
3. Run tests immediately (`npm test`)
4. Evaluate results:
   - If pass: Log success, keep changes, proceed
   - If fail: Rollback via git, log failure, skip to next
5. Update progress count (applied/skipped/failed)

**Safety rules:**

- Never apply multiple refactorings simultaneously
- Never skip test validation
- Never continue if critical (P0) refactoring fails
- Never modify tests to make them pass
- Always preserve ability to rollback until tests pass

### Step 4: Final Validation and Summary

1. Run full test suite: `npm test`
2. Compare before/after metrics
3. Generate summary of changes

**Halt if:**

- Final test suite fails (regression)
- Coverage drops significantly

## Completion Criteria

- [ ] Prerequisites validated (tests passing)
- [ ] Refactoring opportunities identified and prioritized
- [ ] Selected refactorings applied incrementally
- [ ] All tests passing after refactoring
- [ ] Quality metrics improved or maintained
- [ ] Changes committed separately from features

## Safety Guarantees

- **Behavioral preservation**: No functionality changes
- **Test validation**: After each change
- **Automatic rollback**: On failures
- **Incremental**: One refactoring at a time
- **User control**: Choose scope (conservative/moderate/aggressive)

## When to Use

- Quality review identifies refactoring opportunities
- Technical debt needs systematic reduction
- Code quality metrics below targets
- After a feature is complete and tests pass

## When NOT to Use

- Feature additions (use implementation skills)
- Bug fixes (use bugfix skill)
- Projects without tests (can't validate safety)
- Breaking changes (requires manual review)

## Best Practices

1. **Start Conservative** - First session: use conservative mode
2. **Commit Before Refactoring** - Safety net for rollback
3. **Commit Separately** - Message: `refactor: {description}`
4. **Review Changes** - Always review via git diff

_Based on BMAD Enhanced Quality Suite refactor-code skill_
