# Post-M9 Priority Targets

Status: rebaselined on 2026-05-17; all actionable May 8 queue lanes closed or
deferred by current evidence.
Source: M9 closeout PRD `.omx/plans/prd-m9-closeout-priority-targets.md`.
Created: 2026-04-30.

This document ranked the next targets after M9. It does not implement any
target, expand product scope, or reopen M9. As of the 2026-05-17 rebaseline,
the executable follow-up queue from this ranking is exhausted on current
`main`; any new work needs a fresh priority intake before implementation.

## 1. Schema-Drift Remediation For Active Product Surfaces

Evidence: Phase 6 deleted the Notion phantom cluster, but cohort,
portfolio-optimization, LP, shares, sensitivity, and snapshots-related clusters
were deferred because they touch active or potentially active product surfaces.

Why ranked here: schema drift can invalidate route behavior, migrations, and
type assumptions across the app. It has the broadest correctness risk among the
known post-M9 items.

Risk if deferred: future feature work may build on stale schema assumptions or
normalize around accidental live-DB mismatches.

Recommended next workflow: `$ralplan` for a schema-specific decision plan, then
`$team` only if the approved plan splits into independent schema, route, and
verification lanes.

Closeout note: first B1 tranche closed on 2026-05-17. Current `main` has a
Windows-compatible active-surface schema drift inventory gate and intentionally
does not perform broad schema remediation until that gate reports true drift.

## 2. Explicit-Any Drawdown Milestone

Evidence: M9 planning kept explicit-any drawdown out of scope and carried a
historical Phase 6 count of 363. There is no current
`.baselines/eslint-output.json` artifact in the tree, so the next workflow must
remeasure before choosing a tranche.

Why ranked here: explicit `any` weakens the TypeScript contract, but the blast
radius is larger and less urgent than schema truth for active data surfaces.

Risk if deferred: weak types continue to hide contract drift and make future
refactors more expensive.

Recommended next workflow: `$ralplan` to choose a narrow slice and lock the
baseline policy before cleanup; use `$ralph` for one bounded tranche at a time.

Closeout note: first B2 tranche closed on 2026-05-17. The approved runtime-only
drawdown removed the two BullMQ result-generic `any` usages from
`server/queues/backtesting-queue.ts`; follow-up drawdown work needs a new
fresh baseline.

## 3. Variance 1C.3 Items B/C Trigger Review

Evidence: Items B and C remain re-deferred from M8 with explicit triggers in
`docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`.

Why ranked here: the work is important but trigger-gated; it should not outrank
always-present schema/type debt unless a trigger has fired.

Risk if deferred: if a trigger has fired unnoticed, baseline incident handling
or scheduler isolation may lag behind operational need.

Recommended next workflow: `$analyze` to check whether the documented triggers
have fired, then `$ralplan` only if evidence says the work is now active.

Closeout note: B3 trigger review closed on 2026-05-17. No repository evidence
showed that Item B or Item C promotion triggers fired, so no implementation
lane is active.

## 4. Vite 6 Audit Sweep

Evidence: Vite 6 is part of the current stack, and the M9 requirements kept the
audit sweep deferred as speculative.

Why ranked here: tooling drift can become expensive, but no current failure is
attached to the audit.

Risk if deferred: latent plugin, dev-server, or build incompatibilities may
surface later under less controlled conditions.

Recommended next workflow: direct decision or `$analyze` if a real Vite-related
failure appears; otherwise leave deferred.

Closeout note: still deferred at the 2026-05-17 rebaseline. Current local
evidence confirms Vite remains part of the stack, but no current build,
dev-server, test, or advisory evidence promotes this to an active lane.

## 5. `.a5c/processes/sensitivity-stress-panel.inputs.json` Whitelist Decision

Evidence: M9 kept this as a small gitignore/whitelist decision rather than a
milestone item.

Why ranked here: it is low-risk and operationally bounded, but it is not a core
correctness blocker.

Risk if deferred: local process inputs may remain ambiguous in status output and
review hygiene.

Recommended next workflow: direct decision after inspecting whether the file is
machine-generated, environment-specific, or intended as shared process input.

Closeout note: resolved by current git state at the 2026-05-17 rebaseline.
`.a5c/processes/sensitivity-stress-panel.inputs.json` exists, is tracked, and
is not ignored.
