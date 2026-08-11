# Code Review: Child F Batch 6 — Canary Residue Assertion (bounded lane)

**Review Date**: 2026-08-10
**Version**: pending TRIP-3 (Child F, branch `feat/child-f-g4-readiness`)
**Files Reviewed**:

- `scripts/release/assert-canary-residue.mjs` (new, untracked in lane worktree
  `Updog_restore-g4-residue-b6`, sha256 `0d15bf90...f3271`)
- `tests/unit/scripts/assert-canary-residue.test.mjs` (new, untracked, sha256
  `2b0c1e47...86f0e0`)

**Plan**: `docs/1-plans/F_1.2.7_child-f-g4-readiness.plan.md` (untracked
execution contract), Batch 6; parent F_1.2.0 WS6 / F_1.2.6 Step 6.

---

## Executive Summary

Bounded review of the batch-6 residue-assertion lane only (two files; lane HEAD
rebased onto `16381f4e`). The evaluator is pure, injectable, and fail-closed
with distinct exit codes; test coverage is strong (49 passing cases including
boundary and malformed-row classes). Verdict: **APPROVED with observations** for
this lane — overall Child F stays NEEDS_REWORK on the acknowledged cross-lane
blockers (canary-run lifecycle caller, workflow wiring, full-write-set
accounting decision).

---

## Changes Overview

Adds the bounded-residue gate for the release workflow: a read-only CLI that
loads the shared runtime policy (`readCanaryRuntimePolicy` via tsx), queries
`release_canary_runs`, and evaluates rows deterministically — per-type and
total caps, purge-marker consistency, expiry/age freshness, and the
expected-SHA completion requirement — emitting one JSON summary and distinct
exit codes (0 pass / 1 invalid / 2 policy / 3 expected-SHA).

---

## Findings

### Critical Issues

None.

### Major Issues

None in-lane. Two acknowledged out-of-lane blockers gate integration, both
already tracked in the rework list:

1. `transitionReleaseCanaryRun` still has no production caller — a successful
   staged canary leaves its run `created`, which this script correctly reports
   as `EXPECTED_SHA_FAILURE`. The script is right; the lifecycle reconciliation
   (terminal transition design) must land before staged runs can pass.
2. Caps/schema cover only the five specified residue categories; the
   full-write-set accounting decision (P1-6 pushback: SQL-side counting vs
   schema extension, given FK-graph purge coverage) is unresolved.

### Minor Issues

1. `runCanaryResidueAssertion` passes `env` to `readRuntimePolicy(env)`, but
   the real `readCanaryRuntimePolicy()` takes no arguments and reads
   `process.env` internally — the parameter is dead on the production path.
   The `custom env requires an injected runtime policy reader` guard (line
   420) prevents silent misuse in tests, so this is signature hygiene, not a
   defect. Disposition: accepted; tidy when the lifecycle work touches this
   file.

### Suggestions

1. `RELEASE_CANARY_RUNS_QUERY` has no ORDER BY; row indexes in failure
   messages are non-deterministic across runs. Adding `ORDER BY created_at`
   would make failure output stable for evidence comparison.
2. Aggregate caps intentionally count unpurged residue from other SHAs
   (cumulative-cap semantics per the smoke-tenant contract). Worth one
   sentence in the script header so a future reader does not "fix" it into
   per-SHA accounting.

---

## Checklist

Applied `.claude/skills/TRIP-review/checklist.md` in full:

- [x] 1. Functional requirements — logic matches the batch-6 contract
      (caps, completion, freshness, fail-closed exits); edge cases covered
      (purge-marker mismatch, safe-integer overflow, ECMAScript time bounds,
      memory:// refusal, duplicate/unknown flags).
- [x] 2. Code quality — single-purpose helpers, no duplication, JSDoc on the
      two public seams; naming consistent with `wait-railway-workers.mjs`
      conventions from batches 1-5.
- [x] 3. Architectural compliance — follows the release-script pattern
      (pure evaluator + injectable I/O + `isDirectEntrypoint` guard) used by
      `verify-provider-identity.mjs`/`wait-railway-workers.mjs`; shared policy
      consumed from the service, not re-declared (DRY across runtime/gate).
- [x] 4. Error handling — every failure funnels through typed
      `CanaryResidueAssertionError` into one JSON summary; no silent paths;
      stderr carries the reason on non-zero exit.
- [x] 5. Security — no secrets logged; DATABASE_URL never echoed; read-only
      SQL; memory-mode refused.
- [x] 6. Performance — single full-table read of a small governed table;
      pool closed in `finally`; no hot paths.

Gate: no Critical/Major in-lane findings open. Verification evidence supplied
by the lane (49/49 targeted, typecheck 0 new, eslint/prettier clean) accepted;
hashes independently re-verified against the handoff.

---

## Verification

- Re-hashed both files; match the lane handoff exactly.
- Lane rebase base `16381f4e` matches the current branch tip.
- Cross-checked evaluator semantics against
  `server/services/canary-residue-service.ts` policy shape (required env caps,
  ttlHours) and `release_canary_runs` schema columns.
- Not run here: full suite, testcontainers canary lane, staged execution —
  out of scope for this bounded lane and already tracked in the rework list.
