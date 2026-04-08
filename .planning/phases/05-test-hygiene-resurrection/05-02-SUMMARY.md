---
phase: 05-test-hygiene-resurrection
plan: 02
subsystem: test-infrastructure
tags:
  [
    test-hygiene,
    quarantine,
    contract-drift,
    phase-2a-reconcile,
    integration-tests,
  ]
requires:
  - Plan 05-01 (Phase 5 kickoff — integration-suite quarantine audit)
provides:
  - Accurate, date-stamped quarantine comment on
    tests/integration/fund-idempotency.spec.ts
  - Formal outcome record (FINDINGS.md) proving the original REFL-024 cascade
    comment is obsolete
  - Follow-up reservation REFL-038 filename for a future test-rewrite phase
affects:
  - vitest.config.int.ts (re-quarantined with accurate comment; old cascade
    comment retired)
tech-stack:
  added: []
  patterns:
    - Evidence-based quarantine comments (date + actual failure mode +
      FINDINGS.md link)
    - Cascade-fix verification via isolated-run evidence (duration, port,
      startup/teardown logs)
key-files:
  created:
    - .planning/phases/05-test-hygiene-resurrection/05-02-FINDINGS.md
    - .planning/phases/05-test-hygiene-resurrection/05-02-SUMMARY.md
  modified:
    - vitest.config.int.ts
decisions:
  - Branch D (STALE CONTRACT) over Branch C (PRODUCTION BUG) — the FundCreateV1
    schema tightening is intentional Phase 2A evolution, documented in-file
  - Defer test-rewrite to v1.1 spillover or v1.2 kickoff (out of scope for Phase
    5 hygiene)
metrics:
  duration:
    ~45 min (including initial cascade-fix verification and checkpoint
    round-trip)
  completed: 2026-04-08
requirements:
  - REQ-TEST-01
---

# Phase 5 Plan 02: Fund Idempotency Test Hygiene Summary

**One-liner:** Verified the REFL-024 cascade fix is real, re-quarantined
`fund-idempotency.spec.ts` with an accurate stale-contract comment citing the
three drift categories (unit drift, strict-mode rejection, response envelope
change), and reserved REFL-038 for follow-up.

## Outcome: STALE CONTRACT — re-quarantined with accurate comment

Full details in [`05-02-FINDINGS.md`](./05-02-FINDINGS.md). This summary
captures the plan-level close-out; FINDINGS is the operational record.

## What Actually Happened

- **Task 1 (auto):** Removed the stale quarantine entry + comment from
  `vitest.config.int.ts`. `grep` sanity-checks passed. `npm run check` exited 0.
  Committed as `6d1874cc` (Wave 1).
- **Task 2 (checkpoint:human-verify):** Ran the unquarantined test in isolation.
  All 6 tests failed FAST (total run 10.62s on ephemeral port 51278 — no
  cascade, no hang, no timeouts). First failure signature: HTTP 400 Bad Request
  on initial `POST /api/funds`. Classified as Branch D (Stale Contract) and
  returned checkpoint message to orchestrator. Orchestrator independently
  verified the drift findings in `shared/contracts/fund-create-v1.contract.ts`
  and approved Branch D.
- **Task 3 (auto, Sub-action D):** Re-added the exclude entry with a new
  date-stamped comment citing the actual failure. Created FINDINGS.md with three
  drift categories documented, cascade-fix verification evidence, branch
  rationale, and follow-up reservation. Deleted scratch output files.

## Acceptance Criteria Verdict

| #   | Criterion                                                               | Status                                                         |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Old "cascade resource exhaustion" / "6/6 tests timeout" comment removed | PASS                                                           |
| 2   | Either test runs live OR re-excluded with accurate non-stale comment    | PASS — re-excluded with Branch D comment                       |
| 3   | FINDINGS.md exists with `Outcome:` line                                 | PASS — "STALE CONTRACT — re-quarantined with accurate comment" |
| 4   | Follow-up REFL filename reserved                                        | PASS — `REFL-038-fund-idempotency-pre-phase-2a-contract.md`    |
| 5   | `npm run check` exits 0                                                 | PASS (see Final Gates below)                                   |
| 6   | `npm run validate:core` exits 0                                         | PASS (see Final Gates below)                                   |
| 7   | `node scripts/check-orphan-tests.mjs` exits 0                           | PASS (see Final Gates below)                                   |
| 8   | No scratch files committed                                              | PASS — both deleted                                            |

## Why Branch D (Not B or C)

Summarized here; full rationale in FINDINGS.md sections "Why Branch D (Stale
Contract), Not Branch C (Production Bug)" and "Why Not Branch B (Trivial Fix
In-Phase)".

- **Not C:** The schema tightening is explicitly documented Phase 2A evolution
  (`@provisional size=0 ... Phase 2A reconciles` docstring). Product code is
  healthy.
- **Not B:** 6 tests × 3 independent drift axes (unit drift, strict-mode keys,
  response envelope) + re-derivation of current idempotency middleware semantics
  = >30 min of test-rewrite work, not a 1-line fix.
- **D:** Re-quarantine with honest comment, reserve follow-up, defer to product
  decision.

## Deviations from Plan

**None.** The plan explicitly budgeted for all four branches (A/B/C/D). Branch D
was taken per the plan's checkpoint flow after orchestrator approval. No Rule
1/2/3 auto-fixes were triggered; no Rule 4 architectural decisions needed.

## Follow-up Reserved (Out of Scope for Phase 5)

- **REFL-038** —
  `docs/skills/REFL-038-fund-idempotency-pre-phase-2a-contract.md` (filename
  reserved, not written). To be created when the test-rewrite work lands as part
  of v1.1 spillover or v1.2 kickoff.
- **Collateral observation:** Two pre-existing integration flakes surfaced
  during the full-suite run (`variance-planner-leader-election.test.ts` from M8
  commit `aca1abdb`, `portfolio-activity-routes.test.ts` from M5 commit
  `4d42e00a`). Neither touches the fund-idempotency path. Flagged in FINDINGS.md
  as out-of-scope for Phase 5 but worth a future integration-flake triage pass.

## Final Gates

All gates run immediately prior to commit. All green.

| Gate                                                       | Expected | Actual                                              | Result |
| ---------------------------------------------------------- | -------- | --------------------------------------------------- | ------ |
| `npm run check`                                            | exit 0   | exit 0 (0 new TS errors, baseline 0/current 0)      | PASS   |
| `npm run validate:core`                                    | exit 0   | exit 0 (wizard e2e 1/1 pass, phase4 ratchet 41<=55) | PASS   |
| `node scripts/check-orphan-tests.mjs`                      | exit 0   | exit 0                                              | PASS   |
| `grep -c "fund-idempotency" vitest.config.int.ts`          | `1`      | `1`                                                 | PASS   |
| `grep -c "cascade" vitest.config.int.ts`                   | `0`      | `0`                                                 | PASS   |
| `grep -c "6/6 tests timeout" vitest.config.int.ts`         | `0`      | `0`                                                 | PASS   |
| `grep -c "Re-quarantined 2026-04-08" vitest.config.int.ts` | `1`      | `1`                                                 | PASS   |

## Commits

- `6d1874cc` (Wave 1, Task 1) —
  `chore(05-02): remove stale quarantine entry for fund-idempotency.spec.ts`
- **Commit 1 (this session):**
  `chore(05-02): re-quarantine fund-idempotency.spec.ts with accurate stale-contract comment`
  - Files: `vitest.config.int.ts`,
    `.planning/phases/05-test-hygiene-resurrection/05-02-FINDINGS.md`
- **Commit 2 (this session):**
  `docs(05-02): close test hygiene resurrection plan with stale-contract outcome`
  - Files: `.planning/phases/05-test-hygiene-resurrection/05-02-SUMMARY.md`

## Pointer to FINDINGS.md

All operational detail — cascade-fix verification evidence, three drift
categories with exact schema line numbers, isolated-run timings, invariants
captured, collateral observations — lives in
[`05-02-FINDINGS.md`](./05-02-FINDINGS.md). This SUMMARY is intentionally a thin
close-out sheet.
