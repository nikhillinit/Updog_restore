---
status: HISTORICAL
audience: both
last_updated: 2026-10-30
owner: '@nikhillinit'
---

# Changelog - Week 15, 30-10-2026, QA Closure C5 Exact-Baseline Analysis State (F_1.17.0 PR 2b)

**Release status**: source and matrix changes committed on branch
`fix/f1170-pr2b-c5-exact-baseline`; the matrix reapproval, push, pull request,
and merge are owner-gated, with merge behind `CI Gate Status`. **Package
version**: 1.6.0, unchanged; no new application version or release tag.
**Object**: fix(variance): C5 exact-baseline analysis state, Task 6b. **Code
review**:
[Code review](../3-code-review/CR_w15_qa-closure-client-reliability-pr2b.md)
(Codex loop, 2 rounds, no findings; approval waits only on the owner matrix
reapproval). **Plan**:
`docs/1-plans/F_1.17.0_qa-closure-client-reliability.plan.md` (PR 2b;
codex-plan-review round 1 APPROVED at `ee0a81dda`).

## Changes

- **Server:** the calculation service adds
  `getLatestVarianceReportForBaseline(fundId, baselineId)`, the newest variance
  report for one baseline of a fund, with no fallback to another baseline. The
  variance dashboard reads the default baseline with an explicit
  `{ isDefault: true, limit: 1 }` query instead of searching the newest five
  baselines, and sources `summary.lastAnalysisDate` only from the exact lookup
  (null when there is no default baseline or no matching report). Recent
  baselines, recent reports, risk level, and trend stay fund-wide. The response
  shape is unchanged.
- **Client:** when the dashboard answered, the current-baseline empty alerts
  copy is `No baseline`, `Not analyzed`, or
  `No open alerts for the current baseline. Last analyzed <date>.` It never
  claims acceptable variance. Without a dashboard response, PR 2a's neutral
  sentence stays; a dashboard error still replaces the page. The overview "Last
  Analysis" and "Analysis Status" descriptions now say they describe the current
  baseline.
- **Matrix:** sanctioned non-fresh reseed at `b488bc45d`. Exactly the 15
  `server/routes/variance.ts` rows demoted, plus the forced re-proposal of the
  legacy `Dockerfile.railway` listener. The scoped review file
  `audit/surface-contract-matrix/f1170-pr2b-scoped-review.json` covers them, and
  `.gitleaks.toml` allowlists its path for the existing source-digest rule.
- `TODOS.md`: the "QA closure PR C" entry is removed; this PR delivers it.

## Verification

- `npm run check`: 0 new errors. `npm run lint` (with
  `NODE_OPTIONS=--max-old-space-size=8192`): clean, all guardrails pass.
- `npm test`: 17329 passed, 90 skipped, 1 expected failure (the matrix
  source-hash mismatch on `server/routes/variance.ts` before reseed). After the
  reseed, the matrix CI gate reports only the 15 proposed rows and one listener,
  the expected state until the owner approval.
- `npm run phoenix:truth`: 363 passed. `npm run test:internal-economics-v2`: 429
  passed. `npm run build:web`: passes.
- Targeted variance service, API, page, and set-default hook tests: 162 passed.
- `approve-matrix.mjs --dry-run` with the scoped review file: 15 rows, 1
  off-row, phase closed, closure passed, 0 coverage gaps.
- Hosted `CI Gate Status` and `Financial Truth` evidence requires a push.
