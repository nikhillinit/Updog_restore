# TypeScript Error Resolution Plan

## Executive Summary

**REVISED ANALYSIS** (after baseline-regression-explainer diagnosis)

| Metric | Value | Status |
|--------|-------|--------|
| Baseline Errors | 437 | Tracked |
| Current Errors | 437 | PASSING |
| New Errors | 0 | PASSING |
| Fixed Errors | 0 | No regression |

**System Status**: The TypeScript baseline system is **FUNCTIONING CORRECTLY**.

## Corrected Findings

### Original Assessment (INCORRECT)
- Claimed tsconfig files were missing - **WRONG**
- Claimed baseline reporting false 0 errors - **WRONG**
- Claimed 598 errors - **PARTIALLY CORRECT** (root config, not per-project)

### Actual State (CORRECT)
All three per-project TypeScript configs exist and are working:
- `tsconfig.client.json` - 658 bytes, functional
- `tsconfig.server.json` - 1822 bytes, functional (strictest)
- `tsconfig.shared.json` - 709 bytes, functional

### Error Distribution

| Project | Raw Errors | Notes |
|---------|------------|-------|
| Client | 23 | UI components, adapters |
| Server | 531 | Bulk of errors, strict flags |
| Shared | 1 | Parse stage distribution |
| **Total Raw** | **555** | Before deduplication |
| **Baseline** | **437** | After context-aware hash deduplication |

### Why the Discrepancy?

The baseline system uses **context-aware hashing** that:
1. Hashes by file + error code + line content (not line number)
2. Deduplicates errors that appear multiple times due to cascading type failures
3. Provides stable tracking across refactoring

The 555 raw errors reduce to 437 unique baselined errors.

## Current Baseline Health

```
Baseline errors:  437
Current errors:   437
Fixed errors:     0
New errors:       0
Status:           PASSING
```

## Decision Point: Fix vs. Baseline Strategy

### Option A: Gradual Reduction (Recommended)
**Goal**: Reduce baselined errors over time while blocking new ones

**Approach** (per CAPABILITIES.md - baseline-governance skill):
1. **Ratchet Strategy**: Never increase baseline, only decrease
2. **Sprint-based Reduction**: Target 5-10% reduction per sprint
3. **Priority by Impact**: Fix errors in critical paths first

**Prioritized Error Categories**:
| Error Code | Count | Fix Strategy | Priority |
|------------|-------|--------------|----------|
| TS2551 | 2 | Deprecated crypto API - security fix | CRITICAL |
| TS2552 | 3 | Missing type imports | HIGH |
| TS18046 | ~20 | Unknown types - add type guards | MEDIUM |
| TS2532 | ~180 | Undefined checks - add optional chaining | MEDIUM |
| TS2322/2345 | ~230 | Type mismatches - refine types | LOW |

### Option B: Maintain Current State
**Goal**: Prevent regression, no active fixes

**Approach**:
1. Keep baseline at 437
2. Block any new errors via CI
3. Fix only when touching affected code

## Critical Fix Required: Deprecated Crypto APIs

**File**: `server/services/notion-service.ts`
**Lines**: 755, 769
**Severity**: CRITICAL (security + runtime failure on Node 17+)

```typescript
// CURRENT (deprecated, will fail):
const cipher = crypto.createCipher(algorithm, key);
const decipher = crypto.createDecipher(algorithm, key);

// REQUIRED FIX:
const cipher = crypto.createCipheriv(algorithm, key, iv);
const decipher = crypto.createDecipheriv(algorithm, key, iv);
```

**Note**: These errors are already in the baseline but represent a real security issue that should be fixed regardless of TypeScript.

## Recommended Action Plan

### Phase 1: Critical Security Fix (1-2 hours)
1. Fix `createCipher`/`createDecipher` in notion-service.ts
2. Run `npm run baseline:check` to verify no new errors
3. Run `npm test` to verify no regressions
4. Save updated baseline: `npm run baseline:save`

### Phase 2: High-Impact Fixes (Optional, 4-8 hours)
Focus on files with cascading errors:
1. `server/routes.ts` - Core routing
2. `server/services/variance-tracking.ts` - 5 errors
3. `server/services/time-travel-analytics.ts` - 8 errors
4. `server/services/notion-service.ts` - ~15 errors

### Phase 3: Systematic Reduction (Future Sprints)
Apply skills from CAPABILITIES.md:
- **systematic-debugging** skill for root cause analysis
- **test-driven-development** skill for fix verification
- **verification-before-completion** skill before claiming fixes done

## Tools & Capabilities Available

From CAPABILITIES.md:
- `/fix-auto` - Automated repair for simple fixes
- `/test-smart` - Run only affected tests
- `baseline-regression-explainer` agent - Diagnose regressions
- `baseline-governance` skill - Quality gate policies
- `code-reviewer` agent - Review fixes before commit

## Success Criteria

| Criteria | Requirement |
|----------|-------------|
| Baseline Check | PASSING (0 new errors) |
| Test Suite | All tests pass |
| Security Issues | Crypto APIs fixed |
| Baseline Update | Saved and committed if errors reduced |

## Commands

```bash
# Check current state
npm run baseline:check

# Save updated baseline (after fixes)
npm run baseline:save

# Run tests
npm test

# Run specific file tests
npm test -- --project=server

# View detailed progress
npm run baseline:progress
```

## Conclusion

The TypeScript baseline system is healthy. The 437 baselined errors are tracked and no new errors are being introduced. The recommended approach is:

1. **Immediate**: Fix the critical crypto API security issue
2. **Ongoing**: Use the ratchet strategy to gradually reduce errors
3. **Guard**: CI continues to block new errors via baseline check
