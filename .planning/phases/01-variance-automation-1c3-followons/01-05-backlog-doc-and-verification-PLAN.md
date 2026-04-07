---
phase: 01-variance-automation-1c3-followons
plan: 05
type: execute
wave: 4
depends_on:
  - 01
  - 02
  - 03
  - 04
files_modified:
  - docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md
autonomous: true
requirements:
  - REQ-VAR-02
  - REQ-VAR-03
must_haves:
  truths:
    - "Item B section in the 1C.3 backlog doc has an updated 'Trigger to act'
      line with 2026-04-07 decision trail per D-05"
    - "Item C section has an updated 'Trigger to act' line with 2026-04-07
      decision trail per D-06"
    - 'Item A section has a status note acknowledging Phase 1 shipped it'
    - 'npm run validate:core exits 0'
    - 'npm run phoenix:truth exits 0'
    - 'No emoji added to any artifact (No-emoji policy)'
  artifacts:
    - path: 'docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md'
      provides: 'Updated backlog with Phase 1 decision trail for Items A/B/C'
      contains: '2026-04-07 Phase 1 decision trail'
  key_links:
    - from: 'backlog doc Item B'
      to: 'D-05'
      via: 'updated Trigger to act line'
      pattern: 'Trigger to act'
    - from: 'backlog doc Item C'
      to: 'D-06'
      via: 'updated Trigger to act line'
      pattern: 'Trigger to act'
---

<objective>
Close out Phase 1 by (1) updating the 1C.3 backlog doc with the D-05/D-06/D-07 re-deferral decision trail for Items B and C, (2) acknowledging that Item A shipped in Phase 1, and (3) running the Phase 1 exit gates (`npm run validate:core` and `npm run phoenix:truth`). This plan covers REQ-VAR-02 and REQ-VAR-03 — which are documentation-only per D-05 and D-06 — and runs the phase success criterion 3 verification.

Per D-07, this doc update rides in the Phase 1 PR because the decision trail is
directly caused by the Phase 1 analysis. It is NOT bundled scope — it is
documentation hygiene.

Purpose: every requirement ID (REQ-VAR-01, 02, 03) maps to a shipped artifact,
and the exit gates prove the phase introduced no regressions.

Output: updated backlog doc + green exit gates. </objective>

<execution_context>
@C:/Users/nikhi/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/nikhi/.claude/get-shit-done/templates/summary.md </execution_context>

<context>
@.planning/phases/01-variance-automation-1c3-followons/01-CONTEXT.md
@docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md
@CLAUDE.md

<interfaces>
<!-- The exact existing text of the three Trigger to act lines in the backlog doc. -->

From docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md
(current state):

Item A § Trigger to act (line ~51):

```
**Trigger to act:** multi-instance planner churn becomes operationally meaningful (visible in logs, measurable scheduler latency, or operator complaints). Until then, accepted as cost.
```

Item B § Trigger to act (line ~73):

```
**Trigger to act:** operators report stale-incident clutter, or LP-facing reports surface the older baselines, or the alert filter UX proves insufficient.
```

Item C § Trigger to act (line ~95):

```
**Trigger to act:** background workload grows materially, deployment topology gains a worker tier for other reasons, or web-app restarts become a scheduler correctness liability.
```

File frontmatter currently:

```yaml
# (frontmatter block)
last_updated: 2026-04-07
status: BACKLOG
```

(The `last_updated` field stays 2026-04-07; the `status` field stays BACKLOG
because Items B and C remain in the backlog.)

From package.json (verified by the plan revision — these are the exact script
definitions):

```json
"baseline:check": "node scripts/typescript-baseline.cjs check",
"check": "npm run baseline:check",
"validate:core": "npm run baseline:check && npm run test:publish-orchestration && npm run test:phase4 && npm run lint:phase4",
"phoenix:truth": "cross-env TZ=UTC vitest run tests/unit/truth-cases/"
```

IMPORTANT — there is NO `baseline:save` npm script. The baseline save action is
invoked directly via `node scripts/typescript-baseline.cjs save` (the CLI on
scripts/typescript-baseline.cjs supports the `save`, `check`, and `progress`
subcommands). Do NOT run `npm run baseline:save` — it will fail with
`npm error Missing script: "baseline:save"`. </interfaces> </context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Update backlog doc Item A with Phase 1 status note</name>
  <files>docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md</files>
  <read_first>
    - docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md (FULL file — 141 lines, lightweight)
    - .planning/phases/01-variance-automation-1c3-followons/01-CONTEXT.md (D-05, D-06, D-07)
    - .planning/ROADMAP.md § Phase 1 Success Criteria (criterion 4)
    - CLAUDE.md § No Emoji Policy
  </read_first>
  <action>
Open `docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md` and make THREE precise edits.

### Edit 1 — Item A: add a "Status (2026-04-07, Phase 1)" subsection

Find the `### Item A: Planner Loop Leader Election` section (around line 38).
AFTER the last bullet of the existing "Approximate scope when acted on:" list
and BEFORE the `### Item B: Auto-Resolve Superseded Baseline-Scoped Incidents`
heading, insert a new subsection:

```markdown
**Status (2026-04-07, Phase 1):** SHIPPED. Phase 1 of Milestone M8 implemented
Item A as described above. Leader election primitive is a single-row
`variance_planner_leader` heartbeat table (D-01 rejected advisory locks because
Neon PgBouncer in transaction mode does not preserve session-scoped locks across
queries, and rejected Redis to avoid split-brain risk + `memory://` fallback
drift in dev/test). Lease is 10 minutes with 2.5-minute renewal cadence, both
tunable via `VARIANCE_PLANNER_LEASE_MS` and `VARIANCE_PLANNER_RENEWAL_MS`.
Single global leader across all frequencies (D-03). Leader gate is scoped to
`runPlannerCycle` only — `runProcessorCycle` and `recoverStaleProcessingJobs`
continue to run on every instance for resilience (D-04). Crash-takeover is
verified by an in-process integration test (lease fast-forward, no child process
per REFL-024). See phase directory
`.planning/phases/01-variance-automation-1c3-followons/` for the full decision
trail.
```

Do NOT delete the existing bullets — the `**Status**` note is ADDED, not a
replacement. This preserves the historical "when we deferred this from 1C.2"
context.

### Edit 2 — Item B: update Trigger to act per D-05

Find the `### Item B: Auto-Resolve Superseded Baseline-Scoped Incidents`
section. Replace the existing `**Trigger to act:**` line (line ~73) with this:

```markdown
**Trigger to act (restated 2026-04-07, Phase 1 decision trail — see D-05):**
operator reports stale-incident clutter, OR LP-facing reports surface incidents
against retired baselines, OR the alert filter UX proves insufficient in
practice. No signal observed in the 2026-03/2026-04 commit stream; the read-side
filter shipped in `b8d3bd60` is holding. Re-deferred from Phase 1 (M8 1C.3
follow-ons) on 2026-04-07 per the Phase 1 context file — auto-resolution remains
in backlog until one of the above triggers fires.
```

Do NOT modify any other line in Item B.

### Edit 3 — Item C: update Trigger to act per D-06

Find the `### Item C: Move Scheduler To Dedicated Worker Process` section.
Replace the existing `**Trigger to act:**` line (line ~95) with this:

```markdown
**Trigger to act (restated 2026-04-07, Phase 1 decision trail — see D-06):**
background workload materially grows beyond current variance/baseline cadence,
OR deployment topology gains a worker tier for other reasons, OR web-app restart
rate becomes a scheduler correctness liability. No scale pressure, no topology
change, no web-app restart correctness issue observed in 2026-03/2026-04. The
Phase 1 leader election (Item A, SHIPPED) is the scaffolding this item will
build on when a trigger fires. Re-deferred from Phase 1 (M8 1C.3 follow-ons) on
2026-04-07 per the Phase 1 context file.
```

Do NOT modify any other line in Item C.

### Edit 4 — Update frontmatter last_updated

Change the frontmatter `last_updated: 2026-04-07` to `last_updated: 2026-04-07`
(if today's run happens to be a different date, use today's date). The
`status: BACKLOG` stays the same because Items B and C remain deferred.

### Constraints

- No emoji added anywhere (CLAUDE.md § No-emoji policy)
- No new sections created beyond the Item A status note
- No deletions from Item A or Item C body text (other than the one
  `Trigger to act` line each)
- Markdown formatting must remain valid (headings, blank lines between blocks)
- Commit style: use Conventional Commits
  (`docs(01-variance-automation-1c3-followons):` prefix)
- Run
  `npx prettier --check docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`
  to verify formatting. If Prettier rewrites anything, apply
  `npx prettier --write` and re-verify. The project uses Prettier for Markdown —
  recent commit `ab0b17ff` mentions "repair Prettier markdown corruption" so
  this is a known gotcha. </action> <verify> <automated>grep -c "SHIPPED"
  docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md &&
  grep -c "restated 2026-04-07, Phase 1 decision trail"
  docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md &&
  npx prettier --check
  docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md</automated>
  </verify> <acceptance_criteria> -
  `grep -c "Status (2026-04-07, Phase 1)" docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`
  returns `1` -
  `grep -c "SHIPPED" docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`
  returns at least `1` -
  `grep -c "VARIANCE_PLANNER_LEASE_MS" docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`
  returns `1` -
  `grep -c "restated 2026-04-07, Phase 1 decision trail" docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`
  returns `2` (Item B + Item C) -
  `grep -c "D-05" docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`
  returns at least `1` -
  `grep -c "D-06" docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`
  returns at least `1` -
  `npx prettier --check docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`
  exits 0 - No emoji characters present (verify with a grep for common emoji
  unicode ranges or eyeball the diff) -
  `git diff docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`
  shows exactly three content changes (Item A status note, Item B trigger, Item
  C trigger) plus the frontmatter `last_updated` line — no other lines modified
  </acceptance_criteria> <done>Backlog doc reflects D-05/D-06/D-07 with Item A
  marked SHIPPED, Item B and Item C triggers restated with 2026-04-07 decision
  trail, Prettier-clean, no emoji.</done> </task>

<task type="auto" tdd="false">
  <name>Task 2: Run phase exit gates (npm run validate:core and npm run phoenix:truth)</name>
  <files>(none — verification-only; no file mutations)</files>
  <read_first>
    - package.json (lines 28-30 for `baseline:check` and `validate:core`, line 58 for `phoenix:truth` — confirm exact commands. Note: there is NO `baseline:save` script; the save path is `node scripts/typescript-baseline.cjs save`)
    - scripts/typescript-baseline.cjs (the CLI has `save`, `check`, and `progress` subcommands at the bottom of the file; `save` writes `.tsc-baseline.json`)
    - .planning/ROADMAP.md § Phase 1 Success Criteria (criterion 3 mandates both are green)
    - MEMORY.md note "Pre-Push Baseline vs Local tsc" (validate:core may surface TS4111 drift even when local tsc passes; if it does, investigate rather than paper over)
    - MEMORY.md note "Phoenix truth case count is in drift" — never trust docs for the count; the live `npm run phoenix:truth` output is authoritative
  </read_first>
  <action>
Run both exit gates in sequence (they are independent, but running them sequentially makes the diagnostic output easier to read). Do NOT proceed to declare the phase complete unless BOTH exit 0.

### Step 1: Run `npm run validate:core`

```bash
npm run validate:core
```

This runs
`npm run baseline:check && npm run test:publish-orchestration && npm run test:phase4 && npm run lint:phase4`
(per package.json line 30). Expected outcome: exit 0.

Common failure modes and remediations (from memory):

- `baseline:check` fails with "NEW ERRORS DETECTED" but no new TS errors
  introduced: the baseline file is stale. Remediation: run
  `node scripts/typescript-baseline.cjs save && git add .tsc-baseline.json`,
  then re-run `validate:core`. IMPORTANT: do NOT run `npm run baseline:save` —
  that script does NOT exist in `package.json`; the only scripts related to the
  baseline are `baseline:check` and `check`. The save path is the direct node
  invocation on the CJS file. Do NOT commit a stale baseline bump silently —
  note it in the phase summary with justification.
- `baseline:check` fails with actual new TS errors in files this phase touched:
  fix the TS errors in those files before proceeding. The only files this phase
  touches are `shared/schema.ts`,
  `server/services/variance-alert-automation.ts`,
  `tests/unit/services/variance-alert-automation.test.ts`,
  `tests/integration/variance-planner-leader-election.test.ts`,
  `server/db/migrations/0011_*.sql`, and the backlog doc — so failures should be
  narrow and directly fixable. A stale-baseline scenario is unlikely for a phase
  that touches this few files.
- `test:publish-orchestration` or `test:phase4` fails: run the failing file in
  isolation first to rule out flake; if it is a real regression, go back to Plan
  02 or 03 and fix it.
- `lint:phase4` fails with "unused import" on `variancePlannerLeader`: the
  linter import hook stripped the new import. Re-add it in the same edit as the
  consuming code (see MEMORY "Linter Edit Hook -- Import Ordering").

Do NOT swallow failures. If validate:core fails and the failure is not
remediable within this task, STOP and surface the specific error to the user.

### Step 2: Run `npm run phoenix:truth`

```bash
npm run phoenix:truth
```

This runs `cross-env TZ=UTC vitest run tests/unit/truth-cases/` (per
package.json line 58). Expected outcome: exit 0.

Phase 1 does not touch any calc path (`shared/core/reserves/**`, any Phoenix
truth case fixture, any calculation engine) — so phoenix:truth is pass-through.
If it fails:

- Confirm the failure is not in a file this phase touched (it should not be).
- If it is in a truth case, re-run the failing truth case in isolation. Flakes
  are possible if the test harness depends on system time.
- If it is a real regression, escalate — a calc path regression from a pure
  scheduler-infra phase would indicate something else in main changed.

### Step 3: Confirm the phase changes match the files_modified frontmatter of all 5 plans

Run `git status` and `git diff --stat`. The list of modified files across all
Phase 1 plans must be exactly:

- `shared/schema.ts` (Plan 01)
- `server/db/migrations/0011_variance_planner_leader.sql` (Plan 01)
- `server/db/migrations/rollback/0011_variance_planner_leader_down.sql`
  (Plan 01)
- `server/services/variance-alert-automation.ts` (Plan 02)
- `tests/unit/services/variance-alert-automation.test.ts` (Plan 03)
- `tests/integration/variance-planner-leader-election.test.ts` (Plan 04, new
  file)
- `docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`
  (Plan 05)

Plus the 5 PLAN.md files themselves and any SUMMARY.md files generated by
execute-phase. That is the COMPLETE list. If `git status` shows any other
modified file, there is collateral — investigate before proceeding.

### Step 4: Report the exit gate results

Report PASS/FAIL for each command explicitly in the task output. Do not just say
"done" — paste the final `Test Files` and `Tests` lines from `phoenix:truth`
output and the final exit-code line from `validate:core`. </action> <verify>
<automated>npm run validate:core && npm run phoenix:truth</automated> </verify>
<acceptance_criteria> - `npm run validate:core` exits 0 — confirmed by the final
exit code line - `npm run phoenix:truth` exits 0 — confirmed by the vitest
`Test Files ... passed` summary line - `git status` shows only the expected
files modified (no collateral drift) - `git status` does NOT show
`server/lib/locks.ts` modified (confirming D-01 rejection held) - `git status`
does NOT show `server/routes.ts` modified (confirming constraint 11 held) -
`git status` does NOT show any file under `shared/core/reserves/` modified
(confirming no calc path drift) - `git status` does NOT show any file under
`server/queues/` or `server/workers/` modified (confirming processor path
untouched) - The task output contains the literal strings "validate:core PASSED"
and "phoenix:truth PASSED" (or equivalent explicit PASS markers) - If a
stale-baseline remediation was required, the save was performed via
`node scripts/typescript-baseline.cjs save` (NOT `npm run baseline:save`, which
does not exist as a script) </acceptance_criteria> <done>Both exit gates are
green, no collateral file drift, phase verification complete.</done> </task>

</tasks>

<threat_model>

## Trust Boundaries

Documentation and verification-only — no new trust boundaries introduced.

## STRIDE Threat Register

| Threat ID | Category                                         | Component                           | Disposition | Mitigation Plan                                                                                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------ | ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-05-01   | Information Disclosure — leaking user decisions  | backlog doc update                  | accept      | The decision trail references D-05/D-06/D-07 by ID and points to `.planning/phases/01-variance-automation-1c3-followons/` — these are internal engineering artifacts already in the repo. No secrets.                                                                                                                           |
| T-05-02   | Scope creep — Item B/C work riding on Phase 1 PR | doc edit task                       | mitigate    | The acceptance criteria grep for ONLY the three content changes (Item A status, Item B trigger, Item C trigger) + frontmatter. `git diff` showing any other modification fails the task. D-07 is explicit: ONLY the doc update rides in the Phase 1 PR, not any implementation work for B/C.                                    |
| T-05-03   | Silent exit-gate failure                         | `validate:core` and `phoenix:truth` | mitigate    | The task explicitly requires reporting exit codes and refuses to silently continue on failure. MEMORY notes on stale baselines and phoenix drift are required reading so the executor can distinguish real regressions from known gotchas.                                                                                      |
| T-05-04   | Prettier corruption of the doc edit              | Markdown edit                       | mitigate    | Task runs `npx prettier --check` and `--write` as part of acceptance. Recent commit `ab0b17ff` is the reference for why this matters.                                                                                                                                                                                           |
| T-05-05   | Stale-script invocation (baseline:save)          | exit-gate remediation path          | mitigate    | The action, read_first, and acceptance criteria all document that `baseline:save` is NOT an npm script and the save path is `node scripts/typescript-baseline.cjs save`. An executor that copy-pastes `npm run baseline:save` from prior docs would hit `npm error Missing script`; the updated text prevents that false start. |

</threat_model>

<verification>
- Backlog doc has the three documented edits and Prettier-checks clean
- `npm run validate:core` exits 0
- `npm run phoenix:truth` exits 0
- `git status` shows no unexpected file modifications
- No emoji in the doc edit
</verification>

<success_criteria>

- REQ-VAR-02 and REQ-VAR-03 coverage via the doc update (D-05/D-06/D-07
  traceable in the doc text)
- Item A marked SHIPPED in the backlog doc
- Phase 1 success criterion 3 (validate:core + phoenix:truth green) satisfied
- Phase 1 success criterion 4 (Items B and C explicitly re-deferred with
  rationale) satisfied
- No collateral file drift outside the expected file list </success_criteria>

<output>
After completion, create `.planning/phases/01-variance-automation-1c3-followons/01-05-SUMMARY.md` documenting:
- The three doc edits made
- `npm run validate:core` final output line (PASS/FAIL)
- `npm run phoenix:truth` final output line (PASS/FAIL)
- Current Phoenix truth case count (pulled from the live run output — per MEMORY note, never trust docs)
- Full list of files modified across all 5 Phase 1 plans
- Explicit confirmation that `server/lib/locks.ts`, `server/routes.ts`, `runProcessorCycle`, `recoverStaleProcessingJobs`, `runCalcRunCompletion`, and `job_outbox` are unchanged
- Whether a stale-baseline remediation was required; if so, the exact `node scripts/typescript-baseline.cjs save` invocation and git commit SHA
</output>
</content>
</invoke>
