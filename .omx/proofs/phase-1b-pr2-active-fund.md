# Phase 1B PR2 Active-Fund Proof

## Scope Exercised

- Proof lane: PR2 active-fund scoping
- Plan source: `.omx/plans/2026-04-03-phase-1b-signoff-sandbox-proof-plan.md`
- Spec source: `.omx/specs/deep-interview-validate-plan-sign-off.md`
- Goal: remove proof-slice reliance on hardcoded fund `1` in the active
  deterministic dashboard path and prove truthful missing-fund behavior.

## Files Touched

- `client/src/components/dashboard/dual-forecast-dashboard.tsx`
- `tests/unit/components/dashboard/dual-forecast-dashboard.test.tsx`

## Files Inspected Only

- `client/src/contexts/FundContext.tsx`
- `server/routes/performance-metrics.ts`
- `server/routes/engine-summaries.ts`

## Commands Run

1. `npx vitest run tests/unit/components/dashboard/dual-forecast-dashboard.test.tsx`
   - Result: PASS
   - Evidence: 1 test file passed, 2 tests passed, 0 failed
2. `npm run check`
   - Result: PASS
   - Evidence: baseline TypeScript check found 0 current errors and introduced 0
     new errors

## Code/Test Findings

### DualForecastDashboard

The active deterministic dashboard path no longer hardcodes fund `1` in this
proof slice.

Observed diff summary:

- imported `useFundContext` from `@/contexts/FundContext`
- derived `fundId` from `currentFund?.id ?? null`
- changed React Query keys from hardcoded `/api/dashboard-summary/1` and
  `/api/fund-metrics/1` to `fundId`-scoped paths
- added `enabled: fundId != null` so no fetch occurs without an active fund
- added truthful blocked/empty UI state when `needsSetup || fundId == null`
- added loading UI while fund context initializes

### Targeted Test Coverage

`tests/unit/components/dashboard/dual-forecast-dashboard.test.tsx` proves:

- no fetch is attempted when there is no active fund context
- the component renders a truthful prompt instead of silently hitting fund `1`
- when active fund context exists, requests are scoped to that fund ID (`42` in
  the test)

## Backdoor / Blocker Inspection

### FundContext caveat

`client/src/contexts/FundContext.tsx` still contains demo-mode fallback behavior
that can synthesize `DEMO_FUND` with `id: 1` when the funds API is unavailable.

Interpretation:

- this proof validates the active deterministic dashboard component once fund
  context is provided
- it does **not** eliminate all repo-level pathways that can still surface fund
  `1` through demo-mode provider behavior
- this should be carried into queue revision as a caveat/gate, not treated as
  solved by the dashboard proof alone

### Server-side default-fund routes

Inspection findings:

- `server/routes/performance-metrics.ts` contains `DEFAULT_FUND_ID_FALLBACK = 1`
  and a schema default via `resolveDefaultFundId()`
- `server/routes/engine-summaries.ts` uses `getConfig().DEFAULT_FUND_ID` in
  `/cohorts/analysis`

Interpretation:

- these are real server-side default-fund backdoors
- they were **inspected only** in this proof lane
- no direct evidence was gathered that the active deterministic dashboard proof
  path currently depends on them
- they should be recorded as queue-revision items or blockers if later
  deterministic proof work begins to rely on those routes

## Pass/Fail Assessment

### Passed

- active deterministic dashboard proof slice no longer fetches hardcoded fund
  `1`
- missing fund context yields truthful blocked/empty state in the component
  proof
- targeted PR2 proof test passes
- `npm run check` passes

### Not fully resolved

- `FundContext` demo fallback can still synthesize a fund with `id: 1` when API
  is unavailable
- inspected server routes still contain default-fund behavior outside this proof
  slice

## Blockers

1. **Partial blocker / queue revision item:** `FundContext` demo fallback means
   the repo still has a path that can surface fund `1` when the API is
   unavailable.
2. **Queue revision item:** server-side default-fund routes remain present in
   `performance-metrics.ts` and `engine-summaries.ts`; these were not changed in
   this proof slice and should remain explicit caveats unless a later lane
   proves they are irrelevant or removes them.
3. **Dependency note:** route/perimeter conclusions that depend on final
   deterministic surface exposure should still be cross-checked against PR1
   findings.

## Required Queue Revisions Before Sign-Off

1. Clarify that PR2 proof removes hardcoded fund `1` from the **active dashboard
   slice**, not from every repo-level fallback path.
2. Add a caveat/gate for `FundContext` demo fallback behavior
   (`DEMO_FUND.id = 1`) if the deterministic surface may run while API-backed
   fund context is unavailable.
3. Preserve the server-side default-fund route inspection note as an explicit
   follow-up risk or blocker rather than assuming those routes are safe.
4. Reconcile PR2 findings with PR1 route/perimeter proof before declaring
   deterministic surface behavior sign-off ready.

## Artifact Verdict

- **Artifact status:** written
- **Proof status:** partial pass with explicit caveats/blockers recorded
- **Sign-off implication:** supports the queue, but requires plan revision to
  document the remaining provider/server-level fund-1 backdoors before final
  sign-off
