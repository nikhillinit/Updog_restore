# Gate-Based Implementation Plan for Updog_restore v2.1.0

## 🟢 Green Scoreboard Status

The **Green Scoreboard** is the single source of truth for promotion readiness.
Nothing merges to main unless all five gates are green.

### Current Status: 🔴 RED (4 of 5 gates failing)

| Gate        | Status   | Details                      |
| ----------- | -------- | ---------------------------- |
| TypeScript  | ❌ RED   | 25 errors found              |
| Tests       | ✅ GREEN | Unit tests passing           |
| CI Checks   | ❌ RED   | 40+ checks failing on PR #84 |
| Guardian    | ❌ RED   | Exit code 124 failures       |
| Bundle Size | ❌ RED   | 371KB (near 400KB limit)     |

## Phase 0: Pre-flight & Walking Skeleton ✅ COMPLETE

### Completed Actions

- ✅ Phase 0 audit script created and executed
- ✅ TypeScript errors inventoried and categorized
- ✅ Walking skeleton component created with tests
- ✅ Green Scoreboard CI workflow configured
- ✅ Baseline metrics captured (bundle: 371KB)

### Audit Results Summary

- **TypeScript Errors:** 25 total (9 import/export, 2 middleware, 14 other)
- **CI Workflows:** 41 configured
- **Test Issues:** 10 files in wrong locations
- **Bundle Size:** 371.23KB (approaching 400KB limit)

## Parallel Execution Tracks

### Track A: TypeScript to Zero (Platform Owner)

**Gate:** `npm run check == 0`

#### Priority Order (Quick Wins First)

1. **Import/Export Errors (9 errors - 2 hours)**

   ```typescript
   // server/routes/metrics.ts:3
   - import { _calcGuardBad, _calcGuardEvents } from '../metrics/calcGuards.js'
   + import { calcGuardBad, calcGuardEvents } from '../metrics/calcGuards.js'

   // server/routes/reserves-api.ts:17
   - import { performanceMonitor } from '../observability/metrics'
   + // performanceMonitor needs to be exported from metrics module
   ```

2. **Middleware Types (2 errors - 1 hour)**

   ```typescript
   // server/middleware/auditLog.ts:55
   (-{ userId } + // userId doesn't exist in type
     { userId: req.user?.id || 'anonymous' } -
     // server/middleware/rateLimits.ts:78
     { client: Redis, prefix: string } +
     { client: Redis, prefix: string }) as RedisStoreOptions;
   ```

3. **Schema/Drizzle Issues (14 errors - 3 hours)**
   ```typescript
   // server/lib/approvals-guard.ts:334
   // Fix Drizzle insert overload mismatches
   // Ensure omit() is used for server-generated fields
   ```

**Exit Criteria:**

- [ ] `npm run check` returns 0 errors
- [ ] No new @ts-ignore patches
- [ ] CI typecheck lane passes

### Track B: Test System Repair (QA Owner)

**Gate:** All tests pass deterministically

#### Actions

1. **Fix Test Discovery (30 minutes)**

   ```bash
   mkdir -p tests/unit/legacy
   git mv tests/fund-setup.test.tsx tests/unit/legacy/
   git mv tests/utils/async-iteration.test.ts tests/unit/legacy/
   ```

2. **Integration Test Port Conflicts (2 hours)**

   ```javascript
   // Use ephemeral ports
   const PORT = 50000 + Math.floor(Math.random() * 10000);

   // Await server ready
   await waitFor(() => server.listening, { timeout: 5000 });
   ```

3. **Add Wizard data-testid (1 hour)**
   ```tsx
   // Step 3/4 components
   <input data-testid="step-3-fund-size" />
   <button data-testid="step-4-submit" />
   ```

**Exit Criteria:**

- [ ] Unit tests pass in <30s
- [ ] Integration tests complete without timeouts
- [ ] Wizard e2e enabled and passing

### Track C: CI/Guardian Hardening (DevOps Owner)

**Gate:** Guardian & CI checks green

#### Actions

1. **Fix Guardian Exit 124 (2 hours)**

   ```yaml
   # Add explicit timeouts
   timeout: 30s
   retry:
     attempts: 3
     delay: 5s
   ```

2. **Feature Flags Setup (1 hour)**

   ```typescript
   const featureFlags = {
     'reserves-v1.1': false,
     'horizon-quarters': false,
     'walking-skeleton': true,
   };
   ```

3. **Rollback Script (1 hour)**
   ```bash
   #!/bin/bash
   # scripts/rollback.sh
   git revert HEAD
   npm run db:migrate:down
   npm run config:restore
   ```

**Exit Criteria:**

- [ ] Guardian consecutive passes
- [ ] Rollback tested in staging
- [ ] Feature flags configured

### Track D: Modeling Engine (Behind Flags)

**Gate:** Property tests pass with seeded RNG

#### Actions (All Behind Feature Flags)

1. **Reserves v1.1 Implementation**

   ```typescript
   if (featureFlag('reserves-v1.1')) {
     // Extra remain pass logic
     await executeRemainPass(3, 100);
   }
   ```

2. **Horizon Binding**

   ```typescript
   if (featureFlag('horizon-quarters')) {
     const quarters = years * 4;
     // Thread through engines
   }
   ```

3. **Property-Based Tests**
   ```typescript
   test.property('invariants', () => {
     // Probabilities sum to 100%
     // Exit quarter >= invest quarter
     // Fund cap never breached
   });
   ```

**Exit Criteria:**

- [ ] Property tests green
- [ ] Reproducible with seed
- [ ] Behind feature flags

## Circuit Breaker Rules

### Automatic Enforcement

1. **Red Scoreboard = No New Features**
   - CI automatically blocks merges when any gate is red
   - Only fixes for red gates allowed

2. **Phase Overrun = Scope Reduction**
   - If any track extends >25%, remove equivalent scope
   - Maintain timeline by reducing features, not extending dates

3. **Walking Skeleton Must Stay Green**
   - Treated as production-critical
   - Blocks all work if broken

## Label-Based CI Automation

### Configured Labels

- `e2e:wizard` - Triggers Playwright suite
- `perf:budget-change` - Allows bundle size increase
- `ops:mute-guardian-ttl` - Temporary Guardian bypass (with expiry)
- `flag:reserves-v1.1` - Enables reserves v1.1 for testing
- `flag:horizon-quarters` - Enables horizon binding

### Branch Protection Rules

```yaml
required_checks:
  - green-scoreboard
  - typecheck
  - unit-tests
  - integration-tests
  - build
  - security-scan
```

## Immediate Next Steps (Today)

### Hour 1-2: Quick Wins

```bash
# 1. Fix test organization
mkdir -p tests/unit/legacy
git mv tests/fund-setup.test.tsx tests/unit/legacy/
git mv tests/utils/async-iteration.test.ts tests/unit/legacy/

# 2. Fix import/export errors (easiest TypeScript fixes)
# Focus on server/routes/metrics.ts and reserves-api.ts
```

### Hour 3-4: Parallel Work

- **Track A:** Continue TypeScript fixes (middleware types)
- **Track B:** Add wizard data-testids
- **Track C:** Debug Guardian exit 124
- **Track D:** Implement feature flag system

### Hour 5-6: Validation

```bash
# Run Green Scoreboard check
npm run scoreboard:check

# Validate walking skeleton
npm test -- walking-skeleton

# Check CI status
gh pr checks 84
```

## Success Metrics

### Phase Completion Criteria

- **Phase 0:** ✅ Audit complete, walking skeleton created
- **Phase 1:** All 5 gates green simultaneously
- **Phase 2:** 7-day cleanup complete, docs updated
- **Phase 3:** MVP features behind flags, tested
- **Phase 4:** Production deployment successful

### Daily Progress Tracking

```javascript
// Daily standup metrics
const dailyMetrics = {
  typescriptErrors: 25, // Target: 0
  failingCIChecks: 40, // Target: 0
  testPassRate: 85, // Target: 100
  guardianUptime: 0, // Target: 95
  bundleSizeKB: 371, // Target: <400
};
```

## Risk Mitigation

### Active Risks

1. **TypeScript complexity** - May take longer than estimated
   - Mitigation: Parallel work on other tracks
2. **CI instability** - 40+ failing checks
   - Mitigation: Focus on critical path checks first
3. **Bundle size** - Already at 371KB (93% of budget)
   - Mitigation: Lazy loading, code splitting

### Contingency Plans

- If TypeScript >3 days: Use targeted @ts-ignore with TODO comments
- If CI remains unstable: Create minimal CI pipeline for critical checks
- If bundle exceeds: Emergency tree-shaking and dependency audit

## Team Communication

### Daily Sync Format

1. Green Scoreboard status (red/green per gate)
2. Blockers requiring external help
3. Progress on parallel tracks
4. Updated timeline confidence (%)

### Weekly Stakeholder Update

- Demo walking skeleton progress
- Show Green Scoreboard trend
- Highlight completed gates
- Timeline adjustments if needed

---

## Implementation Status: IN PROGRESS

**Current Focus:** Phase 0 complete, starting parallel tracks **Confidence
Level:** 85% (reduced due to 25 TS errors) **Estimated Days to Green:** 3-5 days
with parallel execution

**Next Review:** Daily at standup with Green Scoreboard check
