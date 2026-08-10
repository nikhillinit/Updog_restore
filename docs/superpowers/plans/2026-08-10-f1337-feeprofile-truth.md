# F1337 FeeProfile Production Truth Implementation Plan

<!-- prettier-ignore -->
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task. Track execution with checkbox items.

**Goal:** Add eleven production-backed FeeProfile truth cases without changing
fee production code or frozen legacy fee characterization.

**Architecture:** Keep `computeFeePreview` coverage as frozen legacy
characterization. Add a test-local serialized corpus and adapter that parse full
FeeProfiles, convert money to Decimal, call `computeFeeBasisTimeline` once, then
compare complete serialized output exactly.

**Tech Stack:** TypeScript, Vitest, Decimal.js, Zod, JSON,
`@shared/lib/fund-math`, `@shared/schemas/fee-profile`.

## Global Constraints

- Scope: issue #1337 production-fee truth only. Do not add production exports,
  dependencies, schemas, or fee arithmetic.
- `docs/fees.truth-cases.json` is frozen legacy characterization, non-normative,
  SHA-256 `fafd55c32684f911feba20f26ca5a227744a82f63378b746acb421f2682374f8`.
- `tests/unit/truth-cases/fee-adapter.ts` is frozen, SHA-256
  `1baeaa864e5d5873142cc8d913a2c9f8bceafc034436bc60b3776016cad9d781`.
- Preserve existing ten-case Truth Cases: Fees (Phase 1.3 - Active) runner block
  plus `feesCases.length === 10` and all its tag assertions byte-for-byte. Its
  `computeFeePreview` execution remains legacy-only.
- Future #1337 branch owns only `docs/fee-profile.truth-cases.json`,
  `tests/unit/truth-cases/fee-profile-adapter.ts`, and
  `tests/unit/truth-cases/runner.test.ts`.
- Keep types and runtime validators test-local. Never promote them to `shared/`.
- Every monetary JSON value uses six decimals. Represent brief whole-dollar
  amount `"100000000"` as `"100000000.000000"`; value is unchanged. Percentages
  retain supplied decimal fractions: `"0.02"` is 2%; `"2"` must fail.
- Called-capital, distribution, and invested schedules are cumulative
  quarter-end balances. FMV and unrealized-cost schedules are quarter-end
  stocks.
- Keep `tests/unit/economics/retroactive-fee-catch-up.test.ts` unmodified as
  secondary regression evidence for holidays, `maxCatchUpMonths`, fractional
  periods, and catch-up-plus-period-flow rejection.
- All test commands use `TZ=UTC`. Do not use `any`, add dependencies, or use
  emoji.

## Implementation Surface

| File                                                    | Action    | Responsibility                                                                                     |
| ------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `docs/fee-profile.truth-cases.json`                     | Create    | Eleven FeeProfile production-truth records with serialized money.                                  |
| `tests/unit/truth-cases/fee-profile-adapter.ts`         | Create    | Test-local interfaces/validators, Decimal conversion, one production call, result serialization.   |
| `tests/unit/truth-cases/runner.test.ts`                 | Modify    | Separate FeeProfile describe block, exact result equality, negative tests, separate summary count. |
| `docs/fees.truth-cases.json`                            | Read only | Frozen legacy corpus.                                                                              |
| `tests/unit/truth-cases/fee-adapter.ts`                 | Read only | Frozen legacy adapter.                                                                             |
| `tests/unit/economics/retroactive-fee-catch-up.test.ts` | Read only | Retained secondary regression citations.                                                           |

## Program Lifecycle Gates, Branch Preflight, and Ownership Guard

These gates are cumulative and fail closed. This plan may be written and
reviewed while G3 is open, but no #1337 implementation task, test edit, or other
code command begins until every Gate 0 attestation is true. After only the first
three attestations pass, creating or rebasing the empty #1337 branch onto
current `origin/main` is the sole permitted action; it exists only to satisfy
the fourth attestation and does not authorize implementation. Authority:
`docs/1-plans/F_1.3.0_fee-economics-convergence.plan.md`, Lifecycle gates and
sequence. An unmerged plan, preview status, or unrecorded verbal approval is not
durable evidence.

### Gate 0: Durable program authority before implementation

- [ ] Durable G3 acceptance is recorded on `main` for one accepted exact SHA,
      with zero G3-or-earlier obligations, the required verification battery for
      that exact SHA, and an authoritative reviewer verdict.
- [ ] The governing planning authority and this ratified #1337 child plan are
      merged and reachable from `origin/main`.
- [ ] Approved #1337 supersession text and named owner-scope ratification are
      recorded durably. Proposed, offline, unassigned, or stale issue text
      fails.
- [ ] Only after the first three conditions pass, create or rebase the empty
      #1337 branch onto current `origin/main`. Before any implementation task,
      test edit, or other code command, its HEAD equals that current main SHA.
      All four conditions must then pass before implementation begins.

Record the durable external references before running the gate: each `*_REF`
variable is the authoritative main-branch evidence URL or immutable record
identifier; `G3_ACCEPTED_SHA` and `PLANNING_AUTHORITY_SHA` are full commit IDs
from those records. The command intentionally stops for a missing or stale
record.

```bash
set -euo pipefail
git fetch --quiet origin main
ORIGIN_MAIN=$(git rev-parse --verify origin/main^{commit})
: "${G3_ACCEPTED_SHA:?record durable G3 accepted SHA on main}"
: "${G3_ZERO_OBLIGATIONS_REF:?record zero G3-or-earlier obligations evidence}"
: "${G3_VERIFICATION_REF:?record required exact-SHA verification evidence}"
: "${G3_REVIEW_VERDICT_REF:?record authoritative G3 reviewer verdict}"
: "${PLANNING_AUTHORITY_SHA:?record merged planning-authority SHA}"
: "${F1337_SUPERSESSION_RATIFICATION_REF:?record approved #1337 supersession}"
: "${F1337_OWNER_SCOPE_RATIFICATION_REF:?record named #1337 owner-scope ratification}"
G3_ACCEPTED_SHA=$(git rev-parse --verify "$G3_ACCEPTED_SHA^{commit}")
PLANNING_AUTHORITY_SHA=$(git rev-parse --verify "$PLANNING_AUTHORITY_SHA^{commit}")
git merge-base --is-ancestor "$G3_ACCEPTED_SHA" "$ORIGIN_MAIN"
git merge-base --is-ancestor "$PLANNING_AUTHORITY_SHA" "$ORIGIN_MAIN"
test "$(git rev-parse HEAD)" = "$ORIGIN_MAIN"
BASELINE=$(git merge-base HEAD "$ORIGIN_MAIN")
test -n "$BASELINE"
test "$BASELINE" = "$ORIGIN_MAIN"
test "$BASELINE" = "$(git rev-parse "$BASELINE^{commit}")"
git -c core.fsmonitor=false status --short --branch
shasum -a 256 docs/fees.truth-cases.json tests/unit/truth-cases/fee-adapter.ts
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/truth-cases/runner.test.ts
```

Expected: every required durable reference is supplied and reviewed against its
named criterion; both governing SHAs are ancestors of current `origin/main`;
future branch HEAD and immutable `BASELINE` equal current main; no unrelated
tracked, staged, unstaged, or untracked status exists; frozen hashes match; and
runner baseline is `118 passed (118)`. Any failed command blocks all code work.

### Fresh-shell ownership guard

Every fenced shell block below that uses `BASELINE` begins with this same
prologue. It re-fetches current main, resolves a non-empty immutable merge base
in that shell, proves branch contains current main, and enables `pipefail` so a
failure inside the grouped ownership pipeline cannot be hidden by `sort`.

```bash
set -euo pipefail
git fetch --quiet origin main
ORIGIN_MAIN=$(git rev-parse --verify origin/main^{commit})
BASELINE=$(git merge-base HEAD "$ORIGIN_MAIN")
test -n "$BASELINE"
test "$BASELINE" = "$ORIGIN_MAIN"
test "$BASELINE" = "$(git rev-parse "$BASELINE^{commit}")"
{
  git diff --name-only "$BASELINE"
  git ls-files --others --exclude-standard
} | sort -u
git diff -- docs/fees.truth-cases.json tests/unit/truth-cases/fee-adapter.ts
git diff --check
```

Expected: output contains only owned paths, if any; no unrelated tracked,
staged, unstaged, or untracked path appears. Frozen-file diff is empty;
whitespace check is silent. Review runner diff with
`git diff --unified=0 "$BASELINE" -- tests/unit/truth-cases/runner.test.ts`.
Allowed changes: FeeProfile imports, a new describe block, runner header
wording, and overall-summary field/term. Any line edit inside legacy ten-case
block, its count, or tag assertions fails gate. Repair only branch-owned change;
never overwrite concurrent edits.

---

### Task 1: Establish baseline and lock secondary evidence

**Files:** none (read-only).

**Interfaces:**

- Produces: `BASELINE`, green 118/118 baseline, exact legacy hashes, and fixed
  secondary regression citations.

- [ ] **Step 1: Record branch and clean ownership baseline.**

```bash
set -euo pipefail
git fetch --quiet origin main
ORIGIN_MAIN=$(git rev-parse --verify origin/main^{commit})
BASELINE=$(git merge-base HEAD "$ORIGIN_MAIN")
test -n "$BASELINE"
test "$BASELINE" = "$ORIGIN_MAIN"
test "$BASELINE" = "$(git rev-parse "$BASELINE^{commit}")"
printf '%s\n' "$BASELINE"
git -c core.fsmonitor=false status --short --branch
{
  git diff --name-only "$BASELINE"
  git ls-files --others --exclude-standard
} | sort -u
```

Expected: immutable SHA prints and equals current `origin/main`; intended branch
contains current main; no branch-owned diff. Ownership block and status show no
unrelated tracked, staged, unstaged, or untracked file. Stop for any unrelated
status or a branch not rebased onto current main.

- [ ] **Step 2: Prove legacy state and current runner baseline.**

```bash
shasum -a 256 docs/fees.truth-cases.json tests/unit/truth-cases/fee-adapter.ts
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/truth-cases/runner.test.ts
```

Expected: hash output exactly equals both Global Constraints values; Vitest
exits 0 with `118 passed (118)`.

- [ ] **Step 3: Cite, do not duplicate, existing catch-up regressions.**

```bash
rg -n -C 2 'fee holiday|maxCatchUpMonths|fractional|period-flow' tests/unit/economics/retroactive-fee-catch-up.test.ts
```

Expected: existing coverage covers holidays, `maxCatchUpMonths`, fractional
periods, and catch-up-plus-flow rejection. Do not edit this test.

- [ ] **Step 4: Run lifecycle gate.**

```bash
set -euo pipefail
git fetch --quiet origin main
ORIGIN_MAIN=$(git rev-parse --verify origin/main^{commit})
BASELINE=$(git merge-base HEAD "$ORIGIN_MAIN")
test -n "$BASELINE"
test "$BASELINE" = "$ORIGIN_MAIN"
test "$BASELINE" = "$(git rev-parse "$BASELINE^{commit}")"
{
  git diff --name-only "$BASELINE"
  git ls-files --others --exclude-standard
} | sort -u
git diff --check
```

Expected: no changed or untracked paths and no whitespace output.

### Task 2: Write failing FeeProfile production contract in unified runner

**Files:**

- Modify: `tests/unit/truth-cases/runner.test.ts`
- Create later: `docs/fee-profile.truth-cases.json`
- Create later: `tests/unit/truth-cases/fee-profile-adapter.ts`

**Interfaces:**

- Consumes later default JSON import plus
  `executeFeeProfileTruthCase(testCase): FeeProfileTruthResult`.
- Produces a standalone production block without changing legacy fee execution.

- [ ] **Step 1: Add production imports and separate failing describe block.**

Place imports beside existing legacy fee imports, leaving their text unchanged:

```ts
import feeProfileCases from '../../../docs/fee-profile.truth-cases.json';
import {
  executeFeeProfileTruthCase,
  type FeeProfileTruthCase,
} from './fee-profile-adapter';
```

Add this block after legacy Fees describe block:

```ts
describe('Truth Cases: FeeProfile production truth', () => {
  const cases = feeProfileCases as FeeProfileTruthCase[];

  cases.forEach((testCase) => {
    it(`${testCase.id}: ${testCase.description}`, () => {
      expect(executeFeeProfileTruthCase(testCase)).toEqual(testCase.expected);
    });
  });

  it('has exactly eleven unique production cases and required tags', () => {
    expect(cases).toHaveLength(11);
    expect(new Set(cases.map((testCase) => testCase.id)).size).toBe(11);

    const tags = new Set(cases.flatMap((testCase) => testCase.tags));
    [
      'baseline',
      'step-down',
      'catch-up',
      'recycling',
      'cap',
      'cumulative-distributions',
      'downward-adjustment',
      'committed-capital',
      'called-capital-cumulative',
      'called-capital-period',
      'called-capital-net-of-returns',
      'invested-capital',
      'fair-market-value',
      'unrealized-cost',
    ].forEach((tag) => expect(tags.has(tag)).toBe(true));
  });
```

Add remaining negative tests to same production describe block:

```ts
  it('rejects zero numQuarters', () => {
    const testCase = structuredClone(cases[0]!);
    testCase.input.numQuarters = 0;
    expect(() => executeFeeProfileTruthCase(testCase)).toThrow(
      'input.numQuarters must be a positive integer'
    );
  });

  it('rejects schedule length mismatch', () => {
    const testCase = structuredClone(cases[2]!);
    testCase.input.calledCapitalScheduleUsd = ['10000000.000000'];
    expect(() => executeFeeProfileTruthCase(testCase)).toThrow(
      'input.calledCapitalScheduleUsd must contain exactly 4 entries'
    );
  });

  it('rejects negative monetary strings', () => {
    const testCase = structuredClone(cases[0]!);
    testCase.input.fundSizeUsd = '-0.000001';
    expect(() => executeFeeProfileTruthCase(testCase)).toThrow(
      'input.fundSizeUsd must be a finite non-negative decimal'
    );
  });

  it('rejects percentages above one', () => {
    const testCase = structuredClone(cases[0]!);
    testCase.input.feeProfile.tiers[0]!.annualRatePercent = '2';
    expect(() => executeFeeProfileTruthCase(testCase)).toThrow(
      'Percentage must be between 0 and 1 (0% to 100%)'
    );
  });
});
```

In overall summary, add `feeProfileCases.length` to `totalScenarios` and
`feeProfile: feeProfileCases.length` to `breakdown`. Keep
`fees: feesCases.length` separate. Update runner header to name Fees as legacy
characterization (10) and FeeProfile as production truth (11).

- [ ] **Step 2: Run RED before either new dependency exists.**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/truth-cases/runner.test.ts
```

Expected: FAIL resolving `../../../docs/fee-profile.truth-cases.json` and/or
`./fee-profile-adapter`. Do not bypass failure or alter production code.

- [ ] **Step 3: Check legacy boundary.**

```bash
set -euo pipefail
git fetch --quiet origin main
ORIGIN_MAIN=$(git rev-parse --verify origin/main^{commit})
BASELINE=$(git merge-base HEAD "$ORIGIN_MAIN")
test -n "$BASELINE"
test "$BASELINE" = "$ORIGIN_MAIN"
test "$BASELINE" = "$(git rev-parse "$BASELINE^{commit}")"
git diff --unified=0 "$BASELINE" -- tests/unit/truth-cases/runner.test.ts
shasum -a 256 docs/fees.truth-cases.json tests/unit/truth-cases/fee-adapter.ts
```

Expected: only allowed imports/block/summary changes; frozen hashes exact.

### Task 3: Create exact eleven-case serialized corpus

**Files:**

- Create: `docs/fee-profile.truth-cases.json`

**Interfaces:**

- Produces exactly eleven `FeeProfileTruthCase` objects consumed by Tasks 2
  and 4.
- Each object has `id`, `description`, `tags`, `input`, and complete `expected`.

- [ ] **Step 1: Use complete static expected-result objects.**

Every `expected` has these fields and no monetary JSON number:

```ts
interface FeeProfileTruthResult {
  quarterlyManagementFeesUsd: string[];
  totalManagementFeesUsd: string;
  quarterlyRecyclableFeesUsd: string[];
  totalRecyclableFeesUsd: string;
  quarterlyRetroactiveCatchUpFeesUsd: string[];
  totalRetroactiveCatchUpFeesUsd: string;
  quarterlyRetroactiveCatchUpMonths: number[];
  retroactiveCatchUpQuarters: number[];
}
```

For every non-special output, write explicit zero strings for each quarter,
total `"0.000000"`, zero months for each quarter, and `[]` for catch-up
quarters. Omit unused optional schedules; do not use calculated values or
abbreviated arrays in JSON.

- [ ] **Step 2: Enter all records with exact inputs and results.**

All `fundSizeUsd` values are `"100000000.000000"`. Tier shorthand means JSON
keys `basis`, `annualRatePercent`, `startYear`, optional `endYear`,
`capPercent`, and `capAmount`; no behavior is implicit.

| ID; exact tags                                                                               | Input profile/schedules                                                                                        | Quarterly management fees; total                                   | Other non-zero expected result                                       |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `committed-capital-baseline`; `baseline`, `committed-capital`                                | 4Q; `committed_capital`, `"0.02"`, start 1                                                                     | four `"500000.000000"`; `"2000000.000000"`                         | none                                                                 |
| `committed-capital-step-down`; `step-down`, `committed-capital`                              | 8Q; committed `"0.02"` start 1/end 1; committed `"0.01"` start 2                                               | four `"500000.000000"`, four `"250000.000000"`; `"3000000.000000"` | none                                                                 |
| `called-capital-cumulative`; `called-capital-cumulative`                                     | 4Q; `called_capital_cumulative`, `"0.02"`, start 1; calls 10m, 25m, 50m, 100m                                  | 50k, 125k, 250k, 500k; `"925000.000000"`                           | none                                                                 |
| `called-capital-period-flow`; `called-capital-period`, `downward-adjustment`                 | 4Q; `called_capital_period`, `"0.02"`, start 1; cumulative calls 0, 20m, 30m, 28m                              | 0, 400k, 200k, 0; `"600000.000000"`                                | none; pins downward-delta floor                                      |
| `called-capital-net-of-returns`; `called-capital-net-of-returns`, `cumulative-distributions` | 4Q; `called_capital_net_of_returns`, `"0.02"`, start 1; calls 20m, 40m, 60m, 80m; distributions 0, 0, 10m, 30m | 100k, 200k, 250k, 250k; `"800000.000000"`                          | none                                                                 |
| `invested-capital-basis`; `invested-capital`                                                 | 4Q; `invested_capital`, `"0.02"`, start 1; invested 10m, 20m, 40m, 50m                                         | 50k, 100k, 200k, 250k; `"600000.000000"`                           | none                                                                 |
| `fair-market-value-basis`; `fair-market-value`                                               | 4Q; `fair_market_value`, `"0.015"`, start 1; FMV 50m, 75m, 100m, 120m                                          | 187500, 281250, 375000, 450000; `"1293750.000000"`                 | none                                                                 |
| `unrealized-cost-basis`; `unrealized-cost`                                                   | 4Q; `unrealized_cost`, `"0.01"`, start 1; cost 40m, 35m, 25m, 10m                                              | 100k, 87500, 62500, 25000; `"275000.000000"`                       | none                                                                 |
| `retroactive-fee-catch-up`; `catch-up`, `committed-capital`                                  | 12Q; committed `"0.02"` start 3; policy enabled, accrual start 0                                               | Q0-Q7 0; Q8 4.5m; Q9-Q11 500k; `"6000000.000000"`                  | Q8 catch-up 4m; total 4m; months 0,0,0,0,0,0,0,0,24,0,0,0; quarter 8 |
| `fee-recycling-cap-term`; `recycling`, `committed-capital`                                   | 4Q; committed `"0.02"` start 1; enabled recycling, cap `"0.01"`, term 6                                        | four 500k; `"2000000.000000"`                                      | recyclable 500k, 1m, 1m, 0; `"2500000.000000"`                       |
| `tier-caps`; `cap`, `committed-capital`                                                      | 8Q; committed `"0.02"` start 1/end 1/cap % `"0.001"`; committed `"0.02"` start 2/cap amount 100k               | eight 300k; `"2400000.000000"`                                     | none                                                                 |

Expand all abbreviated amounts in table into six-decimal JSON strings: 10m is
`"10000000.000000"`; 25m is `"25000000.000000"`; 50m is `"50000000.000000"`;
100m is `"100000000.000000"`; 20m is `"20000000.000000"`; 30m is
`"30000000.000000"`; 28m is `"28000000.000000"`; 40m is `"40000000.000000"`; 60m
is `"60000000.000000"`; 80m is `"80000000.000000"`; 75m is `"75000000.000000"`;
120m is `"120000000.000000"`; 35m is `"35000000.000000"`.

Expand fee vectors likewise: 0 is `"0.000000"`; 50k is `"50000.000000"`; 100k is
`"100000.000000"`; 125k is `"125000.000000"`; 187500 is `"187500.000000"`; 200k
is `"200000.000000"`; 250k is `"250000.000000"`; 281250 is `"281250.000000"`;
375k is `"375000.000000"`; 400k is `"400000.000000"`; 450k is `"450000.000000"`;
500k is `"500000.000000"`; 1m is `"1000000.000000"`; 4m is `"4000000.000000"`;
4.5m is `"4500000.000000"`.

Use this literal JSON shape for every profile. Add stated optional fields only.

```json
{
  "id": "committed-capital-baseline",
  "name": "Committed capital baseline",
  "tiers": [
    {
      "basis": "committed_capital",
      "annualRatePercent": "0.02",
      "startYear": 1
    }
  ]
}
```

For catch-up use
`"retroactiveFeeCatchUp": { "enabled": true, "accrualStartMonth": 0 }`. For
recycling use
`"recyclingPolicy": { "enabled": true, "recyclingCapPercent": "0.01", "recyclingTermMonths": 6 }`.
For caps use first-tier `"capPercent": "0.001"` and second-tier
`"capAmount": "100000.000000"`.

- [ ] **Step 3: Run RED after fixture creation, before adapter creation.**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/truth-cases/runner.test.ts
```

Expected: JSON resolves but run FAILS solely because `./fee-profile-adapter` is
missing.

- [ ] **Step 4: Parse fixture and run ownership gate.**

```bash
set -euo pipefail
git fetch --quiet origin main
ORIGIN_MAIN=$(git rev-parse --verify origin/main^{commit})
BASELINE=$(git merge-base HEAD "$ORIGIN_MAIN")
test -n "$BASELINE"
test "$BASELINE" = "$ORIGIN_MAIN"
test "$BASELINE" = "$(git rev-parse "$BASELINE^{commit}")"
node -e "JSON.parse(require('node:fs').readFileSync('docs/fee-profile.truth-cases.json', 'utf8')); console.log('fee-profile truth JSON parses')"
{
  git diff --name-only "$BASELINE"
  git ls-files --others --exclude-standard
} | sort -u
git diff --check
```

Expected: parser prints `fee-profile truth JSON parses`; only runner/new corpus
changed; whitespace check silent.

### Task 4: Add test-local adapter and make exact-object contract green

**Files:**

- Create: `tests/unit/truth-cases/fee-profile-adapter.ts`

**Interfaces:**

- Consumes `FeeProfileSchema.parse`, canonical `Decimal`, and
  `computeFeeBasisTimeline`.
- Produces `FeeProfileTruthCase`, `FeeProfileTruthResult`, and
  `executeFeeProfileTruthCase`.

- [ ] **Step 1: Add exact test-local serialized types.**

```ts
import Decimal from '@shared/lib/decimal-config';
import { computeFeeBasisTimeline } from '@shared/lib/fund-math';
import {
  FeeProfileSchema,
  type FeeBasisType,
  type FeeCapitalStockBasis,
} from '@shared/schemas/fee-profile';

export type SerializedMoney = string;
export type SerializedPercentage = string;

export interface SerializedFeeProfile {
  id: string;
  name: string;
  tiers: Array<{
    basis: FeeBasisType;
    annualRatePercent: SerializedPercentage;
    startYear: number;
    endYear?: number;
    capPercent?: SerializedPercentage;
    capAmount?: SerializedMoney;
  }>;
  stepDownMonths?: number[];
  recyclingPolicy?: {
    enabled: boolean;
    recyclingCapPercent: SerializedPercentage;
    recyclingTermMonths: number;
    basis?: FeeCapitalStockBasis;
    anticipatedRecycling?: boolean;
  };
  feeHolidays?: Array<{
    startMonth: number;
    durationMonths: number;
    reason?: string;
  }>;
  retroactiveFeeCatchUp?: {
    enabled: boolean;
    accrualStartMonth?: number;
    maxCatchUpMonths?: number;
  };
}

export interface FeeProfileTruthCase {
  id: string;
  description: string;
  tags: string[];
  input: {
    fundSizeUsd: SerializedMoney;
    numQuarters: number;
    feeProfile: SerializedFeeProfile;
    calledCapitalScheduleUsd?: SerializedMoney[];
    distributionScheduleUsd?: SerializedMoney[];
    investedCapitalScheduleUsd?: SerializedMoney[];
    fmvScheduleUsd?: SerializedMoney[];
    unrealizedCostScheduleUsd?: SerializedMoney[];
  };
  expected: FeeProfileTruthResult;
}

export interface FeeProfileTruthResult {
  quarterlyManagementFeesUsd: string[];
  totalManagementFeesUsd: string;
  quarterlyRecyclableFeesUsd: string[];
  totalRecyclableFeesUsd: string;
  quarterlyRetroactiveCatchUpFeesUsd: string[];
  totalRetroactiveCatchUpFeesUsd: string;
  quarterlyRetroactiveCatchUpMonths: number[];
  retroactiveCatchUpQuarters: number[];
}
```

- [ ] **Step 2: Implement local positive-quarter, schedule, and money
      validators.**

```ts
function parseNumQuarters(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError('input.numQuarters must be a positive integer');
  }
  return value;
}

function parseMoney(value: unknown, field: string): Decimal {
  if (typeof value !== 'string') {
    throw new RangeError(`${field} must be a finite non-negative decimal`);
  }

  try {
    const decimal = new Decimal(value);
    if (!decimal.isFinite() || decimal.isNegative()) {
      throw new RangeError(`${field} must be a finite non-negative decimal`);
    }
    return decimal;
  } catch (error: unknown) {
    if (error instanceof RangeError) {
      throw error;
    }
    throw new RangeError(`${field} must be a finite non-negative decimal`);
  }
}

function parseSchedule(
  value: SerializedMoney[] | undefined,
  field: string,
  numQuarters: number
): Decimal[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length !== numQuarters) {
    throw new RangeError(
      `${field} must contain exactly ${numQuarters} entries`
    );
  }
  return value.map((entry, index) => parseMoney(entry, `${field}[${index}]`));
}
```

Pass complete serialized profile directly to
`FeeProfileSchema.parse(input.feeProfile)`, including tier caps and recycling
percentages. Therefore percentage `"2"` fails schema validation. Map
`distributionScheduleUsd` directly to production `distributionSchedule`; never
difference it into a flow. Map called capital as cumulative; production floors
negative period delta.

- [ ] **Step 3: Implement exactly one production invocation and six-decimal
      serialization.**

```ts
export function executeFeeProfileTruthCase(
  testCase: FeeProfileTruthCase
): FeeProfileTruthResult {
  const { input } = testCase;
  const numQuarters = parseNumQuarters(input.numQuarters);
  const feeProfile = FeeProfileSchema.parse(input.feeProfile);

  const timeline = computeFeeBasisTimeline({
    fundSize: parseMoney(input.fundSizeUsd, 'input.fundSizeUsd'),
    numQuarters,
    feeProfile,
    calledCapitalSchedule: parseSchedule(
      input.calledCapitalScheduleUsd,
      'input.calledCapitalScheduleUsd',
      numQuarters
    ),
    distributionSchedule: parseSchedule(
      input.distributionScheduleUsd,
      'input.distributionScheduleUsd',
      numQuarters
    ),
    investedCapitalSchedule: parseSchedule(
      input.investedCapitalScheduleUsd,
      'input.investedCapitalScheduleUsd',
      numQuarters
    ),
    fmvSchedule: parseSchedule(input.fmvScheduleUsd, 'input.fmvScheduleUsd', numQuarters),
    unrealizedCostSchedule: parseSchedule(
      input.unrealizedCostScheduleUsd,
      'input.unrealizedCostScheduleUsd',
      numQuarters
    ),
  });
```

Complete the same function with this exact return and closing brace:

```ts
  return {
    quarterlyManagementFeesUsd: timeline.periods.map((period) =>
      period.managementFees.toFixed(6)
    ),
    totalManagementFeesUsd: timeline.totalFees.toFixed(6),
    quarterlyRecyclableFeesUsd: timeline.periods.map((period) =>
      period.recyclableFees.toFixed(6)
    ),
    totalRecyclableFeesUsd: timeline.totalRecyclable.toFixed(6),
    quarterlyRetroactiveCatchUpFeesUsd: timeline.periods.map((period) =>
      period.retroactiveCatchUpFees.toFixed(6)
    ),
    totalRetroactiveCatchUpFeesUsd: timeline.totalRetroactiveCatchUpFees.toFixed(6),
    quarterlyRetroactiveCatchUpMonths: timeline.periods.map(
      (period) => period.retroactiveCatchUpMonths
    ),
    retroactiveCatchUpQuarters: timeline.periods
      .filter((period) => period.retroactiveCatchUpFees.gt(0))
      .map((period) => period.quarter),
  };
}
```

`computeFeeBasisTimeline` appears once in adapter, therefore exactly once per
case. Do not add a second total-only invocation.

- [ ] **Step 4: Run GREEN.**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/truth-cases/runner.test.ts
```

Expected: exit 0, one test file, `134 passed (134)`: legacy 118 plus eleven
complete-object cases, count/tag test, and four negative tests. FeeProfile uses
`toEqual`, never numeric tolerance.

- [ ] **Step 5: Run ownership/hash/legacy gate.**

```bash
set -euo pipefail
git fetch --quiet origin main
ORIGIN_MAIN=$(git rev-parse --verify origin/main^{commit})
BASELINE=$(git merge-base HEAD "$ORIGIN_MAIN")
test -n "$BASELINE"
test "$BASELINE" = "$ORIGIN_MAIN"
test "$BASELINE" = "$(git rev-parse "$BASELINE^{commit}")"
shasum -a 256 docs/fees.truth-cases.json tests/unit/truth-cases/fee-adapter.ts
{
  git diff --name-only "$BASELINE"
  git ls-files --others --exclude-standard
} | sort -u
git diff --unified=0 "$BASELINE" -- tests/unit/truth-cases/runner.test.ts
git diff --check
```

Expected: exact frozen hashes; exactly corpus, adapter, runner paths; no changed
line in old ten-case block; silent whitespace check.

### Task 5: Verify lifecycle gates and commit production-truth slice

**Files:**

- Create: `docs/fee-profile.truth-cases.json`
- Create: `tests/unit/truth-cases/fee-profile-adapter.ts`
- Modify: `tests/unit/truth-cases/runner.test.ts`

**Interfaces:**

- Produces one verified truth-corpus commit, with no production-code scope
  expansion.

- [ ] **Step 1: Run required verification commands in exact order.**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/truth-cases/runner.test.ts
TZ=UTC npm run phoenix:truth
TZ=UTC npm run calc-gate:orphans
npm run check
npm run lint
TZ=UTC npm test
git diff --check
```

Expected: every command exits 0; targeted runner reports `134 passed (134)`;
Phoenix truth, orphan calculation regression, typecheck, lint, and full suite
pass; final whitespace check silent. If failure is outside three-file ownership,
stop and report it rather than broaden scope.

- [ ] **Step 2: Repeat final ownership and frozen-content guards.**

```bash
set -euo pipefail
git fetch --quiet origin main
ORIGIN_MAIN=$(git rev-parse --verify origin/main^{commit})
BASELINE=$(git merge-base HEAD "$ORIGIN_MAIN")
test -n "$BASELINE"
test "$BASELINE" = "$ORIGIN_MAIN"
test "$BASELINE" = "$(git rev-parse "$BASELINE^{commit}")"
shasum -a 256 docs/fees.truth-cases.json tests/unit/truth-cases/fee-adapter.ts
{
  git diff --name-only "$BASELINE"
  git ls-files --others --exclude-standard
} | sort -u
git diff --unified=0 "$BASELINE" -- tests/unit/truth-cases/runner.test.ts
git diff --check
```

Expected: hashes exact; changed paths exactly three owned files; legacy
block/count/tag assertions unchanged; no whitespace errors.

- [ ] **Step 3: Commit only the truth slice.**

```bash
git add docs/fee-profile.truth-cases.json \
  tests/unit/truth-cases/fee-profile-adapter.ts \
  tests/unit/truth-cases/runner.test.ts
git diff --cached --name-only
git commit -m "test(truth): add FeeProfile production truth corpus"
```

Expected: staged list contains exactly three owned paths; commit subject exactly
`test(truth): add FeeProfile production truth corpus`.

- [ ] **Step 4: Verify committed result.**

```bash
git diff --check HEAD^..HEAD
git show --stat --oneline HEAD
git status --short
```

Expected: diff check exits 0; commit shows only three allowed files and exact
subject; tracked worktree clean. Overall summary reports separate `fees: 10` and
`feeProfile: 11`, both included in total.

### Handoff and merge hold

- [ ] Default: hold this #1337 truth slice unmerged until durable G5 / #1299
      activation is complete. A green branch, a planning merge, or a preview
      does not activate this merge gate.
- [ ] Exception: a durable ELIG decision may explicitly promote #1337 only when
      its immutable evidence records both the explicit #1337 promotion and #1338
      disposition. Silence about #1338 is a failed exception.
- [ ] The ELIG exception does not waive Gate 0, #1337 owner-scope ratification,
      the green production FeeProfile truth suite, frozen legacy hashes,
      required verification, or any applicable domain approval.
- [ ] Handoff includes current origin/main SHA, accepted G3 SHA and reviewer
      verdict reference, planning-authority SHA, #1337 supersession/owner-scope
      references, all required command output, and either G5/#1299 activation
      record or ELIG promotion plus #1338 disposition. Do not merge if any
      record is absent or changed.

## Final Acceptance Checklist

- [ ] Frozen legacy corpus and adapter match mandated SHA-256 values.
- [ ] Ten-case legacy `computeFeePreview` block and its count/tag assertions are
      unchanged.
- [ ] New block has eleven unique cases; all seven basis tags plus baseline,
      step-down, catch-up, recycling, cap, cumulative-distributions, and
      downward-adjustment exist.
- [ ] Test-local adapter validates positive quarter count, exact schedule
      length, non-negative finite money, and percentage fraction through
      `FeeProfileSchema`.
- [ ] Adapter parses full profiles, maps cumulative distributions directly, uses
      canonical `Decimal`, invokes `computeFeeBasisTimeline` exactly once per
      case, and serializes monetary results with `toFixed(6)`.
- [ ] Runner compares complete output objects with exact strings and retains
      cited secondary catch-up tests unchanged.
- [ ] Required commands pass in order; commit has exact subject and only three
      owned files.
