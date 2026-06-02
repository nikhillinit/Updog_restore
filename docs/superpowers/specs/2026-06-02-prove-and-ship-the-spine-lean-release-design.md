# Prove & Ship the Spine — Lean Internal Release (Design)

Date: 2026-06-02 Status: Approved design — review redlines applied, then
`writing-plans`.

Branch state at this update: local `main` is at `b9bc8fcf` and contains this
spec commit; `origin/main` is at `27fa8aec` (`#764`) after `#763` merged. Rebase
or merge `origin/main` before execution. The earlier CI Unified run
`26801663394` belonged to `3878e0b0`; do not use it as evidence for the current
head. Re-check CI after rebasing.

Execution model: this session produces the spec + plan only. Implementation runs
after approval through the chosen repo-standard execution path (`$ralph`,
`$team`, or Hermes where appropriate); Hermes is not a blanket requirement for
every edit/test.

---

## 1. Why this, and why now (the reframe)

Three strategic inputs were considered: an "MVP release train," a "two-stage
scenario program," and the v3.1.1 "multi-entity operating workspace" design
philosophy. Repository verification showed the first two **largely describe
already-merged work**, not pending work:

- Security Tranche A is merged: `#748`–`#762` are on `main`.
- Analytics strategy refresh is merged: `#763` is on `origin/main`; treat the
  merged analytics doctrine as current, not as a blocking open PR.
- Vitest 4 upgrade has landed on `origin/main` via `#764`; rebase before turning
  this spec into executable tasks.
- Scenario backend is shipped: canonical hashing
  (`server/lib/scenarios/scenario-input-hash.ts`), append-only retention
  (`ON CONFLICT … DO NOTHING`), `fund_scenario_calculation_runs` + dedup indexes
  (migration `0016`), concurrency + release-gate integration tests.
- Scenario UX + overrides + reserve optimization shipped: `#729` workspace,
  `#730` allocation/sector overrides, `#731` reserve optimization.
- A real-DB testcontainers harness already exists
  (`tests/integration/scenarios/scenario-release-gate.integration.test.ts`).

So the next priority is **not** to rebuild any of that. It is to make the part a
GP actually traverses **correct, proven, and honest** — then declare a lean
internal release. A second planning artifact
(`.omx/plans/ralplan-scenario-release-gap-closure-final-20260602.md`)
independently reached the same reframe and surfaced concrete defects in the
_shipped_ scenario surface, which this design folds in.

**Decision insight (from `/thinking` council + first-principles):** the spine
does not end at `/fund-model-results/:fundId`. That page links into the scenario
workspace (`client/src/pages/fund-model-results.tsx:808`, "Open Scenario
Workspace"). The shippable unit is therefore **the GP's first credible
session**: configure → publish → results → open scenarios → see correct per-set
status and honest provenance. Correctness only; breadth deferred.

---

## 2. Goal contract (ship unit)

> A GP can configure a fund, publish it, view traceable reserve/pacing results,
> and open the scenario workspace **without hitting a wrong status, a dropped
> provenance field, a mislabeled source, or an open cross-fund boundary on a
> mounted route** — with the core lifecycle proven against real persistence and
> one explicit release-gate enforcement boundary.

Out of this contract by design: comparison breadth, analytics, reserve polling,
the v3.1.1 multi-entity vision, forecast modes, cohort promotion.

---

## 3. Scope — merged 6-step sequence

Each step is a small, independently mergeable slice with focused verification.
Steps 1–2 fix live scenario-workspace defects (highest urgency, cheap, user
visible). Step 3 is the foundational proof. Steps 4–5 harden. Step 6 packages.

### Step 1 — Fix R2a: calculation-status scope (LIVE BUG)

Problem: the workspace creates `/calculation-status` queries for **every**
scenario set (`client/src/pages/fund-scenario-workspace.tsx:421-426`), but the
status service follows the **reserve-only** identity path
(`server/services/fund-scenario-calculation-status-service.ts:189-193`), and the
reserve identity **rejects** non-reserve sets with
`scenario_calculation_mode_mismatch`
(`server/services/fund-scenario-reserve-calculation-service.ts:118-127`). The
existing test fixture enshrines the wrong behavior (a `fee_profile` card showing
reserve-derived `Succeeded`) in
`tests/unit/pages/fund-scenario-workspace.test.tsx`.

Actions:

- Client-gate: call `/calculation-status` only for `reserve_allocation` sets,
  after set detail is known. Derive sync (`fee_profile`/`allocation`/
  `sector_profile`) action state from detail/results/comparison.
- Flip the test fixture so sync sets **fail** if they request
  `/calculation-status`, and no longer assert reserve-derived `Succeeded` on
  non-reserve cards.
- Add a **server contract test** pinning the status endpoint's reserve-only
  scope so a future caller cannot silently re-trip the bug. (Do not swap
  route-local `requireAuth`/`requireFundAccess` — not the global-auth failure
  mode.)
- **No polling in this step** (that is deferred R2b).

Acceptance: sync sets never call `/calculation-status`; reserve sets still do
after detail identifies them; sync cards show detail-derived state. Verify:
`npx vitest run tests/unit/pages/fund-scenario-workspace.test.tsx --project=client`,
`npx vitest run tests/unit/routes/fund-scenario-sets-route-contract.test.ts --project=server`
or the new server route contract test if created separately, and
`npm run check`.

### Step 2 — Fix R1: stop dropping `calculationMode` (provenance)

Problem: `ScenarioSetResultSummaryV1Schema` lacks `calculationMode`
(`shared/contracts/fund-scenario-sets-v1.contract.ts:306-317`) while the full
payload has it (391-402); the mapper omits it
(`server/services/fund-scenario-calculation-service.ts:212-231`); the client
maps `calculationMode: null`
(`client/src/components/results/scenario-evidence.ts:6-31`).

Actions:

- Add `calculationMode: FundScenarioCalculationModeV1Schema` to the summary
  schema; map `payload.calculationMode` in `mapScenarioResultSummary`.
- Replace the client-local `string | null` mode with the shared enum (colocate
  the shared type unless a dedicated file avoids circular imports — favor no new
  abstraction for a pure UI projection).

Acceptance: calculated sets expose non-null `calculationMode`; existing evidence
states still render. Verify: contract tests, `ScenarioEvidenceHeader`/
`ScenarioSetsSummary` tests, `npm run check`.

### Step 3 — Real-DB finalize → publish → results proof (foundational lock)

Problem: the only `finalize → results` test today is jsdom + mocked fetch/
react-query (`tests/integration/wizard-to-results-e2e.test.ts`). The persistence
path (`server/services/fund-persistence-service.ts:300-612`, `dispatchCalcJobs`
inline fallback 562-577) and results read service
(`server/services/fund-results-read-service.ts:154-616`) are unproven against
real persistence.

Actions:

- New `tests/integration/fund-lifecycle-db.test.ts` using the **existing
  testcontainers pattern** (mirror `scenario-release-gate.integration.test.ts`;
  reuse `helpers/testcontainers-migration`). Real Postgres required.
- Sequence: realistic `FundFinalizeV1` fixture → `POST /api/funds/finalize` →
  assert response (`fundId`, `published: true`, `runId`, `dispatchState`) →
  assert DB (one `funds` row; one published `fund_configs`; one `calc_runs` with
  reserve+pacing engines; `fund_snapshots` RESERVE+PACING with run/config
  attribution) → `GET /api/funds/:fundId/state` and
  `GET /api/funds/:fundId/results` (status ready/calculating; **no
  `NO_PUBLISHED_CONFIG` on first run**, ref `fund-results-read-service.ts:392`)
  → re-submit same idempotency key → no duplicates.
- Make the proof runnable: either add
  `tests/integration/fund-lifecycle-db.test.ts` to
  `vitest.config.testcontainers.ts` or invoke it explicitly in every release
  command. Do not rely on the current testcontainers full run to discover it
  automatically; the include list is explicit.
- **State which dispatch path is proven.** Reserve/pacing are sync-capable
  (`shared/contracts/fund-authoritative-calculations.contract.ts:1-31`); if the
  proof runs inline (no Redis), say so. The scenario release gate (real Redis)
  covers the queue path; do not imply this test proves the queue path.

Acceptance: a green run demonstrates the full persisted happy path +
idempotency. Verify:
`npx vitest run -c vitest.config.testcontainers.ts tests/integration/fund-lifecycle-db.test.ts`
and `npm run check`.

### Step 4 — Confirm current security residual closure

These were previously tracked as residuals, but current repo evidence indicates
they are already guarded. Treat this as an audit/no-op lane unless current tests
or code inspection prove a regression.

- **4a Backtesting job scope:** confirm `GET /jobs/:jobId` and
  `/jobs/:jobId/stream` still use `canAccessJob` with fund and requester checks
  (`server/routes/backtesting.ts`) and that wrong-fund tests remain present in
  `tests/unit/routes/backtesting.contract.test.ts`.
- **4b LP-report worker defense-in-depth:** confirm `resolveFundId` still
  rejects unauthorized and mixed fund IDs, and that route/queue tests cover
  omitted `fundIds` → LP-owned only plus mixed → fail closed.
- Fix only if the audit finds missing code or a failing negative-control test.
  Otherwise document the closure evidence in the release notes and avoid churn.

Acceptance: each residual is confirmed closed with current code/tests or fixed
with a new negative-control test if regression is found. Verify:
`npx vitest run tests/unit/routes/backtesting.contract.test.ts --project=server`,
`npx vitest run tests/unit/queues/resolve-fund-id.test.ts tests/unit/routes/lp-api.contract.test.ts --project=server`,
`npm run check`, `npm run lint`.

### Step 5 — R6a + surface-honesty lock (guardrails)

Actions:

- **CI gate boundary decision (explicit):** the scenario release gate runs only
  in the affected-path job (`.github/workflows/ci-unified.yml:134-181`), not the
  full matrix (184-261). Either add it to the main/full validation path **or**
  document why affected-path is the intended enforcement boundary. Do not leave
  it ambiguous and call the surface "gated."
- **Route-slice auth assertions:** replace count-brittle assertions
  (`tests/unit/routes/fund-scenario-sets-route-contract.test.ts:13-47`) with
  per-route-slice checks: for each route literal, assert `requireAuth()` and
  `requireFundAccess` appear before the handler. Preserve the existing
  fund-scenario-set pattern (do **not** swap to `enforceProvidedFundScope`).
- **Surface-honesty lock:** one test asserting archived redirects stay archived
  (`/planning`,`/kpi-manager`,`/kpi-submission`), `/portal/*` access-denied,
  `/shared/:shareId` public (`client/src/app/app-routes.tsx:106-129,153-156`),
  nav hides archived routes — plus results-page provenance is not mislabeled
  (waterfall is config-backed, not shown with a run ID/calc badge; no misleading
  "Live/Real-time" copy when pending; no `NO_PUBLISHED_CONFIG` after a
  successful publish). Fix mislabeling only if confirmed present today.

Acceptance: gate boundary is an explicit decision; route guard fails if any
scenario-set route omits route-local auth before the handler; surface lock
green. Verify: targeted route tests, the surface lock test, CI run confirmation,
`git diff --check`.

### Step 6 — Lean release packaging

Actions:

- `release:check` npm script = `validate:core` + Step 3 lifecycle proof +
  `test:scenario-release-gate` + the surface lock + `build`. **Wrap, do not
  replace** `validate:core`. Run the union locally once before declaring ship
  (CI is green but tail-flake risk exists; this is the cheap insurance that
  replaces a standalone baseline track).
- `docs/release/internal-release-notes.md`: supported surface; **explicitly
  excluded/experimental** (cohort experimental, economics flag-gated, forecast
  modes not built, comparison breadth deferred, analytics governed by the merged
  `#763` strategy, reserve polling fast-follow, v3.1.1 multi-entity not
  started); known residuals and their status from Step 4.

Acceptance: one command runs the release union; release notes name every
deferral. Verify: `release:check` passes locally; `npm run docs:check-links`.

---

## 4. Sequencing & dependencies

```
Step 1 (R2a) ─┐
Step 2 (R1)  ─┤ scenario-workspace correctness (Step 1 before Step 2 per ralplan)
Step 3 (DB proof) ── independent, can run in parallel with 1/2
Step 4 (security) ── independent
Step 5 (guardrails) ── after 1/2 land (route + surface)
Step 6 (packaging) ── last; depends on 3 + 5 scripts
```

---

## 5. Constraints (inherited invariants — respect verbatim)

- **ADR-022 snapshot isolation:** authoritative reads use
  `scenario_set_id IS NULL`; scenario reads/writes use exact non-null
  scenario-set scope.
- **No SSE** for scenario progress until a browser-safe transport decision
  exists (R2a is client gating, not a transport change).
- **Do not revive** retired `test:phase4` / `test:phase4:client` / `test:wave4`
  scripts.
- **Do not** blindly swap route-local `requireAuth`/`requireFundAccess` for
  `enforceProvidedFundScope` on scenario-set routes; use route-slice assertions.
- No new dependencies. Preserve unrelated untracked files. Keep diffs narrow and
  reversible.

---

## 6. Explicitly deferred (named in release notes)

R2b reserve polling (fast-follow); R3A/R3B comparison breadth; R4 broad
non-scenario evidence completion; R5 analytics pilot sequenced under the merged
`#763` analytics strategy; v3.1.1 multi-entity workspace; forecast modes; cohort
promotion.

---

## 7. Risks & mitigations (from red-team)

| Risk                                       | Mitigation                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Gravity creep (R1→R3, R2a→R2b→R4)          | Hard rule: first-session **correctness** only; breadth → release notes as known-deferred. |
| False "shipped" — partial proof            | Step 3 states inline-vs-queue scope; scenario gate covers queue path.                     |
| False "shipped" — leaky gate               | Step 5 forces an explicit gate-boundary decision before "gated" is claimed.               |
| False "shipped" — symptom-only R2a         | Step 1 adds a server contract test pinning reserve-only scope.                            |
| "Green once" ≠ reliably green (tail flake) | Step 6 runs the union locally once before ship.                                           |
| Drifting from user's pick                  | Fold-in of R2a/R1 was user-approved; deferrals are explicit.                              |

---

## 8. Definition of done

1. R2a fixed; sync sets never call reserve `/calculation-status`; fixture
   flipped.
2. `calculationMode` exposed in scenario result summaries (non-null when
   calc'd).
3. Real-DB finalize→publish→results+idempotency proof green, explicitly invoked
   through the testcontainers config or release script, with dispatch path
   named.
4. Previously tracked security residuals confirmed closed, or fixed with a
   negative-control test if the audit finds a regression.
5. Scenario release-gate enforcement boundary is an explicit, documented
   decision.
6. Route guard uses route-slice assertions; surface-honesty lock green.
7. `release:check` passes locally; `internal-release-notes.md` names every
   excluded/experimental/deferred surface.
