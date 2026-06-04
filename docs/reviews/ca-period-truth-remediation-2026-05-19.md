---
status: COMPLETED
last_updated: 2026-05-20
owner: Core Team
review_cadence: P90D
categories: [reviews, capital-allocation, truth-cases]
keywords: [capital-allocation, period-loop, truth-cases, reserve-snapshots]
source_of_truth: false
related_code:
  - shared/core/capitalAllocation/periodLoop.ts
  - shared/core/capitalAllocation/periodTargetReportingOracle.ts
  - tests/unit/core/capitalAllocation/periodLoopContract.test.ts
  - tests/unit/core/capitalAllocation/periodTargetReportingOracle.test.ts
---

# CA Period Truth Remediation Record

This record supersedes the draft implementation checklist that previously lived
under `docs/superpowers/plans/`. Do not execute the old checkbox plan. The
implementation it described is already present in the codebase.

## Completed Scope

- `executePeriodLoop` now requires explicit reserve snapshot semantics through
  `PeriodLoopOptions`.
- Reserve snapshot mode is validated before period-loop execution.
- Truth-case-shaped target reporting is isolated in
  `periodTargetReportingOracle`.
- Contract tests cover the reserve snapshot mode boundary.
- Oracle tests cover target reporting period selection and residual target
  splitting.
- Capital-allocation truth-case runners pass explicit planning semantics where
  period-loop truth snapshots require that mode.

## Current Evidence

Use code, not this record, as the source of truth:

| Evidence                        | Path                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| Reserve snapshot option types   | `shared/core/capitalAllocation/periodLoop.ts`                           |
| Missing/invalid mode validation | `shared/core/capitalAllocation/periodLoop.ts`                           |
| Target reporting oracle         | `shared/core/capitalAllocation/periodTargetReportingOracle.ts`          |
| Reserve snapshot contract tests | `tests/unit/core/capitalAllocation/periodLoopContract.test.ts`          |
| Target reporting oracle tests   | `tests/unit/core/capitalAllocation/periodTargetReportingOracle.test.ts` |

## Remaining Guidance

Do not broaden this into a route or service refactor. Future capital-allocation
changes should first run the focused period-loop and truth-case tests, then
`npm run check`.
