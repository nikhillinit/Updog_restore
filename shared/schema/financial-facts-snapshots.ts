import { sql } from 'drizzle-orm';
import {
  check,
  date,
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

import type {
  ConsumerEvaluation,
  ConsumerEvaluationV2,
} from '../contracts/financial-facts-consumer-policies';
import type {
  FinancialFactsPayloadV1,
  FinancialFactsPayloadV2,
  FinancialFactsPayloadV3,
  FinancialFactsPayloadV4,
} from '../contracts/financial-facts-snapshot-v1.contract';
import { funds } from './fund';

export const financialFactsSnapshots = pgTable(
  'financial_facts_snapshots',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    policyVersion: text('policy_version').notNull(),
    payloadSchemaId: text('payload_schema_id').notNull(),
    asOfDate: date('as_of_date').notNull(),
    knowledgeCutoff: timestamp('knowledge_cutoff', { withTimezone: true }).notNull(),
    vehicleScope: varchar('vehicle_scope', { length: 16 }).notNull().$type<'fund_all'>(),
    vehicleIds: jsonb('vehicle_ids').notNull().$type<number[]>(),
    selectionSetHash: text('selection_set_hash').notNull(),
    sourceFactsInputHash: text('source_facts_input_hash').notNull(),
    snapshotInputHash: text('snapshot_input_hash').notNull(),
    payload: jsonb('payload')
      .notNull()
      .$type<
        | FinancialFactsPayloadV1
        | FinancialFactsPayloadV2
        | FinancialFactsPayloadV3
        | FinancialFactsPayloadV4
      >(),
    consumerEvaluations: jsonb('consumer_evaluations')
      .notNull()
      .$type<ConsumerEvaluation[] | ConsumerEvaluationV2[]>(),
    actorId: integer('actor_id'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    supersedesSnapshotId: integer('supersedes_snapshot_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    vehicleScopeCheck: check(
      'financial_facts_snapshots_vehicle_scope_check',
      sql`${table.vehicleScope} IN ('fund_all')`
    ),
    fundCreatedIdx: index('idx_financial_facts_snapshots_fund_created').on(
      table.fundId,
      table.createdAt.desc()
    ),
    fundIdempotencyUnique: unique('financial_facts_snapshots_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    fundIdentityUnique: unique('financial_facts_snapshots_fund_identity_unique').on(
      table.fundId,
      table.snapshotInputHash
    ),
    idFundUnique: unique('financial_facts_snapshots_id_fund_unique').on(table.id, table.fundId),
    supersedesFundFk: foreignKey({
      columns: [table.supersedesSnapshotId, table.fundId],
      foreignColumns: [table.id, table.fundId],
      name: 'financial_facts_snapshots_supersedes_fund_fk',
    }),
    noSelfSupersedeCheck: check(
      'financial_facts_snapshots_no_self_supersede_check',
      sql`${table.supersedesSnapshotId} IS NULL OR ${table.supersedesSnapshotId} <> ${table.id}`
    ),
    supersedesUnique: uniqueIndex('financial_facts_snapshots_supersedes_unique')
      .on(table.supersedesSnapshotId)
      .where(sql`${table.supersedesSnapshotId} IS NOT NULL`),
  })
);

export type FinancialFactsSnapshot = typeof financialFactsSnapshots.$inferSelect;
export type InsertFinancialFactsSnapshot = typeof financialFactsSnapshots.$inferInsert;
