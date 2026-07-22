import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

import type { ConsumerEvaluation } from '../contracts/financial-facts-consumer-policies';
import type { FinancialFactsPayloadV1 } from '../contracts/financial-facts-snapshot-v1.contract';
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
    payload: jsonb('payload').notNull().$type<FinancialFactsPayloadV1>(),
    consumerEvaluations: jsonb('consumer_evaluations').notNull().$type<ConsumerEvaluation[]>(),
    actorId: integer('actor_id'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
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
  })
);

export type FinancialFactsSnapshot = typeof financialFactsSnapshots.$inferSelect;
export type InsertFinancialFactsSnapshot = typeof financialFactsSnapshots.$inferInsert;
