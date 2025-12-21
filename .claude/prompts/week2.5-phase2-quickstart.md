# Phase 2 Quick Start: Fix React Hook Errors

## TL;DR
Fix 517 React hook errors in jsdom test environment (NOT a dependency issue).

## Context (30 seconds)
- **Phase 1 Done**: TypeScript 0 errors, React deduplicated to 18.3.1, integration tests segregated
- **Problem**: All React component tests fail with hook errors (jsdom only)
- **Proof**: Server tests work fine (Node environment)
- **Error Pattern**: `Cannot read properties of null (reading 'useId')`

## Investigation Checklist

### 1. Check RTL Cleanup (Most Likely Root Cause)
```bash
cat tests/setup/jsdom-setup.ts
```
**Look for**: Missing `cleanup()` from `@testing-library/react`

**Expected Fix**:
```typescript
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

### 2. Check RTL Version
```bash
npm ls @testing-library/react --depth=0
```
**Required**: >= 13.0.0 for React 18.3.1

### 3. Check jsdom Config
```typescript
// vitest.config.ts around line 78-84
environmentOptions: {
  jsdom: {
    pretendToBeVisual: true,
    resources: 'usable',
    url: 'http://localhost:3000', // ← might be missing
  }
}
```

### 4. Test Single File
```bash
npm exec -- vitest run tests/unit/capital-allocation-step.test.tsx --reporter=verbose
```

## Recommended Approach: Use Codex Skill

**Fastest path** (~25 min): Let Codex analyze and fix

```bash
codex-wrapper - <<'EOF'
Analyze React Testing Library setup for React 18.3.1 compatibility:

@tests/setup/jsdom-setup.ts
@tests/setup/test-infrastructure.ts
@vitest.config.ts (lines 78-127)

Find: Missing cleanup(), improper mocking, jsdom config issues
Provide: Specific fix with code examples
EOF
```

Then apply fix and validate.

**See**: `docs/plans/WEEK2.5-PHASE2-AGENT-STRATEGY.md` for complete workflow options

## Alternative: Direct Fix Workflow

1. **Read setup**: `tests/setup/jsdom-setup.ts`
2. **Apply fix**: Add RTL cleanup if missing (most common)
3. **Verify**: Run single test
4. **Full suite**: `npm test -- --project=client`
5. **Document**: Update `docs/plans/WEEK2.5-PHASE2-JSDOM-RTL-RESULTS.md`

## Expected Outcome
- Hook errors: 517 → 0
- Client tests: 34 failed → 0 failed (or only legitimate failures)
- Time: ~30-50 minutes

## Full Context
See `docs/plans/PHASE2-JSDOM-RTL-KICKOFF.md` for complete investigation guide.

## Artifacts from Phase 1
- `artifacts/post-hardening-test-results.log` - Full hook error output
- `docs/plans/WEEK2.5-FOUNDATION-HARDENING-RESULTS.md` - Phase 1 summary
