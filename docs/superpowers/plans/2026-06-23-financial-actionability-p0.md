# Financial Actionability P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Portfolio Intelligence from returning or persisting fabricated
financial success outputs, while preserving existing auth, validation, and
durable CRUD behavior.

**Architecture:** Treat the current Portfolio Intelligence API as a default-off
prototype surface. Keep durable CRUD routes working, add a shared financial
provenance contract, make prototype financial computation routes fail closed
with `501`, register the server-only feature flag in the canonical registry, and
add executable route/placeholder guardrails. Persistence quarantine, KPI
contract reconciliation, Monte Carlo facade wiring, and reserve/MOIC ownership
are deliberately follow-up plans after this P0 lands.

**Tech Stack:** TypeScript, Express, Zod, Vitest, Supertest, YAML flag registry
plus `npm run flags:generate`, existing Node scripts. No new dependencies.

---

## Current State Refresh

Verified on 2026-06-23:

- Local branch: `main`.
- Local HEAD: `a5b01482bb09181dd3dc7032a3bf9c228060a259`.
- `origin/main`: `a5b01482bb09181dd3dc7032a3bf9c228060a259`.
- GitHub commit statuses for that SHA: `worthy-integrity - Updog_restore`
  success and `Vercel` success.
- Local checkout has unrelated dirt: `.claude/settings.json`,
  `.claude/artifacts/`, `.session-memory.json`, and existing untracked
  plan/review docs. Preserve it.
- `server/config/features.ts` still defines `portfolioIntelligence` from
  `ENABLE_PORTFOLIO_INTELLIGENCE`, default false.
- `server/routes.ts` mounts `server/routes/portfolio-intelligence.ts` only when
  `FEATURES.portfolioIntelligence` is true.
- `flags/registry.yaml` and generated flag files do not define
  `enable_portfolio_intelligence`.
- `shared/contracts/financial-provenance.contract.ts` does not exist.
- `server/routes/portfolio-intelligence.ts` still contains placeholder financial
  success responses for simulation, reserve optimization, backtest, forecast
  generation, forecast validation, quick scenario, and metrics.
- `client/src/pages/kpi-manager/KpiDefinitionModal.tsx` still closes on save
  without persistence, and KPI contract contradictions remain. Those are not in
  this P0.

## Scope Cut

This plan implements only the P0 false-success blockade.

Out of scope for this plan:

- DB provenance columns and quarantine scripts.
- KPI raw-facts versus computed-summary reconciliation.
- Monte Carlo facade ownership.
- Reserve/MOIC canonical pure implementation.
- UI honesty badges for every consuming page.
- Dependency cleanup.

Those require separate plans after this P0 passes because they touch independent
subsystems and cannot be safely batched into the first financial firebreak.

## File Structure

| File                                                                 | Responsibility                                                                         | Action     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------- |
| `shared/contracts/financial-provenance.contract.ts`                  | Shared Zod provenance/actionability contract                                           | Create     |
| `tests/unit/contract/financial-provenance.contract.test.ts`          | Contract invariants                                                                    | Create     |
| `server/lib/portfolio-prototype-block.ts`                            | Response builder for blocked prototype financial routes                                | Create     |
| `server/routes/portfolio-intelligence.ts`                            | Preserve CRUD, convert prototype computations to `501`, add static-template provenance | Modify     |
| `tests/unit/api/portfolio-intelligence.test.ts`                      | Update existing route expectations from fake success to fail-closed behavior           | Modify     |
| `tests/fixtures/portfolio-intelligence-route-classification.ts`      | Executable route classification registry for this API surface                          | Create     |
| `tests/unit/contract/portfolio-intelligence-route-inventory.test.ts` | Route drift and classification guard                                                   | Create     |
| `flags/registry.yaml`                                                | Canonical flag metadata                                                                | Modify     |
| `shared/generated/flag-types.ts`                                     | Generated flag type surface                                                            | Regenerate |
| `shared/generated/flag-defaults.ts`                                  | Generated flag defaults and aliases                                                    | Regenerate |
| `tests/unit/flags/portfolio-intelligence-flag.test.ts`               | Flag registry/default regression                                                       | Create     |
| `scripts/guardrails/no-portfolio-placeholder-financial-success.mjs`  | Text tripwire for known placeholder literals in the route file                         | Create     |
| `package.json`                                                       | Add guardrail script and include it in `guardrails:check`                              | Modify     |

## Task 1: Add The Financial Provenance Contract

**Files:**

- Create: `shared/contracts/financial-provenance.contract.ts`
- Create: `tests/unit/contract/financial-provenance.contract.test.ts`

- [ ] **Step 1: Write the failing contract tests**

Create `tests/unit/contract/financial-provenance.contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FinancialProvenanceSchema } from '../../../shared/contracts/financial-provenance.contract';

const computedActionable = {
  sourceKind: 'computed',
  actionability: 'actionable',
  sourceEngine: 'monte-carlo-facade',
  engineVersion: '1.0.0',
  inputHash: 'input_sha256_abc',
  assumptionsHash: 'assumptions_sha256_def',
  generatedAt: '2026-06-23T00:00:00.000Z',
  isFinanciallyActionable: true,
  warnings: [],
};

describe('FinancialProvenanceSchema', () => {
  it('accepts computed actionable provenance with engine and hash evidence', () => {
    expect(FinancialProvenanceSchema.parse(computedActionable)).toEqual(
      computedActionable
    );
  });

  it('rejects actionable static template provenance', () => {
    const result = FinancialProvenanceSchema.safeParse({
      ...computedActionable,
      sourceKind: 'static_template',
    });

    expect(result.success).toBe(false);
  });

  it('rejects computed actionable provenance without required evidence', () => {
    const result = FinancialProvenanceSchema.safeParse({
      sourceKind: 'computed',
      actionability: 'actionable',
      generatedAt: '2026-06-23T00:00:00.000Z',
      isFinanciallyActionable: true,
      warnings: [],
    });

    expect(result.success).toBe(false);
  });

  it('accepts blocked prototype provenance as non-actionable', () => {
    const result = FinancialProvenanceSchema.parse({
      sourceKind: 'prototype_blocked',
      actionability: 'non_actionable',
      generatedAt: '2026-06-23T00:00:00.000Z',
      sourceRoute: 'POST /api/portfolio/scenarios/:id/simulate',
      isFinanciallyActionable: false,
      quarantineReason: 'prototype_financial_output_blocked',
      warnings: ['Prototype financial output route is disabled.'],
    });

    expect(result.isFinanciallyActionable).toBe(false);
  });

  it('rejects unknown keys so response contracts stay explicit', () => {
    const result = FinancialProvenanceSchema.safeParse({
      ...computedActionable,
      sampleFallback: true,
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cross-env TZ=UTC vitest run tests/unit/contract/financial-provenance.contract.test.ts --project=server
```

Expected: FAIL because `shared/contracts/financial-provenance.contract.ts` does
not exist.

- [ ] **Step 3: Add the contract**

Create `shared/contracts/financial-provenance.contract.ts`:

```ts
import { z } from 'zod';

export const FinancialSourceKindSchema = z.enum([
  'computed',
  'imported_actual',
  'user_assumption',
  'static_template',
  'demo_seed',
  'prototype_blocked',
  'legacy_unknown',
]);

export const FinancialActionabilitySchema = z.enum([
  'actionable',
  'input_only',
  'non_actionable',
  'quarantined',
  'unknown_legacy',
]);

export const FinancialProvenanceSchema = z
  .object({
    sourceKind: FinancialSourceKindSchema,
    actionability: FinancialActionabilitySchema,
    sourceEngine: z.string().min(1).optional(),
    engineVersion: z.string().min(1).optional(),
    calculationVersion: z.string().min(1).optional(),
    inputHash: z.string().min(1).optional(),
    assumptionsHash: z.string().min(1).optional(),
    scenarioHash: z.string().min(1).optional(),
    generatedAt: z.string().datetime(),
    generatedBy: z.union([z.string().min(1), z.number()]).optional(),
    sourceRoute: z.string().min(1).optional(),
    sourceCommitSha: z.string().min(7).optional(),
    isFinanciallyActionable: z.boolean(),
    quarantineReason: z.string().min(1).optional(),
    warnings: z.array(z.string()).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.isFinanciallyActionable &&
      value.sourceKind !== 'computed' &&
      value.sourceKind !== 'imported_actual'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isFinanciallyActionable'],
        message:
          'Only computed or imported_actual results may be financially actionable',
      });
    }

    if (value.isFinanciallyActionable && value.sourceKind === 'computed') {
      for (const field of [
        'sourceEngine',
        'engineVersion',
        'inputHash',
        'assumptionsHash',
      ]) {
        if (!value[field as keyof typeof value]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `Computed actionable result requires ${field}`,
          });
        }
      }
    }
  });

export type FinancialSourceKind = z.infer<typeof FinancialSourceKindSchema>;
export type FinancialActionability = z.infer<
  typeof FinancialActionabilitySchema
>;
export type FinancialProvenance = z.infer<typeof FinancialProvenanceSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cross-env TZ=UTC vitest run tests/unit/contract/financial-provenance.contract.test.ts --project=server
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/contracts/financial-provenance.contract.ts tests/unit/contract/financial-provenance.contract.test.ts
git commit -m "Define financial actionability provenance"
```

Use the repo's Lore trailer format in the real commit body.

## Task 2: Add A Shared Prototype Block Response Builder

**Files:**

- Create: `server/lib/portfolio-prototype-block.ts`
- Test: covered through route tests in Task 3

- [ ] **Step 1: Add the route block helper**

Create `server/lib/portfolio-prototype-block.ts`:

```ts
import type { FinancialProvenance } from '@shared/contracts/financial-provenance.contract';

export type PortfolioPrototypeRouteId =
  | 'portfolio.scenarios.compare'
  | 'portfolio.scenario.simulate'
  | 'portfolio.reserves.optimize'
  | 'portfolio.reserves.backtest'
  | 'portfolio.forecasts.create'
  | 'portfolio.forecasts.validate'
  | 'portfolio.quickScenario.create'
  | 'portfolio.metrics.read';

type BuildPrototypeBlockedInput = {
  routeId: PortfolioPrototypeRouteId;
  sourceRoute: string;
  replacement?: string;
};

export function makePrototypeBlockedProvenance(
  sourceRoute: string
): FinancialProvenance {
  return {
    sourceKind: 'prototype_blocked',
    actionability: 'non_actionable',
    generatedAt: new Date().toISOString(),
    sourceRoute,
    isFinanciallyActionable: false,
    quarantineReason: 'prototype_financial_output_blocked',
    warnings: ['Prototype financial output route is disabled.'],
  };
}

export function buildPrototypeFinancialBlockedError(
  input: BuildPrototypeBlockedInput
) {
  return {
    error: 'not_implemented',
    code: 'PROTOTYPE_FINANCIAL_OUTPUT_BLOCKED',
    routeId: input.routeId,
    message:
      'This route is disabled because it previously returned non-computed financial outputs.',
    ...(input.replacement ? { replacement: input.replacement } : {}),
    provenance: makePrototypeBlockedProvenance(input.sourceRoute),
  };
}

export function makeStaticTemplateProvenance(
  sourceRoute: string
): FinancialProvenance {
  return {
    sourceKind: 'static_template',
    actionability: 'non_actionable',
    generatedAt: new Date().toISOString(),
    sourceRoute,
    isFinanciallyActionable: false,
    warnings: ['Static template values are not computed from fund data.'],
  };
}
```

- [ ] **Step 2: Run TypeScript baseline**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/lib/portfolio-prototype-block.ts
git commit -m "Centralize prototype financial block responses"
```

Use the repo's Lore trailer format in the real commit body.

## Task 3: Update Portfolio Intelligence Route Tests First

**Files:**

- Modify: `tests/unit/api/portfolio-intelligence.test.ts`

- [ ] **Step 1: Import route block assertion helpers**

In `tests/unit/api/portfolio-intelligence.test.ts`, add this helper near
`createTestApp`:

```ts
const expectPrototypeBlocked = (
  body: Record<string, unknown>,
  routeId: string
) => {
  expect(body.error).toBe('not_implemented');
  expect(body.code).toBe('PROTOTYPE_FINANCIAL_OUTPUT_BLOCKED');
  expect(body.routeId).toBe(routeId);
  expect(body.provenance).toMatchObject({
    sourceKind: 'prototype_blocked',
    actionability: 'non_actionable',
    isFinanciallyActionable: false,
    quarantineReason: 'prototype_financial_output_blocked',
  });
  expect(
    Date.parse((body.provenance as { generatedAt: string }).generatedAt)
  ).not.toBeNaN();
};
```

- [ ] **Step 2: Replace scenario comparison success expectation**

In the `POST /api/portfolio/scenarios/compare` happy-path test, replace the
success assertions with:

```ts
const response = await request(app)
  .post('/api/portfolio/scenarios/compare')
  .send(validComparisonData)
  .expect(501);

expectPrototypeBlocked(response.body, 'portfolio.scenarios.compare');
expect(response.body.replacement).toBe('/api/funds/:fundId/scenarios/compare');
```

- [ ] **Step 3: Replace simulation success expectation and prove no write**

In the `POST /api/portfolio/scenarios/:id/simulate` happy-path test, replace the
success assertions with:

```ts
const createSimulation = vi.spyOn(
  portfolioIntelligenceService.simulations,
  'create'
);

const response = await request(app)
  .post(`/api/portfolio/scenarios/${scenarioId}/simulate`)
  .send(validSimulationData)
  .expect(501);

expectPrototypeBlocked(response.body, 'portfolio.scenario.simulate');
expect(response.body.replacement).toBe('/api/monte-carlo/simulate');
expect(createSimulation).not.toHaveBeenCalled();
```

- [ ] **Step 4: Replace reserve optimization success expectation and prove no
      write**

In the `POST /api/portfolio/reserves/optimize` happy-path test, replace the
success assertions with:

```ts
const createReserveStrategy = vi.spyOn(
  portfolioIntelligenceService.reserves,
  'create'
);

const response = await request(app)
  .post('/api/portfolio/reserves/optimize?fundId=1')
  .send(validOptimizationData)
  .expect(501);

expectPrototypeBlocked(response.body, 'portfolio.reserves.optimize');
expect(response.body.replacement).toBe('/api/funds/:fundId/reserves/optimize');
expect(createReserveStrategy).not.toHaveBeenCalled();
```

- [ ] **Step 5: Replace reserve backtest success expectation**

In the `POST /api/portfolio/reserves/backtest` happy-path test, replace the
success assertions with:

```ts
const response = await request(app)
  .post('/api/portfolio/reserves/backtest')
  .send(validBacktestData)
  .expect(501);

expectPrototypeBlocked(response.body, 'portfolio.reserves.backtest');
expect(testStorage.backtests.size).toBe(0);
```

- [ ] **Step 6: Replace forecast generation success expectation**

In the `POST /api/portfolio/forecasts` happy-path test, replace the success
assertions with:

```ts
const response = await request(app)
  .post('/api/portfolio/forecasts?fundId=1')
  .send(validForecastData)
  .expect(501);

expectPrototypeBlocked(response.body, 'portfolio.forecasts.create');
expect(testStorage.forecasts.size).toBe(0);
```

- [ ] **Step 7: Replace forecast validation success expectation and prove no
      update**

In the `POST /api/portfolio/forecasts/validate` happy-path test, replace the
success assertions with:

```ts
const updateForecast = vi.spyOn(
  portfolioIntelligenceService.forecasts,
  'update'
);

const response = await request(app)
  .post('/api/portfolio/forecasts/validate')
  .send(validValidationData)
  .expect(501);

expectPrototypeBlocked(response.body, 'portfolio.forecasts.validate');
expect(updateForecast).not.toHaveBeenCalled();
```

- [ ] **Step 8: Replace quick scenario success expectation**

In the `POST /api/portfolio/quick-scenario` happy-path test, replace the success
assertions with:

```ts
const response = await request(app)
  .post('/api/portfolio/quick-scenario')
  .send(validQuickScenarioData)
  .expect(501);

expectPrototypeBlocked(response.body, 'portfolio.quickScenario.create');
expect(testStorage.quickScenarios.size).toBe(0);
```

- [ ] **Step 9: Replace quick scenario comparison test**

Replace the test named
`should generate different projections for different risk profiles` with:

```ts
it('blocks quick-scenario projection generation for every risk profile', async () => {
  for (const riskProfile of ['aggressive', 'conservative', 'moderate']) {
    const response = await request(app)
      .post('/api/portfolio/quick-scenario')
      .send({ ...validQuickScenarioData, riskProfile })
      .expect(501);

    expectPrototypeBlocked(response.body, 'portfolio.quickScenario.create');
  }
});
```

- [ ] **Step 10: Replace metrics success expectation**

In the `GET /api/portfolio/metrics/:scenarioId` happy-path test, replace the
success assertions with:

```ts
const response = await request(app)
  .get('/api/portfolio/metrics/scenario_123')
  .expect(501);

expectPrototypeBlocked(response.body, 'portfolio.metrics.read');
expect(response.body.replacement).toBe('/api/events/fund/:fundId');
```

- [ ] **Step 11: Update template test to assert non-actionable provenance**

In the `GET /api/portfolio/templates` happy-path test, keep status `200` and
add:

```ts
expect(response.body.provenance).toMatchObject({
  sourceKind: 'static_template',
  actionability: 'non_actionable',
  isFinanciallyActionable: false,
});

for (const template of response.body.data) {
  expect(template.provenance).toMatchObject({
    sourceKind: 'static_template',
    actionability: 'non_actionable',
    isFinanciallyActionable: false,
  });
}
```

- [ ] **Step 12: Run test to verify it fails before route changes**

Run:

```bash
cross-env TZ=UTC vitest run tests/unit/api/portfolio-intelligence.test.ts --project=server
```

Expected: FAIL because routes still return `success: true` for prototype
financial outputs.

- [ ] **Step 13: Commit test changes after implementation passes**

Do not commit this task until Task 4 is complete and the test passes.

## Task 4: Make Prototype Financial Routes Fail Closed

**Files:**

- Modify: `server/routes/portfolio-intelligence.ts`

- [ ] **Step 1: Import the helper**

Add near existing imports:

```ts
import {
  buildPrototypeFinancialBlockedError,
  makeStaticTemplateProvenance,
} from '../lib/portfolio-prototype-block';
```

- [ ] **Step 2: Block scenario comparison after auth/validation**

In `POST /api/portfolio/scenarios/compare`, after validation and `userId` auth
checks, replace comparison creation and `success: true` response with:

```ts
return res.status(501).json(
  buildPrototypeFinancialBlockedError({
    routeId: 'portfolio.scenarios.compare',
    sourceRoute: 'POST /api/portfolio/scenarios/compare',
    replacement: '/api/funds/:fundId/scenarios/compare',
  })
);
```

- [ ] **Step 3: Block scenario simulation after scenario existence check**

In `POST /api/portfolio/scenarios/:id/simulate`, keep scenario ID validation,
request validation, auth, and scenario existence check. Replace hardcoded
`simulationResults`, `riskMetrics`, persistence, and `success: true` response
with:

```ts
return res.status(501).json(
  buildPrototypeFinancialBlockedError({
    routeId: 'portfolio.scenario.simulate',
    sourceRoute: 'POST /api/portfolio/scenarios/:id/simulate',
    replacement: '/api/monte-carlo/simulate',
  })
);
```

- [ ] **Step 4: Block reserve optimization after auth/validation**

In `POST /api/portfolio/reserves/optimize`, keep fund ID validation, request
validation, and auth. Replace hardcoded `optimalAllocation`,
`performanceProjection`, persistence, and `success: true` response with:

```ts
return res.status(501).json(
  buildPrototypeFinancialBlockedError({
    routeId: 'portfolio.reserves.optimize',
    sourceRoute: 'POST /api/portfolio/reserves/optimize',
    replacement: '/api/funds/:fundId/reserves/optimize',
  })
);
```

- [ ] **Step 5: Block reserve backtest after auth/validation**

In `POST /api/portfolio/reserves/backtest`, keep request validation and auth.
Replace in-memory storage mutation and `success: true` response with:

```ts
return res.status(501).json(
  buildPrototypeFinancialBlockedError({
    routeId: 'portfolio.reserves.backtest',
    sourceRoute: 'POST /api/portfolio/reserves/backtest',
    replacement: '/api/funds/:fundId/reserves/backtest',
  })
);
```

- [ ] **Step 6: Block forecast generation after auth/validation**

In `POST /api/portfolio/forecasts`, keep fund ID validation, request validation,
and auth. Replace in-memory storage mutation and `success: true` response with:

```ts
return res.status(501).json(
  buildPrototypeFinancialBlockedError({
    routeId: 'portfolio.forecasts.create',
    sourceRoute: 'POST /api/portfolio/forecasts',
    replacement: '/api/funds/:fundId/forecast-runs',
  })
);
```

- [ ] **Step 7: Block forecast validation after forecast existence check**

In `POST /api/portfolio/forecasts/validate`, keep request validation, auth, and
forecast existence check. Replace hardcoded accuracy metrics, update call, and
`success: true` response with:

```ts
return res.status(501).json(
  buildPrototypeFinancialBlockedError({
    routeId: 'portfolio.forecasts.validate',
    sourceRoute: 'POST /api/portfolio/forecasts/validate',
    replacement: '/api/funds/:fundId/forecast-runs/:forecastRunId/validation',
  })
);
```

- [ ] **Step 8: Add template provenance**

In `GET /api/portfolio/templates`, before `res.json`, add:

```ts
const routeProvenance = makeStaticTemplateProvenance(
  'GET /api/portfolio/templates'
);
const templatesWithProvenance = filteredTemplates.map((template) => ({
  ...template,
  provenance: routeProvenance,
}));
```

Replace the response body with:

```ts
res.json({
  success: true,
  data: templatesWithProvenance,
  count: templatesWithProvenance.length,
  provenance: routeProvenance,
});
```

- [ ] **Step 9: Block quick scenario after auth/validation**

In `POST /api/portfolio/quick-scenario`, keep request validation and auth.
Replace in-memory storage mutation and `success: true` response with:

```ts
return res.status(501).json(
  buildPrototypeFinancialBlockedError({
    routeId: 'portfolio.quickScenario.create',
    sourceRoute: 'POST /api/portfolio/quick-scenario',
    replacement: '/api/funds/:fundId/scenarios',
  })
);
```

- [ ] **Step 10: Block scenario metrics after scenario ID validation**

In `GET /api/portfolio/metrics/:scenarioId`, keep scenario ID validation.
Replace hardcoded metrics and `success: true` response with:

```ts
return res.status(501).json(
  buildPrototypeFinancialBlockedError({
    routeId: 'portfolio.metrics.read',
    sourceRoute: 'GET /api/portfolio/metrics/:scenarioId',
    replacement: '/api/events/fund/:fundId',
  })
);
```

- [ ] **Step 11: Run focused route tests**

Run:

```bash
cross-env TZ=UTC vitest run tests/unit/api/portfolio-intelligence.test.ts --project=server
```

Expected: PASS.

- [ ] **Step 12: Commit route and route-test changes**

```bash
git add server/routes/portfolio-intelligence.ts server/lib/portfolio-prototype-block.ts tests/unit/api/portfolio-intelligence.test.ts
git commit -m "Block prototype portfolio financial outputs"
```

Use the repo's Lore trailer format in the real commit body.

## Task 5: Add Executable Route Classification

**Files:**

- Create: `tests/fixtures/portfolio-intelligence-route-classification.ts`
- Create: `tests/unit/contract/portfolio-intelligence-route-inventory.test.ts`

- [ ] **Step 1: Add route classification fixture**

Create `tests/fixtures/portfolio-intelligence-route-classification.ts`:

```ts
export type PortfolioIntelligenceRouteClassification =
  | 'durable_crud'
  | 'durable_read'
  | 'static_template'
  | 'prototype_501';

export const portfolioIntelligenceRouteClassifications = [
  {
    method: 'post',
    path: '/api/portfolio/strategies',
    classification: 'durable_crud',
  },
  {
    method: 'get',
    path: '/api/portfolio/strategies/:fundId',
    classification: 'durable_read',
  },
  {
    method: 'put',
    path: '/api/portfolio/strategies/:id',
    classification: 'durable_crud',
  },
  {
    method: 'delete',
    path: '/api/portfolio/strategies/:id',
    classification: 'durable_crud',
  },
  {
    method: 'post',
    path: '/api/portfolio/scenarios',
    classification: 'durable_crud',
  },
  {
    method: 'get',
    path: '/api/portfolio/scenarios/:fundId',
    classification: 'durable_read',
  },
  {
    method: 'post',
    path: '/api/portfolio/scenarios/compare',
    classification: 'prototype_501',
  },
  {
    method: 'post',
    path: '/api/portfolio/scenarios/:id/simulate',
    classification: 'prototype_501',
  },
  {
    method: 'post',
    path: '/api/portfolio/reserves/optimize',
    classification: 'prototype_501',
  },
  {
    method: 'get',
    path: '/api/portfolio/reserves/strategies/:fundId',
    classification: 'durable_read',
  },
  {
    method: 'post',
    path: '/api/portfolio/reserves/backtest',
    classification: 'prototype_501',
  },
  {
    method: 'post',
    path: '/api/portfolio/forecasts',
    classification: 'prototype_501',
  },
  {
    method: 'get',
    path: '/api/portfolio/forecasts/:scenarioId',
    classification: 'durable_read',
  },
  {
    method: 'post',
    path: '/api/portfolio/forecasts/validate',
    classification: 'prototype_501',
  },
  {
    method: 'get',
    path: '/api/portfolio/templates',
    classification: 'static_template',
  },
  {
    method: 'post',
    path: '/api/portfolio/quick-scenario',
    classification: 'prototype_501',
  },
  {
    method: 'get',
    path: '/api/portfolio/metrics/:scenarioId',
    classification: 'prototype_501',
  },
] as const satisfies ReadonlyArray<{
  method: string;
  path: string;
  classification: PortfolioIntelligenceRouteClassification;
}>;
```

- [ ] **Step 2: Add route inventory drift test**

Create `tests/unit/contract/portfolio-intelligence-route-inventory.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { portfolioIntelligenceRouteClassifications } from '../../fixtures/portfolio-intelligence-route-classification';

const routeSource = readFileSync(
  resolve(process.cwd(), 'server/routes/portfolio-intelligence.ts'),
  'utf8'
);

const routePattern =
  /router\[['"`](get|post|put|delete)['"`]\]\(\s*['"`]([^'"`]+)['"`]/g;

function routeKey(method: string, path: string) {
  return `${method.toUpperCase()} ${path}`;
}

describe('Portfolio Intelligence route inventory', () => {
  it('classifies every route in server/routes/portfolio-intelligence.ts', () => {
    const actualRoutes = [...routeSource.matchAll(routePattern)].map((match) =>
      routeKey(match[1], match[2])
    );
    const classifiedRoutes = portfolioIntelligenceRouteClassifications.map(
      (route) => routeKey(route.method, route.path)
    );

    expect(new Set(actualRoutes)).toEqual(new Set(classifiedRoutes));
  });

  it('keeps every prototype financial route fail-closed', () => {
    const prototypeRoutes = portfolioIntelligenceRouteClassifications.filter(
      (route) => route.classification === 'prototype_501'
    );

    expect(
      prototypeRoutes.map((route) => routeKey(route.method, route.path)).sort()
    ).toEqual([
      'GET /api/portfolio/metrics/:scenarioId',
      'POST /api/portfolio/forecasts',
      'POST /api/portfolio/forecasts/validate',
      'POST /api/portfolio/quick-scenario',
      'POST /api/portfolio/reserves/backtest',
      'POST /api/portfolio/reserves/optimize',
      'POST /api/portfolio/scenarios/:id/simulate',
      'POST /api/portfolio/scenarios/compare',
    ]);
  });
});
```

- [ ] **Step 3: Run the route inventory test**

Run:

```bash
cross-env TZ=UTC vitest run tests/unit/contract/portfolio-intelligence-route-inventory.test.ts --project=server
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/portfolio-intelligence-route-classification.ts tests/unit/contract/portfolio-intelligence-route-inventory.test.ts
git commit -m "Classify portfolio intelligence routes"
```

Use the repo's Lore trailer format in the real commit body.

## Task 6: Register The Portfolio Intelligence Feature Flag

**Files:**

- Modify: `flags/registry.yaml`
- Modify: `shared/generated/flag-types.ts`
- Modify: `shared/generated/flag-defaults.ts`
- Create: `tests/unit/flags/portfolio-intelligence-flag.test.ts`

- [ ] **Step 1: Add the flag test**

Create `tests/unit/flags/portfolio-intelligence-flag.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ALL_FLAG_KEYS,
  CLIENT_FLAG_KEYS,
  isClientFlag,
  isFlagKey,
} from '@shared/generated/flag-types';
import {
  FLAG_ALIASES,
  FLAG_DEFINITIONS,
  FLAG_DEFAULTS,
} from '@shared/generated/flag-defaults';

describe('enable_portfolio_intelligence flag registration', () => {
  it('registers the server-only high-risk flag and keeps it default-off', () => {
    expect(ALL_FLAG_KEYS).toContain('enable_portfolio_intelligence');
    expect(isFlagKey('enable_portfolio_intelligence')).toBe(true);
    expect(CLIENT_FLAG_KEYS).not.toContain('enable_portfolio_intelligence');
    expect(isClientFlag('enable_portfolio_intelligence')).toBe(false);
    expect(FLAG_DEFAULTS.enable_portfolio_intelligence).toBe(false);
    expect(FLAG_DEFINITIONS.enable_portfolio_intelligence).toMatchObject({
      default: false,
      owner: 'analytics',
      risk: 'high',
      exposeToClient: false,
    });
    expect(FLAG_ALIASES.ENABLE_PORTFOLIO_INTELLIGENCE).toBe(
      'enable_portfolio_intelligence'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cross-env TZ=UTC vitest run tests/unit/flags/portfolio-intelligence-flag.test.ts --project=server
```

Expected: FAIL because generated flag files do not contain
`enable_portfolio_intelligence`.

- [ ] **Step 3: Add flag to registry**

Add this entry under the server-only or high-risk feature flags in
`flags/registry.yaml`:

```yaml
enable_portfolio_intelligence:
  default: false
  description:
    'Portfolio Intelligence API surface; disabled until financial actionability
    and provenance remediation are complete'
  owner: 'analytics'
  risk: high
  exposeToClient: false
  environments:
    development: false
    staging: false
    production: false
  dependencies: []
  expiresAt: null
  aliases: ['ENABLE_PORTFOLIO_INTELLIGENCE']
```

- [ ] **Step 4: Regenerate flag files**

Run:

```bash
npm run flags:generate
```

Expected output includes:

```text
Generating flag-types.ts...
Generating flag-defaults.ts...
```

- [ ] **Step 5: Run flag test**

Run:

```bash
cross-env TZ=UTC vitest run tests/unit/flags/portfolio-intelligence-flag.test.ts --project=server
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add flags/registry.yaml shared/generated/flag-types.ts shared/generated/flag-defaults.ts tests/unit/flags/portfolio-intelligence-flag.test.ts
git commit -m "Register portfolio intelligence feature flag"
```

Use the repo's Lore trailer format in the real commit body.

## Task 7: Add Placeholder Financial Success Guardrail

**Files:**

- Create: `scripts/guardrails/no-portfolio-placeholder-financial-success.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add the guardrail script**

Create `scripts/guardrails/no-portfolio-placeholder-financial-success.mjs`:

```js
#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';

const routePath = 'server/routes/portfolio-intelligence.ts';
const source = readFileSync(routePath, 'utf8');

const bannedLiterals = [
  'mean: { irr: 0.2, multiple: 2.5, dpi: 1.8 }',
  'median: { irr: 0.18, multiple: 2.3, dpi: 1.6 }',
  'percentiles: { p10: 0.12, p25: 0.15, p75: 0.25, p90: 0.3 }',
  'expectedIrr: 0.22',
  'expectedMultiple: 2.8',
  'riskAdjustedReturn: 0.18',
  'totalReturn: 0.22',
  'annualizedReturn: 0.18',
  'sharpeRatio: 1.5',
  'forecastPeriods: [',
  'confidenceIntervals: {',
  'mape: 0.12',
  'rmse: 0.08',
  'currentIrr: 0.18',
  'currentMultiple: 2.1',
  "dataFreshness: 'real-time'",
];

const violations = bannedLiterals.filter((literal) => source.includes(literal));

if (violations.length > 0) {
  console.error('[portfolio-placeholder-financial-success] failed');
  console.error(
    `  ${routePath} still contains blocked placeholder financial literals:`
  );
  for (const literal of violations) {
    console.error(`  - ${literal}`);
  }
  process.exitCode = 1;
} else {
  console.log('[portfolio-placeholder-financial-success] pass');
}
```

- [ ] **Step 2: Add package scripts**

In `package.json`, add:

```json
"guard:financial-placeholders:check": "node scripts/guardrails/no-portfolio-placeholder-financial-success.mjs"
```

Replace the existing `guardrails:check` value with:

```json
"guardrails:check": "npm run guard:console:check && npm run guard:eslint-disable:check && npm run guard:scripts:check && npm run guard:route-imports:check && npm run guard:financial-placeholders:check"
```

- [ ] **Step 3: Run the guardrail**

Run:

```bash
npm run guard:financial-placeholders:check
```

Expected: PASS after Task 4 removed the placeholder literals from
`server/routes/portfolio-intelligence.ts`.

- [ ] **Step 4: Run all guardrails**

Run:

```bash
npm run guardrails:check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/guardrails/no-portfolio-placeholder-financial-success.mjs package.json
git commit -m "Guard portfolio placeholder financial outputs"
```

Use the repo's Lore trailer format in the real commit body.

## Task 8: Run P0 Verification

**Files:**

- No new files.

- [ ] **Step 1: Run focused proof**

Run:

```bash
cross-env TZ=UTC vitest run tests/unit/contract/financial-provenance.contract.test.ts tests/unit/contract/portfolio-intelligence-route-inventory.test.ts tests/unit/api/portfolio-intelligence.test.ts tests/unit/flags/portfolio-intelligence-flag.test.ts --project=server
```

Expected: PASS.

- [ ] **Step 2: Run generated flag command idempotence check**

Run:

```bash
npm run flags:generate
git diff -- shared/generated/flag-types.ts shared/generated/flag-defaults.ts
```

Expected: no diff after the generated files are committed.

- [ ] **Step 3: Run core validation and guardrails**

Run:

```bash
npm run guardrails:check
npm run validate:core
```

Expected: PASS.

- [ ] **Step 4: Run full release proof**

Run:

```bash
npm run release:check
```

Expected: PASS.

If Windows local proof is blocked by Docker/Testcontainers or memory limits,
rerun in native WSL with supported Node 20 and:

```bash
export NODE_OPTIONS=--max-old-space-size=4096
npm run release:check
```

Expected: PASS or an exact failing release-check stage and error text.

- [ ] **Step 5: Run diff hygiene**

Run:

```bash
git diff --check HEAD --
git status --short
```

Expected: no whitespace errors. `git status --short` shows only files owned by
this P0 plus pre-existing unrelated dirt.

- [ ] **Step 6: Final commit if verification changed generated files**

If Task 8 produced any generated-file changes, commit them:

```bash
git add shared/generated/flag-types.ts shared/generated/flag-defaults.ts
git commit -m "Refresh generated flag outputs"
```

Use the repo's Lore trailer format in the real commit body.

## Acceptance Criteria

- `server/routes/portfolio-intelligence.ts` no longer contains the known
  hardcoded financial success literals.
- Durable CRUD routes in Portfolio Intelligence still return their existing
  success responses.
- Prototype financial computation routes return `501` after existing
  auth/validation checks.
- Prototype financial routes do not write to DB services or `app.locals` maps.
- `GET /api/portfolio/templates` remains available but returns non-actionable
  static-template provenance.
- `enable_portfolio_intelligence` exists in `flags/registry.yaml`, generated
  flag files, and stays default false in every environment.
- `guardrails:check` includes the new financial placeholder tripwire.
- `npm run release:check` is either green or has an exact reported blocking
  stage.

## Follow-Up Plan Boundaries

After this P0 merges, write separate plans in this order:

1. Persistence provenance and quarantine for existing placeholder rows.
2. KPI endpoint contract reconciliation and KPI Manager honest-save behavior.
3. Monte Carlo public facade and Portfolio Intelligence simulation delegation.
4. Reserve/MOIC canonical planned-reserves implementation.
5. UI actionability badges and quarantined-result hiding across client surfaces.
