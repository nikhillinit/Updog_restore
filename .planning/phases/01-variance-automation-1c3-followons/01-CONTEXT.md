# Phase 1: Variance Automation 1C.3 Follow-Ons - Context

**Gathered:** 2026-04-07 **Status:** Ready for planning

<domain>
## Phase Boundary

Ship **Item A (planner-loop leader election)** from the 1C.3 backlog so
multi-instance variance planners stop doing duplicate work. Correctness is
already guaranteed today by the `job_outbox.dedupe_key` unique index plus the
atomic claim protocol; this phase is a waste-reduction and log-cleanliness win,
plus the scaffolding Item C can build on later.

Items B and C from the 1C.3 backlog are **out of scope for this PR** (see
Decision D-07). Each remains in the backlog with updated rationale; neither
ships under the Phase 1 PR.

Out of scope for Phase 1:

- Item B — auto-resolving superseded baseline-scoped incidents
- Item C — moving the scheduler into a dedicated worker process
- Any change to `job_outbox`, the atomic claim protocol, or the processor path
- Any change to `VarianceAlertAutomationService.runCalcRunCompletion` (realtime
  rules, unchanged)
- Any change to alert rule authoring, evaluation semantics, or incident
  lifecycle

</domain>

<decisions>
## Implementation Decisions

### Leader election primitive

- **D-01:** Use a **heartbeat table row**, not Postgres advisory locks and not
  Redis. New table `variance_planner_leader` holds one row that represents the
  current leader lease. Leadership is acquired or renewed by an atomic
  `UPDATE variance_planner_leader SET instance_id = $me, acquired_at = now(), lease_expires_at = now() + lease_duration WHERE lease_expires_at < now() OR instance_id = $me RETURNING ...`.
  A follower becomes leader only when the current lease has expired.
  - **Why not session-scoped advisory locks:** Neon's PgBouncer pooler runs in
    transaction mode, so `pg_try_advisory_lock` (session-scoped) does not
    survive across queries. Making it work would require carving out a pinned
    non-pooled connection just for the planner lock, which violates the pooled
    assumption the rest of the app depends on.
  - **Why not Redis:** variance automation is Postgres-native today
    (`job_outbox` is the durable boundary). Adding Redis as a correctness
    dependency introduces split-brain risk, and dev/test uses the `memory://`
    Redis fallback which would silently degrade the primitive locally.

- **D-02:** **Lease duration = 10 minutes**, **renewal cadence = 2.5 minutes**
  (half the lease). Rationale: planner interval is 5 minutes
  (`DEFAULT_PLANNER_INTERVAL_MS`), so a 10-minute lease is 2× planner interval
  and leaves clean headroom against event-loop lag under Monte Carlo load.
  Worst-case leader takeover delay after crash ≈ one full lease window.
  - Both values should be environment-tunable following the existing
    `VARIANCE_ALERT_PLANNER_INTERVAL_MS` pattern: `VARIANCE_PLANNER_LEASE_MS`
    (default 600_000), `VARIANCE_PLANNER_RENEWAL_MS` (default 150_000).

- **D-03:** **Single global leader** across hourly/daily/weekly frequencies and
  all funds. Per-frequency leaders are deferred — the planner already batches
  all frequencies in one tick, so a split has no current benefit.

### Leader gate scope

- **D-04:** **Planner loop only.**
  `VarianceAlertAutomationService.runPlannerCycle()` is the only path that
  checks `isLeader()` before executing. The processor loop (`runProcessorCycle`)
  and the recovery sweep (`recoverStaleProcessingJobs`) continue to run on every
  instance unchanged.
  - Rationale:
    - The only operationally visible duplicate work is planner-side log spam
      from `INSERT ... ON CONFLICT DO NOTHING`. The processor is already correct
      via `SELECT ... FOR UPDATE SKIP LOCKED` and is cheap.
    - Keeping processor+recovery on every instance preserves resilience: if the
      leader crashes, followers are still actively draining `job_outbox` and
      recovering stale `processing` rows while the next election runs.
    - Matches the Phase 1 success criterion literally: _"a single elected leader
      runs the variance planner loop per window."_

### Items B and C fate (success criterion 4)

- **D-05:** **Re-defer Item B** (auto-resolve superseded baseline-scoped
  incidents) to the 1C.3 backlog with updated rationale. The read-side filter
  shipped in `b8d3bd60` is holding. No operator complaint signal is visible in
  the 2026-03/2026-04 commit stream. Trigger to act restated:
  - operator reports stale-incident clutter, OR
  - LP-facing reports surface incidents against retired baselines, OR
  - the alert filter UX proves insufficient in practice.
  - Action: update the `Trigger to act` line in
    `docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md` §
    Item B with the 2026-04-07 date and the Phase 1 decision trail.

- **D-06:** **Re-defer Item C** (dedicated scheduler worker process) to the 1C.3
  backlog with updated rationale. No scale pressure, no topology change, no
  web-app restart correctness issue observed. The leader election from Phase 1
  is the scaffolding this item will build on when the trigger fires. Trigger to
  act restated:
  - background workload materially grows beyond current variance/baseline
    cadence, OR
  - deployment topology gains a worker tier for other reasons, OR
  - web-app restart rate becomes a scheduler correctness liability.
  - Action: same as D-05, update § Item C in the backlog doc.

- **D-07:** **Do not bundle.** Phase 1 ships Item A as a single PR. Items B and
  C do not ride alongside. The backlog doc is updated in the same PR as Item A
  only because the `Trigger to act` restatements are directly caused by the
  Phase 1 analysis — this is documentation hygiene, not bundled scope.

### Claude's Discretion

The following decisions are left to the researcher/planner. They do not require
the user to weigh in before planning.

- **Instance identity** — how a process identifies itself in the `leader_id` /
  `instance_id` column (UUID at boot, HOSTNAME env, process.pid
  - hostname, etc.). Any stable-per-process identifier works; planner should
    recommend.
- **Migration shape** — column types, indexes, whether there is one row
  pre-seeded or rows are inserted on first acquisition, constraint names. Follow
  existing `server/db/migrations/**` conventions.
- **Exact takeover SQL** — whether takeover uses a single `UPDATE ... RETURNING`
  with an `OR`-ed where clause, a `SELECT FOR UPDATE` + `UPDATE` sequence, or an
  `INSERT ... ON CONFLICT DO UPDATE`. All three are equivalent as long as the
  atomicity property holds.
- **Observability surface** — at minimum: Pino structured log on elected/demoted
  events, and leader state surfaced via the existing
  `VarianceAlertAutomationService.getHealth()` → the `/api/health` endpoint.
  Prometheus gauge (`variance_planner_is_leader{instance}`) and transition
  counter are nice-to-have; planner decides whether to include them in the Phase
  1 PR or defer to a follow-up. **Do not** add a new metrics endpoint dedicated
  to leader state.
- **Crash integration test harness** — how the test proves takeover works.
  Recommended shape: fast-forward `lease_expires_at` in the test DB while a
  leader is holding it, then invoke the planner tick on a second service
  instance and assert it becomes leader. Cheapest, directly tests the takeover
  SQL, does not depend on process spawning. Child-process + SIGKILL is out of
  scope for this harness (integration tests use a global server setup — spawning
  a second server per test is the REFL-024 cascade failure mode).
- **Renewal timer lifecycle** — whether renewal is driven by a dedicated
  `NodeJS.Timeout` started on election, by the existing planner interval, or by
  a combination. Planner decides. Must be torn down in `stop()`.
- **Behavior on DB unavailability during renewal** — leader should assume it has
  lost leadership (fail-safe) rather than optimistically continuing with a stale
  lease. Planner spec this explicitly.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 source documents

- `docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md` —
  full context on Items A/B/C and why each was deferred from 1C.2. Item A is
  Phase 1's scope.
- `docs/plans/2026-04-02-phase-1c2-alert-scheduling-and-remaining-capital-plan.md`
  § Known Tradeoffs And Follow-On Debt (lines 824–845) — original deferral
  rationale for all three items.

### Current implementation (must understand before changing)

- `server/services/variance-alert-automation.ts` —
  `VarianceAlertAutomationService` class, lines 136–710.
  Planner/processor/recovery timers at lines 200–216. `getHealth()` at 235–253.
- `server/routes.ts` line 13 — where `varianceAlertAutomationService.start()` is
  invoked unconditionally during `registerRoutes`. Leader election must not
  change the fact that every instance calls `.start()`; only the planner _cycle_
  is gated.
- `server/services/variance-alert-evaluation.ts` — evaluator invoked from the
  processor; unchanged by this phase.
- `server/services/variance-tracking.ts` — baselines/calculations/alerts
  accessors; unchanged by this phase.

### Reusable primitives reviewed during scout (context only — not reused as-is)

- `server/lib/locks.ts` — Postgres advisory lock primitives (`withFundLock`,
  `tryFundLock`, `DistributedLock` class). **Not reused** per D-01; kept here so
  downstream agents understand why the advisory-lock path was evaluated and
  rejected.

### Constraints and baselines

- `shared/schema.ts` lines 1144–1256 — `performance_alerts` table shape.
  Relevant only for Item B context (deferred).
- `scripts/check-orphan-tests.mjs` — pre-push hook that enforces test placement.
  New tests for this phase MUST live under `tests/unit/**` or
  `tests/integration/**`, never under `__tests__/` (REFL-036).
- `docs/skills/REFL-024-*` (if present) and the memory note on integration test
  server lifecycle — do NOT spawn a second server per test for crash scenarios;
  use lease-expiry simulation instead.
- `CLAUDE.md` § Mandatory Pre-Action Checks — run `npm test` (full suite) before
  pushing if test infrastructure changes. Before writing data to JSONB, check
  schema for dedicated columns.
- `.planning/REQUIREMENTS.md` — REQ-VAR-01 (Item A is in scope), REQ-VAR-02 and
  REQ-VAR-03 (B/C deferred, D-05/D-06 document the restatement).
- `.planning/ROADMAP.md` § Phase 1 — success criteria 1–4.

### Logging and quality gates

- `DECISIONS.md` § ADR-019 — Pino-only logging standard. No `console.*` in new
  code.
- `npm run validate:core` and `npm run phoenix:truth` — both must be green at
  exit (success criterion 3). Phase 1 does not touch calc paths, so Phoenix
  truth cases are pass-through.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `server/services/variance-alert-automation.ts`
  `VarianceAlertAutomationService.getHealth()` — the existing `healthState`
  shape is the natural home for leader state. Extend the `planner` block with
  `{ isLeader: boolean, leaseExpiresAt: string | null, lastElectedAt: string | null }`.
- `parsePositiveIntEnv(name, fallback)` helper already in the file — use it for
  `VARIANCE_PLANNER_LEASE_MS` and `VARIANCE_PLANNER_RENEWAL_MS`.
- Existing Pino logger child
  (`const log = logger.child({ module: 'variance-alert-automation' })`) — reuse
  for elected/demoted events. Event names should match the existing style
  (`alert.planner.started`, `alert.planner.completed`) → suggested:
  `alert.planner.leader.elected`, `alert.planner.leader.demoted`,
  `alert.planner.leader.renewed`.
- `withTimeout(name, fn)` helper in the same file — wrap all leader-election DB
  calls so they fail cleanly under load.

### Established Patterns

- **Atomic claim / atomic takeover**: the existing processor uses
  `SELECT ... FOR UPDATE SKIP LOCKED` against `job_outbox`. The leader election
  should follow the same "atomic UPDATE with a where-clause predicate"
  discipline: one SQL statement, no read-modify-write race windows.
- **Lifecycle method pair**: the service already has `start(options)` and
  `stop()` and manages `plannerTimer / processorTimer / recoveryTimer`. Leader
  election adds a fourth timer (`leaderRenewalTimer`), managed the same way.
  `stop()` must release the lease explicitly (set `lease_expires_at = now()` for
  this instance) so followers take over quickly on graceful shutdown.
- **Env-gated enablement**: `ENABLE_VARIANCE_ALERT_AUTOMATION=0` already
  disables the whole service in tests. Leader election inherits this gate — when
  the service is disabled, there is no leader.
- **Health surface pattern**: `getHealth()` returns a plain JSON object; no
  external metric library is imported in this file today.
- **Structured log shape**: every planner event already logs with
  `{ event: 'alert.planner.<phase>', ... }`. Follow that shape.

### Integration Points

- **Call site**: `server/routes.ts` line 13
  (`varianceAlertAutomationService.start()`). Do NOT add a new call site or a
  second service instance.
- **DB access**: the service uses the existing `db` import (Drizzle) for
  `job_outbox` and `alertRules` queries. Leader election reuses the same `db`
  import; no new connection shape needed.
- **Migration**: new file under `server/db/migrations/` for the
  `variance_planner_leader` table. Follow the existing naming convention (check
  `server/db/migrations/` for the latest sequence number).
- **Schema**: add the new table to `shared/schema.ts` so it flows through
  Drizzle type generation.
- **Tests**: new unit tests in
  `tests/unit/services/variance-alert-automation.test.ts` (extend existing file)
  and `tests/integration/` for the crash scenario. Per REFL-036, no tests under
  `__tests__/`.

</code_context>

<specifics>
## Specific Ideas

- **"Do not bundle"** is a hard constraint from the backlog doc. Phase 1 is Item
  A only. The only doc update that rides in the Phase 1 PR is the
  `Trigger to act` restatement in the 1C.3 backlog doc (per D-07), because that
  restatement is directly caused by the Phase 1 analysis.
- **Crash test philosophy**: the integration test for leader takeover must NOT
  spawn a second Node process. The REFL-024 "integration test server lifecycle"
  cascade failure mode is a hard lesson. Instead, simulate lease expiry by
  fast-forwarding `lease_expires_at` in the test DB and invoke the planner cycle
  on a second in-process service instance that uses a distinct instance
  identity.
- **Graceful shutdown matters**: `stop()` must explicitly release the lease (set
  `lease_expires_at = now()` for the current instance). Otherwise every deploy
  creates a ~10-minute window where no instance holds the lease and planning
  stalls.
- **Fail-safe on renewal error**: if the renewal DB call fails or times out, the
  leader should assume it has lost leadership (stop running the planner cycle)
  rather than optimistically continue. Favor false-negatives over split-brain.
- **No metrics library explosion**: this phase does not introduce a new metrics
  library or endpoint. Pino log + `getHealth()` extension is sufficient for
  success criterion 1 ("observable via metrics and logs"). Prometheus gauge is a
  nice-to-have for a follow-up if operator need emerges.

</specifics>

<deferred>
## Deferred Ideas

### Explicitly re-deferred from Phase 1 (Items B and C)

- **Item B — Auto-resolve superseded baseline-scoped incidents.** See D-05.
  Trigger to act restated with 2026-04-07 rationale. Stays in the 1C.3 backlog.
- **Item C — Move scheduler to dedicated worker process.** See D-06. Trigger to
  act restated with 2026-04-07 rationale. Stays in the 1C.3 backlog. Phase 1's
  leader election is the scaffolding this item will build on when the trigger
  fires.

### Not raised during discussion but worth a future phase

- **Per-frequency leader locks** — if hourly/daily/weekly planning ever grows to
  the point where one tick is slow, the leader model can split into three
  independent locks. Not needed at current scale.
- **Prometheus gauge `variance_planner_is_leader{instance}`** — candidate for a
  later observability polish phase if operator need emerges.
- **Leader election for OTHER in-process schedulers** — the calc-run processor,
  the stale-row recovery sweep, and any future periodic loop could reuse the
  same `*_leader` table pattern. Not in Phase 1 scope; note it here so a future
  author recognizes the pattern.

### Reviewed todos (not folded)

No matching todos were found for Phase 1 in the GSD todo backlog
(`todo match-phase 1` returned 0 matches).

</deferred>

---

_Phase: 01-variance-automation-1c3-followons_ _Context gathered: 2026-04-07_
