---
status: HISTORICAL
audience: both
last_updated: 2026-10-30
owner: '@nikhillinit'
---

# Code Review: F_1.17.0 PR 2b C5 exact-baseline analysis state

**Review Date**: 2026-10-30

**Version**: 1.6.0 (package unchanged). Reviewed object: `7377bcd46..ac2750f69`
on `fix/f1170-pr2b-c5-exact-baseline`, two commits ahead of `origin/main` at
`7377bcd46` (#1672): the source change `b488bc45d`
(`fix(variance): F_1.17.0 PR 2b exact-baseline analysis state`) and the matrix
reseed `ac2750f69`
(`chore(matrix): F_1.17.0 PR 2b non-fresh reseed and scoped review`).

**Plan**: `docs/1-plans/F_1.17.0_qa-closure-client-reliability.plan.md`, PR 2b,
Task 6b (codex-plan-review 2026-10-29 round 1 APPROVED at `ee0a81dda`).

**Review loop**: Codex code review, 2 rounds, then a synthesis pass (thread
`01a18bc8-ce0d-7031-982c-c66749a706bc`). Both rounds ran against the explicit
committed range from `7377bcd46`. Round 1 covered the source commit, round 2 the
matrix commit.

## Verdict

APPROVED with observations. No Critical, Major, or Minor findings and no
suggestions. Both rounds returned REQUEST_CHANGES only because the matrix CI
gate is red until the owner-authorized reapproval (plan Stop condition 2); the
synthesis records that this is the expected stop state, not an implementation
defect.

## Findings

- **Round 1 gate observation, addressed:** the matrix test reported the
  `server/routes/variance.ts` source-hash mismatch caused by the route change.
  The non-fresh reseed in `ac2750f69` updated the inventory hash, and the audit
  suite then reported no hash error.
- **Round 2 gate observation, open and owner-gated:** the 15
  `server/routes/variance.ts` rows and the `legacy-dockerfile-railway` listener
  remain proposed. The scoped review file
  `audit/surface-contract-matrix/f1170-pr2b-scoped-review.json` supplies the
  approval evidence; the approval run belongs to the owner. Before that run, the
  ignored knowledge graph must be rebuilt at the current `HEAD`
  (`audit/surface-contract-matrix/README.md`, non-fresh sequence).

Checklist: functional requirements, code quality, architectural compliance,
error handling, security, and performance all passed.

## Implementation review notes

- Service: `getLatestVarianceReportForBaseline` filters by both `fundId` and
  `baselineId`, orders by `createdAt DESC`, and has no fallback. The service
  test renders the `where` and `orderBy` SQL with `PgDialect` to prove both
  filters and the order.
- Route: the dashboard reads the default baseline with
  `{ isDefault: true, limit: 1 }` and sources `summary.lastAnalysisDate` only
  from the exact lookup. The API tests cover a default baseline older than the
  newest-five list with a newer report for another baseline and an older
  matching report, a default with no matching report, and no default (exact
  lookup not called). Fund-wide recent reports, risk level, and trend are
  asserted unchanged.
- Client: the truth table applies only when the dashboard answered. A dashboard
  error has always replaced the page, so the plan's "dashboard error keeps the
  neutral sentence" is met as behavior preservation; the neutral sentence is
  tested in the reachable no-response state. The two overview stat descriptions
  that read the now baseline-scoped `lastAnalysisDate` say "current baseline".
- Matrix: exactly the 15 expected rows demoted with unchanged contract
  fingerprints; `g1_closure` byte-identical; boot proofs changed only their
  source SHA; `runtime-exclusions.json` has zero churn; `MATRIX.md` is not
  rendered before approval. `.gitleaks.toml` adds one path to the existing
  eight-file digest allowlist.
- The production change was delegated to codex-implement after the tests were
  written; Codex did not edit tests. No `.impeccable/` directory or agent state
  was staged.

## Gate

- At `b488bc45d`: `npm run check` 0 new errors; `npm run lint` clean; `npm test`
  17329 passed, 90 skipped, 1 expected matrix source-hash failure;
  `phoenix:truth` 363 passed; `test:internal-economics-v2` 429 passed;
  `build:web` passes.
- At `ac2750f69`: targeted variance tests 162 passed; `tests/unit/audit` 177
  passed, 1 expected failure (15 proposed rows and one listener);
  `approve-matrix.mjs --dry-run` passes (15 rows, 1 off-row, closure passed, 0
  coverage gaps).

## Residual risk

- Hosted `CI Gate Status` and `Financial Truth` evidence needs a push and then a
  new head after the approval commit (Stop condition 3).
- No rendered (Playwright) check ran; the copy change is covered by page tests,
  and no e2e spec asserts the changed strings.
- The reviewer did not rerun tests; the gate results above come from the
  implementer's runs.
