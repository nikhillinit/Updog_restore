import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import type {
  CurrentPlanCohortAssumptionsV1,
  CurrentPlanPacingAssumptionsV1,
  CurrentPlanVersionV1,
} from '../contracts/current-plan-version-v1.contract';
import { financialFactsSnapshots } from './financial-facts-snapshots';
import { funds } from './fund';

export const currentPlanVersions = pgTable(
  'current_plan_versions',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    sourceConfigId: integer('source_config_id').notNull(),
    sourceConfigVersion: integer('source_config_version').notNull(),
    sourceFactsSnapshotId: integer('source_facts_snapshot_id')
      .notNull()
      .references(() => financialFactsSnapshots.id, { onDelete: 'cascade' }),
    deployableCapitalUsd: numeric('deployable_capital_usd', {
      precision: 20,
      scale: 6,
    }).notNull(),
    planTransformationVersion: text('plan_transformation_version').notNull(),
    allocations: jsonb('allocations').notNull().$type<CurrentPlanVersionV1['allocations']>(),
    pacingAssumptions: jsonb('pacing_assumptions')
      .notNull()
      .$type<CurrentPlanPacingAssumptionsV1>(),
    cohortAssumptions: jsonb('cohort_assumptions')
      .notNull()
      .$type<CurrentPlanCohortAssumptionsV1>(),
    reservePolicyVersion: text('reserve_policy_version').notNull(),
    assumptionsHash: text('assumptions_hash').notNull(),
    supersedesVersionId: integer('supersedes_version_id').references(
      (): AnyPgColumn => currentPlanVersions.id
    ),
    supersededByVersionId: integer('superseded_by_version_id').references(
      (): AnyPgColumn => currentPlanVersions.id
    ),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundIdempotencyUnique: unique('current_plan_versions_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    fundVersionUnique: unique('current_plan_versions_fund_version_unique').on(
      table.fundId,
      table.version
    ),
    fundHeadUnique: uniqueIndex('current_plan_versions_fund_head_unique')
      .on(table.fundId)
      .where(sql`${table.supersededByVersionId} IS NULL`),
    fundCreatedIdx: index('idx_current_plan_versions_fund_created').on(
      table.fundId,
      table.createdAt.desc()
    ),
  })
);

export type CurrentPlanVersionRow = typeof currentPlanVersions.$inferSelect;
export type InsertCurrentPlanVersionRow = typeof currentPlanVersions.$inferInsert;
