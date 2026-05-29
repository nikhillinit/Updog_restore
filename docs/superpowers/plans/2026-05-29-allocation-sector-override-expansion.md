---
status: ACTIVE
last_updated: 2026-05-29
---

# Allocation And Sector Override Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand ADR-022 scenario sets to support allocation and sector-profile
overrides without changing existing hash semantics, reserve workflow behavior,
public URLs, or comparison contracts.

**Architecture:** Keep the expansion additive to the existing V1 scenario
contract. `allocation` and `sector_profile` variants use the existing
synchronous `/calculate` route and economics snapshot path; `reserve_allocation`
remains the only async worker-backed override type. Comparisons stay
fee-profile-only and return the existing unsupported status for allocation,
sector-profile, and reserve scenario sets.

**Tech Stack:** TypeScript, Zod contracts, Express route services, Drizzle
schema metadata, raw SQL migrations, Vitest unit tests, React workspace
compatibility.

---

## Inventory Summary

- `shared/contracts/fund-scenario-sets-v1.contract.ts` currently accepts only
  `fee_profile` and `reserve_allocation`.
- `fund_scenario_variants.override_type` is constrained by migration `0015` to
  `('fee_profile', 'reserve_allocation')`.
- `server/services/fund-scenario-calculation-service.ts` already applies a
  scenario override to `FundDraftWriteV1` before calling `runEconomicsModel()`;
  extend that path rather than creating a new endpoint.
- `server/services/fund-scenario-reserve-calculation-service.ts` and the worker
  queue stay unchanged except for shared type compatibility.
- `shared/lib/scenarios/scenario-input-envelope.ts` and
  `shared/lib/scenarios/canonicalize.ts` already provide canonical input
  hashing; only add enum values, not canonicalization behavior changes.
- `server/services/fund-scenario-comparison-service.ts` supports fee-profile
  comparison only. Keep allocation and sector-profile comparison fail-closed
  through `unsupported_override_type`.

## File Structure

- Modify: `shared/contracts/fund-scenario-sets-v1.contract.ts`
  - Add `allocation` and `sector_profile` override payload schemas.
  - Add sync calculation modes `sync_allocation` and `sync_sector_profile`.
  - Add economics result/summary variants for the new sync override types.
- Modify: `shared/lib/scenarios/scenario-input-envelope.ts`
  - Add the new override and sync calculation mode literals to hash envelope
    types only.
- Modify: `server/services/fund-scenario-calculation-run-service.ts`
  - Expand run identity type unions.
- Modify: `server/services/fund-scenario-calculation-service.ts`
  - Generalize fee-profile-only sync calculation into sync override calculation.
  - Apply allocation and sector-profile payloads to the parsed source config.
  - Preserve existing fee-profile behavior and snapshot dedupe.
- Modify: `shared/schema/fund.ts`
  - Expand the Drizzle override-type TypeScript union.
- Create:
  `server/db/migrations/0017_fund_scenario_allocation_sector_overrides.sql`
  - Replace the check constraint with the additive override-type set.
- Modify: `tests/helpers/scenario-migrations.ts`
  - Include `0017` for scenario integration helpers.
- Modify: `tests/unit/phase3/fund-scenario-sets-schema.test.ts`
  - Assert the new migration preserves prior values and adds only allocation and
    sector-profile values.
- Modify: `tests/unit/contract/fund-scenario-sets.test.ts`
  - Add contract red/green coverage for allocation and sector-profile payloads.
- Modify: `tests/unit/services/fund-scenario-calculation-service.test.ts`
  - Add red/green coverage that the sync calculation path applies each new
    payload and records distinct hash metadata.
- Modify: `tests/unit/services/fund-scenario-comparison-service.test.ts`
  - Add comparison fail-closed coverage for the new override types.
- Modify: `client/src/pages/fund-scenario-workspace.tsx`
  - Render labels for the new override types and continue routing them to
    `/calculate`.
- Modify: `client/src/components/fund-results/ScenarioSetsSummary.tsx`
  - Treat all sync economics result variants as TVPI-capable summaries.

---

### Task 1: Contract And Migration Guardrails

**Files:**

- Modify: `shared/contracts/fund-scenario-sets-v1.contract.ts`
- Modify: `shared/lib/scenarios/scenario-input-envelope.ts`
- Modify: `shared/schema/fund.ts`
- Create:
  `server/db/migrations/0017_fund_scenario_allocation_sector_overrides.sql`
- Modify: `tests/helpers/scenario-migrations.ts`
- Modify: `tests/unit/phase3/fund-scenario-sets-schema.test.ts`
- Modify: `tests/unit/contract/fund-scenario-sets.test.ts`

- [ ] **Step 1: Write failing contract tests**

Add tests proving:

```ts
expect(
  FundScenarioVariantOverrideV1Schema.safeParse({
    overrideType: 'allocation',
    payload: {
      allocations: [{ id: 'seed', category: 'Seed', percentage: 60 }],
      capitalPlanAllocations: [
        {
          id: 'seed-plan',
          name: 'Seed plan',
          entryRound: 'Seed',
          capitalAllocationPct: 60,
          initialCheckStrategy: 'amount',
          initialCheckAmount: 1_000_000,
          followOnStrategy: 'amount',
          followOnAmount: 500_000,
          followOnParticipationPct: 25,
          investmentHorizonMonths: 48,
        },
      ],
    },
  }).success
).toBe(true);

expect(
  FundScenarioVariantOverrideV1Schema.safeParse({
    overrideType: 'sector_profile',
    payload: {
      sectorProfiles: [
        { id: 'ai', name: 'AI Infrastructure', targetPercentage: 35 },
      ],
    },
  }).success
).toBe(true);
```

Also assert mixed override types in one scenario set still fail.

- [ ] **Step 2: Run failing contract tests**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/contract/fund-scenario-sets.test.ts --project=server
```

Expected: FAIL because the new override types are not accepted.

- [ ] **Step 3: Extend the contract additively**

Add:

```ts
export const FundScenarioOverrideTypeV1Schema = z.enum([
  'fee_profile',
  'reserve_allocation',
  'allocation',
  'sector_profile',
]);
```

Create strict payload schemas from `FundDraftWriteV1Schema`:

```ts
const AllocationOverridePayloadV1Schema = FundDraftWriteV1Schema.pick({
  allocations: true,
  capitalPlanAllocations: true,
})
  .partial()
  .strict()
  .refine(
    (value) =>
      value.allocations != null || value.capitalPlanAllocations != null,
    {
      message:
        'allocation override requires allocations or capitalPlanAllocations',
    }
  );

const SectorProfileOverridePayloadV1Schema = FundDraftWriteV1Schema.pick({
  sectorProfiles: true,
})
  .required()
  .strict()
  .refine((value) => value.sectorProfiles.length > 0, {
    message: 'sectorProfiles must include at least one profile',
    path: ['sectorProfiles'],
  });
```

Add literal override objects for `allocation` and `sector_profile`, include them
in `FundScenarioVariantOverrideV1Schema`, and add sync economics calculation
variant/result-summary schemas for those override types.

- [ ] **Step 4: Add migration guardrail**

Create
`server/db/migrations/0017_fund_scenario_allocation_sector_overrides.sql`:

```sql
-- 0017_fund_scenario_allocation_sector_overrides.sql
-- ADR-022: add allocation and sector-profile scenario override types.

BEGIN;

ALTER TABLE fund_scenario_variants
  DROP CONSTRAINT IF EXISTS fund_scenario_variants_override_type_check;

ALTER TABLE fund_scenario_variants
  ADD CONSTRAINT fund_scenario_variants_override_type_check
  CHECK (override_type IN (
    'fee_profile',
    'reserve_allocation',
    'allocation',
    'sector_profile'
  ));

COMMIT;
```

Add `0017_fund_scenario_allocation_sector_overrides.sql` to
`tests/helpers/scenario-migrations.ts`.

- [ ] **Step 5: Run contract and schema tests**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/contract/fund-scenario-sets.test.ts tests/unit/phase3/fund-scenario-sets-schema.test.ts --project=server
```

Expected: PASS.

---

### Task 2: Sync Calculation Expansion

**Files:**

- Modify: `server/services/fund-scenario-calculation-service.ts`
- Modify: `server/services/fund-scenario-calculation-run-service.ts`
- Modify: `shared/lib/scenarios/scenario-input-envelope.ts`
- Modify: `tests/unit/services/fund-scenario-calculation-service.test.ts`

- [ ] **Step 1: Write failing service tests**

Add tests proving `/calculate` applies allocation and sector-profile overrides
before `runEconomicsModel()`:

```ts
expect(runEconomicsModelMock).toHaveBeenCalledWith(
  expect.objectContaining({
    allocations: allocationOverride.payload.allocations,
    capitalPlanAllocations: allocationOverride.payload.capitalPlanAllocations,
  })
);
```

```ts
expect(runEconomicsModelMock).toHaveBeenCalledWith(
  expect.objectContaining({
    sectorProfiles: sectorProfileOverride.payload.sectorProfiles,
  })
);
```

Each test should assert snapshot metadata contains the matching `override_type`
and `calculation_mode`.

- [ ] **Step 2: Run failing service tests**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/fund-scenario-calculation-service.test.ts --project=server
```

Expected: FAIL because only fee-profile variants are allowed in the sync path.

- [ ] **Step 3: Generalize the sync path**

Add helpers:

```ts
type SyncScenarioOverrideType = Exclude<
  FundScenarioOverrideTypeV1,
  'reserve_allocation'
>;

function syncCalculationModeForOverrideType(
  overrideType: SyncScenarioOverrideType
): FundScenarioCalculationModeV1 {
  if (overrideType === 'fee_profile') return 'sync_fee_profile';
  if (overrideType === 'allocation') return 'sync_allocation';
  return 'sync_sector_profile';
}
```

Replace the fee-only assert with an assert that rejects only
`reserve_allocation` from `/calculate`.

Apply new payloads with:

```ts
function applySyncScenarioOverride(
  sourceConfig: FundDraftWriteV1,
  override: Extract<
    FundScenarioVariantOverrideV1,
    { overrideType: SyncScenarioOverrideType }
  >
): FundDraftWriteV1 {
  if (override.overrideType === 'fee_profile') {
    return applyFeeProfileOverride(sourceConfig, override);
  }
  if (override.overrideType === 'allocation') {
    return {
      ...sourceConfig,
      ...(override.payload.allocations
        ? { allocations: override.payload.allocations }
        : {}),
      ...(override.payload.capitalPlanAllocations
        ? { capitalPlanAllocations: override.payload.capitalPlanAllocations }
        : {}),
    };
  }
  return {
    ...sourceConfig,
    sectorProfiles: override.payload.sectorProfiles,
  };
}
```

Use the derived `calculationMode` and `overrideType` in hash envelopes,
calculation-run acquisition, metadata, payload parsing, and audit events.

- [ ] **Step 4: Run focused service tests**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/fund-scenario-calculation-service.test.ts tests/unit/scenarios/scenario-input-hash.test.ts --project=server
```

Expected: PASS.

---

### Task 3: Compatibility Surfaces

**Files:**

- Modify: `server/services/fund-scenario-comparison-service.ts`
- Modify: `tests/unit/services/fund-scenario-comparison-service.test.ts`
- Modify: `client/src/pages/fund-scenario-workspace.tsx`
- Modify: `client/src/components/fund-results/ScenarioSetsSummary.tsx`
- Modify: `tests/unit/pages/fund-scenario-workspace.test.tsx`
- Modify: `tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx`

- [ ] **Step 1: Write failing compatibility tests**

Add comparison tests that `allocation` and `sector_profile` scenario sets
return:

```ts
expect(result.comparisonStatus).toBe('unsupported_override_type');
expect(result.unavailableReason).toBe('UNSUPPORTED_OVERRIDE_TYPE');
```

Add workspace tests that the new override types render readable badges and use
the existing `/calculate` endpoint.

- [ ] **Step 2: Run failing compatibility tests**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/fund-scenario-comparison-service.test.ts tests/unit/pages/fund-scenario-workspace.test.tsx tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx --project=client --project=server
```

Expected: FAIL until labels and type unions are updated.

- [ ] **Step 3: Update compatibility code**

Add label helpers in the workspace:

```ts
const OVERRIDE_TYPE_LABELS: Record<FundScenarioOverrideTypeV1, string> = {
  fee_profile: 'Fee profile',
  reserve_allocation: 'Reserve allocation',
  allocation: 'Allocation',
  sector_profile: 'Sector profile',
};
```

Keep route selection unchanged except that only `reserve_allocation` queues
through `/calculate-reserve`; all other override types use `/calculate`.

In `ScenarioSetsSummary`, treat any variant with `economicsSummary` as eligible
for the existing TVPI summary and keep reserve metrics on `reserve_allocation`
only.

- [ ] **Step 4: Run compatibility tests**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/fund-scenario-comparison-service.test.ts tests/unit/pages/fund-scenario-workspace.test.tsx tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx --project=client --project=server
```

Expected: PASS.

---

### Task 4: Required Verification And Publication

**Files:**

- Modify only the files touched in Tasks 1-3.

- [ ] **Step 1: Run docs routing if this plan changed inventory**

Run:

```bash
npm run docs:routing:generate
```

Expected: generator exits 0. Commit generated routing artifacts if they changed.

- [ ] **Step 2: Run required gates**

Run:

```bash
npx vitest run --config vitest.config.mjs --configLoader native tests/unit/contract/fund-scenario-sets.test.ts tests/unit/phase3/fund-scenario-sets-schema.test.ts tests/unit/services/fund-scenario-calculation-service.test.ts tests/unit/services/fund-scenario-comparison-service.test.ts tests/unit/pages/fund-scenario-workspace.test.tsx tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx tests/unit/scenarios/scenario-input-hash.test.ts --project=server --project=client
npm run check
npm run lint
npm run test:scenario-release-gate
git diff --check
git status --short --branch
```

Expected: all pass, except local `test:scenario-release-gate` may explicitly
skip container-backed cases when Testcontainers are unavailable.

- [ ] **Step 3: Commit, push, and open PR**

Use the Lore Commit Protocol with:

```text
Expand scenario overrides after release hardening proved the lifecycle

Constraint: Allocation and sector-profile overrides must reuse ADR-022 scenario routes and snapshots without changing canonicalization or reserve workflow behavior
Rejected: Add new scenario endpoints | existing scenario-set create and calculate routes already provide the bounded V1 extension point
Confidence: medium
Scope-risk: moderate
Tested: focused scenario contract/service/UI tests; npm run check; npm run lint; npm run test:scenario-release-gate; git diff --check
Co-authored-by: OmX <omx@oh-my-codex.dev>
```

## Self-Review

- Spec coverage: The plan implements only allocation and sector-profile override
  expansion and leaves reserve optimization, forecast modes, cohort readiness,
  money refactors, config cleanup, route normalization, and Phoenix docs out of
  scope.
- Placeholder scan: No TBD or deferred implementation steps remain.
- Type consistency: Override types are `allocation` and `sector_profile`;
  calculation modes are `sync_allocation` and `sync_sector_profile`; reserve
  remains `async_reserve_allocation`.
