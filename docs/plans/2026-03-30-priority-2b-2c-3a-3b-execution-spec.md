# Priority 2B/2C/3A/3B Execution Spec

## Context

Authoritative parent plan:

- `docs/plans/2026-03-30-post-stabilization-priorities.md`

This follow-through starts after Priority `2A` is in place. The repo already
has a durable scenario-save/resume path for reserve planning:

- `server/migrations/20260330_allocation_scenarios_v1.up.sql`
- `server/routes/allocation-scenarios.ts`
- `server/services/allocation-scenario-service.ts`
- `client/src/components/portfolio/tabs/AllocationsTab.tsx`
- `client/src/components/portfolio/tabs/hooks/useAllocationScenarios.ts`
- `tests/unit/components/portfolio/allocations-workspace.test.tsx`

It also already has the live allocation write path that remains authoritative:

- `server/routes/allocations.ts`
- `client/src/components/portfolio/tabs/hooks/useUpdateAllocations.ts`

And it already has a separate reallocation flow with preview/commit semantics
and audit logging:

- `server/routes/reallocation.ts`

That reallocation path is useful reference material for validation and audit
shape, but it must not become a second competing planning workspace.

## Goal

Finish the reserve-planning persistence story without reintroducing a second
unfinished planning surface.

Concretely, these slices must:

- let a saved scenario be explicitly applied back onto the live portfolio state
- record a minimal but truthful audit trail for sync/apply actions
- expand the current freeform scenario notes into durable collaboration context
- keep the `/portfolio?tab=reserve-planning` surface authoritative
- keep M7 guardrails and delivery discipline current while these slices land

## Current Repo Facts That Must Shape The Work

1. `/portfolio` is the live reserve-planning surface. `client/src/pages/portfolio.tsx`
   delegates to `portfolio-modern`, and `PortfolioTabs` owns the
   `reserve-planning` tab.
2. `/planning` is intentionally archived and permanently redirects to
   `/portfolio?tab=reserve-planning`. The next slices must not revive the old
   standalone planning page.
3. `2A` already persists named scenario snapshots plus freeform `notes` and
   `updated_at`. Save, rename, and resume are already implemented.
4. `AllocationsTab` already distinguishes live workspace state from local
   scenario mode. Resuming a scenario does not mutate live allocations today.
5. Live allocation writes still go through `/api/funds/:fundId/allocations`
   with optimistic-lock semantics tied to `allocation_version`.
6. There is no explicit "apply scenario" path today, no last-applied metadata,
   and no scenario-scoped audit read model.
7. There is no durable "last sync note" or "simple change summary" beyond the
   single scenario-level `notes` field.
8. `docs/script-classification.json`, `README.md`, `docs/BUILD_READINESS.md`,
   and `CLAUDE.md` already encode the stabilized perimeter and supported command
   path. Priority `3A` must keep those files aligned rather than inventing a
   new documentation center of gravity.
9. `npm run validate:core` is already the hard delivery gate and must stay
   green through these slices.

## Recommended Delivery Order

1. `2B0`: preview + drift contract
2. `2B1a`: migration, types, and event/read model
3. `2B1b`: apply/sync mutation semantics
4. `2B2`: client apply flow and audit visibility
5. `2C1`: collaboration-context persistence model
6. `2C2`: collaboration-context UI
7. `3A` and `3B`: continuous guardrails applied across every PR

## Action Vocabulary

Use these terms consistently across routes, types, UI copy, and tests:

- `resume`: load a saved scenario into the local reserve-planning workspace
  without mutating live allocations
- `sync`: replace the saved scenario snapshot with the current live allocations
  without mutating live allocations; record a `synced` event
- `preview`: compute a server-owned drift and delta summary between a saved
  scenario and current live allocations without mutating either side
- `apply`: push a saved scenario snapshot into live allocations transactionally;
  record an `applied` event

## Shared Non-Negotiables

- Live allocations remain authoritative. Scenarios are durable overlays, not a
  second source of truth.
- Resume is read-only against live state. Save and resume must never silently
  apply changes.
- Sync is scenario-local only. It refreshes the saved scenario from live state
  and never mutates live allocations.
- Apply is explicit, reviewable, and transactional.
- No new standalone planning route, nav item, or alternate reserve-planning
  entrypoint.
- Do not widen these slices into real-time collaboration, threaded comments, or
  generic document management.
- Do not widen these slices into adjacent scenario systems such as
  `server/routes/portfolio-intelligence.ts`, backtesting scenario flows, or the
  legacy `client/src/pages/portfolio-constructor.tsx` surface.
- Do not weaken `validate:core` to make these slices easier to land.

---

## Priority 2B: Scenario Apply And Audit

### Goal

Allow a saved reserve-planning scenario to be pushed back onto the current live
allocation state with enough metadata to explain when it happened, who did it,
and what changed.

### Current Gap

`2A` can save and resume a scenario, but it cannot:

- produce a server-owned preview of what apply would do
- apply that scenario to the live portfolio allocation surface
- define `sync` separately from `apply`
- show last-applied metadata
- explain drift between the scenario's source snapshot and current live state
- preserve a minimal audit trail of sync/apply actions

### Core Decisions

#### 1. Preview Must Exist Before Any Write Path

Recommended read endpoint:

- `GET /api/funds/:fundId/allocation-scenarios/:scenarioId/apply-preview`

`2B` should not implement `apply` first and treat preview as optional polish.
The preview contract should land first because it defines:

- the drift state
- the delta summary
- the concurrency token or live signature
- the UX copy used for safe confirmation

Minimum preview payload:

- scenario summary
- current live summary
- drift classification
- company-level change counts
- total planned delta
- live signature / concurrency token
- whether apply is immediately allowed, confirmable-with-drift, or blocked

#### 2. Apply Must Live Under The Allocation-Scenario Boundary

Recommended endpoint:

- `POST /api/funds/:fundId/allocation-scenarios/:scenarioId/apply`

Do not make the client call the generic reallocation commit route directly for
scenario apply. The reallocation path can contribute validation or summary
helpers, but the orchestration boundary for this slice should remain the
scenario route family because the user is acting on a saved scenario object.

#### 3. Sync Must Be Explicit And Separate From Apply

Recommended endpoint:

- `POST /api/funds/:fundId/allocation-scenarios/:scenarioId/sync`

`sync` means "refresh this saved scenario from current live allocations." It
does not mean "apply my scenario to live state." The spec should treat those as
separate actions because they have opposite write directions.

`sync` should:

- overwrite the saved scenario snapshot from live allocations
- preserve scenario identity and long-form notes
- record a `synced` event with optional note and server-derived summary
- update last-sync metadata

#### 4. Apply Must Be Transactional

Applying a scenario should update the authoritative live allocations and write
the audit event in one transaction. If either half fails, neither side should
commit.

#### 5. Drift Must Be Explicit

Each scenario already records `source_allocation_version`. `2B` must compare
that against current live allocation versions before apply and surface one of:

- exact match
- behind live state but still applicable with explicit confirmation
- not safely applicable because the live set can no longer be mapped cleanly

Silent overwrite is not acceptable.

#### 6. Concurrency Policy Must Be Hard, Not Advisory

`apply` should require the client to echo the preview's live concurrency token.
The server should reject apply if that token no longer matches the current live
allocation state.

Recommended outcome rules:

- exact match plus current token match: apply allowed
- same company set but different live token: preview required again; old apply
  request rejected
- company set drift (missing, new, or unmappable companies): apply blocked

This is stricter than relying on `source_allocation_version` alone, which is too
coarse once individual company allocation versions diverge.

#### 7. Audit Trail Should Be Narrow And Append-Only

Keep the audit trail intentionally minimal for this slice. Track only:

- `applied`
- `synced`

Do not try to log every local workspace keystroke or every single scenario-save
mutation as a first-class audit event in `2B`.

#### 8. Actor Context Is Best-Effort

If authenticated user identity is available, persist it. If not, store `null`
for structured identity and preserve a best-effort label or source string.
Do not block apply when identity enrichment is unavailable.

### Recommended Data Model

Add a small append-only event table.

Recommended table:

- `allocation_scenario_events`

Recommended columns:

- `id`
- `scenario_id`
- `fund_id`
- `event_type` (`applied` | `synced`)
- `actor_user_id` nullable
- `actor_label` nullable
- `note` nullable
- `source_allocation_version` nullable
- `resulting_allocation_version` nullable
- `change_summary_json` not null default `'{}'`
- `created_at`

Recommended header denormalization on `allocation_scenarios` for cheap list
reads:

- `last_applied_at`
- `last_applied_by`
- `last_applied_allocation_version`
- `last_synced_at`
- `last_synced_by`
- `last_previewed_at` is not required; keep preview stateless

If denormalization is added, the event table still remains authoritative and the
header fields are read-model convenience only.

### Recommended Server Surface

Required work:

- create preview service logic that:
  - loads scenario snapshot items
  - loads current live allocations
  - computes drift classification
  - computes summary deltas versus live state
  - emits a live concurrency token
  - returns preview metadata without mutating state
- create apply service logic that:
  - loads scenario snapshot items
  - verifies target fund and company membership
  - verifies the preview/live concurrency token
  - rechecks drift classification
  - writes live allocations via one shared allocation mutation primitive
  - writes the audit event
  - returns updated scenario summary plus apply metadata
- create sync service logic that:
  - replaces scenario snapshot items from current live allocations
  - records a `synced` audit event
  - updates last-sync metadata
- enrich scenario list/detail responses with:
  - last applied metadata
  - last synced metadata
  - recent audit summary or at least latest event summary

Do not duplicate allocation-write logic inside the scenario service. If the repo
does not already expose a reusable allocation mutation helper, extract one from
the existing live allocation path first and reuse it for:

- direct live allocation edits
- scenario apply

Recommended owned files:

- `server/migrations/*allocation_scenario_events*.sql` (new)
- `server/services/allocation-write-service.ts` (new extracted helper)
- `server/routes/allocation-scenarios.ts`
- `server/services/allocation-scenario-service.ts`
- `server/routes/allocations.ts` (updated only to adopt the shared helper)
- `client/src/components/portfolio/tabs/types.ts`
- `client/src/components/portfolio/tabs/hooks/useAllocationScenarios.ts`
- `client/src/components/portfolio/tabs/AllocationsTab.tsx`

### Recommended Batch Breakdown

#### 2B0: Preview Contract

- preview route
- preview types
- drift classification
- concurrency token definition
- server tests for preview-only semantics

#### 2B1a: Data Model And Read Shape

- migration for `allocation_scenario_events`
- header denormalization if chosen
- scenario read-model enrichment
- contract tests

#### 2B1b: Mutation Semantics

- shared allocation mutation helper extraction if needed
- sync route
- apply route
- transactional write logic
- service tests and DB-backed integration test

#### 2B2: Client Flow

- preview-before-apply UX
- sync action UX
- apply confirmation UX
- last applied/last synced badges and summaries

### Recommended Client Behavior

Add an explicit `Apply Scenario` action only when a saved scenario is active.

Rules:

- do not allow applying unnamed local workspace state
- if workspace is dirty, require save first or make the user discard local
  edits before apply
- require a fresh preview before apply
- require apply to use the preview's concurrency token
- expose `Sync From Live` as a separate action from `Apply Scenario`
- show last applied timestamp and actor where available
- show drift warning before apply when the source allocation version is stale
- refetch:
  - live allocations
  - scenario list
  - active scenario detail

### Recommended Tests

New or expanded tests:

- `tests/unit/services/allocation-scenario-service.test.ts`
- `tests/unit/routes/allocation-scenarios-api.test.ts`
- `tests/unit/components/portfolio/allocations-workspace.test.tsx`
- `tests/integration/allocation-scenario-apply.test.ts` or equivalent focused
  DB-backed integration test

Keep scenario route coverage in the existing `tests/unit/routes/` lane and keep
client workspace coverage in `tests/unit/components/portfolio/`. Do not move
these slices into `client/src/components/portfolio/tabs/__tests__/`, because
the active client Vitest project does not execute that folder.

Minimum assertions:

- preview returns drift classification and a concurrency token without mutating
  live allocations
- apply writes the live allocation rows in one transaction
- apply creates an audit event
- apply surfaces last-applied metadata on follow-up reads
- sync refreshes the scenario snapshot without mutating live allocations
- stale or invalid concurrency token rejects apply
- resume alone still does not touch live allocations

### Acceptance Criteria

- a saved scenario can be previewed against current live allocations before
  commit
- a saved scenario can be explicitly applied to live allocations
- the client can sync a saved scenario from live allocations without applying it
- the client can show when the active scenario was last applied
- actor context is preserved where available
- apply and sync actions are recoverable through a minimal audit trail
- version drift is explicit instead of silent

### Rollback Trigger

Stop and amend the plan if apply cannot remain transactional or if the only
viable implementation path requires making scenario state authoritative over the
live allocations table.

---

## Priority 2C: Planning Notes And Collaboration Context

### Goal

Turn the current notes field and workspace summary into durable collaboration
context that survives save, resume, sync, and apply operations.

### Current Gap

Today the workspace has:

- scenario name
- scenario notes
- last modified timestamp
- live-vs-scenario source badges

It does not have:

- a durable last sync note
- a durable simple change summary
- an explicit collaboration/context block separate from freeform scenario notes

### Note Taxonomy

The plan should explicitly keep these text fields separate:

- `allocation_reason`: company-level rationale attached to a live or scenario
  allocation row
- `allocation_scenarios.notes`: long-form scenario intent and working context
- `allocation_scenario_events.note`: action-scoped note for `sync` or `apply`
- `change_summary`: server-derived summary of what changed; not user-authored

### Core Decisions

#### 1. Keep Collaboration Scope Small

This slice is not real-time collaboration. It should not add:

- threaded comments
- mentions
- presence indicators
- notification delivery

It should add only durable context that helps the next analyst understand what
the scenario is, what changed, and what was last synced/applied.

#### 2. Scenario Notes Remain The Long-Form Field

Do not replace `allocation_scenarios.notes`. Treat it as the main long-form
scenario note and build the collaboration context around it.

#### 3. Sync Notes Belong To Events

The "last sync note" should attach to the sync/apply event, not to each company
row and not to a second ad hoc notes table. This keeps the narrative aligned
with the actual action taken.

#### 4. Change Summary Should Be Server-Derived

Do not ask the client to invent its own summary from local state. The server
should compute a compact summary from authoritative before/after state and
persist it with the event or scenario header read model.

#### 5. Company Notes Must Not Be Collapsed Into Scenario Notes

`allocation_reason` already exists for company-level rationale. `2C` should not
flatten those row-level notes into the scenario-level collaboration block.
Instead, it should summarize them when useful and preserve the underlying row
semantics.

### Recommended Read Model Shape

Extend scenario detail to include a collaboration-context block. Exact typing
may vary, but the shape should be close to:

```ts
{
  context: {
    scenarioNotes: string | null;
    lastSync: {
      at: string;
      by: string | null;
      note: string | null;
      summary: {
        companiesChanged: number;
        totalPlannedDeltaCents: number;
        headline: string | null;
      };
    } | null;
    lastApply: {
      at: string;
      by: string | null;
      note: string | null;
      summary: {
        companiesChanged: number;
        totalPlannedDeltaCents: number;
        headline: string | null;
      };
    } | null;
  };
}
```

Keep it intentionally summary-level. Do not turn `2C` into a full change-log
explorer.

### Recommended Client Behavior

In the reserve-planning workspace:

- separate `Scenario Notes` from `Collaboration Context`
- keep company-level `allocation_reason` rendering separate from scenario/event
  context
- show:
  - last sync note
  - last apply note
  - compact change summary chips or sentence
  - timestamp + actor where available
- allow the user to enter an optional sync/apply note at the moment of sync or
  apply
- preserve readability in the saved-scenarios list without expanding every item
  into a document card

### Recommended Owned Files

- `server/services/allocation-scenario-service.ts`
- `server/routes/allocation-scenarios.ts`
- `client/src/components/portfolio/tabs/types.ts`
- `client/src/components/portfolio/tabs/hooks/useAllocationScenarios.ts`
- `client/src/components/portfolio/tabs/AllocationsTab.tsx`
- `tests/unit/components/portfolio/allocations-workspace.test.tsx`

If type duplication between server and client starts to drift here, introduce a
shared boundary contract, but do not make that refactor the critical path.

### Recommended Tests

Add assertions that:

- scenario notes persist and round-trip
- last sync/apply notes round-trip
- change summary is shown after resume/reload
- the workspace shows collaboration context without mutating live allocations

### Acceptance Criteria

- saved scenarios retain durable notes and last sync/apply context
- a resumed scenario explains what changed in a compact, stable way
- collaboration context survives reloads and resume flows
- no new parallel planning surface is introduced

### Rollback Trigger

Stop and amend the plan if `2C` starts requiring threaded comments, realtime
presence, or a generic collaboration subsystem. Those belong in a separate
product decision, not this slice.

---

## Priority 3A: M7 Guardrails Stay Real

### Goal

Keep the stabilized runtime perimeter, supported command path, and archive
boundaries current as feature work resumes.

### Current Repo Facts

The guardrail artifacts already exist:

- `docs/script-classification.json`
- `README.md`
- `docs/BUILD_READINESS.md`
- `CLAUDE.md`
- `docs/plans/2026-03-27-secondary-surface-decisions.md`

`3A` is not a one-time feature branch. It is a rule applied continuously to the
PRs that land `2B`, `2C`, and any later post-stabilization slices.

### Continuous Rules

1. If a PR changes supported scripts, validation commands, or the recommended
   developer path, it must update:
   - `docs/script-classification.json`
   - `README.md`
   - `docs/BUILD_READINESS.md`
   - `CLAUDE.md`
2. If a PR changes route exposure or secondary-surface status, it must update:
   - `docs/plans/2026-03-27-secondary-surface-decisions.md`
   - route-governance tests
3. Superseded active planning notes must be archived under `docs/archive/plans/`
   instead of remaining adjacent to live plans with ambiguous authority.
4. Archived routes (`planning`, `kpi-manager`, `kpi-submission`) stay archived
   unless a new explicit activation decision is written first.

### Enforceable Triggers

The guardrail docs must be updated when any of these happen:

- `package.json` script changes affect supported developer or CI commands
- supported scripts under `scripts/` are added, renamed, or demoted
- route exposure changes affect `/portfolio`, archived redirects, or secondary
  surfaces
- a live plan is superseded by a narrower active plan and should move to
  `docs/archive/plans/`

### Recommended Validation

- `npm run validate:core`
- `npm run docs:check-links`
- `npm run docs:routing:check` when route posture or discovery-map inputs change
- targeted route-governance tests when route docs or secondary-surface posture
  change

New API endpoints or path changes under `server/routes/allocation-scenarios.ts`
should trigger `npm run docs:routing:check` even when the client
route-governance trio does not need to run. The client route-governance tests
are for `/planning`, `/portfolio`, and archived page posture, not ordinary API
surface expansion.

Recommended route-governance command when surface posture changes:

- `npx vitest run tests/unit/app/secondary-surface-routing.test.tsx tests/unit/app/route-perimeter-governance.test.tsx tests/unit/app/route-governance-registry.test.tsx --project=client`

### Failure Condition

`3A` is failing if the code changes but the repo's active docs still describe an
older runtime perimeter, command path, or archive boundary.

---

## Priority 3B: Delivery Hygiene

### Goal

Keep implementation slices narrow, reviewable, and tied to the stabilized gate
instead of allowing broad mixed-scope PRs.

### Continuous Rules

1. One branch per slice.
   Recommended branch sequence:
   - `feat/allocation-scenario-preview-contract`
   - `feat/allocation-scenario-events-readmodel`
   - `feat/allocation-scenario-sync-apply-server`
   - `feat/allocation-scenario-client-actions`
   - `feat/allocation-planning-context-readmodel`
   - `feat/allocation-planning-context-ui`
   - `chore/m7-guardrail-alignment` only if a docs/process-only follow-up is
     required
2. Do not mix unrelated infrastructure work into these feature PRs unless the
   feature is blocked on it.
3. Every PR description should state:
   - owned files
   - explicit non-goals
   - rollback path
   - validation commands actually run
4. `npm run validate:core` remains mandatory before merge even if additional
   targeted tests are added for `2B` and `2C`.
5. If these slices add non-core targeted tests that are valuable but too slow or
   too narrow for `validate:core`, document the explicit PR command set rather
   than silently skipping them.

### Required PR Checklist

Each PR in this sequence should include a flat checklist with:

- owned files
- explicit non-goals
- schema or contract impact
- rollback path
- commands actually run
- whether docs/guardrail artifacts changed and why
- whether any active doc was archived and where it moved

### Recommended PR Breakdown

#### PR 1: 2B0 Preview Contract

- preview route
- preview types
- preview tests

#### PR 2: 2B1 Server/Data Model

- migration
- read-model enrichment
- contract/route tests

#### PR 3: 2B1 Mutation Semantics

- shared allocation write helper if needed
- sync route
- apply route
- server + integration tests

#### PR 4: 2B2 Client Apply Flow

- hooks
- workspace UI
- client tests

#### PR 5: 2C Context Persistence + UI

- event/context read model
- notes/sync/apply note UI
- client + route tests

#### PR 6: Guardrail Cleanup Only If Needed

- doc alignment
- archive moves
- no feature logic

### Failure Condition

`3B` is failing if a single PR mixes feature work, infrastructure cleanup,
archive churn, and unrelated route changes without a direct dependency chain.

---

## Validation Matrix

Run at minimum:

1. `npx vitest run tests/unit/routes/allocation-scenarios-api.test.ts --project=server`
2. `npx vitest run tests/unit/services/allocation-scenario-service.test.ts --project=server`
3. `npx vitest run tests/unit/components/portfolio/allocations-workspace.test.tsx --project=client`
4. `npx vitest run tests/integration/allocation-scenario-apply.test.ts --config vitest.config.int.ts`
5. `npm run validate:core`
6. `npm run docs:check-links` when docs are touched
7. `npm run docs:routing:check` and route-governance tests when route posture or
   archive posture changes

## Concrete Execution Sequence

Use this sequence as the implementation order. Do not skip ahead unless the
previous step is merged or explicitly abandoned.

### Step 0: Baseline And Guardrail Snapshot

Branch:

- none; run from current mainline before opening feature branches

Purpose:

- confirm the current `2A` workspace is green before layering `2B` and `2C`
- lock in the pre-change validation baseline

Primary existing files to inspect:

- `server/routes/allocation-scenarios.ts`
- `server/services/allocation-scenario-service.ts`
- `client/src/components/portfolio/tabs/AllocationsTab.tsx`
- `tests/unit/routes/allocation-scenarios-api.test.ts`
- `tests/unit/components/portfolio/allocations-workspace.test.tsx`

Commands:

- `npx vitest run tests/unit/routes/allocation-scenarios-api.test.ts --project=server`
- `npx vitest run tests/unit/components/portfolio/allocations-workspace.test.tsx --project=client`
- `npm run docs:routing:check`
- `npm run validate:core`
- `npm run docs:check-links`

Stop condition:

- do not start `2B0` until the existing allocation workspace baseline is green

### Step 1: 2B0 Preview Contract

Branch:

- `feat/allocation-scenario-preview-contract`

Purpose:

- land the preview payload, drift classification, and concurrency token before
  any scenario-to-live write path

Owned files:

- `server/routes/allocation-scenarios.ts`
- `server/services/allocation-scenario-service.ts`
- `tests/unit/routes/allocation-scenarios-api.test.ts`
- `tests/unit/services/allocation-scenario-service.test.ts`

Required deliverables:

- `GET /api/funds/:fundId/allocation-scenarios/:scenarioId/apply-preview`
- server-owned drift classification
- live concurrency token definition
- preview-only tests proving no state mutation

Do not touch yet:

- migrations
- client UI
- live allocation write logic

Commands:

- `npx vitest run tests/unit/services/allocation-scenario-service.test.ts --project=server`
- `npx vitest run tests/unit/routes/allocation-scenarios-api.test.ts --project=server`
- `npm run docs:routing:check`
- `npm run validate:core`

Merge checkpoint:

- preview payload shape is stable enough for client work to depend on it

### Step 2: 2B1a Event Model And Read Shape

Branch:

- `feat/allocation-scenario-events-readmodel`

Purpose:

- add durable event storage and enrich scenario reads with last-sync/last-apply
  metadata before any mutation route is exposed

Owned files:

- `server/migrations/*allocation_scenario_events*.sql`
- `server/routes/allocation-scenarios.ts`
- `server/services/allocation-scenario-service.ts`
- `tests/unit/routes/allocation-scenarios-api.test.ts`
- `tests/unit/services/allocation-scenario-service.test.ts`

Required deliverables:

- `allocation_scenario_events` migration
- event write/read types
- list/detail enrichment:
  - last applied metadata
  - last synced metadata
  - latest event summary or equivalent compact read shape

Do not touch yet:

- apply route
- sync route
- client UI beyond additive type-safe response handling if unavoidable

Commands:

- `npx vitest run tests/unit/services/allocation-scenario-service.test.ts --project=server`
- `npx vitest run tests/unit/routes/allocation-scenarios-api.test.ts --project=server`
- `npm run docs:routing:check`
- `npm run validate:core`

Merge checkpoint:

- scenario reads expose durable metadata without changing live allocations

### Step 3: 2B1b Sync/Apply Server Semantics

Branch:

- `feat/allocation-scenario-sync-apply-server`

Purpose:

- add transactional `sync` and `apply` semantics on top of the already-landed
  preview contract and event model

Owned files:

- `server/routes/allocation-scenarios.ts`
- `server/services/allocation-scenario-service.ts`
- `server/services/allocation-write-service.ts`
- `server/routes/allocations.ts`
- `tests/unit/services/allocation-scenario-service.test.ts`
- `tests/unit/routes/allocation-scenarios-api.test.ts`
- `tests/integration/allocation-scenario-apply.test.ts`

Required deliverables:

- `POST /api/funds/:fundId/allocation-scenarios/:scenarioId/sync`
- `POST /api/funds/:fundId/allocation-scenarios/:scenarioId/apply`
- apply requires a fresh preview token
- sync updates the saved scenario only
- apply mutates live allocations and writes an `applied` event in one
  transaction
- shared allocation mutation primitive is reused instead of duplicating live
  write logic

Do not touch yet:

- full client UX
- collaboration-context UI

Commands:

- `npx vitest run tests/unit/services/allocation-scenario-service.test.ts --project=server`
- `npx vitest run tests/unit/routes/allocation-scenarios-api.test.ts --project=server`
- `npx vitest run tests/integration/allocation-scenario-apply.test.ts --config vitest.config.int.ts`
- `npm run docs:routing:check`
- `npm run validate:core`

Merge checkpoint:

- preview, sync, and apply are complete and server-correct without any client
  assumptions

### Step 4: 2B2 Client Apply/Sync Flow

Branch:

- `feat/allocation-scenario-client-actions`

Purpose:

- wire the reserve-planning workspace to the new preview/sync/apply server
  contract

Owned files:

- `client/src/components/portfolio/tabs/hooks/useAllocationScenarios.ts`
- `client/src/components/portfolio/tabs/types.ts`
- `client/src/components/portfolio/tabs/AllocationsTab.tsx`
- `tests/unit/components/portfolio/allocations-workspace.test.tsx`

Required deliverables:

- `Sync From Live` action
- `Apply Scenario` action
- preview-before-apply flow
- drift warning UI
- last applied/last synced metadata in workspace and saved-scenario list
- refetch behavior after sync/apply
- expanded assertions in `tests/unit/components/portfolio/allocations-workspace.test.tsx`
  instead of `client/src/components/portfolio/tabs/__tests__/AllocationsTab.test.tsx`

Do not touch yet:

- long-form collaboration context redesign beyond action visibility

Commands:

- `npx vitest run tests/unit/components/portfolio/allocations-workspace.test.tsx --project=client`
- `npm run validate:core`

Merge checkpoint:

- the reserve-planning tab can safely preview, sync, and apply without reviving
  any archived planning surface

### Step 5: 2C1 Collaboration Read Model

Branch:

- `feat/allocation-planning-context-readmodel`

Purpose:

- make the collaboration context durable and typed before redesigning the UI

Owned files:

- `server/services/allocation-scenario-service.ts`
- `server/routes/allocation-scenarios.ts`
- `client/src/components/portfolio/tabs/types.ts`
- `tests/unit/services/allocation-scenario-service.test.ts`
- `tests/unit/routes/allocation-scenarios-api.test.ts`

Required deliverables:

- explicit context block on scenario detail
- note taxonomy preserved:
  - `allocation_reason`
  - `allocation_scenarios.notes`
  - `allocation_scenario_events.note`
  - server-derived `change_summary`
- last sync/apply summaries returned in a stable read shape

Commands:

- `npx vitest run tests/unit/services/allocation-scenario-service.test.ts --project=server`
- `npx vitest run tests/unit/routes/allocation-scenarios-api.test.ts --project=server`
- `npm run validate:core`

Merge checkpoint:

- client can render collaboration context without inventing local summary logic

### Step 6: 2C2 Collaboration Context UI

Branch:

- `feat/allocation-planning-context-ui`

Purpose:

- expose the durable context clearly in the reserve-planning workspace while
  keeping scenario notes, event notes, and company notes distinct

Owned files:

- `client/src/components/portfolio/tabs/AllocationsTab.tsx`
- `client/src/components/portfolio/tabs/types.ts`
- `client/src/components/portfolio/tabs/hooks/useAllocationScenarios.ts`
- `tests/unit/components/portfolio/allocations-workspace.test.tsx`

Required deliverables:

- separate `Scenario Notes` from `Collaboration Context`
- render last sync note and last apply note
- render compact change summary
- keep company-level `allocation_reason` display separate from scenario/event
  context
- expanded assertions in `tests/unit/components/portfolio/allocations-workspace.test.tsx`
  instead of `client/src/components/portfolio/tabs/__tests__/AllocationsTab.test.tsx`

Commands:

- `npx vitest run tests/unit/components/portfolio/allocations-workspace.test.tsx --project=client`
- `npm run validate:core`

Merge checkpoint:

- the reserve-planning workspace explains what changed and why without becoming
  a generic collaboration product

### Step 7: 3A/3B Guardrail Cleanup

Branch:

- `chore/m7-guardrail-alignment` only if required

Purpose:

- reconcile any doc, script-classification, or archive posture drift created by
  the earlier steps

Owned files only as needed:

- `docs/script-classification.json`
- `README.md`
- `docs/BUILD_READINESS.md`
- `CLAUDE.md`
- `docs/plans/2026-03-27-secondary-surface-decisions.md`
- `docs/archive/plans/*`

Required deliverables:

- doc alignment only
- archive moves only
- no feature logic

Commands:

- `npm run docs:check-links`
- `npm run docs:routing:check`
- route-governance test command from `3A` when surface posture changes
- `npm run validate:core`

Merge checkpoint:

- active docs and guardrails describe the current stabilized perimeter exactly

## Out Of Scope

- restoring `/planning` as a live page
- multi-user realtime collaboration
- threaded comments or notifications
- broad portfolio-constructor resurrection
- `server/routes/portfolio-intelligence.ts` and its scenario system
- backtesting or historical scenario-comparison surfaces
- reallocation route redesign beyond shared helper reuse
- generic audit-log platform work beyond the narrow scenario apply/sync trail
- expanding `validate:core` scope unless the added coverage is clearly required

## Exit Criteria

This follow-through is complete when:

- a saved reserve-planning scenario can be explicitly applied
- apply/sync metadata is durable and user-visible
- the workspace exposes durable collaboration context instead of one freeform
  note only
- active docs and guardrail artifacts still match the stabilized perimeter
- the implementation landed through narrow, validated slices
