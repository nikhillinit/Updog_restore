import { sql } from 'drizzle-orm';
import {
  check,
  date,
  decimal,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { currentPlanVersions } from './current-plans';
import { financialFactsSnapshots } from './financial-facts-snapshots';
import { sourceArtifacts } from './financial-observations';
import { funds, fundSnapshots } from './fund';
import { users } from './user';
import { vehicles } from './vehicles';

/**
 * Internal LP economics persistence tier (Task 16.3 WP-L3 Phase A; ADR-065
 * items 2/3/6). Three append-only tables landing dormant ahead of their
 * services, mirroring how 0038 and 0044 landed:
 *
 * - `internal_capital_envelope_versions` — the immutable legal capital
 *   envelope (Brief 3). Corrections insert child versions via
 *   `parent_envelope_version_id`; rows are never updated.
 * - `internal_economics_policy_versions` — immutable authored economics
 *   policy (D3/P-D6). The terminal pair (`terminal_period_end`,
 *   `terminal_resolution_methodology_version`) lives in dedicated columns,
 *   written exclusively through the exported terminal-policy helpers
 *   (ADR-065 item 8), never raw date arithmetic.
 * - `internal_lp_economics_runs` — pure lineage (P-D4): FKs + hashes + state,
 *   never result values. Result payloads persist as `fund_snapshots` rows
 *   with `type = 'INTERNAL_LP_ECONOMICS'`, pinned here through typed
 *   composite FKs onto the new `fund_snapshots (id, type)` unique (P-D3).
 *
 * Immutability is DB-enforced by migration 0045's BEFORE UPDATE trigger web
 * (`internal_economics_forbid_update()` on all three tables plus a
 * type-scoped `fund_snapshots` trigger); triggers are not expressible in
 * Drizzle, so the migration and manifest 22's `triggerDefinitions` audit are
 * the authorities there.
 *
 * FK posture (L3-Q2 ruling, D8): every basis-version FK is
 * `ON DELETE restrict`; version-lineage self-FKs (`parent_*_version_id`) are
 * correction-chain references, not basis pins, and stay NO ACTION. `fund_id`
 * FKs cascade, matching the 0044 idiom.
 *
 * Every composite-FK target is a plain `unique()` constraint, never
 * `uniqueIndex` (drizzle-kit 42830 lesson). The ONE partial unique —
 * `internal_lp_economics_runs_result_snapshot_unique`, "exactly one run per
 * result snapshot" — is correctly a `uniqueIndex().where(...)` because PG
 * cannot express a partial UNIQUE constraint and nothing FKs it (precedent:
 * `fund_snapshots_scenarios_dedup_idx`).
 *
 * FK names are declared explicitly so the journaled migration (0045) and a
 * Drizzle push produce byte-identical catalog constraint names (G5).
 */
export const internalCapitalEnvelopeVersions = pgTable(
  'internal_capital_envelope_versions',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    version: integer('version').notNull(),
    mainFundVehicleId: integer('main_fund_vehicle_id').notNull(),
    lpCommitmentUsd: decimal('lp_commitment_usd', { precision: 20, scale: 6 }).notNull(),
    gpCommitmentUsd: decimal('gp_commitment_usd', { precision: 20, scale: 6 }).notNull(),
    totalCommitmentUsd: decimal('total_commitment_usd', { precision: 20, scale: 6 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().$type<'USD'>(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    sourceArtifactId: integer('source_artifact_id').notNull(),
    sourceConfigId: integer('source_config_id').notNull(),
    sourceConfigVersion: integer('source_config_version').notNull(),
    sourceConfigHash: varchar('source_config_hash', { length: 64 }).notNull(),
    attestedBy: integer('attested_by').notNull(),
    attestedAt: timestamp('attested_at', { withTimezone: true }).notNull(),
    envelopeHash: varchar('envelope_hash', { length: 64 }).notNull(),
    parentEnvelopeVersionId: integer('parent_envelope_version_id'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'internal_capital_envelope_versions_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    vehicleFundFk: foreignKey({
      columns: [table.mainFundVehicleId, table.fundId],
      foreignColumns: [vehicles.id, vehicles.fundId],
      name: 'internal_capital_envelope_versions_vehicle_fund_fk',
    }).onDelete('restrict'),
    sourceArtifactFundFk: foreignKey({
      columns: [table.sourceArtifactId, table.fundId],
      foreignColumns: [sourceArtifacts.id, sourceArtifacts.fundId],
      name: 'internal_capital_envelope_versions_source_artifact_fund_fk',
    }).onDelete('restrict'),
    attestedByFk: foreignKey({
      columns: [table.attestedBy],
      foreignColumns: [users.id],
      name: 'internal_capital_envelope_versions_attested_by_fk',
    }),
    parentFundFk: foreignKey({
      columns: [table.parentEnvelopeVersionId, table.fundId],
      foreignColumns: [table.id, table.fundId],
      name: 'internal_capital_envelope_versions_parent_fund_fk',
    }),
    idFundUnique: unique('internal_capital_envelope_versions_id_fund_unique').on(
      table.id,
      table.fundId
    ),
    fundVersionUnique: unique('internal_capital_envelope_versions_fund_version_unique').on(
      table.fundId,
      table.version
    ),
    fundIdempotencyUnique: unique('internal_capital_envelope_versions_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    currencyCheck: check(
      'internal_capital_envelope_versions_currency_check',
      sql`${table.currency} = 'USD'`
    ),
    lpNonnegativeCheck: check(
      'internal_capital_envelope_versions_lp_nonnegative_check',
      sql`${table.lpCommitmentUsd} >= 0`
    ),
    gpNonnegativeCheck: check(
      'internal_capital_envelope_versions_gp_nonnegative_check',
      sql`${table.gpCommitmentUsd} >= 0`
    ),
    totalPositiveCheck: check(
      'internal_capital_envelope_versions_total_positive_check',
      sql`${table.totalCommitmentUsd} > 0`
    ),
    /** Brief 3 invariant: exact numeric equality, DB-checkable on `numeric`. */
    commitmentSumCheck: check(
      'internal_capital_envelope_versions_commitment_sum_check',
      sql`${table.lpCommitmentUsd} + ${table.gpCommitmentUsd} = ${table.totalCommitmentUsd}`
    ),
    noSelfParentCheck: check(
      'internal_capital_envelope_versions_no_self_parent_check',
      sql`${table.parentEnvelopeVersionId} IS NULL OR ${table.parentEnvelopeVersionId} <> ${table.id}`
    ),
  })
);

export const internalEconomicsPolicyVersions = pgTable(
  'internal_economics_policy_versions',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    version: integer('version').notNull(),
    /** Contract literal `internal-economics-policy/1.0.0` (P-D6). */
    policySchemaVersion: text('policy_schema_version').notNull(),
    policyBody: jsonb('policy_body').notNull().$type<Record<string, unknown>>(),
    /** D4: persisted provenance; participates in `assumptions_hash`. */
    normalizationWarnings: jsonb('normalization_warnings').notNull().default([]).$type<unknown[]>(),
    terminalPeriodEnd: date('terminal_period_end').notNull(),
    terminalResolutionMethodologyVersion: text('terminal_resolution_methodology_version').notNull(),
    capitalEnvelopeVersionId: integer('capital_envelope_version_id').notNull(),
    assumptionsHash: text('assumptions_hash').notNull(),
    sourceConfigId: integer('source_config_id').notNull(),
    sourceConfigVersion: integer('source_config_version').notNull(),
    parentPolicyVersionId: integer('parent_policy_version_id'),
    createdBy: integer('created_by'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'internal_economics_policy_versions_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    envelopeFundFk: foreignKey({
      columns: [table.capitalEnvelopeVersionId, table.fundId],
      foreignColumns: [internalCapitalEnvelopeVersions.id, internalCapitalEnvelopeVersions.fundId],
      name: 'internal_economics_policy_versions_envelope_fund_fk',
    }).onDelete('restrict'),
    parentFundFk: foreignKey({
      columns: [table.parentPolicyVersionId, table.fundId],
      foreignColumns: [table.id, table.fundId],
      name: 'internal_economics_policy_versions_parent_fund_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'internal_economics_policy_versions_created_by_fk',
    }),
    idFundUnique: unique('internal_economics_policy_versions_id_fund_unique').on(
      table.id,
      table.fundId
    ),
    fundVersionUnique: unique('internal_economics_policy_versions_fund_version_unique').on(
      table.fundId,
      table.version
    ),
    fundIdempotencyUnique: unique('internal_economics_policy_versions_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    noSelfParentCheck: check(
      'internal_economics_policy_versions_no_self_parent_check',
      sql`${table.parentPolicyVersionId} IS NULL OR ${table.parentPolicyVersionId} <> ${table.id}`
    ),
  })
);

export const internalLpEconomicsRuns = pgTable(
  'internal_lp_economics_runs',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    policyVersionId: integer('policy_version_id').notNull(),
    factsSnapshotId: integer('facts_snapshot_id').notNull(),
    planVersionId: integer('plan_version_id').notNull(),
    forecastSnapshotId: integer('forecast_snapshot_id').notNull(),
    forecastSnapshotType: varchar('forecast_snapshot_type', { length: 50 })
      .notNull()
      .$type<'CURRENT_FORECAST_V2'>(),
    resultSnapshotId: integer('result_snapshot_id'),
    resultSnapshotType: varchar('result_snapshot_type', {
      length: 50,
    }).$type<'INTERNAL_LP_ECONOMICS'>(),
    runState: varchar('run_state', { length: 16 }).notNull().$type<'completed' | 'failed'>(),
    /** Null is legacy-only and requires calculation-contract registry verification. */
    calculationContractVersion: text('calculation_contract_version').$type<
      'lp-economics/1.0.0' | 'lp-economics/1.1.0'
    >(),
    /** Trust-Spine PR1: all certified V1.1 trust states are representable. */
    resultStatus: varchar('result_status', { length: 16 }).$type<
      'available' | 'indicative' | 'unavailable'
    >(),
    failureCode: text('failure_code'),
    failureContext: jsonb('failure_context').$type<Record<string, unknown>>(),
    /** Pinned basis clock (D9): evaluation time is basis, never now(). */
    evaluationClock: timestamp('evaluation_clock', { withTimezone: true }).notNull(),
    terminalMode: varchar('terminal_mode', { length: 24 })
      .notNull()
      .$type<'liquidate_at_horizon' | 'hold_unrealized'>(),
    engineVersion: text('engine_version').notNull(),
    methodologyVersion: text('methodology_version').notNull(),
    inputHash: varchar('input_hash', { length: 64 }).notNull(),
    resultHash: varchar('result_hash', { length: 64 }),
    createdBy: integer('created_by'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'internal_lp_economics_runs_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    policyVersionFundFk: foreignKey({
      columns: [table.policyVersionId, table.fundId],
      foreignColumns: [internalEconomicsPolicyVersions.id, internalEconomicsPolicyVersions.fundId],
      name: 'internal_lp_economics_runs_policy_version_fund_fk',
    }).onDelete('restrict'),
    factsSnapshotFundFk: foreignKey({
      columns: [table.factsSnapshotId, table.fundId],
      foreignColumns: [financialFactsSnapshots.id, financialFactsSnapshots.fundId],
      name: 'internal_lp_economics_runs_facts_snapshot_fund_fk',
    }).onDelete('restrict'),
    /** Plain FK by design (G7): `current_plan_versions` has no `(id, fund_id)`
     * unique; ownership is code-enforced via the existing
     * `current_plan_version` ownership kind. */
    planVersionFk: foreignKey({
      columns: [table.planVersionId],
      foreignColumns: [currentPlanVersions.id],
      name: 'internal_lp_economics_runs_plan_version_fk',
    }).onDelete('restrict'),
    forecastSnapshotTypeFk: foreignKey({
      columns: [table.forecastSnapshotId, table.forecastSnapshotType],
      foreignColumns: [fundSnapshots.id, fundSnapshots.type],
      name: 'internal_lp_economics_runs_forecast_snapshot_type_fk',
    }).onDelete('restrict'),
    resultSnapshotTypeFk: foreignKey({
      columns: [table.resultSnapshotId, table.resultSnapshotType],
      foreignColumns: [fundSnapshots.id, fundSnapshots.type],
      name: 'internal_lp_economics_runs_result_snapshot_type_fk',
    }).onDelete('restrict'),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'internal_lp_economics_runs_created_by_fk',
    }),
    idFundUnique: unique('internal_lp_economics_runs_id_fund_unique').on(table.id, table.fundId),
    fundIdempotencyUnique: unique('internal_lp_economics_runs_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    runStateCheck: check(
      'internal_lp_economics_runs_run_state_check',
      sql`${table.runState} IN ('completed','failed')`
    ),
    resultStatusCheck: check(
      'internal_lp_economics_runs_result_status_check',
      sql`${table.resultStatus} IS NULL OR ${table.resultStatus} IN ('available','indicative','unavailable')`
    ),
    terminalModeCheck: check(
      'internal_lp_economics_runs_terminal_mode_check',
      sql`${table.terminalMode} IN ('liquidate_at_horizon','hold_unrealized')`
    ),
    forecastSnapshotTypeCheck: check(
      'internal_lp_economics_runs_forecast_snapshot_type_check',
      sql`${table.forecastSnapshotType} = 'CURRENT_FORECAST_V2'`
    ),
    resultSnapshotTypeCheck: check(
      'internal_lp_economics_runs_result_snapshot_type_check',
      sql`${table.resultSnapshotType} IS NULL OR ${table.resultSnapshotType} = 'INTERNAL_LP_ECONOMICS'`
    ),
    /** P-D5 state coupling: a completed run is structurally inseparable from
     * exactly one result snapshot; a failed run structurally cannot carry one. */
    stateCouplingCheck: check(
      'internal_lp_economics_runs_state_coupling_check',
      sql`(
        ${table.runState} = 'completed'
        AND ${table.resultSnapshotId} IS NOT NULL
        AND ${table.resultSnapshotType} IS NOT NULL
        AND ${table.resultStatus} IS NOT NULL
        AND ${table.resultHash} IS NOT NULL
        AND ${table.failureCode} IS NULL
        AND ${table.failureContext} IS NULL
      )
      OR (
        ${table.runState} = 'failed'
        AND ${table.resultSnapshotId} IS NULL
        AND ${table.resultSnapshotType} IS NULL
        AND ${table.resultStatus} IS NULL
        AND ${table.resultHash} IS NULL
        AND ${table.failureCode} IS NOT NULL
        AND ${table.failureContext} IS NOT NULL
      )`
    ),
    /** P-D4 one-to-one linkage: exactly one run may pin a result snapshot.
     * Partial uniques cannot be UNIQUE constraints in PG and nothing FKs this
     * index, so the 42830 unique()-not-uniqueIndex lesson does not apply. */
    resultSnapshotUnique: uniqueIndex('internal_lp_economics_runs_result_snapshot_unique')
      .on(table.resultSnapshotId)
      .where(sql`${table.resultSnapshotId} IS NOT NULL`),
    fundCreatedIdx: index('idx_internal_lp_economics_runs_fund_created').on(
      table.fundId,
      table.createdAt.desc()
    ),
  })
);

export type InternalCapitalEnvelopeVersionRow = typeof internalCapitalEnvelopeVersions.$inferSelect;
export type InsertInternalCapitalEnvelopeVersionRow =
  typeof internalCapitalEnvelopeVersions.$inferInsert;
export type InternalEconomicsPolicyVersionRow = typeof internalEconomicsPolicyVersions.$inferSelect;
export type InsertInternalEconomicsPolicyVersionRow =
  typeof internalEconomicsPolicyVersions.$inferInsert;
export type InternalLpEconomicsRunRow = typeof internalLpEconomicsRuns.$inferSelect;
export type InsertInternalLpEconomicsRunRow = typeof internalLpEconomicsRuns.$inferInsert;
