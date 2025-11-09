# Phase 3 Kickoff Checklist

**Purpose:** Pre-flight verification before starting Phase 3 Portfolio Route
implementation **Last Updated:** 2025-11-08 **Estimated Time:** 15 minutes

---

## Pre-Start Validation Steps

### ✓ 1. Read Foundation Documents (Required)

- [ ] Read
      [DECISIONS.md#ADR-011](DECISIONS.md#adr-011-anti-pattern-prevention-strategy) -
      Anti-pattern prevention strategy
- [ ] Read
      [cheatsheets/anti-pattern-prevention.md](cheatsheets/anti-pattern-prevention.md) -
      24 anti-patterns quick reference
- [ ] Scan
      [CLAUDE.md#quality-first-development](CLAUDE.md#quality-first-development) -
      Workflow guidance
- [ ] Check [CAPABILITIES.md](CAPABILITIES.md) - Available agents, skills, tools
      (28+ capabilities)

**Time:** 10 minutes | **Why:** Understand the "why" before the "how"

---

## Environment Setup Checklist

### ✓ 2. Verify Dependencies

```bash
# Install dependencies
npm install

# Check health
npm run doctor        # Full health check
npm run doctor:quick  # Fast sidecar check
```

- [ ] `npm install` completes without errors
- [ ] `npm run doctor` passes all checks
- [ ] Sidecar packages linked correctly

**Time:** 2 minutes | **Why:** Prevent mid-session environment issues

---

### ✓ 3. Baseline Tests Passing

```bash
# Run full test suite
npm test

# Check lint status
npm run lint
```

- [ ] `npm test` passes (all tests green)
- [ ] `npm run lint` reports zero violations
- [ ] No TypeScript errors (`npm run check`)

**Time:** 2 minutes | **Why:** Clean baseline prevents false positives

---

## Quality Gate Validation

### ✓ 4. Verify Quality Tooling Active

```bash
# Check ESLint config
ls eslint.config.js

# Check pre-commit hooks
ls .husky/pre-commit .husky/pre-push

# Check CI workflows
ls .github/workflows/code-quality.yml
```

- [ ] ESLint config exists (`eslint.config.js`)
- [ ] Pre-commit hooks active (`.husky/pre-commit`, `.husky/pre-push`)
- [ ] CI/CD workflows present (`.github/workflows/`)

**Time:** 1 minute | **Why:** 4-layer quality gates must be operational

---

## Knowledge Verification

### ✓ 5. Anti-Pattern Familiarity

**Answer these questions (1 minute each):**

1. **Why does this rebuild exist?**
   - Expected answer: To avoid 24 anti-patterns found in existing codebase

2. **Name the 4 quality gate layers:**
   - Expected answer: (1) ESLint, (2) Pre-commit, (3) IDE snippets, (4) CI/CD

3. **List 3 anti-patterns from each category:**
   - Cursor Pagination: No validation, state leak, inconsistent sort
   - Idempotency: No tracking, short TTL, different responses
   - Optimistic Locking: No version column, mismatch not detected, blind retries
   - BullMQ Queue: No deadletter, no timeout, no priority

4. **What is the TDD workflow?**
   - Expected answer: Write failing test → Implement → Verify pass

**Time:** 4 minutes | **Why:** Can't prevent what you don't recognize

---

## Git Status Check

### ✓ 6. Clean Working Directory

```bash
git status
git log --oneline -5
```

- [ ] Working directory clean (no uncommitted changes)
- [ ] On correct branch (`feat/portfolio-lot-moic-schema` or create new)
- [ ] Latest commits understood

**Time:** 1 minute | **Why:** Avoid mixing work-in-progress with new
implementation

---

## First Task Guidance

### ✓ 7. Ready to Start Phase 3.1

**Phase 3.1: Setup Quality Gates (3-4 hours)**

**Tasks:**

1. Implement ESLint custom rules (6h)
   - `povc/require-cursor-validation`
   - `povc/require-idempotency-key`
   - `povc/require-optimistic-locking`
   - `povc/require-queue-timeout`

2. Update pre-commit hooks (2h)
   - Add anti-pattern checks to `.husky/pre-commit`
   - Configure smart test selection in `.husky/pre-push`

3. Create IDE snippets (1h)
   - `.vscode/updog.code-snippets` with 5 safe patterns

4. Configure CI/CD workflow (3h)
   - `anti-pattern-detection.yml` workflow
   - Integrate with existing PR checks

**Workflow:**

```bash
# 1. Start with brainstorming
/superpowers:brainstorm  # Refine approach for ESLint rules

# 2. Create implementation plan
/superpowers:write-plan  # Break into 2-5 min tasks

# 3. Execute with TDD
# - test-driven-development skill auto-activates
# - Write failing test for each rule
# - Implement rule
# - Verify with test suite

# 4. Validate before completion
/deploy-check            # Verify build + tests pass
/log-change             # Document in CHANGELOG.md
```

**Estimated Time:** 12 hours execution | 3-4 hours wall time (with parallel
agents)

---

## Success Criteria

**You're ready to start when:**

- ✅ All 7 checklist sections completed
- ✅ Foundation documents read and understood
- ✅ Environment healthy (tests pass, lint clean)
- ✅ Quality gates verified active
- ✅ Can explain why this rebuild exists
- ✅ Can name 4 quality gate layers
- ✅ Git working directory clean

**Next Steps:**

```bash
# Start Phase 3.1
/superpowers:brainstorm  # Begin with design refinement
```

---

## Troubleshooting

### Issue: Tests Failing

**Fix:**

```bash
git stash  # Stash any work-in-progress
npm test   # Re-run baseline
git stash pop  # Restore changes
```

### Issue: Lint Violations

**Fix:**

```bash
npm run lint:fix  # Auto-fix 80% of violations
npm run lint      # Check remaining
```

### Issue: Missing Dependencies

**Fix:**

```bash
rm -rf node_modules package-lock.json
npm install
npm run doctor
```

---

## Related Documentation

- **[DECISIONS.md#ADR-011](DECISIONS.md#adr-011-anti-pattern-prevention-strategy)** -
  Why anti-pattern prevention
- **[cheatsheets/anti-pattern-prevention.md](cheatsheets/anti-pattern-prevention.md)** -
  24 patterns with examples
- **[CLAUDE.md#quality-first-development](CLAUDE.md#quality-first-development)** -
  Coding workflow
- **[CAPABILITIES.md](CAPABILITIES.md)** - 28+ capabilities (agents, skills,
  tools)

**Estimated Total Time:** 15 minutes (if all checks pass)

**Ready?** → Run `/superpowers:brainstorm` to begin Phase 3.1! 🚀
