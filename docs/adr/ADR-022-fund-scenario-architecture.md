---
status: Proposed
last_updated: 2026-05-26
---

# ADR-022: Fund-Results Scenario Architecture

## Status

Proposed (2026-05-25)

## Context

The results contract at `shared/contracts/fund-results-v1.contract.ts:208`
defines `sections.scenarios: SectionUnavailableSchema`. Replacing this with
authoritative fund-level scenario analysis requires architectural decisions
about scope, persistence, staleness, auth, and limits — all before schema or
contract code is written.

The repo already contains three distinct "scenario" surfaces:

| Surface                       | Scope                                 | Files                                                                                                                                          |
| ----------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Company/deal scenarios        | `company_id`-scoped                   | `shared/schema/scenario.ts`, `server/routes/scenario-analysis.ts`, `client/src/components/cap-table/scenario-manager.tsx`                      |
| Reserve allocation scenarios  | `fund_id`-scoped, allocation-specific | `server/routes/allocation-scenarios.ts`, `server/services/allocation-scenario-service.ts`, migration `20260330_allocation_scenarios_v1.up.sql` |
| Monte Carlo scenario matrices | Cache layer                           | `shared/migrations/0002_create_scenario_matrices.sql`, `server/workers/scenarioGeneratorWorker.ts`                                             |

Fund-results scenarios are a fourth, distinct concept: published-config-derived,
evidence-bearing, staleness-aware analytical outputs that belong in the
fund-results read model.

### Governing ADR

ADR-014 (Snapshot Governance, Accepted 2026-04-05) establishes that
`fund_snapshots` is the analytical snapshot store, type-scoped (`RESERVE`,
`PACING`, `COHORT`, etc.), and must not be confused with `fund_state_snapshots`
(time-travel/restore store). New analytical outputs land in `fund_snapshots`.

## Decision

### 1. Scope: new fund-scoped abstraction, quarantine existing surfaces

Create new `fund_scenario_sets` and `fund_scenario_variants` tables. Quarantine
existing surfaces:

| Existing surface                                | Disposition                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `shared/schema/scenario.ts` (company scenarios) | QUARANTINE — remains for cap-table/deal workflows                     |
| `server/routes/scenario-analysis.ts`            | QUARANTINE — company scenario CRUD                                    |
| `server/routes/allocation-scenarios.ts`         | KEEP — reserve allocation lane (distinct from fund-results scenarios) |
| `server/workers/scenarioGeneratorWorker.ts`     | REFERENCE_ONLY — evaluate for async path; do not reuse blindly        |
| `client/src/pages/v2/scenarios.tsx`             | QUARANTINE — mock/prototype; not production                           |
| `shared/utils/scenario-math.ts`                 | EVALUATE — may share portable logic                                   |

Rationale: existing `scenarios` are company-scoped by FK. Extending them with
optional `fund_id` overloads meaning. Allocation scenarios model reserve
snapshots and drift/apply/sync, not full fund-construction parameter scenarios.

### 2. Snapshot attribution: extend `fund_snapshots` per ADR-014

Store scenario analytical outputs in `fund_snapshots` with:

```sql
ALTER TABLE fund_snapshots
  ADD COLUMN scenario_set_id UUID NULL;

-- Authoritative reads filter scenario_set_id IS NULL; this partial index
-- covers the two-tier query pattern (fund_id + type + config_version,
-- ordered by snapshot_time DESC).
CREATE INDEX idx_fund_snapshots_authoritative
  ON fund_snapshots(fund_id, type, config_version, snapshot_time DESC)
  WHERE scenario_set_id IS NULL;

-- Scenario reads filter on a specific scenario_set_id.
CREATE INDEX idx_fund_snapshots_scenario_set
  ON fund_snapshots(fund_id, scenario_set_id, type, config_version)
  WHERE scenario_set_id IS NOT NULL;
```

Both indexes use standard `CREATE INDEX` inside a `BEGIN/COMMIT` migration (the
project's migration runner does not support `CONCURRENTLY`).

Use snapshot type `'SCENARIOS'` (the `type` column is `varchar(50)`, not an enum
— no `ALTER TYPE` migration required).

#### Guardrail: authoritative-read isolation (mandatory same-PR audit)

The migration adding `scenario_set_id` MUST ship in the same PR as read-path
patches. Every existing query against `fund_snapshots` must be audited and one
of:

- Patched to filter `scenario_set_id IS NULL` (authoritative-only reads).
- Explicitly marked
  `-- scenario-aware: reads both authoritative and scenario rows`.

**Merge gate:** `git grep "fund_snapshots\|fundSnapshots" -- server/ shared/`
must show every hit either has the filter or the scenario-aware comment. No
query may be left unclassified.

Known consumers to audit:

- `server/services/fund-results-read-service.ts` (two-tier `loadSection`)
- Calc-gate / calc-run completion
- Variance reads
- Publish-comparison service
- Snapshot staleness derivation

This is non-negotiable. If the column ships without filters, scenario variants
leak into authoritative surfaces from merge day forward.

### 3. Staleness semantics

Scenario snapshots carry staleness derived at read time:

| State           | Trigger                                                           | EvidenceHeader display                                           |
| --------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `CURRENT`       | Scenario calculated against current published config version      | Normal evidence                                                  |
| `STALE_PUBLISH` | Fund published config version > scenario's `config_version`       | Yellow: "Recalculate to reflect latest published config"         |
| `STALE_CONFIG`  | Scenario overrides reference entities removed from current config | Red: "Scenario overrides outdated — review before recalculating" |
| `CALCULATING`   | Calc job in flight                                                | Spinner with job ID                                              |
| `FAILED`        | Last calc attempt failed                                          | Red with error reason                                            |
| `UNAVAILABLE`   | No scenario set exists for this fund                              | Standard unavailable                                             |

**Precedence rule:** `STALE_CONFIG` > `STALE_PUBLISH`. If a scenario's overrides
reference a removed entity AND a new publish exists, show `STALE_CONFIG` because
recalculation without override edits would fail.

Staleness is computed by comparing:

- `fund_snapshots.config_version` vs. `funds.published_config_version`
- Override payload entity references vs. current published config contents

### 4. Auth: route-local enforcement (non-negotiable guardrail)

Every fund-scoped scenario route MUST attach `requireAuth()` and fund-access
check inline, regardless of mount point.

Existing `allocation-scenarios.ts:376` uses only `parseFundRoute` with no
route-local auth middleware — this pattern MUST NOT be repeated. The new
scenario surface must be secure independent of which app surface mounts it (per
ADR-021: `registerRoutes()` is authoritative, but Vercel adapter also exists).

Minimum permissions:

| Action                              | Requirement                                          |
| ----------------------------------- | ---------------------------------------------------- |
| Read scenario sets/results          | Authenticated + fund access                          |
| Create/update/archive scenario sets | Authenticated + fund access                          |
| Apply scenario to live config       | Elevated (publish permission)                        |
| Calculate scenario                  | Authenticated + fund access (does not imply publish) |

Audit logging (actor, timestamp, change summary) is mandatory for all mutations.
The existing company-scenario route already implements audit logging at
`server/routes/scenario-analysis.ts`; fund scenarios must not regress below that
baseline.

### 5. Calculation path

| Condition                                          | Path               | Timeout |
| -------------------------------------------------- | ------------------ | ------- |
| Thin slice (fee-only overrides, any variant count) | Sync (API request) | 10s     |
| Reserve/pacing/economics overrides                 | Async (BullMQ job) | 5 min   |

Scenario calculation MUST invoke the same engines used for authoritative
reserve/pacing snapshots, with overrides applied to the engine inputs, not to
the engine code paths. This ensures calc-gate coverage extends to scenario
results without a separate validation pipeline.

Do not reuse `scenarioGeneratorWorker` directly — it is a Monte Carlo matrix
cache worker, not an authoritative fund-scenario calculator. If async is needed,
create a dedicated `fundScenarioCalcWorker` that drives the existing engines.

### 6. Limits

All limits are PLACEHOLDER values pending measurement of real calc cost after
Phase 4 thin slice ships. Revisit after first 10 scenario calculations are
timed.

| Limit                                             | Placeholder value | Enforcement         |
| ------------------------------------------------- | ----------------- | ------------------- |
| Max scenario sets per fund                        | 10                | Service-level check |
| Max variants per set                              | 5                 | Service-level check |
| Max override sections per variant (first release) | 1 (fee-only)      | Contract validation |
| Async calc timeout                                | 5 min             | BullMQ job config   |
| Sync calc timeout                                 | 10s               | API-level timeout   |

### 7. Comparison surface

Do NOT extend `fund-results-comparison-v1.contract.ts`. Its docstring (lines
5-11) explicitly states it is "intentionally summary-level...not arbitrary
config-body diffing, broader analytics expansion."

Create a separate `fund-scenario-comparison-v1.contract.ts` when Phase 5
(scenario comparison UI) is scoped. Until then, scenario results render
independently from the publish-comparison surface.

### 8. Lifecycle proof requirements

The DB-backed lifecycle proof (built before scenario schema ships) must exercise
two isolation properties once `scenario_set_id` is added:

1. **Authoritative isolation:** with scenario rows present for the same fund +
   type + config_version, authoritative reads return ONLY
   `scenario_set_id IS NULL` rows.
2. **Scenario isolation:** scenario reads return ONLY rows matching the
   specified `scenario_set_id`, never authoritative rows.

Without both assertions, the test scaffolding cannot detect the regression it
exists to prevent.

### 9. First slice: fee-profile override

The first supported `overrideType` is fee-profile, not allocation/reserve.

Rationale: allocation/reserve override directly overlaps with the existing
`allocation_scenarios` infrastructure (planned_reserves_cents,
allocation_cap_cents, drift/apply/sync). Starting with fees avoids immediate
schema overlap and lets the fund-scenario abstraction establish its contract
cleanly before integrating with allocation infrastructure.

### 10. Snapshot retention

Scenario snapshot rows in `fund_snapshots` follow the same retention policy as
authoritative snapshots (no auto-delete). Archived scenario sets (via
`archived_at` on `fund_scenario_sets`) remain queryable but excluded from active
reads. Auto-archive after prolonged staleness is deferred to a product decision
after Phase 6 ships.

## Consequences

### Positive

- Fund-results scenarios have a dedicated abstraction without overloading
  company-scoped or allocation-scoped tables.
- Snapshot attribution follows ADR-014 governance, keeping one analytical store.
- Read-path isolation is enforced at merge time, not discovered after a
  production incident.
- Auth enforcement is inline rather than mount-dependent.
- Staleness is visible from day one via EvidenceHeader vocabulary.
- First slice avoids overlap with existing allocation-scenarios.

### Negative

- Every existing `fund_snapshots` consumer must be audited and patched before
  the column migration ships — front-loads work.
- Placeholder limits may be too restrictive (or too generous) until real calc
  cost is measured.
- Separate scenario comparison contract means a second comparison surface to
  maintain long-term.

## Alternatives Considered

### A. Separate `scenario_snapshots` table

Rejected. Violates ADR-014's governance boundary, duplicates the two-tier read
pattern, and requires a second consumer for calc-gate and staleness.

### B. Extend existing `scenarios` table with optional `fund_id`

Rejected. Overloads company-scoped semantics. FK complexity (optional
`fund_id` + discriminator). Contaminates both query paths.

### C. First slice as allocation/reserve override

Rejected. Directly overlaps with existing `allocation_scenarios` infrastructure.
Creates immediate duplication of drift/apply/sync semantics. Use fee-profile to
establish contract, then wrap allocation in a later phase.

### D. Extend `fund-results-comparison-v1.contract.ts` for scenario comparison

Rejected. Contract's own docstring forbids scope expansion beyond
current-vs-previous-published comparison.

## References

- ADR-014: Snapshot Governance (`docs/adr/ADR-014-snapshot-governance.md`)
- ADR-021: Runtime Authority (`docs/adr/ADR-021-runtime-authority.md`)
- ADR-013: Scenario Comparison Activation (Superseded)
- `shared/schema/fund.ts:119-148` — `fund_snapshots` table definition
- `server/services/fund-results-read-service.ts:196, 204-219` — hard-coded
  unavailable + two-tier read
- `server/routes/allocation-scenarios.ts:376` — fund route without route-local
  auth
- `shared/contracts/fund-results-comparison-v1.contract.ts:5-11` — scope-limited
  docstring
