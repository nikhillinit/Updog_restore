# Wizard Implementation Handoff Memo

**Date:** October 7, 2025
**Session Duration:** ~3 hours
**Branch:** `chore/deps-safe-batch-oct07`
**Status:** In Progress - 2/7 wizard steps complete

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

### **Files Created (11 total)**

**Fund Financials:**
1. `client/src/components/modeling-wizard/steps/fund-financials/ExpenseList.tsx`
2. `client/src/components/modeling-wizard/steps/fund-financials/CapitalCallSchedule.tsx`
3. `client/src/lib/__tests__/capital-calculations.test.ts`

**Sector Profiles:**
4. `client/src/components/modeling-wizard/steps/sector-profiles/InvestmentStageForm.tsx`
5. `client/src/components/modeling-wizard/steps/sector-profiles/SectorProfileCard.tsx`

### **Files Modified (4 total)**

1. `client/src/schemas/modeling-wizard.schemas.ts` - Enhanced with all new schemas
2. `client/src/lib/capital-calculations.ts` - Added schedule pattern logic
3. `client/src/components/modeling-wizard/steps/FundFinancialsStep.tsx` - Integrated new features
4. `client/src/components/modeling-wizard/steps/fund-financials/ProjectionTable.tsx` - Added expense display

### **Test Results**
- ✅ TypeScript: Clean (old backup file removed)
- ✅ Tests: 584 passing (including all new capital-calculations tests)
- ⚠️ 26 database integration tests failing (pre-existing, unrelated)
- ✅ Codex Review Agent: All files passing

---

## 🚧 Next Steps (Remaining Work)

### **3. Capital Allocations Step (NOT STARTED)**

**Priority:** HIGH
**Complexity:** HIGH - Most sophisticated financial modeling component

**Requirements from screenshots:**

**3a. Initial Investment Strategy**
- Amount-based OR ownership-based entry dropdown
- Implied Entry Ownership calculation
- Number of Deals calculation
- Capital Allocated display

**3b. Follow-On Strategy**
- Table layout with stages (Pre-Seed, Seed, Series A, B, C, etc.)
- Maintain Ownership % targets per stage
- Follow-on Participation % per stage
- Implied Follow-On Check calculations
- Graduation Rates per stage
- Graduates count
- Follow-on Investments count
- Capital Allocated to follow-ons

**3c. Investment Pacing/Horizon**
- Multiple time periods with % allocations
- Add Period button
- "Apply to all allocations" feature
- Date range display (e.g., "Jan 2021 to Dec 2021")
- Percentage inputs must sum to 100%

**Key Technical Challenge:**
Dynamic capital distribution between initial and follow-on investments. The $100M allocation must be intelligently split based on:
- Initial check size
- Graduation rates
- Follow-on participation rates
- Follow-on check sizes per stage

**Reference Files to Study:**
- Current implementation: `client/src/components/modeling-wizard/steps/CapitalAllocationStep.tsx` (basic version exists)
- Schema: `client/src/schemas/modeling-wizard.schemas.ts:253-302` (needs major enhancement)

---

### **4. Fees & Expenses Step (PARTIALLY COMPLETE)**

**Status:** Basic implementation exists, may need review
**File:** `client/src/components/modeling-wizard/steps/FeesExpensesStep.tsx`
**Schema:** `client/src/schemas/modeling-wizard.schemas.ts:304-393`

**Review Needed:**
- Verify completeness vs. requirements
- Check if management fee basis (committed/called/FMV) is implemented
- Ensure step-down validation is working

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
