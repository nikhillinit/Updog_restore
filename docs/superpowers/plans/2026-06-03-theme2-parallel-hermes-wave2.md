# Theme 2 Wave-2 Parallel-Hermes Token Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate three disjoint high-value surface groups (Portfolio,
Wizard/fund-setup, Scenarios+analytics) off raw Tailwind palettes onto canonical
Press On Ventures tokens, executed as three parallel Hermes/Codex agents landing
on one branch as a single batch PR.

**Architecture:** Three agents own non-overlapping file sets, so they edit the
same `design/rollout-wave-2` working tree concurrently with zero conflict. A
shared mapping file (`.hermes-wave2-mapping.md`) makes their token choices
converge. The human operator (Claude) is the reviewer: Hermes postflight is
tsc-only, so each agent's diff is verified by scope-diff + residual-grep +
`npm run check` + targeted tests + live eyeball before commit. The shared
`ui`/`layout`/`charts`/`dashboard`/`common` layer is OUT of scope (its own later
wave).

**Tech Stack:** Node `orchestrate.js` (Hermes single-file router) →
`codex exec`; React 18 + Tailwind; Vitest; the canonical tokens in
`client/src/theme/presson.tokens.ts` + `tailwind.config.ts`.

**Spec:**
`docs/superpowers/specs/2026-06-03-theme2-parallel-hermes-partition-design.md`
(read it first; Section 2 = the mapping, Section 5 = the 10-point acceptance
bar).

---

## Operating notes (read once before Task 0)

- **Finance-keyword trap.** Hermes scores the `--task` string; finance words
  (`fund`, `reserve`, `portfolio`, `waterfall`, `capital`, `allocation`,
  `monte-carlo`, `sensitivity`) self-promote the dispatch to the
  production-financial calc gate. **Keep every `--task` string generic** ("apply
  the color-token edits in `<file>`") and put all detail in the spec file. The
  dry-run (Task 2) is the hard gate: proceed only on `risk: standard, score: 0`.
- **Sandbox breaks Codex auth.** Every live `node orchestrate.js` Bash call must
  set `dangerouslyDisableSandbox: true`.
- **Reviewer owns verification.** Hermes postflight = `npm run check` only.
- **Commits.** Each verify task ends in a commit; the human operator greenlights
  the first push. No emoji; conventional commits.
- **Residual-grep regex (RX)** used throughout to find raw palette classes:
  ```
  \b(slate|zinc|stone|emerald|rose|amber|sky|indigo|violet|purple|fuchsia|teal|cyan|lime|gray|red|green|blue|yellow|orange|pink)-(50|100|200|300|400|500|600|700|800|900)\b
  ```
  Canonical tokens (`charcoal-*`, `pov-*`, `beige-*`, `success`, `error`,
  `warning`, `presson-*`) do NOT match RX, so post-migration a clean file
  returns zero RX hits (except lines carrying `// TODO(design)` /
  `// TODO(a11y)`).

---

## File structure — the three disjoint owned sets

**Group P — Portfolio (29 files):**

```
pages/CapTables.tsx
pages/CompanyDetail.tsx
pages/portfolio-company-summary.tsx
pages/portfolio-constructor.tsx
components/portfolio/**  (benchmarking-dashboard, column-configuration-dialog,
  drag-drop-chart-builder, enhanced-portfolio-analytics, investments-table,
  moic-analysis, portfolio-analytics-dashboard, portfolio-table, recent-activity,
  saved-views-manager, SecondaryMarketAnalysis, tag-performance-analysis,
  tabs/{AddCompanyDialog, AllocationsTab, allocations-table-columns,
  CompanySelectionTable, DeltaSummary, EditAllocationDialog, ReallocationTab,
  ReserveIcPacketCard, TotalsSummary, WarningsPanel})
components/portfolio-constructor/**  (FundStrategyBuilder, ReserveConfigurator,
  ScenarioComparison)
```

**Group W — Wizard/fund-setup (38 files):**

```
pages/{fund-setup, CapitalStructureStep, ExitRecyclingStep, InvestmentRoundsStep,
  InvestmentStrategyStep, InvestmentStrategyStepNew, ReviewStep, WaterfallStep}.tsx
components/wizard/**  (CollapsibleCard, EnhancedField, FinancialInput,
  FundConstructionKpiHeader, InfoBanner, InvestmentValidationCallout,
  LiveTotalsAside, PremiumSelect, PremiumToggle, ProfileHeader,
  SectorProfileSwitcher, StageAccordionRow, WizardHeader, WizardProgress,
  cards/{ReservesCard, StageAllocationCard})
components/modeling-wizard/**  (ModelingWizard, steps/capital-allocation/*,
  steps/exit-recycling/RecyclingSummaryCard, steps/sector-profiles/InvestmentStageForm,
  steps/waterfall/{WaterfallConfig, WaterfallSummaryCard})
```

**Group S — Scenarios+analytics (19 files):**

```
pages/{fund-scenario-workspace, sensitivity-analysis, analytics, moic-analysis}.tsx
components/forecasting/**  (allocation-modeling, investable-capital-summary,
  portfolio-flow-chart, portfolio-insights)
components/monte-carlo/**  (CalibrationStatusCard, ConfigForm, DataQualityCard,
  MetricDistributionChart, PercentileBandTable, RecommendationsPanel)
components/sensitivity/**  (_shared/SummaryCard, OneWayPanel,
  SensitivityRunErrorCard, StressPanel, TwoWayPanel)
```

Boundary rule (all groups): edit `.tsx`/`.ts` only (skip `README.md`); never
touch `components/{ui,layout,charts,dashboard,common}`; flag — don't fix — any
surface that needs a shared-layer change.

---

## Task 0: Prepare the wave-2 branch and shared mapping

**Files:**

- Create: branch `design/rollout-wave-2`
- Create: `.hermes-wave2-mapping.md` (repo-relative temp; deleted in Task 8)

- [ ] **Step 1: Park the unrelated staged orphan-chart deletion**

The Theme-3a orphan-chart deletion may be staged on `main` and is unrelated to
this color PR. Keep wave-2 pure by stashing it (recover later).

Run:

```bash
git status --porcelain | grep enhanced-dashboard-charts && git stash push --staged -m "theme3 orphan chart (defer)" || echo "nothing to park"
```

Expected: either a stash created, or "nothing to park".

- [ ] **Step 2: Create the wave-2 branch off main**

Run:

```bash
git switch main && git pull --ff-only && git switch -c design/rollout-wave-2
```

Expected: `Switched to a new branch 'design/rollout-wave-2'`.

- [ ] **Step 3: Write the shared mapping file**

Create `.hermes-wave2-mapping.md` containing **verbatim Section 2** of the spec
(the legal-output vocabulary, hard constraints, the 8-rule decision procedure
incl. 4a/4b, the affordance test, and the colorblind callout). Copy it from
`docs/superpowers/specs/2026-06-03-theme2-parallel-hermes-partition-design.md`.

- [ ] **Step 4: Commit the scaffold**

Run:

```bash
git add .hermes-wave2-mapping.md && git commit -m "chore(rollout): wave-2 shared token mapping scaffold"
```

Expected: one commit on `design/rollout-wave-2`.

---

## Task 1: Author the three per-group Hermes spec files

**Files:**

- Create: `.hermes-wave2-p.md`, `.hermes-wave2-w.md`, `.hermes-wave2-s.md`

- [ ] **Step 1: Write `.hermes-wave2-p.md`**

Contents (literal):

```markdown
# Wave-2 token migration — group P

Apply the color-token mapping and decision procedure in
`.hermes-wave2-mapping.md` EXACTLY. Migrate ONLY these files (edit .tsx/.ts
only):

<paste Group P file list from this plan's File Structure section>

Rules:

- Replace every raw Tailwind palette class (slate/gray/emerald/rose/amber/blue/
  indigo/purple/etc.) with the canonical token chosen by the decision procedure.
- Do NOT touch components/ui, components/layout, components/charts,
  components/dashboard, components/common.
- If a file needs a shared-layer change to look right, leave it and add
  `// TODO(design): needs shared-layer <file>`.
- Ambiguous intent → leave the class + `// TODO(design): <reason>`. Do not
  guess.
- Sole-channel red/green gain-loss with no +/-/arrow/label → add
  `// TODO(a11y)`.
- No behavioral/logic changes. Colors and Tailwind classes only.
- End with a Handoff block: files changed, count of classes migrated, list of
  every // TODO you added.
```

- [ ] **Step 2: Write `.hermes-wave2-w.md`** — identical template, Group W file
      list.

- [ ] **Step 3: Write `.hermes-wave2-s.md`** — identical template, Group S file
      list.

- [ ] **Step 4: Verify the three specs reference disjoint files**

Run:

```bash
grep -hoE "(pages|components)/[A-Za-z0-9/_-]+\.tsx" .hermes-wave2-p.md .hermes-wave2-w.md .hermes-wave2-s.md | sort | uniq -d
```

Expected: **empty output** (no file appears in two specs).

---

## Task 2: Dry-run all three dispatches (routing gate)

- [ ] **Step 1: Dry-run group P**

Run:

```bash
node orchestrate.js --dry-run --phase production --task "apply the color-token edits listed in .hermes-wave2-p.md"
```

Expected: routing plan shows `risk: standard` and `score: 0`. If it shows a
promoted/financial gate, the task string leaked a finance keyword —
re-neutralize it and re-run.

- [ ] **Step 2: Dry-run group W**

Run:

```bash
node orchestrate.js --dry-run --phase production --task "apply the color-token edits listed in .hermes-wave2-w.md"
```

Expected: `risk: standard, score: 0`.

- [ ] **Step 3: Dry-run group S**

Run:

```bash
node orchestrate.js --dry-run --phase production --task "apply the color-token edits listed in .hermes-wave2-s.md"
```

Expected: `risk: standard, score: 0`.

---

## Task 3: Live-dispatch the three agents (staggered, concurrent)

Each runs in the background; dispatch ~2–3s apart so the millisecond-timestamped
`runId` does not collide. **Set `dangerouslyDisableSandbox: true` on each Bash
call.**

- [ ] **Step 1: Dispatch group P (background)**

Run (Bash tool, `run_in_background: true`, `dangerouslyDisableSandbox: true`):

```bash
node orchestrate.js --phase production --task "apply the color-token edits listed in .hermes-wave2-p.md"
```

Expected: a backgrounded run; completion arrives as a task notification.

- [ ] **Step 2: Wait ~3s, dispatch group W (background)** — same flags,
      `.hermes-wave2-w.md`.

- [ ] **Step 3: Wait ~3s, dispatch group S (background)** — same flags,
      `.hermes-wave2-s.md`.

- [ ] **Step 4: Note the throttle fallback**

If Codex rate-limits (auth errors / 429 in the run output), kill the third run
and dispatch it after one of the first two completes. `log` that S was deferred
— no silent cap.

---

## Task 4: Verify + commit group P (on P's completion notification)

**Files:** the 29 Group P files.

- [ ] **Step 1: Scope-diff — confirm only owned files changed**

Run:

```bash
git diff --name-only | grep -vE "^(client/src/pages/(CapTables|CompanyDetail|portfolio-company-summary|portfolio-constructor)\.tsx|client/src/components/portfolio/|client/src/components/portfolio-constructor/)"
```

Expected: **empty** (every changed file is inside Group P). Any line printed =
out-of-scope edit → revert that file and re-flag.

- [ ] **Step 2: Residual-grep — confirm raw palette is gone**

Run:

```bash
grep -rnE "\b(slate|zinc|stone|emerald|rose|amber|sky|indigo|violet|purple|fuchsia|teal|cyan|lime|gray|red|green|blue|yellow|orange|pink)-(50|100|200|300|400|500|600|700|800|900)\b" client/src/components/portfolio client/src/components/portfolio-constructor client/src/pages/CapTables.tsx client/src/pages/CompanyDetail.tsx client/src/pages/portfolio-company-summary.tsx client/src/pages/portfolio-constructor.tsx | grep -v "// TODO("
```

Expected: **empty** (only `// TODO(...)` escalations remain, which the `grep -v`
filters out).

- [ ] **Step 3: Type gate**

Run: `npm run check` Expected: `[OK] No new TypeScript errors introduced`.

- [ ] **Step 4: Targeted tests**

Run: `npm test -- --project=client --run client/src/components/portfolio`
Expected: PASS (or no tests found). Local box is Node 24 — if it errors on
engine, trust CI and note it; do not block on the local engine warning.

- [ ] **Step 5: Commit group P**

Run:

```bash
git add client/src/components/portfolio client/src/components/portfolio-constructor client/src/pages/CapTables.tsx client/src/pages/CompanyDetail.tsx client/src/pages/portfolio-company-summary.tsx client/src/pages/portfolio-constructor.tsx
git commit -m "design(rollout): wave 2 — portfolio surfaces token migration"
```

Expected: one commit on `design/rollout-wave-2`.

---

## Task 5: Verify + commit group W (on W's completion notification)

**Files:** the 38 Group W files.

- [ ] **Step 1: Scope-diff**

Run:

```bash
git diff --name-only HEAD | grep -vE "^client/src/(pages/(fund-setup|CapitalStructureStep|ExitRecyclingStep|InvestmentRoundsStep|InvestmentStrategyStep|InvestmentStrategyStepNew|ReviewStep|WaterfallStep)\.tsx|components/wizard/|components/modeling-wizard/)"
```

Expected: **empty**.

- [ ] **Step 2: Residual-grep**

Run:

```bash
grep -rnE "\b(slate|zinc|stone|emerald|rose|amber|sky|indigo|violet|purple|fuchsia|teal|cyan|lime|gray|red|green|blue|yellow|orange|pink)-(50|100|200|300|400|500|600|700|800|900)\b" client/src/components/wizard client/src/components/modeling-wizard client/src/pages/fund-setup.tsx client/src/pages/CapitalStructureStep.tsx client/src/pages/ExitRecyclingStep.tsx client/src/pages/InvestmentRoundsStep.tsx client/src/pages/InvestmentStrategyStep.tsx client/src/pages/InvestmentStrategyStepNew.tsx client/src/pages/ReviewStep.tsx client/src/pages/WaterfallStep.tsx | grep -v "// TODO("
```

Expected: **empty**.

- [ ] **Step 3: Type gate** — `npm run check` →
      `[OK] No new TypeScript errors introduced`.

- [ ] **Step 4: Targeted tests** —
      `npm test -- --project=client --run client/src/components/wizard client/src/components/modeling-wizard`
      → PASS / none found.

- [ ] **Step 5: Commit group W**

Run:

```bash
git add client/src/components/wizard client/src/components/modeling-wizard client/src/pages/fund-setup.tsx client/src/pages/CapitalStructureStep.tsx client/src/pages/ExitRecyclingStep.tsx client/src/pages/InvestmentRoundsStep.tsx client/src/pages/InvestmentStrategyStep.tsx client/src/pages/InvestmentStrategyStepNew.tsx client/src/pages/ReviewStep.tsx client/src/pages/WaterfallStep.tsx
git commit -m "design(rollout): wave 2 — wizard/fund-setup surfaces token migration"
```

Expected: one commit.

---

## Task 6: Verify + commit group S (on S's completion notification)

**Files:** the 19 Group S files.

- [ ] **Step 1: Scope-diff**

Run:

```bash
git diff --name-only HEAD | grep -vE "^client/src/(pages/(fund-scenario-workspace|sensitivity-analysis|analytics|moic-analysis)\.tsx|components/forecasting/|components/monte-carlo/|components/sensitivity/)"
```

Expected: **empty**.

- [ ] **Step 2: Residual-grep**

Run:

```bash
grep -rnE "\b(slate|zinc|stone|emerald|rose|amber|sky|indigo|violet|purple|fuchsia|teal|cyan|lime|gray|red|green|blue|yellow|orange|pink)-(50|100|200|300|400|500|600|700|800|900)\b" client/src/components/forecasting client/src/components/monte-carlo client/src/components/sensitivity client/src/pages/fund-scenario-workspace.tsx client/src/pages/sensitivity-analysis.tsx client/src/pages/analytics.tsx client/src/pages/moic-analysis.tsx | grep -v "// TODO("
```

Expected: **empty**.

- [ ] **Step 3: Type gate** — `npm run check` →
      `[OK] No new TypeScript errors introduced`.

- [ ] **Step 4: Targeted tests** —
      `npm test -- --project=client --run client/src/components/sensitivity client/src/components/monte-carlo client/src/components/forecasting`
      → PASS / none found.

- [ ] **Step 5: Commit group S**

Run:

```bash
git add client/src/components/forecasting client/src/components/monte-carlo client/src/components/sensitivity client/src/pages/fund-scenario-workspace.tsx client/src/pages/sensitivity-analysis.tsx client/src/pages/analytics.tsx client/src/pages/moic-analysis.tsx
git commit -m "design(rollout): wave 2 — scenarios/analytics surfaces token migration"
```

Expected: one commit.

---

## Task 7: Cross-surface cohesion review + live eyeball (acceptance gate)

**Files:** none (verification only).

- [ ] **Step 1: Cohesion diff — same role → same token across all 3 groups**

Run:

```bash
git diff main...design/rollout-wave-2 -- client/src | grep -E "^\+.*(charcoal|pov-|beige|presson-|success|error|warning)" | grep -oE "(bg|text|border)-[a-z-]+" | sort | uniq -c | sort -rn | head -40
```

Expected: a small, consistent token set (no surprise one-off tokens). Eyeball
for the same role mapping to one token everywhere (AC#5).

- [ ] **Step 2: Inventory the escalations**

Run:
`git diff main...design/rollout-wave-2 | grep -E "^\+.*// TODO\((design|a11y)\)"`
Expected: a finite list. Record it in the PR body as known-deferred follow-ups.

- [ ] **Step 3: Launch the app in memory mode**

Run (background): `ALLOW_MEMORY_STORAGE=1 npm run dev` Then drive
`http://localhost:5173` (NOT :5000 — stale build) with the installed
Playwright + chromium headless shell. MemStorage auto-seeds Fund 1 so /portfolio
and the wizard render with data.

- [ ] **Step 4: Walk the acceptance bar (Section 5, AC#1–#10) per surface
      group**

For /portfolio, the fund-setup wizard flow, and /scenarios + sensitivity:
confirm hierarchy preserved (ink/muted/tertiary distinct, AC#2),
charcoal-dominant single accent with zero blue-as-action and zero purple (AC#3),
financial direction still legible (AC#4), JetBrains Mono on numeric labels,
restrained shadows + warm borders (AC#6). Note: the FMR economics chart is
flag-gated off in memory mode — verify any flag-gated chart palette by faithful
render, not live calc.

- [ ] **Step 5: Stop the dev server.** Record PASS/FAIL per group with
      screenshots.

---

## Task 8: Open the single wave-2 batch PR + cleanup

- [ ] **Step 1: Delete the temp Hermes files**

Run:

```bash
rm -f .hermes-wave2-mapping.md .hermes-wave2-p.md .hermes-wave2-w.md .hermes-wave2-s.md
git add -A && git commit -m "chore(rollout): remove wave-2 hermes scratch files"
```

Expected: one commit; `git status --porcelain` shows no stray `.hermes-*`.

- [ ] **Step 2: Push the branch (operator greenlight required)**

Run:

```bash
git push -u origin design/rollout-wave-2
git ls-remote --heads origin design/rollout-wave-2
```

Expected: the second command prints the branch SHA (proves the push landed —
`git push | tail` lies about exit status).

- [ ] **Step 3: Open the PR**

Run:

```bash
gh pr create --base main --head design/rollout-wave-2 --title "design(rollout): wave 2 — token migration (portfolio, wizard, scenarios)" --body-file .pr-body-wave2.md
```

PR body must list: the 3 surface groups + file counts, the acceptance-bar result
from Task 7, the `// TODO(design)`/`// TODO(a11y)` deferred list from Task 7
Step 2, and a note that the shared `ui`/`layout`/`charts` layer + Investments
group are deferred to later waves.

- [ ] **Step 4: Restore the parked orphan-chart deletion (if stashed in
      Task 0)**

Run:
`git stash list | grep "theme3 orphan chart" && echo "pop on main after wave-2 merges" || echo "nothing parked"`
Expected: a reminder to land Theme-3a separately once wave-2 merges.

---

## Self-review (spec coverage)

- **Scope (spec):** first-wave, 3 named groups, shared layer excluded → Tasks
  1–6 cover exactly P/W/S; Task 0 boundary rule + scope-diffs enforce the
  exclusion. ✓
- **Mapping (spec §2):** the 8-rule procedure incl. 4a/4b, affordance test,
  colorblind callout → carried verbatim into `.hermes-wave2-mapping.md` (Task 0
  Step 3) and referenced by every agent spec. ✓
- **Dispatch (spec §3):** branch-first, finance-keyword-free task, dry-run gate,
  staggered background, sandbox-disable, throttle fallback → Tasks 0/2/3. ✓
- **Review (spec §4):** scope-diff, residual-grep, `npm run check`, targeted
  tests, live eyeball, per-group commits, single batch PR → Tasks 4–8. ✓
- **Risks (spec §5):** R1 disjoint+scope-diff (Task 1.4, 4–6.1); R2 stagger (3);
  R3 throttle (3.4); R4 shared mapping + cohesion diff (7.1); R5 AC eyeball
  (7.4); R6 TODO(design) flags; R7 faithful-render note (7.4). ✓
- **Acceptance (spec §5, AC#1–#10):** residual-grep (#1), eyeball (#2–#4,#6),
  cohesion diff (#5), gate (#8), TODO inventory (#9/#10). ✓
- **Placeholders:** none — every step has an exact command + expected output.
- **Type consistency:** branch name, file lists, RX, and commit scopes match
  across Tasks 0–8.

No gaps found.

---

## Execution Handoff

After this plan is approved, two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between
   tasks. _Caveat: the actual file edits are dispatched to Hermes/Codex (Tasks
   3–6); the subagent orchestrates dispatch + verification, it does not
   hand-edit._
2. **Inline Execution** — run tasks in this session with checkpoints (natural
   fit here, since the operator must watch async Hermes completions and drive
   the live eyeball).

Which approach?
