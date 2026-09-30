---
status: HISTORICAL
audience: both
last_updated: 2026-09-30
owner: '@nikhillinit'
---

# Code Review: Release evidence reads live provider state

**Review Date**: 2026-09-29

**Version**: 1.6.0 (package unchanged). Reviewed object: PR #1603, merge commit
`e7cec1fe1`. Line references below are to that commit.

**Files Reviewed**:

- `.github/workflows/release-proof.yml`
- `scripts/release/capture-release-recovery-context.mjs`
- `scripts/release/collect-provider-evidence.mjs`
- `scripts/release/current-forecast-production-action.mjs`
- `scripts/release/provider-evidence-contract.mjs`
- `scripts/release/verify-vercel-promotion.mjs`
- `scripts/release/wait-railway-workers.mjs`
- `tests/integration/current-forecast-production-action.pg.test.ts`
- `tests/unit/scripts/capture-release-recovery-context.test.mjs`
- `tests/unit/scripts/current-forecast-production-action.test.mjs`
- `tests/unit/scripts/provider-evidence-contract.test.mjs`
- `tests/unit/scripts/verify-vercel-promotion.test.mjs`

**Plan**: no plan, unplanned fix. Scope, non-goals, and verification are in the
PR #1603 body. The fix unblocks the baseline capture in
`docs/1-plans/F_1.18.1_production-release-7ee0210fa.plan.md`. Review ran through
the `codex-code-review` loop; round 1 returned APPROVED with no findings.

---

## Executive Summary

The release provider-identity path had never run against live providers. The
first baseline capture for #1602 failed, and a read-only replay found three
defects that fail every capture: canonical Vercel checks read the creation-time
`alias` field instead of the live alias list, the Railway contract rejected a
null replica count, and the Railway topology query lacked its closing brace in
four places. This change fixes all three. Verdict: **APPROVED**.

---

## Changes Overview

A shared helper in `provider-evidence-contract.mjs` (`withCurrentVercelAliases`,
`vercelDeploymentAliasesUrl`) replaces the stale alias field with the live list
from the deployment aliases endpoint. The canonical baseline capture, the
post-promotion resolver, and the Current Forecast production action all call it
before any provider mutation. The Railway contract accepts `numReplicas: null`
and still requires exactly one `RUNNING` instance per deployment. The topology
query brace is fixed in capture, provider evidence collection, the worker wait,
and `release-proof.yml`. The staged-candidate alias checks are out of scope and
unchanged.

---

## Findings

### Critical Issues

None.

### Major Issues

None.

### Minor Issues

None.

### Suggestions

None. Open risk carried forward, not a finding: the staged-candidate alias
checks (`verifyStagedVercel`, `release-production.yml` `validate-deployment`)
still read the creation-time field. If phase B fails there, it fails before
promotion. The release plan names this risk.

---

## Checklist

Criteria: `.claude/skills/TRIP-review/checklist.md`.

- [x] 1. Functional Requirements — passed. Every canonical caller fetches the
      live alias list and fails closed before mutation
      (`capture-release-recovery-context.mjs:419`,
      `current-forecast-production-action.mjs:465`,
      `verify-vercel-promotion.mjs:193`). The endpoint matches Vercel's
      documented deployment-aliases API.
- [x] 2. Code Quality — passed. One shared pure helper validates the alias
      response and replaces the stale field
      (`provider-evidence-contract.mjs:103`).
- [x] 3. Architectural Compliance — passed. Staged-candidate checks remain
      unchanged, as the PR's non-goals state.
- [x] 4. Error Handling — passed. Malformed alias responses fail closed;
      promotion polling remains bounded.
- [x] 5. Security — passed. Tokens stay in request headers. Only `null` is newly
      accepted for the replica count; one `RUNNING` instance and a matching
      latest and active deployment remain required
      (`provider-evidence-contract.mjs:352`).
- [x] 6. Performance — passed. One extra read per canonical check.

Approval gate:

- Functional requirements implemented: yes.
- No critical or major issues: yes.
- Build successful: `CI Gate Status` is `SUCCESS` on the #1603 head and on
  `e7cec1fe1`.
- Affected tests pass: 71 unit files (1603 tests) and the Current Forecast pg
  integration test, per the PR body. `git diff --check`, syntax checks on the
  changed scripts, and `actionlint` on `release-proof.yml` were clean.
- New logic has test coverage: yes. Live alias list over the stale field in both
  directions, malformed alias responses, null and invalid replica counts, and
  brace balance of every release Railway topology query
  (`provider-evidence-contract.test.mjs:209`).
- Documentation updated: the release plan records #1603 as a completed
  prerequisite.

---

## Verdict

**APPROVED**

No findings. The live read-only replay of `captureProviderBaseline` succeeded
with this change and failed without it. The staged-candidate alias path is the
one known untested live path left before the release.
