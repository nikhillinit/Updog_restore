---
status: HISTORICAL
last_updated: 2026-04-20
---

# Phase 1 Foundations Integration - Executive Summary

**Status**: Ready for Implementation **Timeline**: 20 minutes integration → Demo
tomorrow **Risk Level**: Low (All changes feature-flagged, fully reversible)

> Current state note (2026-04-20): this document captures a historical
> integration plan. Active front-end route metadata no longer carries the legacy
> investments-family redirects, so any mentions below of soft redirects or
> legacy front-end compatibility should be read as historical plan context, not
> the current runtime contract.

---

## What Matches 1:1 (Green Lights)

### **5-Route IA Consolidation**

- **Starter Kit**: `Overview · Portfolio · Model · Operate · Report`
- **Your Recommendation**: Exact match
- **Source of Truth**: `docs/ia-consolidation-strategy.md`
- **Historical Redirect Plan**: Earlier drafts mapped legacy front-end routes in
  `src/core/routes/ia.ts`; current active client metadata keeps the legacy
  investments-family routes retired instead of redirecting them

### **KPI Endpoint Naming**

- **Starter Kit**: `GET /api/funds/:fundId/kpis`
- **Your Selector Contract**: Exact match
- **Decision**: Cards bound ONLY to this contract (no drift)

### **Reserve Engine Integration**

- **Starter Kit**: `POST /api/reserve-optimization` with rationale + constraints
- **Your DeterministicReserveEngine**: Slots right into existing call-site
- **Implementation**: Ready for handshake in Model → Reserves tab

### **Feature Flag Strategy**

- **Starter Kit**: 5 simple ENV flags
- **Your System**: 28 flags with dependency graph (Foundation/Build/Polish)
- **Decision**: Thin adapter layer (`flagAdapter.ts`) unifies both systems

### **Brand Tokens**

- **Starter Kit**: Inter/Poppins + neutral palette (#292929, #F2F2F2, #E0D8D1)
- **Your Guidelines**: Exact match
- **Implementation**: CSS variables, Tailwind-friendly

---

## Small Deltas Normalized

### **1. KPI Payload Shape: Facts vs. Metrics**

**The Issue**:

- Starter kit expects raw facts (calls, distributions, NAV points)
- Comprehensive contract includes fee-basis and recycling logic

**Decision**:

- API returns **raw facts ONLY** (plus `asOf`)
- Selectors compute KPIs client-side (pure functions)
- If server-computed KPIs needed later: separate endpoint `GET .../kpis/summary`
- **Never feed header cards from summary** (prevents drift)

**Implementation**:

```typescript
// API Response (raw facts):
{
  fundId: "...",
  asOf: "2025-10-03",
  committed: 100000000,
  capitalCalls: [{ date: "...", amount: 35000000 }],
  distributions: [{ date: "...", amount: 5000000 }],
  navSeries: [{ date: "...", value: 40000000 }],
  investments: [...]
}

// Client-side computation:
const kpis = selectFundKpis(rawFacts); // → { dpi, tvpi, irr, ... }
```

**File**: `shared/contracts/kpi-raw-facts.contract.ts` (NEW)

---

### **2. Recycling/Waterfall in MVP**

**The Issue**:

- Comprehensive contract is recycling-aware and models waterfall
- MVP favors no recycling, simplified carry

**Decision**:

- Ship recycling/waterfall fields **behind feature flags**
- Default OFF until Model wizard Steps 5-6 are live
- Contract stays future-proof without changing near-term numbers

**Implementation**:

```typescript
// In selectors:
const includeRecycling = FLAGS.enable_wizard_step_recycling;
const includeWaterfall = FLAGS.enable_wizard_step_waterfall;

// Recycling calculation (gated):
if (includeRecycling) {
  paidInCapital = called - recycledRoC;
} else {
  paidInCapital = called; // Simplified
}
```

**Flags**:

- `enable_wizard_step_recycling` (default: `false`)
- `enable_wizard_step_waterfall` (default: `false`)

---

### **3. Flag System Unification**

**The Issue**:

- Starter kit: 5 ENV flags (`VITE_NEW_IA`, etc.)
- Comprehensive system: 28 flags with dependencies

**Decision**:

- Keep `shared/feature-flags/flag-definitions.ts` as **single source**
- Map ENV flags to comprehensive system via **one-line adapter**

**Implementation**:

```typescript
// client/src/core/flags/flagAdapter.ts
export const FLAGS = {
  NEW_IA: useFeatureFlag('enable_new_ia'),
  ENABLE_SELECTOR_KPIS: useFeatureFlag('enable_kpi_selectors'),
  // ... proxies to comprehensive system
};
```

**File**: `client/src/core/flags/flagAdapter.ts` (NEW)

---

### **4. Paths & Aliases**

**The Issue**:

- Comprehensive contracts: `@shared/contracts/*`
- Starter kit: `@core/*`

**Decision**:

- Add `@core` alias (points to `client/src/core`)
- Import contracts via `@shared/contracts/*`
- No code churn elsewhere

**Implementation**:

```typescript
// vite.config.ts
resolve: {
  alias: {
    '@': path.resolve(__dirname, './client/src'),
    '@shared': path.resolve(__dirname, './shared'),
    '@core': path.resolve(__dirname, './client/src/core'), // ADD
  },
},
```

---

## Concrete Merge Plan (Fast, Safe, Reversible)

### **Step 1: Freeze Contract & Selectors** (TODAY - 10 min)

Completed:

- [x] `shared/contracts/kpi-raw-facts.contract.ts` - Raw facts API contract
- [x] `client/src/adapters/kpiAdapter.ts` - Zod → Selector adapter
- [x] Selectors from starter kit: `selectFundKpis()`

**Next**:

- [ ] Wire Overview header cards to `selectFundKpis`
- [ ] Render `asOf` date in UI
- [ ] Mount under existing `FundProvider`

---

### **Step 2: Adopt Flag System** (TODAY - 5 min)

Completed:

- [x] `client/src/core/flags/flagAdapter.ts` - ENV → Comprehensive mapping

**Next**:

- [ ] Replace starter kit ENV flags with `useFeatureFlag()`
- [ ] Gate routes: `enable_new_ia`, `enable_kpi_selectors`,
      `enable_cap_table_tabs`
- [ ] Keep hard redirects OFF (start with soft banners)

---

### **Step 3: IA Consolidation** (1-2 dev-days)

**Historical Planned Routes** (from starter kit `ia.ts`):

```typescript
legacy investment list route  → /portfolio
legacy investment table route → /portfolio
/financial-modeling → /model
/forecasting        → /model
/cash-management    → /operate
/cap-table/:id      → /portfolio/:id?tab=cap-table
```

**Implementation**:

- [ ] Update sidebar to 5 items only
- [ ] Historical option: add soft deprecation banners
- [ ] Current policy on `main`: keep the legacy investments-family routes out of
      active front-end route metadata

**Rationale**: User message explicitly endorsed this mapping.

---

### **Step 4: Reserve Engine Handshake** (1 dev-day)

**Current State**: App already has reserve optimization call-site

**Changes**:

- [ ] Point to `POST /api/reserve-optimization` (from
      `reserve-engine.contract.ts`)
- [ ] Surface "rationale" strings in Model → Reserves tab
- [ ] Add to Insights later (matches "Optimal Reserves Ranking" UX)

**Feature Flag**: `enable_reserve_engine`

---

### **Step 5: Brand & Density Pass** (half-day)

Starter Kit Provides:

- [x] `brand-tokens.css` - Inter/Poppins, neutral palette
- [x] Responsive KPI grid

**Tasks**:

- [ ] Import in `client/src/main.tsx`
- [ ] Tighten KPI band spacing
- [ ] Increase table density (matches Press On Ventures guide)

---

### **Step 6: Tests First** (ongoing)

**Critical Fixtures** (already created):

1. **Fee Basis Transition** - `committed` → `NAV` switch
2. **Recycling Impact** - Denominator handling in DPI/TVPI
3. **Waterfall Catch-up** - GP carry clawback logic

**Implementation**:

- [ ] Run fixtures against selectors (NOT components)
- [ ] Add "construction vs current" snapshot check
- [ ] Prevent number divergence when actuals introduced

**Command**: `npm test -- kpi-critical-fixtures`

---

## Minor Watch-Outs (Not Blockers)

### **1. "God Provider" Risk** Moderate

**Issue**: `FundProvider` could bloat **Solution**:

- Server state → TanStack Query
- Computations → Pure selectors
- Provider stays thin (auth/selection only)

### **2. ManualChunks** Moderate

**Issue**: Heavy wizard UI could slow Overview/Portfolio **Solution**:

- Vite config already splits chart/vendor/utils
- Code-split wizard behind `enable_modeling_wizard`
- Keep Overview instant

### **3. Wording & Flows** Low

**Issue**: Fee basis terminology must match industry standards **Solution**:

- When exposing Fees & Expenses later, mirror Tactyc methods:
  - Committed, Called, Net Cumulative, Invested, FMV
- Prevents user confusion
- Matches how seasoned tools teach the model

---

## What This Delivers

### **Immediate (Demo Tomorrow)**

PASS: Single KPI contract feeding header (no placeholders) PASS: Demo-ready with
REAL data PASS: Brand-consistent UI (Inter/Poppins, neutral palette) PASS:
Feature-flagged (instant rollback if needed)

### **Week 1-2 (Post-Demo)**

PASS: Deterministic reserves flow (API handshake) PASS: 5-route IA with soft
redirects PASS: Denser tables, tighter spacing PASS: Testable, selector-first
architecture

### **Week 3-6 (Phase 1 Complete)**

PASS: Fee basis variants layered in PASS: Recycling denominator handling PASS:
Waterfall calculation logic PASS: E2E test coverage (Playwright)

---

## PR Ready - Final Checklist

**Integration Ready**:

- [x] Adapter layer created: `mapKpiResponseToSelectorInput()`
- [x] Flag system unified: `flagAdapter.ts`
- [x] Raw facts contract: `kpi-raw-facts.contract.ts`
- [x] IA routes mapped: `ia.ts`
- [x] Brand tokens ready: `brand-tokens.css`

**Documentation**:

- [x] Integration checklist: `docs/INTEGRATION_PR_CHECKLIST.md`
- [x] Executive summary: `docs/PHASE1_INTEGRATION_SUMMARY.md`
- [x] IA strategy: `docs/ia-consolidation-strategy.md`

**Testing Artifacts**:

- [x] Critical fixtures: `tests/fixtures/kpi-critical-fixtures.ts`
- [x] Selector tests: Starter kit includes Vitest suite
- [ ] TODO: Fixture integration tests

---

## Response to Your Offer

> "If you want, I can prep a small PR that swaps in your flag system, binds the
> KPI header to your contract, applies the IA redirects, and stubs the reserve
> call while leaving the tab behind a flag."

**YES - We are ready for that PR!**

All the groundwork is complete:

1. PASS: Flag system adapter ready
2. PASS: KPI contract finalized (raw facts only)
3. PASS: IA redirects mapped
4. PASS: Reserve engine contract ready

**Suggested PR Structure**:

```
feat/phase1-foundations
├── Copy starter kit files (core/, components/, styles/)
├── Add adapters (kpiAdapter, flagAdapter)
├── Update vite.config.ts (add @core alias)
├── Wire KPI header to useFundKpis hook
├── Keep removed front-end routes out of active metadata
├── Import brand tokens in main.tsx
└── Update .env.example with flag documentation
```

**Time Estimate**: 30 minutes to review and merge

---

## Multi-AI Consensus Validation

**All agents (GEMINI, OPENAI, DEEPSEEK) unanimously recommend**:

- PASS: Adopt starter kit NOW (Option A)
- PASS: Layer comprehensive contracts incrementally
- PASS: Use Strangler Fig pattern (new wraps old)
- PASS: Feature flags control cutover
- PASS: This is NOT migration—it is INTEGRATION

**Key Quote** (GEMINI Architecture Analysis):

> "The two pieces are complementary: Starter Kit provides View + Controller;
> Your Contracts provide Model + Validation. This is a natural separation of
> concerns."

---

## Alignment with Modeling Standards

**Industry References** (per your guidance):

- PASS: Wizard steps mirror Tactyc construction flow
- PASS: Fee basis methods match VC industry standards
- PASS: "Construction vs Current" views supported
- PASS: MOIC analysis integrated
- PASS: Optimal reserves ranking (rationale strings)

**No conflicts** - Starter kit is a **subset** that scales into comprehensive
system.

---

## Final Sign-Off

**Executive Decision**:

- [x] Adopt starter kit immediately
- [x] All deltas normalized (facts vs metrics, recycling gated, flags unified)
- [x] Integration plan approved (6 steps, reversible)
- [x] PR structure defined
- [x] Testing strategy in place

**Risk Assessment**: **LOW**

- All changes feature-flagged
- Instant rollback available
- Zero breaking changes
- Comprehensive testing planned

**Timeline**: **DEMO READY TOMORROW**

---

**Ready to proceed with PR creation?** All artifacts are in place. Just need
final execution of the 6-step merge plan.
