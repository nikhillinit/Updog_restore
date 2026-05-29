---
status: ACTIVE
audience: agents
last_updated: 2026-05-29
owner: "Platform Team"
review_cadence: P90D
categories: [planning, scenarios]
keywords: [scenario-workspace, scenario-sets, fund-model-results]
---

# Scenario UX Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a focused Scenario UX workspace at `/fund-model-results/:fundId/scenarios` for existing ADR-022 scenario sets.

**Architecture:** Keep the new route client-only and compatibility-preserving. Reuse the scenario list/detail, calculation, status, results, and comparison endpoints from PR #728, plus the existing fund-results scenario summary/comparison components; do not add scenario creation, override expansion, reserve optimization workflow, or shared contract changes.

**Tech Stack:** React 18, Wouter, TanStack Query, existing shadcn/ui primitives, strict shared Zod contracts, Vitest + Testing Library.

---

## Inventory

- Route registration lives in `client/src/app/app-routes.tsx`; protected app routes are rendered from `APP_ROUTES` by `client/src/app/app-router.tsx`.
- Route governance lives in `client/src/app/route-governance-registry.ts`; tests assert the exact core-live route set in `tests/unit/app/route-governance-registry.test.tsx`.
- Fund route-scoped context extraction lives in `client/src/lib/fund-routes.ts`; `/fund-model-results/:fundId` currently parses only the base results URL.
- Current results page lives in `client/src/pages/fund-model-results.tsx`; it already fetches `/api/funds/:fundId/results`, derives calculated scenario set IDs from `sections.scenarios`, and fetches `/api/funds/:fundId/scenario-sets/:scenarioSetId/comparison`.
- Reusable scenario result surfaces are `client/src/components/fund-results/ScenarioSetsSummary.tsx` and `client/src/components/fund-results/ScenarioComparisonTable.tsx`.
- Scenario contracts are `shared/contracts/fund-scenario-sets-v1.contract.ts`, `shared/contracts/fund-scenario-comparison-v1.contract.ts`, and `shared/contracts/fund-results-v1.contract.ts`.
- Scenario endpoints are registered in `server/routes/fund-scenario-sets.ts`: list, detail, calculate fee-profile, calculate reserve, calculation-status, comparison, results, and archive.

## Scope

In scope:

- Dedicated protected route `/fund-model-results/:fundId/scenarios`.
- Read existing scenario sets and per-set detail.
- Show calculated summaries and comparison cards when results exist.
- Show per-set calculation status.
- Trigger the existing fee-profile or reserve calculation endpoint based on the scenario set detail override type.
- Link the existing results page scenario section to the workspace.

Out of scope:

- Scenario set creation or editing.
- Allocation or sector override expansion.
- Reserve optimization UI/workflow.
- Forecast modes, actuals, cohort readiness, methodology guardrails.
- Canonical hash, migration 0016, route mount normalization, provider order, public URL changes, or new dependencies.

## File Structure

- Create `client/src/pages/fund-scenario-workspace.tsx`
  - Route component and local query/mutation helpers for the dedicated workspace.
  - Strictly parse server responses with existing shared schemas.
  - Render existing `ScenarioSetsSummary` and `ScenarioComparisonTable` instead of creating new comparison math.
- Modify `client/src/app/app-routes.tsx`
  - Lazy-load the new page.
  - Register `/fund-model-results/:fundId/scenarios` before `/fund-model-results/:fundId`.
- Modify `client/src/app/route-governance-registry.ts`
  - Classify the scenario workspace as a protected core-live route.
- Modify `client/src/lib/fund-routes.ts`
  - Parse route-scoped fund IDs for `/fund-model-results/:fundId/scenarios`.
- Modify `client/src/pages/fund-model-results.tsx`
  - Add one link from the existing scenario section to the dedicated workspace.
- Create `tests/unit/pages/fund-scenario-workspace.test.tsx`
  - Cover scenario list/detail/results/comparison loading and calculate endpoint selection.
- Modify `tests/unit/pages/fund-model-results.test.tsx`
  - Cover the link from the results scenario section to the workspace.
- Modify `tests/unit/app/route-governance-registry.test.tsx`
  - Add the new core-live route expectation.
- Modify `tests/unit/contexts/fund-context-route-selection.test.tsx`
  - Cover route fund selection on `/fund-model-results/:fundId/scenarios`.

---

### Task 1: Lock Route and Workspace Behavior with Failing Tests

**Files:**

- Create: `tests/unit/pages/fund-scenario-workspace.test.tsx`
- Modify: `tests/unit/app/route-governance-registry.test.tsx`
- Modify: `tests/unit/contexts/fund-context-route-selection.test.tsx`
- Modify: `tests/unit/pages/fund-model-results.test.tsx`

- [ ] **Step 1: Add route governance and fund-context assertions**

Add `/fund-model-results/:fundId/scenarios` to the expected core-live route list in `tests/unit/app/route-governance-registry.test.tsx`.

Add this test to `tests/unit/contexts/fund-context-route-selection.test.tsx`:

```tsx
it('prefers the route fund ID on /fund-model-results/:fundId/scenarios', async () => {
  const { Wrapper } = createWouterWrapper('/fund-model-results/2/scenarios');

  render(
    <Wrapper>
      <FundProvider>
        <Consumer />
      </FundProvider>
    </Wrapper>
  );

  await waitFor(() => {
    expect(screen.getByText('2:Route Fund:false:false')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Add results-page link assertion**

In `tests/unit/pages/fund-model-results.test.tsx`, extend the available scenarios coverage with:

```tsx
expect(screen.getByRole('link', { name: /open scenario workspace/i })).toHaveAttribute(
  'href',
  '/fund-model-results/123/scenarios'
);
```

- [ ] **Step 3: Add workspace page tests**

Create `tests/unit/pages/fund-scenario-workspace.test.tsx` with fixtures for:

```tsx
renderWorkspace('/fund-model-results/123/scenarios');
expect(await screen.findByText('Scenario Workspace')).toBeInTheDocument();
expect(screen.getByText('Fee sensitivity')).toBeInTheDocument();
expect(screen.getByText('Reserve plan')).toBeInTheDocument();
expect(screen.getByText('Authoritative baseline')).toBeInTheDocument();
expect(screen.getByRole('button', { name: /calculate fee sensitivity/i })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /queue reserve plan/i })).toBeInTheDocument();
```

Add click assertions:

```tsx
fireEvent.click(await screen.findByRole('button', { name: /calculate fee sensitivity/i }));
await waitFor(() => {
  expect(fetchSpy).toHaveBeenCalledWith(
    '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000111/calculate',
    expect.objectContaining({ method: 'POST' })
  );
});

fireEvent.click(await screen.findByRole('button', { name: /queue reserve plan/i }));
await waitFor(() => {
  expect(fetchSpy).toHaveBeenCalledWith(
    '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000211/calculate-reserve',
    expect.objectContaining({ method: 'POST' })
  );
});
```

- [ ] **Step 4: Run tests to verify RED**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/pages/fund-scenario-workspace.test.tsx tests/unit/pages/fund-model-results.test.tsx tests/unit/app/route-governance-registry.test.tsx tests/unit/contexts/fund-context-route-selection.test.tsx --project=client
```

Expected: FAIL because the route, page, nested fund ID parsing, and link do not exist yet.

---

### Task 2: Add the Scenario Workspace Route and Page

**Files:**

- Create: `client/src/pages/fund-scenario-workspace.tsx`
- Modify: `client/src/app/app-routes.tsx`
- Modify: `client/src/app/route-governance-registry.ts`
- Modify: `client/src/lib/fund-routes.ts`

- [ ] **Step 1: Implement route-scoped fund parsing**

Change `FUND_RESULTS_ROUTE_RE` in `client/src/lib/fund-routes.ts` to accept the workspace suffix:

```ts
const FUND_RESULTS_ROUTE_RE = /^\/fund-model-results\/(\d+)(?:\/scenarios)?(?:\/)?$/;
```

- [ ] **Step 2: Create the workspace page**

Create `client/src/pages/fund-scenario-workspace.tsx` with local helpers that:

- Validate `fundId` with `/^\d+$/`.
- Fetch and parse `FundScenarioSetListResponseV1Schema`.
- Fetch and parse `FundScenarioSetDetailV1Schema` for active scenario sets.
- Fetch and parse `FundResultsReadV1Schema`.
- Fetch and parse `FundScenarioCalculationStatusV1Schema`.
- Fetch and parse `FundScenarioComparisonV1Schema` for calculated scenario set IDs only.
- POST to `/calculate` for `fee_profile` sets and `/calculate-reserve` for `reserve_allocation` sets.

Render:

- Fund name, vintage, and a link back to `/fund-model-results/:fundId`.
- Scenario count and status overview.
- Existing `ScenarioSetsSummary` for calculated summaries.
- A per-set action list with status and calculate/queue buttons.
- Existing `ScenarioComparisonTable` cards for comparison results.
- Contract-backed empty/error states without fabricated metrics.

- [ ] **Step 3: Register and govern the route**

In `client/src/app/app-routes.tsx`:

```ts
const FundScenarioWorkspace = React.lazy(() => import('@/pages/fund-scenario-workspace'));
```

Register before the base results route:

```ts
{
  path: '/fund-model-results/:fundId/scenarios',
  component: FundScenarioWorkspace,
  isProtected: true,
},
```

In `client/src/app/route-governance-registry.ts`, add the same path to `CORE_LIVE_ROUTE_PATHS`.

- [ ] **Step 4: Verify GREEN for focused route tests**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/pages/fund-scenario-workspace.test.tsx tests/unit/app/route-governance-registry.test.tsx tests/unit/contexts/fund-context-route-selection.test.tsx --project=client
```

Expected: PASS.

---

### Task 3: Link Existing Results to the Workspace

**Files:**

- Modify: `client/src/pages/fund-model-results.tsx`
- Modify: `tests/unit/pages/fund-model-results.test.tsx`

- [ ] **Step 1: Add a narrow link prop to the scenario card**

Extend `ScenarioAnalysisCard` in `client/src/pages/fund-model-results.tsx` to accept `fundId` and render:

```tsx
<Button asChild variant="outline" size="sm">
  <Link href={`/fund-model-results/${fundId}/scenarios`}>Open Scenario Workspace</Link>
</Button>
```

Place it above the existing `ScenarioSetsSummary` so the current results page remains read-only and keeps its current comparison rendering.

- [ ] **Step 2: Pass `fundId` from `FundModelResultsPage`**

Update the `renderPayload` call for `ScenarioAnalysisCard`:

```tsx
<ScenarioAnalysisCard
  fundId={fundId}
  payload={p as ScenariosSectionPayloadV1}
  comparisonState={scenarioComparisonState}
/>
```

- [ ] **Step 3: Verify GREEN for results page tests**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/pages/fund-model-results.test.tsx --project=client
```

Expected: PASS.

---

### Task 4: Final Verification

**Files:**

- All files changed in Tasks 1-3.

- [ ] **Step 1: Run focused verification**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/pages/fund-scenario-workspace.test.tsx tests/unit/pages/fund-model-results.test.tsx tests/unit/app/route-governance-registry.test.tsx tests/unit/contexts/fund-context-route-selection.test.tsx --project=client
```

Expected: PASS.

- [ ] **Step 2: Run required pre-PR verification**

Run:

```bash
npm run check
npm run lint
npm run test:scenario-release-gate
git diff --check
git status --short --branch
```

Expected: all commands pass. If `npm run test:scenario-release-gate` skips locally because Testcontainers are unavailable, report the skip honestly and rely on CI for the container-backed gate.

- [ ] **Step 3: Commit**

Use the repo Lore Commit Protocol. Suggested intent line:

```text
Expose scenario hardening through a focused GP workspace
```

Suggested trailers:

```text
Constraint: Scenario UX must reuse ADR-022 contracts and endpoints without starting override expansion or reserve optimization
Rejected: Add scenario creation/editing in this PR | that would widen into override authoring beyond the follow-on workspace slice
Confidence: medium
Scope-risk: moderate
Tested: focused client tests; npm run check; npm run lint; npm run test:scenario-release-gate; git diff --check
```

## Self-Review

- Spec coverage: The plan adds only the requested Scenario UX workspace and excludes override expansion, reserve optimization, forecast modes, actuals, cohort readiness, methodology guardrails, hash/migration semantics, and dependency changes.
- Placeholder scan: No task uses deferred-fill wording; implementation touchpoints, test commands, and expected outcomes are explicit.
- Type consistency: The plan reuses existing V1 schemas and result/comparison components; no new shared contract is introduced.
