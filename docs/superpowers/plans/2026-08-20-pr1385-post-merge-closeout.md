# PR #1385 Post-Merge Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`. Track every step with checkboxes.

**Goal:** Resolve all non-production PR #1385 remnants: durable approval
evidence, standalone Release Proof credentials, matrix auth-role under-count,
funds-404 disposition, preserved-plan review, and scoped cleanup.

**Architecture:** Work from a fresh isolated worktree based on current
`origin/main`. Land workflow and audit-tool repairs through one reviewable PR,
regenerate G1 artifacts after source changes, and require exact-head CI.
Production release/provider proof remains separately authorized work.

**Tech Stack:** TypeScript, Node 22, Vitest, GitHub Actions, surface-contract
matrix tooling.

**Spec:** `docs/1-plans/F_1.2.9_task11-g1-corrected-execution.plan.md`

## Global Constraints

- Read governing policy from `origin/main` before governance, merge, archive, or
  provider actions.
- Preserve dirty/untracked user files and unrelated worktrees.
- Use `TZ=UTC` for tests.
- No production deployment, provider mutation, schema action, promotion, or
  traffic change.
- Never hand-edit generated matrix hashes.
- Standalone Release Proof uses protected `Production` environment; do not copy
  credentials to repository scope.
- Commit precedes final exact-head validation.

## Task 1: Establish Durable Owner Evidence

**Files:**

- Add: `docs/superpowers/plans/2026-08-20-pr1385-post-merge-closeout.md`
- Modify: `docs/1-plans/F_1.2.9_task11-g1-corrected-execution.plan.md`

**Interfaces:**

- Stable evidence URL:
  `https://github.com/nikhillinit/Updog_restore/pull/1385#issuecomment-5359387046`,
  resolving existing locator
  `forensics:execution-log.md#owner-approval-2026-08-20`.
- Closeout branch/base: `codex/pr1385-postmerge-closeout` from `origin/main` at
  `c0a3cd08b7d46a1df6a81a6999c9baf6f0da3c7a`.
- Funds-404 is a bounded no-repro: the locked victim stayed green through all
  prescribed stages (21/21 victim executions); no production fix or invented
  regression test. The durable disposition is the stable PR #1385 comment URL
  above.
- This evidence is non-authorizing and explicitly pending exact
  regenerated-manifest attestation. It does not claim owner approval, G1
  closure, merge authority, or production/provider/schema/promotion/deployment
  authority.

- [x] Bind durable pending-evidence URL in corrected execution plan.
- [x] Record closeout branch/base and funds-404 no-repro URL/disposition.
- [x] Run `npm run docs:routing:generate`.
- [x] Run `npm run docs:routing:check`.
- [x] Commit:
      `git commit -m "docs(governance): bind Task 11 approval evidence"`.

## Task 2: Repair Standalone Full Release Proof Credential Scope

**Files:**

- Modify: `.github/workflows/release-proof.yml`
- Modify: `tests/regressions/ci-fail-closed.test.ts`

**Interfaces:**

- Produces `full-release-proof` job bound to GitHub environment `Production`.
- Preserves step-local credential exposure; local matrix evidence verification
  steps receive no provider secrets.

- [ ] Add failing workflow-contract assertions:

  ```ts
  expect(proofWorkflow.jobs?.['full-release-proof']?.environment).toBe(
    'Production'
  );
  expect(localEvidenceStep?.env).not.toHaveProperty('VERCEL_TOKEN');
  expect(verifyBootStep?.env).not.toHaveProperty('VERCEL_TOKEN');
  ```

- [ ] Run `TZ=UTC npx vitest run tests/regressions/ci-fail-closed.test.ts` and
      confirm failure.
- [ ] Add `environment: Production` to `jobs.full-release-proof`; do not change
      secret names, workflow inputs, or provider-identity behavior.
- [ ] Rerun targeted test and `npm run release:check`.
- [ ] Commit:
      `git commit -m "fix(release): bind standalone proof to protected environment"`.

## Task 3: Correct Matrix Team-Role Extraction

**Files:**

- Modify: `audit/surface-contract-matrix/scripts/seed-matrix.mjs`
- Modify: focused matrix auth/semantics tests
- Regenerate later: matrix artifacts and G1 review

**Interfaces:**

- Authenticated, fund-scoped routes without role-specific guards map effective
  team roles `admin`, `partner`, `analyst`, yielding personas `admin`, `gp`,
  `analyst`.
- Must not broaden public routes or routes with explicit role guards.

- [ ] Add failing assertions for six rows:
  - `GET /api/timeline/:fundId/state`
  - `GET /api/shares`
  - `GET /api/shares/:shareId/analytics`
  - `POST /api/shares`
  - `PATCH /api/shares/:shareId`
  - `DELETE /api/shares/:shareId`
- [ ] Assert each receives team personas with source-cited
      authentication/fund-scope evidence.
- [ ] Add negative assertions proving `/api/public/shares/*` remains public,
      `requirePartnerWrite` routes remain `admin` plus `gp`, and admin-only
      routes remain admin-only.
- [ ] Run failing targeted tests.
- [ ] Update `authSuggestionFor()` so team-role fallback applies only when route
      is globally authenticated, no explicit/unresolved role guard exists, and
      source evidence establishes team/fund-scoped access.
- [ ] Run targeted matrix auth, semantics, persona-sync, and approval tests.
- [ ] Commit source and tests only:
      `git commit -m "fix(audit): derive team personas for fund-scoped routes"`.

## Task 4: Regenerate and Reapprove G1

**Files:**

- Regenerate: `audit/surface-contract-matrix/*.json`
- Regenerate: `audit/surface-contract-matrix/MATRIX.md`
- Update: `audit/surface-contract-matrix/g1-review.json`
- Update: `audit/surface-contract-matrix/g1-defect-ledger.json`

**Interfaces:**

- Consumes durable PR comment URL from Task 1.
- Produces closed G1 matrix with corrected six-row persona extraction and zero
  fingerprint drift.

- [ ] Run canonical clean regeneration sequence at updated exact source SHA.
- [ ] Preserve first seed output and prove second seed byte-identical.
- [ ] Initialize fresh review manifest; transplant prior human decisions only
      where source-derived invariants still match.
- [ ] Replace six retained-machine-authority findings with adopted
      source-derived corrections.
- [ ] Set `approver_id` to `nikhillinit` and `evidence_ref` to durable PR
      comment URL.
- [ ] Run approval dry-run and inspect every reported change.
- [ ] Obtain owner confirmation binding regenerated manifest exact SHA-256 to
      preallocated comment URL.
- [ ] Apply approval, close G1, validate, and run canonical scripts.
- [ ] Require `closure.passed=true`, zero unresolved counts, zero fingerprint
      drift, all six routes carry expected team personas, and
      public/partner-only negative controls remain unchanged.
- [ ] Commit generated evidence separately:
      `git commit -m "chore(audit): refresh G1 after auth extraction repair"`.

## Task 5: Dispose Preserved Plans and Local Audit State

**Files:**

- Compare tracked August 11 hardening plan against preserved forensic copy.
- Remove only explicitly listed merged Task 11 worktrees and temporary
  directories after the closeout PR merges.

- [ ] Classify every unique preserved-plan hunk as already implemented,
      superseded by merged plan/policy, or still actionable and copied into this
      closeout plan.
- [ ] Record classification summary in PR description, not a new session
      artifact.
- [ ] Verify both Task 11 local branch/worktree temporary trees are clean and
      contain no unique commits/files.
- [ ] After closeout PR merges, remove only:
  - local `feat/child-f-g4-readiness`
  - `.worktrees/child-f`
  - `/private/tmp/task11-g1-corrected.6DEs7O`
  - `/private/tmp/task11-g1-recover-node26.zaVgUw`
  - `/private/tmp/task11-g1-repro.5als87`
  - `/private/tmp/task11-g1-successor`
  - preserved August 11 copy after its evidence classification
- [ ] Do not touch unrelated worktrees or branches.

## Task 6: Exact-Head Validation and Publication

- [ ] Run targeted tests first, then:

  ```bash
  TZ=UTC npm run lint
  TZ=UTC npm run check
  TZ=UTC npm test
  TZ=UTC npm run docs:routing:check
  TZ=UTC npm run build
  TZ=UTC npm run build:verify
  TZ=UTC npm run release:check
  TZ=UTC npx tsx audit/surface-contract-matrix/scripts/validate-matrix.mjs
  ```

- [ ] Confirm tracked tree contains no generated `audit/knowledge-graph/out`.
- [ ] Obtain independent code review focused separately on workflow secret scope
      and matrix authorization semantics.
- [ ] Push only exact validated HEAD and open PR against `main`.
- [ ] Merge only after exact-head `CI Gate Status` succeeds.
- [ ] After merge, obtain separate authorization before dispatching standalone
      Full Release Proof against exact new `main` SHA.
- [ ] Acceptance: proof reaches strict Vercel boot step with protected
      credentials and completes without prior empty-secret failure.

## Assumptions

- Funds-404 dossier accepted as bounded no-repro; no code change or regression
  test invented.
- Preserved August 11 plan copy deleted only after unique-content
  classification.
- Provider identity, live canaries, promotion, and production release remain out
  of scope.
- Recommended execution method: subagent-driven, with fresh implementation and
  review agents for independently reviewable tasks.
