# Week 2 Day-0 Plan: Server Strictness Unification

**Date:** 2025-10-13 **Strategy:** Track 1B - Remove server bypasses and
establish ground truth **Status:** READY TO EXECUTE (after Track 1A merge)

---

## Objectives

1. **Enable full TypeScript strictness** on server code
2. **Remove Vite tsconfigRaw bypass** (build-time strictness)
3. **Establish ground truth baseline** for Week 2 remediation
4. **No runtime changes** - config-only modifications

---

## Pre-Flight Checklist

- ✅ Track 1A merged (client + shared = 0 errors)
- ✅ Main branch up to date
- ✅ Release tag created: `v0.1.0-ts-week1-client-complete`
- ✅ Week 2 issue created for tracking
- ✅ `spreadIfDefined` helper available for reuse

---

## Day-0 Tasks (1-2 hours, scaffold only)

### Task 1: Remove Server Bypasses (30 min)

#### 1.1 Update tsconfig.server.json

**Current state (bypassed):**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "strict": false,
    "noUncheckedIndexedAccess": false,
    "noPropertyAccessFromIndexSignature": false,
    "strictNullChecks": false,
    "noImplicitAny": false,
    "outDir": "dist/server"
  },
  "include": ["server/**/*"],
  "exclude": ["server/**/*.test.ts"]
}
```

**Target state (unified):**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    // Inherit ALL strictness from base tsconfig.json
    // Note: base has strict: true, exactOptionalPropertyTypes: true

    // Server-specific: Keep Node.js compatibility
    "module": "ESNext",
    "moduleResolution": "node",
    "target": "ES2022",
    "outDir": "dist/server"

    // Optional: Allow property access via bracket notation for Express middleware
    // "noPropertyAccessFromIndexSignature": false  // Only if needed
  },
  "include": ["server/**/*"],
  "exclude": ["server/**/*.test.ts"]
}
```

**Command:**

```bash
# Backup current config
cp tsconfig.server.json tsconfig.server.json.backup

# Edit to remove bypasses (manual edit or sed script)
# Then commit as Day-0 change
git add tsconfig.server.json
git commit -m "chore(day0): remove server TypeScript strictness bypasses

BREAKING: Server now inherits full strictness from base tsconfig
- strict: true (inherited)
- exactOptionalPropertyTypes: true (inherited)
- All other strict flags enabled

This will reveal 50-150 errors that were previously bypassed.
Week 2 remediation will address these systematically.

Ref: Track 1B Week 2 Day-0 plan"
```

#### 1.2 Remove Vite tsconfigRaw Bypass

**Current state (client/vite.config.ts):**

```ts
export default defineConfig({
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        skipLibCheck: true,
        noImplicitAny: false,
        strictNullChecks: false,
        strictFunctionTypes: false,
        strictPropertyInitialization: false,
        noImplicitThis: false,
        noImplicitReturns: false,
        alwaysStrict: false,
      },
    },
  },
  // ... rest of config
});
```

**Target state:**

```ts
export default defineConfig({
  esbuild: {
    // Removed tsconfigRaw - Vite will now respect tsconfig.json
    // This ensures build-time type checking matches editor/CLI checks
  },
  // ... rest of config
});
```

**Command:**

```bash
# Edit vite.config.ts to remove tsconfigRaw block
# Then commit
git add vite.config.ts
git commit -m "chore(day0): remove Vite tsconfigRaw strictness bypass

Vite build now respects tsconfig.json strictness settings.
This ensures parity between:
- Editor type checking
- CLI type checking (npm run check)
- Build-time type checking (npm run build)

Previously, Vite bypassed strictness during builds, creating
discrepancies between development and production checks.

Ref: Track 1B Week 2 Day-0 plan"
```

---

### Task 2: Generate Ground Truth Baseline (30 min)

#### 2.1 Create Artifacts Directory

```bash
mkdir -p artifacts/week2
```

#### 2.2 Capture Server Error Baseline

```bash
# Run server type check and capture output
npm run check:server 2>&1 | tee artifacts/week2/server-errors-baseline.txt

# Count errors
SERVER_ERRORS=$(grep -c "error TS" artifacts/week2/server-errors-baseline.txt || echo 0)
echo "Server Errors: $SERVER_ERRORS" > artifacts/week2/summary.txt

# Error code distribution
grep "error TS" artifacts/week2/server-errors-baseline.txt | \
  sed -E 's/.*error (TS[0-9]+).*/\1/' | \
  sort | uniq -c | sort -rn > artifacts/week2/error-codes.txt

# Top files by error count
grep "error TS" artifacts/week2/server-errors-baseline.txt | \
  cut -d'(' -f1 | sort | uniq -c | sort -rn | \
  head -20 > artifacts/week2/top-files.txt
```

#### 2.3 Capture Full Project Baseline

```bash
# Full project check (client + shared + server)
npm run check 2>&1 | tee artifacts/week2/full-baseline.txt

# Per-package breakdown
echo "=== ERROR COUNTS ===" > artifacts/week2/error-breakdown.txt
echo "Client: $(npm run check:client 2>&1 | grep -c 'error TS' || echo 0)" >> artifacts/week2/error-breakdown.txt
echo "Shared: $(npm run check:shared 2>&1 | grep -c 'error TS' || echo 0)" >> artifacts/week2/error-breakdown.txt
echo "Server: $(npm run check:server 2>&1 | grep -c 'error TS' || echo 0)" >> artifacts/week2/error-breakdown.txt
```

#### 2.4 Commit Baseline Artifacts

```bash
git add artifacts/week2/
git commit -m "docs(week2): add Day-0 ground truth baseline

Baseline after removing server strictness bypasses:
- Server errors: $(cat artifacts/week2/summary.txt)
- Client errors: 0 (maintained from Week 1)
- Shared errors: 0 (maintained from Week 1)

Artifacts:
- server-errors-baseline.txt: Full error output
- error-codes.txt: Error type distribution
- top-files.txt: Files with most errors
- error-breakdown.txt: Per-package summary

Next: Systematic remediation using Track 1A patterns"
```

---

### Task 3: Scenario Assessment (15 min)

Based on server error count, determine Week 2 scope:

#### Scenario Assessment Matrix

| Server Errors | Scenario        | Recommended Approach   | Timeline  |
| ------------- | --------------- | ---------------------- | --------- |
| **0-20**      | A+ (Unlikely)   | Quick mop-up, same day | 2-3 hours |
| **20-50**     | A (Optimistic)  | Single-day sprint      | 1 day     |
| **50-100**    | B (Expected)    | 2-3 agent batches      | 1-2 days  |
| **100-150**   | C (Challenging) | 4-5 agent batches      | 2-3 days  |
| **150+**      | D (Complex)     | Multi-week, phased     | 1-2 weeks |

**Assessment Script:**

```bash
SERVER_ERRORS=$(grep -c "error TS" artifacts/week2/server-errors-baseline.txt || echo 0)

if [ "$SERVER_ERRORS" -le 20 ]; then
  echo "Scenario A+: Quick mop-up (~2-3 hours)"
elif [ "$SERVER_ERRORS" -le 50 ]; then
  echo "Scenario A: Single-day sprint (~1 day)"
elif [ "$SERVER_ERRORS" -le 100 ]; then
  echo "Scenario B: Multi-batch sprint (~1-2 days)"
elif [ "$SERVER_ERRORS" -le 150 ]; then
  echo "Scenario C: Extended sprint (~2-3 days)"
else
  echo "Scenario D: Multi-week phased approach (~1-2 weeks)"
fi
```

---

### Task 4: Update CI Configuration (15 min)

#### 4.1 Add Full-Scope Type Check

**package.json:**

```json
{
  "scripts": {
    "type-check": "npm run check",
    "type-check:full": "npm run check",
    "type-check:ci": "npm run check"
  }
}
```

#### 4.2 Update GitHub Actions (if applicable)

**.github/workflows/type-check.yml:**

```yaml
name: TypeScript Type Check

on:
  pull_request:
    paths:
      - '**.ts'
      - '**.tsx'
      - 'tsconfig*.json'
  push:
    branches: [main]

jobs:
  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.19.x'
      - run: npm ci
      - name: Full TypeScript Check
        run: npm run check
      - name: Client Check
        run: npm run check:client
      - name: Server Check
        run: npm run check:server
      - name: Shared Check
        run: npm run check:shared
```

**Commit:**

```bash
git add .github/workflows/type-check.yml package.json
git commit -m "ci: add full-scope TypeScript checking

- Add type-check:ci script for CI pipelines
- Create GitHub Actions workflow for full type checking
- Check client, server, and shared separately for granular feedback

This ensures Week 2 server remediation is validated in CI."
```

---

## Day-0 Deliverables

### Commits (4 total):

1. ✅ Remove server tsconfig bypasses
2. ✅ Remove Vite tsconfigRaw bypass
3. ✅ Add ground truth baseline artifacts
4. ✅ Update CI configuration

### Artifacts:

- ✅ `artifacts/week2/server-errors-baseline.txt`
- ✅ `artifacts/week2/error-codes.txt`
- ✅ `artifacts/week2/top-files.txt`
- ✅ `artifacts/week2/error-breakdown.txt`
- ✅ `artifacts/week2/summary.txt`
- ✅ `WEEK2_DAY0_PLAN.md` (this document)

### Documentation:

- ✅ Scenario assessment completed
- ✅ Error distribution analyzed
- ✅ CI pipeline updated

---

## Week 2 Remediation Strategy (Post Day-0)

### Cluster Order (based on Track 1A patterns)

**Phase 1: Server Models & Types (20-30% of errors)**

- Type definitions in `server/types/`
- Schema definitions (Zod/io-ts)
- Shared interfaces used by controllers

**Patterns:**

- Use `spreadIfDefined` for optional fields
- Conditional object construction
- Array mapping with optional props

**Phase 2: HTTP Layer (30-40% of errors)**

- Controllers in `server/routes/`
- Request/response typing
- Middleware typing

**Patterns:**

- Express `Request<P, R, B, Q>` generic typing
- Optional param/query handling
- Response type narrowing

**Phase 3: Services & Business Logic (20-30% of errors)**

- Database services
- External API clients
- Business logic functions

**Patterns:**

- Service method typing
- Error handling with discriminated unions
- Async function return types

**Phase 4: Workers & Background Jobs (10-20% of errors)**

- BullMQ job handlers
- Scheduled tasks
- State machines (if any)

**Patterns:**

- Typed job handlers
- Event typing
- State machine context typing

**Phase 5: Utilities & Middleware (5-10% of errors)**

- Logging utilities
- Metrics collection
- Custom middleware

**Patterns:**

- Generic utility functions
- Middleware typing with `RequestHandler`
- Logger typing

---

## Parallel Execution Plan (Week 2)

### Batch 1: Foundation (Phases 1-2)

**Agents:** 3-4 parallel agents

- Agent 1: Server types & models
- Agent 2: Controller layer (routes)
- Agent 3: Request/response typing
- Agent 4: Middleware typing

**Checkpoint:** After Batch 1, expect 50-70% error reduction

### Batch 2: Services (Phase 3)

**Agents:** 2-3 parallel agents

- Agent 1: Database services
- Agent 2: External API clients
- Agent 3: Business logic

**Checkpoint:** After Batch 2, expect 80-90% error reduction

### Batch 3: Workers & Utilities (Phases 4-5)

**Agents:** 2 parallel agents

- Agent 1: Workers & jobs
- Agent 2: Utilities & logging

**Checkpoint:** After Batch 3, expect 100% error reduction (0 errors)

---

## Success Criteria (Week 2)

- ✅ Server TypeScript errors: 0
- ✅ Client TypeScript errors: 0 (maintained)
- ✅ Shared TypeScript errors: 0 (maintained)
- ✅ Build passes with unified strictness
- ✅ CI enforces full-scope type checking
- ✅ No server bypasses remaining
- ✅ Vite tsconfigRaw removed
- ✅ Documentation updated

---

## Risk Management

### Low Risk (Mitigated):

- ✅ Type-only changes (no runtime modifications)
- ✅ Proven patterns from Track 1A
- ✅ Atomic commits with rollback capability
- ✅ Checkpoint tags after each batch

### Medium Risk (Monitor):

- ⚠️ Server error count higher than expected (>150)
- ⚠️ Cross-boundary types requiring shared changes
- ⚠️ Express middleware typing complexity

**Mitigation:** Defer complex items to follow-up issues if >30 min per item

### High Risk (Escalate if encountered):

- 🚨 Forced runtime defaults that change API semantics
- 🚨 Two consecutive batches with no net error reduction
- 🚨 Shared type changes breaking client code

**Escalation:** Pause, document decision point, consult stakeholders

---

## References

- **Track 1A Completion:**
  [SESSION3_COMPLETION_REPORT.md](SESSION3_COMPLETION_REPORT.md)
- **Pattern Library:** `spreadIfDefined` helper in
  `client/src/lib/spreadIfDefined.ts`
- **Strategic Framework:**
  [HANDOFF_MEMO_TYPESCRIPT_STRATEGY_2025-10-13.md](HANDOFF_MEMO_TYPESCRIPT_STRATEGY_2025-10-13.md)
- **Track 1A Progress:**
  [HANDOFF_MEMO_TRACK1A_PROGRESS_2025-10-13.md](HANDOFF_MEMO_TRACK1A_PROGRESS_2025-10-13.md)

---

## Next Session Commands

```bash
# Day-0 Execution
cd /path/to/Updog_restore

# 1. Remove bypasses
# (Manual edits to tsconfig.server.json and vite.config.ts)
git add tsconfig.server.json vite.config.ts
git commit -m "chore(day0): remove server strictness bypasses"

# 2. Generate baseline
mkdir -p artifacts/week2
npm run check:server 2>&1 | tee artifacts/week2/server-errors-baseline.txt
grep -c "error TS" artifacts/week2/server-errors-baseline.txt

# 3. Assess scenario
./scripts/assess-week2-scenario.sh  # (create this script)

# 4. Commit artifacts
git add artifacts/week2/ WEEK2_DAY0_PLAN.md
git commit -m "docs(week2): add Day-0 ground truth baseline"

# 5. Create Week 2 branch
git checkout -b remediation/week2-server-strictness

# 6. Begin remediation with parallel agents
# (Launch agents based on scenario assessment)
```

---

**END OF WEEK 2 DAY-0 PLAN**

🎯 **Ready to Execute:** After Track 1A merge complete ⏱️ **Estimated Time:**
1-2 hours for Day-0 scaffold 🚀 **Next Phase:** Week 2 remediation (1-3 days
based on error count)
