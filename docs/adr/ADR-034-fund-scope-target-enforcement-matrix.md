# ADR-034: Fund-Scope Target-Enforcement Matrix

## Status

Accepted (2026-07-29)

## Context

`assertOwnedByFund` is a generic application-level ownership guard. Before this
decision, its public `FundScopedReference['kind']` vocabulary named twelve
target kinds, but the helper implemented ownership queries for only eight. Four
literals therefore advertised behavior the helper did not provide.

This decision separates two independent enforcement claims:

- Claim A is the helper's target-existence check. For every implemented kind, it
  is application-level: `assertOwnedByFund` selects by both target `id` and
  `fund_id` and rejects an empty result.
- Claim B is the backing table's own schema. It may separately declare a
  composite uniqueness or foreign-key mechanism that ties that row's `id` to its
  `fund_id`.

The `tasks` table is not part of this matrix. It has no target-kind or target-id
linkage, and its idempotency and optimistic-locking design are separate work.

## Decision

### Implemented target matrix

| Target kind            | Backing table                                                                             | Claim A                            | Claim B: schema-level `(id, fund_id)` mechanism                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `facts_snapshot`       | `financialFactsSnapshots` (`shared/schema/financial-facts-snapshots.ts:28`)               | App-level, via `assertOwnedByFund` | Present: `financial_facts_snapshots_id_fund_unique` (`shared/schema/financial-facts-snapshots.ts:73`).                                                                   |
| `current_plan_version` | `currentPlanVersions` (`shared/schema/current-plans.ts:25`)                               | App-level, via `assertOwnedByFund` | Absent: declared constraints cover fund idempotency, fund version, fund head, and created-time lookup, but not `(id, fund_id)` (`shared/schema/current-plans.ts:62-78`). |
| `fund_snapshot`        | `fundSnapshots` (`shared/schema/fund.ts:150`)                                             | App-level, via `assertOwnedByFund` | Absent: declared indexes and checks do not include `(id, fund_id)` (`shared/schema/fund.ts:183-220`).                                                                    |
| `analysis_reference`   | `internalAnalysisReferences` (`shared/schema/internal-analysis.ts:127`)                   | App-level, via `assertOwnedByFund` | Present: `internal_analysis_references_id_fund_unique` (`shared/schema/internal-analysis.ts:183`).                                                                       |
| `vehicle`              | `vehicles` (`shared/schema/vehicles.ts:20`)                                               | App-level, via `assertOwnedByFund` | Present: `vehicles_id_fund_unique` (`shared/schema/vehicles.ts:44`).                                                                                                     |
| `financing_event`      | `financingEvents` (`shared/schema/investment-ledger.ts:24`)                               | App-level, via `assertOwnedByFund` | Present: `financing_events_id_fund_unique` (`shared/schema/investment-ledger.ts:64`).                                                                                    |
| `financing_tranche`    | `financingTranches` (`shared/schema/investment-ledger.ts:86`)                             | App-level, via `assertOwnedByFund` | Present: `financing_tranches_id_fund_unique` (`shared/schema/investment-ledger.ts:202`).                                                                                 |
| `participation`        | `vehicleFinancingParticipations` (`shared/schema/vehicle-financing-participations.ts:27`) | App-level, via `assertOwnedByFund` | Present: `vfp_id_fund_unique` (`shared/schema/vehicle-financing-participations.ts:128`).                                                                                 |

The eight unit files use the same mocked-database accept/reject pair. They prove
that each kind resolves for a nonempty result and throws `FundScopeError` for an
empty result. They do not prove table or predicate selection because the mock's
`where()` function does not inspect its condition
(`tests/unit/lib/fund-scoped-ownership-participation.test.ts:9-12`).

### Version-one vocabulary

Version one exposes only the eight implemented kinds. Four unimplemented
literals are removed from `FundScopedReference['kind']`:

- `portfolio_company`: real identifiers are positive serial integers
  (`shared/schema/portfolio.ts:33-37`). A valid identifier could reach the
  helper's unimplemented-kind fallback, but repository search found no live
  non-test caller. It is excluded until a branch and caller exist together.
- `scenario_set`: real identifiers are UUIDs (`shared/schema/fund.ts:227-233`),
  and routes validate them as UUIDs
  (`server/routes/fund-scenario-sets.ts:54-56`). The helper's numeric-ID parser
  rejects a real scenario-set ID with `FundScopeError` before kind dispatch, so
  this kind cannot reach the 501 fallback. No live non-test caller exists.
- `reconciliation_case`: real identifiers are positive serial integers
  (`shared/schema/financial-observations.ts:422-426`). A valid identifier could
  reach the 501 fallback, but no live non-test caller exists.
- `source_observation`: real identifiers are positive serial integers
  (`shared/schema/financial-observations.ts:348-352`). A valid identifier could
  reach the 501 fallback, but no live non-test caller exists.

The generic `FundScopeKindNotImplementedError` and final fail-closed fallback
remain defensive runtime code. This decision narrows only the public type
vocabulary; it does not remove defensive handling.

## Consequences

- Callers can name only ownership targets with implemented lookup branches.
- Existing eight-kind runtime behavior is unchanged.
- Current-plan-version and fund-snapshot ownership remain application-level
  without a table-level `(id, fund_id)` sibling constraint.
- Adding a target kind now requires an implemented lookup branch and matching
  control-flow tests before it enters the public vocabulary.
- No schema, migration, task-service, idempotency, or optimistic-locking change
  is made.

## Alternatives Considered

- Keep all twelve literals and rely on 404/501 runtime failures: rejected
  because the public type would continue promising unsupported targets.
- Implement all four missing branches now: rejected because there are no live
  callers, scenario-set IDs are incompatible with the numeric helper contract,
  and this discovery stage does not authorize new lookup behavior.
- Remove the generic fallback error: rejected because fail-closed runtime
  defense remains useful even with an exhaustive public union.
