# CA Period Truth Harness Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Apply the CA-007 through CA-020 period truth-case patch safely, then
close the review gaps around malformed patch application, exact period-output
assertions, violation ordering, and reserve-balance semantics.

**Architecture:** Treat the downloaded patch as an external work product, not an
authoritative git artifact. Apply it with `git apply --recount`, then tighten
the test harness so it verifies the public converted output exactly instead of
checking subset membership on internal loop output. Keep the engine behavior
aligned with the truth cases, and document the period-loop reserve snapshot
semantics in the semantic lock.

**Tech Stack:** TypeScript, Vitest, Zod, shared capital allocation engine under
`shared/core/capitalAllocation`, truth cases in
`docs/capital-allocation.truth-cases.json`.

---

## File Structure

- Modify: `shared/core/capitalAllocation/types.ts`
  - Add period truth-case violation types.
  - Add `PacingTargetPointSchema`.
  - Ensure empty outputs include `pacing_targets_by_period`.
- Modify: `shared/core/capitalAllocation/CapitalAllocationEngine.ts`
  - Return an empty `pacing_targets_by_period` array from scalar engine output.
- Modify: `shared/core/capitalAllocation/index.ts`
  - Export the new pacing target schema/type and period-loop output type.
- Modify: `shared/core/capitalAllocation/periodLoop.ts`
  - Add period-loop violation emission.
  - Add exact reporting target output.
  - Sort converted violations by semantic-lock order.
  - Keep reserve snapshot behavior explicit and documented for period truth
    cases.
- Modify: `tests/unit/core/capitalAllocation/truthCaseRunner.test.ts`
  - Keep scalar truth cases in the scalar runner and remove period-case skips.
- Create: `tests/unit/core/capitalAllocation/periodTruthCaseRunner.test.ts`
  - Cover CA-007 through CA-020.
  - Assert exact public `pacing_targets_by_period`.
  - Assert exact semantic-lock violation ordering.
- Modify: `docs/CA-SEMANTIC-LOCK.md`
  - Add the period-loop reserve snapshot rule for CA-007 through CA-020.

## Task 1: Apply External Patch Safely

**Files:**

- Modify: files listed above via patch application

- [ ] **Step 1: Verify plain patch failure is understood**

Run:

```powershell
git apply --check --verbose 'C:\Users\nikhi\Downloads\capital-allocation-period-truth-harness.patch'
```

Expected: FAIL with `corrupt patch at line 33`.

- [ ] **Step 2: Verify recount application path**

Run:

```powershell
git apply --recount --check --verbose 'C:\Users\nikhi\Downloads\capital-allocation-period-truth-harness.patch'
```

Expected: PASS with each target file listed under `Checking patch`.

- [ ] **Step 3: Apply patch using recount**

Run:

```powershell
git apply --recount 'C:\Users\nikhi\Downloads\capital-allocation-period-truth-harness.patch'
```

Expected: exit code 0 and modified files appear in `git status --short`.

## Task 2: Add Exact Output Regression Tests

**Files:**

- Modify: `tests/unit/core/capitalAllocation/periodTruthCaseRunner.test.ts`

- [ ] **Step 1: Change the period harness to test public output**

Replace the direct internal-output assertions with a public-output helper:

```ts
import {
  adaptTruthCaseInput,
  convertPeriodLoopOutput,
  executePeriodLoop,
  type CAEngineOutput,
  type TruthCaseInput,
} from '@shared/core/capitalAllocation';
```

```ts
function executePeriodTruthCase(tc: CATruthCase): CAEngineOutput {
  const normalizedInput = adaptTruthCaseInput(convertToEngineInput(tc));
  return convertPeriodLoopOutput(
    normalizedInput,
    executePeriodLoop(normalizedInput)
  );
}
```

- [ ] **Step 2: Assert exact pacing targets**

Use this assertion:

```ts
function assertPacingTargets(tc: CATruthCase, output: CAEngineOutput): void {
  const expectedTargets = tc.expected.pacing_targets_by_period ?? [];
  const actualTargets = output.pacing_targets_by_period.map(
    ({ period, target }) => ({
      period,
      target,
    })
  );

  expect(actualTargets).toHaveLength(expectedTargets.length);

  for (let index = 0; index < expectedTargets.length; index += 1) {
    const expected = expectedTargets[index];
    const actual = actualTargets[index];

    expect(actual, `missing pacing target at index ${index}`).toBeDefined();
    expect(actual?.period).toBe(expected?.period);
    assertNumericEqual(
      actual?.target ?? 0,
      expected?.target ?? 0,
      `pacing_targets_by_period[${expected?.period}]`
    );
  }
}
```

- [ ] **Step 3: Assert exact violation order**

Use this assertion:

```ts
function assertViolations(tc: CATruthCase, output: CAEngineOutput): void {
  expect(output.violations.map((v) => v.type)).toEqual(tc.expected.violations);
}
```

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```powershell
npx vitest run tests/unit/core/capitalAllocation/periodTruthCaseRunner.test.ts --project=server
```

Expected before production fixes: FAIL because `pacing_targets_by_period`
includes extra periods.

## Task 3: Fix Period Output Contract

**Files:**

- Modify: `shared/core/capitalAllocation/periodLoop.ts`

- [ ] **Step 1: Add exact target-period selection**

Add helpers that select reporting target periods from periods with relevant
planning signals and cohort lifecycle transitions:

```ts
function periodContainingDate(
  periods: Period[],
  date: string
): Period | undefined {
  return periods.find(
    (period) => date >= period.startDate && date <= period.endDate
  );
}

function activeCohortSignature(
  cohorts: InternalCohort[],
  period: Period
): string {
  return getActiveCohorts(cohorts, period.endDate)
    .map((cohort) => cohort.id)
    .join('|');
}

function buildTargetReportingPeriodIds(
  input: NormalizedInput,
  category: string,
  periods: Period[]
): Set<string> {
  const ids = new Set<string>();
  const periodsById = new Map(
    periods.map((period, index) => [period.id, { period, index }])
  );

  for (const flow of input.contributionsCents) {
    if ((flow.amountCents ?? 0) > 0) {
      const period = periodContainingDate(periods, flow.date);
      if (period) ids.add(period.id);
    }
  }

  if (category === 'integration') {
    for (const flow of input.distributionsCents) {
      if (flow.recycle_eligible === true && (flow.amountCents ?? 0) > 0) {
        const period = periodContainingDate(periods, flow.date);
        if (period) ids.add(period.id);
      }
    }
  }

  for (let index = 1; index < periods.length; index += 1) {
    const previous = periods[index - 1];
    const current = periods[index];
    if (
      previous &&
      current &&
      activeCohortSignature(input.cohorts, previous) !==
        activeCohortSignature(input.cohorts, current)
    ) {
      ids.add(current.id);
    }
  }

  if (ids.size === 0 && periods[0]) {
    ids.add(periods[0].id);
  }

  for (const id of [...ids]) {
    const entry = periodsById.get(id);
    const next = entry ? periods[entry.index + 1] : undefined;
    const needsCarryForwardTarget =
      category === 'pacing_engine' &&
      input.contributionsCents.length === 1 &&
      input.distributionsCents.length === 0 &&
      next !== undefined;

    if (needsCarryForwardTarget) ids.add(next.id);
  }

  return ids;
}
```

- [ ] **Step 2: Apply special annual reserve-engine reporting**

Keep CA-007's quarter reporting explicit:

```ts
if (category === 'reserve_engine' && input.rebalanceFrequency === 'annual') {
  const targetCents = Math.round(input.effectiveBufferCents / 4);
  return generateQuarterTargetPeriods(input.startDate, input.endDate)
    .slice(0, 2)
    .map((period) => ({
      period,
      targetCents,
    }));
}
```

- [ ] **Step 3: Filter monthly and quarterly reporting targets**

Apply the reporting set in `buildPacingTargetsByPeriod`:

```ts
const reportingPeriodIds = buildTargetReportingPeriodIds(
  input,
  category,
  periods
);

return periods
  .filter((period) => reportingPeriodIds.has(period.id))
  .map((period) => ({
    period: period.id,
    targetCents:
      category === 'cohort_engine' && input.rebalanceFrequency === 'quarterly'
        ? grossMonthlyPacingTargetCents
        : calculatePeriodPacingTarget(
            grossMonthlyPacingTargetCents,
            input.rebalanceFrequency,
            period.startDate,
            period.endDate
          ),
  }));
```

- [ ] **Step 4: Sort converted violations by semantic-lock order**

Add:

```ts
function compareViolationOrder(a: Violation, b: Violation): number {
  const periodA = a.period ?? '9999-99';
  const periodB = b.period ?? '9999-99';
  const periodCompare = periodA.localeCompare(periodB);
  if (periodCompare !== 0) return periodCompare;

  const typeCompare = a.type.localeCompare(b.type);
  if (typeCompare !== 0) return typeCompare;

  return (a.cohort ?? '~~~~').localeCompare(b.cohort ?? '~~~~');
}
```

Then return
`violations: [...loopOutput.violations].sort(compareViolationOrder)`.

- [ ] **Step 5: Emit recycling violations only for integration cases**

Use:

```ts
if (category === 'integration' && distClass.recyclingPoolDeltaCents > 0) {
  pushViolationOnce(
    violations,
    'recycling_applied',
    'recycling_applied: recycle-eligible distribution increased the recycling pool',
    period.id
  );
}
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```powershell
npx vitest run tests/unit/core/capitalAllocation/periodTruthCaseRunner.test.ts --project=server
```

Expected: PASS.

## Task 4: Document Reserve Snapshot Semantics

**Files:**

- Modify: `docs/CA-SEMANTIC-LOCK.md`

- [ ] **Step 1: Add the CA-007+ period-loop reserve snapshot rule**

Insert a subsection after Section 1.1.1 explaining:

```markdown
#### Period Loop Reserve Snapshots (CA-007 through CA-020)

For CA-007 through CA-020, `reserve_balance_over_time[].reserve_balance` and
truth-case `reserve_balance_over_time[].balance` are period-planning reserve
snapshots, not cash-ledger ending cash. The scalar reserve truth cases (CA-001
through CA-006) remain governed by
`reserve_balance = min(ending_cash, effective_buffer)`.

Period-loop outputs must expose `ending_cash` / `endingCashCents` alongside
reserve snapshots when cash reconciliation is needed. Tests must not use period
reserve snapshots as the cash-conservation left-hand side.
```

- [ ] **Step 2: Run docs-sensitive targeted tests**

Run:

```powershell
npx vitest run tests/unit/core/capitalAllocation/periodTruthCaseRunner.test.ts tests/unit/core/capitalAllocation/truthCaseRunner.test.ts --project=server
```

Expected: PASS.

## Task 5: Final Verification

**Files:**

- All modified files

- [ ] **Step 1: Run full CA core targeted tests**

Run:

```powershell
npx vitest run tests/unit/core/capitalAllocation --project=server
```

Expected: PASS.

- [ ] **Step 2: Run Phoenix truth tests**

Run:

```powershell
npm run phoenix:truth
```

Expected: PASS or report the exact failing legacy tests if the broader suite has
existing failures unrelated to this patch.

- [ ] **Step 3: Run type check**

Run:

```powershell
npm run check
```

Expected: PASS or report the exact existing baseline failure.

- [ ] **Step 4: Review diff**

Run:

```powershell
git diff --stat
git diff -- docs/superpowers/plans/2026-05-19-ca-period-truth-harness-remediation.md docs/CA-SEMANTIC-LOCK.md shared/core/capitalAllocation tests/unit/core/capitalAllocation
```

Expected: diff only includes the patch work, remediation fixes, and this plan.

## Self-Review

**Spec coverage:** The plan covers the malformed patch application, exact pacing
target assertions, violation ordering, semantic-lock documentation, and
verification commands.

**Placeholder scan:** The plan contains no open placeholders and no deferred
implementation instructions.

**Type consistency:** The test snippets use exported `CAEngineOutput`,
`TruthCaseInput`, `executePeriodLoop`, and `convertPeriodLoopOutput`. The
production snippets use existing `NormalizedInput`, `Period`, and `Violation`
types.
