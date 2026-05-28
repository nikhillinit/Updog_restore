---
status: ACTIVE
last_updated: 2026-05-27
owner: Core Team
review_cadence: P30D
categories: [governance, refactor, strategy]
keywords: [refactor, cleanup, tooling, governance, roadmap]
source_of_truth: true
related:
  - docs/reviews/refactor-audit-2026-05-19/README.md
---

# Updog_restore Refactoring Plan - Best Approach for a Solo/Internal Build

## POVC Fund-Modeling Platform - Evidence-Gated Cleanup, Tooling Simplification, and Domain-Safe Refactoring

**Report date:** 2026-05-18 **Codebase verification update:** 2026-05-27
**Repository:** `nikhillinit/Updog_restore` **Context:** Solo developer building
an internal fund-modeling tool **Purpose:** Merge the latest solo/internal plan
with the attached synthesis into the most practical execution approach.

**Canonical status:** This document is the active refactor roadmap. The raw
audit reports under `docs/reviews/refactor-audit-2026-05-19/` are evidence, not
competing execution plans.

---

## Current Active Next Step

As of 2026-05-27:

1. Execute from current `main`. A 2026-05-27 local/GitHub check found no local
   branch, remote head, worktree, or PR named `codex/refactor-plan-execution`,
   so do not block on that branch unless it is independently rediscovered.
2. Treat middleware logging slice 0d as closed at
   `df2b22fc refactor(middleware): preserve diagnostics as structured logs`. A
   post-0d scan found 0 `console.*` matches in `server/middleware/`.
3. Treat Batch 0 as closed at
   `bf2d3d1d Keep cleanup sequencing tied to live repo evidence`; the manifest
   refresh is now tied to current live repo evidence after 0e.
4. Treat Batch 1 as closed as a no-op evidence refresh on 2026-05-27:
   `git ls-files 'docs/phase0-runner*.txt'` and `git ls-files 'archive/**'`
   returned empty, root `archive/` was absent, and no local
   `docs/phase0-runner*.txt` files existed. The manifest already records this
   state, so no manifest edit is needed.
5. Treat Batch 2 as closed as a no-op evidence refresh on 2026-05-27:
   `git ls-files 'docs/references/attached_assets/**'` returned empty, local
   `docs/references/attached_assets/` was absent, and the reference scan found
   only governance/audit references that do not require asset restoration.
6. Treat Batch 3 as closed as a no-op evidence refresh on 2026-05-27:
   `git ls-files 'docs/archive/**'` returned empty, five local files under
   `docs/archive/2025-q4/` remain ignored-only, and reference classification
   found historical/planning, governance/tooling, or Phoenix-protected
   references rather than active docs requiring tracked archive restoration.
7. Treat Batch 4 as closed on 2026-05-27: the root route-story mirror
   `src/core/routes/ia.ts` had no active runtime owner, the two route-story
   tests now assert active client/runtime route behavior directly, and this
   closeout removes the only root `src/**` tracked file.
8. Treat Batch 5 as closed on 2026-05-27: runtime references still require
   keeping the XState modeling-wizard machine, and focused wizard tests now lock
   initial state, step order, NEXT/BACK/GOTO navigation, optional-step skipping,
   context preservation, submit `createdFundId` capture, persistence success,
   quota/security failure paths, and the legacy UI quarantine relationship.
9. Treat Batch 6 as closed as a no-op evidence refresh on 2026-05-27:
   `git ls-files 'repo/**'` returned empty, root `repo/` was absent, and live
   `repo/` / BMAD scans found no references presenting the removed local copy as
   current. Matches classified as governance, historical/audit, active BMAD
   tooling, test path literals, ignore guards, or generic GitHub placeholders.
10. Treat Batch 7 as closed on 2026-05-27: `packages/**` still had 122 tracked
    files, no package directories were deleted, and exact local package
    references were removed from app tsconfigs, root script entrypoints,
    CODEOWNERS, and app lint validation.
11. Treat Batch 8 as closed on 2026-05-27: the pre-deletion package count was
    122 tracked files, live app/script/test/workflow/root-config scans found no
    active dependency on the five local package directories, and the stale
    package-backed source under `packages/**` was deleted. Remaining package
    references classify as governance closeout evidence, historical/audit
    records, package-free script wording, or generic dependency/package wording.
12. The next separate cleanup slice is Batch 9, classifying and retiring stale
    wave/phase/package-only scripts. Do not start it together with route logging
    migration, deal-pipeline extraction, product-code refactors, Phoenix docs,
    or unrelated config cleanup.

Update this section whenever the active next step changes. This is the only
"what to do right now" pointer in the document.

---

## 1. Decision Summary

Use the **latest v2.2 solo/internal plan as the execution base**, but adopt the
attached synthesis’s clearer milestone structure, outcome KPIs, quality
ratchets, and churn budget.

The attachment is directionally strong: it captures the shared model consensus
that an evidence-gated plan is safer than a big-bang refactor; it correctly
emphasizes DX/tooling cleanup before cosmetics; and it adds measurable controls
so the project does not merely preserve a bad baseline. The verified repository
state changes the execution details in several important ways:

1. `docs/references/attached_assets/` has been removed from tracked `HEAD` after
   reference classification found no active product/runtime dependency outside
   cleanup and audit docs.
2. `docs/phase0-runner*.txt` and root `archive/` are already absent, so they are
   no longer deletion work.
3. Root `src/` is no longer a tracked app surface after Batch 4: the stale
   `src/core/routes/ia.ts` route-story mirror was test-only metadata and the
   route-story tests now assert active client/runtime route behavior directly.
4. `client/src/machines/modeling-wizard.machine.ts` is active, imported at
   runtime by `useModelingWizard` and the opt-in legacy `ModelingWizard`
   compatibility UI, type-imported by `WizardShell`, and covered by focused
   machine/persistence/legacy wizard tests. It is not a safe deletion candidate.
5. `.husky/pre-push` still delegates to `scripts/pre-push.mjs`; deletion
   requires a replacement script or direct command first.
6. No committed `.env.test` exists; `.env.test.local` exists. Adding `.env.test`
   is future work, not current state.
7. The first route-refactor safety slice is already visible on current `main`:
   deal-pipeline endpoint contracts, expanded route-surface inventory, and a
   deal-pipeline idempotency middleware registration fix. The next product-code
   slice is service extraction behind those tests, not another audit-only pass.

The best approach is therefore a **solo-friendly cleanup ladder**:

1. Capture baseline and cleanup manifest.
2. Remove or externalize obvious repo drag that is actually unused.
3. Simplify scripts, hooks, CI, env files, and config against the current
   90-script / 19-workflow baseline captured in the cleanup manifest.
4. Fill gaps in the existing fragmented truth/golden test surface.
5. Refactor product architecture behind those tests.
6. Leave cosmetic renames and broad directory reshuffles until last.

---

## 1b. Verified Tech Debt Baseline (2026-05-27)

A codebase-wide tech debt audit was performed on 2026-05-27. The raw audit
overstated several metrics; this section records the verified numbers that
govern remediation targets. The logging baseline below was recomputed after the
0d middleware logging commit, so it distinguishes completed middleware work from
remaining non-middleware console debt. Regenerate with the commands in the right
column.

### 0e Verification Evidence

Post-0d commands run from current `main` on 2026-05-27:

- `rg -n "console\." server/middleware --glob "*.ts"` exited 1 with 0 matches
  across 0 files.
- `rg -n "console\." server/routes --glob "*.ts"` found 165 matches across 27
  files.
- `rg -n "console\." server --glob "*.ts"` found 399 matches across 72 files.
- `npm run guard:console:check` passed: 15 disallowed calls, all `console.log`,
  against the 39-call baseline.
- `git diff --check` passed.

### Verified Counts

| Metric                                   | Verified Value                                                                                         | Regenerate Command                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Console ratchet (disallowed prod calls)  | 15 current (`console.log` only) against a 39-call baseline; `console.error`/`console.warn` are allowed | `npm run guard:console:check`                          |
| Total server console calls (all methods) | 399 across 72 files                                                                                    | `rg -n "console\." server --glob "*.ts"`               |
| Console calls in `server/middleware/`    | 0 across 0 files after 0d; `rg` exits 1 because there are no matches                                   | `rg -n "console\." server/middleware --glob "*.ts"`    |
| Console calls in `server/routes/`        | 165 across 27 files                                                                                    | `rg -n "console\." server/routes --glob "*.ts"`        |
| Route files (total)                      | 75                                                                                                     | `find server/routes -name '*.ts' \| wc -l`             |
| Routes importing `db`/`storage` directly | 25 files                                                                                               | grep for `from.*\b(db\|storage)\b` in `server/routes/` |
| Routes importing services                | 30 files                                                                                               | grep for `from.*service` in `server/routes/`           |
| Quarantined test files                   | 36 total: 33 documented, 3 undocumented                                                                | `tests/quarantine/REPORT.md` (generated 2026-05-11)    |
| Skip/todo occurrences in tests           | 113 across 61 files                                                                                    | grep for `\.skip\|\.todo\|xdescribe\|xit` in `tests/`  |
| Component test files                     | 48 in `tests/unit/components/`                                                                         | `ls tests/unit/components/**/*.test.*`                 |
| Hook test files                          | 17 in `tests/unit/hooks/`                                                                              | `ls tests/unit/hooks/**/*.test.*`                      |
| Page test files                          | 26 in `tests/unit/pages/`                                                                              | `ls tests/unit/pages/**/*.test.*`                      |
| API test files                           | 11 in `tests/api/` + 5 in `tests/unit/api/`                                                            | `ls tests/api/*.test.* tests/unit/api/*.test.*`        |
| ESLint `no-explicit-any`                 | warn (400+ pre-existing; exact count in ESLint JSON baseline)                                          | `npx eslint . --format json`                           |
| Client TS strictness                     | `noUncheckedIndexedAccess: false` in `tsconfig.client.json`                                            | inspect `tsconfig.client.json`                         |

### Corrections to Raw Audit

The raw tech debt audit (2026-05-27) contained several overstated or stale
claims. These corrections are authoritative:

1. **Component test coverage is not 0.6%.** The audit counted only 2 test files
   in `client/src/components/__tests__/` and missed the 48 component test files
   in `tests/unit/components/`, 17 hook tests in `tests/unit/hooks/`, and 26
   page tests in `tests/unit/pages/`. Total client-side test files: ~91.
   Coverage is uneven but substantially better than "F grade."

2. **Route test coverage is not 1.5%.** The audit counted only 1 test directory
   (`server/routes/__tests__/`) and missed 11 API tests in `tests/api/`, 5 unit
   API tests in `tests/unit/api/`, plus integration tests for LP reporting, SSE,
   sensitivity routes, route-error contracts, and route-surface inventory.
   Coverage is incomplete but not near-zero.

3. **Console debt is 39 disallowed calls, not all-method server matches.** The
   ratchet (`.baselines/console-prod-baseline.json`) tracks only `console.log`,
   `console.debug`, `console.info`, `console.table`, `console.group`, and
   `console.groupEnd`. The current ratchet reports 15 `console.log` calls
   against a 39-call baseline. The 399 all-method server matches include
   `console.error` and `console.warn`, which are **allowed** by the ratchet and
   ESLint config. Replacing `console.error`/`console.warn` with Pino is
   observability work; 0d closed that work for middleware, while route-layer
   migration remains open.

4. **Skipped tests: use quarantine report numbers.** The audit claimed 67+ skips
   across 43 files. The quarantine report shows 36 quarantined files (33
   documented, 3 undocumented). A broader grep finds 113 skip/todo occurrences
   across 61 files, which includes test helpers and markdown.

5. **The 3 undocumented quarantines are identified:**
   `tests/integration/phase0-migrated-postgres.test.ts`,
   `tests/integration/lp-reporting-metric-run.test.ts`,
   `tests/integration/lp-reporting-foundation-migration.test.ts`.

### Route/Service Boundary Snapshot

Of 75 route files: 25 import `db` or `storage` directly, 30 import services.
Some routes use both, meaning business logic and persistence are mixed in the
route handler. With middleware at 0 `console.*` matches after 0d, routes are the
primary remaining logging migration surface. Top console-heavy routes (calls per
file): `portfolio-intelligence.ts` (17), `lp-api.ts` (15),
`v1/reserve-approvals.ts` (15), `deal-pipeline.ts` (14), `variance.ts` (14),
`fund-config.ts` (10), `cashflow.ts` (10).

### Large Files (Verified Line Counts)

These files are confirmed large and candidates for splitting behind tests:

| File                                                      | Lines  | Core Issue                                               |
| --------------------------------------------------------- | ------ | -------------------------------------------------------- |
| `shared/schema.ts`                                        | ~2,654 | Barrel re-export defeats module splitting                |
| `client/src/pages/variance-tracking.tsx`                  | ~2,339 | 5+ features in one component                             |
| `client/src/pages/fund-model-results.tsx`                 | ~1,951 | 5+ state machines, complex nesting                       |
| `client/src/components/portfolio/tabs/AllocationsTab.tsx` | ~1,853 | Allocation + scenario + IC packets                       |
| `client/src/pages/lp-reporting/metrics.tsx`               | ~1,796 | 17 types, 40+ imports                                    |
| `server/services/demo-profile-import-service.ts`          | ~1,649 | 18 exports, no abstraction layers                        |
| `server/routes/lp-api.ts`                                 | ~1,263 | Routes + validation + business logic                     |
| `server/services/reserve-optimization-calculator.ts`      | ~1,170 | Parallel to DeterministicReserveEngine                   |
| `client/src/stores/fundStore.ts`                          | ~1,022 | Vanilla store alongside React/Zustand hook store         |
| `server/services/variance-alert-automation.ts`            | ~971   | Near-threshold service that reimplements timeout utility |

---

## 2. Why This Approach Wins

### What the attachment does better

The attachment is easier to execute because it presents the plan as milestones
rather than long-form phases. It also makes three controls explicit:

- **Outcome KPIs**: fewer scripts, fewer workflows, fewer configs, zero
  undocumented quarantines, golden tests before semantic refactors.
- **Quality ratchets**: changed-file lint immediately, global lint reduction
  after tooling cleanup, no new undocumented quarantines, and no new wave/phase
  scripts beyond the committed alias-policy baseline.
- **Churn budget**: limit broad moves/renames so rollback and debugging stay
  manageable.

These should remain in the final plan.

### What the latest v2.2 plan does better

The latest plan fixes important execution hazards that the attachment either
omits or under-specifies:

- It adds `docs/references/attached_assets/` to the cleanup manifest and
  Phase 1. That item is now closed on 2026-05-22 after reference classification
  and deletion.
- It calls out the XState modeling wizard machine as a high-risk migration
  surface. Verification shows it is active, so this plan now treats it as
  keep-and-migrate-later rather than delete-now.
- It identifies `scripts/pre-push.mjs` as automation debt. Verification shows it
  is active, so this plan now requires a replacement command before deletion.
- It identifies deterministic test env files as a gap. Verification shows
  `.env.test` is absent and `.env.test.local` exists.
- It avoids committed quarantine directories and prefers deletion with git tags.
- It treats `shared/money.ts` and `shared/lib/money.ts` as distinct semantics,
  not simple duplicates.
- It keeps schema renaming compatibility-first.
- It avoids unsupported Vitest tag filtering unless the repo is intentionally
  upgraded and verified.
- It preserves route URLs during route mounting cleanup.

These should also remain.

---

## 3. Guiding Principles

1. **No zero-risk language unless proven.** Reference scans are evidence, not
   proof. Pair scans with build/test validation.
2. **Use Git history as the archive.** Do not keep dated snapshots, generated
   logs, or stale external projects in the working tree.
3. **Prefer deletion with rollback tags over committed quarantine directories.**
   Local rename validation is fine; committed `_quarantine/` folders are not.
4. **Stabilize local commands before CI rewrites.** CI should call the same
   commands the solo developer runs locally.
5. **Reduce process, not safety.** Because this is solo/internal, avoid
   enterprise ceremony, but keep domain correctness gates.
6. **Separate repo hygiene from product logic.** Logs, archives, and vendored
   tools can move fast; fund-modeling logic cannot.
7. **Do not collapse semantic duplicates prematurely.** Money, allocation,
   reserve, scenario, waterfall, and forecast code may encode distinct
   semantics.
8. **Preserve current runtime contracts.** Route normalization is not an
   `/api/v1` migration.
9. **Defer cosmetics.** Page renames and UI directory reshuffling come after
   tooling and correctness gates.
10. **Ratchet quality after stabilization.** “No worse than baseline” is
    temporary; it is not the destination.

---

## 4. Outcome KPIs

| Area               | Target outcome                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scripts            | Current baseline is 90 root scripts after retiring stale wave5/wave6 aliases and adding the alias-policy guard. Next pass: classify remaining wave/phase/package-only aliases; target <=50 active scripts before pursuing <=30. |
| CI                 | Current baseline is 19 workflow files; `docs/workflows/README.md` may lag this Batch 0 count. Consolidate only after mapping required vs optional checks.                                                                       |
| Hooks              | Current pre-commit is a custom staged guard; current pre-push delegates to `scripts/pre-push.mjs`. Simplify only after replacement commands exist.                                                                              |
| Pre-push script    | Keep `scripts/pre-push.mjs` until a direct hook command or `validate:quick` equivalent is added and verified.                                                                                                                   |
| Vitest             | Current unit entry is `vitest.config.mjs`; integration/quarantine/testcontainer configs remain active. Consolidate by migration, not deletion.                                                                                  |
| TypeScript         | Keep active boundary configs, including `tsconfig.shared.json`; delete only unreferenced variants proven by script/extends scans.                                                                                               |
| Env files          | No committed `.env.test` exists. Add one only with safe deterministic values and verified loader behavior; production secrets stay out of Git.                                                                                  |
| Archives/logs      | `docs/phase0-runner*.txt`, root `archive/`, and tracked `docs/archive/**` are already absent; local ignored `docs/archive/2025-q4/` files stay ignored-only and banned from tracked HEAD.                                       |
| Binary docs assets | `docs/references/attached_assets/` has 0 tracked files; restore specific assets from git history only if a future active reference requires them.                                                                               |
| Packages           | Batch 7 removed app tsconfig/script/config coupling to local packages while leaving `packages/**` intact at 122 tracked files. Batch 8 decides delete vs externalize.                                                           |
| Quarantine         | Zero undocumented quarantines; every quarantine has TTL, reason, and exit condition. Current: 3 undocumented (see Section 1b).                                                                                                  |
| Financial logic    | Existing truth/parity tests are fragmented across domains; fill missing coverage before semantic refactors.                                                                                                                     |
| Route boundaries   | No new route files importing `db` or `storage` directly. Current: 25 of 75 route files import persistence directly; target reduction behind contract tests.                                                                     |
| Type safety        | No new `any` or unsafe TypeScript usage in changed files. Promote `no-explicit-any` to `error` by directory after batch cleanup. Current: warn (400+ pre-existing).                                                             |
| Console (allowed)  | Middleware 0d is complete: 0 `console.*` matches in `server/middleware/`. Remaining route-layer logging debt is 165 calls across 27 files. This is observability improvement, not ratchet work.                                 |
| Client test debt   | Run actual coverage report before setting numeric targets. Current inventory: 48 component + 17 hook + 26 page test files; coverage is uneven, not near-zero.                                                                   |

---

## 5. Quality Ratchets

| Ratchet           |                      Starts | Rule                                                                                                             |
| ----------------- | --------------------------: | ---------------------------------------------------------------------------------------------------------------- |
| Changed-file lint |                 Immediately | No new ESLint violations in changed files.                                                                       |
| Global lint debt  | After script/config cleanup | Reduce total lint baseline by at least 5% per cleanup cycle, or record why product work took priority.           |
| `eslint-disable`  |                 Immediately | No new `eslint-disable` without a reason comment.                                                                |
| `console.*`       |                 Immediately | No new production console usage except through logger/debug utility.                                             |
| Test quarantine   |                 Immediately | No new quarantine without reason, TTL, and exit condition.                                                       |
| Config aliases    |  After Vitest consolidation | No copy-pasted alias blocks; configs import shared aliases.                                                      |
| Scripts           |                 Immediately | No new wave/phase/slice script names beyond `.baselines/script-alias-policy.json`.                               |
| Route imports     |                 Immediately | No new route files importing `db` or `storage` directly. Existing 25 files are grandfathered.                    |
| `any` types       |                 Immediately | No new `any`/unsafe usage in changed files. Promote to `error` by directory after batch cleanup.                 |
| TODOs             |                 Immediately | No new TODO/FIXME/HACK without inline reason + owner/date, or an entry in `docs/governance/cleanup-manifest.md`. |

---

## 6. Churn Budget for a Solo Developer

Default limits per commit/batch:

- ≤50 pure file moves/renames;
- ≤20 product-code files touched;
- ≤1 config family per batch;
- no product-code refactor in the same commit as broad renames;
- codemod required for broad import rewrites;
- commit message names validation commands run.

Exceptions are allowed for obvious deletion-only batches, such as generated logs
or dated archive snapshots, once scans are clean.

---

## 6b. WIP Rule and Replanning Trigger

- At most one in-progress milestone outside Milestone 0 baselining at any time.
- If any milestone exceeds 2x its capacity estimate, halt and re-scope before
  continuing. Record the re-scope rationale in this section.
- When re-scoping, re-run the verification commands from Section 1b to confirm
  baseline numbers have not drifted.

---

## 6c. Risk Register

| Risk                         | Failure Mode                                                      | Mitigation                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Fund math regression         | Refactor changes TVPI/DPI/RVPI, carry, reserve, or cents behavior | Golden snapshots + invariant tests (Milestone 5)                                                                                               |
| Route compatibility break    | Mount cleanup changes public URLs                                 | Route-surface inventory + contract tests before extraction                                                                                     |
| Logging regression           | Pino migration leaks sensitive data or drops request IDs          | Pino redaction policy + structured log assertion in tests                                                                                      |
| Test quarantine rot          | Quarantines become permanent skip-and-forget                      | TTL enforcement; quarantine report fails on undocumented or expired entries                                                                    |
| Tooling simplification break | Hook/CI deletion removes real guardrail                           | Replacement command must pass before deletion                                                                                                  |
| Schema rename churn          | Import rewrites break Drizzle/tests                               | Compatibility barrels + batch codemod; never mix renames with semantic changes                                                                 |
| Hermes scaffolding loss      | Milestone 2 package cleanup deletes active Hermes assets          | Protect `AGENTS.md`, `DEV_BRAIN.md`, `.claude/hermes/`, `orchestrate.js`, and `tests/unit/routing/hermes-routing.test.ts` from package cleanup |

---

## 6d. Golden Test Tolerances Policy

Commit this table before authoring golden snapshots in Milestone 5. Each metric
class has a fixed tolerance; test authors may not choose ad-hoc values.

| Metric Class                            | Tolerance                              | Rationale                                                                              |
| --------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| Money (cents, capital, proceeds, carry) | Exact equality                         | Ledger conservation; rounding errors compound                                          |
| TVPI, DPI, RVPI                         | Exact equality                         | Ratio of exact money values                                                            |
| IRR / XIRR                              | abs(a - b) < 1e-8                      | Brent/Newton solver convergence; 1e-8 is well within solver precision                  |
| NAV / FMV                               | Exact equality                         | Point-in-time valuation snapshot                                                       |
| Allocation percentages                  | abs(a - b) < 1e-10                     | Floating-point arithmetic on allocation splits                                         |
| Monte Carlo outputs                     | Statistical bounds, not point equality | Seed-deterministic fixtures use exact equality; unseeded runs use confidence intervals |

Core invariants to test separately from snapshots:

- `TVPI = DPI + RVPI` (exact)
- Capital conservation:
  `total_deployed + remaining_capital = investable_capital`
- No future exits beyond fund end date
- Graduation + exit <= 100% per stage
- Waterfall: `LP_proceeds + GP_carry + GP_management_fees = total_distributions`

These tolerances are derived from the solver implementations in
`shared/lib/finance/xirr.ts` and `shared/lib/finance/brent-solver.ts`.

---

# Closed Items (as of 2026-05-27)

These items are resolved and no longer in the active work queue. They remain
documented as guards against recurrence.

| Item                               | Status                                                          | Future Rule                                                         |
| ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `docs/references/attached_assets/` | DONE -- 0 tracked files                                         | Restore individual assets only if an active reference requires them |
| `docs/phase0-runner*.txt`          | DONE -- already absent                                          | Add targeted `.gitignore` if recurrence is observed                 |
| Root `archive/`                    | DONE -- already absent                                          | Do not reintroduce as tracked directory                             |
| Local `repo/` folder               | DONE -- already removed/untracked; Batch 6 no-op refresh closed | Clean stale doc refs only if newly introduced                       |
| Root `ai/` pipeline                | DONE -- 24 files deleted                                        | Evidence in git history and cleanup manifest                        |
| Root `ADR/` stubs                  | DONE -- deleted                                                 | `docs/adr/` is the maintained ADR collection                        |

---

# Milestone 0 — Baseline and Cleanup Manifest

**Capacity:** S (1 commit) **Risk:** none **Goal:** establish a
no-worse-than-baseline checkpoint and classify every cleanup candidate before
changing files.

## 0.1 Capture baseline

```bash
git checkout -b refactor/baseline-capture
mkdir -p .audit

git ls-files > .audit/git-files.before.txt
node --version > .audit/node-version.txt
npm --version > .audit/npm-version.txt
npm ci 2>&1 | tee .audit/npm-ci.log

for cmd in \
  "npm run doctor:quick" \
  "npm run check" \
  "npm run build:prod" \
  "npm run test:unit" \
  "npm run test:integration" \
  "npm run lint:eslint"
do
  safe_name=$(echo "$cmd" | tr ' /:' '___')
  echo ">>> $cmd"
  bash -lc "$cmd" 2>&1 | tee ".audit/${safe_name}.log"
  echo "${PIPESTATUS[0]}" > ".audit/${safe_name}.exit"
done

npx eslint . --format json --output-file .audit/eslint-baseline.json || true
```

If commands currently fail, that is acceptable. Future batches must not make
them worse unless the batch explicitly replaces that command.

## 0.2 Run reference scans

```bash
# Root src references
git grep -nE '(^|[^A-Za-z0-9_])(src/|\./src|\.\./src|/src/)' -- \
  ':!src/**' ':!node_modules/**' ':!dist/**' ':!coverage/**' \
  > .audit/refs-root-src.txt || true

# Archive references
git grep -nE 'archive/|docs/archive' -- \
  ':!archive/**' ':!docs/archive/**' ':!node_modules/**' ':!dist/**' ':!coverage/**' \
  > .audit/refs-archive.txt || true

# Generated docs logs
git grep -nE 'phase0-runner' -- \
  ':!docs/phase0-runner*' ':!node_modules/**' ':!dist/**' ':!coverage/**' \
  > .audit/refs-text-dumps.txt || true

# Large binary/reference asset references
git grep -nE 'docs/references/attached_assets|references/attached_assets|attached_assets/' -- \
  ':!docs/references/attached_assets/**' ':!node_modules/**' ':!dist/**' ':!coverage/**' \
  > .audit/refs-attached-assets.txt || true

# XState modeling wizard references
git grep -nE 'modeling-wizard\.machine|modelingWizardMachine|@/machines/modeling-wizard\.machine|../machines/modeling-wizard\.machine' -- \
  ':!client/src/machines/modeling-wizard.machine.ts' ':!node_modules/**' ':!dist/**' ':!coverage/**' \
  > .audit/refs-modeling-wizard-machine.txt || true

# Vendored repo/BMAD references
git grep -nE 'repo/|BMAD-METHOD|bmad-method' -- \
  ':!repo/**' ':!node_modules/**' ':!dist/**' ':!coverage/**' \
  > .audit/refs-repo.txt || true

# Package/tooling coupling references
git grep -nE 'packages/(agent-core|codex-review-agent|test-repair-agent|bundle-optimization-agent|memory-manager)|@povc/agent-core' -- \
  ':!packages/**' ':!node_modules/**' ':!dist/**' ':!coverage/**' \
  > .audit/refs-packages.txt || true

# Config references
git grep -nE 'vitest\.config\.mjs|vitest\.config\.route-int|vitest\.config\.phase0-dbproof|vitest\.config\.testcontainers|tsconfig\.fast|tsconfig\.strict|tsconfig\.schema-helpers' -- \
  package.json .github/workflows scripts client server shared tests \
  > .audit/refs-configs.txt || true
```

## 0.3 Maintain `cleanup-manifest.md`

The refreshed cleanup candidate register lives at
`docs/governance/cleanup-manifest.md`. Treat that file as the current manifest
for cleanup classifications, evidence, validation, and rollback notes.

Refresh the manifest whenever a cleanup batch changes candidate counts,
references, classifications, or validation commands.

---

# Milestone 1 — Fast Hygiene with Git Rollback

**Capacity:** M (1-3 commits) **Risk:** low **Goal:** remove obvious repository
drag without touching production logic.

## 1.1 Confirm generated docs logs stay absent

Targets:

- `docs/phase0-runner*.txt`
- similar raw execution logs proven generated

Verified state: `docs/phase0-runner*.txt` is already absent. Do not create a
deletion commit for an empty candidate. Keep this as a guard against recurrence.

Add targeted ignores only:

```gitignore
# docs/.gitignore
phase0-runner*.txt
*.log
*.trace
```

Do not ignore all `*.txt` files.

## 1.2 Externalize or delete large reference assets

Target:

- `docs/references/attached_assets/`

2026-05-22 status: closed. A reference scan excluding the asset directory found
only cleanup/governance/audit references, so the tracked asset directory was
deleted. Use the decision rule below only if future work proposes restoring a
specific asset.

Decision rule:

| Condition                               | Action                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| Asset is not referenced by app/docs     | Delete; Git history is enough.                                                                |
| Asset is useful documentation/reference | Move to Git LFS, private object storage, or docs CDN; replace with small Markdown index/link. |
| Asset is rendered by app                | Keep only if necessary, under app/public assets with explicit size budget.                    |
| Asset is screenshot/audit artifact      | Delete or externalize.                                                                        |

Validation:

```bash
git tag pre-attached-assets-cleanup-2026-05-18
# update links if references are docs-only
npm run check
npm run build:prod
```

Manual check: open any docs pages that referenced assets and confirm
links/images resolve.

## 1.3 Curate remaining archive snapshots

Targets after review:

- root `archive/` is already absent;
- tracked `docs/archive/**` is absent from HEAD;
- local ignored `docs/archive/2025-q4/` remains with five
  baselines/default-parameter/legacy-XIRR files.

Rules:

- Keep at most one small `docs/history/` or `docs/decisions/` folder for durable
  product decisions.
- Do not keep historical source snapshots in the repo.
- Chat transcripts should not remain in source unless sanitized and concretely
  useful.
- Do not restore ignored local archive files to tracked HEAD unless a future
  active product or docs reference proves a narrow exception.
- 2026-05-27 Batch 3 closeout: active reference classification did not find any
  tracked docs/code path requiring `docs/archive/**` restoration. Historical
  source references remain recoverable from git history, while Phoenix-specific
  references require specialist sign-off before any direct edits.

Validation:

```bash
git tag pre-archive-cleanup-2026-05-18
npm run check
npm run build:prod
```

## 1.4 Validate root `src/` route mirror before any deletion

Batch 4 closeout: root `src/` no longer contains tracked route-story mirror
code. A 2026-05-27 scan found `src/core/routes/ia.ts` had no active runtime
owner; only two route-story tests imported it to compare active metadata against
stale `/model` metadata. Those tests now assert active client metadata and the
active runtime redirect map directly, so this closeout removes the only root
`src/**` tracked file.

```bash
git grep -nE 'src/core/routes/ia|../../../src/core/routes/ia|@/core/routes/ia' -- \
  src client tests package.json tsconfig*.json vite.config.ts vitest.config* || true

# Only after refs are migrated:
npm run check
npm run build:prod
npm run test:unit
```

Future route metadata should live under the active client/runtime route owners
unless a new root `src/**` entry point has an explicit owner.

## 1.5 Inventory the active XState wizard machine

Target:

- `client/src/machines/modeling-wizard.machine.ts`

Batch 5 closeout: this machine remains active and intentional. It is imported at
runtime by `client/src/hooks/useModelingWizard.ts`, reached through the opt-in
legacy compatibility UI in
`client/src/components/modeling-wizard/ModelingWizard.tsx`, type-imported by
`client/src/components/modeling-wizard/WizardShell.tsx`, and covered by focused
machine/persistence/legacy wizard tests. Treat deletion as a future product
migration, not a cleanup task.

Decision rule:

| Reference pattern                    | Action                                                               |
| ------------------------------------ | -------------------------------------------------------------------- |
| Runtime references remain            | Keep machine; add tests before changing submit/persistence behavior. |
| Test-only references after migration | Rewrite or delete tests only after replacement flow is validated.    |
| No references                        | Delete machine; delete `client/src/machines/` if empty.              |

Validation:

```bash
git tag pre-xstate-machine-migration-2026-05-18
npm test -- --run tests/unit/machines/modeling-wizard-fundid.test.tsx tests/unit/machines/modeling-wizard-submit-transport.test.tsx tests/unit/machines/modeling-wizard-machine-behavior.test.tsx tests/unit/modeling-wizard-persistence.test.tsx tests/unit/components/modeling-wizard-legacy.test.tsx --project=client
npm run check
npm run lint
npm run build:prod
npm run test:e2e:smoke
```

Manual smoke:

- Start fund setup.
- Navigate all wizard steps.
- Save/publish a draft or run nearest persistence flow.

## 1.6 Record `repo/` removal

Verified state: `repo/` has been removed from the working tree and has no
tracked files (`git ls-files 'repo/**'` returned 0). The 2026-05-27 Batch 6
refresh also confirmed root `repo/` is absent.

Reference classification from the Batch 6 refresh:

- Governance references remain in this roadmap and `cleanup-manifest.md`.
- Historical/audit references remain in capability, ADR, security, and refactor
  audit docs.
- Active BMAD references belong to current automation/process docs and
  `scripts/ai-tools/**`.
- `repo/**` ignore entries remain tooling guards while recurrence risk exists.
- `/repo/...` references in Hermes tests/plans are path-literal fixtures.
- `:owner/:repo` and `your-repo` references are generic GitHub placeholders.

No non-governance edit was needed because no match still described `repo/` /
`repo/BMAD-METHOD` as a current local tracked project.

Follow-up only if touching related docs:

1. Replace live-looking `repo/...` references with historical wording or an
   external source pointer.
2. Keep app tooling ignores for `repo/**` until the team is confident the local
   scratch/external-project folder will not recur.
3. Run docs link checks if links are edited.

## 1.7 Consolidate ADRs and durable docs

- Root `/ADR/` has two short ADR files; `docs/adr/` already has `README.md` and
  the maintained standalone ADR collection.
- Move or cross-link root ADRs only after checking references.
- Keep the `DECISIONS.md` vs `docs/adr/` numbering caveat from `docs/INDEX.md`
  and `.claude/DISCOVERY-MAP.md`; do not renumber.

## 1.8 Inventory stale one-file dot directories

Candidates: `.backup/`, `.a5c/`, `.zap/`, `.zencoder/`, `PATCHES/`, `.omx/`.

Do not blanket-delete these. `.omx` is runtime/tooling state, `.a5c` is
babysitter profile state, and `.zap` is tied to the ZAP workflow. Inventory
tracked files and remove only proven stale leaf artifacts.

---

## Milestone 1 Exit Criteria

Milestone 1 is complete when:

- [ ] All tracked files under closed candidates (`docs/phase0-runner*.txt`,
      `docs/references/attached_assets/`, root `archive/`) remain at 0.
- [x] `docs/archive/2025-q4/` contents are curated as local ignored-only
      artifacts that must not be reintroduced to tracked HEAD without a narrow
      active-reference proof.
- [x] Root `src/core/routes/ia.ts` is either documented as intentional or
      migrated.
- [x] XState wizard machine has behavior tests locking current semantics.
- [ ] `npm run check && npm run build:prod && npm run test:unit` pass.

---

# Milestone 2 — Package and Tooling Boundary

**Capacity:** M (1-3 commits) **Risk:** medium **Goal:** remove the
false-monorepo/tooling coupling without adopting workspaces.

## 2.1 Treat package deadness as a hypothesis

Packages may have no runtime imports but still be referenced by scripts,
tsconfigs, Vitest commands, lint paths, CI, or docs.

Decision rule:

| Condition                                        | Action                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| No runtime refs, but scripts/tsconfig refs exist | Remove refs first, then delete/externalize.                      |
| Actively useful for development                  | Move under `tools/ai-packages/` and exclude from app validation. |
| Not used in next 30 days                         | Delete; Git history is enough.                                   |
| Needs independent evolution                      | Separate repo later, not now.                                    |
| Needs app runtime dependency                     | Only then consider npm workspaces.                               |

## 2.2 Decouple configs and scripts

Remove `packages/*` includes from:

- `client/tsconfig.json`;
- `tsconfig.client.json`;
- package-specific test commands;
- lint scripts such as wave/residual package paths;
- CI jobs.

Validation:

```bash
git grep -nE 'packages/(agent-core|codex-review-agent|test-repair-agent|bundle-optimization-agent|memory-manager)|@povc/agent-core' -- \
  package.json tsconfig*.json client/tsconfig.json .github/workflows scripts tests || true

npm run check
npm run test:unit
npm run build:prod
```

Batch 7 closeout on 2026-05-27:

- Removed the stale app/client coupling to `packages/agent-core` from
  `client/tsconfig.json`, `tsconfig.client.json`, and the unused
  `client/src/ai/ConversationMemory.ts` shim.
- Removed package-specific app validation coupling from `tsconfig.eslint.json`,
  `eslint.config.js`, `.github/CODEOWNERS`, and the logger-order codemod default
  globs.
- Retired broken package-backed root script entrypoints for test repair, bundle
  optimization, Codex review watch, and thinking-migration readiness.
  `scripts/init-memory-manager.ts` now writes package-free session context
  without importing the local memory package.
- Kept active generic package inventory/exclusion behavior such as
  `scripts/sync-capabilities.mjs`, `scripts/type-safety-scanner.js`, and the
  root ESLint `packages/**` ignore; these do not couple app validation to local
  package source.
- Verification: focused command-path proofs, targeted memory-init unit test,
  `npm run check`, `npm run test:unit`, `npm run build:prod`, and `npm run lint`
  all exited 0.

## 2.3 Delete or move packages

Recommended for this build:

1. Delete packages that are not actively used.
2. If unsure, keep a small note in `docs/references/ai-tooling.md`; do not keep
   source code.
3. Avoid `archive/dead-packages/` inside the repo.
4. Do not adopt npm workspaces unless packages become runtime dependencies.

Batch 8 closeout on 2026-05-27:

- Pre-deletion count: `git ls-files 'packages/**' | Measure-Object -Line`
  returned 122 tracked files.
- Package directories present before deletion: `agent-core`,
  `bundle-optimization-agent`, `codex-review-agent`, `memory-manager`, and
  `test-repair-agent`; `packages/bmad-integration` had no tracked package
  directory.
- Package-by-package classification:
  - `packages/agent-core`: no active app runtime, root script, workflow, test,
    tsconfig, or root config dependency; kept only by package-internal refs,
    governance/historical/audit docs, and stale active catalog wording.
  - `packages/bundle-optimization-agent`: no active app/runtime dependency; root
    `npm run ai bundle-optimize` is already a retired stub and current bundle
    evidence uses `scripts/ai-tools/bundle-analyzer.mjs`.
  - `packages/codex-review-agent`: no active root `review:*` scripts or app
    imports remained; setup/migration docs are retained as historical evidence.
  - `packages/memory-manager`: no active package import remained; the active
    `scripts/init-memory-manager.ts` helper writes package-free session context.
  - `packages/test-repair-agent`: no active package import remained; the active
    root repair surfaces are package-free scripts or retired stubs.
- Deleted: all five package directories plus the package-only
  `packages/bundle-optimization-agents.md` routing doc.
- Kept/no-op: no `packages/bmad-integration` directory existed to delete.
- No npm workspaces or committed quarantine/archive package copies were
  introduced.
- Remaining risks: older changelog, capability, ADR, audit, and migration docs
  still contain historical package paths. Treat them as historical records; do
  not broaden cleanup unless a live routing or setup surface points users at
  deleted source.

## 2.4 Consolidate AI tooling after package decision

**Protected Hermes scaffolding**: The following files are part of the active
Hermes multi-agent development framework and must not be deleted or moved during
package cleanup. They are referenced by `CLAUDE.md`, `AGENTS.md`,
`DEV_BRAIN.md`, and active routing/test code:

- `AGENTS.md`, `DEV_BRAIN.md`
- `.claude/hermes/SOUL.md`, `.claude/hermes/model-routing.json`
- `orchestrate.js`
- `tests/unit/routing/hermes-routing.test.ts`

| Current            | Recommended                                                                          |
| ------------------ | ------------------------------------------------------------------------------------ |
| `tools/ai-review/` | keep under `tools/ai/code-review/` if actively used; otherwise delete.               |
| `ai-utils/`        | keep under `tools/ai/utils/` if actively used; otherwise delete.                     |
| `prompts/`         | keep under `tools/ai/prompts/` if actively used.                                     |
| `ai-logs/`         | remove committed generated logs; add to `.gitignore`.                                |
| `.claude/`         | keep only if actively used by developer environment; otherwise reduce to essentials. |

---

## Milestone 2 Exit Criteria

Milestone 2 is complete when:

- [x] `packages/*` references are removed from app tsconfigs, scripts, and CI.
- [ ] Unused packages are deleted (git tag before deletion).
- [ ] Hermes scaffolding files listed in Section 2.4 are verified present.
- [ ] `npm run check && npm run build:prod && npm run test:unit` pass.

---

# Milestone 3 — Scripts, Hooks, CI, Env Files, and Operational Tooling

**Capacity:** L (4-8 commits) **Risk:** medium **Goal:** simplify the commands
and automation the solo developer actually uses.

## 3.1 Canonical script set

Current state: `package.json` has 90 scripts. The stable core surface already
exists, but `test:unit` still points at `vitest.config.mjs`, `pre-push` still
runs `scripts/pre-push.mjs`, and there is no `validate:quick` or `validate:full`
script yet. The script count includes `guard:scripts:check`, which prevents new
legacy wave/phase/slice aliases while the remaining active aliases are retired.

First-pass canonical surface:

```json
{
  "doctor": "node scripts/doctor.mjs",
  "doctor:quick": "node scripts/doctor-quick.mjs",
  "dev": "npx concurrently -k \"npm run dev:client\" \"npm run dev:api\"",
  "dev:client": "npx vite",
  "dev:api": "npx tsx server/main.ts",
  "build": "npm run build:prod",
  "build:web": "npm run clean:spa-dist && npx vite build --mode preact",
  "build:server": "node scripts/build-server.mjs",
  "build:prod": "npm run build:web && npm run build:server",
  "start": "cross-env NODE_ENV=production node dist/index.js",
  "check": "npm run baseline:check",
  "baseline:check": "node scripts/typescript-baseline.cjs check",
  "lint": "npm run lint:eslint && npm run guardrails:check",
  "lint:eslint": "eslint . --max-warnings 0 --cache --cache-location node_modules/.cache/eslint",
  "lint:fix": "eslint . --fix --cache --cache-location node_modules/.cache/eslint",
  "guard:console:check": "node scripts/guardrails/console-ratchet.mjs",
  "guard:eslint-disable:check": "node scripts/guardrails/eslint-disable-ratchet.mjs",
  "guard:scripts:check": "node scripts/guardrails/script-alias-policy.mjs",
  "guardrails:check": "npm run guard:console:check && npm run guard:eslint-disable:check && npm run guard:scripts:check && npm run guard:route-imports:check",
  "test": "npm run test:unit",
  "test:unit": "cross-env TZ=UTC vitest run --config vitest.config.mjs --configLoader native --project=server --project=client",
  "test:integration": "cross-env TZ=UTC vitest run -c vitest.config.int.ts",
  "test:e2e": "playwright test",
  "test:e2e:smoke": "playwright test --project=smoke",
  "validate:core": "npm run baseline:check && npm run test:publish-orchestration && npm run test:phase4 && npm run lint:phase4",
  "db:push": "drizzle-kit push",
  "db:studio": "drizzle-kit studio",
  "pre-push": "node scripts/pre-push.mjs",
  "prepare": "husky install && node scripts/normalize-husky-shims.mjs"
}
```

Future target: add `validate:quick` only if it materially improves the daily
path. Until then, use explicit command chains or the existing `pre-push` /
`validate:core` surfaces. Do not use Vitest tag filtering until the installed
Vitest version and CLI flag support are verified. Use directory/domain scripts
now.

## 3.2 Retire wave/phase scripts

1. Classify the remaining wave/phase scripts by owner: active stabilization
   gates, package cleanup leftovers, or historical aliases.
2. Keep active stabilization gates until their replacement command passes.
3. Replace historical wave/phase scripts with short-lived aliases only if they
   are still used by CI/docs.
4. Delete aliases after one cleanup cycle.
5. Keep the ratchet green: `npm run guard:scripts:check` allows only the
   baseline legacy aliases in `.baselines/script-alias-policy.json`.

## 3.3 Pre-commit hook

Current state: `.husky/pre-commit` performs emoji checks, bigint schema checks,
staged ESLint, staged Prettier, and optional AI review. This is not just
`lint-staged`, so replace it only after preserving the staged guardrails.

Target simplified shape:

```sh
#!/usr/bin/env sh
npx lint-staged
npm run guard:staged
```

`guard:staged` should be fast and domain-specific. Move slow checks to an
explicit command chain or a future `validate:quick` only after that script
exists.

## 3.4 Pre-push hook

Current state: `.husky/pre-push` executes `node scripts/pre-push.mjs "$@"`. Keep
it until the replacement command exists and passes on the same changed-file
cases.

Preferred future shape:

```sh
#!/usr/bin/env sh
if [ "$UPDOG_SKIP_PREPUSH" = "1" ]; then
  exit 0
fi
npm run check
npm run lint
npm run test:unit
```

Optional cleanup after replacement:

```bash
git rm scripts/pre-push.mjs
```

If the hook becomes too slow, delete `.husky/pre-push` entirely and rely on
manual validation plus CI. Do not delete the Node script first.

## 3.5 CI consolidation

Current state: `.github/workflows` has 19 workflow files. Compare them against
`docs/workflows/README.md`; the workflow index may lag this Batch 0 count.

Target after classification:

1. One required core validation workflow on push/PR:
   - checkout;
   - setup Node;
   - `npm ci`;
   - `npm run check`;
   - `npm run lint`;
   - `npm run test:unit`;
   - `npm run build:prod`.

2. Optional/manual workflows only where they own a distinct concern:
   - integration tests;
   - E2E smoke;
   - security scans;
   - bundle check.

Avoid duplicating checks across workflows, but do not collapse
security/docs/testcontainers workflows until their trigger and secret
requirements are mapped.

## 3.6 Env files

Current state: no committed `.env.test` exists; `.env.test.local` exists. Target
committed env surface:

```text
.env.example                 # full variable catalog with comments
.env.development.example     # local development template
.env.test                    # safe canonical test defaults used by local tests and CI
.env.test.example            # optional only if needed for extra documentation
.env.staging.example         # staging/deployment template
.env.production.example      # template only; real production values stay in deployment secrets
```

Rules:

- Add `.env.test` only if test/bootstrap code actually loads it or CI is changed
  to load it.
- Real `.env.production` must not be committed.
- Merge `.env.react`, `.env.preact`, `.env.vercel`, `.env.local.example`, and
  `.env.rls.example` into `.env.example`, `.env.test`, deployment docs, or RLS
  setup docs.

## 3.7 Scripts directory cleanup

Classify `scripts/`:

| Class                                                       | Action                                           |
| ----------------------------------------------------------- | ------------------------------------------------ |
| Reusable commands called by package scripts                 | Keep.                                            |
| Guardrails                                                  | Keep under `scripts/guardrails/`.                |
| Active build/deploy helpers                                 | Keep and document.                               |
| One-off `fix-*`, `apply-*`, `migrate-*` scripts             | Delete after confirming applied.                 |
| Replaced orchestration scripts, e.g. `scripts/pre-push.mjs` | Delete after replacement.                        |
| Unknown                                                     | Keep temporarily; add to manifest; decide later. |

## 3.8 Docker and compose

For a solo internal tool:

- keep `docker-compose.yml` as the default local Postgres/Redis surface;
- classify `docker-compose.dev.yml`, `docker-compose.rls.yml`,
  `docker-compose.observability.yml`, `docker-compose.chaos.yml`,
  `tests/chaos/docker-compose.toxiproxy.yml`, and
  `ml-service/docker-compose.yml` before moving;
- delete duplicate Dockerfiles only after app/deployment/ML-service paths are
  confirmed;
- do not over-invest in perfect Docker profile architecture if local dev already
  works.

## Milestone 3 Exit Criteria

Milestone 3 is complete when:

- [ ] Root package scripts are classified into keep / alias / delete / unknown.
- [ ] Root script count is <= 50, or a written exception exists for each
      remaining alias.
- [ ] No new wave/phase/slice scripts are allowed beyond baseline policy.
- [ ] Pre-push either still delegates to existing script or has a verified
      replacement.
- [ ] CI workflows are classified as required / optional / manual / delete.
- [ ] One required local validation command chain is documented.
- [ ] Env files are documented; `.env.test` is added only if loader/CI behavior
      is verified.
- [ ] `npm run check && npm run build:prod && npm run test:unit` pass.
- [ ] `npm run guard:scripts:check` passes.

---

# Milestone 4 — Config Consolidation

**Capacity:** M (1-3 commits) **Risk:** medium **Goal:** reduce duplicate
configs while preserving Vite/editor/test boundaries.

## 4.1 Vitest configs

Current state:

```text
vitest.config.mjs                # current unit test entry from package.json
vitest.config.int.ts             # current integration entry
vitest.config.phase0-dbproof.ts  # phase0 DB-proof integration slice
vitest.config.testcontainers.ts  # testcontainers slice
vitest.config.quarantine.ts      # quarantine/reporting slice
vitest.config.base.ts            # shared base while package configs remain
```

Steps:

1. Extract shared aliases/setup from `vitest.config.mjs` without changing
   behavior.
2. Run `npm run test:unit`.
3. Create a replacement unit config only if it reduces duplication and preserves
   projects.
4. Move integration/testcontainers/quarantine slices together only after their
   package scripts and docs are updated.
5. Delete `vitest.config.mjs` last, after `test:unit` no longer references it.
6. Replace config-level disabled-test comments with quarantine metadata.

## 4.2 TypeScript configs

Keep conservative boundary configs:

```text
tsconfig.json              # root/base
tsconfig.client.json       # client boundary
client/tsconfig.json       # Vite/editor boundary; keep unless proven unnecessary
tsconfig.server.json       # server boundary
tsconfig.eslint.json       # keep only if ESLint needs broader includes
tsconfig.shared.json       # active shared boundary; do not list as cleanup until refs are removed
```

Delete only after scans and validation:

```text
tsconfig.fast.json
tsconfig.strict.json
tsconfig.schema-helpers.json
tsconfig.preact.json
tsconfig.build.json
tsconfig.eslint.server.json
```

Validation:

```bash
npm run check
npm run build:prod
npx vite build --mode preact
```

## 4.3 Playwright config

Current state includes multiple configs:

```text
playwright.config.ts
playwright.config.simple.ts
playwright.lp-reporting.config.ts
playwright.manual-gp.config.ts
```

Target projects in the primary config, only after checking package scripts and
docs:

- `smoke`;
- `critical`;
- optional `cross-browser`;
- optional `accessibility` only if actively used.

## 4.4 Configuration documentation

Add `CONFIGURATION.md` with:

- remaining config files;
- purpose of each file;
- commands that use each file;
- rules for not reintroducing redundant configs.

## Milestone 4 Exit Criteria

Milestone 4 is complete when:

- [ ] Shared Vitest aliases extracted without changing unit test behavior.
- [ ] Only actively-referenced TypeScript configs remain; deleted configs proven
      unused by extends/script/workflow scans.
- [ ] `npm run check && npm run build:prod && npm run test:unit` pass.
- [ ] `CONFIGURATION.md` exists listing remaining configs and their owners.

---

# Milestone 5 — Domain Correctness Guardrails

**Capacity:** L (4-8 commits) **Risk:** low by itself; required before semantic
refactors **Goal:** protect fund-modeling correctness before touching engines,
money, stores, or route logic.

**Dependency:** Milestone 5 covers domain math golden tests. Section 6.4 (route
contract tests) covers HTTP contracts. Both must be complete before Sections
6.5-6.9 (product-code refactors) begin.

## 5.1 Golden behavior map

Create or verify golden tests for:

| Domain area              | Required behavior                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Investable capital       | Committed capital less fees/expenses plus allowed recycling.                                                     |
| Allocations              | Capital allocation % fully deploys investable capital between initial and follow-on.                             |
| Fractional investments   | Fractional deal counts remain allowed; no forced integer rounding.                                               |
| Sector profiles          | Graduation + exit ≤100%; last stage graduation =0; failure derived.                                              |
| Pacing                   | Initial horizon controls deployment timing; graduation timing controls follow-on timing.                         |
| Follow-ons/reserves      | Graduation rates, participation %, pro-rata/check-size strategies drive reserve needs.                           |
| Reserve ranking/MOIC     | Planned reserve MOIC and follow-on opportunity cost remain stable.                                               |
| Exits/failures           | Exit rates/values and failures produce expected proceeds/loss behavior.                                          |
| Liquidation              | End-of-fund liquidation uses FMV and excludes future exits beyond fund end.                                      |
| Actuals/current forecast | Current forecast reflects actual investments and remaining capital; construction forecast remains original plan. |
| Scenario builder         | Parameter changes recalculate scenario results without mutating baseline.                                        |
| Fees/recycling           | Management-fee recycling and exit-proceeds recycling caps are respected.                                         |
| Waterfall                | European/American waterfall, preferred return, GP catch-up/carry, and GP commit treatment remain stable.         |
| Money precision          | Exact cents/ledger semantics do not get replaced by display rounding.                                            |

## 5.2 Snapshot format

Use small JSON golden snapshots:

```json
{
  "caseName": "seed_fund_with_follow_on_and_recycling",
  "inputsHash": "...",
  "outputs": {
    "investableCapital": 80000000,
    "initialInvestments": 26.67,
    "followOnCapital": 32000000,
    "tvpi": 2.41,
    "dpi": 0.82,
    "rvpi": 1.59,
    "irr": 0.184,
    "lpProceeds": 192800000,
    "gpCarry": 12800000
  }
}
```

Use tolerances only where mathematically justified. Exact equality for
cents/ledger conservation.

## 5.3 Acceptance standard

A domain refactor is accepted only if:

1. golden suite passes;
2. changed outputs are identical or explained;
3. intentional differences have a commit note with before/after diff;
4. rounding behavior does not change silently;
5. construction/current/scenario forecasts remain separate;
6. tolerances match the committed policy in Section 6d (no ad-hoc values);
7. core invariants (TVPI = DPI + RVPI, capital conservation, etc.) are tested
   separately from point-value snapshots.

## Milestone 5 Exit Criteria

Milestone 5 is complete when:

- [ ] Each domain area in Section 5.1 has at least one deterministic fixture.
- [ ] Each fixture records input hash, engine/version metadata, and expected
      outputs.
- [ ] Money/ledger outputs use exact equality; IRR/XIRR use abs < 1e-8.
- [ ] Core invariants are tested separately from snapshots.
- [ ] `npm run phoenix:truth` passes.
- [ ] Any intentional output change has a commit note with before/after diff.

---

# Milestone 5.5 — Value Thin-Slice (Optional)

**Capacity:** S-M (1-3 commits) **Risk:** low (gated by Milestone 5) **Goal:**
ship one visible user-facing improvement after correctness gates exist, before
deep architecture refactoring.

Once Milestone 5 golden tests and Milestone 6.4 route contract tests are in
place, the calculation engine is safely gated. Leverage this to ship a small
business-visible feature -- such as an enhanced scenario comparison view, an LP
report improvement, or a dashboard metric -- while continuing structural
refactoring in Milestone 6.

This prevents months of pure refactoring from looking like stalled velocity to
stakeholders. The feature must pass all golden tests and route contract tests.

---

# Milestone 6 — Product-Code Refactors Behind Tests

**Capacity:** XL (ongoing) **Risk:** medium-high **Goal:** improve architecture
after repo/tooling drag is reduced and domain tests exist.

Verified current shape:

- `client/src/main.tsx` is bootstrap code, but still installs fetch tap
  unconditionally, owns emergency rollback UI, uses `process.env['NODE_ENV']`,
  and bootstraps production monitoring/vitals.
- `client/src/App.tsx` owns providers, lazy routes, layout, mobile navigation,
  and v2 route bypass behavior.
- Server route mounting is layered across `server/server.ts`,
  `server/routes.ts`, `server/app.ts`, and bootstrap entrypoints. Treat
  duplicate-looking mounts as migration/compatibility state until proven dead.
- In the main workspace, `server/routes/deal-pipeline.ts` is still
  route-file-first; no dedicated `deal-pipeline.service.ts` / repository layer
  exists yet. Current `main` has endpoint contract tests and the idempotency
  middleware registration has been corrected.
- Client/shared engine duplicates are often intentional shims: many
  `client/src/core/*` files re-export `shared/core/*`.

## 6.1 Clean `main.tsx`

Actions:

1. Gate fetch tap behind `import.meta.env.DEV`.
2. Move emergency rollback into `client/src/debug/emergency-rollback.ts`.
3. Standardize client environment checks on `import.meta.env`.
4. Move monitoring bootstrap into `client/src/monitoring/bootstrap.ts`.

Validation:

```bash
npm run build:prod
npm run test:unit
npm run test:e2e:smoke
```

## 6.2 Split `App.tsx`

Move without behavior changes:

```text
client/src/app/AppProviders.tsx
client/src/routes/lazyRoutes.ts
client/src/routes/AppRouter.tsx
client/src/layout/AppLayout.tsx
client/src/components/navigation/MobileNavigation.tsx
client/src/App.tsx
```

Validation:

- root route redirects correctly;
- protected routes still guard setup-dependent pages;
- v2 routes still bypass legacy layout;
- LP routes still respect feature flags;
- smoke E2E passes.

## 6.3 Normalize API route mounting

Do not migrate everything to `/api/v1` yet.

First target:

- keep the expanded route-surface inventory current;
- map which entrypoints are active in dev, tests, production, and compatibility
  paths;
- explicit registry/comments at mount sites;
- remove duplicate mounts gradually;
- keep public operational endpoints public;
- preserve current URLs.

Current pinned constraints:

- `/metrics` and `/api/metrics` are public observability aliases.
- `/metrics/rum` and `/api/metrics/rum` are public browser/RUM ingress aliases.
- RUM health aliases are also documented in the inventory.
- Do not remove any metrics/RUM duplicate mount until Prometheus, Grafana,
  browser Web Vitals, and synthetic health consumers are checked.

Health caveat:

If `healthRouter` already defines `/healthz`, `/readyz`, and `/health`, keep:

```ts
app.use(healthRouter);
```

Do not mount it at `/health` unless internals are rewritten to relative paths.

## 6.4 Add route contract tests before service extraction

Start with `deal-pipeline.ts`. The first contract-test slice exists at
`tests/unit/routes/deal-pipeline.contract.test.ts`; it replaces the need to
start from the quarantined API test as the primary extraction gate. Keep the
contract test as the safety net before thinning the route file.

Correct contract examples:

```ts
describe('POST /api/deals/opportunities', () => {
  it('creates a deal with valid payload', async () => {});
  it('returns 400 for invalid payload', async () => {});
  it('applies authorization/fund scope rules', async () => {});
});

describe('GET /api/deals/opportunities', () => {
  it('lists deals with cursor pagination', async () => {});
  it('validates invalid cursor/filter input', async () => {});
});
```

Then extract:

```text
server/services/deal-pipeline/
  opportunities.ts
  diligence.ts
  pipeline.ts
  imports.ts
  bulk-actions.ts
  cursor.ts
  schemas.ts
  errors.ts
server/routes/deal-pipeline.ts                     # validate -> scope -> service -> response
```

Route extraction priority order (by boundary violation severity):

1. `deal-pipeline.ts` -- already has contract tests on current `main`.
2. `lp-api.ts` (1,263 lines) -- mixes routes, rate limiting, schemas, direct
   DB/storage, metrics, queueing, auditing, cursor signing, error formatting.
3. `allocations.ts` -- mixes route code, validation schemas, DB imports,
   transaction handling, service calls, storage access, domain validation.

Solo-friendly enforcement:

- New route files must not import `db` directly. Enforce via the route-import
  ratchet (see Section 5, Quality Ratchets).
- Existing route files move to service/repository pattern gradually; the repo
  currently has mixed route-embedded and service/repository domains, so do not
  claim a uniform layering rule until migrated.
- Preserve the existing `dealPipelineValidationSchemas` export until all
  consumers are verified or migrated.
- Keep semantic idempotency replay tests for create, import, stage, delete, bulk
  status, and bulk archive actions green during extraction.

## 6.4b Migrate middleware and route logging to Pino

The middleware layer is closed by 0d:
`df2b22fc refactor(middleware): preserve diagnostics as structured logs`.
Post-0d `rg -n "console\." server/middleware --glob "*.ts"` returns no matches.
The route layer still has 165 console calls across 27 files. These are allowed
by the console ratchet (which tracks only `console.log`), so this work is an
observability improvement, not a ratchet-moving cleanup.

Middleware files closed by 0d (keep as regression context, not active work):

- `server/middleware/async.ts` (1 call)
- `server/middleware/asyncErrorHandler.ts` (2 calls)
- `server/middleware/requireLPAccess.ts` (1 call)
- `server/middleware/performance-monitor.ts` (2 calls)
- `server/middleware/with-rls-transaction.ts` (3 calls)
- `server/middleware/auditLog.ts` (2 calls)
- `server/middleware/backpressure.ts` (1 call)
- `server/middleware/idempotency.ts` (5 calls)
- `server/middleware/dedupe.ts` (4 calls)

Route files (remaining work; do during or after service extraction):

Top offenders: `portfolio-intelligence.ts` (17), `lp-api.ts` (15),
`v1/reserve-approvals.ts` (15), `deal-pipeline.ts` (14), `variance.ts` (14),
`fund-config.ts` (10), `cashflow.ts` (10).

Target: all production server code uses the existing Pino logger with structured
fields (request ID, operation, error context) instead of raw console calls.

## 6.5 Consolidate fund stores

Current state: there are two fund-store surfaces:
`client/src/stores/fundStore.ts` (vanilla store) and
`client/src/stores/useFundStore.ts` (React/Zustand hook), plus selector wrappers
and a compatibility export at `client/src/state/useFundStore.ts`. Use a shared
state factory pattern only after inventorying consumers.

```text
client/src/stores/fund/createFundStoreState.ts
client/src/stores/fund/fundStore.ts             # vanilla wrapper if still needed
client/src/stores/fund/useFundStore.ts          # React hook wrapper
```

Steps:

1. Inventory consumers.
2. Move shared types/actions into factory.
3. Update imports gradually.
4. Delete redundant re-export after migration.

Validation:

- fund setup flow;
- persisted/hydrated state;
- allocation edits;
- follow-on checks;
- sector/stage validations.

## 6.6 Consolidate type guards

1. Diff exported APIs.
2. Identify which client helpers are browser/app facade helpers versus shared
   primitives.
3. Move truly shared helpers into `shared/utils/type-guards.ts`.
4. Keep `client/src/lib/type-guards.ts` as a compatibility facade until all
   client imports can move.
5. Convert the client file to a pure re-export only if the exported API is fully
   covered:

```ts
export * from '@shared/utils/type-guards';
```

6. Migrate imports later.
7. Delete facade when unused.

## 6.7 Money utilities: semantic migration, not cleanup

Do not delete `shared/money.ts` just because `shared/lib/money.ts` exists.

Classify callers:

| Caller need                                               | Correct utility         |
| --------------------------------------------------------- | ----------------------- |
| Exact cents, ledger conservation, capital movement        | `bigint` cents utility. |
| Fund metric calculation requiring high precision decimals | Decimal.js utility.     |
| Display formatting                                        | Formatting utility.     |

Possible final structure:

```text
shared/lib/cents.ts
shared/lib/decimal-money.ts
shared/lib/format-money.ts
shared/money.ts              # temporary compatibility barrel, then delete
```

Acceptance:

- exact cents tests exact;
- Decimal tests use specified tolerances;
- display rounding never used in core calculation paths.

## 6.8 Schema rename: compatibility first

Do not perform a sweeping rename in one commit. Current schema state is already
partially modular: `shared/schema.ts`, `shared/schema/index.ts`,
`shared/schema-lp-reporting.ts`, `shared/schema-lp-sprint3.ts`,
`shared/schemas.ts`, and `shared/schemas/*` all exist.

Step A — Add compatibility barrels:

```text
shared/db-schema/index.ts
shared/validation-schemas/index.ts
```

Only add new barrels if they simplify imports more than the current
`shared/schema/*` and `shared/schemas/*` surfaces. Avoid creating a third schema
namespace without a migration map.

Step B — Move flat LP schema files:

```text
shared/schema-lp-reporting.ts
shared/schema-lp-sprint3.ts
```

Update:

- `drizzle.config.ts`;
- `server/db-schema.ts`;
- tests;
- imports.

Step C — Codemod imports in batches. Keep deprecated barrels briefly, then
remove.

Validation:

```bash
npm run check
npm run build:prod
npm run test:integration
npx drizzle-kit check || true
```

## 6.9 Engine deduplication

For duplicate-looking client/shared engines:

1. diff each pair;
2. classify as existing re-export shim, stale duplicate, browser-specific
   adapter, or server-only engine;
3. if shared is canonical and the client file is not already a shim, replace
   client file with re-export;
4. if client-specific, rename `*.client.ts`;
5. preserve boundary tests such as
   `tests/unit/contract/funds-boundary-guard.test.ts`;
6. add README documenting relationship only where the boundary remains
   non-obvious.

Domain golden tests must pass before and after.

## Milestone 6 Exit Criteria

Milestone 6 is complete when:

- [ ] Route files importing `db`/`storage` directly is reduced from 25 to a
      tracked lower target (e.g., 20 after deal-pipeline, 15 after lp-api +
      allocations).
- [ ] Route contract tests exist for deal-pipeline, lp-api, allocations, funds,
      and performance-api.
- [x] Middleware console calls are replaced with Pino; current baseline is 0
      `console.*` matches in `server/middleware/`.
- [ ] Route console calls are replaced with Pino (tracked by file count).
- [ ] `main.tsx` and `App.tsx` are split per Section 6.1-6.2.
- [ ] Golden test suite and route contract tests pass.
- [ ] `npm run check && npm run build:prod && npm run test:unit` pass.

---

# Milestone 7 — Test Infrastructure Cleanup

**Capacity:** M (1-3 commits, can interleave) **Risk:** medium **Goal:** fix
discovery/config/helper issues without churn-for-churn’s-sake.

## 7.1 Quarantine governance

Current state (verified 2026-05-27): quarantine is an explicit project surface.
`vitest.config.quarantine.ts`, `scripts/quarantine-report.ts`,
`tests/quarantine/REPORT.md`, `tests/quarantine/policy.json`, and
`.quarantine.test.ts` files all exist. The report (generated 2026-05-11) shows
36 quarantined files: 33 documented and 3 undocumented. A broader grep finds 113
skip/todo occurrences across 61 test files.

The 3 undocumented quarantines that need immediate documentation:

- `tests/integration/phase0-migrated-postgres.test.ts`
- `tests/integration/lp-reporting-metric-run.test.ts`
- `tests/integration/lp-reporting-foundation-migration.test.ts`

Additionally, 15 of the 33 documented quarantines share the same generic reason
("Temporarily skipped pending stabilization triage") and exit criteria. These
should be triaged individually: either given specific exit criteria or deleted
if the underlying feature/test is no longer relevant (many are 83+ days old).

Rules:

- zero undocumented quarantines;
- reason, date, and exit condition required;
- TTL by class: `regression-pending` 14 days, `flaky-logic` 30 days, `flaky-env`
  (Docker/Toxiproxy/CI-specific) 90 days, `feature-blocked` tied to ticket/PR;
- default TTL 30 days if class is not specified;
- > 60 days requires keep/delete decision (except `flaky-env` class);
- > 90 days delete or fix regardless of class.

Metadata example:

```ts
/**
 * @quarantine
 * reason: flaky Testcontainers startup on local Docker
 * added: 2026-05-18
 * until: 2026-06-18
 * exit: passes 10 consecutive local runs under the owning Vitest config
 */
```

## 7.2 Consolidate helpers

Target:

```text
tests/_support/
  aliases.ts
  helpers/
  mocks/
  fixtures/
  factories/
  setup/
```

Move duplicates only when imports are easy to codemod.

## 7.3 Naming conventions

- Unit/integration: `.test.ts` / `.test.tsx`.
- Playwright/E2E: `.spec.ts`.
- Quarantine: metadata or dedicated folder, not a third naming convention unless
  needed.

## 7.4 Co-located tests

Do not move all co-located tests now.

Move only if:

- they break config consolidation;
- they confuse coverage boundaries;
- they require duplicated setup;
- they are part of a broader feature test reorganization.

## 7.5 Factories

Add high-value factories:

```text
tests/_support/factories/createFund.ts
tests/_support/factories/createAllocation.ts
tests/_support/factories/createSectorProfile.ts
tests/_support/factories/createInvestment.ts
tests/_support/factories/createDeal.ts
```

---

# Milestone 8 — Cosmetic and Navigation Cleanup

**Capacity:** S-M (optional) **Risk:** low-medium due to churn **Goal:** improve
naming/navigation only after higher ROI work is complete.

## 8.1 Page naming

Defer broad page renames unless already touching routing.

If performed:

- use codemod;
- cap to ≤50 moves per batch;
- do not mix with functional changes.

## 8.2 UI component directory split

Only split `components/ui/` if it is slowing development.

Recommended convention:

- directories kebab-case;
- component files PascalCase;
- document convention in `client/src/components/README.md`.

## 8.3 Ambiguous pairs

Resolve confusing pairs that cause real import mistakes:

```text
lp/ + lps/ -> lps/
investment/ + investments/ -> investments/
client/src/shared/ -> hooks/common/lib as appropriate
server/shared/ -> server/lib if server-local
```

---

# Acceptance Matrix

| Change type                       | Evidence required                                                                | Gate                                                                                                                             | Rollback                    |
| --------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Prevent regenerated docs logs     | Candidate absent or reference scan clean                                         | docs link check if docs change; `check`, `build:prod` no worse if files are removed                                              | git tag when removing files |
| Externalize binary docs assets    | Asset refs classified; external target chosen                                    | docs visual/link check, `check`, `build:prod`                                                                                    | git tag + external copy     |
| Curate `docs/archive/`            | File-level derivability review; product docs reviewed                            | docs links if available                                                                                                          | git tag                     |
| Migrate/delete root `src/` mirror | Route-story tests migrated; scan clean                                           | `check`, `build:prod`, `test:unit`                                                                                               | git tag                     |
| Migrate XState wizard machine     | Replacement runtime owner exists; active imports removed intentionally           | `check`, `build:prod`, wizard persistence tests, fund setup smoke                                                                | git tag                     |
| Record removed `repo/`            | Folder absent; git had no tracked files under it                                 | docs link check if references are edited                                                                                         | n/a                         |
| Delete packages                   | Tooling refs removed first                                                       | `check`, `test:unit`, `build:prod`                                                                                               | git tag                     |
| Simplify scripts                  | Canonical scripts or direct command chains added first                           | current replacement command passes                                                                                               | restore package.json        |
| Simplify hooks                    | Replacement commands exist                                                       | staged-file test + current replacement command                                                                                   | restore hook/script         |
| Simplify CI                       | 19-workflow inventory classified first                                           | CI passes once                                                                                                                   | restore workflow            |
| Delete Vitest config              | Script refs removed                                                              | `test:unit`                                                                                                                      | restore config              |
| Delete TS config                  | No refs; boundary preserved                                                      | `check`, `build:prod`, Vite build                                                                                                | restore config              |
| Route-import guard                | Existing 25 files grandfathered; new files blocked                               | `npm run check`; guard script passes; no false positives on existing routes                                                      | revert guard script         |
| Middleware logging migration      | Closed by 0d; regression target is 0 `console.*` matches in `server/middleware/` | `rg -n "console\." server/middleware --glob "*.ts"` exits 1 with no matches; `npm run test:unit`; structured log output verified | revert 0d commit            |
| Route logging migration           | Console calls in route files replaced with Pino                                  | `npm run test:unit`; request IDs present in structured log output                                                                | revert commit               |
| Route service extraction          | Contract tests before extraction                                                 | response shape unchanged; direct DB/storage imports drop                                                                         | revert commit               |
| Money changes                     | Caller classification + golden tests                                             | exact/parity tests                                                                                                               | revert utility commit       |
| Engine dedupe                     | Pair diff + golden tests                                                         | golden parity                                                                                                                    | restore file                |
| Schema rename                     | Compatibility barrels first                                                      | `check`, integration, Drizzle check                                                                                              | revert batch                |
| Test helper moves                 | Codemod imports                                                                  | `test:unit`, `test:integration`                                                                                                  | revert batch                |
| Cosmetic renames                  | Codemod + move budget                                                            | `check`, `test:unit`                                                                                                             | revert batch                |

---

# Suggested Solo Commit Sequence

Batches 0a-0e are quick wins from the 2026-05-27 tech debt audit that can land
before or interleaved with the existing sequence. They require no product code
changes and reduce future debt accumulation.

| Batch | Commit                                                                                  | Validation                                                                                            |
| ----: | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
|    0a | `chore(guardrails): add route-import guard for db/storage`                              | `npm run check`; no existing route files break                                                        |
|    0b | `test(quarantine): document 3 undocumented quarantines`                                 | quarantine report shows 0 undocumented                                                                |
|    0c | `test(cleanup): delete zero-assertion debug-ca020 test`                                 | `npm run test:unit`                                                                                   |
|    0d | `refactor(middleware): replace console calls with Pino in middleware`                   | DONE at `df2b22fc`; middleware console scan is clean                                                  |
|    0e | `chore(audit): add verified tech debt baseline to refactor roadmap`                     | `rg` console scans; `guard:console:check`; `git diff --check`                                         |
|     0 | `chore(audit): capture baseline and cleanup manifest`                                   | n/a                                                                                                   |
|     1 | `chore(repo): record generated docs logs already absent`                                | docs link check if ignore/docs change                                                                 |
|     2 | DONE/no-op: `chore(docs): externalize large reference assets`                           | 2026-05-27 recheck: 0 tracked files; no active restore refs                                           |
|     3 | DONE/no-op: `chore(docs): curate remaining docs archive`                                | 2026-05-27 recheck: 0 tracked files; local ignored-only files                                         |
|     4 | DONE: `chore(app): migrate legacy route-story mirror`                                   | 2026-05-27 recheck: only root `src/**` file deleted; route tests migrated                             |
|     5 | DONE: `test(client): lock modeling wizard machine behavior`                             | 2026-05-27 focused wizard tests: 5 files, 33 passed, 0 skipped                                        |
|     6 | DONE/no-op: `docs(repo): mark external BMAD local copy as removed if references change` | 2026-05-27 scan: 0 tracked files; root path absent; no refs present the removed local copy as current |
|     7 | DONE: `chore(tooling): remove package refs from app configs and scripts`                | 2026-05-27: package scans; command-path proofs; `check + test:unit + build:prod + lint`               |
|     8 | DONE: `chore(tooling): remove unused ai-agent packages`                                 | 2026-05-27: package reference scans; docs routing check; `check + test:unit + build:prod`             |
|     9 | `chore(scripts): classify and retire stale wave and phase scripts`                      | replacement command chain                                                                             |
|    10 | `chore(hooks): simplify husky hooks after replacing pre-push orchestration`             | staged-file test + replacement command chain                                                          |
|    11 | `chore(test): consolidate vitest config aliases without changing unit entry`            | `test:unit`                                                                                           |
|    12 | `test(domain): fill fund-model golden parity gaps`                                      | `phoenix:truth` + targeted truth/golden tests                                                         |
|   13+ | Product refactors one area at a time                                                    | per-area gates                                                                                        |

---

# Revised Priority List

Items 0a-0e are quick wins from the 2026-05-27 tech debt audit. They can land
immediately and independently of the existing sequence. As of 2026-05-27, 0d is
closed and 0e records the post-0d baseline before any later route logging or
service extraction work.

0a. Add route-import guard preventing new `import { db/storage }` in routes. 0b.
Document the 3 undocumented quarantines with reason, TTL, and exit criteria. 0c.
Delete or convert `tests/unit/debug-ca020.test.ts` (zero assertions). 0d. DONE:
replace 21 console calls in `server/middleware/` with Pino structured logging;
current middleware scan is 0 matches. 0e. Record this verified tech debt
baseline in the roadmap.

1. Baseline and cleanup manifest.
2. Record `docs/phase0-runner*.txt` and root `archive/` as already absent.
3. Keep `docs/references/attached_assets/` closed at 0 tracked files; restore
   individual assets only with an active reference.
4. DONE: keep the small remaining `docs/archive/2025-q4/` contents as local
   ignored-only artifacts; tracked `docs/archive/**` remains banned from HEAD.
5. DONE: root `src/core/routes/ia.ts` was migrated away; active route assertions
   now target `client/src/core/routes/ia.ts` plus `client/src/config/routes.ts`,
   leaving no root `src/**` owner.
6. DONE: keep active XState modeling-wizard machine; focused tests now lock
   current behavior and future replacement remains a separate migration.
7. DONE/no-op: Treat the vendored external `repo/` project as already removed
   locally; Batch 6 found no references presenting it as current.
8. DONE: decouple app configs and scripts from unused local packages; Batch 8
   removed the unused package-backed agent source after package-by-package live
   reference classification.
9. Classify current 90 scripts and retire remaining stale
   wave/phase/package-only scripts.
10. Simplify Husky hooks only after replacement commands exist; delete
    `scripts/pre-push.mjs` last.
11. Classify the current 19 workflows against `docs/workflows/README.md`, then
    consolidate.
12. Consolidate env files; add committed safe `.env.test` only if loader/CI
    behavior is verified.
13. Consolidate Vitest configs and aliases.
14. Rationalize TypeScript configs conservatively.
15. Fill gaps in existing fragmented domain golden/truth tests.
16. Add route contract tests for `deal-pipeline`, `lp-api`, `allocations`,
    `funds`, and `performance-api` before service extraction.
17. Clean `main.tsx`.
18. Split `App.tsx`.
19. Normalize API route mounting without changing URLs.
20. Extract service logic from largest DB-heavy routes (`deal-pipeline.ts`
    first, then `lp-api.ts`, then `allocations.ts`); reduce direct DB/storage
    route imports from 25 toward a tracked lower target.
21. Migrate route-layer console calls (165 across 27 files) to Pino during or
    after service extraction.
22. Consolidate fund stores.
23. Consolidate type guards.
24. Classify and migrate money utilities semantically.
25. Rename schema directories via compatibility barrels.
26. Dedupe engines behind golden tests.
27. Fix quarantine/helper/test naming issues; triage the 15 generic
    "stabilization triage" quarantines individually.
28. Promote `no-explicit-any` to `error` by directory after batch cleanup.
29. Re-enable `noUncheckedIndexedAccess` for client by directory.
30. Wire OpenTelemetry HTTP + DB spans after request IDs and structured logs are
    consistent.
31. Only then consider page renames and UI directory reshuffling.

---

# Non-Goals

- No wholesale `/api/v1` migration.
- No forced move of all co-located tests.
- No direct deletion of semantic money utilities without caller classification.
- No single-commit schema directory rename.
- No cosmetic page/component renaming until tooling and architecture work are
  complete.
- No adoption of npm workspaces unless packages become real app dependencies.
- No Vitest tag filtering until version/CLI support is verified.
- No mounting `healthRouter` at `/health` unless internals are rewritten.
- No committed quarantine directories for obvious deletion candidates.
- No preserving no-worse-than-baseline forever; ratchet quality once tooling
  stabilizes.
- No deletion of active XState wizard, root route mirror, `vitest.config.mjs`,
  or pre-push orchestration before replacements are proven.
- No creating parallel governance docs (`TECH_DEBT_REMEDIATION.md` or similar);
  this roadmap is the single source of truth for refactor/cleanup work.
- No treating raw audit numbers as authoritative without regenerating them from
  the commands in Section 1b.
- No setting numeric coverage % targets without first running an actual coverage
  report (`npx vitest run --coverage`).

---

# Bottom Line

The best approach is the **latest plan plus the attachment’s milestone
discipline, corrected for the live repository and the 2026-05-27 tech debt
audit**.

For this solo/internal build, move quickly on verified-unused artifacts and the
large attached-assets directory, but do not treat active route mirrors, active
XState wizard code, active Vitest configs, or active pre-push automation as
cleanup trash. Then simplify the daily commands, hooks, CI, env files, and test
configs from the current 90-script / 19-workflow baseline. Only after that, fill
domain golden-test gaps and refactor product code behind those tests.

The 2026-05-27 audit adds five immediate guardrails/baseline slices
(route-import guard, quarantine documentation, debug test cleanup, middleware
logging migration, and this verified baseline) and corrects stale metrics from
the raw audit. Console debt is 15 current ratcheted calls against a 39-call
baseline, not the all-method server total; middleware is now 0 matches after 0d,
while route-layer console debt remains 165 calls across 27 files. Client test
files number ~91, not 2, and route tests exist but are incomplete. The corrected
numbers in Section 1b are authoritative; regenerate them with the listed
commands before starting any remediation PR.

The highest ROI is not naming consistency. It is reducing the number of scripts,
configs, stale directories, duplicate utilities, and hidden semantic forks the
developer must mentally track while preserving the correctness of fund-model
calculations.
