# Code Review: V2 Catch-Up Allocation Parity (F_2.0.4)

**Review Date**: 2026-08-26 **Version**: 2.0.4 (plan F_2.0.4; package version
remains 1.6.0) **Files Reviewed**:

- `CHANGELOG.md`
- `docs/1-plans/F_2.0.4_v2-catch-up-allocation-parity.plan.md`
- `docs/ARCHI.md`
- `shared/lib/internal-economics/v2/catch-up-allocation-v2.ts`
- `shared/lib/internal-economics/v2/decimal-cents-v2.ts`
- `shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts`
- `shared/lib/internal-economics/v2/waterfall-whole-fund-v2.ts`
- `tests/unit/internal-economics/v2/catch-up-allocation-v2.test.ts`
- `tests/unit/internal-economics/v2/waterfall-deal-by-deal-v2.test.ts`
- `tests/unit/internal-economics/v2/waterfall-whole-fund-v2.test.ts`

**Plan**: `docs/1-plans/F_2.0.4_v2-catch-up-allocation-parity.plan.md`

---

## Executive Summary

Change implements shared V2 GP catch-up allocation, jointly quantized GP/LP
splits, and whole-fund plus deal-by-deal integration. All actionable findings
were addressed; supplied gates report zero failures attributable to this change.

APPROVED with observations

---

## Changes Overview

New shared allocation leaf applies locked cumulative-profit catch-up formula and
largest-remainder GP/LP apportionment. Both waterfall engines now use shared
catch-up and carry splitting with binding-availability caps. Architecture,
changelog, plan evidence, and 20 new tests document and validate behavior.

---

## Findings

### Critical Issues

None.

### Major Issues

- **[Major — addressed] Binding-cap HALF_UP rounding could over-distribute
  proceeds.** Floor conversion added at
  `shared/lib/internal-economics/v2/decimal-cents-v2.ts:12`; shared split clamps
  quantized allocation to floored availability at
  `shared/lib/internal-economics/v2/catch-up-allocation-v2.ts:35`; catch-up
  supplies cap at
  `shared/lib/internal-economics/v2/catch-up-allocation-v2.ts:76`; carry callers
  supply remaining availability at
  `shared/lib/internal-economics/v2/waterfall-whole-fund-v2.ts:270` and
  `shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts:262`.
  Binding-cap and capped-versus-uncapped regressions added at
  `tests/unit/internal-economics/v2/catch-up-allocation-v2.test.ts:163 and :179`.

### Minor Issues

- **[Minor — addressed] Full-gate checkbox claimed completion without
  attributable-failure evidence.** Plan now records exact baseline SHA, failure
  reproduction, flaky-file isolation, and zero attributable failures at
  `docs/1-plans/F_2.0.4_v2-catch-up-allocation-parity.plan.md:283`.

- **[Minor — addressed] Baseline evidence count was internally inconsistent
  (“41” versus “40 + 2”).** Revised wording separates 41 failing tests across 10
  files from deterministic and tail-order per-file attribution classes at
  `docs/1-plans/F_2.0.4_v2-catch-up-allocation-parity.plan.md:285`.

### Suggestions

- **[Observation — accepted override] Test helpers access `normalizeResult.code`
  rather than `normalizeResult.refusal.code`.** Occurrences:
  `tests/unit/internal-economics/v2/waterfall-deal-by-deal-v2.test.ts:97`,
  `tests/unit/internal-economics/v2/waterfall-deal-by-deal-v2.test.ts:492`, and
  `tests/unit/internal-economics/v2/waterfall-whole-fund-v2.test.ts:93`.
  Test-quality review was explicitly excluded, and requester-provided
  three-project typecheck is clean; no change required.

- **[Environment observation — accepted override] Repository-local checklist
  path is not tracked.** Expected absence of
  `.claude/skills/TRIP-review/checklist.md` was explicitly accepted; review used
  installed canonical criteria at
  `/Users/nikhil/.agents/skills/TRIP-review/checklist.md:1`. No implementation
  defect.

---

## Checklist

- [x] 1. Functional Requirements — passed
- [x] 2. Code Quality — passed
- [x] 3. Architectural Compliance — passed
- [x] 4. Error Handling — passed
- [x] 5. Security — not applicable; deterministic internal calculation path
      introduces no trust boundary
- [x] 6. Performance — passed

---

## Verdict

**APPROVED with observations**

All critical and major approval-gate conditions are met, with no open production
findings. Supplied evidence reports clean lint, clean three-project typecheck,
320 passing internal-economics-v2 tests including 20 new tests, 353 passing
Phoenix truth cases with frozen surfaces unchanged, passing calculation gate,
clean diff check, and zero full-suite failures attributable to this change.
Test-only diagnostic access and absent repository-local checklist remain
recorded as explicitly accepted non-blocking observations.

## Post-merge governance addendum (2026-08-27)

An independent post-merge governance review of squash commit `60af02ff6` (PR
#1433) accepted the financial implementation and failed the aggregate governance
gate. Dispositions, validated through an adversarial Codex pass:

- **Scope of the "clean diff check" claim (RESULTS-006)**: the claim above is
  scoped to the F_2.0.4-owned calculation and release-document surfaces, which
  had no whitespace defect. The full squash diff additionally reported seven
  `git diff --check` hits that are intentional CommonMark two-space hard line
  breaks inside imported historical plan documents; they are preserved, not
  "fixed", because stripping them changes Markdown rendering.
- **Aggregate is not CLEAN under F_2.0.4 governance (GOV-001)**: the merged
  delta carried ride-along surfaces beyond the plan's scope — CI-gate repairs,
  Dockerfile CVE mitigation, vendored skills, and historical plan documents
  imported by the branch's base commits. The financial evidence above approves
  only the F_2.0.4 surfaces; each ride-along receives its own decision below.
- **`git ls-files` buffer increase (GOV-001A) — Decision: ACCEPT**:
  `rebuild-knowledge-graph` uses `git ls-files -z`; the client guard and docs
  regression retain newline-delimited `git ls-files`; the surface-contract test
  uses `git show`. The bounded 64 MiB buffer changes do not alter any
  enumerator's existing delimiter or input universe, and do not suppress Git
  failures.
- **Secret-scan allowlist additions (SECURITY-002) — Decision: ACCEPT for the
  exact historical blobs described below**: the `.mimosa` entry is conjunctively
  scoped to the exact historical commit and content-addressed source-snapshot
  path shape. The stale-branch route-fixture entries additionally require exact
  commits, exact paths, and content-specific line regexes. Redacted history-scan
  evidence classified all 92 `.mimosa` blobs as synthetic tracked-test
  snapshots, while `verify-secret-scanner-negative-control.mjs` retains the
  negative control that requires a generated known secret to be detected.
- **Railway identifiers in an imported historical plan (SECURITY-005)**:
  remediated at HEAD — literal project/environment/service/deployment UUIDs in
  `F_1.2.5_g3-closeout-reconciled.plan.md` are replaced with semantic
  placeholders. Identifiers are not credentials (provider access still requires
  authenticated Railway account/token), and git history retains the original
  bytes; complete historical removal would require ref rewriting plus GitHub
  support and is disproportionate for non-credential identifiers — owner-gated
  if ever desired.
- **Vendored Neon skill update workflow (SECURITY-004, 2026-08-27)**:
  updates are explicit and pinned. Folder hashes are enforced by
  `scripts/verify-vendored-skills.mjs`; pre-push invokes it for vendored-skill
  or lock changes, with unit coverage for verification and atomic writer
  behavior.
- **Dockerfile targeted `apk upgrade` (GOV-003)**: recorded as a trigger-bound
  reproducibility exception. Verified at review time that no patched
  `node:22.23.2-alpine` digest exists (fresh pull resolves the same digest
  shipping libssl3/libcrypto3 3.5.7-r0) and exact APK pins break builds when
  Alpine rotates packages out of the v3.24 repository. The expiry action is
  replacement with a patched pinned base digest when upstream publishes one;
  that upstream publication is the review trigger.
- **PR-history residue assessment (SECURITY-002)**: intermediate branch commit
  `c20bbbd69b6fb7c5409b3e72d59264ea55a418f7` tracked 10,008 `.mimosa/`
  hook-state files (~92 MB) plus Codex session state in
  `076eaa2320805af4b25d394704cf4c4b932b89e4`. Neither commit is an ancestor of
  `main`; the remote feature branch is deleted, so the commits remain reachable
  only through GitHub PR refs (`refs/pull/1433/*`) and by direct SHA. Content
  classification: every gitleaks-flagged blob (92) is a content-addressed
  snapshot of tracked repository test sources containing synthetic fixtures; the
  range-wide redacted scan found no leaks. No credential rotation is indicated.
  History rewriting of PR refs would require GitHub support and is owner-gated.
- **Missing engine regression (finding 7)**: added — the whole-fund pari-passu
  nonzero-opening-preferred-paid defensive throw now has a direct engine test.
- **Promotion (PROMOTION-007)**: no operational-completion claim is made here;
  merge remains source admission only under the governing policy.
