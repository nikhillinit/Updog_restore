---
status: ACTIVE
audience: agents
last_updated: 2026-05-29
owner: "Platform Team"
review_cadence: P90D
categories: [planning, scenarios, reserves]
keywords: [scenario-sets, reserve-optimization, reserve-allocation]
---

# Scenario Reserve Optimization Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a narrow reserve optimization workflow that creates ADR-022 reserve-allocation scenario sets from the existing reserve engine recommendations.

**Architecture:** Keep reserve optimization inside the existing scenario-set route family and emit the existing `reserve_allocation` override type. Do not add a new optimization store, new override type, or new calculation route; the generated scenario set is then queued through the already-shipped async reserve calculation path.

**Tech Stack:** TypeScript, Express, Zod contracts, existing scenario-set services, existing shared reserve engine, React workspace, TanStack Query, Vitest.

---

## Inventory Summary

- PR #730 is merged on `main` and the current branch starts from merge commit `e43d048eb3cbe035f66c5f904fed7eeac47d8624`.
- `shared/contracts/fund-scenario-sets-v1.contract.ts` already supports `reserve_allocation`, `allocation`, and `sector_profile` scenario overrides.
- `server/services/fund-scenario-set-create-service.ts` is the existing bounded creation entrypoint and already enforces published-config source binding, active-set capacity, active-name uniqueness, event logging, and idempotency keys.
- `server/services/fund-scenario-reserve-calculation-service.ts` and `server/services/fund-scenario-calc-queue-service.ts` already own async reserve calculation and must remain the only reserve scenario calculation path.
- `server/services/reserve-input-builder.ts` already builds the reserve portfolio input from investments or portfolio companies.
- `shared/core/reserves/ReserveEngine.ts` already provides deterministic reserve recommendations and `generateReserveSummary()`.
- `client/src/pages/fund-scenario-workspace.tsx` is the existing workspace that lists scenario sets and dispatches calculate or calculate-reserve calls by override type.

## Scope

In scope:

- Add a strict request schema for creating a reserve optimization scenario set.
- Add a service that builds a `CreateFundScenarioSetV1` payload from current reserve recommendations.
- Add one existing-family route: `POST /api/funds/:fundId/scenario-sets/reserve-optimization`.
- Add one workspace action that calls the route and refreshes the existing scenario list.
- Preserve the existing async reserve calculation workflow for actual calculation.

Out of scope:

- New override types, new calculation modes, forecast modes, actuals, cohort readiness, money utility refactors, schema-directory renames, engine dedupe, route mount normalization, dependency additions, and Phoenix-protected docs.
- Changes to canonical hash semantics, canonicalization behavior, migration `0016`, or PR #730 allocation/sector behavior.
- Replacing `server/services/reserve-optimization-calculator.ts` or portfolio-intelligence routes.

## File Structure

- Modify: `shared/contracts/fund-scenario-sets-v1.contract.ts`
  - Add `CreateReserveOptimizationScenarioSetV1Schema` and type export.
- Create: `server/services/fund-scenario-reserve-optimization-workflow-service.ts`
  - Build an optimized reserve-allocation scenario set from current portfolio reserve recommendations.
  - Delegate persistence to `createFundScenarioSet`.
- Modify: `server/routes/fund-scenario-sets.ts`
  - Register `POST /funds/:fundId/scenario-sets/reserve-optimization`.
- Modify: `client/src/pages/fund-scenario-workspace.tsx`
  - Add "Create optimized reserve plan" action and refresh workspace queries on success.
- Modify: `tests/unit/contract/fund-scenario-sets.test.ts`
  - Add contract coverage for strict reserve optimization request parsing.
- Create: `tests/unit/services/fund-scenario-reserve-optimization-workflow-service.test.ts`
  - Add pure mapping coverage and no-portfolio failure coverage.
- Modify: `tests/unit/routes/fund-scenario-sets-route-contract.test.ts`
  - Add source-level route contract guard for the new endpoint.
- Modify: `tests/unit/pages/fund-scenario-workspace.test.tsx`
  - Add UI workflow coverage.

---

### Task 1: Contract And Route Guardrails

**Files:**

- Modify: `shared/contracts/fund-scenario-sets-v1.contract.ts`
- Modify: `tests/unit/contract/fund-scenario-sets.test.ts`
- Modify: `tests/unit/routes/fund-scenario-sets-route-contract.test.ts`

- [ ] **Step 1: Write failing contract tests**

Add tests proving the reserve optimization create request accepts optional copy fields and rejects unknown keys:

```ts
import { CreateReserveOptimizationScenarioSetV1Schema } from '../../../shared/contracts/fund-scenario-sets-v1.contract';

expect(
  CreateReserveOptimizationScenarioSetV1Schema.safeParse({
    name: 'Optimized reserve plan',
    description: 'Created from current reserve recommendations',
    variantName: 'Recommended follow-on allocation',
  }).success
).toBe(true);

expect(
  CreateReserveOptimizationScenarioSetV1Schema.safeParse({
    name: 'Optimized reserve plan',
    unexpected: true,
  }).success
).toBe(false);
```

- [ ] **Step 2: Write failing route contract guard**

Extend `tests/unit/routes/fund-scenario-sets-route-contract.test.ts` to assert:

```ts
expect((source.match(/requireAuth\(\)/g) ?? []).length).toBe(10);
expect((source.match(/requireFundAccess/g) ?? []).length).toBe(11);
expect(source).toContain('/funds/:fundId/scenario-sets/reserve-optimization');
expect(source).toContain('CreateReserveOptimizationScenarioSetV1Schema.safeParse');
expect(source).toContain('createReserveOptimizationScenarioSet');
```

- [ ] **Step 3: Run RED for contract and route guardrails**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/contract/fund-scenario-sets.test.ts tests/unit/routes/fund-scenario-sets-route-contract.test.ts --project=server
```

Expected: FAIL because the schema and route do not exist yet.

- [ ] **Step 4: Add strict request schema**

Add this schema and type export to `shared/contracts/fund-scenario-sets-v1.contract.ts`:

```ts
export const CreateReserveOptimizationScenarioSetV1Schema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    variantName: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type CreateReserveOptimizationScenarioSetV1 = z.infer<
  typeof CreateReserveOptimizationScenarioSetV1Schema
>;
```

- [ ] **Step 5: Run GREEN for schema-only coverage**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/contract/fund-scenario-sets.test.ts --project=server
```

Expected: PASS for the contract file.

---

### Task 2: Reserve Optimization Scenario Builder

**Files:**

- Create: `server/services/fund-scenario-reserve-optimization-workflow-service.ts`
- Create: `tests/unit/services/fund-scenario-reserve-optimization-workflow-service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create service tests for the pure builder:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildReserveOptimizationScenarioSetInput,
  assertOptimizableReservePortfolio,
} from '../../../server/services/fund-scenario-reserve-optimization-workflow-service';

describe('reserve optimization scenario workflow', () => {
  it('builds a reserve-allocation scenario set from existing reserve recommendations', () => {
    const input = buildReserveOptimizationScenarioSetInput({
      fundId: 1,
      portfolio: [
        { id: 101, invested: 500_000, ownership: 0.15, stage: 'Seed', sector: 'SaaS' },
        { id: 102, invested: 1_000_000, ownership: 0.12, stage: 'Series A', sector: 'Fintech' },
      ],
      request: {
        name: 'Optimized reserve plan',
        variantName: 'Recommended follow-on allocation',
      },
      generatedAt: new Date('2026-05-29T10:00:00.000Z'),
    });

    expect(input.name).toBe('Optimized reserve plan');
    expect(input.variants).toHaveLength(1);
    expect(input.variants[0]?.override.overrideType).toBe('reserve_allocation');
    expect(input.variants[0]?.override.payload.items).toEqual([
      expect.objectContaining({
        companyId: 101,
        plannedReservesCents: expect.any(Number),
        maxAllocationCents: null,
      }),
      expect.objectContaining({
        companyId: 102,
        plannedReservesCents: expect.any(Number),
        maxAllocationCents: null,
      }),
    ]);
  });

  it('rejects empty portfolios before creating scenario sets', () => {
    expect(() => assertOptimizableReservePortfolio([])).toThrow(/portfolio companies/);
  });
});
```

- [ ] **Step 2: Run RED for service tests**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/fund-scenario-reserve-optimization-workflow-service.test.ts --project=server
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the builder and workflow service**

Create `server/services/fund-scenario-reserve-optimization-workflow-service.ts` with:

```ts
import type { ReserveCompanyInput } from '@shared/types';
import { generateReserveSummary } from '@shared/core/reserves/ReserveEngine';
import type {
  CreateFundScenarioSetV1,
  CreateReserveOptimizationScenarioSetV1,
  FundScenarioSetDetailV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import { transaction } from '../db/pg-circuit.js';
import { buildReservePortfolioInputForClient } from './reserve-input-builder';
import { createFundScenarioSet } from './fund-scenario-set-create-service.js';
import {
  createHttpError,
  verifyFundExists,
  type FundScenarioMutationActor,
} from './fund-scenario-set-service.js';

const DEFAULT_VARIANT_NAME = 'Recommended follow-on allocation';
const MAX_IDEMPOTENCY_KEY_NAME_SUFFIX = 8;

export function assertOptimizableReservePortfolio(portfolio: ReserveCompanyInput[]): void {
  if (portfolio.length === 0) {
    throw createHttpError(409, 'Reserve optimization requires at least one portfolio company', {
      code: 'reserve_optimization_no_portfolio',
    });
  }
}

function defaultScenarioName(generatedAt: Date, idempotencyKey?: string | null): string {
  if (idempotencyKey) {
    return `Optimized reserve plan ${idempotencyKey.slice(0, MAX_IDEMPOTENCY_KEY_NAME_SUFFIX)}`;
  }

  return `Optimized reserve plan ${generatedAt.toISOString()}`;
}

function toCents(value: number): number {
  return Math.max(0, Math.round(value * 100));
}

export function buildReserveOptimizationScenarioSetInput(input: {
  fundId: number;
  portfolio: ReserveCompanyInput[];
  request: CreateReserveOptimizationScenarioSetV1;
  generatedAt?: Date;
  idempotencyKey?: string | null;
}): CreateFundScenarioSetV1 {
  assertOptimizableReservePortfolio(input.portfolio);
  const generatedAt = input.generatedAt ?? new Date();
  const summary = generateReserveSummary(input.fundId, input.portfolio);

  return {
    name: input.request.name ?? defaultScenarioName(generatedAt, input.idempotencyKey),
    description:
      input.request.description ??
      'Generated from current reserve engine recommendations for ADR-022 scenario analysis.',
    variants: [
      {
        name: input.request.variantName ?? DEFAULT_VARIANT_NAME,
        description: 'Reserve allocation generated by the reserve optimization workflow.',
        override: {
          overrideType: 'reserve_allocation',
          payload: {
            allocationVersion: 1,
            items: summary.allocations.map((allocation, index) => {
              const company = input.portfolio[index];
              if (!company) {
                throw new Error(`Missing reserve input for allocation index ${index}`);
              }

              return {
                companyId: company.id,
                plannedReservesCents: toCents(allocation.allocation),
                maxAllocationCents: null,
                allocationReason: `Optimized reserve recommendation: ${allocation.rationale}`,
              };
            }),
          },
        },
      },
    ],
  };
}

export async function createReserveOptimizationScenarioSet(
  fundId: number,
  request: CreateReserveOptimizationScenarioSetV1,
  actor: FundScenarioMutationActor,
  options: { idempotencyKey?: string | null } = {}
): Promise<FundScenarioSetDetailV1> {
  const portfolio = await transaction(async (client) => {
    await verifyFundExists(client, fundId, { forUpdate: true });
    return buildReservePortfolioInputForClient(client, fundId);
  });

  const scenarioSetInput = buildReserveOptimizationScenarioSetInput({
    fundId,
    portfolio,
    request,
    idempotencyKey: options.idempotencyKey,
  });

  return createFundScenarioSet(fundId, scenarioSetInput, actor, options);
}
```

- [ ] **Step 4: Run GREEN for service tests**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/fund-scenario-reserve-optimization-workflow-service.test.ts --project=server
```

Expected: PASS.

---

### Task 3: Existing-Family Route

**Files:**

- Modify: `server/routes/fund-scenario-sets.ts`
- Modify: `tests/unit/routes/fund-scenario-sets-route-contract.test.ts`

- [ ] **Step 1: Implement the route**

Import the request schema and service, then add:

```ts
router.post(
  '/funds/:fundId/scenario-sets/reserve-optimization',
  requireAuth(),
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) {
      return;
    }

    const parsed = CreateReserveOptimizationScenarioSetV1Schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendBodyValidationError(res, parsed.error, 'Invalid reserve optimization scenario payload');
      return;
    }

    const scenarioSet = await createReserveOptimizationScenarioSet(
      fundId,
      parsed.data,
      parseActor(req),
      { idempotencyKey: getIdempotencyKey(req) }
    );
    return res.status(201).json(scenarioSet);
  })
);
```

- [ ] **Step 2: Run route contract tests**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/routes/fund-scenario-sets-route-contract.test.ts --project=server
```

Expected: PASS.

---

### Task 4: Scenario Workspace Action

**Files:**

- Modify: `client/src/pages/fund-scenario-workspace.tsx`
- Modify: `tests/unit/pages/fund-scenario-workspace.test.tsx`

- [ ] **Step 1: Write failing workspace test**

Add a test that clicks the new action:

```tsx
it('creates an optimized reserve scenario set from the workspace', async () => {
  mockWorkspaceFetches();
  renderWorkspace();

  fireEvent.click(await screen.findByRole('button', { name: /create optimized reserve plan/i }));

  await waitFor(() => {
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/funds/123/scenario-sets/reserve-optimization',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
```

Extend `mockWorkspaceFetches()` with a `POST` response for the new endpoint returning a valid `FundScenarioSetDetailV1`.

- [ ] **Step 2: Run RED for workspace test**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/pages/fund-scenario-workspace.test.tsx --project=client
```

Expected: FAIL because the action does not exist.

- [ ] **Step 3: Implement the workspace action**

Add a local helper:

```ts
async function createReserveOptimizationScenarioSet(fundId: string) {
  const raw = await apiRequest(
    'POST',
    scenarioApiPath(fundId, '/scenario-sets/reserve-optimization'),
    {}
  );
  return FundScenarioSetDetailV1Schema.parse(raw);
}
```

Add a `useMutation()` that calls the helper, invalidates `workspaceQueryKey(fundId)`, and renders a button in the page header:

```tsx
<Button
  type="button"
  variant="outline"
  onClick={() => createReserveOptimizationMutation.mutate()}
  disabled={createReserveOptimizationMutation.isPending}
>
  {createReserveOptimizationMutation.isPending && (
    <RefreshCw className="h-4 w-4 animate-spin" />
  )}
  {createReserveOptimizationMutation.isPending
    ? 'Creating'
    : 'Create optimized reserve plan'}
</Button>
```

- [ ] **Step 4: Run GREEN for workspace test**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/pages/fund-scenario-workspace.test.tsx --project=client
```

Expected: PASS.

---

### Task 5: Required Verification And Publication

**Files:** All files changed by Tasks 1-4.

- [ ] **Step 1: Regenerate docs routing**

Run:

```bash
npm run docs:routing:generate
```

Expected: exits 0. Commit generated routing artifacts if they changed.

- [ ] **Step 2: Run focused verification**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/contract/fund-scenario-sets.test.ts tests/unit/routes/fund-scenario-sets-route-contract.test.ts tests/unit/services/fund-scenario-reserve-optimization-workflow-service.test.ts --project=server
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/pages/fund-scenario-workspace.test.tsx --project=client
```

Expected: PASS.

- [ ] **Step 3: Run required gates**

Run:

```bash
npm run check
npm run lint
npm run test:scenario-release-gate
git diff --check
git status --short --branch
```

Expected: all pass, except local `test:scenario-release-gate` may explicitly skip container-backed cases when Testcontainers are unavailable.

- [ ] **Step 4: Commit, push, and open PR**

Use the Lore Commit Protocol with:

```text
Create reserve optimization scenarios through the release workflow

Constraint: Reserve optimization must reuse ADR-022 scenario-set persistence and the existing async reserve calculation lane
Rejected: Add a parallel optimization store or route family | scenario sets already provide the release-hardened workflow boundary
Confidence: medium
Scope-risk: moderate
Tested: focused contract, route, service, and workspace tests; npm run check; npm run lint; npm run test:scenario-release-gate; git diff --check
Co-authored-by: OmX <omx@oh-my-codex.dev>
```

## Self-Review

- Spec coverage: The plan implements only reserve optimization workflow creation and preserves the existing calculation lane, scenario contracts, canonical hash behavior, and PR #730 override behavior.
- Placeholder scan: No TBD, TODO, or deferred-fill wording remains.
- Type consistency: The workflow emits existing `reserve_allocation` scenario sets and does not introduce a new override type or calculation mode.
