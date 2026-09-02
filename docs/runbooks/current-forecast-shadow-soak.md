# Current-Forecast V2 Shadow Soak Runbook

Status: pre-activation operating procedure

Scope: current-forecast V2 shadow observations only. This runbook records
evidence and recovery actions; it does not authorize activation, pointer
movement, or production changes by itself.

## Operating contract

Run four consecutive seven-day windows after the current-forecast mode enters
`shadow`. Each window has its own evidence record, but a window is not green
unless the complete committed replay corpus is evaluated for that window. Use
UTC timestamps, the returned `shadowStartedAt`, the fund id, deployed SHA, and
the database identity in every evidence record.

The four windows are:

1. Window 1: days 0 through 7 after the shadow transition.
2. Window 2: the next seven calendar days.
3. Window 3: the next seven calendar days.
4. Window 4: the next seven calendar days.

One candidate SHA serves all four windows. A candidate change (a new `main`
HEAD, a redeploy, or a reconfiguration of any bound unit) restarts the soak from
Window 1; no completed window survives it. Re-verify the deployed identity
against the #1295 binding record at every window boundary (see "Window-boundary
identity re-check").

Manual recompute against a soak-target fund is prohibited from the
production-side shadow deployment (soak start) until the flip. The activation
latch enforces the prohibition mechanically (see "One-way activation latch");
the per-window and pre-flip manual-row audits below remain the evidence controls
and are still required.

Take observations at least at window start and end, and after each organic
financial-facts commit or analysis checkpoint that invokes the shadow trigger.
Record the exact UTC interval, corpus revision, evaluated base names, outcome
counts, reconciliation row ids, latest decisive observation, and operator or
automation identity. A missed checkpoint is evidence debt; do not silently
backfill it with a fabricated clock or a latest-row query.

## ADR-057 green criteria

The governing decision is ADR-057 in `DECISIONS.md:8722`. A window is green only
when all three criteria hold:

- Exact-basis replay reproduces the pinned `resultHash` for every committed
  corpus base.
- At least 90 percent of evaluated bases produce an `available` value.
- There are zero UNEXPLAINED divergences.

Legacy numeric parity is explicitly not a criterion. The legacy lane is
nondeterministic by design and its divergence from V2 is expected and auditable.
Do not add a legacy-number comparison to the evidence or to the green decision.

Evaluate the outcomes with the server helper
`evaluateCurrentForecastShadowGreen` in
`server/services/current-forecast-shadow-service.ts`:

```ts
const evaluation = evaluateCurrentForecastShadowGreen(outcomes);
if (!evaluation.green) {
  // retain evaluation.replayInconsistent and
  // evaluation.unexplainedDivergences in window evidence
}
```

The helper filters to executed outcomes, counts only `available` outcomes for
coverage, reports bases whose result hash did not replay consistently, reports
UNEXPLAINED bases separately, and returns false for an empty evaluation. It
returns green only when replay inconsistency is empty, unexplained divergence is
empty, and available coverage is at least `0.90`.

## Window-boundary identity re-check

Run this check at the start of Window 1, at every window boundary, and again in
the pre-flip fence. Read each field back with the same tooling that produced the
#1295 binding record and compare field by field:

- Vercel: the active production deployment ID and the `/api/version` version/SHA
  readback.
- Railway, per required worker: the service ID, the deployment ID, the SHA
  readback, and the autodeploy-disabled readback.
- Database: the connection identity (host and database) and the schema identity
  from a clean `scripts/reconcile-prod-schema.mjs` run against the candidate-SHA
  manifest set.
- Target funds: the current-forecast mode row, compared with the bound row.

```sql
SELECT configured_mode,
       kill_switch_active,
       shadow_started_at,
       version,
       activated_at,
       cutover_reference_id
FROM fund_calculation_modes
WHERE fund_id = $1
  AND calculation_key = 'current_forecast';
```

Any absent, stale, or mismatched field stops the window. A same-SHA redeploy is
a mismatch: the binding is to deployment IDs, not to the SHA alone. Record the
readbacks and the comparison in the window evidence.

## Entering shadow mode

The current-forecast mode route is the only entry procedure for pre-cutover
shadow mode. It is admin-only, fund-scoped, rate-limited, and idempotency-keyed.
Obtain the current mode preview and its `version` first. Do not reuse an old
version after another mode write.

### Zero-pending-command preflight

Before the formal shadow transition, confirm that no manual recompute command is
pending for the target fund:

```sql
SELECT id,
       idempotency_key,
       started_at,
       created_by
FROM current_forecast_recompute_commands
WHERE fund_id = $1
  AND status = 'pending'
ORDER BY started_at ASC, id ASC;
```

The expected result is zero rows. A pending row younger than 90 seconds is an
in-flight command: wait for it to finalize and rerun the query. A pending row at
least 90 seconds old is stale and blocks entry until it is resolved. The only
resolution is a same-key, same-request attempt, which terminalizes the row as
`failed` / `stale_pending` without executing; do not delete or edit the row.
Record the preflight result in the Window 1 evidence. A pending row observed
during the soak blocks the window and promotes the pending-row janitor follow-up
from deferred to blocker.

```http
PUT /api/admin/funds/{fundId}/calculation-modes/current-forecast
Authorization: Bearer <admin-session>
Idempotency-Key: current-forecast-shadow-{fundId}-{utc-window-id}
Content-Type: application/json

{
  "expectedVersion": 0,
  "configuredMode": "shadow",
  "killSwitchActive": false
}
```

The expected response has `configuredMode: "shadow"`, `effectiveMode: "shadow"`,
`killSwitchActive: false`, a non-null `shadowStartedAt`, and an incremented
`version`. The current-forecast strategy permits `off -> shadow` without an
accepted reconciliation receipt; the mode service still preserves its
accepted-receipt requirements for MOIC. The returned `shadowStartedAt` starts
the first seven-day window. Never use an operator-supplied earlier timestamp.

If the mode route returns a version conflict, reread the preview and retry with
a new idempotency key only after confirming the intended state. A completed
request replay uses the same key and returns the stored response.

## Reconciliation-ledger queries

The current-forecast shadow writer stores append-only observations in
`substrate_shadow_reconciliations`. Known-domain fields remain scalar columns;
`mismatches` is the typed reason array. Replace `$1`, `$2`, and `$3` with
parameterized values in the database client. Do not paste secrets or database
credentials into evidence.

### Window observations

```sql
SELECT id,
       observed_at,
       substrate_state,
       reconciliation_status,
       input_hash,
       result_hash,
       assumptions_hash,
       mismatches,
       configured_mode,
       effective_mode,
       kill_switch_active
FROM substrate_shadow_reconciliations
WHERE fund_id = $1
  AND calculation_key = 'current_forecast'
  AND observed_at >= $2
  AND observed_at < $3
ORDER BY observed_at ASC, id ASC;
```

### Window counts

```sql
SELECT COUNT(*) AS evaluated_count,
       COUNT(*) FILTER (WHERE substrate_state = 'available') AS available_count,
       COUNT(*) FILTER (WHERE substrate_state = 'failed') AS failed_count,
       COUNT(*) FILTER (
         WHERE substrate_state = 'available'
           AND reconciliation_status = 'mismatch'
       ) AS available_mismatch_count
FROM substrate_shadow_reconciliations
WHERE fund_id = $1
  AND calculation_key = 'current_forecast'
  AND observed_at >= $2
  AND observed_at < $3;
```

The count query is an audit view, not a replacement for
`evaluateCurrentForecastShadowGreen`: the helper evaluates the corpus outcomes
and checks each expected result hash.

### Latest decisive observation

Use the same state-qualified ordering as the activation gate. A `failed` row is
decisive. An `available` row is decisive only when its reconciliation status is
`match` or `mismatch`. `unavailable` and `indicative` observations are not
decisive, even when their stored reconciliation status is `mismatch` or `match`.

```sql
SELECT id,
       observed_at,
       substrate_state,
       reconciliation_status,
       input_hash,
       result_hash,
       mismatches
FROM substrate_shadow_reconciliations
WHERE fund_id = $1
  AND calculation_key = 'current_forecast'
  AND (
    substrate_state = 'failed'
    OR (
      substrate_state = 'available'
      AND reconciliation_status IN ('match', 'mismatch')
    )
  )
ORDER BY observed_at DESC, id DESC
LIMIT 1;
```

The activation gate blocks when this latest decisive row is not `available` +
`match`. No decisive row produces no divergence blocker. A later available match
supersedes an earlier failed row. A non-decisive unavailable observation does
not supersede anything. The writer uses conflict-tolerant append-only inserts,
so a duplicate failed observation does not touch the successful row's timestamp
or reorder the ledger.

### Exact-basis reference cross-check

For a candidate reference, confirm that the shadow row carries the exact input
and result hashes of that reference. Do not substitute a latest snapshot or a
bare `fund_snapshot_id`.

```sql
SELECT r.id AS reference_id,
       r.fund_snapshot_id,
       r.input_hash AS reference_input_hash,
       r.result_hash AS reference_result_hash,
       s.id AS reconciliation_id,
       s.observed_at,
       s.substrate_state,
       s.reconciliation_status,
       s.result_hash AS observed_result_hash
FROM current_forecast_references AS r
LEFT JOIN substrate_shadow_reconciliations AS s
  ON s.fund_id = r.fund_id
 AND s.calculation_key = r.calculation_key
 AND s.input_hash = r.input_hash
 AND s.result_hash = r.result_hash
WHERE r.fund_id = $1
  AND r.id = $2;
```

### Per-window manual-provenance audit

Each window's evidence includes this query proving zero manual-provenance rows
for the target fund inside the window. Any pending command counts regardless of
timestamp. A terminal command counts when it started or finalized inside the
window, or when it created its reconciliation row inside the window
(`created_reconciliation = true`). Any returned row voids the window. This is an
evidence control: the observation queries above deliberately remain unfiltered
by provenance.

```sql
SELECT command.id AS command_id,
       command.idempotency_key,
       command.status,
       command.started_at,
       command.finalized_at,
       command.created_reconciliation,
       command.shadow_reconciliation_id,
       reconciliation.observed_at
FROM current_forecast_recompute_commands AS command
LEFT JOIN substrate_shadow_reconciliations AS reconciliation
  ON reconciliation.id = command.shadow_reconciliation_id
WHERE command.fund_id = $1
  AND (
    command.status = 'pending'
    OR (command.started_at >= $2 AND command.started_at < $3)
    OR (command.finalized_at >= $2 AND command.finalized_at < $3)
    OR (
      command.created_reconciliation
      AND reconciliation.observed_at >= $2
      AND reconciliation.observed_at < $3
    )
  )
ORDER BY command.started_at ASC, command.id ASC;
```

### Pre-flip manual-row audit

Immediately before the activation flip, attach two results to the #1299
evidence. First, the per-window query run over the entire soak-start-to-flip
interval (`$2` is the soak-start `shadowStartedAt`, `$3` is the audit time),
which covers the gaps before Window 1 and after Window 4; the expected result is
zero rows. Second, proof that the decisive row activation will read is organic:
take the id from the "Latest decisive observation" query and confirm that no
command row claims to have created it.

```sql
SELECT command.id AS command_id,
       command.status,
       command.started_at
FROM current_forecast_recompute_commands AS command
WHERE command.fund_id = $1
  AND command.shadow_reconciliation_id = $2
  AND command.created_reconciliation;
```

`$2` is the decisive reconciliation row id. The expected result is zero rows.

## Failure and retry interpretation

Each organic facts commit or analysis checkpoint is a new trigger opportunity.
The trigger resolves the current mode, uses the pinned receipt for the exact
basis, runs the shadow base, and records success, failure, or timeout without
failing the facts/checkpoint commit. A conflict-tolerant ledger insert is a
successful dedupe outcome, not permission to rewrite an existing observation.

Interpret rows by state and basis:

- `available` + matching result hash is a decisive success.
- `available` + mismatching result hash is a decisive divergence and blocks
  while it remains the latest decisive observation.
- `failed` is a decisive UNEXPLAINED divergence and blocks while it remains
  latest.
- `unavailable` is stored with `reconciliation_status = 'mismatch'` and a typed
  reason, but is skipped by latest-decisive gating.
- `indicative` is not a decisive state for this gate.
- A later exact-basis success can unblock a prior failure. A later decisive
  failure blocks again. A duplicate failure for an already-recorded null-result
  basis is ignored by the partial unique constraint and does not advance
  `observed_at`.

When a retry is needed, fix the underlying facts, plan, or runtime issue and
wait for the next organic commit. Do not delete ledger rows, change their
timestamps, advance the served pointer, create a rollback reference, or claim
green from an indicative or unavailable row.

## Kill-to-held containment drill

Run this drill only after the resume/re-arm command and admin route are deployed
and policy-verified. It is a containment rehearsal, not an activation step.

1. Confirm the fund is post-cutover: mode preview has non-null
   `activatedAt`/`cutoverReferenceId`, configured mode is `on`, and the served
   pointer is recorded. Capture the current version and pointer reference id.
2. With a fresh idempotency key, use the admin mode route to apply the approved
   kill state. The existing route refuses a direct mode-route write to `on`; a
   drill may set `configuredMode: "off"` and `killSwitchActive: true` to
   exercise the held path.
3. Read the dual forecast and confirm effective state `held`, the typed held
   reason, and the same pinned `cutoverReferenceId`. Confirm the legacy lane was
   not re-entered.
4. Inspect the reconciliation ledger and capture any bounded trigger outcome. A
   shadow failure or timeout is recorded and must not fail the facts commit.
5. Re-arm with the dedicated resume route, using the mode version returned by
   the kill-state write:

   ```http
   POST /api/admin/funds/{fundId}/calculation-modes/current-forecast/resume
   Authorization: Bearer <admin-session>
   Idempotency-Key: current-forecast-resume-{fundId}-{utc-drill-id}
   Content-Type: application/json

   { "expectedVersion": 5 }
   ```

6. Confirm the response and subsequent mode preview show `configuredMode: "on"`,
   `killSwitchActive: false`, and the same activation and pointer fields.
   Confirm the version advanced exactly once. Repeating the completed request
   with the same key returns `200` and `replayed: true`.

The resume command never advances or rolls back the served pointer. Pointer
advance and rollback references are lifecycle operations, never recovery
mechanisms. The drill must not call either operation to escape `held`.

## Evidence reconstruction queries

Replay evaluator inputs can be reconstructed by joining their exact `input_hash`
to the lowest-id persisted `CURRENT_FORECAST_V2` payload. Baseline and replay
snapshots legitimately share an input hash, so the lowest matching snapshot id
is the deterministic pinned row. The payload carries the financial-facts
snapshot id, current-plan version id, expected result hash, and pinned clock; do
not infer any of them from a latest snapshot.

```sql
SELECT r.id AS reconciliation_id,
       r.observed_at,
       r.input_hash,
       r.result_hash AS replay_result_hash,
       r.substrate_state,
       r.reconciliation_status,
       r.mismatches,
       s.id AS pinned_fund_snapshot_id,
       s.payload->>'financialFactsSnapshotId' AS financial_facts_snapshot_id,
       s.payload->>'currentPlanVersionId' AS current_plan_version_id,
       s.payload->>'resultHash' AS pinned_result_hash,
       s.snapshot_time AS pinned_clock,
       (r.result_hash IS NOT NULL
        AND r.result_hash = s.payload->>'resultHash') AS replay_consistent
FROM substrate_shadow_reconciliations AS r
JOIN LATERAL (
  SELECT s.id, s.payload, s.snapshot_time
  FROM fund_snapshots AS s
  WHERE s.fund_id = r.fund_id
    AND s.type = 'CURRENT_FORECAST_V2'
    AND s.payload->>'inputHash' = r.input_hash
  ORDER BY s.id ASC
  LIMIT 1
) AS s ON TRUE
WHERE r.fund_id = $1
  AND r.calculation_key = 'current_forecast'
  AND r.substrate_state IN ('available', 'indicative', 'unavailable')
  AND r.observed_at >= $2
  AND r.observed_at < $3
ORDER BY r.observed_at ASC, r.id ASC;
```

Construct one `CurrentForecastShadowOutcome` per query row: set `executed` to
`true`, copy `substrateState`, `reconciliationStatus`, and `mismatches`, and use
the query's `replay_consistent` value for `replayConsistent`. Set `unexplained`
to `false` for available/indicative rows with a typed mismatch reason and to
`true` for rows whose mismatch has no typed reason. For failed basis-marker
rows, use `executed: true`, `substrateState: 'failed'`,
`reconciliationStatus: 'mismatch'`, `replayConsistent: false`, and
`unexplained: true`. Then pass the complete array to
`evaluateCurrentForecastShadowGreen`. This preserves the evaluator's coverage
and divergence semantics, including executed unavailable outcomes.

Failed rows have no engine `result_hash`, so their durable basis identity is the
`basis:facts=...;plan=...;snapshot=...;clock=...` marker in the existing
`mismatches` JSONB string array. Extract it directly:

```sql
SELECT r.id AS reconciliation_id,
       r.observed_at,
       marker.value AS basis_marker,
       r.mismatches
FROM substrate_shadow_reconciliations AS r
CROSS JOIN LATERAL jsonb_array_elements_text(r.mismatches) AS marker(value)
WHERE r.fund_id = $1
  AND r.calculation_key = 'current_forecast'
  AND r.substrate_state = 'failed'
  AND marker.value LIKE 'basis:%'
  AND r.observed_at >= $2
  AND r.observed_at < $3
ORDER BY r.observed_at ASC, r.id ASC;
```

## One-way activation latch

Activation is one-way. A fresh-key repeat of the activation command returns
`409 already_activated`; it cannot be used to recover a held fund. Repeating a
completed activation request with the same idempotency key returns `200` with
`replayed: true`. Recovery from `held` exists only through the post-activation
resume/re-arm command, which clears the kill/configured hold controls while
preserving activation and pointer fields.

The latch also enforces the manual-run prohibition. The activation eligibility
check returns a typed `manual_recompute_since_shadow_start` blocker (`409`
`activation_blocked`) when any manual recompute command for the fund is pending,
started at or after the mode row's `shadow_started_at`, or finalized at or after
it. Deduplicated reconciliation does not exempt a command, and a missing
`shadow_started_at` fails closed. The blocker check and the flip run in one
transaction under a per-fund lock, so a manual claim cannot land between them. A
violated prohibition therefore cannot reach the flip even if an audit is missed.
The per-window and pre-flip audits remain the evidence controls and are still
required; the blocker is not a substitute for them.

## Evidence record

For each seven-day window attach:

- fund id, environment, provider/database identity, deployed SHA, and UTC
  start/end;
- the window-boundary identity re-check readbacks and their field-by-field
  comparison against the #1295 binding record;
- the per-window manual-provenance audit result (zero rows), and for #1299 the
  pre-flip manual-row audit and decisive-row organic check;
- mode transition response, `shadowStartedAt`, version, and idempotency key;
- corpus revision and every evaluated base name;
- `evaluateCurrentForecastShadowGreen` output, including coverage,
  replay-inconsistent bases, and unexplained divergences;
- reconciliation SQL results or exported row ids, with sensitive values
  redacted;
- latest decisive observation and the operator's interpretation;
- failures, retries, timeout records, and any kill-to-held drill result;
- approval, reviewer, and evidence-store references.

Do not mark a window green from logs alone, from a legacy parity comparison, or
from a latest-row query that ignores state qualification and exact basis.
