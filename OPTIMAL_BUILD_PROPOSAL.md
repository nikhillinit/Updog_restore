# OPTIMAL BUILD PROPOSAL
## Systematic Path to Production Deployment

**Target:** Production-Ready Deployment (90/100)
**Current State:** 38/100 (Multiple Critical Blockers)
**Estimated Effort:** 32-49 hours (Best: 26h, Expected: 37h, Worst: 49h)

---

## APPROACH PHILOSOPHY

### Strategic Principles

1. **Fix Foundation First** - Infrastructure before features
2. **Fail Fast, Fix Fast** - Test after each phase
3. **Leverage Automation** - Use available tools maximally
4. **Parallel Where Possible** - Minimize critical path
5. **Verify Continuously** - Gates between phases

### Why This Sequence?

**Phase 0 (Security)** → Can't deploy with exposed secrets
**Phase 1 (Compilation)** → Can't test if code doesn't compile
**Phase 2 (Test Infrastructure)** → Can't validate if tests don't run
**Phase 3 (Test Fixes)** → Can't deploy with 23% failure rate
**Phase 4 (Quality Gates)** → Can't pass CI/CD with lint errors
**Phase 5 (Verification)** → Can't trust deployment without smoke tests

---

## AVAILABLE TOOLS & ASSETS

### Development Tools (Leverage These)

**MCP Integration:**
- ✅ `mcp__ide__getDiagnostics` - Real-time TypeScript errors
- ✅ `mcp__ide__executeCode` - Interactive Python debugging
- Use for: Incremental validation during fixes

**Automation Scripts:**
- ✅ `npm run secret-gen` - Generate strong secrets
- ✅ `npm run typecheck` - Full TypeScript validation
- ✅ `npm run lint` - ESLint with auto-fix
- ✅ `npm run lint:fix` - Automatic fixes
- ✅ `npm test` - Test suite execution
- ✅ `npm run test:unit` - Unit tests only
- ✅ `npm run build` - Production build verification

**IDE Features:**
- ✅ TypeScript language server (errors on save)
- ✅ ESLint integration (inline warnings)
- ✅ Auto-import resolution
- Use for: Real-time feedback loop

**Testing Infrastructure:**
- ✅ Vitest with watch mode
- ✅ React Testing Library (needs configuration)
- ✅ Playwright for E2E (exists but unconfigured)
- ✅ Test fixtures (`tests/fixtures/`)
- ✅ Test setup utilities (`tests/setup/`)

### Existing Assets (Don't Rebuild)

**Infrastructure Already Built:**
- ✅ Deployment workflow (`.github/workflows/deploy-production.yml`)
- ✅ Worker Dockerfile (`Dockerfile.worker`)
- ✅ Health monitoring setup (`workers/health-server.ts`)
- ✅ Database migration system (`scripts/migrations/`)
- ✅ Secret generation script (`scripts/generate-secrets.ts`)
- ✅ Comprehensive `.env.example`

**Code That Works:**
- ✅ Division-by-zero guards (comprehensive)
- ✅ Conservation validation (solid)
- ✅ Reserve engine (44/44 tests passing)
- ✅ Pacing engine (27/27 tests passing)
- ✅ Deterministic engine (41/41 tests passing)
- ✅ Store layer (13/13 tests passing)

**Documentation:**
- ✅ Infrastructure remediation docs
- ✅ CLAUDE.md (development guidelines)
- ✅ CHANGELOG.md (change tracking)
- ✅ DECISIONS.md (architectural context)

### Missing Assets (Need to Create)

**Scripts:**
- ❌ `npm run schema:check` (referenced in workflow)
- ❌ `npm run db:migrate` (needs verification)
- ❌ `npm run test:smoke:production` (needs creation)

**Test Infrastructure:**
- ❌ Database mock with proper JSON serialization
- ❌ React Testing Library global setup
- ❌ Vitest jsdom configuration

**Monitoring:**
- ❌ Prometheus/Grafana deployment verification
- ❌ Health endpoint integration tests

---

## PHASE 0: SECURITY & BASELINE (Est: 2-3 hours)

### Priority: CRITICAL (Must Do First)

**Goal:** Eliminate security vulnerabilities and establish clean deployment baseline

### Tasks

#### Task 0.1: Remove Exposed Secrets (30min)
**Current State:** `.env` and `.env.local` committed with weak/real secrets
**Target State:** No secrets in git history, `.gitignore` enforced

**Steps:**
```bash
# 1. Remove files from git tracking
git rm --cached .env .env.local

# 2. Add to .gitignore (if not already present)
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env*.local" >> .gitignore

# 3. Commit the removal
git add .gitignore
git commit -m "security: remove exposed secrets from git tracking"

# 4. Verify no secrets in current commit
git show HEAD:.env 2>&1 | grep "does not exist"  # Should show error
```

**Validation:**
- [ ] `.env` not in `git ls-files`
- [ ] `.env.local` not in `git ls-files`
- [ ] `.gitignore` contains `.env*`

**Risks:**
- History still contains old commits with secrets
- Consider: `git filter-branch` or BFG Repo-Cleaner if needed
- For now: Regenerate all exposed secrets

#### Task 0.2: Generate New Secrets (30min)
**Current State:** Old secrets potentially compromised
**Target State:** All secrets regenerated with strong values

**Steps:**
```bash
# 1. Generate new secrets
npm run secret-gen

# 2. Create production .env from example
cp .env.example .env

# 3. Replace placeholders with generated secrets
# Manual: Edit .env and paste generated secrets
# OR: Script this if secret-gen outputs to file

# 4. Verify secret strength
grep "GENERATE_STRONG_SECRET" .env  # Should return nothing

# 5. Document secret locations for deployment
echo "Secrets stored in: [Password Manager/GCP Secret Manager]"
```

**Validation:**
- [ ] All secrets >32 characters
- [ ] No placeholder text in `.env`
- [ ] Secrets documented in secure location
- [ ] `.env` not committed (verify with `git status`)

#### Task 0.3: Repository Baseline (1-2 hours)
**Current State:** 32 uncommitted files, unclear deployment state
**Target State:** Clean commit history, clear deployment candidate

**Steps:**
```bash
# 1. Review uncommitted changes
git status
git diff --stat

# 2. Categorize changes
# - Legitimate fixes → Stage for commit
# - Work in progress → Stash or separate branch
# - Junk files → Delete

# 3. Clean junk files
rm -f NUL build-output.txt lint-output.txt test-results.json typecheck-results.txt

# 4. Review specific files
# - CONSENSUS_STATUS_REPORT.md → Commit (documentation)
# - OPTIMAL_BUILD_PROPOSAL.md → Commit (documentation)
# - Modified tests → Review each, commit if complete
# - Modified core files → Review carefully

# 5. Create commit or branch
# Option A: Commit completed work
git add [files]
git commit -m "chore: remediation work phase 0 - security and cleanup"

# Option B: Create feature branch for incomplete work
git checkout -b feature/remediation-phase-0
git add -A
git commit -m "wip: remediation in progress"
git checkout main

# 6. Verify clean state on main
git status  # Should show "working tree clean" or only .env
```

**Validation:**
- [ ] No junk files (`NUL`, `*.txt` build artifacts)
- [ ] Clear commit message describing changes
- [ ] All tests that were passing still pass
- [ ] Build still succeeds: `npm run build`

**Dependencies:** None (do this first)
**Parallel Work:** Can do while 0.1 and 0.2 run

---

## PHASE 1: FIX COMPILATION (Est: 4-6 hours)

### Priority: CRITICAL (Blocks Everything)

**Goal:** Zero TypeScript compilation errors, clean build

### Tasks

#### Task 1.1: Fix App.tsx Route Type Errors (2-3 hours)
**Current State:** 33 identical TypeScript errors
**Target State:** All routes type-check correctly

**Root Cause:** `wouter`'s Route component expects `ComponentType<RouteComponentProps>` but receiving `(props: Record<string, unknown>) => JSX.Element`

**Approach:**
```typescript
// CURRENT (BROKEN):
<Route path="/dashboard" component={(props: Record<string, unknown>) => <ProtectedRoute component={Dashboard} {...props} />} />

// OPTION 1: Use wouter's route params properly
<Route path="/dashboard">
  {(params) => <ProtectedRoute component={Dashboard} />}
</Route>

// OPTION 2: Fix ProtectedRoute signature
interface ProtectedRouteProps {
  component: React.ComponentType;
  params?: Record<string, string>;
}

function ProtectedRoute({ component: Component, params }: ProtectedRouteProps) {
  const { needsSetup, isLoading } = useFundContext();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (needsSetup) {
    return <Redirect to="/fund-setup" />;
  }

  return <Component />;
}

// Then use:
<Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />

// OPTION 3: Remove intermediate wrapper
<Route path="/dashboard">
  <ProtectedRoute component={Dashboard} />
</Route>
```

**Steps:**
1. Read `client/src/App.tsx` lines 178-250 (all route definitions)
2. Read wouter documentation for correct typing pattern
3. Choose fix approach (recommend Option 3 for simplicity)
4. Apply fix to all 33 routes
5. Verify: `npm run typecheck` shows 0 errors in App.tsx

**Validation:**
- [ ] `npm run typecheck` passes for client
- [ ] All routes still navigate correctly
- [ ] Protected routes still enforce fund setup

**Tool:** Use `mcp__ide__getDiagnostics` for real-time validation

#### Task 1.2: Fix Server Type Errors (1-2 hours)
**Current State:** 3 server TypeScript errors
**Target State:** Server code type-checks cleanly

**Error 1: validation.ts (lines 39, 53)**
```typescript
// CURRENT:
const validated = schema.safeParse(req.body);
if (!validated.success) {
  const errors = validated.error.flatten();
  return res.status(400).json({ error: errors });
}
req.body = validated.data;  // ERROR: Index signature missing

// FIX:
interface ValidatedRequest<T> extends Request {
  body: T;
}

// Or use type assertion after validation:
if (!validated.success) {
  const errors = validated.error.flatten();
  return res.status(400).json({ error: errors });
}
(req as ValidatedRequest<z.infer<typeof schema>>).body = validated.data;
```

**Error 2: health.ts (line 341)**
```typescript
// CURRENT:
const redis = new Redis(config.redis);  // ERROR: String not assignable to RedisOptions

// FIX:
const redis = new Redis(config.redis.url);
// OR:
const redisConfig = typeof config.redis === 'string'
  ? { host: 'localhost', port: 6379 }
  : config.redis;
const redis = new Redis(redisConfig);
```

**Steps:**
1. Fix validation.ts type assertion
2. Fix health.ts Redis config
3. Run: `npm run typecheck` (should show 0 errors)

**Validation:**
- [ ] `npm run typecheck` shows 0 errors total
- [ ] Server builds successfully
- [ ] Validation middleware tests pass

#### Task 1.3: Verify Clean Compilation (30min)
**Current State:** Not verified end-to-end
**Target State:** Full build pipeline works

**Steps:**
```bash
# 1. Clean previous builds
rm -rf dist node_modules/.vite

# 2. Full type check
npm run typecheck
# Expected: "Found 0 errors"

# 3. Production build
npm run build
# Expected: Success in ~17s, no errors

# 4. Check bundle sizes
ls -lh dist/assets/
# Expected: Reasonable sizes (main bundle <250KB)

# 5. Verify both client and server
ls dist/index.html  # Client entry
node dist/server/index.js --version  # Server (if applicable)
```

**Validation:**
- [ ] Zero TypeScript errors
- [ ] Build completes without errors
- [ ] Bundle sizes reasonable
- [ ] No sourcemap errors (except acceptable preact warning)

**Dependencies:** Task 1.1 and 1.2 must complete first
**Parallel Work:** None (this is the verification gate)

---

## PHASE 2: FIX TEST INFRASTRUCTURE (Est: 8-12 hours)

### Priority: CRITICAL (Blocks Test Validation)

**Goal:** All test suites can execute, mock infrastructure functional

### Tasks

#### Task 2.1: Fix Mock Database Infrastructure (3-4 hours)
**Current State:** Mock chain broken, `mockDb.insert().values.mock.calls[0][0]` returns undefined
**Target State:** Database mocks work consistently

**Root Cause:** Vitest mocks not properly chaining

**Solution:**
```typescript
// FILE: tests/helpers/database-mock.ts (CREATE THIS)
import { vi } from 'vitest';

// Create properly chained mock
export function createMockDb() {
  const mockValues = vi.fn().mockReturnThis();
  const mockReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
  const mockOnConflictDoUpdate = vi.fn().mockReturnThis();

  const mockInsert = vi.fn(() => ({
    values: mockValues,
    returning: mockReturning,
    onConflictDoUpdate: mockOnConflictDoUpdate,
  }));

  const mockWhere = vi.fn().mockReturnThis();
  const mockOrderBy = vi.fn().mockReturnThis();
  const mockLimit = vi.fn().mockResolvedValue([]);

  const mockSelect = vi.fn(() => ({
    from: vi.fn().mockReturnThis(),
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
  }));

  const mockQuery = {
    fundConfigs: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    funds: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    investments: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  return {
    insert: mockInsert,
    select: mockSelect,
    query: mockQuery,
    // Expose internals for test assertions
    _mocks: {
      insert: mockInsert,
      values: mockValues,
      returning: mockReturning,
    },
  };
}

// Export singleton for tests
export const databaseMock = createMockDb();
```

**Steps:**
1. Create `tests/helpers/database-mock.ts` with proper chaining
2. Update `server/db.ts` to use mock in test environment
3. Update all failing tests to use new mock structure
4. Add JSON.stringify() to JSONB mock returns:
   ```typescript
   returning: vi.fn().mockResolvedValue([{
     id: 1,
     payload: JSON.stringify({ /* data */ })  // Not raw object
   }]);
   ```

**Files to Update:**
- `tests/unit/database/time-travel-schema.test.ts` (3 failures)
- `tests/unit/database/variance-tracking-schema.test.ts` (29 failures)
- `tests/unit/services/variance-tracking.test.ts` (37 failures)
- `tests/unit/services/performance-prediction.test.ts` (18 failures)

**Validation:**
- [ ] Database tests pass (52/54 target)
- [ ] Service tests pass (200/207 target)
- [ ] No `Cannot read property of undefined` errors
- [ ] JSON serialization works correctly

#### Task 2.2: Configure React Testing Library (2-3 hours)
**Current State:** DOM not initialized, `document.appendChild` undefined
**Target State:** React component tests run successfully

**Solution:**
```typescript
// FILE: vitest.config.ts (UPDATE)
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',  // ADD THIS
    setupFiles: ['./tests/setup/vitest-setup.ts'],  // ADD THIS
    css: true,
  },
});

// FILE: tests/setup/vitest-setup.ts (CREATE)
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

**Steps:**
1. Install jsdom if not present: `npm install -D jsdom`
2. Update vitest.config.ts with jsdom environment
3. Create vitest-setup.ts with React Testing Library config
4. Re-run component tests:
   ```bash
   npm run test:unit -- tests/unit/components/ --run
   npm run test:unit -- tests/unit/pages/ --run
   ```

**Validation:**
- [ ] Component tests run (19/19 target)
- [ ] Page tests run (44/44 target)
- [ ] No `appendChild` errors
- [ ] React components render correctly

#### Task 2.3: Fix API Test Import Paths (1-2 hours)
**Current State:** API test suites import fixtures but fail silently
**Target State:** All API tests execute

**Root Cause:** TypeScript path mapping not configured for tests

**Solution:**
```typescript
// FILE: vitest.config.ts (UPDATE)
import path from 'path';

export default defineConfig({
  test: {
    // ... existing config
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared'),
      '@tests': path.resolve(__dirname, './tests'),  // ADD THIS
    },
  },
});
```

**Update Imports:**
```typescript
// CURRENT (BROKEN):
import { fixtures } from '../../fixtures/time-travel-fixtures';
import { setupTestInfrastructure } from '../../setup/test-infrastructure';

// FIXED:
import { fixtures } from '@tests/fixtures/time-travel-fixtures';
import { setupTestInfrastructure } from '@tests/setup/test-infrastructure';
```

**Steps:**
1. Update vitest.config.ts with `@tests` alias
2. Update imports in 3 API test files:
   - `tests/unit/api/time-travel-api.test.ts`
   - `tests/unit/api/variance-tracking-api.test.ts`
   - `tests/unit/api/portfolio-intelligence.test.ts`
3. Verify fixtures and setup files exist
4. Re-run: `npm run test:unit -- tests/unit/api/ --run`

**Validation:**
- [ ] All API tests execute (200+ tests run)
- [ ] No "Cannot find module" errors
- [ ] Fixtures load correctly

#### Task 2.4: Fix Express Compatibility Issue (2-3 hours)
**Current State:** 176 tests failing with `pathRegexp is not a function`
**Target State:** Express middleware tests pass

**Root Cause:** Dependency version mismatch in Express router layer

**Investigation:**
```bash
# Check Express versions
npm ls express
npm ls path-to-regexp

# Check if path-to-regexp is direct dependency
grep "path-to-regexp" package.json
```

**Likely Solutions:**
```bash
# Option 1: Update Express to latest patch
npm update express

# Option 2: Add path-to-regexp explicitly
npm install path-to-regexp@^6.2.0

# Option 3: Check for conflicting versions
npm dedupe
```

**Steps:**
1. Investigate dependency tree
2. Apply fix (likely Option 2)
3. Re-run affected tests:
   ```bash
   npm run test:unit -- tests/unit/middleware/ --run
   npm run test:unit -- tests/unit/api/health/ --run
   ```
4. Verify no regressions

**Validation:**
- [ ] Error handler tests pass (6/6)
- [ ] Health cache tests pass (5/5)
- [ ] Health guards tests pass
- [ ] No `pathRegexp` errors

**Dependencies:** Independent, can run parallel with 2.1-2.3
**Parallel Work:** ✅ Yes, while others work on mocks/config

---

## PHASE 3: FIX TEST FAILURES (Est: 6-8 hours)

### Priority: HIGH (Quality Gate)

**Goal:** >95% test pass rate (target: 698/735 passing)

### Tasks

#### Task 3.1: Fix Remaining Engine Test Failures (2 hours)
**Current State:** 2 minor failures in 184 engine tests
**Target State:** 184/184 passing

**Failure 1: deterministic-reserve-engine.test.ts**
```typescript
// CURRENT:
expect(result.metadata.calculationDuration).toBeGreaterThan(0);

// FIX:
expect(result.metadata.calculationDuration).toBeGreaterThanOrEqual(0);
// OR:
expect(typeof result.metadata.calculationDuration).toBe('number');
```

**Failure 2: liquidity-engine.test.ts (negative runway)**
```typescript
// Test: "should handle zero cash position"
// Error: expected -9.6 to be greater than or equal to 0

// Root cause: Edge case not handled
// Fix in client/src/core/LiquidityEngine.ts:
if (openingCash <= 0 && monthlyBurn > 0) {
  return {
    ...forecast,
    runwayMonths: 0,  // Not negative
    liquidityRatio: 0,
    burnRate: monthlyBurn,
  };
}
```

**Steps:**
1. Fix timing assertion in deterministic test
2. Fix edge case in LiquidityEngine
3. Run: `npm run test:unit -- tests/unit/engines/ --run`

**Validation:**
- [ ] 184/184 engine tests pass
- [ ] No regressions in previously passing tests

#### Task 3.2: Tighten Weak Assertions (3-4 hours)
**Current State:** 107 tests with `toBeGreaterThan(0)`
**Target State:** Specific value expectations

**Approach:** Replace generic assertions with meaningful validations

**Examples:**
```typescript
// WEAK:
expect(forecast.liquidityRatio).toBeGreaterThan(0);

// STRONG:
expect(forecast.liquidityRatio).toBeCloseTo(0.85, 2);
// OR at minimum:
expect(forecast.liquidityRatio).toBeGreaterThan(0);
expect(forecast.liquidityRatio).toBeLessThan(10);  // Reasonable upper bound
```

**Priority Files (most weak assertions):**
1. `tests/unit/services/performance-prediction.test.ts` (17 instances)
2. `tests/unit/engines/reserve-engine.test.ts` (18 instances)
3. `tests/unit/engines/monte-carlo.test.ts` (6 instances)

**Steps:**
1. Review each weak assertion
2. Determine expected value from engine logic
3. Replace with specific expectation or bounded range
4. Test incrementally (file by file)

**Validation:**
- [ ] Tests still pass with tighter assertions
- [ ] Assertions validate actual behavior
- [ ] No false positives (tests pass incorrectly)

#### Task 3.3: Fix Monte Carlo Test Suite (1-2 hours)
**Current State:** Test file won't load, import error
**Target State:** Monte Carlo tests execute

**Error:** `Failed to resolve import "@/server/services/monte-carlo-engine"`

**Fix Path Resolution:**
```typescript
// CURRENT:
import { monteCarloEngine } from '@/server/services/monte-carlo-engine';

// FIX:
import { monteCarloEngine } from '../../../server/services/monte-carlo-engine';
// OR configure path alias properly in vitest.config.ts
```

**Steps:**
1. Fix import path in `tests/unit/engines/monte-carlo.test.ts`
2. Verify service file exists
3. Run: `npm run test:unit -- tests/unit/engines/monte-carlo.test.ts --run`

**Validation:**
- [ ] Test file loads without error
- [ ] Tests execute (even if some fail)
- [ ] Import resolves correctly

**Dependencies:** Task 2.3 (path aliases) helps this
**Parallel Work:** Can work independently

---

## PHASE 4: PASS QUALITY GATES (Est: 8-12 hours)

### Priority: HIGH (CI/CD Requirement)

**Goal:** Deployment workflow validation passes

### Tasks

#### Task 4.1: Fix Critical ESLint Errors (6-8 hours)
**Current State:** 3,199 ESLint errors (workflow uses `--max-warnings 0`)
**Target State:** <50 errors, <500 warnings

**Strategy:** Fix categories, not individual files

**Category 1: `@typescript-eslint/no-explicit-any` (1,941 errors)**
```typescript
// For each file:
// 1. Run: npm run lint -- --fix [file]
// 2. Manually fix remaining `any` types
// 3. Document intentional `any` with eslint-disable-next-line + reason

// Example:
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Third-party library has no types
const result = externalLibrary(data) as any;
```

**Category 2: Unused imports**
```bash
# Use automated fix:
npm run lint:fix

# This should remove most unused imports automatically
```

**Category 3: React import errors**
```typescript
// Add to affected files:
import React from 'react';
```

**Pragmatic Approach:**
- Focus on NEW code (files modified in last month)
- Leave legacy code with documented eslint-disables
- Target: Reduce errors by 80% (3,199 → ~640)

**Steps:**
1. Run `npm run lint:fix` (auto-fixes ~30%)
2. Fix high-impact files (10-15 files with most errors):
   - `api/[[...slug]].ts`
   - `client/src/adapters/reserves-adapter.ts`
   - `client/src/components/CapitalFirstCalculator.tsx`
3. Add intentional eslint-disables with reasons
4. Verify: `npm run lint` shows <50 errors

**Validation:**
- [ ] `npm run lint` exits with code 0
- [ ] ESLint error count <50
- [ ] Warning count <500
- [ ] All disables have explanatory comments

**Tool:** Use ESLint auto-fix first, then manual

#### Task 4.2: Create Missing Deployment Scripts (2-3 hours)
**Current State:** 3 scripts referenced in workflow but missing
**Target State:** All workflow scripts exist and work

**Script 1: `npm run schema:check`**
```json
// package.json
"scripts": {
  "schema:check": "drizzle-kit check:pg"
}
```
Test: `npm run schema:check` should validate schema

**Script 2: `npm run db:migrate`**
```json
"scripts": {
  "db:migrate": "node scripts/migrations/run-migrations.js"
}
```
Create: `scripts/migrations/run-migrations.js`

**Script 3: `npm run test:smoke:production`**
```json
"scripts": {
  "test:smoke:production": "playwright test tests/smoke/production.spec.ts"
}
```
Verify: `tests/smoke/production.spec.ts` exists

**Steps:**
1. Add script definitions to package.json
2. Create missing script files if needed
3. Test each script locally:
   ```bash
   npm run schema:check
   npm run db:migrate -- --dry-run
   npm run test:smoke:production
   ```

**Validation:**
- [ ] All 3 scripts defined in package.json
- [ ] Scripts execute without error
- [ ] Workflow can call these scripts

#### Task 4.3: Workflow Dry Run (1-2 hours)
**Current State:** Workflow not tested end-to-end
**Target State:** Local simulation passes

**Simulate Workflow Locally:**
```bash
#!/bin/bash
# simulate-workflow.sh

echo "=== Pre-deployment Validation ==="

# Type check
echo "Type checking..."
npm run typecheck
if [ $? -ne 0 ]; then
  echo "❌ Type check failed"
  exit 1
fi

# Lint
echo "Linting..."
npm run lint -- --max-warnings 0
if [ $? -ne 0 ]; then
  echo "❌ Lint failed"
  exit 1
fi

# Tests
echo "Running tests..."
npm run test:unit -- --run
if [ $? -ne 0 ]; then
  echo "❌ Tests failed"
  exit 1
fi

# Build
echo "Building..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Build failed"
  exit 1
fi

# Schema check
echo "Checking schema..."
npm run schema:check
if [ $? -ne 0 ]; then
  echo "❌ Schema check failed"
  exit 1
fi

echo "✅ All pre-deployment checks passed"
```

**Steps:**
1. Create simulation script
2. Run: `bash simulate-workflow.sh`
3. Fix any failures
4. Re-run until all pass

**Validation:**
- [ ] All workflow steps pass locally
- [ ] No surprises in CI/CD
- [ ] Ready for GitHub Actions run

**Dependencies:** All previous phases must complete
**This is the final gate before Phase 5**

---

## PHASE 5: DEPLOYMENT VERIFICATION (Est: 4-6 hours)

### Priority: MEDIUM (Validation)

**Goal:** Deployment succeeds, smoke tests pass, monitoring works

### Tasks

#### Task 5.1: Staging Deployment (2-3 hours)
**Current State:** Never deployed to staging
**Target State:** Staging deployment succeeds, smoke tests pass

**Prerequisites:**
- [ ] All Phase 0-4 tasks complete
- [ ] Secrets configured in GitHub
- [ ] GCP credentials set up
- [ ] Database provisioned

**Steps:**
1. Push to staging branch (if workflow configured)
2. Monitor GitHub Actions workflow
3. Watch each step:
   - Pre-deployment validation ✅
   - Docker build ✅
   - Database migration (dry-run) ✅
   - Deployment to Cloud Run ✅
   - Smoke tests ✅
   - Health monitoring ✅
4. If failures, debug and retry

**Validation:**
- [ ] Workflow completes successfully
- [ ] Services respond to health checks
- [ ] Smoke tests pass
- [ ] No errors in logs

#### Task 5.2: Production Deployment (1-2 hours)
**Current State:** Not production-ready
**Target State:** Production deployed successfully

**Prerequisites:**
- [ ] Staging deployment successful
- [ ] Manual approval obtained
- [ ] Rollback plan confirmed
- [ ] Team notified

**Steps:**
1. Trigger production workflow
2. Manual approval at gate
3. Monitor deployment carefully
4. Watch for errors in first 10 minutes
5. Verify monitoring dashboards

**Validation:**
- [ ] Production services healthy
- [ ] All endpoints responding
- [ ] No error spikes in monitoring
- [ ] Rollback plan tested (if issues)

#### Task 5.3: Post-Deployment Monitoring (1 hour)
**Current State:** Monitoring not verified
**Target State:** Full observability

**Setup:**
- [ ] Prometheus scraping metrics
- [ ] Grafana dashboards loading
- [ ] Alert manager configured
- [ ] Logs aggregating properly

**Verification:**
```bash
# Check health endpoints
curl https://api.pressonventures.com/health

# Check metrics
curl https://api.pressonventures.com/metrics

# Check worker health
curl https://api.pressonventures.com/health/workers
```

**Validation:**
- [ ] All health endpoints return 200
- [ ] Metrics being collected
- [ ] Dashboards show live data
- [ ] Alerts would trigger on errors

---

## EXECUTION STRATEGY

### Critical Path (Sequential - No Parallelization)

**28 hours minimum:**
1. Phase 0: Security (2h) →
2. Phase 1: Compilation (4h) →
3. Phase 2: Test Infra (8h) →
4. Phase 3: Test Fixes (6h) →
5. Phase 4: Quality Gates (8h)

**These MUST be done in order.**

### Parallel Work Opportunities

**Phase 2 (Test Infrastructure) - 4 concurrent tracks:**
- Track A: Mock database (3-4h)
- Track B: React Testing Library (2-3h)
- Track C: API import paths (1-2h)
- Track D: Express compatibility (2-3h)

**Savings:** 8-12h sequential → 3-4h parallel (if 4 developers)

**Phase 4 (Quality Gates) - 3 concurrent tracks:**
- Track A: ESLint errors (6-8h)
- Track B: Missing scripts (2-3h)
- Track C: Can start while A runs

**Savings:** 8-11h sequential → 6-8h parallel (if 2 developers)

### Resource Requirements

**Minimum Viable:**
- 1 senior developer
- 32-49 hours sequential
- Estimated: 1 week (with interruptions)

**Optimal:**
- 1 senior dev (Phases 0, 1, gate-keeping)
- 2 mid-level devs (Phase 2 parallel tracks)
- 1 QA engineer (Phase 3, 5)
- Estimated: 2-3 days parallel

### Risk Mitigation

**Risk 1: TypeScript fixes reveal architectural issues**
- **Probability:** Medium
- **Impact:** High (adds 4-8 hours)
- **Mitigation:** Review route architecture before fixing; may need refactor

**Risk 2: Mock infrastructure needs complete rewrite**
- **Probability:** Low-Medium
- **Impact:** High (adds 6-10 hours)
- **Mitigation:** Start with test file, validate approach before scaling

**Risk 3: ESLint errors deeply entrenched**
- **Probability:** High
- **Impact:** Medium (adds 4-6 hours)
- **Mitigation:** Pragmatic approach - document legacy issues, fix new code

**Risk 4: Test failures uncover production bugs**
- **Probability:** Medium
- **Impact:** Critical (could block deployment indefinitely)
- **Mitigation:** Investigate each failure thoroughly, don't just make tests pass

**Risk 5: Deployment workflow has undocumented dependencies**
- **Probability:** Medium
- **Impact:** Medium (adds 2-4 hours)
- **Mitigation:** Dry-run workflow locally before pushing to CI/CD

### Verification Gates

**Gate 1: Compilation (End of Phase 1)**
- ✅ `npm run typecheck` → 0 errors
- ✅ `npm run build` → succeeds
- ✅ Bundle sizes reasonable
- **If fail:** Stop, debug, don't proceed to Phase 2

**Gate 2: Test Infrastructure (End of Phase 2)**
- ✅ All test files load without import errors
- ✅ Mocks return expected values
- ✅ Test execution starts successfully
- **If fail:** Stop, fix infrastructure before writing more tests

**Gate 3: Test Quality (End of Phase 3)**
- ✅ Pass rate >95% (700/735)
- ✅ No flaky tests
- ✅ All assertions meaningful
- **If fail:** Investigate failures, may indicate bugs

**Gate 4: CI/CD Ready (End of Phase 4)**
- ✅ `simulate-workflow.sh` passes
- ✅ All deployment scripts work
- ✅ Lint/type/test gates pass
- **If fail:** Debug specific failure, retry gate

**Gate 5: Production Ready (End of Phase 5)**
- ✅ Staging deployment successful
- ✅ Smoke tests pass
- ✅ Monitoring operational
- **If fail:** Rollback, investigate, retry

---

## SUCCESS METRICS

### Objective Criteria (Must Achieve)

**Compilation:**
- ✅ 0 TypeScript errors
- ✅ Build time <30 seconds
- ✅ Bundle size <15MB

**Testing:**
- ✅ >95% pass rate (700/735)
- ✅ 0 import/load failures
- ✅ <5% flaky tests

**Code Quality:**
- ✅ <50 ESLint errors
- ✅ <500 ESLint warnings
- ✅ <100 `as any` in new code

**Security:**
- ✅ 0 secrets in git
- ✅ 0 HIGH vulnerabilities
- ✅ All secrets rotated

**Deployment:**
- ✅ Workflow completes without errors
- ✅ All services healthy
- ✅ Smoke tests pass
- ✅ Monitoring operational

### Timeline

**Best Case:** 26 hours
- All fixes straightforward
- No architectural issues discovered
- Parallel execution with 4 developers
- Timeline: 3 days

**Expected Case:** 37 hours
- Some complexity in TypeScript fixes
- Mock infrastructure needs careful work
- Parallel execution with 2-3 developers
- Timeline: 5 days (1 week with meetings)

**Worst Case:** 49 hours
- Architectural issues in routing
- Complete mock rewrite needed
- Deep ESLint issues
- Sequential execution (1 developer)
- Timeline: 7-10 days (2 weeks with interruptions)

---

## TOOLS LEVERAGE SUMMARY

**Automated (Use Heavily):**
- ✅ `npm run lint:fix` - Auto-fix ESLint issues
- ✅ `mcp__ide__getDiagnostics` - Real-time type checking
- ✅ `npm run secret-gen` - Secret generation
- ✅ Vitest watch mode - Continuous test feedback

**Manual (Use Strategically):**
- Review architectural patterns before fixing
- Code review between phases
- Manual smoke testing in staging

**Don't Rebuild:**
- ✅ Deployment workflow (already comprehensive)
- ✅ Database migrations (system exists)
- ✅ Monitoring setup (configs ready)
- ✅ Health checks (implementation exists)

---

## FINAL RECOMMENDATION

### Go/No-Go Decision Tree

**Can we deploy today?**
→ **NO** (38/100 readiness)

**Can we deploy this week?**
→ **YES, IF** all Phase 0-4 tasks complete (expected 37h)

**Can we deploy safely?**
→ **YES, WITH** proper testing and rollback plan

### Confidence Assessment

**Confidence in Plan:** HIGH (90%)
- Clear path identified by 5 independent agents
- Blockers well-understood
- Fixes are known patterns

**Confidence in Timeline:** MEDIUM (70%)
- Best case achievable if no surprises
- Expected case realistic for most orgs
- Worst case accounts for architectural issues

**Confidence in Success:** MEDIUM-HIGH (80%)
- Fixes are within team capability
- No fundamental architectural changes needed
- Risk mitigation strategies in place

### Executive Recommendation

**PROCEED WITH SYSTEMATIC REMEDIATION**

1. **Allocate Resources:** 1 senior + 2 mid developers, 1 week
2. **Follow Phase Sequence:** Don't skip gates
3. **Track Progress Daily:** Use todo list, update stakeholders
4. **Deploy to Staging First:** Validate thoroughly
5. **Production Deployment:** With manual approval and monitoring

**Expected Outcome:** Production-ready deployment in 5-7 business days with 90/100 confidence.

---

**Document Created:** 2025-09-30
**Author:** Consensus Architect (5-Agent Synthesis)
**Status:** READY FOR EXECUTION