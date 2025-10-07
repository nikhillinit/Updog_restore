# Wizard Implementation Handoff Memo

**Date:** October 7, 2025
**Session Duration:** ~5 hours
**Branch:** `chore/deps-safe-batch-oct07`
**Status:** In Progress - 3/7 wizard steps complete

---

## 🎯 Mission

Integrate a comprehensive 7-step fund setup wizard into the Updog venture capital modeling platform. The wizard guides GPs through building fund models with detailed financial projections, sector profiles, capital allocations, and scenario analysis.

---

## ✅ Completed Work

### **1. Fund Financials Step (COMPLETE)**

**Location:** `client/src/components/modeling-wizard/steps/FundFinancialsStep.tsx`

**Features Implemented:**
- ✅ Multiple granular expense tracking with add/remove (up to 20 expenses)
  - Component: `fund-financials/ExpenseList.tsx`
  - Types: One-time, Annual
  - Fields: Name, Amount ($M), Type, Year, Description

- ✅ Capital Call Schedule with visual bar chart
  - Component: `fund-financials/CapitalCallSchedule.tsx`
  - Types: Even, Front-Loaded, Back-Loaded, Custom
  - Real-time validation (custom must sum to 100%)
  - Visual deployment curve preview

- ✅ Enhanced capital calculations
  - File: `client/src/lib/capital-calculations.ts`
  - `getSchedulePattern()` - Generates deployment patterns
  - `calculateProjections()` - Applies schedules to 10-year projections
  - Annual granularity (not quarterly)

- ✅ Updated projection table
  - Shows additional expenses in net capital calculation
  - Expense breakdown detail section
  - Distinguishes one-time vs annual

**Schema:** `client/src/schemas/modeling-wizard.schemas.ts:395-574`
- `expenseItemSchema`
- `capitalCallScheduleSchema`
- `fundFinancialsSchema`

**Tests:** `client/src/lib/__tests__/capital-calculations.test.ts`
- All schedule patterns tested (even, front-loaded, back-loaded, custom)
- GP commitment calculations
- Management fee step-down
- Net investable capital validation
- ✅ **All tests passing**

---

### **2. Sector Profiles Step (COMPLETE)**

**Location:** `client/src/components/modeling-wizard/steps/SectorProfilesStep.tsx`

**Features Implemented:**
- ✅ Investment stage cohorts (Pre-Seed → Series E+)
  - Component: `sector-profiles/InvestmentStageForm.tsx`
  - Metrics per stage:
    - Round Size ($M)
    - Valuation ($M)
    - ESOP (%)
    - Graduation Rate (%)
    - Exit Rate (%)
    - Failure Rate (%) - auto-calculated
    - Exit Valuation ($M)
    - Months to Graduate
    - Months to Exit

- ✅ Sector profile management
  - Component: `sector-profiles/SectorProfileCard.tsx`
  - Up to 10 sector profiles
  - Allocation percentages (must sum to 100%)
  - Nested stage cohorts per sector
  - Collapsible design

- ✅ Comprehensive validation
  - Graduation + Exit ≤ 100%
  - Final stage must have 0% graduation
  - Sector allocations sum to 100%
  - Warning for incomplete projections

**Schema:** `client/src/schemas/modeling-wizard.schemas.ts:175-346`
- `investmentStageEnum` (7 stages)
- `investmentStageCohortSchema`
- `sectorProfileSchema`
- `sectorProfilesSchema`

**Educational Features:**
- Info alerts about common pitfalls
- Inline validation with visual feedback
- Tooltips explaining metrics

---

## 🔧 Technical Infrastructure

### **Files Created (26 total)**

**Fund Financials (3 files):**
1. `client/src/components/modeling-wizard/steps/fund-financials/ExpenseList.tsx`
2. `client/src/components/modeling-wizard/steps/fund-financials/CapitalCallSchedule.tsx`
3. `client/src/lib/__tests__/capital-calculations.test.ts`

**Sector Profiles (2 files):**
4. `client/src/components/modeling-wizard/steps/sector-profiles/InvestmentStageForm.tsx`
5. `client/src/components/modeling-wizard/steps/sector-profiles/SectorProfileCard.tsx`

**Capital Allocations (16 files):**
6. `client/src/components/modeling-wizard/steps/capital-allocation/InitialInvestmentSection.tsx`
7. `client/src/components/modeling-wizard/steps/capital-allocation/FollowOnStrategyTable.tsx`
8. `client/src/components/modeling-wizard/steps/capital-allocation/PacingHorizonBuilder.tsx`
9. `client/src/components/modeling-wizard/steps/capital-allocation/CalculationSummaryCard.tsx`
10. `client/src/components/modeling-wizard/steps/capital-allocation/AllocationsTable.tsx`
11. `client/src/components/modeling-wizard/steps/capital-allocation/CapitalHeader.tsx`
12. `client/src/components/modeling-wizard/steps/capital-allocation/CompanyDialog.tsx`
13. `client/src/components/modeling-wizard/steps/capital-allocation/PortfolioConfigForm.tsx`
14. `client/src/components/modeling-wizard/steps/capital-allocation/PortfolioSummary.tsx`
15. `client/src/components/modeling-wizard/steps/capital-allocation/PortfolioTable.tsx`
16. `client/src/components/modeling-wizard/steps/capital-allocation/ReserveMetricsDisplay.tsx`
17. `client/src/components/modeling-wizard/steps/capital-allocation/ValidationDisplay.tsx`
18. `client/src/components/modeling-wizard/steps/capital-allocation/index.ts`
19. `client/src/components/modeling-wizard/steps/capital-allocation/README.md`
20. `client/src/lib/capital-allocation-calculations.ts`
21. `client/src/lib/__tests__/capital-allocation-calculations.test.ts`
22. `client/src/hooks/useCapitalAllocationCalculations.ts`

**Scenario Analysis Support (5 files):**
23. `shared/types/scenario.ts`
24. `shared/utils/scenario-math.ts`
25. `server/migrations/20251007_add_scenarios.up.sql`
26. `server/migrations/20251007_add_scenarios.down.sql`
27. `docs/SCENARIO_ANALYSIS_STABILITY_REVIEW.md`

### **Files Modified (5 total)**

1. `client/src/schemas/modeling-wizard.schemas.ts` - Enhanced with all new schemas (3 steps)
2. `client/src/lib/capital-calculations.ts` - Added schedule pattern logic
3. `client/src/components/modeling-wizard/steps/FundFinancialsStep.tsx` - Integrated new features
4. `client/src/components/modeling-wizard/steps/fund-financials/ProjectionTable.tsx` - Added expense display
5. `client/src/components/modeling-wizard/steps/index.ts` - Export all steps

### **Test Results**
- ✅ TypeScript: Clean
- ✅ Tests: 584 passing (including 25+ capital allocation calculation tests)
- ⚠️ 26 database integration tests failing (pre-existing, unrelated)
- ✅ Codex Review Agent: All files passing
- ✅ All wizard step integration tests passing

---

### **3. Capital Allocations Step (COMPLETE)**

**Location:** `client/src/components/modeling-wizard/steps/CapitalAllocationStep.tsx`

**Features Implemented:**
- ✅ Initial investment strategy
  - Component: `capital-allocation/InitialInvestmentSection.tsx`
  - Entry modes: Amount-based / Ownership-based
  - Real-time calculations: Implied ownership, number of deals, capital allocated
  - Validation: Check size limits, ownership feasibility

- ✅ Follow-on strategy per stage
  - Component: `capital-allocation/FollowOnStrategyTable.tsx`
  - Per-stage configuration: Maintain ownership %, participation %, follow-on amounts
  - Graduation flow: Companies advancing through stages
  - Real-time metrics: Graduates count, follow-on investments, capital allocated

- ✅ Investment pacing horizon
  - Component: `capital-allocation/PacingHorizonBuilder.tsx`
  - Dynamic period management (add/remove)
  - Deployment curves: Linear, front-loaded, back-loaded
  - Validation: Periods must sum to 100%
  - Visual date range display

- ✅ Real-time calculations & validation
  - Hook: `useCapitalAllocationCalculations`
  - Component: `capital-allocation/CalculationSummaryCard.tsx`
  - Comprehensive validation (errors + warnings)
  - Summary metrics: Total deployed, reserve utilization, portfolio size

- ✅ Engine integration
  - Integration with `DeterministicReserveEngine`
  - Mass-balance preservation across cohorts
  - Fractional company counts support
  - Decimal.js precision for all financial calculations

**Calculation Library:** `client/src/lib/capital-allocation-calculations.ts`
- `calculateInitialInvestments()` - Entry strategy calculations
- `calculateFollowOnAllocations()` - Stage-by-stage follow-on cascade
- `calculatePacingSchedule()` - Deployment timing with curve fitting
- `validateCapitalAllocation()` - Cross-field validation
- 25+ test cases with full coverage

**Schema:** `client/src/schemas/modeling-wizard.schemas.ts`
- `capitalAllocationSchema` - Complete validation
- `stageAllocationSchema` - Per-stage follow-on configs
- `pacingPeriodSchema` - Time-based deployment
- Cross-field validation (totals, overlaps, constraints)

**Tests:** `client/src/lib/__tests__/capital-allocation-calculations.test.ts`
- ✅ Initial investment calculations (all modes)
- ✅ Follow-on cascade with graduation flow
- ✅ Pacing schedule generation (all curves)
- ✅ Validation logic (errors and warnings)
- ✅ Integration with engine

**Technical Solution:**
Dynamic capital distribution achieved through:
- Initial check size determines initial pool allocation
- Graduation rates drive follow-on pool requirements
- Follow-on participation rates control reserve deployment
- Stage-specific check sizes with ownership maintenance
- Real-time balance validation across all allocations

---

## 🚧 Next Steps (Remaining Work)

---

### **4. Fees & Expenses Step (NOT STARTED - NEXT PRIORITY)**

**Priority:** HIGH
**Status:** Basic implementation exists, needs comprehensive review and enhancement

**File:** `client/src/components/modeling-wizard/steps/FeesExpensesStep.tsx`
**Schema:** `client/src/schemas/modeling-wizard.schemas.ts:304-393`

**Review Needed:**
- Verify completeness vs. requirements
- Check if management fee basis (committed/called/FMV) is implemented
- Ensure step-down validation is working
- Add real-time fee calculations display
- Integration with FeeProfile schema from production schemas

---

### **5. Exit & Recycling Step**

**Status:** NOT STARTED
**File:** Would be `client/src/components/modeling-wizard/steps/ExitRecyclingStep.tsx`
**Schema:** `client/src/schemas/modeling-wizard.schemas.ts:575-641` (exists)

**Needs:**
- Enable/disable toggle
- Recycling cap (%)
- Recycling period (years)
- Exit recycling rate (%)
- Management fee recycling rate (%)

---

### **6. Waterfall Step**

**Status:** NOT STARTED
**File:** Would be `client/src/components/modeling-wizard/steps/WaterfallStep.tsx`
**Schema:** `client/src/schemas/modeling-wizard.schemas.ts:642-735` (exists)

**Important Context:**
The codebase has centralized waterfall logic in `client/src/lib/waterfall.ts`:
- `applyWaterfallChange()` - Field updates with validation
- `changeWaterfallType()` - Type switching (AMERICAN ↔ EUROPEAN)
- Must use these helpers for all waterfall updates

**Needs:**
- Waterfall type selector (American, European, Hybrid)
- Preferred return (hurdle) input
- Catch-up percentage
- Carried interest percentage
- Optional tiered carry structure

---

### **7. Scenarios Step**

**Status:** NOT STARTED
**File:** Would be `client/src/components/modeling-wizard/steps/ScenariosStep.tsx`
**Schema:** `client/src/schemas/modeling-wizard.schemas.ts` (check if exists)

**Context:**
There are scenario-related files in the codebase:
- `shared/types/scenario.ts`
- `shared/utils/scenario-math.ts`
- `server/routes/scenario-analysis.ts`
- `server/migrations/20251007_add_scenarios.up.sql`

**Needs research to understand:**
- What scenarios are being defined here
- How they differ from the broader "Scenario Analysis" feature mentioned in planning docs
- Integration points

---

## 🎨 Design Patterns Established

### **Component Structure:**
```
StepComponent.tsx (main step)
├── step-name/
│   ├── SubComponent1.tsx (specific feature)
│   ├── SubComponent2.tsx (specific feature)
│   └── SharedComponent.tsx (shared UI)
```

### **Validation Pattern:**
1. Zod schema with `.superRefine()` for complex rules
2. Real-time validation in components
3. Visual feedback (alerts, color coding)
4. Auto-save on valid form changes

### **State Management:**
- React Hook Form for form state
- Zod resolver for validation
- `watch()` for reactive calculations
- Auto-save via `useEffect` subscription

### **Styling Tokens:**
- **Fonts:** Inter (headings), Poppins (body)
- **Colors:**
  - `pov-charcoal` - primary text
  - `charcoal-50/100/200/600/700` - grays
  - `pov-teal` - accent/success
  - `error` - validation errors
- **Spacing:** Generous padding, 6-8 space-y between sections

---

## 🤖 Development Environment

### **AI Agents Running:**
- **Codex Review Agent:** Real-time code review (still running in background)
  - Command: `npm run review:watch`
  - Bash ID: `600a1f`
  - Status: ✅ All files passing review

### **Testing Commands:**
```bash
# Type checking
npm run check

# Run all tests
npm test

# Run specific test file
npm run test -- path/to/test.test.ts --run

# Run with UI
npm run test:ui
```

### **Development:**
```bash
# Full dev environment
npm run dev

# Frontend only
npm run dev:client

# Backend only
npm run dev:api
```

---

## 📋 Important Constraints & Guidelines

### **From CLAUDE.md:**

1. **Waterfall Updates:** MUST use centralized helpers in `client/src/lib/waterfall.ts`
   - `applyWaterfallChange()` for field updates
   - `changeWaterfallType()` for type switching

2. **Path Aliases:**
   - `@/` → `client/src/`
   - `@shared/` → `shared/`
   - `@assets/` → `assets/`

3. **Windows Development:**
   - All npm commands from PowerShell/CMD (NOT Git Bash/WSL)
   - Sidecar architecture for tool resolution
   - Health check: `npm run doctor`

4. **Testing:**
   - Tests alongside source files
   - Comprehensive coverage with Vitest
   - Pattern: describe blocks for features, it blocks for specs

5. **Code Quality:**
   - TypeScript strict mode
   - ESLint with auto-fix
   - No unused imports/variables

---

## 💡 Key Insights for Next Developer

### **What Went Well:**
1. **Modular component design** - Easy to add features without touching main step file
2. **Schema-first approach** - Validation catches issues early
3. **Real-time calculations** - Users see impact immediately
4. **Comprehensive tests** - Capital calculations fully covered

### **Watch Out For:**
1. **Type narrowing** - Zod inferred types can be tricky with optional fields
2. **Auto-save** - Make sure to unsubscribe in useEffect cleanup
3. **Collapsible sections** - State management for open/close can conflict with form state
4. **Number inputs** - Always use `valueAsNumber` with React Hook Form

### **Performance Considerations:**
1. **useMemo** for expensive calculations (we did this for projections)
2. **Debouncing** not needed with React Hook Form (it batches already)
3. **Code splitting** - Vite handles this, but be aware of bundle sizes

### **Capital Allocations Complexity:**
The Capital Allocations step is the **hardest remaining task** because:
- Dynamic allocation between initial/follow-on investments
- Multi-dimensional table inputs (stage × metric)
- Implied calculations that must update reactively
- Graduation flow logic (who advances to next round)
- Edge cases (what if no one graduates? 100% failure rate?)

**Suggested Approach:**
1. Start with schema design - nail down the data model
2. Build the calculation engine separately and test it thoroughly
3. Create static UI components (no logic yet)
4. Wire up one section at a time (initial → follow-on → pacing)
5. Add real-time calculations last

---

## 📚 Reference Documentation

### **In Codebase:**
- `CLAUDE.md` - Project overview and conventions
- `CHANGELOG.md` - All changes with timestamps
- `DECISIONS.md` - Architectural decisions
- `cheatsheets/` - Detailed guides

### **External References:**
- User provided detailed specs in screenshots (saved in chat history)
- Tactyc-style UX language for consistency
- Market research datasets for sector profiles

---

## 🔗 Related Features (Not Part of Wizard)

There's a **separate Scenario Analysis feature** mentioned in planning docs:
- File: `docs/SCENARIO_ANALYSIS_STABILITY_REVIEW.md`
- Different from wizard "Scenarios" step
- Handles Construction vs Current comparison
- Reserve optimization with MOIC ranking
- **Do not confuse** with wizard step 7

---

## ⚙️ Git Status

**Current Branch:** `chore/deps-safe-batch-oct07`

**Untracked Files:**
```
client/src/components/modeling-wizard/steps/FundFinancialsStep.tsx (modified)
client/src/schemas/modeling-wizard.schemas.ts (modified)
client/src/components/modeling-wizard/steps/index.ts (modified)
client/src/components/modeling-wizard/steps/capital-allocation/
client/src/components/modeling-wizard/steps/fund-financials/
client/src/lib/capital-calculations.ts (modified)
client/src/lib/__tests__/capital-calculations.test.ts (new)
server/migrations/20251007_add_scenarios.down.sql (new)
server/migrations/20251007_add_scenarios.up.sql (new)
shared/types/scenario.ts (new)
shared/utils/scenario-math.ts (new)
```

**Recommendation:** Commit current progress before continuing with Capital Allocations.

---

## 🎯 Immediate Next Actions

1. **Commit current work:**
   ```bash
   git add client/src/components/modeling-wizard/steps/fund-financials/
   git add client/src/components/modeling-wizard/steps/sector-profiles/
   git add client/src/lib/capital-calculations.ts
   git add client/src/lib/__tests__/capital-calculations.test.ts
   git add client/src/schemas/modeling-wizard.schemas.ts
   git commit -m "feat(wizard): add Fund Financials and Sector Profiles steps

   - Add expense tracking with one-time/annual types
   - Implement capital call schedule with visual charts
   - Create investment stage cohorts (Pre-Seed to Series E+)
   - Add comprehensive validation for rates and allocations
   - Include 584 passing tests

   🤖 Generated with Claude Code
   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

2. **Start Capital Allocations Step:**
   - Review existing implementation
   - Study user-provided screenshots carefully
   - Design enhanced schema
   - Build calculation engine with tests first
   - Then build UI components

3. **Check remaining steps:**
   - Verify Fees & Expenses completeness
   - Plan Exit & Recycling implementation
   - Plan Waterfall implementation (use helpers!)
   - Research Scenarios step requirements

---

## 📞 Contact & Continuity

**Codex Review Agent:** Still running (bash ID: `600a1f`)
- Stop with: `Ctrl+C` in that terminal
- Or check output: Use `BashOutput` tool with bash_id `600a1f`

**Test Coverage:** 584 tests passing, 26 pre-existing failures (database-related)

**Build Status:** Clean (after removing old backup file)

---

**Good luck! You've got a solid foundation to build on. The hardest part (Capital Allocations) is next, but you have excellent patterns to follow.** 🚀
