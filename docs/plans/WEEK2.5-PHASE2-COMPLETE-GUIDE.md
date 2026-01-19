---
status: ACTIVE
last_updated: 2026-01-19
---

# Phase 2 Complete Guide - React Hook Error Resolution

## Documentation Index

### Quick Start (Choose One)

**For immediate action** (30 seconds):
- [.claude/prompts/week2.5-phase2-quickstart.md](../../.claude/prompts/week2.5-phase2-quickstart.md)
  - TL;DR with Codex command ready to copy-paste
  - Checklist format
  - Expected outcomes

**For Codex-assisted workflow** (recommended):
- [WEEK2.5-PHASE2-AGENT-STRATEGY.md](WEEK2.5-PHASE2-AGENT-STRATEGY.md)
  - Complete Codex workflow with commands
  - Decision tree for when to use which agent
  - Parallel execution examples
  - Fallback strategies

**For full investigation context**:
- [WEEK2.5-PHASE2-JSDOM-RTL-KICKOFF.md](WEEK2.5-PHASE2-JSDOM-RTL-KICKOFF.md)
  - Complete problem analysis
  - All hypotheses with evidence
  - Manual fix examples
  - Diagnostic commands
  - React 18 breaking changes reference

**For session handoff**:
- [HANDOFF-SUMMARY.md](HANDOFF-SUMMARY.md)
  - What was completed in Phase 1
  - Current git state
  - Files modified
  - Next steps

## Problem Summary

**Issue**: 517 React hook errors in client tests
**Root Cause**: jsdom/RTL environment configuration (NOT dependency conflict)
**Proof**: React deduplicated to 18.3.1, server tests work, hook errors persist
**Impact**: 34 client test files failing, 1478 tests passing but unusable

## Recommended Execution Path

### Path A: Codex-First (Fastest - 25 min)

```bash
# Step 1: Analyze (5 min)
codex-wrapper - <<'EOF'
Analyze React Testing Library setup for React 18.3.1 compatibility:

@tests/setup/jsdom-setup.ts
@tests/setup/test-infrastructure.ts
@vitest.config.ts (lines 78-127)

Questions:
1. Is cleanup() from @testing-library/react properly configured?
2. Are there any globals or mocks that could interfere with React hooks?
3. Does jsdom environment configuration support React 18 concurrent features?
4. Compare setup against React Testing Library v13+ best practices

Find: Missing afterEach(cleanup), improper mocking, jsdom config issues
Provide: Specific fix with code examples
EOF

# Step 2: Apply fix + validate single test (10 min)
codex-wrapper - <<'EOF'
Apply recommended fix from previous analysis and validate:

1. Implement fix in appropriate file(s)
2. Run single test: npm exec -- vitest run tests/unit/capital-allocation-step.test.tsx --reporter=verbose --no-coverage
3. Check for hook errors in output
4. Report: success/failure with details
EOF

# Step 3: Full validation (10 min)
codex-wrapper - <<'EOF'
Run full client test suite and analyze:

1. Execute: npm test -- --project=client --reporter=verbose
2. Count hook errors (baseline: 517)
3. Generate summary:
   - Hook errors: before/after
   - Test files: failed/passed
   - Any new failures
   - Next steps if issues remain
EOF
```

**Total Time**: ~25 minutes
**Success Rate**: High (Codex handles context + validation)

### Path B: Direct Investigation (Manual - 30 min)

```bash
# Step 1: Read files (5 min)
cat tests/setup/jsdom-setup.ts
cat tests/setup/test-infrastructure.ts
npm ls @testing-library/react --depth=0

# Step 2: Identify issue (10 min)
# Check for missing cleanup, wrong RTL version, jsdom config

# Step 3: Apply fix (5 min)
# Edit tests/setup/jsdom-setup.ts manually

# Step 4: Validate (10 min)
npm exec -- vitest run tests/unit/capital-allocation-step.test.tsx
npm test -- --project=client
```

**Total Time**: ~30 minutes
**Success Rate**: Medium (requires manual diagnosis)

### Path C: Agent-Heavy (If Stuck - 45 min)

Use error-debugging agent if Codex doesn't resolve in 2 attempts.

See [WEEK2.5-PHASE2-AGENT-STRATEGY.md](WEEK2.5-PHASE2-AGENT-STRATEGY.md) for details.

## Most Likely Fix (80% Probability)

Based on Phase 1 analysis, this is probably the issue:

**File**: `tests/setup/jsdom-setup.ts`
**Problem**: Missing RTL cleanup between tests

**Fix**:
```typescript
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Cleanup React Testing Library after each test
// Required for React 18 to prevent hook state pollution
afterEach(() => {
  cleanup();
});
```

**Why this fixes it**:
- React 18 hooks state persists between tests without cleanup
- Causes "Cannot read properties of null (reading 'useId')" error
- RTL cleanup() resets React internal state properly

## Validation Checklist

After applying fix:

- [ ] Single test passes: `capital-allocation-step.test.tsx`
- [ ] No hook errors in output
- [ ] Full client suite runs: `npm test -- --project=client`
- [ ] Hook error count: 517 → 0
- [ ] Test files passing: 0 → 60+
- [ ] Server tests still pass (no regression)
- [ ] Build still clean: `npm run build`
- [ ] TypeScript still 0 errors: `npm run check`

## Success Metrics

**Primary Goal**: Hook errors eliminated
- Before: 517 errors
- After: 0 errors

**Secondary Goals**: Tests passing
- Before: 34 failed / 59 passed
- After: 0-5 failed / 91-96 passed (only legitimate failures)

**Time Goal**: Complete in single session (25-50 min)

## Post-Fix Actions

1. **Document results**: Create `docs/plans/PHASE2-JSDOM-RTL-RESULTS.md`
2. **Review changes**: Use code-reviewer agent
3. **Commit**: Combine Phase 1 + Phase 2 in single commit
4. **Update docs**: Add React 18 testing guidelines to CLAUDE.md

## Git Workflow

After completing Phase 2:

```bash
# Review all changes
git status
git diff

# Commit Phase 1 + Phase 2 together
git add vitest.config.int.ts vitest.config.ts package.json package-lock.json
git add tests/setup/jsdom-setup.ts  # or wherever fix was applied
git add docs/plans/

git commit -m "feat(foundation): Week 2.5 hardening - TypeScript, React, tests

Phase 1 (Foundation):
- Eliminate TypeScript errors (387 -> 0)
- Deduplicate React to 18.3.1 (remove mermaid-cli)
- Segregate integration tests (26 files)

Phase 2 (Test Environment):
- Fix jsdom/RTL setup for React 18
- Add cleanup() to prevent hook state pollution
- Restore client test suite (517 errors -> 0)

Test Results:
- Before: 34 failed / 59 passed
- After: 0-5 failed / 91-96 passed
- TypeScript: 0 errors
- Build: Clean

Co-authored-by: Claude <noreply@anthropic.com>"
```

## Reference Materials

### React 18 Resources
- [React 18 Upgrade Guide](https://react.dev/blog/2022/03/08/react-18-upgrade-guide)
- [RTL React 18 Support](https://testing-library.com/docs/react-testing-library/api#cleanup)
- [Vitest jsdom Environment](https://vitest.dev/guide/environment.html#jsdom)

### Phase 1 Context
- [WEEK2.5-FOUNDATION-HARDENING-RESULTS.md](WEEK2.5-FOUNDATION-HARDENING-RESULTS.md)
- Git commit: 217a11d9

### Artifacts
- `artifacts/post-hardening-test-results.log` - Full hook error output
- `artifacts/gate0-metadata.json` - Baseline metrics
- `artifacts/phase1d-react-verify.log` - React deduplication proof

## Troubleshooting

### If fix doesn't work on first attempt:

**Scenario 1**: Hook errors reduced but not eliminated
- Check RTL version: Must be >= 13.0.0 for React 18
- Run: `npm install @testing-library/react@latest --save-dev`

**Scenario 2**: New errors appear
- Verify no conflicts with existing test infrastructure
- Check setup file order in vitest.config.ts
- Ensure cleanup doesn't interfere with global mocks

**Scenario 3**: Codex suggests wrong fix
- Fall back to error-debugging agent
- Or manual investigation with diagnostics from kickoff doc

### Getting Help

If stuck after 2 attempts:
1. Review [WEEK2.5-PHASE2-AGENT-STRATEGY.md](WEEK2.5-PHASE2-AGENT-STRATEGY.md) for alternative approaches
2. Use error-debugging:debugger agent with full context
3. Check Phase 1 artifacts for additional clues

## Copy-Paste Commands

### Quick Start (Codex)
```bash
codex-wrapper - <<'EOF'
Analyze React Testing Library setup for React 18.3.1 compatibility in @tests/setup/jsdom-setup.ts and provide fix with code examples
EOF
```

### Quick Validation
```bash
npm exec -- vitest run tests/unit/capital-allocation-step.test.tsx --reporter=verbose --no-coverage
```

### Full Test Suite
```bash
npm test -- --project=client --reporter=verbose 2>&1 | tee artifacts/phase2-test-results.log
```

### Check Hook Errors
```bash
grep -c "Invalid hook call" artifacts/phase2-test-results.log
```

---

**Status**: Ready for Phase 2 execution
**Priority**: HIGH (blocking client test development)
**Estimated Time**: 25-50 minutes
**Recommended Start**: Codex-first workflow (Path A)
