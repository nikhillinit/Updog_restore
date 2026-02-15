# P2 Wizard Completion + TS Debt -- Refined Plan

**Status:** APPROVED **Date:** 2026-02-15 **Source:** Proposed plan refined via
Codex critique + codebase exploration

## Codex Critique Summary

Original plan had 7 agents across 5 PRs. Codex identified:

1. **Agent D (cross-step validation) is redundant** -- `wizard-validation.ts`
   already has `validateFundSetup()` with errors/warnings/canSave. The gap is
   _wiring_, not a new engine.
2. **Agent E is partially real** -- `updog_sector_profiles_with_stages` legacy
   key confirmed at `InvestmentStrategyStep.tsx:119-142`. But "persistence
   consolidation" overscopes it.
3. **Agents A+B should merge** -- normalizer + Step 7 wiring are one vertical
   slice.
4. **TS debt should fold into PR1** -- small unblock-first work, no separate
   PR0.
5. **Agent G (docs) and Agent F (test modernization) can shrink** -- tests cover
   changed behavior only; docs update inline.
6. **Step 3 deferral is safe** for create correctness -- `POST /api/funds` only
   accepts basic fields (name, size, fee, carry, vintage). Extended config goes
   through `PUT /api/funds/:id/draft`.

## Architecture Findings

### Data Flow (current vs. target)

**Current (broken):**

```
ReviewStep → reads FundContext (API) → no create call → redirect to /
```

**Target:**

```
ReviewStep → reads fundStore (wizard state) → validateFundSetup() →
  mapFundStoreToCreatePayload() → createFund() →
  normalizeCreateFundResponse() → FundContext.setCurrentFund() →
  PUT /api/funds/:id/draft (full config) → navigate to dashboard
```

### Backend Contract

`POST /api/funds` accepts (routes.ts:193-200):

```typescript
{ name: string, size: number, managementFee: number,
  carryPercentage: number, vintageYear: number,
  deployedCapital?: number }
```

Returns: `{ id, name, size, ... }` (full fund row)

`PUT /api/funds/:id/draft` accepts: full wizard config as JSON blob (fundConfigs
table)

### Legacy Key Confirmed

`InvestmentStrategyStep.tsx:119` writes `updog_sector_profiles_with_stages` to
localStorage. This persists sector profiles separately from fundStore's
`investment-strategy` key. Migration: one-time read into fundStore on step load,
stop writing legacy key.

---

## Revised Plan: 3 PRs (down from 5)

### PR1: Step 7 Real Create (vertical slice)

**Scope:** TS unblock + normalizer + payload adapter + wiring

1. **TS debt fixes (first commit)**
   - `GuidedTour.tsx`: Guard `TOUR_STEPS[currentStep]` with early return if
     undefined
   - `PortfolioTabs.tsx`: Default `activeTab` to fallback value, ensuring
     `string` (not `string | undefined`)
   - Gate: `npm run check` passes on touched files

2. **Payload adapter** (`client/src/lib/map-fund-store-to-payload.ts`)
   - `mapFundStoreToCreatePayload(state: FundStoreState): CreateFundPayload`
   - Maps fundStore fields → POST /api/funds contract
   - Pure function, unit-testable

3. **Response normalizer** (in `client/src/services/funds.ts`)
   - `normalizeCreateFundResponse(raw: unknown): { id: number; [key: string]: unknown }`
   - Handles both `{ id, ... }` and `{ success: true, data: { id, ... } }`
     shapes
   - Adopt in existing createFund return path

4. **ReviewStep wiring** (`ReviewStep.tsx`)
   - Switch from FundContext reads → fundStore reads (via useFundSelector)
   - Call `validateFundSetup()` (existing) before submit
   - Show validation errors/warnings inline
   - On submit: mapFundStoreToCreatePayload → createFund →
     normalizeCreateFundResponse
   - Loading state, error display, retry button, double-submit prevention
   - On success: invalidate TanStack Query funds, set FundContext.currentFund,
     navigate

5. **Draft config save** (sequential, before navigate)
   - After create returns fund.id, PUT full wizard config to
     `/api/funds/:id/draft`
   - Await response before navigating -- user sees full confirmation
   - On draft-save failure: show warning but still navigate (fund was created
     successfully)

6. **Tests**
   - Unit: payload adapter (pure function)
   - Unit: response normalizer (both shapes)
   - Unit: ReviewStep submit states (loading, error, success) via RTL

**Files touched:** ~6 files **Risk:** Low -- vertical slice, no cross-cutting
changes

### PR2: Legacy Persistence Cleanup

**Scope:** Migrate legacy Step 4 key, narrow targeted cleanup

1. **Step 4 legacy key migration**
   - On `InvestmentStrategyStep` mount: read
     `updog_sector_profiles_with_stages`, write to fundStore's sectorProfiles
     slice, delete legacy key
   - Guard: only migrate if fundStore.sectorProfiles is empty
   - Remove direct localStorage.setItem calls for this key

2. **Verify fundStore as single persistence source**
   - Audit remaining localStorage.getItem/setItem calls in wizard step
     components
   - Ensure all business data flows through fundStore

3. **Tests**
   - Unit: migration reads legacy, writes to store, clears legacy key
   - Unit: no-op when store already has data

**Files touched:** ~2-3 files **Risk:** Low -- isolated migration with clear
before/after

### PR3: Step 3 Store Migration (optional, can defer)

**Scope:** Move CapitalStructureStep from local state to fundStore

**Deferral justification:** `POST /api/funds` only needs basic fields. Step 3
allocations go through `/api/funds/:id/draft`, which PR1 already saves as full
config blob. Step 3 local state works for the draft save.

**If pursued:**

1. Add allocation-related slices to fundStore (or verify existing ones suffice)
2. Refactor CapitalStructureStep to read/write fundStore instead of local
   useState
3. Keep transient UI state (editingAllocation, expanded rows) local
4. Tests for store round-trip

**Files touched:** ~3-4 files **Risk:** Medium -- 776-line component refactor,
needs careful state untangling

---

## What Was Cut (and why)

| Original Agent                  | Disposition                    | Reason                                                                 |
| ------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| D: Cross-Step Validation Engine | **Cut entirely**               | `wizard-validation.ts` already exists. Wire it, don't rebuild it.      |
| F: Test + Harness Modernization | **Shrunk → inline in each PR** | Only test changed behavior. No Playwright modernization initiative.    |
| G: Docs Alignment               | **Cut entirely**               | XState framing issue is a docs-only concern. Not blocking reliability. |

## Execution Order

```
PR1 (must-have) → PR2 (must-have) → PR3 (optional/deferred)
```

PR1 and PR2 are independent and could technically be parallel branches, but PR1
should land first since it establishes the create flow that PR2's migration
feeds into.

## Acceptance Criteria

1. Step 7 Create button calls real API and only redirects on success
2. Duplicate clicks do not create duplicate funds (existing dedup in
   services/funds.ts)
3. Step 7 blocks submission when hard validation errors exist
4. `npm run check` passes (TS debt resolved)
5. Legacy `updog_sector_profiles_with_stages` key migrated to fundStore
6. Full wizard config persisted to fundConfigs via draft endpoint

## Decisions (resolved 2026-02-15)

1. **Draft save timing:** Sequential -- save full config via
   `PUT /api/funds/:id/draft` BEFORE navigating. User sees confirmation that
   everything persisted.
2. **Step 3 scope:** Deferred to PR3. No user-visible bug; architectural debt
   only.
