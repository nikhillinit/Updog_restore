# PHOENIX STRATEGY v3.0: Evidence-Driven Incremental Modernization
**Date:** 2025-11-30
**Status:** Active

**Supersedes (for Phoenix execution details):**
- `PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md`
- `docs/analysis/strategic-review-2025-11-27/04-PHOENIX-STRATEGY-ANALYSIS.md`

---

## 0. Executive Summary

Phoenix v3.0 is a reset of the original Phoenix plan based on the **actual** state of the repo:

- MOIC / portfolio-lot logic **already exists in the codebase** (multiple files) and is not blocked on any pending PR.
- A production-grade **TypeScript baseline system** (`scripts/typescript-baseline.cjs` + `.tsc-baseline.json`) already exists.
- The Windows **Sidecar** (`tools_local` + junction scripts) is a **developer-experience / complexity** bottleneck, not the primary cause of TypeScript errors.
- pnpm is an **unproven optimization** in this context, not a guaranteed win and not a prerequisite for delivering value.

Phoenix v3.0 pivots from:

> "Big infrastructure bet to reduce TS errors and then ship features"

to:

> "Ship value (IA, wizard, MOIC) on top of a contained TS baseline, and only adopt pnpm/sidecar removal if a short, time-boxed experiment proves it's worth it."

The core principles are:

1. **Code is truth.** Decisions are based on measured behavior, not assumptions.
2. **Baseline before heroics.** We accept the current TS error baseline and prevent regression using existing tooling.
3. **Features first.** IA consolidation and the modeling wizard move forward regardless of infra outcome.
4. **Validation before migration.** pnpm is validated with a short spike before any migration work.

---

## 1. Baseline Acceptance & Containment

### 1.1 Baseline Acceptance (ADR-014)

We explicitly adopt the **Baseline Acceptance** doctrine:

- The current TS error baseline (e.g. ~451 errors as of 2025-11-30) is treated as **known technical debt**.
  *(The exact number should always be taken from the latest `.tsc-baseline.json`, not from this example.)*
- We do **not** pause feature work to chase zero errors.
- Any improvements to the error set are achieved opportunistically, in service of other work.

### 1.2 Containment via Baseline System

The existing `scripts/typescript-baseline.cjs` and `.tsc-baseline.json` constitute a **ratchet**.

In `package.json`, scripts are configured so that:

```jsonc
"scripts": {
  "baseline:check": "node scripts/typescript-baseline.cjs check",
  "baseline:save": "node scripts/typescript-baseline.cjs save",
  "baseline:progress": "node scripts/typescript-baseline.cjs progress",
  "check": "npm run baseline:check"
}
```

* `npm run baseline:save`:

  * Captures the current TypeScript error set and writes `.tsc-baseline.json`.
  * Must only be run **intentionally** on `main` when we are happy with the new state.
* `npm run check`:

  * Runs the baseline checker (`baseline:check`).
  * Compares current `tsc` output against the baseline.
  * CI should run this on every PR and **fail** if new, untracked errors appear.

**Policy:**

* The baseline is **frozen** until we explicitly choose to move it.
* The TS error count may go down over time; it must **never go up** unnoticed.

---

## 2. Infrastructure: pnpm as a Conditional Optimization

### 2.1 What pnpm is for

We consider pnpm as a potential improvement for:

* Simplifying dependency management and eliminating the Windows Sidecar.
* Reducing install times and improving local development speed.
* Making the repo more "standard" (no custom junction scripts).

### 2.2 What pnpm is *not* for

pnpm is **not**:

* A TypeScript error fix.
* A prerequisite for Phoenix to succeed.
* Justification for a long, risky infra project without prior validation.

The TS error profile (dominated by strictness/code issues such as TS4111 / TS2322, with very few TS2307 module resolution problems) strongly suggests pnpm will not materially reduce the error count. Any TS error reduction is treated as a **bonus**, not a goal.

### 2.3 Validation, then (maybe) Migration

Phoenix v3.0 enforces a two-step approach:

1. **pnpm Validation Spike (Phase 2)**

   * A short, **3-day, time-boxed experiment** on a throwaway branch (`experiment/pnpm-validation`).
   * Goal: answer "Can this repo run with pnpm (install, build, dev, TS check) with minimal surgery and no serious Windows/AV issues?"
   * No workspace redesign, no sidecar removal, no tsconfig rewrites.
   * `pnpm run check` is expected to run the same baseline-check script as `npm run check`; it may show minor differences, but must not explode into thousands of new module-resolution errors.

2. **Conditional Migration (Phase 3)**

   * Only considered if the spike clearly passes the validation gates.
   * Planned as its own mini-project (new branch, design doc, explicit rollback).
   * Sidecar removal happens **only after** pnpm has proven itself in practice.

**Baseline Interaction Rule (Phase 2)**

During the pnpm validation spike, **do not run** `npm run baseline:save` or `pnpm run baseline:save`.

* The npm+sidecar baseline (`.tsc-baseline.json` captured via the last `npm run baseline:save`) remains the single source of truth throughout Phase 2.
* You will observe `pnpm run check` output and compare it manually to `npm run check` output, but **do not** update `.tsc-baseline.json` during validation.
* Only after pnpm becomes the committed tool (Phase 3 complete) should you run `pnpm run baseline:save` to establish the new baseline.

If the spike fails Gate 1, pnpm is **deferred**, not endlessly tinkered with. Phoenix continues using npm + sidecar, and we document the decision in an ADR.

---

## 3. Product: Unblocked Modeling & IA

Phoenix v3.0 explicitly decouples product work from infra experiments.

### 3.1 Immediate Product Priorities

1. **IA Consolidation (Portfolio & Overview)**

   * Reduce route sprawl by converging toward ~5 core shells:

     * Overview / Dashboard
     * Portfolio
     * Model (wizard)
     * Operate
     * Report
   * The first tangible step is a unified, modern portfolio view exposed under a new route (e.g. `/portfolio-modern`) and gradually replacing older, fragmented portfolio/investment pages.

2. **Modeling Wizard - Step 4: Fees & Expenses**

   * Build the next wizard step on top of the existing fund modeling engine using current npm + sidecar.
   * Integrate with existing assumptions around management fees, fund expenses, and related parameters.

3. **MOIC / Reserves Intelligence**

   * Ensure existing MOIC features in the codebase are:

     * Reachable via IA.
     * Verified with realistic inputs.
   * Gradually integrate MOIC views into Portfolio and Model routes so they become part of the main workflow, not isolated prototypes.

### 3.2 Principle: Infra Cannot Block Features

Feature work (IA consolidation, wizard steps, MOIC analytics) must be able to progress:

* While pnpm validation is happening, or
* Even if pnpm is ultimately deferred.

Phoenix success is not defined by "pnpm migrated," but by:

* A stable, enforced TS baseline.
* A modeling and portfolio experience that actually gets used.

---

## 4. Phased Execution Plan

### Phase 0 - Ground Truth & Containment (Week 49, Days 1-2)

**Objective:** Align with reality and lock in the error baseline.

**Phase 0.0 - Current State Verification**

* Confirm the latest Phoenix-related docs (`PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md` and `docs/analysis/strategic-review-2025-11-27/04-PHOENIX-STRATEGY-ANALYSIS.md`) are now superseded by this plan for execution guidance.
* Confirm MOIC features render correctly under `npm run dev` and are reachable in the UI (or document gaps if not).
* Run `npm test`:

  * Save output (e.g. `test-baseline-2025-11-30.txt`).
  * Note overall pass rate and any known failing or flaky suites.
* Confirm the TS baseline system exists:

  * `scripts/typescript-baseline.cjs`
  * `.tsc-baseline.json`
  * `npm run baseline:progress` works and matches expectations.

**Phase 0.1 - Lock Baseline & CI Ratchet**

* Run `npm run baseline:save` on `main`.
* Commit the updated `.tsc-baseline.json` with a clear message (e.g. `chore(ts): refresh TypeScript error baseline for Phoenix v3`).
* Confirm CI workflows run `npm run check` somewhere in the pipeline (ideally `ci-unified.yml`, or clearly documented in `code-quality.yml` / `validate.yml`) and fail on new TS errors.

Phase 0 ends with:

* A tagged baseline commit (e.g. `phoenix-ground-zero-2025-11-30`).
* CI using the baseline ratchet in at least one consistent pipeline.

---

### Phase 1 - Feature Delivery (Week 49+; Always-On Track)

**Objective:** Deliver IA and modeling value regardless of infra outcomes.

Core tracks:

1. **IA Consolidation - Portfolio**

   * Create a modern `Portfolio` shell (e.g. `portfolio-modern`).
   * Migrate existing portfolio/investment views into this shell incrementally.
   * Add a simple toggle or feature flag to switch between legacy and modern views as needed.

2. **Wizard - Fees & Expenses (Step 4)**

   * Implement and wire this step in the wizard flow (using current npm + sidecar).
   * Ensure it fits into the existing modeling logic pipeline (Fund -> Sector Profiles -> Allocations -> Fees & Expenses).

3. **MOIC Usage Validation**

   * Use the MOIC views in a real modeling scenario and document:

     * What was done.
     * What insights were gained.
     * Any gaps that should drive follow-on work.

Phase 1 is continuous. It does not wait for-or depend on-the pnpm outcome.

---

### Phase 2 - pnpm Validation Spike (Week 50; Optional, 3-Day Max)

**Objective:** Answer a narrow question:

> "Can pnpm run this repo (install, build, dev, TS check) with minimal surgery and no major stability issues?"

**Branch:** `experiment/pnpm-validation`
**Time-box:** 3 working days, **hard limit**.

**Scope (IN):**

* `pnpm import`
* `pnpm install`
* `pnpm run build`
* `pnpm run dev`
* `pnpm run check` (using the existing baseline system; no re-baselining)

**Scope (OUT):**

* Creating `pnpm-workspace.yaml` with a custom workspace layout.
* Wholesale `tsconfig` refactors (paths, `moduleResolution`, etc.).
* Deleting Sidecar (`tools_local`, junction scripts).
* Changing import paths to work around pnpm-specific behavior.

**Allowed "Minimal Surgery" (if strictly necessary):**

* Fixing scripts that were already broken under npm.
* Adding a missing `typecheck` script if something calls it and it doesn't exist.
* Correcting truly wrong paths in scripts (e.g. typos, non-existent files).

If you feel drawn to do anything from the "OUT" list, the spike has effectively become a migration - treat that as a signal for **NO-GO**.

**Baseline rule:** During Phase 2, do **not** run `npm run baseline:save` or `pnpm run baseline:save`. You are only observing `pnpm run check` output and comparing it with `npm run check`; the npm baseline remains the source of truth.

**Day 3 Hard Gate - ALL must be TRUE:**

Measured on a **cold install** (with `node_modules` removed) on the primary dev machine:

* `pnpm install` completes in **< 5 minutes** without AV/Defender blocking.
* `pnpm run build` exits with code 0 and produces working `dist/` artifacts.
* `pnpm run dev` starts on the configured dev port (default **5173**, from `vite.config.ts` via `VITE_CLIENT_PORT`) with hot reload functioning.
* `pnpm run check` completes with a TS error count within **+/-50%** of the npm baseline.
  Example: if `npm run check` reports 451 errors, `pnpm run check` should report something in the **~225-675** range, not 2,000+ catastrophic module-resolution errors.
  *(This tolerance can be tightened later; the initial goal is to catch catastrophic failures, not small shifts.)*

If any of these fail, Gate 1 = **NO-GO**.

**Hard Day 3 Stop:** If any validation gate fails by end of Day 3, immediately:

* Delete the `experiment/pnpm-validation` branch (no merge).
* Write an ADR documenting what failed.
* Return to Phase 1 feature work for the remainder of the week.

No extensions. No "one more day." The 3-day time-box has teeth to prevent validation quietly turning into migration.

---

### Phase 3 - Conditional pnpm Migration & Sidecar Removal (Only if Gate 1 = GO)

**Objective:** Replace Sidecar with a clean pnpm workspace **without** destabilizing builds or dev workflow.

**Preconditions:**

* Phase 2 spike passed the Day 3 Hard Gate with clear evidence.
* You can allocate 1-2 focused weeks to migration.
* You are comfortable with a planned rollback path.

**Steps:**

1. **Workspace Design & Rollback Plan**

   * Draft a short design doc specifying:

     * `pnpm-workspace.yaml` package layout.
     * How cross-package imports will be expressed (no sidecar hacks).
     * How to revert to npm + sidecar if needed.

2. **Incremental Migration**

   * Introduce `pnpm-workspace.yaml` in a feature branch (e.g. `infra/pnpm-migration`).
   * Update scripts to stop depending on `tools_local` / sidecar.
   * Initially allow both npm and pnpm to function (dual-mode), especially for collaborators.

3. **Sidecar Removal**

   * Once all workflows are stable under pnpm:

     * Delete `tools_local/`.
     * Delete any `link-sidecar` or sidecar-related scripts/docs.
   * Update documentation to reflect pnpm as the primary install method.

4. **Baseline Reset (when pnpm is "the new normal")**

   * Only after pnpm is fully adopted and stable on `main`:

     * Run `pnpm run baseline:save`.
     * Commit the new `.tsc-baseline.json` (e.g. `chore(ts): update TS baseline for pnpm tooling`).
   * The new baseline becomes the CI ratchet going forward.

If, during this phase, pnpm introduces ongoing, hard-to-fix issues, migration can be **rolled back**, and an ADR should record the outcome.

---

### Phase 4 - Targeted TS Debt Reduction (Post-Phoenix, Ongoing)

**Objective:** Gradually improve TS health where it delivers real value.

* Use `npm run baseline:progress` (or pnpm equivalent) to understand error distribution.
* Prioritize TS fixes that:

  * Directly block or complicate feature work, or
  * Are highly concentrated in a few files you already touch.
* After meaningful reductions, update the baseline via `npm run baseline:save` on `main` to lock in the improvement.

TS cleanup is not on the Phoenix critical path; it is a **long-term hygiene project** built on top of Phoenix's guardrails.

---

## 5. Success Criteria

Phoenix v3.0 is considered successful if:

### 5.1 Baseline & Stability

* At least one CI pipeline (preferably `ci-unified.yml`) consistently runs `npm run check` and fails on new errors.
* The TS error baseline is stable or decreasing, never silently increasing.
* Over a rolling window (e.g. last 10 CI runs):

  * No infra failures (DB bootstraps, container startup, environment issues).
  * Test failures are about code, not broken tooling.
* Dev server (`npm run dev`) starts reliably; you are not constantly fighting environment glitches.

### 5.2 pnpm (Conditional)

If pnpm is adopted:

**Install speed measurement (same machine, same network, cold cache):**

```bash
# Baseline
rm -rf node_modules && time npm install

# Comparison
rm -rf node_modules && time pnpm install
```

* **Required:** pnpm is **not slower** than npm on a cold install.
* **Stretch goal:** pnpm is ~**1.5-2x faster** than npm on a cold install.

Additionally:

* Sidecar scripts and `tools_local/` are completely removed.
* Onboarding time (clone -> dev server running) is materially reduced and no longer requires junction hacks or sidecar docs.

If pnpm is **not** adopted:

* The NO-GO decision is recorded in an ADR.
* No further time is spent on pnpm within Phoenix.
* Phoenix success is not penalized for this choice.

### 5.3 Product / Features

* MOIC features are:

  * Present on `main`.
  * Reachable from the IA.
  * Used at least in internal test flows (not dead code).
* IA is clearly moving toward a smaller, coherent route set (e.g. ~5 core shells).
* The modeling wizard:

  * Maintains existing steps (Fund / Sector / Allocations).
  * Gains at least one new step (Fees & Expenses) during Phoenix.
* Test coverage remains at or above the ADR-014 baseline (~77%), or improves over time.

---

## 6. Core Principle

> **Evidence before assertions. Value before gold-plating.**

Phoenix v3.0 exists to make the fund modeling platform more usable and robust, not to chase a perfect toolchain. Infrastructure changes must earn their keep with clear, measured benefits; otherwise, they are deferred, and the product moves forward.
