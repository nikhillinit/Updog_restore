---
status: ACTIVE
last_updated: 2026-01-19
---

# Phase 2: jsdom/RTL React 18 Compatibility - Kickoff

## Executive Summary

**Objective**: Fix 517 React hook errors in client test suite caused by jsdom/React Testing Library environment misconfiguration.

**Context**: Week 2.5 Foundation Hardening (Phase 1) successfully:
- Eliminated 387 TypeScript errors → 0
- Deduplicated React from multiple versions (18.3.1, 19.2.0) → single 18.3.1
- Segregated 26 integration tests properly
- Removed @mermaid-js/mermaid-cli (176 packages)

**Problem**: React hook errors persist despite React deduplication, indicating test environment issue, NOT dependency conflict.

## Current State (Post Phase 1)

### Test Results
```
Test Files: 34 failed | 59 passed | 3 skipped (96 total)
Tests: 334 failed | 1478 passed | 84 skipped (1896 total)
Duration: 194.06s
```

### Hook Error Pattern
```
Warning: Invalid hook call. Hooks can only be called inside of the body of a function component.
Error: Uncaught [TypeError: Cannot read properties of null (reading 'useId')]
```

**Frequency**: 517 occurrences
**Scope**: All React component tests in client project (jsdom environment)
**Server tests**: UNAFFECTED (no hook errors)

### Affected Test Files
All client tests fail with identical hook error pattern:
- `tests/unit/capital-allocation-step.test.tsx` - All tests
- `tests/unit/general-info-step.test.tsx` - All tests
- `tests/unit/modeling-wizard-persistence.test.tsx` - Partial failures
- `tests/unit/waterfall-step.test.tsx` - All tests

### Current Dependency Versions
```json
"react": "18.3.1"
"react-dom": "18.3.1"
"@testing-library/react": "<check package.json>"
"@testing-library/jest-dom": "<check package.json>"
"jsdom": "<check via vitest>"
```

## Investigation Scope

### Primary Suspects

#### 1. jsdom Setup Configuration
**File**: `tests/setup/jsdom-setup.ts`
**Check for**:
- Missing global cleanup between tests
- Incorrect React 18 concurrent features handling
- Missing `@testing-library/react` cleanup
- Improper DOM environment initialization

#### 2. React Testing Library Version
**Check**:
- Version compatibility with React 18.3.1
- Breaking changes between RTL versions
- Required peer dependencies satisfied
- Cleanup utilities properly imported/used

#### 3. Test Setup File Ordering
**File**: `vitest.config.ts` (client project)
```typescript
setupFiles: [
  './tests/setup/test-infrastructure.ts',
  './tests/setup/jsdom-setup.ts'
]
```
**Check**: Order of execution, potential race conditions

#### 4. Vitest Configuration
**File**: `vitest.config.ts`
```typescript
environment: 'jsdom',
environmentOptions: {
  jsdom: {
    pretendToBeVisual: true,
    resources: 'usable',
  },
},
```
**Check**: React 18 compatibility flags, missing options

### Secondary Suspects

#### 5. Global Test Infrastructure
**File**: `tests/setup/test-infrastructure.ts`
**Check**: Mocking that might interfere with React internals

#### 6. Vitest Pool Configuration
```typescript
pool: 'threads',
maxThreads: process.env['CI'] ? 4 : undefined,
minThreads: 1,
```
**Check**: Thread isolation issues with React state

## Diagnostic Commands

### 1. Check Current Versions
```bash
npm ls @testing-library/react @testing-library/jest-dom vitest --depth=0
```

### 2. Inspect Setup Files
```bash
cat tests/setup/jsdom-setup.ts
cat tests/setup/test-infrastructure.ts
cat tests/setup/vitest.setup.ts
```

### 3. Run Single Failing Test
```bash
npm exec -- vitest run tests/unit/capital-allocation-step.test.tsx --reporter=verbose --no-coverage
```

### 4. Check React Testing Library Cleanup
```bash
grep -r "cleanup" tests/setup/
grep -r "@testing-library/react" tests/setup/
```

## Known React 18 Breaking Changes

### RTL Version Requirements
- React 18 requires `@testing-library/react` >= 13.0.0
- RTL 13+ uses automatic cleanup (might conflict with manual cleanup)
- RTL 14+ has different import patterns

### jsdom Configuration
React 18 concurrent features require:
```typescript
environmentOptions: {
  jsdom: {
    pretendToBeVisual: true,
    resources: 'usable',
    // Potentially missing:
    url: 'http://localhost:3000',
    // Or React 18 specific flags
  }
}
```

### Common Fixes

#### Fix 1: Add RTL Cleanup
```typescript
// tests/setup/jsdom-setup.ts
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

#### Fix 2: Update jsdom Options
```typescript
environmentOptions: {
  jsdom: {
    pretendToBeVisual: true,
    resources: 'usable',
    url: 'http://localhost:3000',
    runScripts: 'dangerously',
    // React 18 concurrent mode support
  }
}
```

#### Fix 3: Upgrade RTL
```bash
npm install @testing-library/react@latest @testing-library/jest-dom@latest --save-dev
```

#### Fix 4: Fix Import Order
Ensure React is imported before any components in tests:
```typescript
import React from 'react';
import { render, screen } from '@testing-library/react';
// Then component imports
```

## Execution Plan

### Step 1: Baseline Investigation (10 min)
1. Read current `tests/setup/jsdom-setup.ts`
2. Check RTL version and React 18 compatibility
3. Review vitest jsdom configuration
4. Identify missing cleanup or initialization

### Step 2: Implement Fix (15 min)
Based on findings, apply appropriate fix:
- Add RTL cleanup if missing
- Update jsdom options for React 18
- Fix setup file ordering
- Upgrade RTL if version incompatible

### Step 3: Validate (15 min)
1. Run single failing test to verify fix
2. Run full client test suite
3. Confirm hook errors eliminated
4. Ensure no regression in server tests

### Step 4: Document (10 min)
1. Update PHASE2-JSDOM-RTL-RESULTS.md
2. Document root cause and fix
3. Add React 18 testing guidelines to CLAUDE.md

**Total Estimated Time**: 50 minutes

## Success Metrics

- [ ] Hook errors reduced from 517 to 0
- [ ] All client tests passing (or only legitimate failures)
- [ ] Server tests remain unaffected
- [ ] Build and TypeScript checks still clean
- [ ] No new test failures introduced

## Reference Files

### Configuration
- `vitest.config.ts` - Main test configuration (lines 78-127 for jsdom)
- `vitest.config.int.ts` - Integration tests (unaffected)
- `package.json` - Dependency versions

### Setup Files
- `tests/setup/jsdom-setup.ts` - Primary suspect
- `tests/setup/test-infrastructure.ts` - Global mocking
- `tests/setup/vitest.setup.ts` - Vitest globals
- `tests/setup/node-setup.ts` - Server tests (working)

### Test Files (Sample)
- `tests/unit/capital-allocation-step.test.tsx` - Representative failing test
- `tests/unit/waterfall-step.test.tsx` - Another failing test

### Artifacts from Phase 1
- `artifacts/gate0-metadata.json` - Baseline metrics
- `artifacts/post-hardening-test-results.log` - Full test output with hook errors
- `docs/plans/WEEK2.5-FOUNDATION-HARDENING-RESULTS.md` - Phase 1 results

## Recommended Agent Strategy

**See**: [WEEK2.5-PHASE2-AGENT-STRATEGY.md](WEEK2.5-PHASE2-AGENT-STRATEGY.md) for complete agent usage guide

### Quick Recommendation: Use Codex Skill

**Best approach** for this task: Codex-first workflow (~25 min total)

```bash
codex-wrapper - <<'EOF'
Analyze React Testing Library setup for React 18.3.1 compatibility:

Files to analyze:
@tests/setup/jsdom-setup.ts
@tests/setup/test-infrastructure.ts
@vitest.config.ts (lines 78-127)

Questions:
1. Is cleanup() from @testing-library/react properly configured?
2. Are there any globals or mocks that could interfere with React hooks?
3. Does jsdom environment configuration support React 18 concurrent features?
4. Compare setup against React Testing Library v13+ best practices

Pattern to find:
- Missing afterEach(cleanup)
- Improper React import mocking
- jsdom options incompatible with React 18

Provide specific fix recommendations with code examples.
EOF
```

**Why Codex**:
- Cross-file context analysis
- React 18 + RTL best practices knowledge
- Can apply fix + validate in one workflow
- Faster iteration than manual debugging

**Fallback**: If Codex doesn't resolve in 2 attempts, use `error-debugging:debugger` agent (see WEEK2.5-PHASE2-AGENT-STRATEGY.md)

## Quick Start Prompt for Claude Code

### Option A: Codex-Assisted (Recommended)
```
Phase 2: Fix React hook errors using Codex skill

Use Codex to analyze and fix jsdom/RTL setup:
1. Run Codex analysis (see WEEK2.5-PHASE2-AGENT-STRATEGY.md)
2. Apply recommended fix
3. Validate with single test
4. Run full client suite

Target: 25-30 minutes to eliminate all 517 hook errors
```

### Option B: Direct Investigation
```
Phase 2: Fix React hook errors in jsdom test environment

CONTEXT:
- Phase 1 completed: TypeScript errors eliminated, React deduplicated to 18.3.1
- Problem: 517 React hook errors persist in client tests (jsdom environment)
- Pattern: "Cannot read properties of null (reading 'useId')"
- Server tests unaffected (hook errors only in React component tests)

INVESTIGATION:
1. Read tests/setup/jsdom-setup.ts - check for RTL cleanup
2. Check @testing-library/react version compatibility with React 18.3.1
3. Review vitest.config.ts jsdom environmentOptions for React 18 support
4. Test single failing test: tests/unit/capital-allocation-step.test.tsx

ROOT CAUSE HYPOTHESES (in priority order):
1. Missing @testing-library/react cleanup() in jsdom-setup.ts
2. RTL version incompatible with React 18.3.1
3. jsdom environmentOptions missing React 18 concurrent mode flags
4. Setup file execution order issue

GOAL:
Eliminate all 517 hook errors, get client tests passing

START:
Begin with Step 1 baseline investigation per WEEK2.5-PHASE2-JSDOM-RTL-KICKOFF.md
```

## Additional Context

### Why This Wasn't React 19
Phase 1 removed React 19 (from @mermaid-js/mermaid-cli) and deduplicated to React 18.3.1, but hook errors persisted. This definitively proves the issue is test environment configuration, not dependency conflicts.

### Why Only Client Tests Fail
Server tests use Node environment with different setup files (`tests/setup/node-setup.ts`) and don't involve React rendering. Hook errors only occur when React components are rendered in jsdom via RTL.

### Critical Insight
The error "Cannot read properties of null (reading 'useId')" suggests React's internal hooks dispatcher is null, which happens when:
1. React context is not properly initialized in test environment
2. Multiple React instances exist (ruled out - deduplicated)
3. Test cleanup doesn't reset React state between tests
4. jsdom environment doesn't properly support React 18 concurrent features

Most likely: Missing RTL cleanup causing React state pollution between tests.

## References

- [React Testing Library React 18 Guide](https://testing-library.com/docs/react-testing-library/api#cleanup)
- [Vitest jsdom Environment](https://vitest.dev/guide/environment.html#jsdom)
- [React 18 Breaking Changes](https://react.dev/blog/2022/03/08/react-18-upgrade-guide)
- Week 2.5 Results: `docs/plans/WEEK2.5-FOUNDATION-HARDENING-RESULTS.md`

---

**Last Updated**: 2025-12-20 (Post Phase 1)
**Status**: Ready for Phase 2 execution
**Priority**: HIGH (blocking client test development)
