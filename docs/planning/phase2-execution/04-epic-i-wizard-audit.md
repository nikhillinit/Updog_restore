# Epic I: Wizard Steps 4-7 Audit

**Status:** AUDIT COMPLETE
**Date:** 2026-01-22

---

## Current Architecture

### Step Mapping Mismatch

| Source | Steps Defined | Notes |
|--------|---------------|-------|
| fund-setup-utils.ts | 6 | VALID_STEPS = ['1'..'6'] |
| fund-setup.tsx routes | 6 | Routes only 1-6 |
| modeling-wizard.machine.ts | 7 | XState defines 7 steps |

**Critical Issue:** XState machine and React router are out of sync.

### Step Purpose vs Implementation

| Step | Route Label | Component | Actual Content |
|------|-------------|-----------|----------------|
| 4 | Investment Strategy | InvestmentStrategyStep | Stages, Sectors, Allocations |
| 5 | Exit Recycling | DistributionsStep | Waterfall, Fees, Recycling |
| 6 | Waterfall & Carry | CashflowManagementStep | Expenses, Capital Calls, Liquidity |
| 7 | (Missing) | (None) | Should be Review & Create |

**Finding:** Step 6 label doesn't match content. WaterfallStep.tsx exists but is orphaned.

---

## Per-Step Assessment

### Step 4: Investment Strategy
**File:** `client/src/pages/InvestmentStrategyStep.tsx` (662 lines)

**Status:** COMPLETE with legacy/new toggle
- Two implementations (legacy + new via `VITE_NEW_SELECTORS`)
- Legacy uses localStorage directly (fragile)
- New uses vanilla store (better)
- **Gap:** No XState binding

**Validation:** Basic (graduation + exit <= 100%)
**UI:** Press On branded (legacy), generic tabs (new)

### Step 5: Exit Recycling
**File:** `client/src/pages/DistributionsStep.tsx` (732 lines)

**Status:** FEATURE-RICH
- Three tabs: Waterfall Structure, Fees & Expenses, Recycling
- American waterfall only (European not implemented)
- **Gap:** Uses store, no XState binding

**Validation:** Manual checks only
**UI:** Press On branded, modern shadcn tabs

### Step 6: Cashflow Management
**File:** `client/src/pages/CashflowManagementStep.tsx` (529 lines)

**Status:** MISALIGNED PURPOSE
- Label says "Waterfall & Carry"
- Content is expenses, capital calls, liquidity
- **Gap:** No validation, settings in local state only

**Validation:** None (accepts any value)
**UI:** Press On branded, shadcn tabs

### Step 7: Review & Create
**Status:** NOT IMPLEMENTED

Should include:
- Readonly summary of all steps
- Final validation
- Create/Save button
- Success confirmation

---

## Data Flow Issues

1. **Multiple storage patterns:**
   - XState: `modeling-wizard-progress` (localStorage)
   - Step 4 legacy: `updog_sector_profiles_with_stages` (localStorage)
   - Steps 4-6: Vanilla store (no localStorage backup)

2. **No single source of truth:**
   - Business data in store
   - Step navigation in XState
   - Validation scattered across files

3. **No offline resilience:**
   - Steps 5-6 lose data on refresh

---

## Validation Gaps

| Area | Status |
|------|--------|
| Per-field validation | Partial |
| Cross-step validation | Missing |
| Final reconciliation | Missing |
| Waterfall vs fee checks | Missing |

---

## Recommendations

### P0: Critical (Blocking)
1. **Implement Step 7 (Review & Create)**
   - Create ReviewStep.tsx
   - Wire to route `/fund-setup?step=7`
   - Update fund-setup-utils.ts

2. **Reconcile XState ↔ Router**
   - Decision: XState or router as source of truth?
   - Align step count (6 or 7)

### P1: Important
3. **Fix Step 6 purpose**
   - Option A: Rename to "Advanced Settings"
   - Option B: Move waterfall here, expenses to Step 7

4. **Consolidate data persistence**
   - Migrate Step 4 localStorage to store
   - Remove scattered storage keys

### P2: Nice to Have
5. **Add cross-step validation**
6. **Standardize UI patterns**
7. **Expand golden datasets**

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `client/src/pages/ReviewStep.tsx` | CREATE - Step 7 |
| `client/src/pages/fund-setup.tsx` | MODIFY - Add step 7 route |
| `client/src/pages/fund-setup-utils.ts` | MODIFY - Add '7' to VALID_STEPS |
| `client/src/machines/modeling-wizard.machine.ts` | MODIFY - Align with routes |

---

## Implementation Scope for This Epic

Given time constraints, focus on:
1. [x] Audit complete (this document)
2. [ ] Create minimal Step 7 (ReviewStep.tsx)
3. [ ] Wire route for step 7
4. [ ] Basic summary display
5. [ ] E2E test for wizard completion

Defer to future epic:
- Cross-step validation
- Data persistence consolidation
- UI standardization
