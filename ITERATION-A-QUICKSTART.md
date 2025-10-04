# Iteration A: Quick Start Guide

**Status**: ✅ **READY TO EXECUTE**
**Strategy Version**: 3.0 (Final - All corrections applied)
**Start Date**: 2025-10-03
**Target**: 7-10 days

---

## 🎯 What This Delivers

### End of Week 1 (Day 7):
- ✅ **Frozen calculation API** with comprehensive type safety
- ✅ **Fees v1** integrated (management fees with 10-year horizon)
- ✅ **Deterministic graduation engine** (no RNG, predictable results)
- ✅ **Parity validation** against Excel (XIRR/TVPI/DPI tolerances)
- ✅ **Scenario management** (save/load/compare/export via IndexedDB)
- ✅ **CSV exports** (period + company-level data with lineage)
- ✅ **Dev tools** for Excel comparison and debugging

### End of Week 2 (Day 14):
- ✅ **Reserve optimizer** with transparent next-dollar MOIC allocation
- ✅ **Performance gates** in CI with regression detection
- ✅ **Production monitoring** (Prometheus + Grafana)
- ✅ **Error budget/SLO** enforcement (p95 < 800ms, <1% errors)
- ✅ **Brand-consistent UI** with contextual help
- ✅ **Comprehensive documentation** (runbooks + API docs + glossary)

---

## 🚀 Immediate Actions (Today - 30 minutes)

### 1. Review Strategy Corrections

Key simplifications applied:

| **Aspect** | **Decision** | **Impact** |
|------------|-------------|-----------|
| Carry/Waterfall | ❌ **REMOVED** | Eliminates parity complexity |
| Capital Calls | 🔒 **LOCKED** to "upfront" | Deterministic, simple validation |
| Fees | 📉 **Management only** | No fund expense complexity |
| Distribution | ⚡ **Immediate** | exitProceeds = distributions each period |
| Allocations | 💯 **Sum to 100%** | Reserves carved from allocations |
| **Feasibility** | ✅ **5 constraints** | Prevents nonsensical inputs |

**NEW: Feasibility Constraints** (See [docs/policies/feasibility-constraints.md](docs/policies/feasibility-constraints.md)):
1. ✅ Total initial investments ≤ committed capital (after fees)
2. ✅ Average check size ≤ stage allocation (at least 1 company possible)
3. ✅ Minimum 1 company per active stage
4. ✅ Graduation time < exit time
5. ✅ Preliminary reserve capacity check (warning if reserves may be insufficient)

### 2. Verify Environment

```bash
# Check Node version (should be 20.x)
node --version

# Check TypeScript build
npm run build:types

# Check health endpoint readiness
npm run dev:api
# In another terminal:
curl http://localhost:5000/healthz
# Expected: {"status":"ok","timestamp":"..."}
```

### 3. Create GitHub Project (Optional but Recommended)

Create a project board with 7 columns (one per PR):

1. PR #1: Foundation
2. PR #2: CSV & Calc API
3. PR #3: Parity Kit
4. PR #4: Scenarios
5. PR #5: Reserves
6. PR #6: Observability
7. PR #7: UX Polish

---

## 📋 PR Sequence (Copy-Paste Checklist)

### PR #1: Foundation (0.5 day)
**Branch**: `feat/iteration-a-foundation`

**Changes:**
- [x] `.nvmrc` already exists with Node 20
- [ ] Add `/healthz` endpoint to `server/index.ts`
- [ ] Tag demo: `git tag -a release/demo-2025-10-03 -m "Demo baseline"`
- [ ] Update CI to enforce Node version from `.nvmrc`

**Tests:**
```bash
curl http://localhost:5000/healthz
# Expected: {"status":"ok","timestamp":"2025-10-03T...","version":"1.3.2"}
```

---

### PR #2: CSV Exports & Calc API (2 days)
**Branch**: `feat/csv-exports-calc-api`

**New Files:**
- [ ] `shared/schemas/fund-model.ts` - Frozen Zod schemas
- [ ] `client/src/lib/decimal-utils.ts` - Decimal.js configuration + rounding
- [ ] `client/src/lib/fund-calc.ts` - Core calculation engine (stub)
- [ ] `server/routes/calculations.ts` - CSV export endpoints

**Modified Files:**
- [ ] `server/index.ts` - Register calculations routes

**Tests:**
```bash
# Test CSV export endpoint
curl -X POST http://localhost:5000/api/dev/export-forecast \
  -H "Content-Type: application/json" \
  -d '{"inputs":{...},"outputs":{...},"scenarioId":"test"}'
# Expected: CSV file download
```

**Key Implementation Details:**
- Decimal.js precision: 20 digits (internal), round at export
- CSV includes lineage: `engine_version`, `inputs_hash`, `scenario_id`
- Management fees stop after `managementFeeYears` (default 10)
- TVPI = (distributions + NAV) / contributions
- DPI = distributions / contributions

---

### PR #3: Parity Kit & Golden Fixtures (1.5 days)
**Branch**: `test/parity-kit`

**New Files:**
- [ ] `tests/fixtures/golden/simple.json` - Single stage, no follow-ons
- [ ] `tests/fixtures/golden/multi-stage.json` - Multi-stage progression
- [ ] `tests/fixtures/golden/reserve-tight.json` - Reserve depletion
- [ ] `tests/fixtures/golden/high-fee.json` - High management fees
- [ ] `tests/fixtures/golden/late-exit.json` - Extended exit timing
- [ ] `tests/parity/parity.test.ts` - Parity test suite
- [ ] `tests/invariants/accounting.test.ts` - Invariant tests
- [ ] `client/src/pages/dev/ExcelCompare.tsx` - Dev-only compare page
- [ ] `scripts/generate-golden-fixtures.ts` - Fixture generator

**Invariants to Test:**
1. NAV accounting identity (all periods)
2. NAV never negative
3. Cash balance never negative ⭐ (critical)
4. Total called ≤ committed capital ⭐ (critical)
5. Company proceeds sum = total distributions
6. Total invested ≤ deployable capital
7. TVPI calculation correct
8. DPI calculation correct

**Parity Tolerances:**
- TVPI: ≤ 0.0001 (1 basis point)
- DPI: ≤ 0.0001 (1 basis point)
- IRR: ≤ 0.0005 (5 basis points)
- NAV: ≤ $0.01 (1 cent)

---

### PR #4: Scenario Management (1.5 days)
**Branch**: `feat/scenario-management`

**New Files:**
- [ ] `client/src/components/ScenarioToolbar.tsx`
- [ ] `client/src/pages/ScenarioCompare.tsx`
- [ ] `client/src/lib/feature-flags.ts`
- [ ] `client/src/hooks/useScenarios.ts` - IndexedDB persistence

**Modified Files:**
- [ ] `client/src/pages/fund-setup.tsx` - Add scenario toolbar
- [ ] `client/src/lib/store.ts` - Add scenario state with Zustand persist

**Features:**
- Save scenario (name + inputs to IndexedDB)
- Duplicate scenario
- Export to CSV (both forecast + company ledger)
- Import from CSV
- Compare view (side-by-side KPI deltas)
- Feature flags panel (`?labs=1` shows toggle for DETERMINISTIC_ONLY)

---

### PR #5: Reserve Optimizer v1 (2 days)
**Branch**: `feat/reserve-optimizer`

**New Files:**
- [ ] `client/src/core/reserves/optimizer.ts` - Next-dollar MOIC allocator
- [ ] `client/src/components/ReserveAllocationTable.tsx`
- [ ] `tests/core/reserves/optimizer.test.ts` - Invariant tests

**Optimizer Config:**
```typescript
interface OptimizerConfig {
  fundSize: number;            // Required for position cap
  reservePool: number;         // Total reserve pool
  positionCapPct: number;      // Max follow-on as % of fund
  ownershipTargetPct?: number; // Optional (deferred to Iteration B)
}
```

**Caps Applied:**
1. Max follow-on cap (3x initial investment)
2. Position cap (% of fund size)
3. Ownership cap (optional, approximate)
4. Pool exhausted

**Invariants:**
- Allocations sum to reserve pool
- All allocations ≥ 0
- Sorted by next-dollar MOIC (descending)
- Each row includes rationale string

---

### PR #6: Performance Gates & Observability (1.5 days)
**Branch**: `chore/perf-gates-observability`

**New Files:**
- [ ] `testdata/bench-standard.json` - Canonical benchmark fixture
- [ ] `tests/benchmarks/engine.bench.ts` - Vitest benchmark suite
- [ ] `scripts/check-perf-regression.mjs` - CI performance gate
- [ ] `perf/baseline.json` - Performance baseline (generated)
- [ ] `grafana/dashboards/fund-calculator.json` - Metrics dashboard
- [ ] `.github/workflows/performance-gate.yml` - CI workflow
- [ ] `docs/slo.md` - SLO documentation

**Modified Files:**
- [ ] `server/observability/metrics.ts` - Add new Prometheus metrics

**Prometheus Metrics:**
```
fund_engine_run_seconds_bucket (histogram)
fund_engine_run_errors_total (counter)
reserve_optimizer_run_seconds_bucket (histogram)
scenario_save_latency_seconds_bucket (histogram)
```

**SLO:**
- Engine p95 < 800ms (canonical fixture: 100 companies, 40 quarters)
- Error rate < 1% (7-day rolling)
- Max regression: 15% vs baseline

---

### PR #7: Brand & UX Polish (1.5 days)
**Branch**: `chore/brand-ux-polish`

**New Files:**
- [ ] `client/src/components/HelpPopover.tsx` - Contextual help component
- [ ] `docs/runbooks/deterministic-vs-monte-carlo.md`
- [ ] `docs/glossary.md` - Terms: TVPI, DPI, IRR, next-dollar MOIC

**Modified Files:**
- [ ] `client/src/components/wizard/` - Apply brand tokens
- [ ] `tailwind.config.ts` - Verify brand token system
- [ ] Chart components - Consistent color scheme

**Help Popovers:**
- "What is deterministic modeling?"
- "What is Monte Carlo?" (future feature)
- "Next-dollar MOIC explained"
- "Reserve allocation rationale"

---

## 📚 Complete Documentation

### Core Docs Created:
- ✅ `docs/iterations/iteration-a-implementation-guide.md` - Full implementation guide
- ✅ `docs/rounding-policy.md` - Decimal precision & export rounding
- ✅ `docs/policies/distribution-policy.md` - Distribution timing (Policy A)
- ✅ `docs/policies/allocation-policy.md` - Stage vs reserve allocations (Pattern 1)
- ✅ `docs/iterations/iteration-a-dod.md` - Definition of Done checklist
- ✅ `ITERATION-A-QUICKSTART.md` - This file!

### Docs to Create During Implementation:
- [ ] `docs/api/fund-calc.md` - API contract documentation
- [ ] `docs/runbooks/parity-testing.md` - Parity workflow
- [ ] `docs/runbooks/deterministic-vs-monte-carlo.md` - Decision guide
- [ ] `docs/glossary.md` - Term definitions
- [ ] `docs/slo.md` - Service level objectives

---

## 🔧 Key Files Reference

### Schemas (Frozen API)
- `shared/schemas/fund-model.ts` - **FROZEN** inputs/outputs

### Core Calculation
- `client/src/lib/fund-calc.ts` - Main engine entry point
- `client/src/lib/decimal-utils.ts` - Precision utilities
- `client/src/lib/xirr.ts` - IRR calculation (Newton + bisection fallback)

### CSV Export
- `server/routes/calculations.ts` - Export endpoints
- Forecast CSV: `engine_version, inputs_hash, scenario_id, period_index, ...`
- Company CSV: `engine_version, inputs_hash, scenario_id, company_id, ...`

### Testing
- `tests/fixtures/golden/` - Golden snapshot files
- `tests/parity/parity.test.ts` - Excel parity validation
- `tests/invariants/accounting.test.ts` - 8 critical invariants
- `tests/benchmarks/engine.bench.ts` - Performance tests

---

## ✅ Definition of Done (Master Checklist)

### Foundation
- [ ] `/healthz` endpoint returns 200
- [ ] Node version locked to 20.x in `.nvmrc`
- [ ] CI enforces Node version
- [ ] Demo tag created: `release/demo-2025-10-03`

### Schemas & API
- [ ] **NO carry/waterfall** in code or schemas
- [ ] **Capital call mode** locked to "upfront"
- [ ] **Fees v1** (management only, with 10-year horizon)
- [ ] API surface frozen with Zod schemas
- [ ] 100% type coverage on calc surface

### Invariants & Math
- [ ] Decimal.js configured (20-digit precision)
- [ ] 8 invariants pass in CI (including cash balance ⭐)
- [ ] Rounding policy documented
- [ ] All comparisons use unrounded internal values

### Parity
- [ ] 5+ golden fixtures covering edge cases
- [ ] TVPI/DPI/IRR within tolerances
- [ ] Excel compare page at `/dev/excel-compare`
- [ ] CI runs `npm run test:parity`

### Scenarios
- [ ] IndexedDB persistence working
- [ ] Save/load/duplicate/export/import
- [ ] CSV round-trip idempotent
- [ ] Compare view shows deltas

### Reserves
- [ ] Next-dollar MOIC allocator implemented
- [ ] Position cap + max follow-on cap enforced
- [ ] Invariants pass (sum, non-negative, sorted, rationale)
- [ ] UI table with explainability

### Observability
- [ ] Benchmark suite with canonical fixture
- [ ] CI performance gate (15% regression limit)
- [ ] Prometheus metrics emitted
- [ ] Grafana dashboard created
- [ ] SLO documented

### UX
- [ ] Brand tokens applied
- [ ] Help popovers for complex terms
- [ ] Visual regression tests pass
- [ ] Runbooks completed

---

## 🎉 Success Criteria

After Iteration A, you will have:

1. **Mathematically Sound Foundation**
   - Deterministic calculations with proven Excel parity
   - 8 invariants preventing "phantom money" and logic errors
   - Decimal precision eliminating floating-point errors

2. **Production-Ready Infrastructure**
   - Performance gates catching regressions
   - Comprehensive monitoring (Prometheus + Grafana)
   - CI/CD enforcing quality standards

3. **User-Facing Value**
   - Save/compare scenarios with full traceability
   - CSV export for Excel integration
   - Reserve optimizer with transparent rationale

4. **Team-Ready Artifacts**
   - Frozen API contracts for stable integration
   - Comprehensive documentation and runbooks
   - Glossary eliminating terminology confusion

---

## 📞 Questions or Issues?

Refer to:
- **Full implementation**: `docs/iterations/iteration-a-implementation-guide.md`
- **Policies**: `docs/policies/` directory
- **API docs**: `docs/api/fund-calc.md` (after PR #2)
- **Runbooks**: `docs/runbooks/` directory

---

**Ready to start? Begin with PR #1 (Foundation) - estimated 0.5 day.**

```bash
# Start PR #1
git checkout -b feat/iteration-a-foundation
# Follow checklist above
```
