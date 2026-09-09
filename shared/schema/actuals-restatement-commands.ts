import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { funds } from './fund';
import { users } from './user';
import { financialFactsSnapshots } from './financial-facts-snapshots';
import { sourceArtifacts } from './financial-observations';
import { cashFlowEvents, valuationMarks } from './lp-reporting-evidence';

export const actualsRestatementCommands = pgTable(
  'actuals_restatement_commands',
  {
    id: serial('id').primaryKey(),
    commandId: uuid('command_id').notNull(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id),
    idempotencyKey: uuid('idempotency_key').notNull(),
    operationHash: varchar('operation_hash', { length: 64 }).notNull(),
    expectedSnapshotId: integer('expected_snapshot_id').notNull(),
    expectedSnapshotInputHash: varchar('expected_snapshot_input_hash', { length: 64 }).notNull(),
    expectedPreviewHash: varchar('expected_preview_hash', { length: 64 }).notNull(),
    asOfDate: date('as_of_date').notNull(),
    reason: text('reason').notNull(),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    publicationSnapshotId: integer('publication_snapshot_id').notNull(),
    ledgerSourceArtifactId: integer('ledger_source_artifact_id'),
    valuationSourceArtifactId: integer('valuation_source_artifact_id'),
  },
  (table) => ({
    commandUnique: unique('actuals_restatement_commands_command_unique').on(table.commandId),
    commandFundUnique: unique('actuals_restatement_commands_command_fund_unique').on(
      table.commandId,
      table.fundId
    ),
    idempotencyUnique: unique('actuals_restatement_commands_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    publicationUnique: unique('actuals_restatement_commands_publication_unique').on(
      table.publicationSnapshotId
    ),
    expectedSnapshotFk: foreignKey({
      columns: [table.expectedSnapshotId, table.fundId],
      foreignColumns: [financialFactsSnapshots.id, financialFactsSnapshots.fundId],
      name: 'actuals_restatement_commands_expected_snapshot_fk',
    }),
    publicationFk: foreignKey({
      columns: [table.publicationSnapshotId, table.fundId],
      foreignColumns: [financialFactsSnapshots.id, financialFactsSnapshots.fundId],
      name: 'actuals_restatement_commands_publication_fk',
    }),
    ledgerArtifactFk: foreignKey({
      columns: [table.ledgerSourceArtifactId, table.fundId],
      foreignColumns: [sourceArtifacts.id, sourceArtifacts.fundId],
      name: 'actuals_restatement_commands_ledger_artifact_fk',
    }),
    valuationArtifactFk: foreignKey({
      columns: [table.valuationSourceArtifactId, table.fundId],
      foreignColumns: [sourceArtifacts.id, sourceArtifacts.fundId],
      name: 'actuals_restatement_commands_valuation_artifact_fk',
    }),
    hashCheck: check(
      'actuals_restatement_commands_hash_check',
      sql`${table.operationHash} ~ '^[a-f0-9]{64}$' AND ${table.expectedSnapshotInputHash} ~ '^[a-f0-9]{64}$' AND ${table.expectedPreviewHash} ~ '^[a-f0-9]{64}$'`
    ),
    reasonCheck: check(
      'actuals_restatement_commands_reason_check',
      sql`length(btrim(${table.reason})) BETWEEN 1 AND 500`
    ),
    artifactsCheck: check(
      'actuals_restatement_commands_artifacts_check',
      sql`${table.ledgerSourceArtifactId} IS NOT NULL OR ${table.valuationSourceArtifactId} IS NOT NULL`
    ),
    successorCheck: check(
      'actuals_restatement_commands_successor_check',
      sql`${table.expectedSnapshotId} <> ${table.publicationSnapshotId}`
    ),
  })
);

export const actualsRestatementItems = pgTable(
  'actuals_restatement_items',
  {
    id: serial('id').primaryKey(),
    commandId: uuid('command_id').notNull(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id),
    targetCashFlowEventId: integer('target_cash_flow_event_id'),
    replacementCashFlowEventId: integer('replacement_cash_flow_event_id'),
    targetValuationMarkId: integer('target_valuation_mark_id'),
    replacementValuationMarkId: integer('replacement_valuation_mark_id'),
    targetSourceHash: varchar('target_source_hash', { length: 64 }).notNull(),
    targetContentHash: varchar('target_content_hash', { length: 64 }).notNull(),
    replacementSourceHash: varchar('replacement_source_hash', { length: 64 }).notNull(),
    replacementContentHash: varchar('replacement_content_hash', { length: 64 }).notNull(),
    replacementExternalRef: varchar('replacement_external_ref', { length: 128 }).notNull(),
    originalPublicationSnapshotId: integer('original_publication_snapshot_id').notNull(),
    originalPublicationSnapshotInputHash: varchar('original_publication_snapshot_input_hash', {
      length: 64,
    }).notNull(),
    originalPublicationOperationHash: varchar('original_publication_operation_hash', {
      length: 64,
    }).notNull(),
  },
  (table) => ({
    commandFk: foreignKey({
      columns: [table.commandId, table.fundId],
      foreignColumns: [actualsRestatementCommands.commandId, actualsRestatementCommands.fundId],
      name: 'actuals_restatement_items_command_fk',
    }),
    targetCashFk: foreignKey({
      columns: [table.targetCashFlowEventId, table.fundId],
      foreignColumns: [cashFlowEvents.id, cashFlowEvents.fundId],
      name: 'actuals_restatement_items_target_cash_fk',
    }),
    replacementCashFk: foreignKey({
      columns: [table.replacementCashFlowEventId, table.fundId],
      foreignColumns: [cashFlowEvents.id, cashFlowEvents.fundId],
      name: 'actuals_restatement_items_replacement_cash_fk',
    }),
    targetMarkFk: foreignKey({
      columns: [table.targetValuationMarkId, table.fundId],
      foreignColumns: [valuationMarks.id, valuationMarks.fundId],
      name: 'actuals_restatement_items_target_mark_fk',
    }),
    replacementMarkFk: foreignKey({
      columns: [table.replacementValuationMarkId, table.fundId],
      foreignColumns: [valuationMarks.id, valuationMarks.fundId],
      name: 'actuals_restatement_items_replacement_mark_fk',
    }),
    originalPublicationFk: foreignKey({
      columns: [table.originalPublicationSnapshotId, table.fundId],
      foreignColumns: [financialFactsSnapshots.id, financialFactsSnapshots.fundId],
      name: 'actuals_restatement_items_original_publication_fk',
    }),
    cashSuccessorUnique: unique('actuals_restatement_items_cash_successor_unique').on(
      table.fundId,
      table.targetCashFlowEventId
    ),
    cashReplacementUnique: unique('actuals_restatement_items_cash_replacement_unique').on(
      table.fundId,
      table.replacementCashFlowEventId
    ),
    markSuccessorUnique: unique('actuals_restatement_items_mark_successor_unique').on(
      table.fundId,
      table.targetValuationMarkId
    ),
    markReplacementUnique: unique('actuals_restatement_items_mark_replacement_unique').on(
      table.fundId,
      table.replacementValuationMarkId
    ),
    externalRefUnique: unique('actuals_restatement_items_external_ref_unique').on(
      table.commandId,
      table.replacementExternalRef
    ),
    kindCheck: check(
      'actuals_restatement_items_kind_check',
      sql`(${table.targetCashFlowEventId} IS NOT NULL AND ${table.replacementCashFlowEventId} IS NOT NULL AND ${table.targetValuationMarkId} IS NULL AND ${table.replacementValuationMarkId} IS NULL) OR (${table.targetCashFlowEventId} IS NULL AND ${table.replacementCashFlowEventId} IS NULL AND ${table.targetValuationMarkId} IS NOT NULL AND ${table.replacementValuationMarkId} IS NOT NULL)`
    ),
    noSelfCheck: check(
      'actuals_restatement_items_no_self_check',
      sql`(${table.targetCashFlowEventId} IS NULL OR ${table.targetCashFlowEventId} <> ${table.replacementCashFlowEventId}) AND (${table.targetValuationMarkId} IS NULL OR ${table.targetValuationMarkId} <> ${table.replacementValuationMarkId}) AND ${table.targetSourceHash} <> ${table.replacementSourceHash}`
    ),
    hashCheck: check(
      'actuals_restatement_items_hash_check',
      sql`${table.targetSourceHash} ~ '^[a-f0-9]{64}$' AND ${table.targetContentHash} ~ '^[a-f0-9]{64}$' AND ${table.replacementSourceHash} ~ '^[a-f0-9]{64}$' AND ${table.replacementContentHash} ~ '^[a-f0-9]{64}$' AND ${table.originalPublicationSnapshotInputHash} ~ '^[a-f0-9]{64}$' AND ${table.originalPublicationOperationHash} ~ '^[a-f0-9]{64}$'`
    ),
    externalRefCheck: check(
      'actuals_restatement_items_external_ref_check',
      sql`${table.replacementExternalRef} ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'`
    ),
  })
);

export type ActualsRestatementCommand = typeof actualsRestatementCommands.$inferSelect;
export type ActualsRestatementItem = typeof actualsRestatementItems.$inferSelect;
