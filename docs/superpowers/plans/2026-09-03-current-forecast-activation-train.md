---
status: PROPOSED
audience: agents
last_updated: 2026-09-03
owner: Repository Owner
categories: [release, current-forecast, production-governance]
keywords: [F_1.11.0, activation, shadow-soak, '0055', Vercel, Railway, Neon]
---

# Current Forecast Capability-First Activation Train Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit the missing guarded production capabilities as one source unit,
select and certify the resulting exact `main` SHA, bind one qualifying runtime,
complete four organic shadow windows, and finish with recorded NO-GO or a
separately authorized activation, kill-to-held drill, and resume.

**Architecture:** Phase P adds only release-control capabilities: a bounded
0050-0055 journaled migration lane, an isolated Neon rehearsal workflow, and an
owner-dispatched wrapper around existing Current Forecast HTTP routes. After the
complete Phase P unit is admitted, Phase A selects a new immutable candidate,
uses existing `release-production.yml` for deployment/promotion, collects shadow
facts through canonical ingress, and uses the existing one-way database latch.

**Tech Stack:** GitHub Actions, Node 22.23.2, npm 10.9.2, TypeScript,
JavaScript, Express, PostgreSQL/Drizzle, Vitest, Testcontainers, Vercel,
Railway, and Neon.

**Spec:** `docs/superpowers/plans/2026-09-03-updog-reconciled-program-plan.md`,
`docs/1-plans/F_1.11.0_isolated-activation-train.plan.md`,
`docs/governance/solo-internal-change-and-production-policy.md`,
`docs/workflows/PRODUCTION_SCRIPTS.md`,
`docs/runbooks/current-forecast-shadow-soak.md`, and ADR-095/ADR-096 in
`DECISIONS.md`.

## Global Constraints

- `origin/main@6fd4ece89215b64f5a4f6bec25a26c512040ff4d`, tree
  `07fbf4c42847b7b244f61e0f0496bf2c203ef6f8`, is the historical source
  baseline inspected on 2026-09-03 UTC. It is not the post-Phase-P activation
  candidate.
- A plan, test, review, receipt, issue, or provider observation never grants
  source admission or a production action.
- Every provider, schema, deployment, promotion, shadow-entry, activation,
  kill, and resume mutation requires its own repository-owner dispatch.
- All mutations require idempotency. All updates require optimistic locking.
  All cursors require validation. All queue jobs require timeouts.
- Run every test command with `TZ=UTC`.
- Schema migration and identity readback use a direct, non-pooled PostgreSQL
  URL. Reject a hostname containing `pooler`.
- Existing Current Forecast services retain advisory-lock ownership and one
  session-bound transaction. The wrapper workflow must not reproduce business
  logic.
- Current Forecast activation remains a one-way database latch. Do not add a
  second route or restore `enable_current_forecast_v2`.
- The canonical candidate API must receive soak-target facts writes. A private
  preview cannot produce qualifying organic evidence.
- Before activation, prove containment through workflow tests and isolated
  database rehearsal. The real kill/resume drill occurs only after activation.
- Candidate, deployment, database, migration, source, corpus, or relevant
  environment drift restarts the soak at Window 1.
- Production credentials live only in protected environments and are never
  exposed to pull-request, Dependabot, or ordinary preview events.
- No brand-new evidence document or schema enters Program A. One additive
  schema-reconcile receipt-family variant is permitted only for the truthful
  `.github/workflows/prod-schema-reconcile.yml` producer. Neon rehearsal uses
  existing GitHub run/attempt outputs and summary, not a schema-reconcile
  receipt. Reuse existing API response contracts and issue records.
- `npm run lint` already includes `guardrails:check`; `npm run calc-gate`
  already includes `phoenix:truth`. Record nested checks once.

### Phase P Admission Boundary

Tasks 1-5 are one inseparable source-admission unit. They may be developed and
committed task-by-task, but no task commit may merge independently or become
reachable from `main`. The Phase P merge request must contain all five tasks,
their combined tests, and reconciled documentation. Repository-owner source
admission applies only to the complete unit after the Phase P matrix is green.

A partial Task 1-5 result is local or unmerged work only. It cannot update the
canonical production procedure, authorize the migration lane, or authorize a
Current Forecast action. Any Phase P change after review requires the full
Phase P matrix and a fresh source-admission review. Admission selects a new
candidate SHA; no certification or soak evidence from `6fd4ece...` carries
forward.

## Phase and Authority Boundaries

| Phase | Work | Authority boundary | Exit |
| --- | --- | --- | --- |
| P | Tasks 1-5 | Local implementation and review; one complete owner-admitted source unit | Phase P merge SHA on `origin/main` |
| Readiness | Task 7 | Read-only evidence; owner records `READY_TO_CUT` or `DEFERRED` | No required `UNKNOWN` and owner `READY_TO_CUT` |
| A1 | Task 8 | Candidate freeze is an owner decision, not a merge effect | Exact SHA/tree certification complete |
| A2 | Tasks 9-10 | Every rehearsal, schema, deployment, and promotion mutation is separately dispatched | One bound canonical release identity |
| A3 | Task 11 | Shadow entry separately dispatched | #1296 green and #1297 evidence complete |
| A4 | Tasks 12-13 | Owner records GO/NO-GO; every post-GO action remains separate | NO-GO or verified activation, kill, resume, final mode `on` |

---

### Task 1: Define Guarded Phase P Routes in Governance

**Files:**

- Modify: `docs/governance/solo-internal-change-and-production-policy.md:90-121`
- Modify: `docs/workflows/PRODUCTION_SCRIPTS.md:1-90`
- Modify: `DECISIONS.md`
- Modify: `tests/unit/docs/production-governance-routing.test.ts`

**Interfaces:**

- Consumes: existing `prod-schema-reconcile.yml`, `release-production.yml`, and
  Current Forecast admin routes.
- Produces: ADR-097 and exact canonical names for the Phase P workflows. This
  task grants no authority until the whole Phase P unit is admitted.

- [ ] **Step 1: Add the failing governance-routing assertions**

```ts
expect(policy).toContain('current-forecast-neon-rehearsal.yml');
expect(procedure).toContain('apply-current-forecast-0050-0055');
expect(procedure).toContain('current-forecast-production-action.yml');
expect(procedure).toContain('enter-shadow');
expect(procedure).toContain('activate');
expect(procedure).toContain('kill');
expect(procedure).toContain('resume');
expect(procedure).toContain('readback');
expect(decisions).toContain(
  '## ADR-097: Guarded Current Forecast Production Actions'
);
expect(decisions).toContain('Amended by ADR-097');
```

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
TZ=UTC npx vitest run \
  tests/unit/docs/production-governance-routing.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
```

Expected: FAIL because Phase P workflow names and ADR-097 are absent.

- [ ] **Step 3: Add ADR-097 and narrow canonical routing**

ADR-097 must record:

```markdown
Decision: production migration 0050-0055 remains an action-specific mode of
prod-schema-reconcile.yml. Isolated Neon rehearsal uses
current-forecast-neon-rehearsal.yml. Current Forecast state changes use
current-forecast-production-action.yml, which wraps only existing authenticated
routes. enter-shadow, activate, kill, and resume are separate dispatches;
readback is read-only. Evidence never supplies dispatch authority.
Amends ADR-095 decision 1: the candidate is the exact origin/main SHA selected
after complete Phase P admission, not the P0b hardening merge. ADR-095's
restart, hold-window, and identity-binding rules are unchanged.
```

Append under ADR-095 Decision item 1 the sentence `Amended by ADR-097: the
candidate is selected after complete Phase P admission.` and mirror it in
ADR-095 Consequences. ADR-095 is not rewritten; the amendment is additive.

Update `PRODUCTION_SCRIPTS.md` to state:

- `release-production.yml` remains the only deployment/promotion workflow;
- `prod-schema-reconcile.yml` remains the only production schema workflow;
- `current-forecast-neon-rehearsal.yml` is the guarded isolated-branch route;
- `current-forecast-production-action.yml` wraps existing HTTP routes and owns
  only action-time identity fencing, protected session credentials, the
  initial request plus same-key replay, the activation-only fresh-key conflict
  probe, and post-state readback;
- none becomes canonical before the complete Phase P unit is admitted.

- [ ] **Step 4: Run the focused and policy checks**

```bash
TZ=UTC npx vitest run \
  tests/unit/docs/production-governance-routing.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
TZ=UTC npm run policy:verify
TZ=UTC npm run docs:check-links
```

Expected: PASS.

- [ ] **Step 5: Create a local checkpoint only**

```bash
git add \
  docs/governance/solo-internal-change-and-production-policy.md \
  docs/workflows/PRODUCTION_SCRIPTS.md \
  DECISIONS.md \
  tests/unit/docs/production-governance-routing.test.ts
git diff --cached --check
git commit -m "docs(release): define current forecast guarded actions"
```

Do not merge or dispatch from this partial Phase P state.

---

### Task 2: Add a Bounded Journaled 0050-0055 Schema Lane

**Premise (verified):** the existing production schema workflow cannot apply
migrations 0054-0055 today. `.github/workflows/prod-schema-reconcile.yml:118-122`
accepts only `audit`, `apply`, and `apply-catchup-0050-0053` and exits 1 on any
other mode. `scripts/reconcile-prod-schema.mjs:37-41` documents that the single
governed catch-up capability covers exactly the four G3 manifests 0050-0053, and
`:2234-2238` shows the apply selector resolves only the G3-catchup or 0053-only
capability. Manifests 31 and 32 (0054, 0055) have no sanctioned apply path, so a
bounded journaled lane is a real prerequisite, not scope drift. Task 2 adds that
lane; it does not reinterpret the 0050-0053 reconcile ledger.

**Files:**

- Create: `scripts/current-forecast-journaled-migration-range.mjs`
- Create: `scripts/run-current-forecast-journaled-migrations.mjs`
- Modify: `.github/workflows/prod-schema-reconcile.yml:65-125,590-780`
- Modify: `shared/contracts/schema-reconcile-receipt-v1.contract.ts:1-105`
- Modify: `scripts/release/build-schema-reconcile-receipt.ts:1-240`
- Modify: `tests/unit/scripts/prod-schema-reconcile-workflow.test.mjs`
- Modify: `tests/unit/scripts/production-schema-dispatch-block.test.mjs`
- Create: `tests/unit/scripts/current-forecast-journaled-migration-range.test.mjs`
- Create: `tests/integration/current-forecast-journaled-migration-recovery.test.ts`
- Modify: `tests/config/testcontainers-test-paths.mjs`
- Modify: `tests/unit/contracts/schema-reconcile-receipt-v1.contract.test.ts`
- Modify: `tests/unit/scripts/build-schema-reconcile-receipt.test.ts`

**Interfaces:**

- Produces:

```js
export const CURRENT_FORECAST_MIGRATION_TAGS = Object.freeze([
  '0050_g3_portfolio_and_calculation_schema',
  '0051_g3_canary_schema',
  '0052_g3_capital_call_notification_outbox',
  '0053_g3_release_gate_hardening',
  '0054_operating_decisions_spine',
  '0055_current_forecast_recompute_commands',
]);

export async function loadCurrentForecastMigrationRange({ migrationsDir });
export function classifyCurrentForecastLedgerState({ ledgerRows, targetEntries });
export function assertCurrentForecastRawMigrationSafeCatalog({
  appliedTargetCount,
  audits,
  catalog,
});
export async function createCurrentForecastMigrationFolder({ migrationsDir });
export async function runCurrentForecastJournaledMigrationRecovery(options);
```

- Adds workflow mode `apply-current-forecast-0050-0055` without changing
  existing `audit`, `apply`, or `apply-catchup-0050-0053` behavior.

- [ ] **Step 1: Add RED range and ledger-state tests**

Assert exact tags, adjacency, timestamps, SQL hashes, and the 0049 baseline:

```js
expect(entries.map(({ tag }) => tag)).toEqual([
  '0050_g3_portfolio_and_calculation_schema',
  '0051_g3_canary_schema',
  '0052_g3_capital_call_notification_outbox',
  '0053_g3_release_gate_hardening',
  '0054_operating_decisions_spine',
  '0055_current_forecast_recompute_commands',
]);
expect(entries.map(({ when }) => when)).toEqual([
  1785800400000,
  1785886800000,
  1785973200000,
  1786059600000,
  1788161773455,
  1788235843534,
]);
expect(entries.every(({ hash }) => /^[a-f0-9]{64}$/.test(hash))).toBe(true);
expect(classifyCurrentForecastLedgerState({
  ledgerRows: [expectedLedgerRow('0049_kpi_observations')],
  targetEntries: entries,
})).toEqual({ state: 'ready', appliedTargetCount: 0,
  lastAppliedTag: '0049_kpi_observations' });
expect(classifyCurrentForecastLedgerState({
  ledgerRows: expectedLedgerRowsThrough('0053_g3_release_gate_hardening'),
  targetEntries: entries,
})).toEqual({ state: 'ready', appliedTargetCount: 4,
  lastAppliedTag: '0053_g3_release_gate_hardening' });
```

`loadCurrentForecastMigrationRange` computes each expected ledger hash exactly as
Drizzle does: SHA-256 of the SQL file bytes. Also assert a mismatched hash,
duplicate row, gap, reorder, unknown timestamp, or post-0055 row fails closed.

- [ ] **Step 2: Run the range test and confirm RED**

```bash
TZ=UTC npx vitest run \
  tests/unit/scripts/current-forecast-journaled-migration-range.test.mjs \
  --config vitest.config.mjs --configLoader native --project=server
```

Expected: FAIL because the bounded helper does not exist.

- [ ] **Step 3: Implement the bounded migration slice and pre-mutation catalog fence**

Copy only the six target journal entries and SQL files into a temporary Drizzle
migrations directory. Preserve source journal version/dialect. Use
`mkdtemp`, validate exact adjacency and timestamps, and always remove the
temporary directory in `finally`.

`classifyCurrentForecastLedgerState` accepts only:

- `ready`: exact 0049 row followed by any contiguous, hash-matching prefix of
  0050-0055; return `appliedTargetCount` and `lastAppliedTag`;
- `complete`: exact hash-matching prefix through 0055;
- any gap, duplicate, reorder, hash mismatch, unknown timestamp, or later row:
  throw before mutation.

Before `migrate`, call `assertCurrentForecastRawMigrationSafeCatalog` with the
same-session ledger classification, audits, and raw catalog definitions for
manifest orders 27-32. Every already-ledgered migration in that range, 0054 and
0055 included, must return exact `SKIP` before `migrate`; a ledgered-but-damaged
0054 refuses here, never after 0055 commits. Bind these exact
`CREATE TABLE IF NOT EXISTS` sentinels:

```js
const CREATED_TABLE_BY_MIGRATION = Object.freeze({
  '0050_g3_portfolio_and_calculation_schema':
    'portfolio_company_update_receipts',
  '0051_g3_canary_schema': 'release_canary_runs',
  '0052_g3_capital_call_notification_outbox':
    'capital_call_notification_outbox',
  '0053_g3_release_gate_hardening':
    'fund_scenario_calculation_commands',
  '0054_operating_decisions_spine': 'operating_decisions',
  '0055_current_forecast_recompute_commands':
    'current_forecast_recompute_commands',
});
```

`catalog` carries the raw `pg_get_constraintdef` and `pg_get_indexdef` rows for
each sentinel table. The fence compares every constraint and index definition
to the exact definition its migration file creates; a same-named object with a
different definition refuses before `migrate`. The reconcile auditor checks
names only unless a manifest pins definitions (`reconcile-prod-schema.mjs:2350`),
which manifests 27-32 do not.

For an already-ledgered migration, require the corresponding whole manifest to
be exact `SKIP`. For a not-yet-ledgered migration, its sentinel table must be
either fully absent (`present: false`, exactly one `missing-table` delta naming
that table) or fully conforming (`action: 'SKIP'`, zero deltas). A present
sentinel with any missing column, constraint, index, trigger, or definition
mismatch is an unsafe partial table and must refuse before `migrate`.
`CREATE TABLE IF NOT EXISTS` cannot repair it.

For non-sentinel objects, allow only exact `(kind, name)` deltas implemented by
that migration's `ALTER TABLE ... ADD ... IF NOT EXISTS` or guarded `DO` block.
Keep a migration-specific allowlist covered by real-PostgreSQL pristine-0049
and every-prefix tests. Any extra delta or `REFUSE-FOR-HUMAN` refuses before
mutation.

Do not call the custom `apply-catchup-0050-0053` path from this lane and never
insert ledger rows directly. From a 0049 ledger, Drizzle executes the actual
additive/replay-safe 0050-0055 SQL in order; pre-existing catalog objects may
make 0050-0053 no-ops, but successful SQL execution is what records their
canonical Drizzle hashes.

- [ ] **Step 4: Add RED real-PostgreSQL recovery tests**

Cover:

```ts
it('audits 0050-0055 without writes');
it('applies six migrations once from exact 0049 baseline');
it('applies only 0054-0055 from exact 0053 Drizzle baseline');
it('resumes from every contiguous target prefix');
it('replays complete state as a no-op');
it('refuses a hash mismatch or non-contiguous target ledger before writes');
it('refuses a partial portfolio_company_update_receipts table before migrate');
it('refuses a partial release_canary_runs table before migrate');
it('refuses a partial operating_decisions table before migrate');
it('refuses a ledgered-but-damaged 0054 before migrate');
it('refuses a same-named constraint or index with a different definition');
it('refuses a partial capital_call_notification_outbox table before migrate');
it('refuses a partial fund_scenario_calculation_commands table before migrate');
it('refuses a pooled URL');
it('serializes concurrent runs with the schema advisory lock');
```

Before apply, a not-yet-ledgered migration may return `SKIP` or
`APPLY-MISSING-DDL`; an already-ledgered one must return `SKIP`; any other
action blocks. After apply, all six must
return `SKIP`. The post-apply test also asserts exact ordered timestamp/hash rows
through 0055.

The action-level `SKIP`/`APPLY-MISSING-DDL` check is necessary but not
sufficient. Orders 27-30 must also pass
`assertCurrentForecastRawMigrationSafeCatalog`; orders 31-32 may use the normal
action classification. For every partial-sentinel test, capture the ledger and
catalog before invocation, require a typed unsafe-catalog refusal, and assert
both snapshots remain unchanged. The runner must perform this fence before
calling Drizzle `migrate`, so a failing post-audit can never leave canonical
0050-0055 ledger hashes over an incomplete 0050-0053 table.

- [ ] **Step 5: Implement the runner on one direct PostgreSQL session**

On that session, classify the ledger, audit manifest orders 27-32, call
`assertCurrentForecastRawMigrationSafeCatalog`, and only then invoke Drizzle
`migrate`.

Follow `run-prod-journaled-migrations.mjs` for connection, timeouts, advisory
lock, Drizzle `migrate`, cleanup, and error classification. Read
`SELECT hash, created_at FROM public.drizzle_migrations ORDER BY created_at` on
the same direct session. Audit manifest orders 27-32. Do not invent a down
migration, custom-ledger shortcut, or direct ledger repair.

- [ ] **Step 6: Add workflow and receipt RED tests**

```js
expect(workflow.on.workflow_dispatch.inputs.mode.options).toContain(
  'apply-current-forecast-0050-0055'
);
expect(applyStep.run).toContain(
  'node scripts/run-current-forecast-journaled-migrations.mjs --apply --yes'
);
expect(receipt.mode).toBe('apply-current-forecast-0050-0055');
```

Assert `startsWith(inputs.mode, 'apply')` gates, attempt-1 enforcement,
protected `production-schema` environment, exact `expected_sha`, successful
post-audit, and attempt-qualified receipt artifact remain mandatory.

- [ ] **Step 7: Extend the existing workflow and receipt union minimally**

Add only the new mode branch. Do not generalize the existing 0045-0049 helper
or change 0050-0053 semantics. Add a dedicated receipt variant with:

```ts
{
  mode: 'apply-current-forecast-0050-0055';
  migrationRange: [
    '0050_g3_portfolio_and_calculation_schema',
    '0051_g3_canary_schema',
    '0052_g3_capital_call_notification_outbox',
    '0053_g3_release_gate_hardening',
    '0054_operating_decisions_spine',
    '0055_current_forecast_recompute_commands'
  ];
  preState: {
    state: 'ready' | 'complete';
    appliedTargetCount: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    lastAppliedTag: string;
  };
  postState: 'complete';
  applied: boolean;
}
```

- [ ] **Step 8: Run focused schema tests**

```bash
TZ=UTC npx vitest run \
  tests/unit/scripts/current-forecast-journaled-migration-range.test.mjs \
  tests/unit/scripts/prod-schema-reconcile-workflow.test.mjs \
  tests/unit/scripts/production-schema-dispatch-block.test.mjs \
  tests/unit/contracts/schema-reconcile-receipt-v1.contract.test.ts \
  tests/unit/scripts/build-schema-reconcile-receipt.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
TZ=UTC npx vitest run \
  tests/integration/current-forecast-journaled-migration-recovery.test.ts \
  --config vitest.config.testcontainers.ts --configLoader native
```

The unit config excludes `tests/integration/**` (`vitest.config.mjs:145`), so
the recovery test runs only through the Testcontainers config and must be
registered in `tests/config/testcontainers-test-paths.mjs`.

Expected: PASS.

- [ ] **Step 9: Create a local checkpoint only**

Stage every path listed in this task, run `git diff --cached --check`, then:

```bash
git commit -m "feat(release): add current forecast journaled migration lane"
```

Do not merge or dispatch from this partial Phase P state.

---

### Task 3: Add the Isolated Neon Rehearsal Workflow

**Files:**

- Create: `scripts/release/rehearse-current-forecast-neon.mjs`
- Create: `.github/workflows/current-forecast-neon-rehearsal.yml`
- Create: `tests/unit/scripts/current-forecast-neon-rehearsal.test.mjs`
- Modify: `tests/regressions/ci-fail-closed.test.ts`

**Interfaces:**

```ts
type RehearsalInput = {
  expectedSha: string;
  projectId: string;
  parentBranchId: string;
  databaseName: string;
  expectedParentMigrationTail:
    | '0049_kpi_observations'
    | '0053_g3_release_gate_hardening';
};

type RehearsalRunOutputs = {
  githubRunId: string;
  githubRunAttempt: 1;
  candidateSha: string;
  projectId: string;
  parentBranchId: string;
  rehearsalBranchId: string;
  databaseName: string;
  directHostFingerprint: `sha256:${string}`;
  beforeMigrationTail: string;
  afterMigrationTail: '0055_current_forecast_recompute_commands';
  completedAt: string;
};
```

- [ ] **Step 1: Add RED workflow-contract tests**

Assert the workflow:

- runs only on `workflow_dispatch` and `github.run_attempt == 1`;
- uses protected environment `production-schema`;
- requires exact candidate SHA, project ID, parent branch ID, database name,
  and expected parent migration tail;
- re-fetches live `refs/heads/main` before branch creation;
- rejects missing `NEON_API_KEY`, pooled connection hosts, and malformed IDs;
- invokes Task 2's one bounded `apply-current-forecast-0050-0055` runner;
- writes only GitHub run/attempt, branch IDs, database name, direct-host
  fingerprint, before/after tails, timestamps, and outcomes to typed workflow
  outputs and `GITHUB_STEP_SUMMARY`;
- does not call `actions/upload-artifact`, build a schema-reconcile receipt, or
  claim production schema-apply evidence;
- has no `pull_request` or Dependabot trigger.

- [ ] **Step 2: Run the test and confirm RED**

```bash
TZ=UTC npx vitest run \
  tests/unit/scripts/current-forecast-neon-rehearsal.test.mjs \
  tests/regressions/ci-fail-closed.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
```

Expected: FAIL because the workflow and helper do not exist.

- [ ] **Step 3: Implement read-before-create and exact returned-ID validation**

Use Node 22 `fetch` and `node:crypto`; add no dependency. The helper must:

1. read and validate the exact project and parent branch;
2. verify the expected parent migration tail through a direct connection;
3. create one rehearsal branch with an attempt-qualified name;
4. validate returned project ID and branch ID before requesting a connection;
5. reject pooled hosts and compute
   `sha256(lowercase(new URL(connectionString).hostname))` for safe identity
   output;
6. run `scripts/run-current-forecast-journaled-migrations.mjs --apply --yes`
   once; Task 2 resumes an exact contiguous Drizzle prefix from 0049 through
   0055 without using the custom 0050-0053 reconcile ledger;
7. run clean post-audit and complete-state replay/no-op checks;
8. run `tests/integration/current-forecast-journaled-migration-recovery.test.ts`,
   `tests/integration/current-forecast-manual-recompute.pg.test.ts`, and
   `tests/integration/current-forecast-reference.pg.test.ts` through
   `vitest.config.testcontainers.ts` inside the protected job with
   `TEST_DATABASE_URL` (not `DATABASE_URL`) set to the ephemeral direct URL that
   never leaves the job; setting `TEST_DATABASE_URL` makes the config skip its
   `global-setup.testcontainers.ts`, so assert no local container is started.
   Task 2 registers the recovery and reference suites in
   `tests/config/testcontainers-test-paths.mjs` (the manual-recompute suite is
   already registered);
9. return only the `RehearsalRunOutputs` fields above; never emit a URL,
   password, bearer token, or idempotency key.

Any lost create response or ambiguous branch identity stops dependent mutation.
The helper does not delete the rehearsal branch; custody persists through the
activation decision.

- [ ] **Step 4: Add the guarded workflow**

Set a concurrency group containing project ID and parent branch ID. Before the
helper call, validate exact live-main SHA and reject reruns. Map the helper
result to typed job outputs and an attempt-qualified GitHub summary. Do not
upload a schema receipt or any new evidence-format artifact: GitHub run ID, run
attempt, outputs, and summary are the rehearsal record.

- [ ] **Step 5: Run focused tests and create a local checkpoint**

```bash
TZ=UTC npx vitest run \
  tests/unit/scripts/current-forecast-neon-rehearsal.test.mjs \
  tests/regressions/ci-fail-closed.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
git add \
  scripts/release/rehearse-current-forecast-neon.mjs \
  .github/workflows/current-forecast-neon-rehearsal.yml \
  tests/unit/scripts/current-forecast-neon-rehearsal.test.mjs \
  tests/regressions/ci-fail-closed.test.ts
git diff --cached --check
git commit -m "feat(release): add current forecast Neon rehearsal"
```

Expected: PASS. Do not merge or dispatch from this partial Phase P state.

---

### Task 4: Add an Owner-Dispatched Existing-Route Wrapper

**Files:**

- Create: `scripts/release/current-forecast-production-action.mjs`
- Create: `.github/workflows/current-forecast-production-action.yml`
- Modify: `server/routes/health.ts:399-425`
- Create: `tests/unit/scripts/current-forecast-production-action.test.mjs`
- Create: `tests/unit/scripts/current-forecast-production-action-workflow.test.mjs`
- Create: `tests/unit/routes/database-health-identity.test.ts`
- Modify: `tests/regressions/ci-fail-closed.test.ts`

**Interfaces:**

```ts
type CurrentForecastAction =
  | { action: 'enter-shadow'; expectedVersion: number }
  | { action: 'activate'; expectedVersion: number; referenceId: number }
  | { action: 'kill'; expectedVersion: number }
  | { action: 'resume'; expectedVersion: number }
  | { action: 'readback' };

type ReleaseManifestIdentity = {
  runId: string;
  runAttempt: 1;
  artifactId: string;
  artifactName: string;
  artifactArchiveSha256: string;
  fileSha256: string;
};

type CurrentForecastActionContext = {
  expectedSha: string;
  fundId: number;
  action: CurrentForecastAction;
  vercelProjectId: string;
  vercelDeploymentId: string;
  canonicalHostname: string;
  releaseManifest: ReleaseManifestIdentity;
  databaseName: string;
  directHostFingerprint: `sha256:${string}`;
};
type DatabaseHealthIdentity = {
  database: 'connected';
  status: 'ok';
  databaseName: string;
  databaseUrlHostFingerprint: `sha256:${string}`;
  timestamp: string;
};
```

Exact route mapping:

| Action | Method and path | Body | Required post-state |
| --- | --- | --- | --- |
| `enter-shadow` | `PUT /api/admin/funds/:fundId/calculation-modes/current-forecast` | `{ expectedVersion, configuredMode: 'shadow', killSwitchActive: false }` | `configuredMode=shadow`, `effectiveMode=shadow`, non-null `shadowStartedAt` |
| `activate` | `POST /api/admin/funds/:fundId/current-forecast/activate` | `{ referenceId, expectedVersion }` | `configuredMode=on`, `effectiveMode=on`, served reference equals `referenceId` |
| `kill` | `PUT /api/admin/funds/:fundId/calculation-modes/current-forecast` | `{ expectedVersion, configuredMode: 'off', killSwitchActive: true }` | mode-row API and database: `configuredMode=off`, `effectiveMode=off`, `killSwitchActive=true`; serving resolver: `mode=held`; activation pointer unchanged |
| `resume` | `POST /api/admin/funds/:fundId/calculation-modes/current-forecast/resume` | `{ expectedVersion }` | `configuredMode=on`, `killSwitchActive=false`, activation pointer unchanged |
| `readback` | `GET /api/admin/funds/:fundId/calculation-modes/current-forecast` (plus `GET /api/health/db`) | none | reads only; emits the mode-row/serving-resolver post-state and database identity; mutates nothing |

`readback` carries no `expectedVersion`, generates no idempotency key, and
issues no unsafe request. Its only purpose is to resolve a prior ambiguous run:
it re-reads the direct-database mode row, the authenticated mode API, and the
serving resolver, emits the observed post-state and identity, and the owner
records the resolution in #1299. Fresh-key actions on that fund stay blocked
until a `readback` run has resolved the ambiguity. Because it mutates nothing,
the one-action-per-run and same-key-replay assertions in Step 2 apply only to
the four unsafe actions; `readback` is exempt from the replay/fresh-key-conflict
flow and asserts zero writes to the mode row.

- [ ] **Step 1: Add RED action-mapping tests**

For every discriminant, assert exact method, path, JSON body, expected response,
and invalid-field refusal. `referenceId` is required only for `activate`.

```js
expect(buildActionRequest({
  action: 'kill', fundId: 7, expectedVersion: 4,
})).toMatchObject({
  method: 'PUT',
  path: '/api/admin/funds/7/calculation-modes/current-forecast',
  body: { expectedVersion: 4, configuredMode: 'off', killSwitchActive: true },
});
```

- [ ] **Step 2: Add RED workflow-safety tests**

Assert `workflow_dispatch` only, `github.run_attempt == 1`, protected
`production-current-forecast` environment, one action per run, no PR trigger,
and no custom evidence artifact format. Require explicit dispatch inputs for:

- `expected_sha`, `fund_id`, `expected_version`, `action`, and the
  activate-only positive `reference_id`;
- expected Vercel project ID, deployment ID, and canonical hostname;
- exact existing release-evidence manifest run ID, attempt 1, artifact ID,
  artifact name, archive digest, and file SHA-256;
- expected database name and direct-host fingerprint.

The workflow must compare Vercel project ID and canonical hostname with the
protected environment variables, not trust dispatch text alone. It receives
`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `PRODUCTION_DATABASE_URL`,
`CANARY_RECONCILER_USERNAME`, `CANARY_RECONCILER_PASSWORD`, and
`VERCEL_AUTOMATION_BYPASS_SECRET` only from the protected environment.

The workflow must compare `database_name` and `direct_host_fingerprint` inputs
to protected non-secret environment variables `PRODUCTION_DATABASE_NAME` and
`PRODUCTION_DATABASE_DIRECT_HOST_SHA256`; dispatch text is never authoritative.
Add route tests proving authenticated `GET /api/health/db` queries
`current_database()`, computes
`sha256(lowercase(new URL(process.env.DATABASE_URL).hostname))` in the live API
process, rejects a missing or pooled `DATABASE_URL`, and never returns the raw
URL, hostname, username, or credentials. Add workflow tests proving any
protected-variable, direct-connection, or deployed-API identity mismatch exits
before the unsafe HTTP request.

- [ ] **Step 3: Run tests and confirm RED**

```bash
TZ=UTC npx vitest run \
  tests/unit/scripts/current-forecast-production-action.test.mjs \
  tests/unit/scripts/current-forecast-production-action-workflow.test.mjs \
  tests/unit/routes/database-health-identity.test.ts \
  tests/regressions/ci-fail-closed.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
```

- [ ] **Step 4: Implement the thin wrapper**

Extend protected `GET /api/health/db` with `DatabaseHealthIdentity`. Query
`current_database()` on the same application database connection used by the
route and compute `databaseUrlHostFingerprint` from the live process's parsed
`DATABASE_URL`; reject pooled URLs before returning `status: 'ok'`. Return no
raw connection material.

The wrapper must complete this machine fence before any unsafe action request:

1. require dispatch database identity equals the two protected environment
   variables;
2. connect through `PRODUCTION_DATABASE_URL` and prove that direct database
   name and host fingerprint equal those protected values;
3. authenticate to the canonical deployment with the existing cookie/CSRF
   flow;
4. call authenticated `GET /api/health/db` on that deployment and require its
   database name and live `DATABASE_URL` host fingerprint equal the same
   protected values and direct-connection observations;
5. only after all four checks pass, refresh CSRF and issue the mapped unsafe
   request.

If API points to database A while workflow secret points to database B, step 4
must fail before mutation. Post-state comparison remains defense in depth, not
the first database-binding check.

Use Node 22 `fetch`, `node:crypto`, and existing repository helpers; add no
dependency. Complete these fences before any mutation:

1. re-fetch live `main` and require exact `expected_sha`;
2. download the exact attempt-1 `release-evidence-manifest-v1` artifact by the
   supplied run/artifact identity, verify both supplied digests, parse it with
   `ReleaseEvidenceManifestV1Schema`, and require `source.sha` plus
   `release.vercel` project, deployment, hostname, and source SHA equal the
   action context;
3. query current Vercel state and reuse `verifyCanonicalPromotion` plus
   `verifyVercelEvidence`; do not create another provider verifier;
4. call canonical `/api/version` with the existing Vercel protection-bypass
   header and require exact commit SHA and production environment;
5. reject pooled database URLs, require `current_database()` equals the
   expected database name, require
   `sha256(lowercase(new URL(DATABASE_URL).hostname))` equals the supplied
   direct-host fingerprint, require migration tail 0055, then read the fund
   mode row, version, activation pointer, and serving resolver state;
6. require the database mode-row version equals `expectedVersion`;
7. use `CANARY_RECONCILER_USERNAME` and `CANARY_RECONCILER_PASSWORD` through
   the existing session flow: `GET /api/auth/csrf`, `POST /api/auth/login` with
   the bootstrap token, retain the session cookie, then refresh CSRF before
   the unsafe action request; do not introduce bearer authentication;
8. generate one run-scoped idempotency key internally, send the mapped request,
   then replay the same request with the same key inside the same workflow and
   require status 200 with `replayed: true`;
9. for `activate` only, generate a fresh key, repeat the activation request,
   and require status 409 without state change;
10. validate the mapped response schema, direct-database post-state, and
    serving resolver state. For `kill`, the mode row and mode API must report
    `configuredMode=off`, `effectiveMode=off`, `killSwitchActive=true`, while
    the serving resolver must report `mode=held` with unchanged pointer;
11. write action, source/release-manifest/provider/database identity digests,
    before/after versions, reference ID when applicable, all probe statuses,
    replay result, and UTC timestamps to typed outputs and
    `GITHUB_STEP_SUMMARY`.

Never persist credentials, cookies, CSRF tokens, database URL, request payload,
or idempotency keys. Existing service-layer business refusals and optimistic
locking remain authoritative.

Ambiguous outcome: if the initial request's response is lost after send, retry
the identical request with the same key up to three times with bounded backoff
inside the job, then reconcile against the direct-database mode row and the
mode API. Applied post-state plus a successful same-key replay closes the
action; otherwise the run fails with the post-state recorded. A failed or lost
run blocks every fresh-key action on that fund until the owner dispatches the
`readback` action defined in the route mapping above (read-only: mode row,
mode API, serving resolver, and `/api/health/db` identity; no unsafe request,
no idempotency key) and records the resolution in #1299. A workflow-safety test
proves a fresh-key action is refused while an unresolved ambiguous run exists
and permitted only after a `readback` resolution is recorded. The key lives only
in job memory.

- [ ] **Step 5: Implement action-specific replay tests**

Add a call-order assertion proving release manifest, provider identity,
`/api/version`, direct database identity, authenticated `/api/health/db`, mode
row/version, CSRF refresh, initial request, and same-key replay occur in that
order. For each database mismatch, assert the unsafe action mock has zero
calls. The fresh-key activation conflict remains after the successful replay.

Mock only I/O boundaries. Prove release-manifest, Vercel, `/api/version`,
database-name, host-fingerprint, migration-tail, and expected-version mismatch
each sends zero mutation requests. Prove bootstrap CSRF, login cookie, refreshed
CSRF, initial request, and same-key replay occur in order. Prove replay returns
the stored response, activation's fresh-key repeat returns 409 with no state
change, and any API/database/resolver post-state mismatch fails the workflow
even after HTTP 200.

- [ ] **Step 6: Run focused tests and create a local checkpoint**

```bash
TZ=UTC npx vitest run \
  tests/unit/scripts/current-forecast-production-action.test.mjs \
  tests/unit/scripts/current-forecast-production-action-workflow.test.mjs \
  tests/unit/routes/database-health-identity.test.ts \
  tests/regressions/ci-fail-closed.test.ts \
  --config vitest.config.mjs --configLoader native --project=server
git add \
  scripts/release/current-forecast-production-action.mjs \
  .github/workflows/current-forecast-production-action.yml \
  server/routes/health.ts \
  tests/unit/scripts/current-forecast-production-action.test.mjs \
  tests/unit/scripts/current-forecast-production-action-workflow.test.mjs \
  tests/unit/routes/database-health-identity.test.ts \
  tests/regressions/ci-fail-closed.test.ts
git diff --cached --check
git commit -m "feat(release): guard current forecast production actions"
```

Expected: PASS. Do not merge or dispatch from this partial Phase P state.

---

### Task 5: Reconcile Tracked Activation and Runtime Documentation

**Files:**

- Modify: `docs/1-plans/F_1.11.0_isolated-activation-train.plan.md`
- Modify: `docs/runbooks/current-forecast-shadow-soak.md`
- Modify: `README.md`
- Modify: `docs/ARCHI.md`
- Modify only through `npm run docs:routing:generate`:
  `docs/_generated/router-fast.json`, `docs/_generated/router-index.json`,
  `docs/_generated/staleness-report.md`

**Interfaces:**

- Produces one tracked activation source of truth that names Phase P, treats old
  SHAs as history, and maps every state action to Task 4's existing route.

- [ ] **Step 1: Reconcile source history and future candidate metadata**

Record `12af67a4`, `d2ed0197`, and `6fd4ece` as dated historical milestones.
Replace any fixed future candidate with:

```yaml
candidate_sha: selected_from_origin_main_after_phase_p_admission
candidate_tree_sha: recorded_at_candidate_selection
historical_review_baseline: 6fd4ece89215b64f5a4f6bec25a26c512040ff4d
```

Mark landed work complete only where exact source and named tests prove it.
Move obsolete instructions to a completed-evidence table.

- [ ] **Step 2: Replace conflicting execution order**

Use exactly:

```text
Phase P source admission
-> read-only readiness
-> new candidate selection and freeze
-> exact-SHA certification
-> isolated Neon rehearsal
-> separately authorized production migration
-> exact candidate release and canonical promotion
-> separately authorized shadow entry
-> deployed decision-spine evidence
-> four qualifying windows
-> GO or NO-GO
-> if GO: activate -> kill -> resume
```

Remove private-preview soak language. State canonical ingress receives facts
writes while database mode prevents V2 serving before activation.

- [ ] **Step 3: Correct containment and decision-expiry rules**

Before activation require only static/workflow and isolated-database containment
proof. After activation require separate kill and resume dispatches. If no
terminal decision is recorded within 14 days after Window 4 becomes green,
eligibility expires; unchanged identity requires one new seven-day extension
window, while identity drift restarts Window 1.

- [ ] **Step 4: Correct active runtime prose only**

`README.md` must state:

```text
Node 22.x; pinned baseline 22.23.2
npm package manager 10.9.2; engine >=10.8.0
```

`docs/ARCHI.md` section 1 must state the same Node 22.x / npm 10 contract in
place of the stale `>=20.19.0 <23` / Volta `20.19.0` text, and section 8's
`In-Flight Architecture Initiatives` must note that its `origin/main @ a3d0a6b6`
key predates the F_1.11.0 candidate identity, pointing forward to this plan and
the candidate selected after Phase P. Preserve historical Node 20 evidence in
archived reviews and old history.

- [ ] **Step 5: Regenerate and validate documentation**

```bash
TZ=UTC npm run verify:node-parity
TZ=UTC npm run docs:routing:generate
TZ=UTC npm run docs:routing:check
TZ=UTC npm run docs:check-links
git diff --check
```

- [ ] **Step 6: Create a local checkpoint only**

Stage only the files listed in this task, run `git diff --cached --check`, then:

```bash
git commit -m "docs(release): reconcile current forecast activation train"
```

Do not merge or dispatch from this partial Phase P state.

---

### Task 6: Validate and Admit the Complete Phase P Unit

**Files:** No additional source changes unless a gate exposes a defect.

**Interfaces:**

- Consumes: all Task 1-5 commits in one branch and one merge request.
- Produces: one owner-admitted Phase P merge SHA on `origin/main`, or a bounded
  source-admission blocker. It performs no provider or database mutation.

- [ ] **Step 1: Run the complete Phase P matrix**

```bash
TZ=UTC npm run check
TZ=UTC npm run lint
TZ=UTC npm run policy:verify
TZ=UTC npm run validate:schema-drift
TZ=UTC npm run docs:routing:check:ci
TZ=UTC npm run docs:check-links
TZ=UTC npm run test:testcontainers
TZ=UTC npm run build:web
TZ=UTC npm run build:server
TZ=UTC npm run build:workers
TZ=UTC npm run build:verify
git diff --check
```

Also run every focused test named in Tasks 1-4. Record start/end UTC, exit code,
exact branch/head SHA, and immutable CI run or retained local-log digest.

- [ ] **Step 2: Inspect the one-unit diff**

Confirm the merge request contains all Tasks 1-5 and no Program B or C product
work. Confirm no production credential or generated secret is present.

- [ ] **Step 3: Obtain a fresh exact-head review**

Reviewer must inspect source-fence ordering, direct-connection enforcement,
migration ledger classification, Neon returned-ID validation, action route/body
mapping, secret redaction, and documentation consistency. Any head change
invalidates the review and reruns Step 1.

- [ ] **Step 4: Record owner source admission separately**

Repository owner may merge only the complete green Phase P unit. After merge:

```bash
git -c core.fsmonitor=false fetch --prune origin
git rev-parse origin/main
git rev-parse 'origin/main^{tree}'
```

Record the merge SHA/tree. No provider or schema action follows automatically.

---

### Task 7: Complete Read-Only Readiness and Freeze a Candidate

**Files:** No repository source changes. Tracker edits require separate owner
authorization.

**Interfaces:**

- Consumes: the admitted Phase P merge SHA from Task 6.
- Produces: owner-recorded `READY_TO_CUT` or `DEFERRED`; if ready, one frozen
  candidate SHA/tree equal to current `origin/main`.

- [ ] **Step 0: Confirm F_1.11.0 P0a tracker reconciliation is discharged**

`READY_TO_CUT` requires every F_1.11.0 P0a GitHub-only correction to be recorded
first, because soak evidence otherwise cites issues that misdescribe the tree
(F_1.11.0 problem 1). Confirm and link in #1171: #1467 retirement wording
scoped to handler/policy/tests/matrix row only; #1171 body refreshed to this
baseline; #1294 gate statement rewritten with the candidate-SHA placeholder,
ten-surface enumeration, and restart rule; #1298 reconciled to the
single-SHA-across-soak contract and the `current-forecast-shadow-soak.md`
runbook; #1283 runbook citation corrected; #1295 amended additively with
candidate/deployment/database/config binding fields; #1292 rubric corrected
(drop legacy parity, containment drill post-GO, manifest reference to the #1295
binding record); #1297 reconciled to four windows with the evidence-readiness
audit. Any open P0a item blocks `READY_TO_CUT`.

- [ ] **Step 1: Refresh source, worktree, and toolchain identity**

```bash
git -c core.fsmonitor=false fetch --prune origin
git rev-parse origin/main
git rev-parse 'origin/main^{tree}'
git status --short
git worktree list --porcelain
node --version
npm --version
TZ=UTC npm run verify:node-parity
```

Expected: Phase P merge is an ancestor of `origin/main`; controlled runtime
parity reports Node 22.23.2 and package manager npm 10.9.2. If the interactive
shell reports another allowed Node 22/npm 10 version, do not use that shell for
certification: enter the repository-pinned `.nvmrc` or Volta toolchain and rerun
the commands. If `origin/main` changed after readiness began, restart Task 7.

- [ ] **Step 2: Record current authenticated provider topology**

Record in #1283:

- Vercel team/project, canonical hostname, deployment ID/SHA, runtime, aliases,
  and environment designation;
- Railway project/environment and exact service IDs for `fund-scenario-calc`
  and `capital-call-status`, including deployment IDs/SHAs, replicas, health,
  and autodeploy readback;
- Neon project, intended production branch, database, direct-host fingerprint,
  PostgreSQL version, migration tail, branch limit, and isolation state;
- Redis/queue identity used by API and both workers;
- required variable names, with all values redacted.

Any required unresolved field is literal `UNKNOWN` and yields `DEFERRED`.

- [ ] **Step 3: Record backup, restore, credential, custody, and calendar proof**

Record managed backup/PITR, isolated restore freshness and digest, custody
roles, preview/restore isolation, protected-environment secret availability,
and named operator coverage for certification, four windows, decision, and
containment. Missing evidence yields `DEFERRED`.

- [ ] **Step 4: Reconcile trackers if separately authorized**

Snapshot and update #1171, #1283, #1294-#1299, and #1468 to point at the Phase P
plan, remove duplicate implementation instructions, and keep pending-command
cleanup conditional on observed orphan risk. Record exact edit timestamps.

- [ ] **Step 5: Record candidate freeze**

Owner records `READY_TO_CUT`, candidate SHA/tree, migration tail, provider
readback timestamp, dependency disposition, and admission hold. Any later
admitted commit selects a new candidate and invalidates downstream evidence.

---

### Task 8: Certify the Exact Candidate

**Files:** No source changes.

**Interfaces:**

- Consumes: Task 7 candidate SHA/tree.
- Produces: #1294 exact-SHA certification. No provider/database mutation.

- [ ] **Step 1: Create an isolated exact-candidate checkout**

Use `superpowers:using-git-worktrees` at execution time. Confirm `HEAD` and
`HEAD^{tree}` equal Task 7. Record OS, architecture, Docker, Node, and npm.

- [ ] **Step 2: Install without dependency mutation**

```bash
npm ci
git status --short
```

Expected: no lockfile or source mutation.

- [ ] **Step 3: Run named static, financial, build, and database gates**

```bash
TZ=UTC npm run check
TZ=UTC npm run lint
TZ=UTC npm run policy:verify
TZ=UTC npm run validate:schema-drift
TZ=UTC npm run docs:routing:check:ci
TZ=UTC npm run docs:check-links
TZ=UTC npm run calc-gate
TZ=UTC npm run build:web
TZ=UTC npm run build:server
TZ=UTC npm run build:workers
TZ=UTC npm run build:verify
TZ=UTC npm run test:testcontainers
```

Run the exact route/mount, public-boundary, Current Forecast, migration, and
workflow-contract tests named in #1294. Run `npm run release:check` only if the
record claims release readiness.

- [ ] **Step 4: Record exact evidence and close only when green**

For every command record start/end UTC, exit code, candidate SHA/tree, and
immutable run URL or log digest. Preserve earlier failures and their
disposition. Close #1294 only if every required gate is green on this SHA.

---

### Task 9: Rehearse and Apply the Journaled Database Path

**Files:** No source changes. Every workflow dispatch is separately authorized.

**Interfaces:**

- Consumes: Task 8 certification and Task 7 exact Neon/restore identities.
- Produces: rehearsal GitHub run/attempt outputs and summary, then one
  separately authorized production schema-reconcile receipt proving the
  intended target reaches migration tail 0055.

- [ ] **Step 1: Dispatch isolated Neon rehearsal**

Owner dispatches `current-forecast-neon-rehearsal.yml` with exact Task 7 IDs and
Task 8 SHA. Verify returned branch ID before any database connection. Preserve
the branch through the activation decision.

- [ ] **Step 2: Verify rehearsal behavior**

The rehearsal run outputs and summary must prove returned branch identity,
database name, direct-host fingerprint, ledger order, expected
objects/indexes/constraints, clean post-audit, complete-state replay/no-op, and
final tail 0055. They are not a schema-reconcile receipt. Against the branch,
run recompute creation, terminal replay, different-material conflict,
pending-owner refusal, stale recovery, terminalization, and activation/held
transaction tests.

- [ ] **Step 3: Re-fence production target and restore reference**

Immediately before apply, re-read candidate, project/branch/database/host,
migration tail, backup/PITR, restore freshness/digest, custody, and isolation.
Any mismatch stops with zero mutation.

- [ ] **Step 4: Apply the bounded journaled range through one owner dispatch**

Dispatch `prod-schema-reconcile.yml` once in
`apply-current-forecast-0050-0055` mode. The Task 2 ledger classifier may start
only from exact 0049 or an exact contiguous, hash-matching Drizzle prefix
through 0055; it applies only missing migrations and records their canonical
Drizzle hashes. Any gap, duplicate, reorder, hash mismatch, unknown row, later
row, or non-direct host stops before mutation. Do not call the custom
`apply-catchup-0050-0053` route and do not split 0050-0055 across dispatches.

- [ ] **Step 5: Publish immutable database binding evidence**

Record project/branch/database/host fingerprint, exact pre-state classification
and applied-target count, before/after tail, workflow run/attempt/artifact IDs
and digests, receipt SHA-256, restore reference, and UTC readbacks. No
deployment follows automatically.

---

### Task 10: Deploy and Bind One Qualifying Runtime

**Files:** No source changes. Deployment/promotion actions use existing
`release-production.yml`.

- [ ] **Step 1: Revalidate Vercel, Railway, database, and queue identities**

Start every observation from authenticated readback. Require both Railway
services to report autodeploy disabled before mutation.

- [ ] **Step 2: Dispatch exact candidate release**

If candidate changes worker code, use the required two-phase sequence:
`railway-workers-only`, evidence checkpoint, then separately authorized `full`.
Otherwise use the canonical full procedure and record exact reuse/deployment
behavior. Require exact candidate SHA for Vercel and both workers.

- [ ] **Step 3: Promote candidate API while mode remains off**

Verify canonical `/api/version` before and after promotion. Confirm Current
Forecast mode remains `off`, no V2 served pointer exists, and facts writes reach
the candidate API.

- [ ] **Step 4: Publish immutable binding record**

Record candidate/tree, Vercel project/deployment/alias, both Railway
service/deployment IDs, build/container digests, database identity/tail, queue
identity, environment designation, runtime versions, autodeploy status, and
redacted configuration manifest.

---

### Task 11: Enter Shadow and Prove the Deployed Decision Spine

**Files:** No source changes.

- [ ] **Step 1: Preflight and dispatch `enter-shadow`**

Require zero pending recompute commands for target funds and no stale unresolved
command. Read current mode version, then owner separately dispatches Task 4's
`enter-shadow`. Record returned `shadowStartedAt`, version, fund set, corpus,
candidate, provider/database IDs, and operator.

- [ ] **Step 2: Execute the existing sanitized decision spine**

Use #1296's sequence:

```text
CSV artifact -> observation -> reconciliation -> working selection
-> facts snapshot 1.1.0 -> financing/tranche/participation
-> facts-triggered recompute -> Current Forecast shadow reference
-> reserve intelligence plus Internal Economics from the same snapshot
-> analysis reference -> decision -> task
```

Exercise one alias write-back, one bulk accept, one default working selection,
and one reasoned operator override. Keep reserve reference nullable and economics
reference pinned. Create no official report, public share, delivery, notice,
payment, or legal/tax artifact.

- [ ] **Step 3: Prove concurrency and temporal boundaries**

Prove first create, terminal replay, different-material conflict, concurrent
single owner/outcome, active-pending non-steal, existing 90-second stale
recovery, shared fund lock serialization, PostgreSQL clock/microsecond
boundaries, and no activation race with terminal recompute write.

- [ ] **Step 4: Prove deployed boundaries**

Against canonical candidate ingress, accept 4 MiB and reject 4 MiB + 1 byte with
413. Run bidirectional internal-source boundary tests. Verify runtime identities
before and after. Confirm served production value remains unchanged.

- [ ] **Step 5: Assemble existing evidence surfaces**

Close #1296 only when green. Complete #1297 with exact certification, binding,
probe, spine, quantitative shadow, corpus, authorizer, fee-lane checkpoint, and
containment readiness links. Do not create another evidence document.

---

### Task 12: Complete Four Qualifying Seven-Day Windows

**Files:** No source changes.

- [ ] **Step 1: Enforce formal soak controls**

Prohibit manual recompute for soak-target funds. Each window records exact UTC
interval, identity checks at both boundaries, at least one facts-commit-triggered
run, complete committed corpus evaluation, result/reference hashes, outcome
counts, reconciliation IDs, latest decisive observation, manual-row audit, and
operator/automation identity.

- [ ] **Step 2: Apply the green predicate to every window**

A window is green only when:

- exact-basis replay reproduces the pinned result hash for every committed base;
- at least 90 percent of evaluated bases are available;
- zero unexplained divergences exist;
- evaluation is non-empty;
- at least one organic facts-triggered run occurs;
- no prohibited manual recompute row exists;
- candidate, deployments, database, migration, accepted source, corpus, and
  relevant environment remain unchanged.

Across the full soak require at least two distinct accepted facts bases.

- [ ] **Step 3: Apply restart and evidence-debt rules**

Never backfill a missed observation. Empty/probe-only windows do not count.
Identity drift, candidate-critical correction, accepted-source change, manual
recompute, or unexplained divergence restarts at Window 1.

- [ ] **Step 4: Record terminal-window eligibility**

When Window 4 is green, record the exact eligibility timestamp and decision
deadline 14 days later. Missing the deadline under unchanged identity requires
one new seven-day extension window; any identity change restarts Window 1.

---

### Task 13: Record GO/NO-GO and Execute Post-GO Actions

**Files:** No source changes. Every action is separately owner-dispatched.

- [ ] **Step 1: Record the human decision**

Create the GO/NO-GO `operating_decisions` row through the existing decision API.
Link it through the existing decision-evidence-link API to the exact same-fund
`analysis_reference` produced in Task 11; that immutable analysis reference
already pins the economics evidence used for the decision. Do not put a GitHub
issue URL or issue number into a nonexistent database evidence field. Record
the decision row ID, evidence-link ID, and linked analysis-reference ID in
#1297 and #1299 as external navigation. On NO-GO, keep current serving mode and
record the smallest corrective program. Do not leave an indefinite `READY`
state.

- [ ] **Step 2: Re-fence immediately before activation**

Re-read candidate, deployments, target database, migration tail, source/corpus,
mode-row version, approved green reference, restore/containment evidence, and
decision deadline. Any mismatch stops with zero mutation.

- [ ] **Step 3: Dispatch `activate` and verify latch semantics**

Owner dispatches Task 4's `activate` with the approved #1297 `referenceId` and
current mode `expectedVersion`. Verify atomic mode, activation event, and served
pointer; same-key replay 200 with `replayed: true`; fresh-key repeat 409; served
reference equals approved cutover reference.

- [ ] **Step 4: Dispatch `kill` and verify held containment**

Read the new mode version. Owner separately dispatches `kill`, which maps to:

```json
{
  "expectedVersion": 5,
  "configuredMode": "off",
  "killSwitchActive": true
}
```

Use the actual read version, not literal 5. Verify the mode-row database and
mode API report `configuredMode=off`, `effectiveMode=off`, and
`killSwitchActive=true`; verify the serving resolver reports `mode=held` with
the same activation pointer and the legacy engine remains unreachable.

- [ ] **Step 5: Dispatch `resume` and verify final state**

Read the held-row version. Owner separately dispatches `resume`. Verify mode
`on`, kill switch false, same activation pointer, version advanced once, and
same-key replay returns 200 with `replayed: true`.

- [ ] **Step 6: Close the terminal record**

Record post-action runtime identities, every workflow run/attempt/artifact,
database versions, cutover reference, containment result, final serving state,
and owner decision in #1299. Then delete the rehearsal branch by its exact
recorded branch ID and read back its absence, or record owner-named,
date-bound retention custody in #1299.

## Definition of Done

1. Tasks 1-5 entered `main` only as one reviewed Phase P unit.
2. A new exact post-Phase-P candidate SHA/tree spans certification, binding,
   shadow evidence, soak, and final fence.
3. All production mutations were separately repository-owner-dispatched.
4. Migration 0050-0055 was rehearsed and applied through one journaled,
   direct-connection path with clean replay evidence.
5. Four qualifying windows met organic activity, corpus, identity, and manual
   provenance rules.
6. Program ends in explicit NO-GO or verified GO plus activation, kill, resume,
   and final mode `on`.

## Self-Review Record

- **Spec coverage:** Phase P admission, exact-SHA certification, provider and
  database binding, rehearsal/apply, deployment, shadow spine, soak, activation,
  and containment each have a task and exit condition.
- **No duplicate route:** Task 4 wraps existing routes only; it adds no server
  endpoint or activation mechanism.
- **Candidate consistency:** `6fd4ece...` is historical; the candidate is
  selected only after complete Phase P source admission.
- **Authority consistency:** Source admission and every external mutation remain
  separate repository-owner decisions.
