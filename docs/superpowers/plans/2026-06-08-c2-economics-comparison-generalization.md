# C2: Economics Comparison Generalization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend scenario comparison from fee-profile-only to all
economics-backed override types (`fee_profile`, `allocation`, `sector_profile`,
`methodology`) by widening the shared contract, generalizing the server gate and
variant mapper, updating frontend badge maps and type guards, renaming the
cross-set predicate, and keeping `reserve_allocation` as the only unsupported
type.

**Architecture:** Contract-first: widen
`ScenarioComparisonVariantV1Schema.overrideType` first so TypeScript enforces
completeness on badge maps. Server uses a positive
`ECONOMICS_COMPARISON_OVERRIDE_TYPES` allowlist (not a negative "not reserve"
check) so future types fail closed. Frontend changes are additive type-guard and
badge-label expansions — no structural layout changes.

**Tech Stack:** TypeScript, Zod, Node.js/Express, React 18, Vitest, React
Testing Library.

---

## File Map

| File                                                                          | Change                                                           |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `shared/contracts/fund-scenario-comparison-v1.contract.ts`                    | Widen `overrideType` literal → enum                              |
| `server/services/fund-scenario-comparison-service.ts`                         | Add allowlist + `economicsVariants()` + defensive snapshot check |
| `client/src/components/fund-results/ScenarioComparisonTable.tsx`              | Expand badge label map                                           |
| `client/src/components/fund-results/ScenarioSetsSummary.tsx`                  | Add `methodology` to type guard                                  |
| `client/src/components/fund-results/CrossSetScenarioComparisonTable.tsx`      | Rename predicate, expand badge map, update copy                  |
| `client/src/components/fund-results/index.ts`                                 | Rename export                                                    |
| `client/src/pages/fund-model-results.tsx`                                     | Update import and two call sites                                 |
| `tests/unit/contract/fund-scenario-comparison-v1.contract.test.ts`            | Add variant type boundary tests                                  |
| `tests/unit/services/fund-scenario-comparison-service.test.ts`                | Flip allocation/sector tests, add methodology + corrupt-snapshot |
| `tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx`         | Add methodology badge test                                       |
| `tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx`             | Add methodology card test                                        |
| `tests/unit/components/fund-results/CrossSetScenarioComparisonTable.test.tsx` | Update copy assertions, add economics-type badge tests           |
| `tests/unit/pages/fund-scenario-workspace.test.tsx`                           | Add methodology to payload, widen comparison mock                |

---

## Task 1: Widen shared contract + fix forced TypeScript badge-map errors

The contract change immediately causes TypeScript compile errors in two
badge-label `Record` declarations. Fix them in the same task so `npm run check`
stays green throughout.

**Files:**

- Modify: `shared/contracts/fund-scenario-comparison-v1.contract.ts:113`
- Modify: `client/src/components/fund-results/ScenarioComparisonTable.tsx:62-67`
- Modify:
  `client/src/components/fund-results/CrossSetScenarioComparisonTable.tsx:59-64`
- Modify: `tests/unit/contract/fund-scenario-comparison-v1.contract.test.ts`

- [ ] **Step 1.1: Add failing contract tests for new override types**

  In `tests/unit/contract/fund-scenario-comparison-v1.contract.test.ts`, add
  four new tests inside the existing
  `describe('FundScenarioComparisonV1 contract', ...)` block, after the existing
  "accepts the strict scenario comparison payload" test:

  ```ts
  it('accepts methodology variants after contract widening', () => {
    const result = FundScenarioComparisonV1Schema.safeParse({
      fundId: 1,
      comparisonStatus: 'comparable',
      scenarioSet: {
        scenarioSetId: '11111111-1111-4111-8111-111111111111',
        name: 'Waterfall comparison',
        sourceConfigId: 10,
        sourceConfigVersion: 3,
      },
      baseline: { label: 'Authoritative baseline', metrics: metricMap },
      variants: [
        {
          variantId: '22222222-2222-4222-8222-222222222222',
          name: 'Hybrid waterfall',
          overrideType: 'methodology',
          metrics: metricMap,
          metricDeltas: [],
        },
      ],
      staleness: null,
      calculatedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts allocation variants after contract widening', () => {
    const result = FundScenarioComparisonV1Schema.safeParse({
      fundId: 1,
      comparisonStatus: 'comparable',
      scenarioSet: {
        scenarioSetId: '11111111-1111-4111-8111-111111111111',
        name: 'Allocation mix',
        sourceConfigId: 10,
        sourceConfigVersion: 3,
      },
      baseline: { label: 'Authoritative baseline', metrics: metricMap },
      variants: [
        {
          variantId: '22222222-2222-4222-8222-222222222222',
          name: 'Seed heavy',
          overrideType: 'allocation',
          metrics: metricMap,
          metricDeltas: [],
        },
      ],
      staleness: null,
      calculatedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts sector_profile variants after contract widening', () => {
    const result = FundScenarioComparisonV1Schema.safeParse({
      fundId: 1,
      comparisonStatus: 'comparable',
      scenarioSet: {
        scenarioSetId: '11111111-1111-4111-8111-111111111111',
        name: 'Sector mix',
        sourceConfigId: 10,
        sourceConfigVersion: 3,
      },
      baseline: { label: 'Authoritative baseline', metrics: metricMap },
      variants: [
        {
          variantId: '22222222-2222-4222-8222-222222222222',
          name: 'AI infrastructure',
          overrideType: 'sector_profile',
          metrics: metricMap,
          metricDeltas: [],
        },
      ],
      staleness: null,
      calculatedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects reserve_allocation overrideType in variant positions', () => {
    const result = FundScenarioComparisonV1Schema.safeParse({
      fundId: 1,
      comparisonStatus: 'comparable',
      scenarioSet: {
        scenarioSetId: '11111111-1111-4111-8111-111111111111',
        name: 'Reserve plan',
        sourceConfigId: 10,
        sourceConfigVersion: 3,
      },
      baseline: { label: 'Authoritative baseline', metrics: metricMap },
      variants: [
        {
          variantId: '22222222-2222-4222-8222-222222222222',
          name: 'Follow-on cap',
          overrideType: 'reserve_allocation',
          metrics: metricMap,
          metricDeltas: [],
        },
      ],
      staleness: null,
      calculatedAt: null,
    });
    expect(result.success).toBe(false);
  });
  ```

- [ ] **Step 1.2: Run contract tests to confirm they fail**

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/contract/fund-scenario-comparison-v1.contract.test.ts
  ```

  Expected: The three "accepts … variants" tests fail with schema validation
  errors. The "rejects reserve_allocation" test passes (reserve was never in the
  schema).

- [ ] **Step 1.3: Widen the contract**

  In `shared/contracts/fund-scenario-comparison-v1.contract.ts`, replace line
  113:

  ```ts
  // Before
  overrideType: z.literal('fee_profile'),

  // After
  overrideType: z.enum(['fee_profile', 'allocation', 'sector_profile', 'methodology']),
  ```

- [ ] **Step 1.4: Fix the TypeScript badge-map error in
      ScenarioComparisonTable.tsx**

  TypeScript now errors because `VARIANT_OVERRIDE_TYPE_BADGE_LABELS` is a
  `Record<ScenarioComparisonVariantV1['overrideType'], string>` missing three
  keys.

  In `client/src/components/fund-results/ScenarioComparisonTable.tsx`, replace
  the `VARIANT_OVERRIDE_TYPE_BADGE_LABELS` constant (lines 62–67):

  ```ts
  const VARIANT_OVERRIDE_TYPE_BADGE_LABELS: Record<
    ScenarioComparisonVariantV1['overrideType'],
    string
  > = {
    fee_profile: 'FEE PROFILE',
    allocation: 'ALLOCATION',
    sector_profile: 'SECTOR PROFILE',
    methodology: 'METHODOLOGY',
  };
  ```

  Also remove the now-stale comment above it:

  ```ts
  // The comparison contract currently admits only fee-profile variants; keying
  // the badge by overrideType prevents future set types from inheriting this label silently.
  ```

- [ ] **Step 1.5: Fix the TypeScript badge-map error in
      CrossSetScenarioComparisonTable.tsx**

  In `client/src/components/fund-results/CrossSetScenarioComparisonTable.tsx`,
  replace the `VARIANT_OVERRIDE_TYPE_BADGE_LABELS` constant and its preceding
  comment (lines 57–64):

  ```ts
  // All economics-backed comparison types use badge labels; the Record ensures any
  // future economics type added to the contract must also provide a badge label here.
  const VARIANT_OVERRIDE_TYPE_BADGE_LABELS: Record<
    FundScenarioComparisonV1['variants'][number]['overrideType'],
    string
  > = {
    fee_profile: 'FEE PROFILE',
    allocation: 'ALLOCATION',
    sector_profile: 'SECTOR PROFILE',
    methodology: 'METHODOLOGY',
  };
  ```

- [ ] **Step 1.6: Add ScenarioComparisonTable badge tests for new override
      types**

  In `tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx`, add
  three tests inside the existing `describe('ScenarioComparisonTable', ...)`
  block:

  ```ts
  it('renders METHODOLOGY badge for methodology variants', () => {
    const comparison: FundScenarioComparisonV1 = {
      ...comparableComparison(),
      variants: [
        {
          ...comparableComparison().variants[0]!,
          overrideType: 'methodology',
          name: 'Hybrid waterfall',
        },
      ],
    };
    render(<ScenarioComparisonTable comparison={comparison} />);
    expect(screen.getByText('METHODOLOGY')).toBeInTheDocument();
  });

  it('renders ALLOCATION badge for allocation variants', () => {
    const comparison: FundScenarioComparisonV1 = {
      ...comparableComparison(),
      variants: [
        {
          ...comparableComparison().variants[0]!,
          overrideType: 'allocation',
          name: 'Seed heavy',
        },
      ],
    };
    render(<ScenarioComparisonTable comparison={comparison} />);
    expect(screen.getByText('ALLOCATION')).toBeInTheDocument();
  });

  it('renders SECTOR PROFILE badge for sector_profile variants', () => {
    const comparison: FundScenarioComparisonV1 = {
      ...comparableComparison(),
      variants: [
        {
          ...comparableComparison().variants[0]!,
          overrideType: 'sector_profile',
          name: 'AI infrastructure',
        },
      ],
    };
    render(<ScenarioComparisonTable comparison={comparison} />);
    expect(screen.getByText('SECTOR PROFILE')).toBeInTheDocument();
  });
  ```

  Run to verify they pass (badge map was fixed in Step 1.4):

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx
  ```

  Expected: All tests pass.

- [ ] **Step 1.8: Verify contract tests and typecheck pass**

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/contract/fund-scenario-comparison-v1.contract.test.ts
  ```

  Expected: All tests pass including the three new "accepts … variants" tests.

  ```powershell
  & .\scripts\windows-node-env.ps1 npm.cmd run check
  ```

  Expected: Zero TypeScript errors.

- [ ] **Step 1.9: Commit**

  ```
  git add shared/contracts/fund-scenario-comparison-v1.contract.ts \
    client/src/components/fund-results/ScenarioComparisonTable.tsx \
    client/src/components/fund-results/CrossSetScenarioComparisonTable.tsx \
    tests/unit/contract/fund-scenario-comparison-v1.contract.test.ts \
    tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx
  git commit -m "feat(scenarios): widen comparison contract to all economics override types"
  ```

---

## Task 2: Service allowlist, gate flip, economicsVariants, defensive check

**Files:**

- Modify: `server/services/fund-scenario-comparison-service.ts`
- Modify: `tests/unit/services/fund-scenario-comparison-service.test.ts`

- [ ] **Step 2.1: Write failing service tests**

  Open `tests/unit/services/fund-scenario-comparison-service.test.ts`.

  **2a. Update `mockScenarioSet` and `overridePayloadFor` to support
  `methodology`:**

  ```ts
  function mockScenarioSet(
    overrideType: 'fee_profile' | 'reserve_allocation' | 'allocation' | 'sector_profile' | 'methodology'
  ) {
    // ... existing body unchanged except the name/label lines:
    name: overrideType === 'fee_profile' ? 'Fee sensitivity' : `${overrideType} sensitivity`,
    // variant row:
    name: overrideType === 'fee_profile' ? 'Lower fee' : `${overrideType} variant`,
  }

  function overridePayloadFor(
    overrideType: 'fee_profile' | 'reserve_allocation' | 'allocation' | 'sector_profile' | 'methodology'
  ) {
    if (overrideType === 'fee_profile') {
      return {
        feeProfiles: [{ id: 'fee-profile-lower', name: 'Lower fee',
          feeTiers: [{ id: 'tier-1', name: 'Management fee', percentage: 2,
            feeBasis: 'committed_capital', startMonth: 0 }] }],
      };
    }
    if (overrideType === 'reserve_allocation') {
      return { items: [{ companyId: 101, plannedReservesCents: 1_000_000 }] };
    }
    if (overrideType === 'allocation') {
      return { allocations: [{ id: 'seed', category: 'Seed', percentage: 60 }] };
    }
    if (overrideType === 'methodology') {
      return { waterfallType: 'hybrid' };
    }
    return { sectorProfiles: [{ id: 'ai', name: 'AI Infrastructure', targetPercentage: 35 }] };
  }
  ```

  **2b. Make `scenarioPayload()` parameterizable:**

  Replace the existing `scenarioPayload()` function with one that accepts
  optional override-type params:

  ```ts
  function calculationModeFor(
    overrideType:
      | 'fee_profile'
      | 'allocation'
      | 'sector_profile'
      | 'methodology'
  ):
    | 'sync_fee_profile'
    | 'sync_allocation'
    | 'sync_sector_profile'
    | 'sync_methodology' {
    switch (overrideType) {
      case 'fee_profile':
        return 'sync_fee_profile';
      case 'allocation':
        return 'sync_allocation';
      case 'sector_profile':
        return 'sync_sector_profile';
      case 'methodology':
        return 'sync_methodology';
    }
  }

  function scenarioPayload(
    overrideType:
      | 'fee_profile'
      | 'allocation'
      | 'sector_profile'
      | 'methodology' = 'fee_profile'
  ): FundScenarioCalculationPayloadV1 {
    return {
      version: 'fund-scenarios-v1',
      calculationMode: calculationModeFor(overrideType),
      fundId: 123,
      scenarioSetId,
      sourceConfigId: 12,
      sourceConfigVersion: 4,
      staleness: {
        state: 'CURRENT',
        sourceConfigVersion: 4,
        currentPublishedConfigVersion: 4,
      },
      calculatedAt: '2026-05-26T12:30:00.000Z',
      variants: [
        {
          variantId,
          scenarioSetId,
          name:
            overrideType === 'fee_profile'
              ? 'Lower fee'
              : `${overrideType} variant`,
          overrideType,
          economics: scenarioEconomics(),
        },
      ],
    };
  }
  ```

  Update the existing `scenarioSnapshotRow()` call sites to pass a default
  `'fee_profile'` arg or no arg (default is `'fee_profile'`).

  **2c. Flip the existing allocation and sector_profile tests from
  `unsupported_override_type` to `comparable`:**

  Replace the two existing `unsupported` tests for allocation and
  sector_profile:

  ```ts
  it('returns comparable for allocation scenario sets', async () => {
    mockScenarioSet('allocation');
    queryMock.mockResolvedValueOnce({
      rows: [scenarioSnapshotRow('allocation')],
    });
    queryMock.mockResolvedValueOnce({
      rows: [economicsSnapshotRow(baselineEconomics())],
    });

    const result = await getFundScenarioComparison(123, scenarioSetId);

    expect(result.comparisonStatus).toBe('comparable');
    expect(result.variants[0]?.overrideType).toBe('allocation');
    expect(result.variants[0]?.metrics.finalTvpi).toBe(2.1);
  });

  it('returns comparable for sector_profile scenario sets', async () => {
    mockScenarioSet('sector_profile');
    queryMock.mockResolvedValueOnce({
      rows: [scenarioSnapshotRow('sector_profile')],
    });
    queryMock.mockResolvedValueOnce({
      rows: [economicsSnapshotRow(baselineEconomics())],
    });

    const result = await getFundScenarioComparison(123, scenarioSetId);

    expect(result.comparisonStatus).toBe('comparable');
    expect(result.variants[0]?.overrideType).toBe('sector_profile');
    expect(result.variants[0]?.metrics.finalTvpi).toBe(2.1);
  });
  ```

  Note: `scenarioSnapshotRow` needs to accept an `overrideType` argument:

  ```ts
  function scenarioSnapshotRow(
    overrideType:
      | 'fee_profile'
      | 'allocation'
      | 'sector_profile'
      | 'methodology' = 'fee_profile'
  ) {
    return {
      id: 42,
      payload: scenarioPayload(overrideType),
      created_at: new Date('2026-05-26T12:30:00.000Z'),
      snapshot_time: new Date('2026-05-26T12:30:00.000Z'),
    };
  }
  ```

  **2d. Add methodology comparable test:**

  ```ts
  it('returns comparable for methodology scenario sets', async () => {
    mockScenarioSet('methodology');
    queryMock.mockResolvedValueOnce({
      rows: [scenarioSnapshotRow('methodology')],
    });
    queryMock.mockResolvedValueOnce({
      rows: [economicsSnapshotRow(baselineEconomics())],
    });

    const result = await getFundScenarioComparison(123, scenarioSetId);

    expect(result.comparisonStatus).toBe('comparable');
    expect(result.variants[0]?.overrideType).toBe('methodology');
    expect(result.variants[0]?.metrics.finalTvpi).toBe(2.1);
    expect(
      result.variants[0]?.metricDeltas.find((d) => d.metric === 'finalTvpi')
    ).toEqual(
      expect.objectContaining({
        baselineValue: 1.8,
        scenarioValue: 2.1,
        driftCapable: true,
        driftReason: 'stable',
      })
    );
  });
  ```

  **2e. Add corrupt-snapshot defensive test:**

  ```ts
  it('returns unsupported_override_type when the snapshot payload contains reserve variants despite the set being economics-typed', async () => {
    // set metadata says methodology, but snapshot payload (DB rows) has reserve variants
    mockScenarioSet('methodology');
    // build a snapshot payload that claims reserve_allocation
    const corruptPayload: FundScenarioCalculationPayloadV1 = {
      version: 'fund-scenarios-v1',
      calculationMode: 'async_reserve_allocation',
      fundId: 123,
      scenarioSetId,
      sourceConfigId: 12,
      sourceConfigVersion: 4,
      staleness: {
        state: 'CURRENT',
        sourceConfigVersion: 4,
        currentPublishedConfigVersion: 4,
      },
      calculatedAt: '2026-05-26T12:30:00.000Z',
      variants: [
        {
          variantId,
          scenarioSetId,
          name: 'Follow-on cap',
          overrideType: 'reserve_allocation',
          reserve: {
            fundId: 123,
            totalBaseAllocationCents: 10_000_000,
            totalScenarioAllocationCents: 7_500_000,
            totalAllocationDeltaCents: -2_500_000,
            avgConfidence: 0.62,
            highConfidenceCount: 1,
            allocations: [],
            warnings: [],
            generatedAt: '2026-05-26T12:30:00.000Z',
          },
        },
      ],
    };
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 42,
          payload: corruptPayload,
          created_at: new Date(),
          snapshot_time: new Date(),
        },
      ],
    });

    const result = await getFundScenarioComparison(123, scenarioSetId);

    expect(result.comparisonStatus).toBe('unsupported_override_type');
    expect(result.unavailableReason).toBe('UNSUPPORTED_OVERRIDE_TYPE');
  });
  ```

- [ ] **Step 2.2: Run tests to verify they fail**

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/services/fund-scenario-comparison-service.test.ts
  ```

  Expected: The new `comparable` tests for allocation, sector_profile,
  methodology fail (still getting `unsupported_override_type`). The
  corrupt-snapshot test may fail or pass depending on current behavior.

- [ ] **Step 2.3: Implement the service changes**

  In `server/services/fund-scenario-comparison-service.ts`:

  **Add to the import block** — `FundScenarioCalculationVariantV1` from the
  existing contract import:

  ```ts
  import {
    FundScenarioCalculationPayloadV1Schema,
    type FundScenarioCalculationPayloadV1,
    type FundScenarioCalculationVariantV1,
    type FundScenarioSetDetailV1,
  } from '@shared/contracts/fund-scenario-sets-v1.contract';
  ```

  **Add the allowlist constant and helpers** after the existing `METRIC_LABELS`
  constant:

  ```ts
  const ECONOMICS_COMPARISON_OVERRIDE_TYPES = [
    'fee_profile',
    'allocation',
    'sector_profile',
    'methodology',
  ] as const;

  type EconomicsComparisonOverrideType =
    (typeof ECONOMICS_COMPARISON_OVERRIDE_TYPES)[number];

  function isEconomicsComparisonOverrideType(
    overrideType: string
  ): overrideType is EconomicsComparisonOverrideType {
    return (ECONOMICS_COMPARISON_OVERRIDE_TYPES as readonly string[]).includes(
      overrideType
    );
  }

  type EconomicsCalculationVariant = Extract<
    FundScenarioCalculationVariantV1,
    { overrideType: EconomicsComparisonOverrideType }
  >;

  function isEconomicsVariant(
    variant: FundScenarioCalculationVariantV1
  ): variant is EconomicsCalculationVariant {
    return isEconomicsComparisonOverrideType(variant.overrideType);
  }
  ```

  **Replace `feeProfileVariants()` with `economicsVariants()`:**

  ```ts
  function economicsVariants(
    scenarioPayload: FundScenarioCalculationPayloadV1,
    baselineMetrics: ScenarioComparisonMetricMap
  ): ScenarioComparisonVariantV1[] {
    return scenarioPayload.variants
      .filter(isEconomicsVariant)
      .map((variant) => {
        const metrics = metricMapFromEconomics(variant.economics);
        return {
          variantId: variant.variantId,
          name: variant.name,
          overrideType: variant.overrideType,
          metrics,
          metricDeltas: metricDeltas(baselineMetrics, metrics),
        };
      });
  }
  ```

  **Flip the gate** in `buildFundScenarioComparison` (the `if` that currently
  checks `!== 'fee_profile'`):

  ```ts
  // Before
  if (scenarioSet.variants.some((variant) => variant.override.overrideType !== 'fee_profile')) {

  // After
  if (
    scenarioSet.variants.some(
      (variant) => !isEconomicsComparisonOverrideType(variant.override.overrideType)
    )
  ) {
  ```

  **Add defensive snapshot check** in `buildComparableComparison`, immediately
  after `comparisonWithScenarioEvidence` is called and before
  `loadAuthoritativeEconomicsSnapshot`:

  ```ts
  const scenarioVariants = input.scenarioPayload.variants;
  if (
    scenarioVariants.length === 0 ||
    scenarioVariants.some((variant) => !isEconomicsVariant(variant))
  ) {
    return comparisonWithStatus(
      comparisonBase,
      'unsupported_override_type',
      'UNSUPPORTED_OVERRIDE_TYPE'
    );
  }
  ```

  **Update the callsite** in `buildComparableComparison`:

  ```ts
  // Before
  variants: feeProfileVariants(input.scenarioPayload, baselineMetrics),

  // After
  variants: economicsVariants(input.scenarioPayload, baselineMetrics),
  ```

- [ ] **Step 2.4: Run tests to verify they pass**

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/services/fund-scenario-comparison-service.test.ts
  ```

  Expected: All tests pass, including the three new `comparable` tests and the
  corrupt-snapshot test.

- [ ] **Step 2.5: Commit**

  ```
  git add server/services/fund-scenario-comparison-service.ts \
    tests/unit/services/fund-scenario-comparison-service.test.ts
  git commit -m "feat(scenarios): generalize comparison service to all economics override types"
  ```

---

## Task 3: ScenarioSetsSummary methodology type guard + test

**Files:**

- Modify: `client/src/components/fund-results/ScenarioSetsSummary.tsx`
- Modify: `tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx`

- [ ] **Step 3.1: Write failing test**

  In `tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx`, add a
  new test inside the existing `describe('ScenarioSetsSummary', ...)` block.
  Import `ScenariosSectionPayloadV1` if not already imported.

  ```ts
  it('renders methodology scenario cards with economics summaries', () => {
    render(<ScenarioSetsSummary payload={methodologyPayload()} />);

    const card = screen.getByText('Waterfall comparison').closest('article');
    if (!(card instanceof HTMLElement)) {
      throw new Error('Waterfall comparison card was not rendered');
    }
    expect(within(card).getByText('Best TVPI')).toBeInTheDocument();
    expect(within(card).getByText('2.30x')).toBeInTheDocument();
    expect(within(card).getByText('Hybrid waterfall')).toBeInTheDocument();
  });
  ```

  Add the fixture function at the bottom of the file:

  ```ts
  function methodologyPayload(): ScenariosSectionPayloadV1 {
    return {
      version: 'fund-scenarios-v1',
      aggregateStaleness: 'CURRENT',
      sets: [
        {
          scenarioSetId: '00000000-0000-0000-0000-000000000611',
          name: 'Waterfall comparison',
          calculationMode: 'sync_methodology',
          sourceConfigId: 16,
          sourceConfigVersion: 5,
          currentPublishedConfigVersion: 5,
          calculatedAt: '2026-05-26T12:40:00.000Z',
          staleness: 'CURRENT',
          variantCount: 1,
          variants: [
            {
              variantId: '00000000-0000-0000-0000-000000000612',
              name: 'Hybrid waterfall',
              overrideType: 'methodology',
              economicsSummary: economicsSummary({ finalTvpi: 2.3 }),
            },
          ],
        },
      ],
    };
  }
  ```

- [ ] **Step 3.2: Run test to confirm it fails**

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx
  ```

  Expected: New test fails — "Best TVPI" does not appear because
  `hasEconomicsSummary` excludes `methodology`.

- [ ] **Step 3.3: Update the type guard and type alias in
      ScenarioSetsSummary.tsx**

  In `client/src/components/fund-results/ScenarioSetsSummary.tsx`, replace the
  `EconomicsScenarioVariant` type and `hasEconomicsSummary` function (lines
  32–71):

  ```ts
  type EconomicsScenarioVariant = Extract<
    ScenarioSetVariantResultSummaryV1,
    {
      overrideType:
        | 'fee_profile'
        | 'allocation'
        | 'sector_profile'
        | 'methodology';
    }
  >;

  function hasEconomicsSummary(
    variant: ScenarioSetVariantResultSummaryV1
  ): variant is EconomicsScenarioVariant {
    return (
      variant.overrideType === 'fee_profile' ||
      variant.overrideType === 'allocation' ||
      variant.overrideType === 'sector_profile' ||
      variant.overrideType === 'methodology'
    );
  }
  ```

- [ ] **Step 3.4: Run tests to verify they pass**

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx
  ```

  Expected: All tests pass including the new methodology card test.

- [ ] **Step 3.5: Commit**

  ```
  git add client/src/components/fund-results/ScenarioSetsSummary.tsx \
    tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx
  git commit -m "feat(scenarios): render methodology variant cards in ScenarioSetsSummary"
  ```

---

## Task 4: CrossSetScenarioComparisonTable — rename predicate, update copy, update tests

**Files:**

- Modify:
  `client/src/components/fund-results/CrossSetScenarioComparisonTable.tsx`
- Modify:
  `tests/unit/components/fund-results/CrossSetScenarioComparisonTable.test.tsx`

- [ ] **Step 4.1: Update copy assertions in existing tests (they'll break when
      the component copy changes)**

  In
  `tests/unit/components/fund-results/CrossSetScenarioComparisonTable.test.tsx`:

  **Update `mkComparison` to accept a parameterized `overrideType`** (currently
  hardcodes `'fee_profile' as const`):

  ```ts
  function mkComparison(args: {
    setId: string;
    name: string;
    sourceConfigVersion: number;
    sourceConfigId?: number;
    overrideType?: FundScenarioComparisonV1['variants'][number]['overrideType'];
    variants: Array<{
      variantId: string;
      name: string;
      metrics: ScenarioComparisonMetricMap;
      metricDeltas?: ScenarioComparisonMetricDeltaV1[];
    }>;
  }): FundScenarioComparisonV1 {
    return {
      fundId: 123,
      comparisonStatus: 'comparable',
      scenarioSet: {
        scenarioSetId: args.setId,
        name: args.name,
        sourceConfigId: args.sourceConfigId ?? 12,
        sourceConfigVersion: args.sourceConfigVersion,
      },
      baseline: { label: 'Authoritative baseline', metrics: BASE_METRICS },
      variants: args.variants.map((variant) => ({
        variantId: variant.variantId,
        name: variant.name,
        overrideType: args.overrideType ?? 'fee_profile',
        metrics: variant.metrics,
        metricDeltas: variant.metricDeltas ?? [],
      })),
      staleness: 'CURRENT',
      calculatedAt: '2026-05-26T12:30:00.000Z',
    };
  }
  ```

  Add the missing type imports at the top if needed:

  ```ts
  import type {
    FundScenarioComparisonV1,
    ScenarioComparisonMetricDeltaV1,
    ScenarioComparisonMetricKey,
    ScenarioComparisonMetricMap,
  } from '../../../../shared/contracts/fund-scenario-comparison-v1.contract';
  ```

  **Update the copy assertions** in two existing tests:

  In "renders every fee-profile variant column without omission" — update the
  copy assertion:

  ```ts
  // Before
  expect(
    within(table).getByText(
      'Showing 4 fee-profile variants across 2 scenario sets.'
    )
  ).toBeInTheDocument();
  // After
  expect(
    within(table).getByText(
      'Showing 4 comparable variants across 2 scenario sets.'
    )
  ).toBeInTheDocument();
  ```

  In "switches to a scrollable layout when variant columns exceed the soft
  limit" — update the copy assertion:

  ```ts
  // Before
  expect(
    within(table).getByText(
      'Showing 10 fee-profile variants across 2 scenario sets.'
    )
  ).toBeInTheDocument();
  // After
  expect(
    within(table).getByText(
      'Showing 10 comparable variants across 2 scenario sets.'
    )
  ).toBeInTheDocument();
  ```

  In "renders an honest empty state when there are no comparable variants" —
  update the assertion:

  ```ts
  // Before
  expect(
    within(table).getByText(/No comparable fee-profile scenario variants/i)
  ).toBeInTheDocument();
  // After
  expect(
    within(table).getByText(/No comparable scenario variants/i)
  ).toBeInTheDocument();
  ```

  **Add new badge tests for economics types:**

  ```ts
  it('renders ALLOCATION badge for allocation variants', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Allocation mix',
            sourceConfigVersion: 4,
            overrideType: 'allocation',
            variants: [{ variantId: uuid(101), name: 'Seed heavy', metrics: metrics() }],
          }),
        ]}
      />
    );
    expect(screen.getByText('ALLOCATION')).toBeInTheDocument();
  });

  it('renders METHODOLOGY badge for methodology variants', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Waterfall comparison',
            sourceConfigVersion: 4,
            overrideType: 'methodology',
            variants: [{ variantId: uuid(101), name: 'Hybrid waterfall', metrics: metrics() }],
          }),
        ]}
      />
    );
    expect(screen.getByText('METHODOLOGY')).toBeInTheDocument();
  });

  it('renders SECTOR PROFILE badge for sector_profile variants', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Sector mix',
            sourceConfigVersion: 4,
            overrideType: 'sector_profile',
            variants: [{ variantId: uuid(101), name: 'AI infrastructure', metrics: metrics() }],
          }),
        ]}
      />
    );
    expect(screen.getByText('SECTOR PROFILE')).toBeInTheDocument();
  });
  ```

- [ ] **Step 4.2: Run tests to see them fail**

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/components/fund-results/CrossSetScenarioComparisonTable.test.tsx
  ```

  Expected: The copy assertion tests fail (still showing "fee-profile
  variants"). Badge tests for `ALLOCATION`/`METHODOLOGY`/`SECTOR PROFILE` pass
  (badge map was already fixed in Task 1). Empty-state test fails (still shows
  "fee-profile").

- [ ] **Step 4.3: Update CrossSetScenarioComparisonTable.tsx**

  In `client/src/components/fund-results/CrossSetScenarioComparisonTable.tsx`:

  **Update the JSDoc module description** (lines 1–10):

  ```ts
  /**
   * CrossSetScenarioComparisonTable - ADR-022 cross-set scenario comparison.
   *
   * Compares multiple calculated economics-backed scenario sets side-by-side: one column
   * per comparable variant, grouped under its scenario set. Every delta stays scoped
   * to that set's own pinned authoritative baseline (the server-provided metricDeltas);
   * this component never computes a cross-set delta.
   *
   * @module client/components/fund-results/CrossSetScenarioComparisonTable
   */
  ```

  **Rename `isComparableFeeProfileComparison` →
  `isComparableEconomicsComparison`** (line 95):

  ```ts
  export function isComparableEconomicsComparison(
    comparison: FundScenarioComparisonV1
  ): boolean {
    return (
      comparison.comparisonStatus === 'comparable' &&
      comparison.baseline != null &&
      comparison.variants.length > 0
    );
  }
  ```

  **Update the internal call site** in `toVariantColumns` (line 106):

  ```ts
  // Before
  if (!isComparableFeeProfileComparison(comparison)) continue;
  // After
  if (!isComparableEconomicsComparison(comparison)) continue;
  ```

  **Update the variant count copy** (line 253–255):

  ```tsx
  <p className="text-sm text-charcoal-500 font-poppins">
    Showing {columns.length} comparable{' '}
    {columns.length === 1 ? 'variant' : 'variants'} across {groups.length}{' '}
    scenario {groups.length === 1 ? 'set' : 'sets'}.
  </p>
  ```

  **Update the empty state copy** (line 231–233):

  ```tsx
  <p className="text-sm text-charcoal-600 font-poppins">
    No comparable scenario variants to compare.
  </p>
  ```

  **Update the JSDoc on the exported component function** (line 215):

  ```ts
  /** Cross-set side-by-side comparison of economics-backed scenario variants. */
  ```

- [ ] **Step 4.4: Run tests to verify they all pass**

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/components/fund-results/CrossSetScenarioComparisonTable.test.tsx
  ```

  Expected: All tests pass including the updated copy tests and the three new
  badge tests.

- [ ] **Step 4.5: Commit**

  ```
  git add client/src/components/fund-results/CrossSetScenarioComparisonTable.tsx \
    tests/unit/components/fund-results/CrossSetScenarioComparisonTable.test.tsx
  git commit -m "feat(scenarios): generalize CrossSetScenarioComparisonTable to all economics types"
  ```

---

## Task 5: Rename barrel export + update fund-model-results.tsx

**Files:**

- Modify: `client/src/components/fund-results/index.ts`
- Modify: `client/src/pages/fund-model-results.tsx`

- [ ] **Step 5.1: Update the barrel export**

  In `client/src/components/fund-results/index.ts`, replace the
  `isComparableFeeProfileComparison` export on line 15:

  ```ts
  // Before
  export {
    CrossSetScenarioComparisonTable,
    isComparableFeeProfileComparison,
  } from './CrossSetScenarioComparisonTable';

  // After
  export {
    CrossSetScenarioComparisonTable,
    isComparableEconomicsComparison,
  } from './CrossSetScenarioComparisonTable';
  ```

- [ ] **Step 5.2: Update fund-model-results.tsx**

  In `client/src/pages/fund-model-results.tsx`, there are three changes:

  **Import rename** (line 29):

  ```ts
  // Before
  import {
    CrossSetScenarioComparisonTable,
    isComparableFeeProfileComparison,
    ScenarioComparisonTable,
    ScenarioSetsSummary,
  } from '@/components/fund-results';

  // After
  import {
    CrossSetScenarioComparisonTable,
    isComparableEconomicsComparison,
    ScenarioComparisonTable,
    ScenarioSetsSummary,
  } from '@/components/fund-results';
  ```

  **Two call sites in `ScenarioComparisonPanel`** (lines 794–796):

  ```ts
  // Before
  const comparable = state.comparisons.filter(isComparableFeeProfileComparison);
  const nonComparable = state.comparisons.filter(
    (comparison) => !isComparableFeeProfileComparison(comparison)
  );

  // After
  const comparable = state.comparisons.filter(isComparableEconomicsComparison);
  const nonComparable = state.comparisons.filter(
    (comparison) => !isComparableEconomicsComparison(comparison)
  );
  ```

- [ ] **Step 5.3: Verify typecheck passes**

  ```powershell
  & .\scripts\windows-node-env.ps1 npm.cmd run check
  ```

  Expected: Zero TypeScript errors. `isComparableFeeProfileComparison` should no
  longer appear anywhere.

  Verify the old name is gone:

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd grep -r "isComparableFeeProfileComparison" client/ --include="*.ts" --include="*.tsx"
  ```

  Expected: No results.

- [ ] **Step 5.4: Commit**

  ```
  git add client/src/components/fund-results/index.ts \
    client/src/pages/fund-model-results.tsx
  git commit -m "refactor(scenarios): rename isComparableFeeProfileComparison to isComparableEconomicsComparison"
  ```

---

## Task 6: Workspace test — add methodology to scenarios payload + widen comparison mock

**Files:**

- Modify: `tests/unit/pages/fund-scenario-workspace.test.tsx`

- [ ] **Step 6.1: Add methodology to `scenariosPayload()` and widen the
      comparison mock**

  In `tests/unit/pages/fund-scenario-workspace.test.tsx`:

  **Add methodology set to `scenariosPayload()`** (the function at line ~780).
  Append a fourth entry inside the `sets` array:

  ```ts
  {
    scenarioSetId: '00000000-0000-0000-0000-000000000511',
    name: 'Waterfall comparison',
    calculationMode: 'sync_methodology',
    sourceConfigId: 16,
    sourceConfigVersion: 4,
    currentPublishedConfigVersion: 4,
    calculatedAt: '2026-05-29T12:36:00.000Z',
    staleness: 'CURRENT' as const,
    variantCount: 1,
    variants: [
      {
        variantId: '00000000-0000-0000-0000-000000000512',
        name: 'Hybrid waterfall',
        overrideType: 'methodology' as const,
        economicsSummary: economicsSummary(),
      },
    ],
  },
  ```

  **Widen the comparison URL mock in `mockWorkspaceFetches()`** (the primary one
  at lines 58–229). Replace the exact-URL comparison handler with a pattern
  handler that covers all sets:

  ```ts
  // Before (lines 128-132)
  if (
    method === 'GET' &&
    url ===
      '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000111/comparison'
  ) {
    return Promise.resolve(jsonResponse(scenarioComparisonResponse()));
  }

  // After
  if (method === 'GET' && url.endsWith('/comparison')) {
    // Extract the scenarioSetId from the URL so each comparison response is self-consistent.
    const setId = url.split('/scenario-sets/')[1]?.split('/')[0] ?? '';
    return Promise.resolve(jsonResponse(scenarioComparisonResponse(setId)));
  }
  ```

  **Update `scenarioComparisonResponse()` to accept a `scenarioSetId`
  parameter:**

  ```ts
  function scenarioComparisonResponse(
    scenarioSetId = '00000000-0000-0000-0000-000000000111'
  ): FundScenarioComparisonV1 {
    return {
      fundId: 123,
      comparisonStatus: 'comparable',
      scenarioSet: {
        scenarioSetId,
        name: 'Fee sensitivity',
        sourceConfigId: 12,
        sourceConfigVersion: 4,
      },
      baseline: {
        label: 'Authoritative baseline',
        metrics: {
          lpNetIrr: 0.15,
          gpNetIrr: null,
          totalManagementFees: 2_000_000,
          totalGpCarryDistributed: 500_000,
          totalGpFeeIncome: 2_000_000,
          finalDpi: 0.6,
          finalTvpi: 1.8,
          finalClawbackDue: 0,
        },
      },
      variants: [
        {
          variantId: '00000000-0000-0000-0000-000000000112',
          name: 'Lower fee',
          overrideType: 'fee_profile',
          metrics: {
            lpNetIrr: 0.17,
            gpNetIrr: null,
            totalManagementFees: 1_500_000,
            totalGpCarryDistributed: 500_000,
            totalGpFeeIncome: 1_500_000,
            finalDpi: 0.7,
            finalTvpi: 2.1,
            finalClawbackDue: 0,
          },
          metricDeltas: [
            {
              metric: 'finalTvpi',
              displayName: 'TVPI',
              baselineValue: 1.8,
              scenarioValue: 2.1,
              absoluteDelta: 0.3,
              percentageDelta: 16.6666667,
              driftCapable: true,
              driftReason: 'stable',
            },
          ],
        },
      ],
      staleness: 'CURRENT',
      calculatedAt: '2026-05-29T12:30:00.000Z',
    };
  }
  ```

  **Add assertion to the primary workspace test** ("loads scenario sets without
  polling reserve status for sync sets"). After the existing sector card
  assertions (around line 279), add:

  ```ts
  const methodologyCard = screen.getByTestId(
    'scenario-workspace-set-00000000-0000-0000-0000-000000000511'
  );
  expect(within(methodologyCard).getByText('Succeeded')).toBeInTheDocument();
  expect(within(methodologyCard).getByText('Methodology')).toBeInTheDocument();
  expect(
    within(methodologyCard).getByRole('button', {
      name: /calculate waterfall comparison/i,
    })
  ).toBeInTheDocument();
  ```

- [ ] **Step 6.2: Run workspace tests**

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/pages/fund-scenario-workspace.test.tsx
  ```

  Expected: All tests pass. The methodology card assertions succeed.

- [ ] **Step 6.3: Commit**

  ```
  git add tests/unit/pages/fund-scenario-workspace.test.tsx
  git commit -m "test(scenarios): add methodology to workspace test payload and widen comparison mock"
  ```

---

## Task 7: Final verification

- [ ] **Step 7.1: Run focused server tests**

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/contract/fund-scenario-comparison-v1.contract.test.ts tests/unit/services/fund-scenario-comparison-service.test.ts
  ```

  Expected: All tests pass and exit 0.

- [ ] **Step 7.2: Run focused client tests**

  ```powershell
  & .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx tests/unit/components/fund-results/CrossSetScenarioComparisonTable.test.tsx tests/unit/pages/fund-scenario-workspace.test.tsx
  ```

  Expected: All tests pass and exit 0.

- [ ] **Step 7.3: Run scenario release gate**

  ```powershell
  & .\scripts\windows-node-env.ps1 npm.cmd run test:scenario-release-gate
  ```

  Expected: Passes and exits 0.

- [ ] **Step 7.4: Run typecheck**

  ```powershell
  & .\scripts\windows-node-env.ps1 npm.cmd run check
  ```

  Expected: Zero TypeScript errors.

- [ ] **Step 7.5: Run lint**

  ```powershell
  & .\scripts\windows-node-env.ps1 npm.cmd run lint
  ```

  Expected: Zero lint errors.
