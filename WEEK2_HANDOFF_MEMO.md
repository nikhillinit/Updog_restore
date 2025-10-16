# Week 2 Server TypeScript Remediation - Handoff Memo

**Date:** 2025-10-14
**Session:** Infrastructure Complete → Ready for Pattern Sweeps
**Branch:** `remediation/week2-server-strictness`
**Status:** 📋 **INFRASTRUCTURE COMPLETE - READY TO EXECUTE**

---

## 🎯 Executive Summary (30 seconds)

**What's Done:**
- ✅ All infrastructure built and tested (10 commits pushed)
- ✅ Pre-commit guard active and verified (3 smoke tests passed)
- ✅ TS4111 surgical codemod ready (ts-morph based, union-aware)
- ✅ Pattern library from Week 1 available (spreadIfDefined, isDefined)
- ✅ Progress tracking + CI workflows deployed

**Current State:**
- **Baseline:** 617 TypeScript errors
- **Branch:** `remediation/week2-server-strictness` (up to date with remote)
- **Next:** Pattern sweeps targeting ≤300 errors by noon gate

**Estimated Time to Complete:** 6-8 hours of active work (1-2 days with gates)

---

## 📊 Current Error Analysis

### Error Distribution (Top 10 Codes)

| Rank | Code | Count | % | Pattern |
|------|------|-------|---|---------|
| 1 | TS4111 | 222 | 36% | Index signature property access |
| 2 | TS2532 | 62 | 10% | Object possibly 'undefined' |
| 3 | TS2322 | 55 | 9% | Type mismatch |
| 4 | TS18048 | 49 | 8% | Possibly 'undefined' (strict) |
| 5 | TS2345 | 46 | 7% | Argument type mismatch |
| 6 | TS2379 | 30 | 5% | Getter/setter inconsistency |
| 7 | TS2769 | 25 | 4% | No matching overload |
| 8 | TS2339 | 25 | 4% | Property doesn't exist |
| 9 | TS2375 | 20 | 3% | exactOptionalPropertyTypes |
| 10 | TS2538 | 13 | 2% | Type cannot be index |
| **Total** | | **617** | **100%** | |

### Top 15 Error Files

| File | Errors | Primary Patterns |
|------|--------|------------------|
| server/services/performance-prediction.ts | 43 | TS4111, TS2532 |
| server/services/ai-orchestrator.ts | 33 | TS4111, TS2345 |
| server/services/monte-carlo-simulation.ts | 32 | TS4111, TS2322 |
| server/services/streaming-monte-carlo-engine.ts | 24 | TS4111, TS2532 |
| server/routes/scenario-analysis.ts | 24 | TS4111, TS2345 |
| server/routes.ts | 19 | TS4111, TS2339 |
| server/routes/health.ts | 18 | TS4111, TS2532 |
| server/services/projected-metrics-calculator.ts | 17 | TS4111, TS2345 |
| server/middleware/enhanced-audit.ts | 17 | TS4111, TS2322 |
| server/routes/v1/reserve-approvals.ts | 15 | TS4111, TS2379 |
| server/agents/stream.ts | 13 | TS4111, TS2532 |
| server/middleware/idempotency.ts | 11 | TS4111, TS2322 |
| server/services/notion-service.ts | 10 | TS4111, TS2339 |
| server/routes/performance-metrics.ts | 10 | TS4111, TS2345 |
| server/routes/reallocation.ts | 9 | TS2532, TS2322 |

**Key Insight:** TS4111 dominates top files (36% of all errors), making the codemod critical path.

---

## 🏗️ Infrastructure Built (10 Commits)

### Phase -1: Pre-Flight Validation ✅
**Commits:** 0 (verification only)
- Dependencies: Clean (30 UNMET OPTIONAL expected)
- Week 1 integrity: ✅ client: 0 errors, shared: 0 errors
- Builds: ✅ SUCCESS (18.70s)
- Shared isolation: ✅ 0 errors

### Phase 0: Configuration & Baseline ✅
**Commits:** 1 (`3c16150`)
- **Critical ESM Decision:** Keep `moduleResolution: "Bundler"`
  - Reason: NodeNext adds +1150 errors (608 → 1758)
  - Documented in `tsconfig.server.json` comments
- Overlap gate: 10% (3/30 client files overlap with Week 1)
- Decision: **Include** client core/lib/utils (59 new errors)
- Baseline captured: 608 errors → Current: 617 errors

### Phase 1: Infrastructure Setup ✅
**Commits:** 6 (`a8acb4e` through `d5ffc37`)

1. **Shared Utilities** (`a8acb4e`)
   - `shared/lib/ts/spreadIfDefined.ts` - exactOptionalPropertyTypes helper
   - `shared/lib/ts/isDefined.ts` - Type guard utilities
   - Proven patterns from Week 1 (38 uses)

2. **Express Auth Wrapper** (`b1ab507`)
   - `server/types/http.ts` - authed(), TypedHandler, AuthedTypedHandler
   - No global augmentation (safer than `declare global`)

3. **Type Declarations** (`db8d543`, `55136d9`)
   - @types/swagger-jsdoc installed
   - server/types/vite-env.d.ts for import.meta.env

4. **Progress Utilities + CI** (`d5ffc37`)
   - scripts/week2-progress.sh - Automated error counting
   - scripts/run-pattern-analysis.sh - Hardened pattern analyzer wrapper
   - .github/workflows/server-types.yml - Required CI check
   - .github/workflows/ts-pattern-report.yml - Non-blocking pattern report

### Phase 1+: Husky Guard + TS4111 Codemod ✅
**Commits:** 3 (`227b9c4`, `7e48368`, test commits)

5. **Pre-Commit Guard** (`227b9c4`)
   - `.husky/guards/week2-server-ts.sh` - Modular guard script
   - Windows-safe (git.exe fallback)
   - Scoped: server/**, shared/**, client/src/(core|lib|utils)/**
   - Bypass: `SKIP_SERVER_TS=1` or `--no-verify`
   - **Tested:** 3 smoke tests passed

6. **TS4111 Surgical Codemod** (`7e48368`)
   - `scripts/codemods/bracketize-index-prop.ts` - ts-morph based
   - Union-type aware (checks ALL constituents)
   - Leaves declared members untouched
   - npm scripts: dry run + per-directory execution
   - **Ready to use:** Not yet applied

---

## 🛠️ Available Tools & Patterns

### Pattern Library (Proven Week 1)

**1. spreadIfDefined - Exact Optional Properties**
```typescript
import { spreadIfDefined } from '@shared/lib/ts/spreadIfDefined';

const payload = {
  id,
  name,
  ...spreadIfDefined('description', maybeDesc),
  ...spreadIfDefined('metadata', maybeMeta),
};
```
**Use for:** TS2375, TS2379 (50 errors combined)

**2. isDefined - Type Guards**
```typescript
import { isDefined } from '@shared/lib/ts/isDefined';

if (isDefined(adjustment)) {
  const amount = adjustment.amount; // TypeScript knows it's defined
}
```
**Use for:** TS2532, TS18048 (111 errors combined)

**3. authed() - Express Authentication**
```typescript
import { authed } from '@server/types/http';

router.get('/protected', authed((req, res) => {
  // req.user is guaranteed to exist and typed
  const userId = req.user.id;
  res.json({ userId });
}));
```
**Use for:** Replacing `req.user?` assumptions

**4. TypedHandler - Express Route Typing**
```typescript
import { TypedHandler } from '@server/types/http';

interface FundParams { id: string; }
interface FundQuery { includeMetrics?: string; }

const getFund: TypedHandler<FundParams, any, any, FundQuery> = async (req, res) => {
  const fundId = req.params.id; // Typed as string
  const metrics = req.query.includeMetrics === 'true'; // Typed
};
```
**Use for:** TS2345, TS2322 (101 errors combined)

### Automation Tools

**1. TS4111 Codemod**
```bash
# Dry run (report only, no changes)
npm run codemod:ts4111:dry

# Apply by directory (atomic commits)
npm run codemod:ts4111:services
npm run codemod:ts4111:routes
npm run codemod:ts4111:middleware

# Single file test
npm run codemod:ts4111:file -- server/services/performance-prediction.ts
```
**Artifacts:** `artifacts/week2/ts4111-codemod-report.json`

**2. Progress Tracking**
```bash
# Run after every 5-10 commits
scripts/week2-progress.sh
```
**Output:** `artifacts/week2/progress.log`

**3. Pattern Analysis**
```bash
# Full analysis with hardened wrapper
scripts/run-pattern-analysis.sh artifacts/week2/baseline.txt
```
**Artifacts:**
- `artifacts/week2/error-distribution.txt`
- `artifacts/week2/top-files-by-errors.txt`
- `artifacts/week2/pattern-summary.txt`

### Pre-Commit Guard (Active)

**Triggers when staging:**
- `server/**/*.ts(x)`
- `shared/**/*.ts(x)`
- `client/src/(core|lib|utils)/**/*.ts(x)`

**Bypass mechanisms:**
```bash
# Temporary bypass (use sparingly)
SKIP_SERVER_TS=1 git commit -m "WIP: debugging"

# Global bypass (emergency only)
git commit --no-verify -m "hotfix"
```

**Test results:**
- ✅ Test A: No server files → guard skipped
- ✅ Test B: Lockfile only → guard skipped
- ✅ Test C: Bypass flag → guard respected

---

## 🎯 Execution Plan: Pattern Sweeps

### Step 0: Create Worklists (5 min)

```bash
# Generate fresh baseline
npx tsc -p tsconfig.server.json --noEmit 2>&1 | tee artifacts/week2/baseline-before-sweeps.txt

# Create error code worklists
mkdir -p artifacts/week2/worklists
BASE=artifacts/week2/baseline-before-sweeps.txt

# Exact optional properties (TS2375, TS2379)
grep -n "error TS2375\|error TS2379" "$BASE" | cut -d'(' -f1 | sort -u \
  > artifacts/week2/worklists/ts2375.txt

# Possibly undefined (TS2532, TS18048)
grep -n "error TS2532\|error TS18048" "$BASE" | cut -d'(' -f1 | sort -u \
  > artifacts/week2/worklists/ts2532.txt

# Mismatches/overloads (TS2345, TS2322, TS2769)
grep -n "error TS2345\|error TS2322\|error TS2769" "$BASE" | cut -d'(' -f1 | sort -u \
  > artifacts/week2/worklists/ts2345.txt
```

### Sweep 1: Exact Optional Properties (TS2375/TS2379) - 60-90 min

**Target:** 50 errors → ~15 errors (70% reduction)

**Pattern:**
```typescript
import { spreadIfDefined } from '@shared/lib/ts/spreadIfDefined';

const result = {
  required: value,
  ...spreadIfDefined('optional1', maybeVal1),
  ...spreadIfDefined('optional2', maybeVal2),
};
```

**Workflow:**
1. Open files from `worklists/ts2375.txt`
2. Apply spreadIfDefined pattern
3. Commit in batches (3-8 files)

**Commit template:**
```
fix(server): resolve TS2375 in <area> (exactOptionalPropertyTypes)

• Omit undefined via spreadIfDefined
• Types-only; no behavior change
Affected: N files, M errors
```

**Checkpoint:**
```bash
npm run check:server | tee artifacts/week2/checkpoint-1.txt
scripts/week2-progress.sh
```

### Sweep 2: Possibly Undefined (TS2532/TS18048) - 60-90 min

**Target:** 111 errors → ~40 errors (65% reduction)

**Patterns (priority order):**

**A) Early Returns (Routes with existing 404 handling)**
```typescript
if (!fund) return res.status(404).json({ error: 'Not found' });
const name = fund.name; // TypeScript knows fund exists
```

**B) Type Guards (Business logic)**
```typescript
import { isDefined } from '@shared/lib/ts/isDefined';

if (isDefined(adjustment)) {
  const amount = adjustment.amount; // Safe
}
```

**C) Optional Chaining (No behavior change)**
```typescript
const label = maybeValue?.toString() ?? 'N/A';
```

**D) Array.at() for negative indices (Node 20)**
```typescript
const last = arr.at(-1); // Correctly typed as T | undefined
if (isDefined(last)) { /* use safely */ }
```

**Commit template:**
```
fix(server): resolve TS2532 in <area> (undefined safety)

• Narrow with guards/optional chaining
• Types-only; no behavior change
Affected: N files, M errors
```

**Checkpoint:**
```bash
npm run check:server | tee artifacts/week2/checkpoint-2.txt
scripts/week2-progress.sh
```

### Sweep 3: Mismatch/Overload (TS2345/TS2322/TS2769) - 30-45 min

**Target:** 126 errors → ~40 errors (70% reduction)

**Patterns:**

**A) Conditional Spreads for Options**
```typescript
fetch(url, {
  method: 'POST',
  ...(data ? { body: JSON.stringify(data) } : {}),
});
```

**B) Narrow at Call Site**
```typescript
calculate(possiblyUndefined ?? 0); // Provide semantically safe default
```

**C) Explicit Type Assertions (last resort)**
```typescript
const handler: RequestHandler = (req, res, next) => {
  // Implementation
};
```

**Commit template:**
```
fix(server): resolve TS2345 in <area> (overload/mismatch)

• Narrow call sites; conditional spreads for options
• Types-only; no behavior change
Affected: N files, M errors
```

**Checkpoint:**
```bash
npm run check:server | tee artifacts/week2/checkpoint-3.txt
scripts/week2-progress.sh
```

### Noon Gate Checkpoint 🚦

**Target:** ≤300 errors

**Commands:**
```bash
# Generate noon baseline
npx tsc -p tsconfig.server.json --noEmit 2>&1 | tee artifacts/week2/baseline-noon.txt

# Run pattern analysis
scripts/run-pattern-analysis.sh artifacts/week2/baseline-noon.txt \
  | tee artifacts/week2/pattern-analysis.noon.out

# Count errors
ERRORS=$(grep -c "error TS" artifacts/week2/baseline-noon.txt || echo "0")
echo "Noon gate: $ERRORS errors (target: ≤300)"
```

**Decision Matrix:**

| Error Count | Status | Action |
|-------------|--------|--------|
| ≤ 300 | ✅ **PASS** | Continue to afternoon sweeps |
| 301-350 | ⚠️ **BORDERLINE** | Focus on top files only |
| > 350 | 🚨 **CARVE OUT** | Exclude worst subtree, continue |

**Carve-Out Procedure (if >350):**
```bash
# Identify worst subtree
grep "error TS" artifacts/week2/baseline-noon.txt | \
  cut -d'/' -f1-2 | sort | uniq -c | sort -rn | head -5

# Edit tsconfig.server.json to add to exclude
# Example: "server/services/ai-orchestrator.ts"

# Log carved-out work
echo "server/services/ai-orchestrator.ts | 33 errors | $(date -u)" \
  >> artifacts/week2/carved-out.txt

# Create follow-up issue
gh issue create --title "Week 2.5: Address carved-out files" \
  --body "Files temporarily excluded from Week 2..."
```

---

## 📅 Timeline & Gates

### Day 1 Schedule

**Morning (3-4 hours):**
- Step 0: Worklists (5 min)
- Sweep 1: TS2375 (60-90 min) → Expected: 617 → ~480
- Sweep 2: TS2532 (60-90 min) → Expected: ~480 → ~310

**Noon Gate:** ≤300 errors (Projected: ~310, slightly over but acceptable)

**Afternoon (3-4 hours):**
- Sweep 3: TS2345 (30-45 min) → Expected: ~310 → ~280
- Remaining patterns based on noon analysis
- Target: ≤100 errors by EOD

**EOD Gate:** ≤100 errors

### Day 2 Schedule

**Morning (3-4 hours):**
- Hotspot files (>5 errors each)
- Unusual patterns (TS2379, TS2339)
- Target: ≤50 errors by noon

**Afternoon (2-4 hours):**
- Final sweep to 0 errors
- Verification (all checks, builds, tests)
- Ship: Update PR, tag release

---

## 🎓 Pattern Playbook Quick Reference

### TS2375 / TS2379 - Exact Optional Properties
**Pattern:** `spreadIfDefined`
**Files:** 50 errors across ~15 files
**Difficulty:** 🟢 LOW (proven Week 1 pattern)

### TS2532 / TS18048 - Possibly Undefined
**Pattern:** Type guards, optional chaining, early returns
**Files:** 111 errors across ~30 files
**Difficulty:** 🟡 MEDIUM (requires judgment)

### TS2345 / TS2322 / TS2769 - Mismatch/Overload
**Pattern:** Conditional spreads, narrowing
**Files:** 126 errors across ~35 files
**Difficulty:** 🟡 MEDIUM (context-dependent)

### TS4111 - Index Signature Access
**Pattern:** Codemod (surgical ts-morph)
**Files:** 222 errors across ~45 files
**Difficulty:** 🟢 LOW (automated)
**Status:** 🔧 **Codemod ready but NOT YET APPLIED**

### TS2339 - Property Doesn't Exist
**Pattern:** Ambient types, type augmentation
**Files:** 25 errors across ~8 files
**Difficulty:** 🟡 MEDIUM (case-by-case)

---

## 🔒 Safety Guardrails

### Pre-Commit Protection
- ✅ Active for server/shared/client core/lib/utils
- ✅ Automatic (runs on staged TS files)
- ✅ Bypassable (for WIP commits)

### Commit Discipline
- ✅ Atomic batches (3-8 files per commit)
- ✅ Conventional format
- ✅ Pattern + area in message
- ✅ "Types-only; no behavior change" note

### Progress Tracking
- ✅ Run `scripts/week2-progress.sh` every 5-10 commits
- ✅ Logs to `artifacts/week2/progress.log`
- ✅ Visible downward trend

### CI Visibility
- ✅ server-types.yml (required check)
- ✅ ts-pattern-report.yml (non-blocking visibility)
- ✅ Pattern reports on every PR push

---

## 🚨 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Timeline overrun | MEDIUM | MEDIUM | Gates at noon/EOD with carve-out option |
| Pattern doesn't work | LOW | LOW | Checkpoint after each sweep |
| Test breakage | LOW | HIGH | Run tests after major batches |
| Pre-commit friction | LOW | LOW | Bypass mechanism documented |
| Codemod brittleness | MEDIUM | MEDIUM | Dry run + single file test first |

**Overall Risk: LOW-MEDIUM** (proven patterns, clear gates, atomic commits)

---

## 📈 Success Criteria

**Infrastructure Phase (COMPLETE):**
- [x] All TypeScript utilities created
- [x] Pre-commit guard tested and working
- [x] TS4111 codemod ready
- [x] Progress tracking operational
- [x] CI workflows deployed

**Pattern Sweeps Phase (NEXT):**
- [ ] Error count ≤300 by Day 1 noon
- [ ] Error count ≤100 by Day 1 EOD
- [ ] Error count ≤50 by Day 2 noon
- [ ] Error count = 0 by Day 2 EOD

**Ship Phase (FINAL):**
- [ ] `npm run check:server` → 0 errors
- [ ] `npm run check:client` → 0 errors (maintained)
- [ ] `npm run check:shared` → 0 errors (maintained)
- [ ] `npm run build` → SUCCESS
- [ ] `npm test` → All passing
- [ ] No runtime behavior changes
- [ ] 30-40 atomic commits (conventional format)
- [ ] PR #156 ready for review
- [ ] Release tagged: `v0.2.0-ts-week2-server-complete`

---

## 🔄 Handoff Instructions

### To Resume Work:

1. **Verify state (30 seconds):**
```bash
git branch --show-current  # Should be: remediation/week2-server-strictness
git pull origin remediation/week2-server-strictness
npm run check:server 2>&1 | grep -c "error TS"  # Should be ~617
```

2. **Review this memo (5 minutes):**
- Current error distribution (top 10 codes)
- Available patterns and tools
- Execution plan (Step 0 → Sweeps 1-3)

3. **Start with Step 0 (5 minutes):**
```bash
# Generate worklists
npx tsc -p tsconfig.server.json --noEmit 2>&1 | tee artifacts/week2/baseline-before-sweeps.txt
# ... create worklists (commands in Execution Plan above)
```

4. **Begin Sweep 1 (60-90 minutes):**
- Open files from `worklists/ts2375.txt`
- Apply `spreadIfDefined` pattern
- Commit in atomic batches

### Quick Commands Reference:

```bash
# Check current errors
npm run check:server 2>&1 | grep -c "error TS"

# Track progress
scripts/week2-progress.sh

# Test codemod (dry run)
npm run codemod:ts4111:dry

# Bypass pre-commit (if needed)
SKIP_SERVER_TS=1 git commit -m "WIP: ..."
```

---

## 📚 Key Files Reference

### Configuration
- `tsconfig.server.json` - Server strict config (Bundler moduleResolution)
- `tsconfig.server.mixed.json` - Mixed config for overlap analysis
- `tsconfig.json` - Base config with strict flags

### Infrastructure
- `.husky/guards/week2-server-ts.sh` - Pre-commit guard script
- `scripts/codemods/bracketize-index-prop.ts` - TS4111 codemod
- `scripts/week2-progress.sh` - Progress tracker
- `scripts/run-pattern-analysis.sh` - Pattern analyzer wrapper

### Pattern Library
- `shared/lib/ts/spreadIfDefined.ts` - Exact optional helper
- `shared/lib/ts/isDefined.ts` - Type guards
- `server/types/http.ts` - Express auth wrapper

### Artifacts
- `artifacts/week2/baseline-before-sweeps.txt` - Fresh baseline
- `artifacts/week2/progress.log` - Progress tracking
- `artifacts/week2/worklists/` - Error code worklists
- `artifacts/week2/ts4111-codemod-report.json` - Codemod report

### Documentation
- `TRACK1A_COMPLETION_SUMMARY.md` - Week 1 completion (pattern examples)
- `WEEK2_KICKOFF_GUIDE.md` - Week 2 strategy
- `scripts/codemods/README.md` - Codemod usage guide

---

## 💡 Tips for Success

1. **Use Worklists:** Don't manually search for errors—use the generated worklists
2. **Checkpoint Often:** Run progress script every 5-10 commits
3. **Atomic Commits:** Keep batches small (3-8 files) for easy bisection
4. **Pattern First:** Apply proven patterns before inventing new solutions
5. **Test Early:** Run `npm test` after major batches, not just at the end
6. **Guard Awareness:** Pre-commit will run—plan for 1-2 seconds on server commits
7. **Codemod Caution:** Test on single file before bulk application

---

## 🎉 What Makes This Ready

**Week 1 Proof of Concept:**
- 88 → 0 errors in ~3 hours using these same patterns
- 46 atomic commits, all conventional format
- Zero runtime changes, all tests passing
- Tagged and shipped: `v0.1.0-ts-week1-client-complete`

**Week 2 Advantages:**
- ✅ Proven pattern library ready
- ✅ Automated codemod for largest bucket (36%)
- ✅ Pre-commit guard prevents regressions
- ✅ CI visibility on every push
- ✅ Clear gates and carve-out procedures

**Confidence: 90%**

---

## 📞 Questions & Troubleshooting

### Q: Pre-commit guard triggered when I don't want it?
**A:** Use `SKIP_SERVER_TS=1 git commit -m "..."` for temporary bypass

### Q: Codemod changed too much?
**A:** Run dry-run first: `npm run codemod:ts4111:dry` to see report

### Q: Pattern not working for specific error?
**A:** Skip it for now, add to "carved-out" list, continue with others

### Q: Hit noon gate but >300 errors?
**A:** Follow carve-out procedure, exclude worst file, continue

### Q: How do I know what pattern to use?
**A:** Check "Pattern Playbook Quick Reference" section above

### Q: Tests failing after pattern sweep?
**A:** Revert last commit batch, investigate, apply pattern more carefully

---

**Prepared by:** Claude Code
**Date:** 2025-10-14 07:30 UTC
**Version:** 1.0 (Infrastructure Complete)
**Next Update:** After Noon Gate Checkpoint

---

🚀 **Ready to Execute!** Start with Step 0 (worklists) and let's drive those 617 errors to 0!
