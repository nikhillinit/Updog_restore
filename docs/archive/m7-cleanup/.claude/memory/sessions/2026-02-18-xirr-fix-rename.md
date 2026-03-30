# Session: 2026-02-18 (XIRR Fix + ReserveCompanyInput Rename)

## Summary

Fixed a silent data corruption bug in `safeXIRR` where `Invalid Date` inputs
produced NaN that poisoned the bisection solver bracket check, causing
convergence on garbage ~5000% IRR. Added a 3-line guard in `safeXIRR` that
returns `irr: null` before reaching the solver. Also completed the
`ReserveInput` -> `ReserveCompanyInput` rename in 4 remaining consumer files
(worker, unit tests, API tests, edge-case tests). Committed and pushed as
805e5421, 2903 tests pass.

## Work Completed

- NaN-date guard in `shared/lib/finance/xirr.ts:376-378` (safeXIRR boundary
  validation)
- `workers/reserve-worker.ts` -- import + usage rename
- `tests/unit/engines/reserve-engine.test.ts` -- import + 6 usage sites renamed
- `tests/api/engines.test.ts` -- import + 1 usage renamed
- `tests/api/edge-cases.test.ts` -- import + ~15 usage sites renamed
- Legacy XIRR files deleted: `client/src/lib/xirr.ts`,
  `client/src/core/selectors/xirr.ts`
- XIRR test suite rewritten: `tests/unit/xirr-safe-wrappers.test.ts` (7 tests,
  canonical safeXIRR)

## Decisions Made

- NaN guard goes in `safeXIRR` (UI boundary), not `xirrNewtonBisection` (solver
  contract)
- `ReserveInput` from `@shared/schemas` left untouched (different type,
  engine-level input)

## Context for Next Session

- ~18 files remain uncommitted from prior P5.2 deprecated code removal session
- P5.2 still in progress: capitalAllocation units, PrivacySettings,
  wizard-reserve-bridge, etc.
- Pre-existing TS errors in rollout-runtime.ts / rollout.ts (TS2532) are known,
  not from this work

## Open Questions

- None

---

_Session duration: ~15 min_
