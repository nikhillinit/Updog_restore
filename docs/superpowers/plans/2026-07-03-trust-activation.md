# Current Main Trust Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`
> task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Prove and activate already-landed trust surfaces before adding new
modeling products.

**Architecture:** Use current `main` as truth. Separate release proof, Planning
FMV activation, investment-round soak, MOIC/H9 operator truthfulness, and LP
export qualification into sequential gates. Treat forecast/reserve-ranking
expansion as strategic backlog only.

**Tech Stack:** TypeScript, React, Express, Drizzle, PostgreSQL/Testcontainers,
Vitest, Vite, Tailwind, shadcn/ui.

---

## Current Baseline

- Current checkout: `main...origin/main` at `cedc282f` (2026-07-03).
- Preserve unrelated untracked paths:
  - `node_modules.broken/`
  - `s81-prod-audit-output.json`
  - `s81-prod-audit-post-apply.json`
- `.remember/**` is already ignored in `eslint.config.js`.
- `server/migrations` is already retired/empty on current main.
- Do not execute from retired current-main rebaseline plans.

## Immediate Queue

### P0: Live Baseline Preflight

- [x] Run `git status -sb`.
- [x] Run `git rev-parse --short HEAD`.
- [x] Run `git rev-parse --short origin/main`.
- [x] Confirm `HEAD == origin/main`.
- [x] Confirm only the untracked paths listed in Current Baseline are present.
- [x] Do not stage, delete, or normalize unrelated dirt.

CI-run verification (required before any baseline claim):

- [x] Resolve the CI run for the origin/main head SHA:
      `gh run list --commit <sha> --workflow "CI Unified"`.
- [x] Confirm it is a full run, not a vacuous docs-only run: `Test integration`,
      `Test unit`, `Test e2e`, and `Test validate-core` jobs must have executed.
      A path-filtered ~1m run proves nothing; full runs take ~7-10m.
- [x] If the head landed via a docs-only merge, dispatch
      `gh workflow run ci-unified.yml --ref main -f run_full_suite=true` and
      wait for green before claiming baseline.
- [x] Record run ID, conclusion, and duration. Every downstream "CI green" claim
      must cite this run ID plus the head SHA it ran against. Dashboard green,
      deploy status, and local checks are not CI evidence.

Current baseline evidence: run `28681002068` (CI Unified on `cedc282f`,
workflow_dispatch full run, 2026-07-03, success, ~8.5m;
integration/unit/e2e/validate-core executed; `CI Gate Status` success). Prior
head evidence: run `28672783353` on `2658bd2c`.

Exit: product work starts only from current `origin/main` with a cited full CI
run ID for that head.

### P1: Full Release Proof

- [x] Run non-skipped `npm run release:check` in Docker/WSL2 or CI.
- [x] If it passes, record release proof.
- [ ] If it fails, stop and record the first `[release:check]` failing step,
      command, and exit status.

Do not claim release proof from `UPDOG_RELEASE_CHECK_SKIP_DB=1`, `--skip-db`, CI
green, or deploy status.

Release proof: `RELEASE_CHECK_EXIT=0` on `cedc282f`, 2026-07-04 04:50 UTC, WSL2
Ubuntu-22.04 (Docker unix socket), Node v20.19.5 / npm 10.8.2, `CI=true`
`TZ=UTC`, no skip flags. All 12 stages ran sequentially; stage 5 fund-lifecycle
DB proof, stage 7 production schema clone proof, and stage 8 scenario release
gate all executed, proving the skip path was not taken.

### P2: Planning FMV Activation Closeout

- [x] Confirm `enable_planning_fmv_overrides` remains production-off.
- [x] Decide and document whether LP metric-run `active_as_of` is API-only or
      exposed in `MetricRunForm`.
- [ ] If UI exposure is chosen, update
      `client/src/components/lp-reporting/MetricRunForm.tsx` so operators can
      choose explicit marks vs active approved marks. (N/A: API-only chosen,
      ADR-024.)
- [x] Test default `sourceMarkSelection: 'explicit'` remains unchanged.
- [x] Test `active_as_of` submits empty `sourceMarkIds`.
- [x] Test Planning FMV UI remains disabled outside the live allocation
      workspace.

P2 evidence (2026-07-04): flag production-off - registry default false
(flags/registry.yaml), generated defaults false, and Vercel production env
contains no VITE_ENABLE_PLANNING_FMV_OVERRIDES (verified via
`vercel env ls production`); UI gate point is AllocationsTab.tsx
`useFlag('enable_planning_fmv_overrides')`. Decision: `active_as_of` is API-only
(ADR-024); `MetricRunForm` hardcodes `explicit` + empty `sourceMarkIds`. Tests
green: lp-metric-run contract + metric-run commit service (55/55, server
project) and enable-planning-fmv-overrides flag gating (3/3, client project),
TZ=UTC.

### P3: Investment Rounds Controlled Soak

- [ ] Run the Testcontainers-backed investment-round suite, including
      `tests/integration/investment-scenario-capability.test.ts`.
- [ ] Use `INVESTMENT_ROUNDS_SOAK_ITERATIONS=50` unless intentionally
      stress-testing higher.
- [ ] Prove create/replay/conflict, cross-fund denial, list/read, supersede,
      double-supersede rejection, and repeated soak behavior.
- [ ] Keep staging/production flag posture explicit; do not infer production
      readiness from dev defaults.

### P4: MOIC/H9 Operator Truthfulness

- [ ] Preserve V2 contract behavior for
      `/api/funds/:fundId/moic/rankings?contract=v2`.
- [ ] Improve operator-facing language for: legacy vs candidate mode, stale
      materiality, kill switch, unreconciled edits, missing probability inputs,
      missing reserve multiples, and round-evidence warnings.
- [ ] Do not invent new schema unless a concrete storage gap is proven.
- [ ] Keep contract-parse failures fail-closed: no stale/sample rankings
      rendered after parse failure.
- [ ] Add or update page tests around the exact operator states shown.

### P5: LP Export Production-Trust Qualification

- [ ] Treat current H9 export blockers as necessary but insufficient.
- [ ] Add acceptance criteria for role policy, workflow state, watermark/admin
      policy, provenance, and export eligibility before any production-ready
      claim.
- [ ] Keep `REPORT_PACKAGE_JSON_EXPORT_BLOCKED` structured responses covered.
- [ ] Do not call exports production-trust-qualified until
      role/workflow/watermark/provenance gates are accepted.

## Strategic Backlog Only

Do not execute these from this plan. Each needs its own refreshed PRD/test spec:

- Round/FMV-derived facts contract.
- Current forecast vs construction forecast split.
- Planned-reserves MOIC ranking.
- Allocation-first construction engine hardening.
- Scenario Builder / Monte Carlo.
- Broad JSON schema tightening, mock agent stream/cancel, and other secondary
  cleanup.

## Verification

- Baseline: `git status -sb`, `git rev-parse --short HEAD`,
  `git rev-parse --short origin/main`, plus a cited full CI run ID for the head
  SHA.
- Release: `npm run release:check` without skip flags.
- FMV: contract, service, route, and `MetricRunForm` tests.
- Rounds: Testcontainers investment scenario capability suite.
- MOIC/H9: route contract, mode behavior, reconciliation, invalidation, export
  gate, and UI tests.
- LP export: route tests proving blocked and eligible states under accepted
  policy.

## Assumptions

- No new dependencies.
- No production flag enablement without proof.
- Historical “already run” evidence is inherited context only; rerun required
  before current-head claims.
