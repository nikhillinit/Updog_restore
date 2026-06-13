---
status: ACTIVE
audience: both
last_updated: 2026-06-13
owner: 'Core Team'
review_cadence: P30D
categories: [governance, trust, analytics, audit, rollout]
keywords:
  [
    trust-readiness,
    provenance,
    evidence,
    numeric-correctness,
    fund-results,
    rollout-gate,
    audit,
    golden-path,
  ]
---

# GP Trust-Readiness Audit -> Fix Workstream — Design Spec

**Date:** 2026-06-13 **Branch:** main (off `4e9313c3`)

**Goal:** Make the live GP golden path correct-by-construction and
provenance-honest before wider rollout. Convert the unbounded directive "make it
trustworthy" into a ranked, evidence-backed punch-list (the trust-readiness
register), then close the rollout-blocking gaps.

---

## 1. Context — why now

The MVP golden path is live in production and the issue/PR tracker is clean:

- C1 methodology scenario creation (#837/#838), C2 comparison generalized to all
  economics override types (#817), C3 async worker wiring (#820) + a dedicated
  Railway `fund-scenario-calc` worker (#826/#828/#830).
- Cross-set scenario comparison (the 2026-06-02 plan's PR A) and prod
  scenario-family schema drift are both landed.
- Forecast drift UX (#803/#831) and the MVP unblock FINAL GO (main `764511db`).

The golden path
`fund-setup -> fund-model-results -> scenarios -> reserve allocation` works
end-to-end in prod. The chosen next priority is **adoption and trust**,
specifically **trustworthy before wider rollout**: there is no real GP usage to
chase complaints from, so the work is proactive hardening, not bug triage.

GPs will cross-check this tool against their own Excel models. For a VC fund
model, "trust" has two failure modes that fail differently:

- **Provenance dishonesty** — the UI shows a number without saying where it came
  from, when it was calculated, or whether it is stale / unavailable / mocked.
- **Numeric incorrectness** — the displayed metric does not match a trusted
  reference (Phoenix truth case, Excel parity).

A wrong-but-well-sourced number is worse than a right-but-unsourced one.
Correctness is the floor; provenance is the confidence layer on top. This
workstream audits both, on the surfaces a GP actually walks, before rollout.

This spec is **audit-first**: Phase 0 produces a read-only register; fixes are
gated on review of that register.

---

## 2. Objective and scope

### In scope (core-live, GP-walked surfaces — from `route-governance-registry.ts`)

- `/fund-setup` (wizard -> review -> finalize handoff)
- `/fund-model-results/:fundId` (the heart: Overview/Scorecard, Reserve
  Allocation, Deployment Pacing, GP Economics, Waterfall Setup, Scenario
  Analysis, plus publish-history / staleness controls)
- `/fund-model-results/:fundId/scenarios` (scenario workspace: sets, single-set
  and cross-set comparison, scenario evidence)
- `/dashboard` (KPI tiles, dual-forecast dashboard)
- `/portfolio` and `/portfolio/company/:id` (portfolio table, reserve planning
  persistence)
- `/forecasting` (dual-forecast / drift callouts)
- `/reports` (report surfaces)

### Out of scope (explicit)

- **LP surfaces** — off-limits per Stabilization Roadmap rule 5 and
  `DECISIONS.md` ADR-020 (Phase 3C Track B gate not reopened).
- **Cohort promotion to authoritative** — the largest correctness lift, but
  cohort is explicitly experimental (mock inputs, no authoritative snapshots).
  Making cohort _honestly labeled experimental_ is in scope; making it
  _authoritative_ (the 2026-06-02 plan's PR E saga) is not.
- **Net-new features**, broad chart redesign, new charting stack,
  `SmallMultipleGrid` / `ComparisonBand` / metric-matrix layouts beyond what
  already ships.
- **`/settings`, `/help`** — low-stakes, no material analytical output.
- **Dark mode** (`--primary` dark theme is dormant/unwired).

### Boundary rationale

The audit follows GP attention, not route completeness. Scope is the analytical
golden path because that is where a wrong or unsourced number costs adoption.
Security/access-scope is largely settled by the Tranche A program, so Axis C is
a verification pass, not a re-litigation.

---

## 3. The audit instrument

Each `(surface x section)` cell is scored on three axes drawn directly from
`docs/design/analytics-visualization-principles.md` (the project's existing,
source-of-truth doctrine). The audit does not invent new rules — it applies the
doctrine the codebase already commits to.

### Axis A — Provenance honesty (does the UI lie?)

Doctrine non-negotiables #1 (truthfulness beats polish), #4 (evidence travels
with the number), #5 (words/numbers/graphics together), plus the evidence-state
model.

Checks per material section:

- A1. Does the section carry an evidence header with state, config version, run
  marker, last-calculated timestamp, and source endpoint/contract section?
- A2. Are lifecycle states rendered honestly:
  `READY / CALCULATING / STALE / FAILED / EMPTY / PARTIAL / UNAVAILABLE`?
  Specifically: are FAILED/UNAVAILABLE sections kept visible with an explanation
  rather than hidden; do STALE results show why and offer a recalculation
  action?
- A3. Is any `SAMPLE_DATA` / mock / fixture rendered without the mandated `DEMO`
  ribbon + section border? (The "looks production-ready while using sample data"
  anti-pattern.)
- A4. Is the evidence section-specific, or illegally self-certified from route
  shape / top-level lifecycle (forbidden by the 2026-06-02 plan rule 2.4 —
  section-specific evidence must win over page-level lifecycle evidence)?
- A5. Do config-backed setup sections (e.g. Waterfall) avoid claiming a fake
  calculation run, and do mixed-source sections (Scorecard) avoid claiming a
  single false source?

### Axis B — Numeric correctness (are the numbers right?)

Checks per material metric:

- B1. Is the displayed value produced by the authoritative shared engine /
  contract, not a client-side fork? (Stabilization Milestone 3 made shared math
  authoritative; verify no surface reintroduced a fork.)
- B2. Is the metric covered by a Phoenix truth case or a parity test? Headline
  metrics in focus: TVPI, DPI, MOIC, LP/GP IRR, GP carry, management fees,
  reserves, clawback. (`npm run phoenix:truth` for the authoritative current
  count — do not quote a hardcoded number.)
- B3. Are there known Excel-parity gaps (XIRR / fees / waterfall)? Cross-check
  `docs/xirr-excel-validation.md` and the `xlsx-pdf-irr-parity` plan family.
- B4. Is authoritative-vs-experimental status labeled where it matters?
  `fund-authoritative-calculations.contract.ts` makes reserve + pacing
  authoritative and cohort + economics experimental — does the UI tell the GP
  which is which?

### Axis C — Access scope (right number, right user)

Doctrine non-negotiable #3. Largely green post-Tranche-A; verify, do not
re-derive.

Checks per data-bearing section:

- C1. Is material data served behind a fund-access-guarded endpoint?
- C2. Is fund-id parsing canonical (no hand-parse that can disagree with the
  server guard)?
- C3. Are any SSE/live surfaces honest about transport (`TRANSPORT-DEFERRED`)
  rather than implying a live bearer-protected `EventSource` consumer that
  cannot work?

### Per-cell verdict and severity

Verdict (per axis, or worst-of for the cell summary):

- `TRUSTWORTHY` — passes the axis.
- `PROVENANCE-GAP` — Axis A failure.
- `CORRECTNESS-GAP` — Axis B failure.
- `SCOPE-GAP` — Axis C failure.
- `UNVERIFIED` — could not be confirmed in the audit pass; needs follow-up
  before it can be cleared.

Rollout severity:

- `blocker` — a displayed number is wrong, or the UI actively lies (shows
  stale/mock as current/real, or shows another fund's data). Rollout cannot
  proceed.
- `high` — provenance missing on a material GP-facing number, or correctness
  unverified for a headline metric (TVPI/IRR/DPI/carry/reserves). Fix before
  rollout.
- `medium` — secondary-metric provenance gaps, or honesty issues on low-traffic
  sections. Fix soon after.
- `low` — polish; non-gating.

`UNVERIFIED` on a headline metric is treated as `high` until cleared (silence is
not a pass).

---

## 4. Output artifact — the trust-readiness register

Phase 0 produces one register document under `docs/plans/` (dated, e.g.
`docs/plans/2026-06-13-gp-trust-readiness-register.md`). It contains:

### 4.1 Executive go/no-go list

The set of `blocker` and `high` cells that gate rollout, each one line, ordered
by severity. This is the rollout decision surface.

### 4.2 Findings table

| Surface | Section | Axis | Verdict | Severity | Evidence (`file:line`) | Recommended fix | Maps-to |
| ------- | ------- | ---- | ------- | -------- | ---------------------- | --------------- | ------- |

- **Evidence** must cite a real `file:line` (the code that proves the verdict),
  not a description. Provenance / correctness claims are guilty-until-proven at
  the code layer; grep-absence is a lead, not evidence.
- **Maps-to** routes confirmed provenance gaps onto the already-specced PRs from
  `docs/plans/2026-06-02-scenario-comparison-evidence-workstream-plan.md`:
  - Non-scenario evidence-header gaps -> **PR B** (R4 non-scenario evidence
    completion: Overview, Waterfall Setup, GP Economics).
  - Scenario-comparison evidence/source-band gaps -> **PR C** (R5 analytics
    pilot).
  - Dual-forecast actuals/labeling gaps -> **PR D** (forecast modes).
  - Anything not covered by an existing PR -> a new scoped fix-PR.

Reusing PR B/C/D avoids re-deriving design that already exists and passed
review.

### 4.3 Surface x section coverage matrix

A completeness grid proving every in-scope cell received a verdict (no silent
gaps). Cells with no material output are marked `N/A` with a one-line reason.

---

## 5. Execution model

### Phase 0 — Audit (read-only analysis)

- Method: fan-out read-only analysis, one pass per in-scope surface, each
  applying the Axis A/B/C checklist and returning structured findings;
  synthesize into the register. No code changes in this phase.
- Owner: Claude (intake / context-gathering / verification — permitted by the
  workflow contract since no edits occur).
- Deliverable: the trust-readiness register (Section 4).
- This is the first thing built. It is reviewed before any fix.

### Gate

No fix-PR starts until the register is reviewed and the go/no-go list is agreed.
This prevents polishing provenance on numbers that are themselves wrong, and
prevents scope creep into out-of-scope surfaces.

### Phase 1+ — Fixes (one scoped PR per blocker/high cluster)

- Each rollout-gating cell (or tight cluster of related cells) becomes one
  scoped PR mapped to exactly one concern.
- Per the workflow contract, code edits and tests are dispatched via Hermes;
  Claude plans and verifies. PR B (non-scenario evidence completion) is the
  likely first concrete fix: pre-specced, high-confidence, and the largest
  single provenance cluster.
- Each PR validates with focused tests plus `npm run validate:core`, compared to
  the existing baseline (not perfection). Scenario/forecast PRs additionally run
  `npm run test:scenario-release-gate`; calculation-touching PRs run
  `npm run calc-gate`.
- Sequencing follows severity: all `blocker` cells, then `high` cells on the
  spine (`fund-setup` -> results -> scenarios), then `high` on dashboard /
  portfolio / forecasting / reports. `medium`/`low` are logged but non-gating.

---

## 6. Definition of done

The workstream is done when:

1. Every in-scope `(surface x section)` cell has a verdict recorded in the
   register (Section 4.3 coverage matrix is complete; no `UNVERIFIED` headline
   metrics remain).
2. Zero `blocker` and zero `high` provenance-or-correctness gaps remain on the
   GP golden path.
3. Cohort and any experimental output is honestly labeled experimental wherever
   it surfaces to a GP.
4. The register's executive go/no-go list is fully green.
5. `npm run validate:core` passes; scenario/forecast and calc gates pass for the
   PRs that touch those paths.

`medium` and `low` findings may remain open at rollout, tracked in the register,
provided they are non-gating by definition.

---

## 7. Risks

| Risk                                                | Mitigation                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Audit becomes an unbounded governance program       | Scope fixed to GP golden-path surfaces; severity model gates only `blocker`/`high`.         |
| Provenance polish applied to numbers that are wrong | Audit-first + gate; Axis B (correctness) scored before Phase 1 fixes start.                 |
| Re-deriving design that already exists              | Findings map onto existing PR B/C/D specs; new design only for cells no existing PR covers. |
| "Verified" without code evidence                    | Every register row cites `file:line`; `UNVERIFIED` headline metric counts as `high`.        |
| Scope creep into LP / cohort-authoritative          | Explicitly out of scope (Section 2); cohort fix is _labeling_, not promotion.               |
| Phoenix truth-case count quoted from stale docs     | Use `npm run phoenix:truth` live; ignore hardcoded counts in historical reports.            |

---

## 8. References

- `docs/design/analytics-visualization-principles.md` — the audit rubric's
  source of truth (five trust questions, evidence states, chart checklist,
  anti-patterns).
- `docs/plans/2026-06-02-scenario-comparison-evidence-workstream-plan.md` — PR
  B/C/D/E specs that confirmed gaps map onto.
- `client/src/app/route-governance-registry.ts` — authoritative core-live
  surface inventory.
- `client/src/pages/fund-model-results.tsx`,
  `client/src/components/results/EvidenceHeader.tsx`,
  `client/src/components/results/scenario-evidence.ts` — the live evidence
  surfaces under audit.
- `shared/contracts/fund-results-v1.contract.ts`,
  `shared/contracts/fund-authoritative-calculations.contract.ts` — section
  status model and authoritative-vs-experimental classification.
- `docs/STABILIZATION-ROADMAP.md` — standing rules (LP off-limits, shared math
  authoritative, `validate:core` is the hard gate).
- `docs/xirr-excel-validation.md` and the `xlsx-pdf-irr-parity` plan family —
  numeric-correctness reference points.
