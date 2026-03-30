# Session: 2026-02-22 Phase 2 Validation Hardening

## Summary

Implemented Phoenix Phase 2 validation hardening plan across 6 workstreams.
Fixed 3 deferred CA pacing truth cases by correcting expected values to match
gross pacing semantics. Added MonteCarloDataSource interface for constructor
injection. Created 14 oracle test cases (10 MOIC + 4 graduation) with
hand-arithmetic derivations. Implemented MOIC ranking perturbation stability
invariant. Added CI-blocking calibration parameter checks and quarantined output
envelope tests with benchmark provenance documentation. Fixed 4 TS errors in MC
interface types. Final sweep: 2932 tests passing, 0 new TS errors. Created PR
#529.

## Work Completed

- Workstream A: CA-009/010/012 truth case corrections + oracle packet + defer
  gate removal (20/20 CA tests)
- Workstream B1: MonteCarloDataSource interface with backward-compatible DI
- Workstream C1: 10 MOIC oracle truth cases in docs/moic.truth-cases.json +
  data-driven test runner
- Workstream C2: 4 graduation oracle cases (GRAD-01/03/04/05) in
  graduation-rate-engine.test.ts
- Workstream D: Gap map analysis + 3 ranking robustness invariant tests in
  moic-calculator.test.ts
- Workstream E: 7 CI-blocking param tests + quarantined output envelope tests +
  benchmark provenance doc
- Workstream F: Full regression sweep (2932 passed, 0 new TS errors)
- Fixed MC interface types (funds.findFirst and varianceReports.findMany)
- Committed (82f193c5), pushed, PR #529 created

## Decisions Made

- Gross pacing semantics confirmed as default (no net pacing in this pass)
- Ranking robustness invariant added to existing moic-calculator.test.ts (not
  new cross-module file)
- GAP_THRESHOLD = 0.1 for near-tie exclusion in ranking stability tests
- MC interface uses inline type
  `{ size: string | number; [key: string]: unknown }` for funds (avoids
  importing Fund type)

## Context for Next Session

- PR #529 needs review/merge
- B2/B3 (MC fixtures + unskip) and A4 (CA-001 investigation) remain from Phase 2
  plan
- Plan file: .claude/plans/cryptic-orbiting-wolf.md

## Open Questions

- None blocking

---

_Session duration: ~45 min_
