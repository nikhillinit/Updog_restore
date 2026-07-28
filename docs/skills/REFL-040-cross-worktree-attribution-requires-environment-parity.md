---
type: reflection
id: REFL-040
title: Cross-Worktree Attribution Requires Environment Parity
status: VERIFIED
date: 2026-07-27
version: 1
severity: high
wizard_steps: []
error_codes: [ERR_ENV_PARITY, ERR_FALSE_ATTRIBUTION]
components: [tests, vitest, server, worktrees, configuration]
keywords:
  [
    cross-worktree,
    false-attribution,
    environment-parity,
    ignored-env,
    node-env,
    explicit-env-marker,
    register-routes,
    startup-side-effects,
    ordered-mock-fixtures,
  ]
test_file: tests/regressions/REFL-040.test.ts
superseded_by: null
---

# Reflection: Cross-Worktree Attribution Requires Environment Parity

**Scope:** Task 19 cohort-route merge blocker, 2026-07-27.

**Blameless stance:** The initial attribution was reasonable from the visible
tracked-code evidence. Everyone acted on the best information available. The
failure was in the experimental controls and test-environment contract, not in
an individual's diligence.

This extends REFL-024's environment-leakage lesson. REFL-024 showed how an
ignored local `.env` can make local tests falsely green; this incident showed
the inverse: the same ignored file can make a valid feature appear red and
invalidate cross-worktree commit attribution.

## 1. The Anti-Pattern (The Trap)

**Context:** A test was green on `origin/main` in one worktree and red on a
feature branch in another. The tracked change set therefore looked like the only
differing variable, and the feature commit was initially blamed. That experiment
was not controlled: the feature worktree had an ignored `.env` setting
`NODE_ENV=development`, while the baseline worktree had no `.env` and loaded
`.env.test`.

The resulting failure appeared unrelated to environment configuration. Full
`registerRoutes()` startup enabled two background schedulers. Their caught
`db.execute` and `db.insert` errors looked like harmless existing log noise, but
one scheduler's successful `db.select` consumed the first item from an ordered
mock-result queue. The later cohort request then received the wrong rows and
returned `400` or empty data.

### Incident Timeline

1. `tests/unit/server/cohort-routes-registration.test.ts` failed `3/4` only in
   the feature worktree.
2. The same file passed `4/4` in the baseline worktree.
3. The production route aggregator was byte-identical, and the feature added
   only transitive route/service imports, so the commit appeared causal.
4. Startup logs revealed the real experimental difference:
   - feature worktree: `.env` plus `.env.development`; schedulers started;
   - baseline worktree: `.env.test`; schedulers disabled.
5. Re-running the unchanged feature tree with `NODE_ENV=test` and
   `_EXPLICIT_NODE_ENV=test` passed `4/4`.
6. Adding `_EXPLICIT_NODE_ENV: 'test'` beside Vitest's existing
   `NODE_ENV: 'test'` made the raw feature-worktree command pass without shell
   overrides.

### How to Recognize This Trap

1. **Error Signal:** One branch/worktree fails while another passes, but logs
   show different dotenv files, runtime modes, background services, dependency
   paths, or tool versions.
2. **Test Pattern:** A test queues ordered mock results, then imports a broad
   application surface whose startup code can call the same mock before the
   request under test.
3. **Diagnostic Pattern:** Caught startup errors are dismissed because they are
   pre-existing, even though they prove an unexpected component ran.
4. **Mental Model:** "Same command plus different commit" is treated as a
   controlled comparison. Worktrees also differ through ignored files, inherited
   process environment, installed dependencies, generated artifacts, and caches.

**Impact:** False commit attribution can block correct work, trigger a broad
product-code repair for a harness defect, or allow an environment-dependent test
result to decide whether `main` advances. In financial software, that weakens
confidence in every later correctness claim built on the same test surface.

> **DANGER:** Do not attribute a cross-worktree pass/fail delta to code until
> relevant environment and toolchain inputs are normalized or independently
> ruled out.

## 2. The Verified Fix (The Principle)

**Principle:** Normalize the experiment before interpreting the delta. A
cross-worktree comparison proves commit causality only after code is the
remaining material variable.

### Root Cause: Five Whys

1. **Why did the cohort endpoint return `400`?** It received rows intended for
   later database calls.
2. **Why were the mock rows shifted?** A startup scheduler called
   `mockDb.select` before the cohort request.
3. **Why did a scheduler run in a unit test?** Server configuration observed
   `NODE_ENV=development`.
4. **Why did Vitest's `NODE_ENV=test` not survive?** `server/config/index.ts`
   intentionally allows `.env` layering to override unmarked values, and the
   Vitest config omitted `_EXPLICIT_NODE_ENV`.
5. **Why was the feature commit blamed?** Baseline and feature commands ran in
   different worktrees without first comparing ignored environment surfaces.

**Systemic root cause:** The diagnosis controlled tracked Git state but not
runtime state. The missing explicit test marker made that hidden variable
behaviorally significant.

### Portable Attribution Gate

Before declaring a commit causal across worktrees:

1. **Pin code truth.** Record both HEAD SHAs, merge base, tracked diff, and
   dirty files. Preserve unrelated dirt.
2. **Fingerprint runtime truth.** Compare only safe, relevant facts:
   - presence and selection order of `.env*` files;
   - non-secret mode/feature flags;
   - Node/npm versions and lockfile;
   - installed dependency tree or clean-install status;
   - generated files and caches when they can affect loading.
3. **Read the first divergence.** Compare startup logs, module-loading order,
   background-service activation, and mock calls before focusing on the final
   assertion.
4. **Run a one-variable control.** Prefer the same code in the same worktree
   with one environment input changed. A minimal intervention that flips the
   result is stronger evidence than a broad patch.
5. **Test the inverse when practical.** Run baseline code under the failing
   environment or feature code under the passing environment.
6. **Attribute only after normalization.** If the delta survives, trace the
   changed code. If it disappears, fix the shared environment boundary.
7. **Repair the highest shared control point.** Preserve the test runner's
   explicit mode rather than padding fixture queues, weakening assertions,
   special-casing the endpoint, or disabling one scheduler inside one test.
8. **Prove in layers.** Use:
   - original failure;
   - minimal hypothesis control;
   - raw command after committed fix;
   - affected feature tests;
   - full configured suite after shared test-infrastructure changes;
   - post-merge targeted proof.

### Start, Stop, Continue

**Start**

- Record an environment-parity tuple with every cross-worktree attribution:
  `HEAD`, tracked/dirty diff, selected env mode, and toolchain version.
- Treat caught startup errors as evidence that code ran; determine which calls
  succeeded before classifying the logs as noise.
- Capture mock-call counts before the request when an ordered fixture queue is
  involved.

**Stop**

- Treating green baseline worktree plus red feature worktree as commit proof by
  itself.
- Adding extra fixture rows or endpoint guards before identifying the consumer
  that shifted the queue.
- Using exit codes alone when targeted counts and response evidence are
  available.

**Continue**

- Keep `main` unchanged while the feature lane is red.
- Use existing behavioral tests as red/green proof when they already capture the
  regression.
- Fix shared configuration centrally, keep the diff minimal, run the full suite
  after test-infrastructure changes, and advance `main` only after fresh proof.

### SMART Actions

1. **Codify the invariant.**
   - **Owner:** Repository agent handling this incident.
   - **Measure:** `vitest.config.mjs` pairs `NODE_ENV=test` with
     `_EXPLICIT_NODE_ENV=test`; `tests/regressions/REFL-040.test.ts` passes.
   - **Deadline:** This incident closeout.
2. **Require parity evidence before future attribution.**
   - **Owner:** Investigator declaring root cause.
   - **Measure:** Diagnosis records the four-part parity tuple before naming a
     commit: SHAs, tracked/dirty diff, selected environment mode, toolchain.
   - **Deadline:** Before every cross-worktree causal claim.
3. **Require layered proof after shared test-config changes.**
   - **Owner:** Merge owner.
   - **Measure:** Original targeted test, affected feature tests, full
     configured unit suite, and post-merge targeted test all reach terminal
     pass.
   - **Deadline:** Before advancing or publishing the target branch.

## 3. Evidence

- **Observed failure:** Feature worktree cohort route test:
  `3 failed / 1 passed`; background schedulers started and touched the database
  mock.
- **Minimal control:** Same feature tree with explicit test-mode markers:
  `4/4 passed`.
- **Inverse control (baseline under the failing environment):** `origin/main`
  (`544a1f0c`) with Task 19 **absent**, run under an injected `.env`
  (`NODE_ENV=development`) in an otherwise clean worktree, reproduced the
  identical `3 failed / 1 passed` and `expected 400 to be 200`. This
  demonstrates the environment, not the feature commit, is causal and closes the
  attribution loop that gate step 5 requires. Without this direction the
  exoneration rests on inference ("schedulers pre-exist") rather than
  observation.
- **Repair:** Commit `ffc3c8bd` added one line to `vitest.config.mjs`:
  `_EXPLICIT_NODE_ENV: 'test'`.
- **Production safety:** The shifted rows are a test-only artifact. The ordered
  mock-result queue exists solely in the unit test; a real database has no
  shared ordered fixture, so a scheduler's query cannot consume rows destined
  for a later request. Schedulers starting under development or production is
  intended behavior, and the cohort route returns correct data in every
  non-mocked environment. No production impact.
- **Focused validation:** Cohort regression `4/4`; Task 19 tests `45/45`;
  post-fast-forward combined proof `49/49`.
- **Broad validation:** Full configured server/client unit suite exited `0`
  after 602.6 seconds; `npm run check` found `0` TypeScript errors; lint,
  guardrails, Prettier, and diff checks passed.
- **Test Coverage:** `tests/regressions/REFL-040.test.ts` verifies that Vitest
  exposes both the test mode and its explicit marker before server configuration
  loads.
- **Related:** REFL-024 (environment leakage and explicit markers).
- **Known limit:** Docker-backed integration/runtime suites were outside this
  repair's proof boundary.
