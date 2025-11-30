# Phoenix Execution Runbook
**Version:** 2.2 (Revised 2025-11-30)
**Status:** Active

This runbook describes how to execute Phoenix v3.0 in concrete steps.

Phases:

- Phase 0 - Ground Truth & Containment
  - 0.0 Current State Verification
  - 0.1 Lock Baseline & CI Ratchet
  - 0.2 Mark Older Phoenix Docs as Superseded (Optional, Once)
- Phase 1 - Feature Delivery (IA & Wizard)
- Phase 2 - pnpm Validation Spike (Optional, 3-Day Time-box)
- Phase 3 - Conditional pnpm Migration & Sidecar Removal (Only if Gate 1 = GO)
- Phase 4 - Targeted TS Debt Reduction (Post-Phoenix)

---

## Phase 0 - Ground Truth & Containment (Week 49, Days 1-2)

### 0.0 Current State Verification

**Goal:** Explicitly confirm reality so Phoenix doesn't repeat outdated assumptions.

1. **Verify Phoenix Documentation State**
   - [ ] Open:
     - `PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md`
     - `docs/analysis/strategic-review-2025-11-27/04-PHOENIX-STRATEGY-ANALYSIS.md`
   - [ ] Confirm they do **not** claim to be the current execution plan, or add a short "Superseded by `docs/strategies/PHOENIX-PLAN-2025-11-30.md` for execution details" banner.

2. **Verify MOIC Features**
   - [ ] Start the dev server:
     ```bash
     npm run dev
     ```
   - [ ] Manually navigate to the MOIC-related views.
     - Ensure the page renders without runtime errors.
     - Optionally test with a known fund to see that outputs look plausible.
   - [ ] If MOIC is not reachable or clearly broken, note this explicitly in your Phoenix notes.

3. **Capture Test Status**
   - [ ] Run tests:
     ```bash
     npm test 2>&1 | tee test-baseline-2025-11-30.txt
     ```
   - [ ] Note:
     - Overall pass/fail status.
     - Approximate pass rate vs historical (~77%).
     - Any known failing or flaky tests.

4. **Verify Baseline System Exists**
   - [ ] Check for baseline files:
     ```bash
     ls -la scripts/typescript-baseline.cjs .tsc-baseline.json
     ```
   - [ ] Run baseline progress:
     ```bash
     npm run baseline:progress
     ```
     - Confirm it reports a consistent error count and breakdown.

5. **Record Ground Truth**
   - [ ] Optionally update `docs/tech/ts-baseline.md` with:
     - Current TS error count.
     - Top error codes by frequency.
     - Date and commit hash.

---

### 0.1 Lock Baseline & CI Ratchet

**Goal:** Freeze the current TS error set and enforce it via CI.

1. **Lock the Baseline**
   - [ ] On `main`, run:
     ```bash
     npm run baseline:save
     ```
   - [ ] Commit the updated baseline file:
     ```bash
     git add .tsc-baseline.json
     git commit -m "chore(ts): refresh TypeScript error baseline for Phoenix v3"
     ```

2. **Verify CI Enforcement**
   - [ ] Check CI workflow:
     ```bash
     grep -r "npm run check" .github/workflows/
     ```
   - [ ] Decide where the baseline ratchet is enforced:
     - Preferably `ci-unified.yml`, **or**
     - A clearly documented pipeline such as `code-quality.yml` / `validate.yml`.
   - [ ] If no workflow runs `npm run check`, add a step to your chosen CI job:

     ```yaml
     - name: TypeScript baseline check
       run: npm run check
     ```

3. **Log the Baseline in CHANGELOG**
   - [ ] Update `CHANGELOG.md` with:
     - "Phoenix v3 strategy adopted."
     - Date baseline was locked.
     - Note that `npm run check` is now enforced in CI.

4. **Tag Ground Zero (Optional but Recommended)**
   - [ ] Tag the commit:
     ```bash
     git tag phoenix-ground-zero-2025-11-30
     git push origin phoenix-ground-zero-2025-11-30
     ```

Phase 0 is complete when:

- Baseline is locked.
- CI enforces `npm run check` in at least one pipeline.
- Ground truth is documented.

---

### 0.2 Mark Older Phoenix Docs as Superseded (Optional, Once)

**Goal:** Remove ambiguity about which Phoenix plan is current while preserving history.

- [ ] At the top of:
  - `PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md`
  - `docs/analysis/strategic-review-2025-11-27/04-PHOENIX-STRATEGY-ANALYSIS.md`

  Add a short note such as:

  > **Note:** Execution details in this document are superseded by `docs/strategies/PHOENIX-PLAN-2025-11-30.md`. This file is retained for historical context.

- [ ] Commit the changes with a message such as:
  ```bash
  git add PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md docs/analysis/strategic-review-2025-11-27/04-PHOENIX-STRATEGY-ANALYSIS.md
  git commit -m "docs: mark older Phoenix strategy docs as superseded by PHOENIX-PLAN-2025-11-30"
  ```

---

## Phase 1 - Feature Delivery (Always-On)

**Goal:** Deliver IA consolidation and wizard improvements without waiting on infra experiments.

**Timing:** Start Phase 1 feature work on **Day 3 of Week 49**, after Phase 0 is complete. Phase 1 runs in **parallel** with Phase 2 (pnpm spike) if you choose to run the spike. Features never wait for infrastructure experiments.

### 1.1 IA Consolidation - Portfolio

1. **Create Portfolio Modern Branch**

   ```bash
   git checkout -b feat/ia-portfolio-consolidation
   ```

2. **Create Modern Portfolio Shell**

   * [ ] Add a new route/page (e.g. `client/src/pages/portfolio-modern/index.tsx`).
   * [ ] Reuse existing portfolio components as much as possible.
   * [ ] Provide filters, sorting, and MOIC views in one coherent shell.

3. **Wire Into Navigation**

   * [ ] Add link(s) to the modern portfolio view from existing navigation.
   * [ ] Optionally guard it behind a feature flag for initial testing.

4. **Validate**

   * [ ] Run `npm run dev`, navigate to the new route, verify it renders and behaves properly.
   * [ ] Run `npm run check` and `npm test` before merging.

### 1.2 Wizard - Fees & Expenses (Step 4)

1. **Wizard Branch**

   ```bash
   git checkout -b feat/wizard-fees-expenses
   ```

2. **Implement Step 4**

   * [ ] Add a new component in the wizard steps folder (e.g. `fees-expenses.tsx`).
   * [ ] Tie into the existing wizard flow (Fund -> Sector Profiles -> Allocations -> Fees & Expenses).
   * [ ] Ensure form state flows correctly through your modeling context.

3. **Test & Validate**

   * [ ] Add tests where natural (unit tests for utility logic, basic component tests).
   * [ ] Run `npm run check` and `npm test` before merging.

Phase 1 remains ongoing throughout Phoenix v3. Infra work must never block these tracks.

---

## Phase 2 - pnpm Validation Spike (Optional, 3 Days)

**Goal:** Validate pnpm on this repo with **minimal surgery**, not to "complete a migration."

**Branch:** `experiment/pnpm-validation`
**Time-box:** 3 working days maximum.

### 2.1 Create Validation Branch

```bash
git checkout main
git pull origin main
git checkout -b experiment/pnpm-validation
```

### 2.2 Minimal pnpm Setup

1. **Enable pnpm (via Corepack or installer)**

   ```bash
   corepack enable
   corepack prepare pnpm@latest --activate
   ```

2. **Import Lockfile & Install**

   ```bash
   pnpm import     # from package-lock.json
   pnpm install
   ```

* Do **not** write `pnpm-workspace.yaml` in this phase.
* Do **not** edit tsconfig paths or remove sidecar scripts.

### 2.3 Run Core Commands

1. **Build**

   ```bash
   pnpm run build
   ```

2. **TS Check**

   ```bash
   pnpm run check   # runs the same baseline check as npm run check
   ```

   * This must **run to completion**.
   * It is allowed to differ from `npm run check`; you are watching for catastrophic changes (e.g. thousands of TS2307 errors), not exact parity.
   * **Do not** run `npm run baseline:save` or `pnpm run baseline:save` in this phase; you are only observing pnpm output.

3. **Dev Server**

   ```bash
   pnpm run dev
   ```

   * Confirm it starts correctly.
   * Confirm hot reload works on the main dev machine (including Windows if applicable).

### 2.4 Minimal Surgery Rules

During this spike:

**Allowed (if necessary):**

* Fix a script that is obviously broken under both npm and pnpm.
* Add a missing `typecheck` script if referenced but absent.
* Correct an objectively wrong path in a script.

**Not Allowed:**

* Creating `pnpm-workspace.yaml` with a full workspace design.
* Refactoring `tsconfig` paths or `moduleResolution`.
* Deleting sidecar scripts or `tools_local/`.
* Mass editing imports to appease pnpm-specific resolution issues.

If you find yourself needing something from the disallowed list, treat that as a strong signal that pnpm requires more than "minimal surgery" and lean toward a NO-GO.

**After any minimal surgery:**

* [ ] Verify `npm` still works correctly:

  ```bash
  npm run build && npm run dev
  ```

  This prevents your validation spike from accidentally changing npm semantics.

### 2.5 Day 3 Hard Gate (GO / NO-GO)

By end of Day 3, **all** of the following must be TRUE:

* On a **cold install** (after `rm -rf node_modules`), `pnpm install` completes in **< 5 minutes** on the primary dev machine without AV/Defender blocking.
* `pnpm run build` exits with code 0 and produces working `dist/` artifacts.
* `pnpm run dev` starts on the configured dev port (default **5173**, from `vite.config.ts` via `VITE_CLIENT_PORT`) with hot reload functioning.
* `pnpm run check` completes with a TS error count within **+/-50%** of the npm baseline.
  Example: if `npm run check` reports 451 errors, `pnpm run check` should report something in the **~225-675** range, not 2,000+ catastrophic module-resolution errors.
  *(You can tighten this tolerance later to +/-25% if you want a stricter gate.)*

If **all** above are true -> pnpm is a **candidate** for migration (GO).
If **any** fail -> pnpm is **deferred** (NO-GO).

**On NO-GO (Hard Day 3 Stop):**

* [ ] Delete branch:

  ```bash
  git checkout main
  git branch -D experiment/pnpm-validation
  ```
* [ ] Create an ADR (e.g. `adr/ADR-0XX-pnpm-deferred-2025-12.md`) summarizing:

  * What was tried.
  * Why pnpm is deferred.
* [ ] Shift remaining Week 50 time back to Phase 1 features.

No extensions. No "one more day." The 3-day time-box has teeth to prevent validation from becoming migration.

---

## Phase 3 - Conditional pnpm Migration & Sidecar Removal (Only if GO)

**This phase is optional and only triggered if the validation spike clearly passes.**

### 3.1 Plan Migration

1. **Create Design Doc**

   * Outline:

     * Target `pnpm-workspace.yaml`.
     * How packages (client, server, shared, etc.) will be structured.
     * Sidecar removal plan.
     * Rollback steps.

2. **Create Migration Branch**

   ```bash
   git checkout main
   git checkout -b infra/pnpm-migration
   ```

### 3.2 Introduce Workspaces & Dual-Mode

1. **Add `pnpm-workspace.yaml`**

   ```yaml
   packages:
     - "client"
     - "server"
     - "shared"
     - "workers"
     - "packages/*"
     - "ml-service"
   ```

2. **Update Scripts**

   * Adjust `package.json` scripts to work with the workspace.
   * Keep npm commands functional during the transition if collaborators need them.

3. **Test**

   ```bash
   pnpm install
   pnpm run check
   pnpm test
   pnpm run build
   pnpm run dev
   ```

### 3.3 Remove Sidecar

Once you are confident pnpm is stable in daily use:

1. **Delete Sidecar Artifacts**

   ```bash
   rm -rf tools_local
   rm -f scripts/link-sidecar-packages.mjs
   # Remove any other sidecar-related scripts/docs
   ```

2. **Update Documentation**

   * Replace sidecar instructions with pnpm workspace instructions.
   * Simplify onboarding docs.

3. **Final Verification**

   * Run:

     ```bash
     pnpm install
     pnpm run check
     pnpm test
     pnpm run build
     pnpm run dev
     ```
   * Ensure CI passes.

4. **Baseline Reset**

   * After pnpm is fully adopted:

     ```bash
     pnpm run baseline:save
     git add .tsc-baseline.json
     git commit -m "chore(ts): update TS baseline for pnpm tooling"
     ```
   * Merge the branch to `main`.

---

## Phase 4 - Targeted TS Debt Reduction (Post-Phoenix)

**Goal:** Incrementally reduce TS errors where it actually matters.

Suggested approach:

* Regularly run `npm run baseline:progress` (or `pnpm` equivalent) to identify error clusters.
* When working in a file or module that carries a chunk of errors, clean them up as part of that work.
* After a meaningful reduction (across one or more PRs), update the baseline with `npm run baseline:save` on `main`.

TS cleanup is not required to declare Phoenix v3 "done"; it is a long-term benefit enabled by Phoenix's guardrails.

---

## Appendix: Decision Options

At any time, you can choose:

* **Option A - Full Phoenix v3 (All Phases):**

  * Execute Phase 0 -> Phase 1.
  * Run the Phase 2 pnpm spike.
  * Possibly Phase 3 migration if GO.
  * Phase 4 as ongoing hygiene.

* **Option B - Phase 0-1 Only (Defer pnpm):**

  * Execute Phase 0 (baseline + docs).
  * Execute Phase 1 (features).
  * Explicitly defer pnpm spike (document in ADR, revisit in 2026 if needed).

Phoenix v3 is deemed successful when:

* Baseline is enforced and stable.
* Builds/tests are boringly reliable.
* IA and wizard have moved forward.
* pnpm either:

  * Is adopted with clear DX wins, **or**
  * Has been evaluated and consciously deferred with no lingering ambiguity.
