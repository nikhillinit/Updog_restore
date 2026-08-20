# PR #1385 Post-Merge Closeout Implementation Plan

## Status

Local, non-production closeout work is complete through G1 closure and local
validation. This plan records verified evidence and the remaining
authority-gated steps; it does not grant push, merge, provider, schema,
promotion, or production authority.

## Scope and constraints

- Worktree: `codex/pr1385-postmerge-closeout`, based on `origin/main`.
- Use Node `v22.23.2` and `TZ=UTC` for verification.
- Preserve unrelated worktrees and user-owned state.
- Do not hand-edit generated surface-contract artifacts or their hashes.
- Production deployment, provider mutation, schema action, promotion, traffic
  change, and release-proof dispatch require separate authorization.

## Verified G1 evidence

- Corrected source commit: `d08e680093d0de89b75e98f70352fcf261c3217b`.
- User-attested pre-approval review manifest: SHA-256
  `4a310c145519e2ccfa214efdd1d89e48feaecf53cdfeca2805c8caae1a6c1932`, 1,007,629
  bytes, bound to
  [PR #1385 comment 5359387046](https://github.com/nikhillinit/Updog_restore/pull/1385#issuecomment-5359387046).
- Local approval/rebind and non-production `--close-g1` completed: 471 rows, 82
  off-row records, 774 coverage obligations, zero gaps, and zero closure issue
  counts. Matrix phase is `closed`.
- Closure/evidence head before this documentation correction:
  `aac1a6f856c5ee160733f6a2af482c4bba244aac`.
- Post-closure artifact hashes:
  - `g1-review.json`:
    `d5e343b0231c984113543720bd20dfe932a64e219f90c806d0e4228f22a5afc8`
  - `matrix.json`:
    `94981ffd46426597b06c9366a0abe1d39e897001c78f49a4f9a5e7b00a2dfd8e`
  - `source-inventory.json`:
    `5c3dda6c893dc7d1316b55b938dff16e69d1dce59ecbaba6408a558b8065863f`

The pre-approval and post-closure manifest hashes intentionally differ.
Canonical approval/rebind and closure add bounded approval and closure state;
this is expected, not evidence of a manifest mismatch.

## Completed work

### Task 1: Durable owner evidence

- [x] Bound the durable evidence URL in the corrected execution plan.
- [x] Recorded the funds-404 disposition as a bounded no-reproduction result; no
      production fix or invented regression was added.

### Task 2: Standalone Full Release Proof credential scope

- [x] Repaired and validated protected-environment credential scoping in the
      approved closeout sequence.
- [x] Kept provider identity and production execution outside local closeout
      authority.

### Task 3: Matrix team-role extraction

- [x] Corrected source-backed team-role extraction for six fund-scoped routes.
- [x] Preserved public, partner-only, inline-admin, and unresolved-guard
      controls.
- [x] Added and passed focused regression coverage.

### Task 4: Regenerate, approve, and close G1

- [x] Regenerated canonical G1 artifacts after the source correction.
- [x] Bound the exact pre-approval manifest to the durable PR comment.
- [x] Completed local approval/rebind, `--close-g1`, validation, and render with
      zero closure issues.
- [x] Recorded post-closure artifact hashes above.

### Task 5: Preserved-plan and local-state classification

- [x] Verified every located August 11 hardening-plan copy is byte-identical to
      `origin/main` at SHA-256
      `fd15d0738d49cc9a00707d5d67f346f2843989371debcdac211984663883b83e`.
- [x] Verified `child-f` is clean and tree-identical to `origin/main`.
- [x] Classified four Task 11 temporary trees as stale generated G1 evidence
      only; the successor also contains superseded ad hoc runners and an
      untracked defect ledger, with no unique source commits or files.
- [x] Prepared preserved-plan classification for the draft PR description. The
      exact text remains untracked because policy places it in the PR body.
- [ ] After merge, remove only the classified Task 11 branch, worktrees,
      temporary directories, and preserved copy.
- [ ] Do not remove unrelated branches or worktrees.

### Task 6: Local validation and publication

- [x] Completed the recorded local validation set for the closure/evidence head,
      including targeted checks and G1 validation.
- [x] Confirmed generated-artifact diff scope and `git diff --check` before this
      documentation correction.
- [x] Reconciled Task 11 closeout documentation and regenerated routing
      metadata.
- [ ] Validate the new exact head as required by repository policy.
- [ ] Push only the exact validated head and open or update the draft PR against
      `main`.
- [ ] Obtain green exact-head `CI Gate Status` after the authorized push.
- [ ] Merge only after exact-head CI and required review authority are present.
- [ ] Dispatch Full Release Proof, provider identity, or production work only
      with separate authorization.
- [ ] Perform Task 5 cleanup only after the closeout PR merges.

## Remaining authority boundary

This plan is a local evidence record. It does not authorize a GitHub write,
push, merge, provider call, schema operation, deployment, promotion, or
production release. Any later commit creates a new exact head and therefore
requires fresh exact-head validation and CI evidence before merge.
