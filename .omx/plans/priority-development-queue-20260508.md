---
status: ACTIVE
created: 2026-05-08
last_rebaseline: 2026-05-17
source: parallel Superpowers queue synthesis
owner: agent queue
---

# Priority Development Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the next development work ordered by current repo truth, user-facing leverage, and verification cost.

**Architecture:** The queue is a sequence of bounded lanes. Each lane must ship independently, preserve the repo's current source-of-truth constraints, and run only the verification gates that prove that lane.

**Tech Stack:** React, TypeScript, Vite, Express, Zod, PostgreSQL, Vitest, Playwright, OMX planning artifacts, Superpowers agent workflow.

---

## Queue Rules

- Execute one queue item at a time unless a lane is explicitly split by an approved plan.
- Keep each PR or commit scope aligned to one queue item.
- Do not treat ranking artifacts as executable specs until a paired PRD and test spec exist.
- Reconcile stale paths before editing implementation files that depend on those paths.
- No new dependencies unless the user explicitly approves them.

## Current-Main Rebaseline: 2026-05-17

Fresh status after commit `89163187`:

- `main` is synchronized with `origin/main` at
  `89163187 fix: close active B4 runtime markers`.
- The `S0` evidence-gate concern from
  `.omx/plans/prd-priority-next-steps-20260508.md` no longer blocks this
  queue: `playwright.config.ts` includes the GP usability and visual-audit specs
  under the `gp-usability` project, and the current lint gate passed during B4
  closeout with the active `.omx` ignore boundary.
- `P0` through `P3` are closed.
- `B1` through `B4` are closed for their approved first tranches or trigger
  reviews.
- The original post-M9 Vite 6 audit target remains deferred. Current local
  evidence shows Vite is still part of the stack (`vite` `^6.4.2`,
  `@vitejs/plugin-react` `5.1.4`), but no current queue evidence ties it to a
  build, dev-server, or test failure.
- The original `.a5c/processes/sensitivity-stress-panel.inputs.json` whitelist
  decision is resolved by current git state: the file exists, is tracked, and is
  not ignored.

**Queue verdict:** This May 8 queue is exhausted on current `main`. Do not
reuse the closed B1-B4 planning artifacts as active work. The next executable
step should be a fresh priority intake from current `main`, with explicit
attention to any current CI, dependency-security, product-roadmap, or operator
signals that are newer than this queue.

## Ready Queue

### P0: Current-Main Queue Reconciliation

**Why now:** The approved next-goal handoff still names the April 5 `Worktrack A -> B` lane, but its referenced active docs have moved to `docs/archive/2026-q2/`. Current code also shows the sensitivity and time-travel surfaces no longer match the old disabled-tab copy assumptions.

**Status:** CLOSED on 2026-05-08. The current-main reconciliation completed as a
source-of-truth closeout. The old active April 5 paths are absent, the archived
April 5 docs are the evidence source, ADR-014 is accepted, and the current
sensitivity/time-travel product surfaces already satisfy the P0 truthfulness
posture. No product-code edits were needed for P0.

**Closeout evidence:**
- Old active paths absent:
  `docs/plans/2026-04-05-todo-report-remediation-strategy.md` and
  `docs/todo-report-accuracy-review-2026-04-05.md`.
- Archived evidence present:
  `docs/archive/2026-q2/2026-04-05-todo-report-remediation-strategy.md` and
  `docs/archive/2026-q2/todo-report-accuracy-review-2026-04-05.md`.
- ADR-014 accepted and names the `fund_snapshots` /
  `fund_state_snapshots` boundary.
- `client/src/pages/sensitivity-analysis.tsx` exposes Monte Carlo, One-Way,
  Two-Way, and Stress as live fund-scoped persisted surfaces.
- `client/src/pages/time-travel.tsx` keeps restore unavailable and explains the
  UUID snapshot/version identity boundary.
- Focused verification passed:
  `npx vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/pages/sensitivity-analysis.test.tsx tests/unit/pages/time-travel.test.tsx`
  (`2` files, `6` tests).

**Sources:**
- `.omx/plans/prd-next-development-goal-current-main-rebaseline.md`
- `.omx/plans/test-spec-next-development-goal-current-main-rebaseline.md`
- `docs/archive/2026-q2/todo-report-accuracy-review-2026-04-05.md`
- `docs/archive/2026-q2/2026-04-05-todo-report-remediation-strategy.md`
- `client/src/pages/sensitivity-analysis.tsx`
- `client/src/pages/time-travel.tsx`
- `tests/unit/pages/sensitivity-analysis.test.tsx`
- `tests/unit/pages/time-travel.test.tsx`

**Execution lane:** Solo `$ralph` or direct executor plus verifier. Treat this as a source-of-truth closeout, not product expansion.

- [x] Confirm whether `Worktrack A` is complete because the April 5 docs are archived and now state ADR-014 as accepted.
- [x] Confirm whether `Worktrack B` is complete or superseded by the current live sensitivity tabs and time-travel restore copy.
- [x] Update only the active queue artifacts needed to stop pointing at missing active doc paths.
- [x] If product copy is already current, mark implementation complete and do not re-edit UI files.
- [x] Run static checks from the paired test spec, adjusted to the archived doc paths when appropriate.
- [x] Run `npx vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/pages/sensitivity-analysis.test.tsx tests/unit/pages/time-travel.test.tsx`.

**Done when:** The active queue no longer implies missing docs are active sources, and the sensitivity/time-travel truthfulness status is explicitly current.

### P1: GP Golden Path MVP

**Why now:** This is the most recent approved product-execution PRD and directly closes the core GP demo path: one draft fund identity from Fund Setup step 1 through finalize and fund-model results.

**Status:** CLOSED on 2026-05-08. Fresh proof showed the current product code
already carries the GP Golden Path identity/idempotency behavior. The only P1
code edit was to tighten the Playwright proof so it asserts the durable
invariant, not an incidental count of draft autosave requests.

**Closeout evidence:**
- `shared/contracts/fund-finalize-v1.contract.ts` carries optional positive
  `draftFundId`.
- `client/src/services/funds.ts` computes `computeFinalizeFundHash(payload)` and
  sends it as `Idempotency-Key` during `finalizeFund`.
- `server/services/fund-persistence-service.ts` syncs and publishes an existing
  draft fund when `draftFundId` exists, returning that same `fundId`.
- `tests/unit/contract/fund-finalize.test.ts` covers schema acceptance/reject,
  existing-draft publish, no-active-draft handling, duplicate replay, and lock
  release on uncached errors.
- `tests/unit/pages/review-step-finalize.test.tsx` covers `draftFundId` payload,
  `/fund-model-results/<fundId>` navigation, double-submit suppression, and
  retry behavior.
- `tests/unit/services/funds.idempotency.test.tsx` covers stable finalize hash,
  draft identity in hash scope, and finalize idempotency header.
- Focused verification passed:
  `npx vitest run --config vitest.config.mjs --configLoader native --project=server --project=client tests/unit/pages/fund-basics-bootstrap.test.tsx tests/unit/pages/review-step-finalize.test.tsx tests/unit/pages/fund-model-results.test.tsx tests/unit/pages/model-results.test.tsx tests/unit/contract/fund-finalize.test.ts tests/unit/services/funds.idempotency.test.tsx`
  (`6` files, `87` tests).
- Route/context verification passed:
  `npx vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/contexts/fund-context-route-selection.test.tsx tests/unit/components/layout/sidebar-navigation.test.tsx tests/unit/app/route-perimeter-governance.test.tsx`
  (`3` files, `69` tests).
- Golden-path Playwright passed:
  `npx playwright test tests/e2e/fund-setup-workflow.spec.ts --project=core --workers=1 --no-deps`
  (`3` tests).
- Route-regression Playwright passed:
  `npx playwright test tests/e2e/qa-audit-latest-route-publish.spec.ts --project=smoke --workers=1 --no-deps`
  (`5` tests).
- Core gates passed: `npm run check`; `npm run lint`.

**Sources:**
- `.omx/plans/prd-gp-golden-path-mvp.md`
- `.omx/plans/test-spec-gp-golden-path-mvp.md`
- `.omx/plans/ralplan-gp-golden-path-mvp-final-20260505.md`

**Execution lane:** `$ralph .omx/plans/prd-gp-golden-path-mvp.md .omx/plans/test-spec-gp-golden-path-mvp.md`

- [x] Prove current step 1 `draftFundId` and final `fundId` behavior with a targeted failing test or inspection.
- [x] Extend `FundFinalizeV1` so the wizard path carries `draftFundId`.
- [x] Make server finalize publish the existing draft fund when `draftFundId` exists.
- [x] Add deterministic finalize idempotency based on `draftFundId` plus a stable finalize-payload hash.
- [x] Keep `ReviewStep` changes minimal and preserve retry/error behavior.
- [x] Verify `/fund-model-results/:fundId` renders the authoritative finalized fund with truthful pending/error/data states.
- [x] Add focused unit/contract/e2e proof for identity continuity and duplicate finalize handling.

**Done when:** Completing the wizard lands on `/fund-model-results/<draftFundId>`, repeated finalize does not create duplicate funds/jobs, and focused tests plus the relevant core gate pass.

### P2: Quarantine Governance And Skip-Gate Alignment

**Why now:** The quarantine protocol, report, and CI skip threshold disagree. This makes test-health status hard to trust before larger implementation work.

**Status:** CLOSED on 2026-05-11. `tests/quarantine/policy.json` is the
canonical static-skip threshold source. The report generator already reads that
policy, and `skip-counter.yml` now reads the same file instead of hardcoding a
separate threshold.

**Closeout evidence:**
- Canonical threshold: `tests/quarantine/policy.json` defines
  `staticSkipThreshold: 25`.
- `npm run quarantine:report` regenerated `tests/quarantine/REPORT.md` and
  reported `Static skips: 12/25 (PASS)`.
- Local CI-equivalent count check confirmed `static_skip_files=12` and
  `threshold=25`.
- Protocol, report, generator, and workflow all reference the canonical policy
  file instead of separate threshold sources.

**Sources:**
- `tests/quarantine/PROTOCOL.md`
- `tests/quarantine/REPORT.md`
- `.github/workflows/skip-counter.yml`

**Execution lane:** Direct executor plus test-engineer review.

- [x] Decide one static-skip threshold source for docs and CI.
- [x] Reconcile `tests/quarantine/PROTOCOL.md` with the current report and workflow threshold.
- [x] Regenerate or update `tests/quarantine/REPORT.md` only through the repo's existing quarantine-report process if available.
- [x] Add or adjust a lightweight check if the threshold is currently duplicated.
- [x] Run the quarantine report/check command if present; otherwise run `rg -n "describe\\.skip\\(" tests --glob "*.ts" --glob "*.tsx"` and document the count.

**Done when:** The report, protocol, and CI policy describe one coherent quarantine baseline and one enforcement threshold.

### P3: Pre-Push Command Drift Repair

**Why now:** The package script `pre-push` points at `scripts/validate-pr.sh`, and the verification agent found that path references `npm run test:all`, which is not defined in `package.json`. The Husky hook appears more current, so local command behavior may diverge from the real hook.

**Status:** CLOSED on 2026-05-11. The npm command and Husky hook now share one
Node implementation, `scripts/pre-push.mjs`, so the package command uses the same
classification, baseline, orphan-test, large-file, and targeted/full validation
behavior as the active hook without relying on Bash in Windows shells.

**Closeout evidence:**
- `package.json` routes `npm run pre-push` to `node scripts/pre-push.mjs`.
- `.husky/pre-push` delegates to `node scripts/pre-push.mjs`.
- `scripts/validate-pr.sh` remains as a legacy compatibility wrapper that
  delegates to the same Node implementation.
- `npm run pre-push` passed locally and reported no committed changes relative
  to `origin/main`.
- Static scan of the live gate files found no `test:all` reference.

**Sources:**
- `package.json`
- `scripts/validate-pr.sh`
- `.husky/pre-push`

**Execution lane:** Direct executor plus verifier.

- [x] Inspect `scripts/validate-pr.sh` and `.husky/pre-push` for divergent gate definitions.
- [x] Decide whether `npm run pre-push` should call the Husky gate, define `test:all`, or be retired.
- [x] Keep the fix narrow and avoid changing unrelated gate policy.
- [x] Run the repaired command or the smallest non-destructive equivalent.

**Done when:** `npm run pre-push` no longer references a missing script and the documented local quality gate matches the active hook behavior.

## Planning Backlog

### B1: Schema-Drift Remediation For Active Product Surfaces

**Why next:** Post-M9 ranking identifies schema drift across active or potentially active product surfaces as the broadest correctness risk.

**Status:** CLOSED on 2026-05-17 for the first B1 tranche. The current repo now
has a Windows-compatible schema drift inventory gate for the six active product
surfaces. Product schemas were intentionally not changed in this tranche.

**Closeout evidence:**
- `npm run validate:schema-drift` exists and runs through
  `scripts/schema-drift-active-surfaces.ts`.
- The gate covers cohort, portfolio optimization, LP reporting, shares,
  sensitivity, and snapshots/fund-state.
- Fresh local verification passed with `surfaces=6 passes=81 warnings=5
  errors=0`.
- Focused active-surface suite passed: `10` files, `144` tests.
- `npm run check`, `npm run lint`, and `npm run build` passed.
- Architect verification approved the warning-vs-error boundary for optional
  migration-evidence gaps.
- Pushed commit: `5f3f346a chore: Preserve schema-drift proof before product
  edits`.
- GitHub checks for `5f3f346a` passed: CI Unified, Dependency Validation, Code
  Quality Gate, CodeQL, Core Validation, and Verify Strategic Documentation.

**Source:** `.omx/plans/post-m9-priority-targets.md`

**Execution lane:** `$ralph` completed from
`.omx/plans/prd-schema-drift-active-product-surfaces-20260517.md` and
`.omx/plans/test-spec-schema-drift-active-product-surfaces-20260517.md`.

**Done when:** The active product surfaces have a current drift inventory gate
and broad schema remediation remains blocked until the gate reports true drift.

### B2: Explicit-Any Drawdown Milestone

**Why next:** Explicit `any` weakens the TypeScript contract, but it should follow schema truth work and start with a fresh baseline.

**Status:** CLOSED on 2026-05-17 for the first B2 tranche. Fresh baseline showed
the repository count is dominated by tests, so this tranche stayed runtime-only
and removed the two BullMQ result-generic `any` usages from
`server/queues/backtesting-queue.ts`.

**Closeout evidence:**
- Fresh baseline before execution: `557` explicit `any` keywords in `113` files;
  `512` were in `tests`.
- Runtime candidates before execution: `10` AST `AnyKeyword` nodes across
  `server/services/streaming-monte-carlo-engine.ts`, `server/http.ts`,
  `server/queues/backtesting-queue.ts`, and `server/middleware/security.ts`.
- `server/queues/backtesting-queue.ts` now has `0` explicit `any` matches.
- Runtime candidates after execution: `8` AST `AnyKeyword` nodes remain, all in
  deferred or accepted compatibility boundaries.
- Focused queue verification passed:
  `npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/queues/backtesting-queue.test.ts`
  (`1` file, `18` tests).
- `npm run check` passed with `0` TypeScript errors.
- `npm run lint` passed, including guardrail ratchets.

**Source:** `.omx/plans/post-m9-priority-targets.md`

**Planning artifacts:**
- `.omx/context/explicit-any-drawdown-20260517T062248Z.md`
- `.omx/plans/ralplan-explicit-any-drawdown-20260517.md`
- `.omx/plans/prd-explicit-any-drawdown-20260517.md`
- `.omx/plans/test-spec-explicit-any-drawdown-20260517.md`

**Execution lane:** Direct execution completed from the B2 ralplan artifacts.

**Done when:** The first runtime explicit-any slice is closed and follow-up
drawdown work remains bounded by a fresh baseline instead of a broad lint-policy
change.

### B3: Variance 1C.3 Items B/C Trigger Review

**Why next:** The work is trigger-gated and should activate only if evidence says the documented triggers fired.

**Status:** CLOSED on 2026-05-17. The trigger review found no repository
evidence that Item B or Item C promotion triggers fired. The backlog document was
refreshed because Item B's current-state text was stale: the code now resolves
superseded baseline-scoped incidents on default-baseline change and exposes a
manual cleanup route, even though no broader lifecycle-cleanup trigger is active.

**Closeout evidence:**
- Item B triggers remain operator/LP/filter-UX signal based; no in-repo signal
  showed stale-incident clutter, retired-baseline incidents in LP-facing reports,
  or failed filter UX.
- `server/services/variance-tracking.ts` has `setDefaultBaselineAndCleanup` and
  `cleanupSupersededAlertsForCurrentDefaultBaseline`.
- `server/routes/variance.ts` exposes
  `POST /api/funds/:id/alerts/cleanup-superseded`.
- Item C triggers remain workload/topology/restart-pressure based; no in-repo
  evidence showed a worker tier, scale pressure, or web-app restart correctness
  issue.
- Scheduler automation remains in-process and leader-gated for planner work.

**Sources:**
- `.omx/plans/post-m9-priority-targets.md`
- `.omx/plans/prd-next-priority-development-goals.md`
- `.omx/plans/test-spec-next-priority-development-goals.md`

**Execution lane:** `$analyze` trigger check completed. No `$ralplan` promotion
is active from this closeout.

**Done when:** Item B/C trigger status is documented, the stale backlog sentence
is corrected, and no implementation lane is promoted without new trigger
evidence.

### B4: Core Runtime And Modeling Debt-Marker Audit

**Why next:** Debt markers exist in Monte Carlo, metrics, and storage paths. These are risky because they sit near domain logic and runtime services.

**Status:** CLOSED on 2026-05-17. The active runtime marker audit was analyzed,
implemented, verified, committed, and pushed. The live B4 source files no longer
carry the scoped debt-marker patterns that triggered this lane.

**Closeout evidence:**
- Scoped marker sweep returned no matches for
  `TODO|FIXME|HACK|XXX|eslint-disable|as any|placeholder|stub|approximate` in
  the four active B4 runtime files.
- Monte Carlo route and queue paths now propagate numeric request actor context
  into persisted simulation runs when available.
- Monte Carlo persistence now falls back to `SYSTEM_ACTOR_ID` instead of
  hardcoded user `1` when no actor context exists.
- Streaming Monte Carlo persistence uses typed Drizzle query access instead of
  `any` query casts.
- Actual metrics fund age now prefers `establishmentDate` before vintage-year
  fallback.
- Storage provider selection now falls back to local storage when no S3 bucket
  is configured, and configured S3 remains explicitly unsupported until an AWS
  SDK dependency is approved.
- Focused B4 verification passed:
  `npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/routes/monte-carlo-api.test.ts tests/unit/queues/simulation-queue-config.test.ts tests/unit/services/monte-carlo-engine.test.ts tests/unit/services/actual-metrics-calculator.test.ts tests/unit/services/storage-service.test.ts tests/unit/services/streaming-monte-carlo-risk-metrics.test.ts`
  (`6` files, `51` tests).
- `npm run check` passed with `0` TypeScript errors.
- `npm run lint` passed.
- Pre-push targeted tests passed during `git push`:
  `29` files, `292` tests passed, `1` skipped.
- Pushed commit:
  `89163187 fix: close active B4 runtime markers`.

**Sources:**
- `server/services/monte-carlo-engine.ts`
- `server/services/streaming-monte-carlo-engine.ts`
- `server/services/actual-metrics-calculator.ts`
- `server/services/storage-service.ts`

**Rebaseline note:** `client/src/lib/fund-calc-v2.ts` and its worker were removed from active source after the B4 trace found no live product instantiation path. Historical docs may still mention the prototype, but it is no longer an active B4 source.

**Execution lane:** Direct execution after `$analyze` classification and the B4
address request.

**Done when:** The active B4 source files have no scoped debt-marker matches,
actor attribution is no longer hardcoded to user `1`, and focused runtime tests
plus typecheck, lint, and pre-push verification pass.

## Verification Ladder

Use the smallest gate that proves the lane, then climb only when the touched files justify it.

1. Focused current queue gate:
   `npx vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/pages/sensitivity-analysis.test.tsx tests/unit/pages/time-travel.test.tsx`
2. TypeScript baseline:
   `npm run baseline:check` or `npm run check`
3. Lint and guardrails:
   `npm run lint`
4. Unit suite:
   `npm test` or `npm run test:unit`
5. Core validation for fund publish/model results/reserves/pacing/cohorts:
   `npm run validate:core`
6. Integration gates for API, database, or workflow boundaries:
   `npm run test:integration`
7. Build and browser gates for route, nav, lifecycle, frontend shell, or config changes:
   `npm run build`
   `npm run test:smoke` or `npm run test:e2e:smoke`
8. Domain truth cases for calculation semantics:
   `npm run phoenix:truth`

## Known Risks

- `.Codex/DISCOVERY-MAP.md` is referenced by guidance but is absent; `.claude/DISCOVERY-MAP.md` appears to be the current local map.
- The April 5 current-main PRD references docs under old active paths; those docs now appear under `docs/archive/2026-q2/`.
- The working tree was clean at the 2026-05-17 rebaseline. If future untracked
  QA or agent artifacts appear, queue execution must ignore unrelated files
  unless the chosen lane owns them.
- Normal Vitest runs exclude quarantine by design. Do not claim quarantine coverage from `npm test`.
