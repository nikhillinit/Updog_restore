---
status: SUPERSEDED
last_updated: 2026-04-05
superseded_by:
  - docs/plans/2026-03-31-variance-roadmap-revision.md
  - docs/plans/2026-04-03-phase-1a2-baseline-automation-hardening-validated.md
  - docs/plans/2026-04-03-phase-1b-single-owner-pr-queue.md
depends_on:
  - docs/STABILIZATION-ROADMAP.md
  - docs/plans/2026-03-27-secondary-surface-decisions.md
---

# Post-Stabilization Priorities (Superseded Draft)

> **Status (2026-04-05)**: This DRAFT was written before the 2026-03-31 variance
> roadmap revision, which became the operational sequencing doc for
> post-stabilization work. The priorities below (Results Intelligence, Portfolio
> Planning Persistence) overlap with and were absorbed by the variance/1A/1B/1C
> stream. Retained as historical context; do not execute from this document.

## Purpose

Define the first workstreams after the seven-step stabilization program.

This plan assumes Milestones `0A` through `7` are complete and the repo has a
stable perimeter, a single authoritative lifecycle, and a short supported
command path.

## Current Product Baseline

1. The authoritative GP workflow is:
   `/fund-setup -> review -> publish -> /fund-model-results/:fundId`.
2. Reserve-planning context now lives inside the live portfolio surface rather
   than a standalone planning page.
3. Results now expose publish history, stale-evidence, recalculation, and
   lifecycle-aware polling.
4. Archived secondary surfaces remain archived:
   - `planning`
   - `kpi-manager`
   - `kpi-submission`
5. Public contracts remain intentionally mounted:
   - `/shared/:shareId`
   - `/portal/:rest*`
6. Compass remains experimental and unmounted.
7. `npm run validate:core` remains the hard delivery gate.

## Planning Rules

1. Stay inside the stabilized perimeter. Do not reopen LP, KPI, Compass, or
   other sidelined surfaces as part of this plan.
2. Prefer analyst-throughput improvements over broad feature expansion.
3. Keep one authoritative async/status path for lifecycle and results work.
4. Keep server-owned lifecycle orchestration intact; do not reintroduce
   client-owned publish/recalc orchestration.
5. Every slice must keep `npm run validate:core` green.

## Priority 1: Results Intelligence

### Goal

Make the results page better at explaining what changed, what ran, and whether
the user is looking at stale or current evidence.

### Why First

The current results page is truthful, but still relatively thin. It now exposes
status and history, but it does not yet help a GP compare outcomes between
published versions or understand what changed in meaningful detail.

### Proposed Slices

#### 1A. Publish-To-Publish Comparison Read Model

Add a server read model that compares the current published results to one prior
published version using existing persisted config and calc-run data.

Scope:

- version selector or "compare to previous" default
- summary-level diffs only
- no arbitrary config-body diffing in the first slice

Acceptance criteria:

- compare current published version to previous published version
- expose enough metadata to explain which runs are being compared
- keep the source of truth server-side

#### 1B. Results Comparison UI

Render comparison data in `fund-model-results` using the read model from 1A.

Scope:

- KPI-level delta cards
- compact section-level "up/down/no change" summaries
- visible context about which versions are being compared

Non-goals:

- spreadsheet-like deep diff
- multi-version matrix explorer

#### 1C. Run Diagnostics And Failure Clarity

Add lightweight run diagnostics to the results experience.

Scope:

- last run timestamp
- correlation/run identifiers
- terminal failure messaging that distinguishes "publish exists but calc failed"
  from "no publish yet"
- explicit stale-evidence explanation

## Priority 2: Live Portfolio Planning Persistence

### Goal

Turn reserve-planning from a surfaced context into an owned, persistent working
mode inside the portfolio experience.

### Why Second

The stabilized app now points users to `/portfolio?tab=reserve-planning`, but
the next real value step is letting them save, revisit, and apply planning work
without leaving the truthful portfolio surface.

### Proposed Slices

#### 2A. Scenario Save And Resume

Persist named planning scenarios inside the live portfolio surface.

Scope:

- save scenario
- rename scenario
- resume scenario
- show last modified metadata

#### 2B. Scenario Apply And Audit

Support explicit apply/sync behavior with traceability.

Scope:

- apply scenario to current planning state
- record last applied timestamp and actor context where available
- preserve a minimal audit trail of sync/apply actions

#### 2C. Planning Notes And Collaboration Context

Expand the current notes/workspace summary into a durable planning context.

Scope:

- scenario notes
- last sync note
- simple change summary

## Priority 3: Post-Stabilization Operational Hygiene

### Goal

Keep the stabilized repo from drifting back into archaeology while feature work
resumes.

### Proposed Slices

#### 3A. M7 Guardrails Stay Real

Ensure the supported command path and archived-doc boundaries stay current.

Scope:

- update `docs/script-classification.json` when supported scripts change
- keep README / BUILD_READINESS / CLAUDE command docs aligned
- archive new stale planning artifacts instead of letting them accumulate

#### 3B. Delivery Hygiene

Keep feature slices narrow and validate against the stabilized gates.

Scope:

- one branch per slice
- no mixed feature + infrastructure PRs unless the feature depends on it
- `validate:core` remains mandatory before merge

## Recommended Execution Order

1. Priority `1A`: publish-to-publish comparison read model
2. Priority `1B`: results comparison UI
3. Priority `1C`: run diagnostics and failure clarity
4. Priority `2A`: planning scenario save/resume
5. Priority `2B`: apply/sync audit trail
6. Priority `2C`: planning notes and collaboration context
7. Priority `3A` and `3B` continuously as guardrails

## Recommended First Branch

`feat/results-comparison-v1`

## Detailed Follow-Through Specs

- `docs/plans/2026-03-30-priority-2b-2c-3a-3b-execution-spec.md` expands
  Priority `2B`, Priority `2C`, and continuous Priority `3A`/`3B` into owned
  files, batch order, validation, and rollback criteria.

## Out Of Scope

- LP portal expansion
- KPI workflow reactivation
- Compass activation
- broad mobile/dashboard surface expansion
- new parallel modeling surfaces outside the stabilized perimeter
