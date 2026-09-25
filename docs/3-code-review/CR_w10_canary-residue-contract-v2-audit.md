---
status: HISTORICAL
audience: both
last_updated: 2026-09-25
owner: '@nikhillinit'
---

# Code Review: Canary Residue Contract V2 (post-merge manual audit)

**Review Date**: 2026-09-25  
**Version**: 1.6.0 (package unchanged). Audited object: merge commit `02ea2dc44`
of PR #1580 against base `e2a4f172a`. The merged tree is byte-identical to the
PR head `32691facc` (`git diff --quiet 32691facc 02ea2dc44` exits 0), which is
the commit the in-loop Codex review approved in
`CR_w10_canary-residue-contract-v2.md`. This audit is an independent second
pass. It adds a human read of the diff, a docs check, and CI evidence from the
merged SHA. It does not re-run the Codex review.  
**Files Reviewed**:

- `shared/contracts/release-canary-residue-characterization-v2.contract.ts`
  (new, read in full)
- `shared/contracts/release-evidence-fragment-v1.contract.ts`
- `shared/contracts/release-evidence-manifest-v1.contract.ts`
- `shared/contracts/release-proof-certification-v1.contract.ts`
- `scripts/release/assert-canary-residue.mjs`
- `scripts/release/build-release-evidence-manifest.ts`
- `scripts/release/build-release-proof-certification.ts`
- `server/services/canary-residue-service.ts`
- `.github/workflows/release-proof.yml`
- `.github/workflows/release-production.yml`
- Tests (skimmed for coverage claims only):
  `tests/unit/contracts/release-canary-residue-characterization-v2.contract.test.ts`,
  `tests/regressions/ci-fail-closed.test.ts`,
  `tests/integration/fund-lifecycle-db.test.ts`,
  `tests/integration/release-canary-lifecycle.test.ts`, and the builder, script,
  and service suites listed in the Codex record
- `CHANGELOG.md`, `docs/ARCHI.md` (section 8 item 9)
- `docs/1-plans/F_1.16.0_canary-residue-contract-v2.plan.md` (Overview and
  Implementation notes)

**Plan**: `docs/1-plans/F_1.16.0_canary-residue-contract-v2.plan.md`

---

## Executive Summary

PR #1580 adds a strict HTTP-v2 canary residue reservation (44/5/5). It composes
that reservation from the frozen v1 service characterization (40/4/2) plus an
observed HTTP delta (+1 fund event, +3 receipts). It binds the result through
certification, the manifest, and the production cap checks. The logic matches
the plan and fails closed at every boundary checked. No Critical or Major
findings. One Minor duplication finding and two suggestions. The main
observation is operational: the new release-proof steps have never run on GitHub
Actions, because the scheduled release proof has failed upstream since
2026-09-14.

APPROVED with observations

---

## Changes Overview

The new v2 contract owns the reservation identity, the 44/5/5 vector, the HTTP
fund-proof sidecar schema, the pure composer, and one shared evidence schema.
The certification and manifest both nest the evidence schema. The v1 contract
file has no diff, so its byte freeze holds. Release proof now runs the HTTP fund
test under `vitest.config.testcontainers.ts`. It composes and round-trips the v2
artifact and passes the evidence JSON to certification. Production checks all
twelve Vercel policy keys one key at a time, before `vercel build` and again
after deploy. The exact-run residue assertion now requires
`--reservation-identity`.

---

## Findings

### Critical Issues

None.

### Major Issues

None.

### Minor Issues

1. **Artifact-name template still hard-coded in the workflow.**
   `.github/workflows/release-proof.yml:570` builds
   `release-canary-residue-characterization-v2-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-${CANDIDATE_SHA}`
   in shell. The plan's implementation notes say
   `releaseCanaryResidueCharacterizationV2ArtifactName` "replaces every
   hard-coded artifact-name template". That is true for the TypeScript builders
   and contracts, not for this workflow step. Drift fails closed: the
   certification builder and the manifest schema both compare against the
   helper, and `tests/regressions/ci-fail-closed.test.ts:4937` pins the shell
   literal. Disposition: open, low risk. Fix the plan note wording, or accept
   the literal as a second pinned copy.

### Suggestions

1. **Certified policy values are literals.**
   `.github/workflows/release-production.yml:561` hard-codes the twelve
   certified values (3/3/3/15/0/3/36/15/21/33/132, TTL 24). The policy-config
   step derives the same values from
   `RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE` through `tsx`. The
   `stage-production` job runs only checkout and `actions/setup-node`, with no
   dependency install, so it cannot load the contract the same way. A future
   reservation change must update both places. Drift blocks the release and does
   not weaken it, so this is acceptable as is.
2. **Reservation identity literal repeated in the script.**
   `scripts/release/assert-canary-residue.mjs:27` redeclares
   `'release-canary-http-workflow-v2'`, although `readSharedReservedResidue`
   already loads the v2 contract through `tsImport`. The argument parser
   validates synchronously before that import, so the local copy is intentional.
   The manifest literals catch any drift. Keep it unless the parser becomes
   async.

---

## Verification Evidence

- Merged tree equals the Codex-approved head `32691facc`.
- PR #1580 checks at the head: 43 pass, 3 skipping (Memory Mode Tests, Claude
  Code Review, Dependency Validation (Linux)), `CI Gate Status` pass.
- Post-merge runs on `02ea2dc44`: CI Unified, CodeQL, Security Deep Scan, and
  Documentation Routing Check all succeeded.
- `actionlint` on both release workflows at `02ea2dc44`: clean.
- The `-t 'reserves HTTP canary residue'` filter matches the test at
  `tests/integration/fund-lifecycle-db.test.ts:530`. The step uses
  `vitest.config.testcontainers.ts`, not the integration config that excludes
  the file. If the filter ever matches nothing, the next step's
  `test -f "$HTTP_RESULT_PATH"` fails, so a vacuous green is not possible.
- The Codex round-1 Major fix is present in the merged text: all twelve values
  are pinned, and any mismatch, missing value, `sensitive` type, or duplicate
  production entry exits 1.
- Vercel check: it lists env entries without `decrypt`, then reads each of the
  twelve keys by ID. No bulk-decrypt path exists.

## Observation: v2 release-proof path not yet exercised on Actions

PR CI does not run `release-proof.yml`. The last two scheduled runs (2026-09-14
at `c1966f736`, 2026-09-21 at `2e0d8f08a`) both predate #1580. Both failed in
`Full DB-backed Release Proof`, step "Run exact local and matrix evidence". The
2026-09-21 log shows `JavaScript heap out of memory` and then
`[release:check] failed: Lint and guardrails`. Canary Residue Characterization
depends on that job, so it was skipped. So the new HTTP-proof, compose, and
evidence steps have run only locally, through the extracted scripts described in
the plan's implementation notes.

The owner sets the Production caps to 15/15/132 after merge. The first
production release dispatch after that change will be the first real execution
of this path. Before that dispatch, fix the release-check out-of-memory failure.
Then run a manual `release-proof.yml` dispatch on `main` and confirm the
characterization job uploads `release-canary-residue-characterization-v2-*`.
This is not a defect in #1580.

---

## Checklist

Criteria: `.claude/skills/TRIP-review/checklist.md`.

- [x] 1. Functional Requirements — passed (44/5/5 composition, fixed +1/+3/+4
      delta, 3x caps with total 132, v1 byte-frozen, identity bound across
      policy, measurement, canary, characterization, certification, and
      manifest)
- [ ] 2. Code Quality — passed with caveats (Minor 1 and Suggestions 1-2: the
      artifact-name template, certified policy values, and identity literal are
      duplicated, and all three fail closed on drift)
- [x] 3. Architectural Compliance — passed (contract under `shared/contracts/`,
      no new service, framework, schema, or dependency; ARCHI section 8 item 9
      added)
- [x] 4. Error Handling — passed (`set -euo pipefail`, `test -f` on every result
      file, strict Zod parse on every hop, empty evidence JSON throws, builder
      wraps invalid JSON in `BuilderError`)
- [x] 5. Security — passed (per-key Vercel reads, `sensitive` refused,
      secret-shaped content scan on the sidecar, the artifact, and the evidence;
      bearer token in curl arguments is the existing pattern)
- [x] 6. Performance — passed (bounded arrays, characterization job timeout
      raised 30 to 45 minutes for the added HTTP step)

Approval gate: functional requirements met; no Critical or Major findings; build
and CI green on the head and the merged SHA; new logic covered by the v2
contract suite and updated builder, script, service, and fail-closed regression
suites; CHANGELOG, ARCHI, plan notes, and the Codex record updated.

---

## Verdict

**APPROVED with observations**

No change to #1580 is required. The open items are one documentation-accuracy
Minor and two suggestions, and none of them blocks release. Before the first
release dispatch that relies on the 44/5/5 reservation, repair the scheduled
release-proof out-of-memory failure. Then confirm one green `release-proof.yml`
run on `main` that includes Canary Residue Characterization.
