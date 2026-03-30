# PR3: Step 3 CapitalStructureStep Store Migration

## Context

CapitalStructureStep (wizard Step 3) uses hardcoded `useState` for all state —
no persistence. When users navigate away and back, all allocation data is lost.
This PR migrates the component to use the fundStore (Zustand with persist
middleware), following the same pattern established in PR #509 (Step 7) and PR
#510 (Step 4).

## Scope

- Add new types and state to fundStore for capital plan allocations
- Wire CapitalStructureStep to read/write from store
- Fix fundSize unit mismatch ($M in store vs dollars in component)
- Tests for store actions and component integration
- NOT in scope: persisting gpCommitment/lpClasses/lps (pre-existing gap,
  separate PR)

## Implementation Steps

### 1. Add types to fundStore.ts (after PipelineProfile ~line 100)

```ts
export type CapitalStageAllocation = { id: string; label: string; pct: number };
export type CapitalPlanAllocation = {
  id: string;
  name: string;
  sectorProfileId?: string;
  entryRound: string;
  capitalAllocationPct: number;
  initialCheckStrategy: 'amount' | 'ownership';
  initialCheckAmount?: number;
  initialOwnershipPct?: number;
  followOnStrategy: 'amount' | 'maintain_ownership';
  followOnAmount?: number;
  followOnParticipationPct: number;
  investmentHorizonMonths: number;
};
```

### 2. Add state fields + actions to FundState interface

- `capitalStageAllocations: CapitalStageAllocation[]`
- `capitalPlanAllocations: CapitalPlanAllocation[]`
- Actions: set/add/update/remove for both

### 3. Add defaults (from current hardcoded values in component)

- Stage allocations: Pre-Seed+Seed 43%, Series A 14%, Reserved 43%
- Plan allocations: Pre-Seed $250k, Seed $500k, Series A $750k

### 4. Implement actions in store creator

Standard CRUD pattern matching existing store actions.

### 5. Update partialize to persist new fields

Add `capitalStageAllocations`, `capitalPlanAllocations`. Keep persist version 2
(additive).

### 6. Migrate CapitalStructureStep component

- Import `CapitalPlanAllocation`, `CapitalStageAllocation` from store (remove
  local interfaces)
- Replace `useFundContext().currentFund.size` with
  `useFundSelector(s => s.fundSize)` \* 1_000_000
- Replace useState for stageAllocations with store selector + action
- Replace useState for allocations with store selector + actions
- Keep `editingAllocation` as local useState

### 7. Tests

- Store unit: add/update/remove/set, defaults, partialize
- Component: store round-trip, allocation CRUD

## Critical Files

- `client/src/stores/fundStore.ts` — types, state, actions, partialize
- `client/src/pages/CapitalStructureStep.tsx` — component migration
- `client/src/stores/useFundSelector.ts` — existing hook (no changes needed)
- `tests/` — new test files

## Risks

- Amount unit inconsistency in helper functions (some assume dollars, some
  multiply by 1M)
- Must NOT touch existing `allocations` field (strategy category allocations)

## Verification

1. `npm run check` — TypeScript passes
2. `npm test -- --project=client` — all client tests pass
3. Manual: navigate to Step 3, add/edit/delete allocations, navigate away and
   back — data persists
