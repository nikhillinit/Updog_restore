# Epic I: Wizard Steps 4-7 Audit

**Status:** CORE COMPLETE (Step 7 + XState Decision)
**Date:** 2026-01-23 (updated)

---

## Current Architecture

### Wizard Systems (Clarified)

**IMPORTANT:** There are TWO SEPARATE wizard systems that serve DIFFERENT purposes:

| Wizard | File | Steps | Purpose |
|--------|------|-------|---------|
| Fund Setup | `fund-setup.tsx` | 7 (router-based) | Fund onboarding/configuration |
| Modeling | `modeling-wizard.machine.ts` | 7 (XState) | Financial modeling/scenarios |

**Resolution:** These are NOT meant to be connected. The apparent "mismatch" was a misunderstanding - they are parallel features with different taxonomies.

### Fund Setup Steps (Current - ALIGNED)

| Source | Steps | Status |
|--------|-------|--------|
| fund-setup-utils.ts | 7 | VALID_STEPS = ['1'..'7'] |
| fund-setup.tsx routes | 7 | Routes 1-7 complete |
| STEP_COMPONENTS | 7 | All components wired |

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
1. **Implement Step 7 (Review & Create)** - COMPLETE
   - Created ReviewStep.tsx
   - Wired to route `/fund-setup?step=7`
   - Updated fund-setup-utils.ts

2. **Reconcile XState ↔ Router** - RESOLVED (No Action Needed)
   - **Decision:** Keep separate - these are DIFFERENT wizards
   - `modeling-wizard.machine.ts` = Financial modeling/scenarios flow
   - `fund-setup.tsx` = Fund onboarding/configuration flow
   - They have different step taxonomies because they serve different purposes
   - Router is source of truth for fund-setup (7 steps complete)
   - XState remains source of truth for modeling wizard (separate feature)

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

## Files Created/Modified

| File | Action | Status |
|------|--------|--------|
| `client/src/pages/ReviewStep.tsx` | CREATED - Step 7 | DONE (PR #479) |
| `client/src/pages/fund-setup.tsx` | MODIFIED - Add step 7 route | DONE (PR #479) |
| `client/src/pages/fund-setup-utils.ts` | MODIFIED - Add '7' to VALID_STEPS | DONE (PR #479) |
| `client/src/machines/modeling-wizard.machine.ts` | NO CHANGE - Separate wizard | N/A |

---

## Implementation Scope for This Epic

**COMPLETE:**
1. [x] Audit complete (this document)
2. [x] Create minimal Step 7 (ReviewStep.tsx) - PR #479
3. [x] Wire route for step 7 - PR #479
4. [x] Basic summary display - PR #479
5. [x] E2E test for wizard completion - PR #479
6. [x] XState reconciliation decision: Keep wizards separate (modeling vs setup)

**Deferred to future epic:**
- Cross-step validation (fund-setup specific)
- Data persistence consolidation (migrate localStorage to store)
- UI standardization across steps
- Optional: Create fund-setup-specific XState machine for guarantees
