# GP Trust-Readiness Audit (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the read-only **trust-readiness register** — a ranked,
evidence-cited punch-list scoring every GP-walked golden-path surface on
provenance honesty, numeric correctness, and access scope — that gates the later
fix work and a thin parallel GP rollout.

**Architecture:** This is the **Phase 0** (audit) plan from the design spec
`docs/superpowers/specs/2026-06-13-gp-trust-readiness-audit-design.md`. It is
**read-only analysis**, not code: a fan-out of one audit pass per surface
(dispatchable to `Explore` subagents), each emitting structured findings that
synthesize into one register document under `docs/plans/`. There is no red-green
TDD cycle because no production code changes; the "test" analog is a
schema/evidence-completeness check on each finding set. The eventual fixes
(Phase 1+) are authored as a **separate plan after the register exists**,
because their content is unknowable until the audit runs — and they map largely
onto the already-specced PR B/C/D from
`docs/plans/2026-06-02-scenario-comparison-evidence-workstream-plan.md`. Per the
project workflow contract, Phase 0 is performed by Claude/Explore (read-only,
allowed); Phase 1+ code edits dispatch via Hermes.

**Tech Stack:** Markdown register; read-only repo analysis via Read/Grep/Glob
and `Explore` subagents. Reference doctrine:
`docs/design/analytics-visualization-principles.md`. Live count commands (run,
never hardcode): `npm run phoenix:truth`.

---

## Scope check

This plan covers **Phase 0 only** (the audit + the parallel thin-rollout track +
the gate handoff). It deliberately does **not** contain TDD tasks for the
fix-PRs: those are contingent on the register's findings and will be a separate
plan. Authoring fix tasks now would be placeholders ("fix whatever the audit
finds"), which this plan forbids.

---

## In-scope surfaces and their entry components

Resolved from `client/src/app/app-routes.tsx` (`APP_ROUTES`). These are the
**actual** rendered components (e.g. `dashboard.tsx`, not
`dashboard-modern.tsx`):

| #   | Surface                                   | Entry component file                                                               | Likely material sections (auditor confirms from the component)                                                                                  |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/fund-setup`                             | `client/src/pages/fund-setup.tsx`                                                  | Wizard steps (inputs), Review/finalize handoff (`client/src/pages/ReviewStep.tsx`), impact previews                                             |
| 2   | `/fund-model-results/:fundId`             | `client/src/pages/fund-model-results.tsx`                                          | Overview/Scorecard, Reserve Allocation, Deployment Pacing, GP Economics, Waterfall Setup, Scenario Analysis, publish-history/staleness controls |
| 3   | `/fund-model-results/:fundId/scenarios`   | `client/src/pages/fund-scenario-workspace.tsx`                                     | Scenario sets, single-set + cross-set comparison, scenario evidence                                                                             |
| 4   | `/dashboard`                              | `client/src/pages/dashboard.tsx`                                                   | KPI tiles, dual-forecast dashboard                                                                                                              |
| 5   | `/portfolio` (+ `/portfolio/company/:id`) | `client/src/pages/portfolio.tsx`, `client/src/pages/portfolio-company-summary.tsx` | Portfolio companies table, reserve planning persistence (M6)                                                                                    |
| 6   | `/forecasting`                            | `client/src/pages/forecasting.tsx`                                                 | Dual-forecast, drift callouts (#803)                                                                                                            |
| 7   | `/reports`                                | `client/src/pages/reports.tsx`                                                     | Report surfaces / exports                                                                                                                       |

Supporting files auditors will reference:

- `client/src/components/results/EvidenceHeader.tsx`,
  `client/src/components/results/ScenarioEvidenceHeader.tsx`,
  `client/src/components/results/scenario-evidence.ts`
- `client/src/components/fund-results/` (e.g. `ScenarioComparisonTable.tsx`,
  `CrossSetScenarioComparisonTable.tsx`, `ScenarioSetsSummary.tsx`)
- `client/src/components/dashboard/dual-forecast-dashboard.tsx`,
  `client/src/hooks/useDualForecast.ts`
- `shared/contracts/fund-results-v1.contract.ts`,
  `shared/contracts/fund-authoritative-calculations.contract.ts`,
  `shared/contracts/fund-scenario-comparison-v1.contract.ts`,
  `shared/contracts/fund-scenario-sets-v1.contract.ts`

---

## File structure (what this plan creates)

- Create: `docs/plans/2026-06-13-gp-trust-readiness-register.md` — the single
  output artifact (exec go/no-go list, findings table, coverage matrix).
- No source files are created or modified in Phase 0.

---

## Shared artifact A — the register skeleton

Task 0 writes this exact skeleton to
`docs/plans/2026-06-13-gp-trust-readiness-register.md`:

```markdown
---
status: ACTIVE
last_updated: 2026-06-13
owner: Core Team
categories: [trust, audit, rollout, register]
keywords: [trust-readiness, register, provenance, correctness, access-scope]
---

# GP Trust-Readiness Register (Phase 0 output)

Produced by the audit defined in
`docs/superpowers/specs/2026-06-13-gp-trust-readiness-audit-design.md`. Rubric
source of truth: `docs/design/analytics-visualization-principles.md`.

## Executive go/no-go list

Blocker and high cells that gate rollout, ordered by severity. (Populated in
synthesis, Task 9.)

| #   | Severity | Surface | Section | One-line gap | Maps-to |
| --- | -------- | ------- | ------- | ------------ | ------- |

## Findings

| Surface | Section | Axis | Verdict | Severity | Evidence (file:line) | Recommended fix | Maps-to |
| ------- | ------- | ---- | ------- | -------- | -------------------- | --------------- | ------- |

## Surface x section coverage matrix

| Surface | Sections audited | Cells with verdict | N/A cells (reason) | UNVERIFIED headline metrics |
| ------- | ---------------- | ------------------ | ------------------ | --------------------------- |

## Correctness reference status

Reference Excel acquired? (Task 8). If not, Axis B scoped to
authoritative-path + truth-case coverage; missing-reference follow-up recorded
here.

## Thin-rollout observations

First-use notes from the 1-2 GP thin rollout (Task 10), folded in as findings.
```

---

## Shared artifact B — the per-surface audit prompt template

Each surface-audit task (Tasks 1-7) instantiates this verbatim template,
substituting `{{SURFACE}}`, `{{ENTRY_FILE}}`, and `{{EXPECTED_SECTIONS}}` from
the in-scope table. Dispatch as an `Explore` (read-only) subagent.

```text
You are auditing ONE Updog surface for GP trust-readiness. READ-ONLY: do not edit any file.

Surface: {{SURFACE}}
Entry component: {{ENTRY_FILE}}
Expected material sections (confirm against the component; add/remove as the code actually renders): {{EXPECTED_SECTIONS}}

Rubric source of truth (READ IT FIRST): docs/design/analytics-visualization-principles.md

STEP 1 — Trace the real render. From {{ENTRY_FILE}}, enumerate every section that
presents MATERIAL output (a number, metric, chart, or table a GP would act on).
Per the project rule, trust the component the route ACTUALLY renders, not a name.

STEP 2 — Score each material section on three axes:

Axis A (provenance honesty):
  A1 Does the section carry an evidence header (state, config version, run marker, last-calculated timestamp, source)?
  A2 Are lifecycle states honest (READY/CALCULATING/STALE/FAILED/EMPTY/PARTIAL/UNAVAILABLE)? Are FAILED/UNAVAILABLE kept visible with explanation, not hidden? Does STALE show why + a recalc action? For the fund-scenario-calc async path: does a dead/timed-out job render FAILED/STALE truthfully (no infinite spinner, no silently-stale number)?
  A3 Any SAMPLE_DATA/mock/fixture rendered without the mandated DEMO ribbon + section border?
  A4 Is evidence section-specific, or illegally self-certified from route shape / top-level lifecycle? (Section-specific evidence must win over page-level lifecycle.)
  A5 Do config-backed sections (e.g. Waterfall) avoid faking a calc run; do mixed-source sections (Scorecard) avoid claiming a single false source?

Axis B (numeric correctness):
  B1 Is the value from the authoritative shared engine/contract, NOT a client-side fork?
  B2 Is the metric covered by a Phoenix truth case or parity test? (TVPI/DPI/MOIC/LP-GP IRR/carry/fees/reserves/clawback.)
  B3 Known Excel-parity gaps (XIRR/fees/waterfall)? Cross-check docs/xirr-excel-validation.md.
  B4 Is authoritative-vs-experimental labeled (reserve+pacing authoritative; cohort+economics experimental per fund-authoritative-calculations.contract.ts)?
  NOTE: Without a reference Excel, Axis B is only an authoritative-path + truth-case coverage check. Do NOT report B1/B2 passes as "the number is correct" — report as "authoritative-path + truth-case covered."

Axis C (access scope):
  C1 Is material data served behind a fund-access-guarded endpoint?
  C2 Canonical fund-id parsing (no hand-parse that can disagree with the server guard)?
  C3 SSE/live surfaces honest about transport (TRANSPORT-DEFERRED)?

STEP 3 — Emit one row per (section x failing-or-unverified axis). Pass-clean axes
need not produce a row, but record them in the coverage count. Each row MUST be:

  Surface | Section | Axis (A/B/C) | Verdict (TRUSTWORTHY|PROVENANCE-GAP|CORRECTNESS-GAP|SCOPE-GAP|UNVERIFIED) | Severity (blocker|high|medium|low) | Evidence (real file:line) | Recommended fix (one line) | Maps-to (PR B|PR C|PR D|new)

  Severity rules: blocker = a displayed number is wrong OR the UI actively lies (stale/mock as current, or wrong-fund data). high = provenance missing on a material number OR correctness UNVERIFIED for a headline metric. medium = secondary-metric gaps / low-traffic honesty issues. low = polish.
  UNVERIFIED on a headline metric counts as high.
  Maps-to: non-scenario evidence-header gaps -> PR B; scenario-comparison evidence/source-band gaps -> PR C; dual-forecast actuals/labeling gaps -> PR D; otherwise -> new.

  EVERY row's Evidence MUST be a real file:line that proves the verdict. Grep-absence is a lead, not evidence — confirm at the code layer.

STEP 4 — Return ONLY: (a) the list of material sections found, (b) the findings
rows, (c) a one-line coverage summary "N sections, M cells scored, K UNVERIFIED
headline metrics".
```

---

## Task 0: Scaffold the register

**Files:**

- Create: `docs/plans/2026-06-13-gp-trust-readiness-register.md`

- [ ] **Step 1: Write the register skeleton**

Write the exact content from "Shared artifact A" above to
`docs/plans/2026-06-13-gp-trust-readiness-register.md`.

- [ ] **Step 2: Verify it parses as the agreed structure**

Confirm the file contains the five sections: Executive go/no-go list, Findings,
Surface x section coverage matrix, Correctness reference status, Thin-rollout
observations. Confirm both tables have the exact column headers from the spec
(§4.2 findings columns; §4.3 coverage columns).

- [ ] **Step 3: Commit**

```bash
git add docs/plans/2026-06-13-gp-trust-readiness-register.md
git commit -m "docs(trust-audit): scaffold the GP trust-readiness register (Phase 0)"
```

---

## Tasks 1-7: Audit each surface (fan-out)

These seven tasks are independent and may run in parallel as `Explore`
subagents. Each instantiates "Shared artifact B" with its parameters, then
writes the returned findings rows into the register's **Findings** table and
updates the **coverage matrix** row for that surface.

Per Refinement C, weight effort toward **Axis B + UNVERIFIED** cells; treat Axis
A as a fast confirm-and-map onto PR B/C/D.

### Task 1: Audit `/fund-setup`

**Files:**

- Read: `client/src/pages/fund-setup.tsx`, `client/src/pages/ReviewStep.tsx`,
  `client/src/stores/fundStore.ts`
- Modify: `docs/plans/2026-06-13-gp-trust-readiness-register.md`

- [ ] **Step 1: Run the audit**

Instantiate Shared artifact B with:

- `{{SURFACE}}` = `/fund-setup`
- `{{ENTRY_FILE}}` = `client/src/pages/fund-setup.tsx`
- `{{EXPECTED_SECTIONS}}` = wizard steps (inputs), Review/finalize handoff,
  impact previews

- [ ] **Step 2: Verify finding quality**

Confirm every returned row has a real `file:line` and one of the five verdicts.
Spot-check 2 citations resolve to actual code. Note: `/fund-setup` is
input-heavy, so expect mostly `N/A` material-output cells — record the
finalize-handoff and any impact-preview as the material cells.

- [ ] **Step 3: Write findings into the register**

Append the rows to the **Findings** table; add the `/fund-setup` row to the
**coverage matrix**.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-06-13-gp-trust-readiness-register.md
git commit -m "docs(trust-audit): audit findings for /fund-setup"
```

### Task 2: Audit `/fund-model-results/:fundId` (the heart)

**Files:**

- Read: `client/src/pages/fund-model-results.tsx`,
  `client/src/components/results/EvidenceHeader.tsx`,
  `client/src/components/results/scenario-evidence.ts`,
  `shared/contracts/fund-results-v1.contract.ts`,
  `shared/contracts/fund-authoritative-calculations.contract.ts`
- Modify: `docs/plans/2026-06-13-gp-trust-readiness-register.md`

- [ ] **Step 1: Run the audit**

Instantiate Shared artifact B with:

- `{{SURFACE}}` = `/fund-model-results/:fundId`
- `{{ENTRY_FILE}}` = `client/src/pages/fund-model-results.tsx`
- `{{EXPECTED_SECTIONS}}` = Overview/Scorecard, Reserve Allocation, Deployment
  Pacing, GP Economics, Waterfall Setup, Scenario Analysis,
  publish-history/staleness controls

- [ ] **Step 2: Verify finding quality**

This is the largest surface — confirm each of the 7 expected sections is either
scored or explicitly marked `N/A`. Pay special attention to Axis A4 (section-
specific vs lifecycle evidence) and A5 (Waterfall fake-run / Scorecard
single-source). Spot-check 3 citations.

- [ ] **Step 3: Write findings into the register**

Append rows; add the coverage-matrix row. Map confirmed non-scenario evidence
gaps to **PR B**.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-06-13-gp-trust-readiness-register.md
git commit -m "docs(trust-audit): audit findings for /fund-model-results"
```

### Task 3: Audit `/fund-model-results/:fundId/scenarios`

**Files:**

- Read: `client/src/pages/fund-scenario-workspace.tsx`,
  `client/src/components/fund-results/ScenarioComparisonTable.tsx`,
  `client/src/components/fund-results/CrossSetScenarioComparisonTable.tsx`,
  `client/src/components/fund-results/ScenarioSetsSummary.tsx`,
  `client/src/components/results/ScenarioEvidenceHeader.tsx`,
  `shared/contracts/fund-scenario-comparison-v1.contract.ts`,
  `shared/contracts/fund-scenario-sets-v1.contract.ts`
- Modify: `docs/plans/2026-06-13-gp-trust-readiness-register.md`

- [ ] **Step 1: Run the audit**

Instantiate Shared artifact B with:

- `{{SURFACE}}` = `/fund-model-results/:fundId/scenarios`
- `{{ENTRY_FILE}}` = `client/src/pages/fund-scenario-workspace.tsx`
- `{{EXPECTED_SECTIONS}}` = scenario sets list, single-set comparison, cross-set
  comparison, scenario evidence rail

- [ ] **Step 2: Verify finding quality**

Confirm A2 explicitly covers the `fund-scenario-calc` async path (dead/timed-out
job -> FAILED/STALE, not infinite spinner). Spot-check 2 citations.

- [ ] **Step 3: Write findings into the register**

Append rows; add the coverage-matrix row. Map scenario-comparison evidence/
source-band gaps to **PR C**.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-06-13-gp-trust-readiness-register.md
git commit -m "docs(trust-audit): audit findings for /fund-model-results scenarios"
```

### Task 4: Audit `/dashboard`

**Files:**

- Read: `client/src/pages/dashboard.tsx`,
  `client/src/components/dashboard/dual-forecast-dashboard.tsx`,
  `client/src/hooks/useDualForecast.ts`
- Modify: `docs/plans/2026-06-13-gp-trust-readiness-register.md`

- [ ] **Step 1: Run the audit**

Instantiate Shared artifact B with:

- `{{SURFACE}}` = `/dashboard`
- `{{ENTRY_FILE}}` = `client/src/pages/dashboard.tsx`
- `{{EXPECTED_SECTIONS}}` = KPI tiles, dual-forecast dashboard
  (construction/actuals/current)

- [ ] **Step 2: Verify finding quality**

Confirm KPI tiles are checked for "hero metric with no
baseline/source/timestamp" (doctrine anti-pattern). Map dual-forecast
actuals/labeling gaps to **PR D**. Spot-check 2 citations.

- [ ] **Step 3: Write findings into the register**

Append rows; add the coverage-matrix row.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-06-13-gp-trust-readiness-register.md
git commit -m "docs(trust-audit): audit findings for /dashboard"
```

### Task 5: Audit `/portfolio` (+ `/portfolio/company/:id`)

**Files:**

- Read: `client/src/pages/portfolio.tsx`,
  `client/src/pages/portfolio-company-summary.tsx`
- Modify: `docs/plans/2026-06-13-gp-trust-readiness-register.md`

- [ ] **Step 1: Run the audit**

Instantiate Shared artifact B with:

- `{{SURFACE}}` = `/portfolio` (+ `/portfolio/company/:id`)
- `{{ENTRY_FILE}}` = `client/src/pages/portfolio.tsx` (and
  `portfolio-company-summary.tsx`)
- `{{EXPECTED_SECTIONS}}` = portfolio companies table, reserve planning
  persistence, company-detail metrics

- [ ] **Step 2: Verify finding quality**

Confirm Axis A3 (any SAMPLE_DATA/mock rendered without DEMO ribbon) is checked —
portfolio tables are a common place for fixture leakage. Spot-check 2 citations.

- [ ] **Step 3: Write findings into the register**

Append rows; add the coverage-matrix row.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-06-13-gp-trust-readiness-register.md
git commit -m "docs(trust-audit): audit findings for /portfolio"
```

### Task 6: Audit `/forecasting`

**Files:**

- Read: `client/src/pages/forecasting.tsx`,
  `client/src/components/dashboard/dual-forecast-dashboard.tsx`,
  `client/src/hooks/useDualForecast.ts`
- Modify: `docs/plans/2026-06-13-gp-trust-readiness-register.md`

- [ ] **Step 1: Run the audit**

Instantiate Shared artifact B with:

- `{{SURFACE}}` = `/forecasting`
- `{{ENTRY_FILE}}` = `client/src/pages/forecasting.tsx`
- `{{EXPECTED_SECTIONS}}` = dual-forecast chart, drift callouts, labeled
  tooltips

- [ ] **Step 2: Verify finding quality**

Confirm Axis A2 distinguishes construction / actuals / current-forecast honestly
(no misleading "live/real-time" language without a live transport). Map gaps to
**PR D**. Spot-check 2 citations.

- [ ] **Step 3: Write findings into the register**

Append rows; add the coverage-matrix row.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-06-13-gp-trust-readiness-register.md
git commit -m "docs(trust-audit): audit findings for /forecasting"
```

### Task 7: Audit `/reports`

**Files:**

- Read: `client/src/pages/reports.tsx`
- Modify: `docs/plans/2026-06-13-gp-trust-readiness-register.md`

- [ ] **Step 1: Run the audit**

Instantiate Shared artifact B with:

- `{{SURFACE}}` = `/reports`
- `{{ENTRY_FILE}}` = `client/src/pages/reports.tsx`
- `{{EXPECTED_SECTIONS}}` = report list / export surfaces, any embedded metrics

- [ ] **Step 2: Verify finding quality**

Confirm the doctrine's export rule is checked: any exportable/printed surface
must carry source/version/timestamp evidence. Spot-check 2 citations.

- [ ] **Step 3: Write findings into the register**

Append rows; add the coverage-matrix row.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-06-13-gp-trust-readiness-register.md
git commit -m "docs(trust-audit): audit findings for /reports"
```

---

## Task 8: Acquire / decide the correctness reference (Refinement B)

This is a **coordination** task and can start in parallel with Tasks 1-7; it
gates the quality of Axis B scoring.

**Files:**

- Modify: `docs/plans/2026-06-13-gp-trust-readiness-register.md` (the
  "Correctness reference status" section)

- [ ] **Step 1: Attempt to obtain a reference**

Ask the GP owner for ONE real fund's inputs + their own Excel model output for
the headline metrics (TVPI/DPI/IRR/carry/fees/reserves).

- [ ] **Step 2: Record the decision**

If obtained: note the fund + which metrics the Excel covers; these become the
value-level diff target for Phase 1 correctness fixes. If NOT obtained: write
explicitly in the register that Axis B is scoped to the honest floor
(authoritative-path + truth-case coverage), and list "acquire a reference Excel"
as the top-ranked correctness follow-up.

- [ ] **Step 3: Run the live truth-case count**

Run: `npm run phoenix:truth` Expected: a current pass/fail count. Record the
number in the register (do NOT hardcode a count from any doc).

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-06-13-gp-trust-readiness-register.md
git commit -m "docs(trust-audit): record correctness-reference status + live truth-case count"
```

---

## Task 9: Synthesize the register (go/no-go)

**Files:**

- Modify: `docs/plans/2026-06-13-gp-trust-readiness-register.md`

- [ ] **Step 1: Complete the coverage matrix**

Verify every in-scope `(surface x section)` cell has a verdict or an explicit
`N/A` with reason. Confirm no headline metric is left `UNVERIFIED` without being
escalated to `high`.

- [ ] **Step 2: Build the executive go/no-go list**

Filter the Findings table to `blocker` and `high` rows; copy them into the
**Executive go/no-go list**, ordered blocker-first then high, golden-path spine
(`fund-setup` -> results -> scenarios) before dashboard/portfolio/forecasting/
reports.

- [ ] **Step 3: Verify completeness (the audit's "test")**

Confirm: (a) coverage matrix has a row per surface; (b) every go/no-go entry
traces to a Findings row with a real `file:line`; (c) every `blocker`/`high` row
has a `Maps-to` value (PR B/C/D or "new").

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-06-13-gp-trust-readiness-register.md
git commit -m "docs(trust-audit): synthesize register + executive go/no-go list"
```

---

## Task 10: Thin-rollout track (Refinement A, parallel)

Runs in parallel with the audit. Gated only on `blocker` cells for the thin
exposure (does not wait for a fully-green register).

**Files:**

- Modify: `docs/plans/2026-06-13-gp-trust-readiness-register.md` (the
  "Thin-rollout observations" section)

- [ ] **Step 1: Identify 1-2 friendly GPs**

Pick GPs willing to walk the live golden path and give candid feedback.

- [ ] **Step 2: Prep a guided walkthrough**

Write a short walkthrough of the spine: `/fund-setup` -> finalize ->
`/fund-model-results/:fundId` -> `/scenarios`. Use a real or realistic fund.

- [ ] **Step 3: Capture first-use observations as findings**

Record each "this number looked wrong / I didn't trust this / I bounced here"
into the **Thin-rollout observations** section, then fold material ones into the
Findings table with a verdict + severity. First-use product-fit gaps ("doesn't
model what I care about") are the class the audit structurally cannot find —
capture them here.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-06-13-gp-trust-readiness-register.md
git commit -m "docs(trust-audit): fold thin-rollout first-use observations into register"
```

---

## Task 11: Phase 0 gate + handoff to the fix plan

**Files:**

- None (decision + handoff).

- [ ] **Step 1: Review the go/no-go list with the owner**

Confirm the `blocker`/`high` list is agreed. This is the gate: no fix-PR starts
before this agreement.

- [ ] **Step 2: Author the Phase 1 fix plan**

Invoke `superpowers:writing-plans` to create
`docs/superpowers/plans/2026-06-13-gp-trust-readiness-fixes.md`, turning each
`blocker`/`high` cell (or tight cluster) into a scoped fix-PR. Reuse PR B/C/D
task content from
`docs/plans/2026-06-02-scenario-comparison-evidence-workstream-plan.md` where
the `Maps-to` column points there. Code edits dispatch via Hermes per the
workflow contract; each PR validates with focused tests +
`npm run validate:core` (scenario/forecast PRs also
`npm run test:scenario-release-gate`; calc-touching PRs also
`npm run calc-gate`).

- [ ] **Step 3: Confirm rollout posture**

Thin rollout proceeds once `blocker` cells are clear; broad rollout waits for
golden-path `high` cells cleared. Record the current rollout tier in the
register.

---

## Self-Review

**1. Spec coverage** (against `2026-06-13-gp-trust-readiness-audit-design.md`):

- §2 in-scope surfaces -> Tasks 1-7 (all 7 surfaces). [covered]
- §3 Axis A/B/C rubric -> Shared artifact B (verbatim checklist). [covered]
- §3 verdict/severity model -> Shared artifact B Step 3. [covered]
- §4 register (go/no-go, findings, coverage matrix) -> Shared artifact A + Tasks
  0/9. [covered]
- §5 Phase 0 read-only + gate -> Tasks 1-9, Task 11 gate. [covered]
- §5 Refinement A (two-tier rollout) -> Task 10 + Task 11 Step 3. [covered]
- §5 Refinement B (reference Excel) -> Task 8 + Axis B note in template.
  [covered]
- §5 Refinement C (re-weight Axis B) -> stated in Tasks 1-7 preamble + template.
  [covered]
- §3 Refinement D (worker-failure honesty) -> Axis A2 in template + Task 3
  Step 2. [covered]
- §6 DoD (every cell verdict, zero blocker/high on golden path) -> Task 9 +
  Task 11. [covered]
- Phase 1+ fixes -> deliberately deferred to a separate plan (Task 11 Step 2),
  per the scope check. [covered]

**2. Placeholder scan:** No "TBD"/"implement later". The audit prompt and
register skeleton are provided verbatim, not described. Surface "likely
sections" are explicit starting hints with an instruction to confirm from the
component — this is audit method, not a placeholder.

**3. Type/name consistency:** Verdict enum
(`TRUSTWORTHY|PROVENANCE-GAP|CORRECTNESS-GAP|SCOPE-GAP|UNVERIFIED`), severity
(`blocker|high|medium|low`), and `Maps-to` values (PR B/C/D/new) are identical
in the spec, the template, the register skeleton, and Task 9. Register path
`docs/plans/2026-06-13-gp-trust-readiness-register.md` is identical across all
tasks.

---

## Notes for the executor

- Phase 0 is **read-only**; no production code changes, so no worktree is
  needed. Commits touch only the register markdown.
- The seven surface audits (Tasks 1-7) are the natural fan-out — dispatch as
  parallel `Explore` subagents, each returning structured rows, then a single
  writer merges them to avoid register write races.
- Do not start Phase 1 fixes before Task 11 Step 1 (the gate).
