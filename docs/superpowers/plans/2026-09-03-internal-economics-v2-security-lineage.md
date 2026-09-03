---
status: PROPOSED
audience: agents
last_updated: 2026-09-03
owner: Repository Owner
categories: [financial-correctness, internal-economics-v2]
keywords:
  ['1458', multi-security, realization-proceeds, deal-by-deal-waterfall, conservation]
---

# Internal Economics V2 Security-Lineage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every realization-proceeds dollar to the exact
`dealId:securityId` entitlement pool proven by admitted lot-relief evidence,
eliminating first-prefix allocation while preserving conservation and existing
refusal boundaries.

**Architecture:** Keep the public Internal Economics V2 input contract
unchanged. Resolve each realization relief row's `investmentLotId` to the
existing private `InvestmentLot.securityId`, group allocated proceeds by
security before mutation, and emit one private cash-source lot per security.
The deal-by-deal waterfall performs exact pool lookup and returns the existing
typed refusal before mutation when exact lineage cannot be consumed.

**Tech Stack:** TypeScript, Decimal.js, Vitest, existing Internal Economics V2
event engine, deal-by-deal and whole-fund waterfalls, dual-lane certification,
and Phoenix truth cases.

**Spec:** Issue #1458 (parked by
`docs/1-plans/F_2.0.7_v2-conformance-closure.plan.md`, "Out of scope"),
`AGENT-SAFETY.md` financial-allocation rules,
`shared/contracts/internal-economics/internal-economics-input-v2.contract.ts`,
and `docs/superpowers/plans/2026-09-03-updog-reconciled-program-plan.md`.

## Global Constraints

- Program B is independently owned. It merges before Program A candidate
  selection so it is part of the frozen candidate and soaks across the four
  windows (owner decision Q3); it is never injected into an already-frozen
  candidate during the hold window, which would restart soak.
- Preserve the public realization event schema. Do not add caller-supplied
  `securityId` to realization events.
- Security lineage comes only from
  `reliefRows[].investmentLotId -> InvestmentLot.securityId`.
- Single-security realization lot IDs remain `proceeds:<eventId>`.
  Multi-security IDs become `proceeds:<eventId>:<securityId>`.
- A zero-proceeds security group returns existing
  `INVESTMENT_LOT_RELIEF_VIOLATION` before state mutation.
- Missing exact entitlement pool returns the same existing typed refusal. Do
  not add a new refusal code.
- Never choose the first matching pool or infer security from iteration order,
  amount similarity, or chronology.
- Prove source-proceeds, cash-lot, tier, partner, and whole-fund conservation.
- Preserve existing correction, write-off, conversion, and cross-pool
  preference refusal behavior.
- Run every test with `TZ=UTC`. `npm run calc-gate` must invoke
  `npm run phoenix:truth` and the named S-0102 expected-output case.
- Preserve unrelated dirty/untracked work. Stage exact files only.
- Completion supplies no merge, deployment, or serving authority.

## Version Decision

The behavior change uses this exact tuple:

```text
receipt: internal-economics-receipt/2.4.0
receipt serializer: internal-economics-receipt-serializer/2.4.0
event engine: internal-economics-event-engine/2.4.0
composite: internal-economics-composite/2.4.0
deal-by-deal waterfall: internal-economics-waterfall-deal-by-deal/2.3.0
whole-fund waterfall: internal-economics-waterfall-whole-fund/2.2.0
normalizer/input: internal-economics-normalizer/2.0.1
```

Only receipt, serializer, event engine, composite, and deal-by-deal versions
change. Whole-fund and normalizer/input versions remain unchanged.

### Behavior Admission Boundary

Task 2 Stages A-D are one inseparable behavior-and-version unit. The event-engine change
alters receipt hash material before the final version/manifest update can be
valid, so Stages A-C must not be committed or admitted independently. Preserve
their exact working diff and test output locally, then create one green commit
only in Stage D after every receipt/version consumer and named truth case passes.
Task 1 remains a separate green baseline/decision commit. Program B may be
implemented at any time but merges into `main` before Program A candidate
selection, so the candidate includes and soaks the proceeds fix. It changes
API-bundled `shared/lib` code and cannot satisfy the ADR-095 exception-merge
proof, so it never lands inside the hold window. Assign the decision the next
unused `DECISIONS.md` ADR number at branch cut instead of reserving ADR-098.

---

### Task 1: Record the Decision and Freeze Pre-Fix S-0102 Hashes

**Files:**

- Modify: `DECISIONS.md`
- Modify: `CHANGELOG.md`
- Modify: `tests/helpers/v2-input-builder.ts:1-120`
- Create:
  `tests/unit/truth-cases/internal-economics-v2-multi-security-routing.test.ts`

**Interfaces:**

```ts
export function buildMultiSecurityRealizationV2Input(): InternalEconomicsInputV2Wire;

export const MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES = {
  normalizedInputHash:
    '006353987e891a32cf413df12cbd032306a0488edaa761340e29645e7d0f3009',
  dealByDealResultHash:
    'c5f3281fef0e249b9bae28b350889383bfd07c29d66a8270d86b5591fff35ad9',
  wholeFundResultHash:
    '89e19bde445c409f86961046687dd6a8f4ba45f9588d7bb3c95718de5553f692',
} as const;
```

- [ ] **Step 1: Add the reusable exact fixture**

Build from `buildMinimalV2Input` with return-of-capital plus carry, no management
fee schedule, and these events:

```ts
const input = buildMinimalV2Input({
  waterfallPolicy: [
    { kind: 'return_of_capital', priority: 1 },
    { kind: 'carry', priority: 2, gpShare: '0.200000000000' },
  ],
  events: [
    {
      eventId: 'contribution-1',
      instant: '2025-02-01T00:00:00Z',
      amountUsd: '200.000000',
      kind: 'settled_contribution',
      partnerId: 'lp-1',
      purpose: 'deployment',
      settlementSourceRef: 'settlement:contribution-1',
    },
    {
      eventId: 'deployment-a',
      instant: '2025-02-02T00:00:00Z',
      amountUsd: '120.000000',
      kind: 'deployment',
      dealId: 'deal-1',
      securityId: 'security-a',
      cashSourceAllocations: [
        { lotId: 'csl:contribution-1', amount: '120.000000' },
      ],
    },
    {
      eventId: 'deployment-b',
      instant: '2025-02-03T00:00:00Z',
      amountUsd: '80.000000',
      kind: 'deployment',
      dealId: 'deal-1',
      securityId: 'security-b',
      cashSourceAllocations: [
        { lotId: 'csl:contribution-1', amount: '80.000000' },
      ],
    },
    {
      eventId: 'realization-1',
      instant: '2025-04-01T00:00:00Z',
      amountUsd: '200.000000',
      kind: 'realization',
      dealId: 'deal-1',
      recyclingTag: 'none',
      reliefRows: [
        {
          investmentLotId: 'inv:deal-1:security-a:deployment-a',
          relievedCostBasis: '60.000000',
          allocatedProceeds: '120.000000',
        },
        {
          investmentLotId: 'inv:deal-1:security-b:deployment-b',
          relievedCostBasis: '40.000000',
          allocatedProceeds: '80.000000',
        },
      ],
    },
  ],
});
input.lpClasses[0]!.feeProfile.managementFeeSchedule = [];
return structuredClone(input);
```

- [ ] **Step 2: Freeze and verify the pre-fix hashes**

Create the truth-case file with complete imports and a runnable Vitest wrapper:

```ts
import { describe, expect, it } from 'vitest';
import { certifyInternalEconomicsDualLaneV2 } from '../../../shared/lib/internal-economics/v2/derive-composite-v2';
import {
  buildMultiSecurityRealizationV2Input,
  MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES,
} from '../../helpers/v2-input-builder';

describe('Internal Economics V2 multi-security realization routing', () => {
  it('freezes the exact pre-fix dual-lane hashes', () => {
    const result = certifyInternalEconomicsDualLaneV2(
      buildMultiSecurityRealizationV2Input()
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.refusal.message);

    expect({
      normalizedInputHash:
        result.certification.dealByDeal.normalizedInputHash,
      dealByDealResultHash: result.certification.dealByDeal.resultHash,
      wholeFundResultHash: result.certification.wholeFund.resultHash,
    }).toEqual(MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES);
  });
});
```

Use the certification entrypoint because ordinary `deriveInternalEconomicsV2`
refuses eventful inputs at the public admission envelope.

- [ ] **Step 3: Verify the exact baseline evidence**

```bash
TZ=UTC npx vitest run \
  tests/unit/truth-cases/internal-economics-v2-multi-security-routing.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
```

Expected: PASS with the three exact constants above. A mismatch is a stale
baseline blocker; do not update hashes without independently explaining the
source behavior change.

- [ ] **Step 4: Record the security-lineage ADR and changelog intent**

Resolve the next unused ADR number from the branch-cut file before editing:

```bash
UPDOG_LAST_ADR_NUMBER="$(
  rg -o '^## ADR-[0-9]+' DECISIONS.md |
    sed 's/^## ADR-//' |
    awk '{ print $1 + 0 }' |
    sort -n |
    tail -n 1
)"
test -n "$UPDOG_LAST_ADR_NUMBER"
UPDOG_SECURITY_ADR_NUMBER="$((UPDOG_LAST_ADR_NUMBER + 1))"
UPDOG_SECURITY_ADR_PADDED="$(printf '%03d' "$UPDOG_SECURITY_ADR_NUMBER")"
if rg -q "^## ADR-${UPDOG_SECURITY_ADR_PADDED}:" DECISIONS.md; then
  echo "ADR-${UPDOG_SECURITY_ADR_PADDED} already exists; stop and refresh branch state."
  exit 1
fi
printf 'Use ADR-%s\n' "$UPDOG_SECURITY_ADR_PADDED"
```

Use that exact number with title
`Internal Economics V2 Realization Security Lineage`. Its decision must state:

```markdown
Decision: realization security lineage is resolved from each admitted relief
row's investmentLotId. Single-security realization lot IDs remain compatible;
multi-security IDs include securityId. Zero-proceeds security groups and missing
exact entitlement pools return the existing typed refusal before mutation.
Versions follow the plan's exact tuple. Public event schema does not change.
```

Record the user-visible correction/refusal effect in `CHANGELOG.md`.

- [ ] **Step 5: Commit the green decision and baseline fixture**

Immediately before staging, refresh `origin/main`, recover the selected ADR
number from the unique local title, and fail closed if the number now exists on
`origin/main` or appears more than once locally:

```bash
git fetch origin --prune
UPDOG_SECURITY_ADR_HEADING="$(
  rg '^## ADR-[0-9]+: Internal Economics V2 Realization Security Lineage$' \
    DECISIONS.md
)"
test "$(printf '%s\n' "$UPDOG_SECURITY_ADR_HEADING" | sed '/^$/d' | wc -l | tr -d ' ')" = "1"
UPDOG_SECURITY_ADR_PADDED="$(
  printf '%s\n' "$UPDOG_SECURITY_ADR_HEADING" |
    sed -E 's/^## ADR-([0-9]+):.*$/\1/'
)"
test "$(rg -c "^## ADR-${UPDOG_SECURITY_ADR_PADDED}:" DECISIONS.md)" = "1"
if git show origin/main:DECISIONS.md |
  rg -q "^## ADR-${UPDOG_SECURITY_ADR_PADDED}:"; then
  echo "ADR-${UPDOG_SECURITY_ADR_PADDED} was consumed on origin/main; stop, rebase, and select the next unused number."
  exit 1
fi
git add \
  DECISIONS.md \
  CHANGELOG.md \
  tests/helpers/v2-input-builder.ts \
  tests/unit/truth-cases/internal-economics-v2-multi-security-routing.test.ts
git diff --cached --check
git commit -m "test(economics): freeze multi-security realization baseline"
```


---

### Task 2: Implement and Certify the Security-Lineage Correction

#### Stage A: Emit Security-Keyed Proceeds Lots Atomically

**Files:**

- Modify: `shared/lib/internal-economics/v2/event-stream-engine-v2.ts:27-67,856-925`
- Modify:
  `tests/unit/internal-economics/v2/event-stream-engine-v2.test.ts:1244-1325`
- Modify: `tests/unit/internal-economics/v2/event-stream-atomicity-v2.test.ts`
- Modify:
  `tests/unit/truth-cases/internal-economics-v2-multi-security-routing.test.ts`

**Interfaces:**

```ts
type RealizationProceedsCashSourceLot = CashSourceLotBase & {
  readonly origin: 'event';
  readonly sourceKind: 'realization_proceeds';
  readonly sourceEventId: string;
  readonly dealId: string;
  readonly securityId: string;
};
```

- [ ] **Step 1: Retire the live pre-fix result assertion, then add RED event-engine tests**

Keep `MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES` as immutable evidence, but stop
comparing the live deal/whole-fund result hashes after the behavior edit. Retain
the live normalized-input assertion because the public input and normalizer do
not change:

```ts
expect(result.certification.dealByDeal.normalizedInputHash).toBe(
  MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES.normalizedInputHash
);
expect(MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES.dealByDealResultHash).toMatch(
  /^[a-f0-9]{64}$/
);
expect(MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES.wholeFundResultHash).toMatch(
  /^[a-f0-9]{64}$/
);
```

Then assert the base fixture creates exactly:

Assert the base fixture creates exactly:

```ts
expect(realizationLots).toEqual([
  {
    lotId: 'proceeds:realization-1:security-a',
    dealId: 'deal-1',
    securityId: 'security-a',
    originalAmount: '120.000000',
    remainingBalance: '120.000000',
  },
  {
    lotId: 'proceeds:realization-1:security-b',
    dealId: 'deal-1',
    securityId: 'security-b',
    originalAmount: '80.000000',
    remainingBalance: '80.000000',
  },
]);
```

Filter state lots by
`origin === 'event' && sourceKind === 'realization_proceeds'` before comparison.
Also assert a single-security realization still emits
`proceeds:<eventId>`.

Add a grouping case that exercises multiple lots for one security (multiple
deployments produce distinct `investmentLotId`s under one `securityId`, e.g.
`inv:deal-1:security-a:deployment-a` and `inv:deal-1:security-a:deployment-b`;
see `event-stream-engine-v2.ts:957`). Give the realization two relief rows that
resolve to `security-a` with `allocatedProceeds` `120.000000` and `30.000000`,
and assert exactly one emitted lot (the grouping case's relief rows all resolve
to `security-a`, so the filtered realization lots must be a length-1 array):

```ts
expect(realizationLots).toEqual([
  {
    lotId: 'proceeds:realization-1:security-a',
    dealId: 'deal-1',
    securityId: 'security-a',
    originalAmount: '150.000000',
    remainingBalance: '150.000000',
  },
]);
```

The single suffixed lot with summed proceeds proves grouping is by exact
`securityId`, not per relief row or per lot.

- [ ] **Step 2: Add RED atomic-refusal tests**

Cover:

- duplicate generated lot ID;
- one relief-row security group whose allocated proceeds total is zero;
- source event amount unequal to grouped proceeds total.

Snapshot `cashSourceLots`, `investmentLots`, `eventEffectRecords`, partner
ledgers, and `endingCash` before each call; assert every snapshot is unchanged
after refusal. Extend the atomicity test's local `snapshotState` projection for
realization-proceeds lots to include `securityId`; otherwise mutation of the new
lineage field is invisible to the atomicity assertion.

- [ ] **Step 3: Run focused tests and confirm RED**

```bash
TZ=UTC npx vitest run \
  tests/unit/internal-economics/v2/event-stream-engine-v2.test.ts \
  tests/unit/internal-economics/v2/event-stream-atomicity-v2.test.ts \
  tests/unit/truth-cases/internal-economics-v2-multi-security-routing.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
```

- [ ] **Step 4: Implement validate-then-mutate grouping**

Before any state mutation:

1. resolve every relief row to its investment lot;
2. verify every lot belongs to the event deal;
3. group `allocatedProceeds` by exact `securityId`;
4. reject a non-positive group;
5. sort drafts by `securityId`;
6. generate every lot ID, retaining the legacy ID for one security;
7. detect every collision;
8. verify grouped proceeds sum equals the event amount.

Only after all checks pass, call `applyReliefRows` once, insert all proceeds
lots, append one event-effect record, and add the event amount to ending cash
once.

```ts
const lotId = drafts.length === 1
  ? `proceeds:${event.eventId}`
  : `proceeds:${event.eventId}:${draft.securityId}`;
```

- [ ] **Step 5: Run focused tests and preserve the uncommitted Stage A diff**

```bash
TZ=UTC npx vitest run \
  tests/unit/internal-economics/v2/event-stream-engine-v2.test.ts \
  tests/unit/internal-economics/v2/event-stream-atomicity-v2.test.ts \
  tests/unit/truth-cases/internal-economics-v2-multi-security-routing.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
git diff --check -- \
  shared/lib/internal-economics/v2/event-stream-engine-v2.ts \
  tests/unit/internal-economics/v2/event-stream-engine-v2.test.ts \
  tests/unit/internal-economics/v2/event-stream-atomicity-v2.test.ts \
  tests/unit/truth-cases/internal-economics-v2-multi-security-routing.test.ts
```

Expected: focused tests PASS. Do not commit; continue to Stage B in the same
working tree because repository-wide receipt/version assertions are not valid
until Stage D.

---

#### Stage B: Replace Prefix Routing With Exact Pool Lookup

**Files:**

- Modify:
  `shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts:18-99,293-360`
- Modify:
  `tests/unit/internal-economics/v2/waterfall-deal-by-deal-v2.test.ts:1-15,313-430`

**Interfaces:**

```ts
type BuildEntitlementPoolsResult =
  | { readonly ok: true; readonly pools: EntitlementPool[] }
  | { readonly ok: false; readonly refusal: V2CoreRefusal };
```

- [ ] **Step 1: Add executable test imports and local helpers**

Merge these names into existing import groups in
`waterfall-deal-by-deal-v2.test.ts`; do not duplicate imports:

```ts
import type {
  InternalEconomicsInputV2Wire,
  NormalizedInternalEconomicsInputV2,
  V2Event,
} from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import { processEventsV2ForTest } from '../../../../shared/lib/internal-economics/v2/derive-composite-v2';
import {
  initializeEventStreamState,
  type EventStreamState,
} from '../../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import {
  runDealByDealWaterfall,
  toTierAllocationsV2,
  type DealByDealTierResult,
  type DealByDealWaterfallResult,
  type EntitlementPool,
} from '../../../../shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2';
import { buildMultiSecurityRealizationV2Input } from '../../../helpers/v2-input-builder';
```

Define every fixture and comparison helper in that test file:

```ts
function stageMultiSecurityInput(
  inputWire: InternalEconomicsInputV2Wire
): {
  input: NormalizedInternalEconomicsInputV2;
  state: EventStreamState;
} {
  const normalized = verifyAndNormalizeInternalEconomicsInputV2(inputWire);
  if (!normalized.ok) throw new Error(normalized.refusal.message);

  const processed = processEventsV2ForTest(
    normalized.input,
    initializeEventStreamState(normalized.input)
  );
  if (!processed.ok) throw new Error(processed.refusal.message);

  return { input: normalized.input, state: processed.state };
}

function buildReversedOrderInput(): InternalEconomicsInputV2Wire {
  const input = buildMultiSecurityRealizationV2Input();
  input.events = input.events
    .map((event): V2Event => {
      if (event.eventId === 'deployment-a') {
        return { ...event, instant: '2025-02-03T00:00:00Z' };
      }
      if (event.eventId === 'deployment-b') {
        return { ...event, instant: '2025-02-02T00:00:00Z' };
      }
      if (event.kind === 'realization') {
        return { ...event, reliefRows: [...event.reliefRows].reverse() };
      }
      return { ...event };
    })
    .reverse();
  return input;
}

const sumMap = (values: ReadonlyMap<string, Decimal>) =>
  [...values.values()].reduce(
    (total, value) => total.plus(value),
    new Decimal(0)
  );

const sumPools = (pools: readonly EntitlementPool[]) =>
  pools.reduce(
    (total, pool) => total.plus(pool.proceedsAvailable),
    new Decimal(0)
  );

const sumByPartner = (tiers: readonly DealByDealTierResult[]) => {
  const totals = new Map<string, Decimal>();
  for (const tier of tiers) {
    for (const [partnerId, amount] of tier.perPartner) {
      totals.set(
        partnerId,
        (totals.get(partnerId) ?? new Decimal(0)).plus(amount)
      );
    }
  }
  return totals;
};

function keyedPools(result: DealByDealWaterfallResult) {
  return Object.fromEntries(
    result.pools
      .map(
        (pool) =>
          [
            `${pool.dealId}:${pool.securityId}`,
            {
              proceeds: pool.proceedsAvailable.toFixed(6),
              basis: pool.costBasisRelieved.toFixed(6),
              gainLoss: pool.gainLoss.toFixed(6),
            },
          ] as const
      )
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function keyedPartnerDistributions(
  distributions: ReadonlyMap<string, Decimal>
) {
  return Object.fromEntries(
    [...distributions.entries()]
      .map(
        ([partnerId, amount]) =>
          [partnerId, amount.toFixed(6)] as const
      )
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function canonicalState(value: unknown): unknown {
  if (value instanceof Decimal) return value.toFixed(6);
  if (value instanceof Map) {
    return [...value.entries()]
      .sort(([left], [right]) =>
        String(left).localeCompare(String(right))
      )
      .map(([key, entry]) => [key, canonicalState(entry)]);
  }
  if (Array.isArray(value)) return value.map(canonicalState);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalState(entry)])
    );
  }
  return value;
}

const snapshotState = (state: EventStreamState) => canonicalState(state);
```

- [ ] **Step 2: Add the RED exact-routing, conservation, and order-invariance test**

Add this complete test block:

```ts
describe('multi-security deal-by-deal realization routing', () => {
  it('routes each proceeds lot to its exact security pool', () => {
    const { input, state } = stageMultiSecurityInput(
      buildMultiSecurityRealizationV2Input()
    );
    const result = runDealByDealWaterfall(input, state);
    if (!result.ok) throw new Error(result.refusal.message);

    expect(keyedPools(result)).toEqual({
      'deal-1:security-a': {
        proceeds: '120.000000',
        basis: '60.000000',
        gainLoss: '60.000000',
      },
      'deal-1:security-b': {
        proceeds: '80.000000',
        basis: '40.000000',
        gainLoss: '40.000000',
      },
    });
    expect(sumPools(result.pools).toFixed(6)).toBe('200.000000');

    for (const tier of result.tierAllocations) {
      expect(tier.gpShare.plus(tier.lpShare).toFixed(6)).toBe(
        tier.totalAllocated.toFixed(6)
      );
      expect(sumMap(tier.perPartner).toFixed(6)).toBe(
        tier.totalAllocated.toFixed(6)
      );
    }
    expect(sumMap(result.partnerDistributions).toFixed(6)).toBe(
      result.totalDistributed.toFixed(6)
    );
    expect(keyedPartnerDistributions(result.partnerDistributions)).toEqual({
      'gp-1': '29.087605',
      'lp-1': '170.912395',
    });

    const returnOfCapital = result.tierAllocations.filter(
      (tier) => tier.kind === 'return_of_capital'
    );
    const carry = result.tierAllocations.filter(
      (tier) => tier.kind === 'carry'
    );
    expect(sumMap(sumByPartner(returnOfCapital)).toFixed(6)).toBe(
      '100.000000'
    );
    expect(
      returnOfCapital
        .reduce(
          (total, tier) => total.plus(tier.gpShare),
          new Decimal(0)
        )
        .toFixed(6)
    ).toBe('9.087605');
    expect(
      returnOfCapital
        .reduce(
          (total, tier) => total.plus(tier.lpShare),
          new Decimal(0)
        )
        .toFixed(6)
    ).toBe('90.912395');
    expect(
      carry
        .reduce(
          (total, tier) => total.plus(tier.gpShare),
          new Decimal(0)
        )
        .toFixed(6)
    ).toBe('20.000000');
    expect(
      carry
        .reduce(
          (total, tier) => total.plus(tier.lpShare),
          new Decimal(0)
        )
        .toFixed(6)
    ).toBe('80.000000');

    const reversed = stageMultiSecurityInput(buildReversedOrderInput());
    const reversedResult = runDealByDealWaterfall(
      reversed.input,
      reversed.state
    );
    if (!reversedResult.ok) {
      throw new Error(reversedResult.refusal.message);
    }

    expect(keyedPools(reversedResult)).toEqual(keyedPools(result));
    expect(
      toTierAllocationsV2(reversedResult.tierAllocations)
    ).toEqual(toTierAllocationsV2(result.tierAllocations));
    expect(
      keyedPartnerDistributions(reversedResult.partnerDistributions)
    ).toEqual(keyedPartnerDistributions(result.partnerDistributions));
  });
});
```

- [ ] **Step 3: Add the missing-exact-pool typed-refusal test**

Add a second complete test block:

```ts
describe('multi-security deal-by-deal realization routing', () => {
  it('refuses a proceeds lot whose exact entitlement pool is absent', () => {
    const { input, state } = stageMultiSecurityInput(
      buildMultiSecurityRealizationV2Input()
    );
    expect(
      state.cashSourceLots.has('proceeds:realization-1:security-b')
    ).toBe(true);
    expect(
      state.investmentLots.delete(
        'inv:deal-1:security-b:deployment-b'
      )
    ).toBe(true);

    const before = snapshotState(state);
    const result = runDealByDealWaterfall(input, state);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected missing exact entitlement pool refusal');
    }
    expect(result.refusal).toMatchObject({
      code: 'INVESTMENT_LOT_RELIEF_VIOLATION',
      stage: 'waterfall',
      diagnostics: {
        dealId: 'deal-1',
        securityId: 'security-b',
      },
    });
    expect(snapshotState(state)).toEqual(before);
  });
});
```

Snapshot after deleting
`inv:deal-1:security-b:deployment-b`, while
`proceeds:realization-1:security-b` remains present. This proves refusal does
not mutate the already staged state.

- [ ] **Step 4: Run the tests and confirm RED**

```bash
TZ=UTC npx vitest run \
  tests/unit/internal-economics/v2/waterfall-deal-by-deal-v2.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
```

Expected: FAIL because `buildEntitlementPools` routes both realization lots to
the first same-deal pool and does not refuse the missing exact pool.

- [ ] **Step 5: Implement exact lookup and refusal propagation**

Change the source-local return type and exact lookup:

```ts
type BuildEntitlementPoolsResult =
  | { readonly ok: true; readonly pools: EntitlementPool[] }
  | { readonly ok: false; readonly refusal: V2CoreRefusal };

function buildEntitlementPools(
  state: EventStreamState
): BuildEntitlementPoolsResult {
  const poolMap = new Map<string, EntitlementPool>();

  // Preserve existing investment-lot pool construction.

  for (const [, lot] of state.cashSourceLots) {
    if (
      lot.origin !== 'event' ||
      lot.sourceKind !== 'realization_proceeds'
    ) {
      continue;
    }

    const key = `${lot.dealId}:${lot.securityId}`;
    const pool = poolMap.get(key);
    if (!pool) {
      return {
        ok: false,
        refusal: refuse(
          'INVESTMENT_LOT_RELIEF_VIOLATION',
          `Realization proceeds lot '${lot.lotId}' has no exact entitlement pool.`,
          { dealId: lot.dealId, securityId: lot.securityId }
        ),
      };
    }
    pool.proceedsAvailable = pool.proceedsAvailable.plus(
      lot.remainingBalance
    );
  }

  for (const [, pool] of poolMap) {
    pool.gainLoss = pool.proceedsAvailable.minus(
      pool.costBasisRelieved
    );
  }

  return { ok: true, pools: Array.from(poolMap.values()) };
}
```

At the start of `runDealByDealWaterfall`, replace direct pool construction:

```ts
const poolResult = buildEntitlementPools(state);
if (!poolResult.ok) return poolResult;
const pools = poolResult.pools;
```

Do not mutate event-stream state in `buildEntitlementPools`. Preserve the
existing separate cross-pool preference refusal.

- [ ] **Step 6: Run focused tests and preserve the uncommitted Stage B diff**

```bash
TZ=UTC npx vitest run \
  tests/unit/internal-economics/v2/waterfall-deal-by-deal-v2.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
git diff --check -- \
  shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts \
  tests/unit/internal-economics/v2/waterfall-deal-by-deal-v2.test.ts
```

Expected: focused test PASS. Do not commit; continue to Stage C in the same
working tree because receipt/version consumers are not green until Stage D.

---

#### Stage C: Prove Partial Recycling and Whole-Fund Invariance

**Files:**

- Modify:
  `tests/unit/internal-economics/v2/eventful-receipt-v2.test.ts:1-25,753-860`
- Modify:
  `tests/unit/internal-economics/v2/waterfall-whole-fund-v2.test.ts:1-20,209-320`

**Interfaces:**

- Consumes:
  `buildMultiSecurityRealizationV2Input(): InternalEconomicsInputV2Wire`
  from Task 1.
- Produces no new production interface. Tests prove per-security cash-lot
  conservation, receipt lineage, partner/class ledgers, and aggregate
  whole-fund order invariance.

- [ ] **Step 1: Add the partial-recycling receipt fixture and helpers**

In `eventful-receipt-v2.test.ts`, merge these imports into the existing groups:

```ts
import type { InternalEconomicsReceiptV2 } from '../../../../shared/contracts/internal-economics/internal-economics-receipt-v2.contract';
import { buildMultiSecurityRealizationV2Input } from '../../../helpers/v2-input-builder';
```

The file already imports `InternalEconomicsInputV2Wire`,
`NormalizedInternalEconomicsInputV2`, `V2Event`,
`certifyInternalEconomicsDualLaneV2`, `processEventsV2ForTest`,
`initializeEventStreamState`, and `EventStreamState`. Define these helpers
locally:

```ts
function buildPartialRecyclingInput(): InternalEconomicsInputV2Wire {
  const input = buildMultiSecurityRealizationV2Input();
  const deployment: V2Event = {
    eventId: 'deployment-2',
    instant: '2025-04-02T00:00:00Z',
    amountUsd: '100.000000',
    kind: 'deployment',
    dealId: 'deal-2',
    securityId: 'security-c',
    cashSourceAllocations: [
      {
        lotId: 'proceeds:realization-1:security-a',
        amount: '100.000000',
      },
    ],
  };
  input.events = [...input.events, deployment];
  return input;
}

function buildReversedPartialRecyclingInput(): InternalEconomicsInputV2Wire {
  const input = buildPartialRecyclingInput();
  input.events = input.events
    .map((event): V2Event => {
      if (event.eventId === 'deployment-a') {
        return { ...event, instant: '2025-02-03T00:00:00Z' };
      }
      if (event.eventId === 'deployment-b') {
        return { ...event, instant: '2025-02-02T00:00:00Z' };
      }
      if (event.kind === 'realization') {
        return { ...event, reliefRows: [...event.reliefRows].reverse() };
      }
      return { ...event };
    })
    .reverse();
  return input;
}

function stagePartialRecyclingInput(
  inputWire: InternalEconomicsInputV2Wire
): {
  input: NormalizedInternalEconomicsInputV2;
  state: EventStreamState;
} {
  const input = normalized(inputWire);
  const processed = processEventsV2ForTest(
    input,
    initializeEventStreamState(input)
  );
  if (!processed.ok) throw new Error(processed.refusal.message);
  return { input, state: processed.state };
}

function requireRealizationProceedsLot(
  state: EventStreamState,
  lotId: string
) {
  const lot = state.cashSourceLots.get(lotId);
  if (
    !lot ||
    lot.origin !== 'event' ||
    lot.sourceKind !== 'realization_proceeds'
  ) {
    throw new Error(`Missing realization proceeds lot ${lotId}`);
  }
  return lot;
}

const consumed = (state: EventStreamState, lotId: string) =>
  state.consumptionRecords
    .filter((record) => record.lotId === lotId)
    .reduce(
      (total, record) => total.plus(record.amountUsd),
      new Decimal(0)
    );

const lineageByLot = (receipt: InternalEconomicsReceiptV2) =>
  new Map(
    receipt.lineage.cashLots.map((lot) => [
      lot.lotId,
      lot.consumingEventIds,
    ])
  );

function keyedReceiptPartners(receipt: InternalEconomicsReceiptV2) {
  return Object.fromEntries(
    receipt.partnerLedgers
      .map(
        (ledger) =>
          [
            ledger.partnerId,
            {
              cumulativeDistributions: ledger.cumulativeDistributions,
              returnOfCapital: ledger.returnOfCapital,
              carryPaid: ledger.carryPaid,
            },
          ] as const
      )
      .sort(([left], [right]) => left.localeCompare(right))
  );
}
```

- [ ] **Step 2: Add the partial-recycling state and receipt truth test**

Add one concrete test that defines `state`, `live`, `receipt`, and
`wholeReceipt` before asserting them:

```ts
describe('multi-security partial recycling receipts', () => {
  it('conserves security lots and certifies both waterfall lanes', () => {
    const inputWire = buildPartialRecyclingInput();
    const { state } = stagePartialRecyclingInput(inputWire);
    const securityALot = requireRealizationProceedsLot(
      state,
      'proceeds:realization-1:security-a'
    );
    const securityBLot = requireRealizationProceedsLot(
      state,
      'proceeds:realization-1:security-b'
    );

    expect(securityALot.remainingBalance.toFixed(6)).toBe('20.000000');
    expect(securityBLot.remainingBalance.toFixed(6)).toBe('80.000000');
    expect(
      consumed(state, securityALot.lotId)
        .plus(securityALot.remainingBalance)
        .toFixed(6)
    ).toBe(securityALot.originalAmount.toFixed(6));
    expect(
      consumed(state, securityBLot.lotId)
        .plus(securityBLot.remainingBalance)
        .toFixed(6)
    ).toBe(securityBLot.originalAmount.toFixed(6));
    expect(
      securityALot.originalAmount
        .plus(securityBLot.originalAmount)
        .toFixed(6)
    ).toBe('200.000000');

    const live = certifyInternalEconomicsDualLaneV2(inputWire);
    if (!live.ok) throw new Error(live.refusal.message);
    const receipt = live.certification.dealByDeal;
    const wholeReceipt = live.certification.wholeFund;

    const lineage = lineageByLot(receipt);
    expect(
      lineage.get('proceeds:realization-1:security-a')
    ).toContain('deployment-2');
    expect(
      lineage.get('proceeds:realization-1:security-b')
    ).toEqual([]);
    expect(receipt.fundCashEquation).toEqual({
      openingCash: '550000.000000',
      contributions: '200.000000',
      deployments: '300.000000',
      realizations: '200.000000',
      fees: '0.000000',
      expenses: '0.000000',
      distributions: '100.000000',
      endingCash: '550000.000000',
    });
    expect(receipt.tierAllocations).toEqual([
      {
        kind: 'return_of_capital',
        priority: 1,
        totalAllocated: '60.000000',
        gpShare: '5.452563',
        lpShare: '54.547437',
      },
      {
        kind: 'carry',
        priority: 2,
        totalAllocated: '40.000000',
        gpShare: '8.000000',
        lpShare: '32.000000',
      },
    ]);
    expect(receipt.partnerLedgers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          partnerId: 'gp-1',
          unreturnedSettledCashCapital: '49994.547437',
          cumulativeDistributions: '13.452563',
          returnOfCapital: '5.452563',
          preferredReturnPaid: '0.000000',
          catchUpPaid: '0.000000',
          carryPaid: '8.000000',
        }),
        expect.objectContaining({
          partnerId: 'lp-1',
          unreturnedSettledCashCapital: '500145.452563',
          cumulativeDistributions: '86.547437',
          returnOfCapital: '54.547437',
          preferredReturnPaid: '0.000000',
          catchUpPaid: '0.000000',
          carryPaid: '32.000000',
        }),
      ])
    );
    expect(receipt.classLedgers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lpClassId: 'class-a',
          cumulativeDistributions: '86.547437',
          returnOfCapital: '54.547437',
          carryPaid: '32.000000',
        }),
      ])
    );

    expect(wholeReceipt.fundCashEquation).toEqual(
      receipt.fundCashEquation
    );
    expect(wholeReceipt.tierAllocations).toEqual([
      {
        kind: 'return_of_capital',
        priority: 1,
        totalAllocated: '100.000000',
        gpShare: '9.087605',
        lpShare: '90.912395',
      },
    ]);
    expect(wholeReceipt.partnerLedgers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          partnerId: 'gp-1',
          unreturnedSettledCashCapital: '49990.912395',
          cumulativeDistributions: '9.087605',
          returnOfCapital: '9.087605',
          carryPaid: '0.000000',
        }),
        expect.objectContaining({
          partnerId: 'lp-1',
          unreturnedSettledCashCapital: '500109.087605',
          cumulativeDistributions: '90.912395',
          returnOfCapital: '90.912395',
          carryPaid: '0.000000',
        }),
      ])
    );

    const reversedLive = certifyInternalEconomicsDualLaneV2(
      buildReversedPartialRecyclingInput()
    );
    if (!reversedLive.ok) {
      throw new Error(reversedLive.refusal.message);
    }
    expect(
      reversedLive.certification.dealByDeal.tierAllocations
    ).toEqual(receipt.tierAllocations);
    expect(
      keyedReceiptPartners(reversedLive.certification.dealByDeal)
    ).toEqual(keyedReceiptPartners(receipt));
    expect(
      reversedLive.certification.wholeFund.tierAllocations
    ).toEqual(wholeReceipt.tierAllocations);
    expect(
      keyedReceiptPartners(reversedLive.certification.wholeFund)
    ).toEqual(keyedReceiptPartners(wholeReceipt));
  });
});
```

- [ ] **Step 3: Add raw whole-fund order-invariance coverage**

In `waterfall-whole-fund-v2.test.ts`, merge these imports into existing
groups:

```ts
import type {
  InternalEconomicsInputV2Wire,
  NormalizedInternalEconomicsInputV2,
  V2Event,
} from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import { processEventsV2ForTest } from '../../../../shared/lib/internal-economics/v2/derive-composite-v2';
import { buildMultiSecurityRealizationV2Input } from '../../../helpers/v2-input-builder';
```

That file already imports `initializeEventStreamState`, `EventStreamState`,
`runWholeFundWaterfall`, `toTierAllocationsV2`, and the normalizer. Add local
helpers rather than importing private test code:

```ts
function buildPartialWholeFundInput(): InternalEconomicsInputV2Wire {
  const input = buildMultiSecurityRealizationV2Input();
  input.selectedLane = 'whole_fund';
  input.events = [
    ...input.events,
    {
      eventId: 'deployment-2',
      instant: '2025-04-02T00:00:00Z',
      amountUsd: '100.000000',
      kind: 'deployment',
      dealId: 'deal-2',
      securityId: 'security-c',
      cashSourceAllocations: [
        {
          lotId: 'proceeds:realization-1:security-a',
          amount: '100.000000',
        },
      ],
    },
  ];
  return input;
}

function buildReversedPartialWholeFundInput():
  InternalEconomicsInputV2Wire {
  const input = buildPartialWholeFundInput();
  input.events = input.events
    .map((event): V2Event => {
      if (event.eventId === 'deployment-a') {
        return { ...event, instant: '2025-02-03T00:00:00Z' };
      }
      if (event.eventId === 'deployment-b') {
        return { ...event, instant: '2025-02-02T00:00:00Z' };
      }
      if (event.kind === 'realization') {
        return { ...event, reliefRows: [...event.reliefRows].reverse() };
      }
      return { ...event };
    })
    .reverse();
  return input;
}

function stageWholeFundInput(
  inputWire: InternalEconomicsInputV2Wire
): {
  input: NormalizedInternalEconomicsInputV2;
  state: EventStreamState;
} {
  const normalized =
    verifyAndNormalizeInternalEconomicsInputV2(inputWire);
  if (!normalized.ok) throw new Error(normalized.refusal.message);
  const processed = processEventsV2ForTest(
    normalized.input,
    initializeEventStreamState(normalized.input)
  );
  if (!processed.ok) throw new Error(processed.refusal.message);
  return { input: normalized.input, state: processed.state };
}

function keyedWholeFundPartners(
  distributions: ReadonlyMap<string, Decimal>
) {
  return Object.fromEntries(
    [...distributions.entries()]
      .map(
        ([partnerId, amount]) =>
          [partnerId, amount.toFixed(6)] as const
      )
      .sort(([left], [right]) => left.localeCompare(right))
  );
}
```

Add the concrete test:

```ts
it('keeps partial-recycling whole-fund output invariant to source order', () => {
  const base = stageWholeFundInput(buildPartialWholeFundInput());
  const result = runWholeFundWaterfall(base.input, base.state);
  if (!result.ok) throw new Error(result.refusal.message);

  expect(result.totalDistributed.toFixed(6)).toBe('100.000000');
  expect(keyedWholeFundPartners(result.partnerDistributions)).toEqual({
    'gp-1': '9.087605',
    'lp-1': '90.912395',
  });
  expect(toTierAllocationsV2(result.tierAllocations)).toEqual([
    {
      kind: 'return_of_capital',
      priority: 1,
      totalAllocated: '100.000000',
      gpShare: '9.087605',
      lpShare: '90.912395',
    },
  ]);

  const reversed = stageWholeFundInput(
    buildReversedPartialWholeFundInput()
  );
  const reversedResult = runWholeFundWaterfall(
    reversed.input,
    reversed.state
  );
  if (!reversedResult.ok) {
    throw new Error(reversedResult.refusal.message);
  }

  expect(reversedResult.totalDistributed.toFixed(6)).toBe(
    result.totalDistributed.toFixed(6)
  );
  expect(
    toTierAllocationsV2(reversedResult.tierAllocations)
  ).toEqual(toTierAllocationsV2(result.tierAllocations));
  expect(
    keyedWholeFundPartners(reversedResult.partnerDistributions)
  ).toEqual(keyedWholeFundPartners(result.partnerDistributions));
});
```

- [ ] **Step 4: Run tests and preserve the uncommitted Stage C diff**

```bash
TZ=UTC npx vitest run \
  tests/unit/internal-economics/v2/eventful-receipt-v2.test.ts \
  tests/unit/internal-economics/v2/waterfall-whole-fund-v2.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
git diff --check -- \
  tests/unit/internal-economics/v2/eventful-receipt-v2.test.ts \
  tests/unit/internal-economics/v2/waterfall-whole-fund-v2.test.ts
```

Expected: focused tests PASS. Do not commit; continue to Stage D in the same
working tree because all Task 2 behavior and version evidence ships atomically.

---

#### Stage D: Version and Certify Changed Outputs

**Files:**

- Modify:
  `shared/contracts/internal-economics/internal-economics-receipt-v2.contract.ts:8-10,249-255`
- Modify: `docs/ARCHI.md` section 8 — update the 2.3.0 component identities to the
  2.4.0 tuple (receipt/serializer/event-engine/composite/deal-by-deal) and note
  the exact `dealId:securityId` proceeds routing
- Modify: `shared/lib/internal-economics/v2/event-stream-engine-v2.ts:24-25`
- Modify:
  `shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts:18-19`
- Modify:
  `shared/lib/internal-economics/v2/liquidity-receipt-builder-v2.ts:48-49`
- Modify: `shared/lib/internal-economics/v2/derive-composite-v2.ts:38-39`
- Create:
  `tests/unit/internal-economics/v2/support/canonical-receipt-changed-case-manifest-v3.ts`
- Modify:
  `tests/unit/internal-economics/v2/conformance-closure-v2.test.ts:268-460`
- Modify:
  `tests/unit/truth-cases/internal-economics-v2-first-success.test.ts:38-230`
- Modify:
  `tests/unit/truth-cases/internal-economics-v2-opening-state.test.ts:92-155`
- Modify:
  `tests/unit/internal-economics/v2/eventful-receipt-v2.test.ts:140-170`
- Modify:
  `tests/unit/internal-economics/v2/derive-composite-v2.test.ts:143-180,663-675`
- Modify:
  `tests/unit/truth-cases/internal-economics-v2-multi-security-routing.test.ts`

- [ ] **Step 1: Update only the changed version literals**

Apply the exact tuple at the top of this plan. Update every hard-coded version
consumer listed in **Files**. Leave whole-fund and normalizer/input unchanged.

- [ ] **Step 2: Create standalone manifest v3 before importing it**

Leave v1 and v2 byte-frozen. Export four entries:

1. `V2-S-0101`, chained from v2 `afterResultHash`;
2. `V2-S-0100`, chained from v2 `afterResultHash`;
3. `V2-S-0102-deal-by-deal`, using Task 1's frozen deal-by-deal hash;
4. `V2-S-0102-whole-fund`, using Task 1's frozen whole-fund hash.

Each entry records case ID, before/after receipt version, normalized input hash,
before/after result hashes, and exactly one reason. Use separate S-0102 reasons
for exact security routing and whole-fund receipt identity movement caused by
shared component versions.

Materialize the four post-fix hashes deterministically before writing v3:

1. add a temporary `toMatchInlineSnapshot()` for the live result hash in
   `internal-economics-v2-first-success.test.ts`,
   `internal-economics-v2-opening-state.test.ts`, and both lanes in
   `internal-economics-v2-multi-security-routing.test.ts`;
2. run the three files once with `-u`, then twice without `-u`;
3. require both non-update runs to reproduce the same four lowercase
   64-character hashes;
4. copy those exact hashes into manifest v3 and remove every temporary snapshot
   before the final run.

```bash
TZ=UTC npx vitest run \
  tests/unit/truth-cases/internal-economics-v2-first-success.test.ts \
  tests/unit/truth-cases/internal-economics-v2-opening-state.test.ts \
  tests/unit/truth-cases/internal-economics-v2-multi-security-routing.test.ts \
  --config vitest.config.mjs --configLoader native --project=server -u
TZ=UTC npx vitest run \
  tests/unit/truth-cases/internal-economics-v2-first-success.test.ts \
  tests/unit/truth-cases/internal-economics-v2-opening-state.test.ts \
  tests/unit/truth-cases/internal-economics-v2-multi-security-routing.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
TZ=UTC npx vitest run \
  tests/unit/truth-cases/internal-economics-v2-first-success.test.ts \
  tests/unit/truth-cases/internal-economics-v2-opening-state.test.ts \
  tests/unit/truth-cases/internal-economics-v2-multi-security-routing.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
```

- [ ] **Step 3: Replace the baseline-only assertion with concrete final truth**

Use the actual exports and define every helper in the truth-case file:

```ts
import { describe, expect, it } from 'vitest';
import { Decimal } from '../../../shared/lib/decimal-config';
import type {
  InternalEconomicsInputV2Wire,
  NormalizedInternalEconomicsInputV2,
  V2Event,
} from '../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import {
  certifyInternalEconomicsDualLaneV2,
  processEventsV2ForTest,
} from '../../../shared/lib/internal-economics/v2/derive-composite-v2';
import {
  initializeEventStreamState,
  type EventStreamState,
} from '../../../shared/lib/internal-economics/v2/event-stream-engine-v2';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../shared/lib/internal-economics/v2/normalize-input-v2';
import {
  runDealByDealWaterfall,
  toTierAllocationsV2 as dealToTierAllocations,
  type DealByDealWaterfallResult,
} from '../../../shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2';
import {
  runWholeFundWaterfall,
  toTierAllocationsV2 as wholeToTierAllocations,
} from '../../../shared/lib/internal-economics/v2/waterfall-whole-fund-v2';
import {
  buildMultiSecurityRealizationV2Input,
  MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES,
} from '../../helpers/v2-input-builder';
import { CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V3 } from '../internal-economics/v2/support/canonical-receipt-changed-case-manifest-v3';

function stage(inputWire: InternalEconomicsInputV2Wire): {
  input: NormalizedInternalEconomicsInputV2;
  state: EventStreamState;
} {
const normalized = verifyAndNormalizeInternalEconomicsInputV2(inputWire);
if (!normalized.ok) throw new Error(normalized.refusal.message);
const processed = processEventsV2ForTest(
  normalized.input,
  initializeEventStreamState(normalized.input)
);
if (!processed.ok) throw new Error(processed.refusal.message);
  return { input: normalized.input, state: processed.state };
}

function buildReversedOrderInput(): InternalEconomicsInputV2Wire {
  const input = buildMultiSecurityRealizationV2Input();
  input.events = input.events
    .map((event): V2Event => {
      if (event.eventId === 'deployment-a') {
        return { ...event, instant: '2025-02-03T00:00:00Z' };
      }
      if (event.eventId === 'deployment-b') {
        return { ...event, instant: '2025-02-02T00:00:00Z' };
      }
      if (event.kind === 'realization') {
        return { ...event, reliefRows: [...event.reliefRows].reverse() };
      }
      return { ...event };
    })
    .reverse();
  return input;
}

function keyedProceeds(state: EventStreamState) {
  const rows: Array<
    readonly [
      string,
      {
        lotId: string;
        originalAmount: string;
        remainingBalance: string;
      },
    ]
  > = [];
  for (const lot of state.cashSourceLots.values()) {
    if (lot.origin !== 'event' || lot.sourceKind !== 'realization_proceeds') {
      continue;
    }
    rows.push([
      lot.securityId,
      {
        lotId: lot.lotId,
        originalAmount: lot.originalAmount.toFixed(6),
        remainingBalance: lot.remainingBalance.toFixed(6),
      },
    ] as const);
  }
  rows.sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(rows);
}

function keyedPools(result: DealByDealWaterfallResult) {
  return Object.fromEntries(
    result.pools
      .map(
        (pool) =>
          [
            `${pool.dealId}:${pool.securityId}`,
            {
              proceeds: pool.proceedsAvailable.toFixed(6),
              basis: pool.costBasisRelieved.toFixed(6),
              gainLoss: pool.gainLoss.toFixed(6),
            },
          ] as const
      )
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function keyedPartnerDistributions(distributions: ReadonlyMap<string, Decimal>) {
  return Object.fromEntries(
    [...distributions.entries()]
      .map(([partnerId, amount]) => [partnerId, amount.toFixed(6)] as const)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function manifestEntry(caseId: string) {
  const entry = CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V3.find(
    (candidate) => candidate.caseId === caseId
  );
  if (!entry) throw new Error(`Missing manifest-v3 entry ${caseId}`);
  return entry;
}
```

Then implement the named expected-output case:

```ts
it('internal-economics-v2-multi-security-realization-exact-routing', () => {
  const baseWire = buildMultiSecurityRealizationV2Input();
  const base = stage(baseWire);

  expect(keyedProceeds(base.state)).toEqual({
    'security-a': {
      lotId: 'proceeds:realization-1:security-a',
      originalAmount: '120.000000',
      remainingBalance: '120.000000',
    },
    'security-b': {
      lotId: 'proceeds:realization-1:security-b',
      originalAmount: '80.000000',
      remainingBalance: '80.000000',
    },
  });

  const deal = runDealByDealWaterfall(base.input, base.state);
  if (!deal.ok) throw new Error(deal.refusal.message);
  expect(keyedPools(deal)).toEqual({
    'deal-1:security-a': {
      proceeds: '120.000000', basis: '60.000000', gainLoss: '60.000000',
    },
    'deal-1:security-b': {
      proceeds: '80.000000', basis: '40.000000', gainLoss: '40.000000',
    },
  });
  expect(deal.totalDistributed.toFixed(6)).toBe('200.000000');

  const whole = runWholeFundWaterfall(base.input, base.state);
  if (!whole.ok) throw new Error(whole.refusal.message);
  expect(whole.totalDistributed.toFixed(6)).toBe('200.000000');

  const reversed = stage(buildReversedOrderInput());
  const reversedDeal = runDealByDealWaterfall(reversed.input, reversed.state);
  if (!reversedDeal.ok) throw new Error(reversedDeal.refusal.message);
  expect(keyedPools(reversedDeal)).toEqual(keyedPools(deal));
  expect(dealToTierAllocations(reversedDeal.tierAllocations)).toEqual(
    dealToTierAllocations(deal.tierAllocations)
  );
  expect(keyedPartnerDistributions(reversedDeal.partnerDistributions)).toEqual(
    keyedPartnerDistributions(deal.partnerDistributions)
  );

  const reversedWhole = runWholeFundWaterfall(
    reversed.input,
    reversed.state
  );
  if (!reversedWhole.ok) throw new Error(reversedWhole.refusal.message);
  expect(wholeToTierAllocations(reversedWhole.tierAllocations)).toEqual(
    wholeToTierAllocations(whole.tierAllocations)
  );
  expect(keyedPartnerDistributions(reversedWhole.partnerDistributions)).toEqual(
    keyedPartnerDistributions(whole.partnerDistributions)
  );

  const live = certifyInternalEconomicsDualLaneV2(baseWire);
  if (!live.ok) throw new Error(live.refusal.message);
  const dealManifest = manifestEntry('V2-S-0102-deal-by-deal');
  const wholeManifest = manifestEntry('V2-S-0102-whole-fund');
  expect(dealManifest.normalizedInputHash).toBe(
    MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES.normalizedInputHash
  );
  expect(wholeManifest.normalizedInputHash).toBe(
    MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES.normalizedInputHash
  );
  expect(dealManifest.beforeResultHash).toBe(
    MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES.dealByDealResultHash
  );
  expect(wholeManifest.beforeResultHash).toBe(
    MULTI_SECURITY_REALIZATION_PRE_FIX_HASHES.wholeFundResultHash
  );
  expect(live.certification.dealByDeal.resultHash).toBe(
    dealManifest.afterResultHash
  );
  expect(live.certification.wholeFund.resultHash).toBe(
    wholeManifest.afterResultHash
  );
  expect(live.certification.dealByDeal.fundCashEquation).toEqual({
    openingCash: '550000.000000',
    contributions: '200.000000',
    deployments: '200.000000',
    realizations: '200.000000',
    fees: '0.000000',
    expenses: '0.000000',
    distributions: '200.000000',
    endingCash: '550000.000000',
  });
  expect(live.certification.wholeFund.fundCashEquation).toEqual(
    live.certification.dealByDeal.fundCashEquation
  );
  expect(dealManifest.beforeResultHash).not.toBe(dealManifest.afterResultHash);
  expect(wholeManifest.beforeResultHash).not.toBe(
    wholeManifest.afterResultHash
  );
});
```

`buildReversedOrderInput` must swap deployment instants, reverse relief rows,
and reverse the event array. Keyed helpers sort keys before comparison.

- [ ] **Step 4: Add manifest-chain assertions in their owning truth files**

In `internal-economics-v2-first-success.test.ts`, import v3 and bind the existing
v2/live variables explicitly:

```ts
const v2S0101 = CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V2.find(
  (entry) => entry.caseId === 'V2-S-0101'
)!;
const v3S0101 = CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V3.find(
  (entry) => entry.caseId === 'V2-S-0101'
)!;
expect(v3S0101.beforeResultHash).toBe(v2S0101.afterResultHash);
expect(result.receipt.resultHash).toBe(v3S0101.afterResultHash);
expect(result.receipt.normalizedInputHash).toBe(v3S0101.normalizedInputHash);
```

In `internal-economics-v2-opening-state.test.ts`, do the same for S-0100:

```ts
const v2S0100 = CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V2.find(
  (entry) => entry.caseId === 'V2-S-0100'
)!;
const v3S0100 = CANONICAL_RECEIPT_CHANGED_CASE_MANIFEST_V3.find(
  (entry) => entry.caseId === 'V2-S-0100'
)!;
expect(v3S0100.beforeResultHash).toBe(v2S0100.afterResultHash);
expect(result.receipt.resultHash).toBe(v3S0100.afterResultHash);
expect(result.receipt.normalizedInputHash).toBe(v3S0100.normalizedInputHash);
```

The S-0102 truth case owns its two v3 lookups and the exact Task 1 before-hash
assertions shown in Step 3. No undeclared `v2*`, `v3*`, or `live` identifier may
remain.

- [ ] **Step 5: Run every changed behavior, version, and truth consumer before committing**

```bash
TZ=UTC npx vitest run \
  tests/unit/internal-economics/v2/event-stream-engine-v2.test.ts \
  tests/unit/internal-economics/v2/event-stream-atomicity-v2.test.ts \
  tests/unit/internal-economics/v2/waterfall-deal-by-deal-v2.test.ts \
  tests/unit/internal-economics/v2/waterfall-whole-fund-v2.test.ts \
  tests/unit/internal-economics/v2/conformance-closure-v2.test.ts \
  tests/unit/internal-economics/v2/derive-composite-v2.test.ts \
  tests/unit/internal-economics/v2/eventful-receipt-v2.test.ts \
  tests/unit/truth-cases/internal-economics-v2-first-success.test.ts \
  tests/unit/truth-cases/internal-economics-v2-opening-state.test.ts \
  tests/unit/truth-cases/internal-economics-v2-multi-security-routing.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
```

Expected: PASS before Stage D's single atomic commit. Correction, write-off,
conversion, and cross-pool preference refusals remain unchanged; Stages A-C
behavior tests and all receipt/version consumers are green together.

- [ ] **Step 6: Commit exact changed-output evidence**

```bash
git add \
  docs/ARCHI.md \
  shared/contracts/internal-economics/internal-economics-receipt-v2.contract.ts \
  shared/lib/internal-economics/v2/event-stream-engine-v2.ts \
  shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts \
  shared/lib/internal-economics/v2/liquidity-receipt-builder-v2.ts \
  shared/lib/internal-economics/v2/derive-composite-v2.ts \
  tests/unit/internal-economics/v2/support/canonical-receipt-changed-case-manifest-v3.ts \
  tests/unit/internal-economics/v2/conformance-closure-v2.test.ts \
  tests/unit/internal-economics/v2/event-stream-engine-v2.test.ts \
  tests/unit/internal-economics/v2/event-stream-atomicity-v2.test.ts \
  tests/unit/internal-economics/v2/waterfall-deal-by-deal-v2.test.ts \
  tests/unit/internal-economics/v2/waterfall-whole-fund-v2.test.ts \
  tests/unit/internal-economics/v2/eventful-receipt-v2.test.ts \
  tests/unit/internal-economics/v2/derive-composite-v2.test.ts \
  tests/unit/truth-cases/internal-economics-v2-first-success.test.ts \
  tests/unit/truth-cases/internal-economics-v2-opening-state.test.ts \
  tests/unit/truth-cases/internal-economics-v2-multi-security-routing.test.ts
git diff --cached --check
git commit -m "feat(economics): certify multi-security realization routing"
```

---

### Task 3: Run Financial Admission Gates

**Files:** No additional source changes unless a gate exposes a defect.

- [ ] **Step 1: Run the focused regression matrix**

```bash
TZ=UTC npx vitest run \
  tests/unit/internal-economics/v2/event-stream-engine-v2.test.ts \
  tests/unit/internal-economics/v2/event-stream-atomicity-v2.test.ts \
  tests/unit/internal-economics/v2/waterfall-deal-by-deal-v2.test.ts \
  tests/unit/internal-economics/v2/waterfall-whole-fund-v2.test.ts \
  tests/unit/internal-economics/v2/eventful-receipt-v2.test.ts \
  tests/unit/truth-cases/internal-economics-v2-multi-security-routing.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
```

- [ ] **Step 2: Run canonical financial and repository gates**

```bash
TZ=UTC npm run test:internal-economics-v2
TZ=UTC npm run calc-gate
TZ=UTC npm run check
TZ=UTC npm run lint
git diff --check
```

Expected: PASS. Preserve the `calc-gate` section showing `phoenix:truth` ran the
named S-0102 case.

- [ ] **Step 3: Inspect exact diff scope**

Confirm no public input-contract change, migration, client/server adapter, new
refusal code, broad version bump, or unrelated financial behavior entered.

- [ ] **Step 4: Obtain fresh exact-head financial review**

Reviewer must check allocation order, source provenance, source-proceeds
conservation, global ledger consumption, per-partner entitlement, refusal
atomicity, version chaining, and the named expected-output case. Any head change
invalidates review and reruns affected gates.

- [ ] **Step 5: Record admission evidence**

Record exact commit/tree SHA, command matrix, named truth result, version tuple,
four v3 hash transitions, and reviewer result in the existing PR/issue evidence
surface. State that affected serving remains blocked until separate source
admission and release complete.

## Definition of Done

1. Every realization-proceeds lot has exact private security lineage.
2. Single-security lot IDs remain compatible; multi-security IDs are
   deterministic and security-suffixed.
3. No prefix or first-match pool selection remains.
4. Zero-proceeds groups and missing exact pools refuse before mutation.
5. Source proceeds, lots, tiers, partners, and whole-fund totals conserve.
6. Changed outputs use the exact version tuple and standalone manifest v3.
7. `calc-gate`, including Phoenix truth, passes the named S-0102 case.
8. Completion grants no merge, deployment, or serving authority.

## Self-Review Record

- **Spec coverage:** Exact lineage, deterministic IDs, zero-proceeds refusal,
  no-mutation failure, partial relief/recycling, permutation invariance,
  tier/partner conservation, whole-fund invariance, versioning, and expected
  output are assigned to explicit tasks.
- **Type consistency:** `runDealByDealWaterfall(input, state)` and nested
  `result.refusal` match current exports. `buildEntitlementPools` has an explicit
  success/refusal union.
- **Scope:** Public schema, normalizer, whole-fund algorithm, and existing
  refusal codes remain unchanged.
