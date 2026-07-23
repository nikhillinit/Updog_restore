import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  integer,
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
import { funds, fundSnapshots } from './fund';
import { users } from './user';

/**
 * Append-only immutable reference pins for the current-forecast (V2) calculation
 * key (PLAN_61 Task 13, R23/R24/R35). Each row pins the exact basis
 * (fund snapshot + accepted current-plan version + financial-facts snapshot) and
 * identity hashes of one current-forecast evaluation so a post-cutover incident
 * can serve a durable "held" pointer head instead of recomputing.
 *
 * Dormant in 13.1: no reader/writer/route consumes it yet (that is 13.1-svc).
 * Lifecycle is STRUCTURAL (13.1 review R1): `candidate = true` on create; an
 * accepted served-pointer head is the single non-superseded, non-candidate row
 * per fund (partial unique index); superseded rows carry the self-FK. There is
 * deliberately no status enum column. Basis-pin FKs (snapshot, plan version,
 * facts snapshot) are NO ACTION (R2): a pinned artifact cannot be deleted while
 * referenced; only fund deletion cascades. Writers are idempotent through the
 * fund-scoped idempotency unique (R3, `current_plan_versions` pattern, D13
 * `runIdempotentCommand`). FK names are declared explicitly so the journaled
 * migration (0038) and the Drizzle push produce byte-identical catalog
 * constraint names.
 */
export const currentForecastReferences = pgTable(
  'current_forecast_references',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    calculationKey: text('calculation_key').notNull().default('current_forecast'),
    fundSnapshotId: integer('fund_snapshot_id').notNull(),
    currentPlanVersionId: integer('current_plan_version_id').notNull(),
    financialFactsSnapshotId: integer('financial_facts_snapshot_id').notNull(),
    inputHash: text('input_hash').notNull(),
    resultHash: text('result_hash').notNull(),
    assumptionsHash: text('assumptions_hash').notNull(),
    engineVersion: text('engine_version').notNull(),
    methodologyVersion: text('methodology_version').notNull(),
    candidate: boolean('candidate').notNull().default(true),
    supersededByReferenceId: integer('superseded_by_reference_id'),
    reason: text('reason'),
    createdBy: integer('created_by'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'current_forecast_references_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    supersededByFk: foreignKey({
      columns: [table.supersededByReferenceId],
      foreignColumns: [table.id],
      name: 'current_forecast_references_superseded_by_fk',
    }),
    fundSnapshotFk: foreignKey({
      columns: [table.fundSnapshotId],
      foreignColumns: [fundSnapshots.id],
      name: 'current_forecast_references_fund_snapshot_fk',
    }),
    planVersionFk: foreignKey({
      columns: [table.currentPlanVersionId],
      foreignColumns: [currentPlanVersions.id],
      name: 'current_forecast_references_plan_version_fk',
    }),
    factsSnapshotFk: foreignKey({
      columns: [table.financialFactsSnapshotId],
      foreignColumns: [financialFactsSnapshots.id],
      name: 'current_forecast_references_facts_snapshot_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'current_forecast_references_created_by_fk',
    }),
    fundIdempotencyUnique: unique('current_forecast_references_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    fundCreatedIdx: index('idx_current_forecast_references_fund_created').on(
      table.fundId,
      table.createdAt.desc()
    ),
    fundAcceptedHeadUnique: uniqueIndex('current_forecast_references_fund_accepted_head_unique')
      .on(table.fundId)
      .where(sql`${table.supersededByReferenceId} IS NULL AND ${table.candidate} = false`),
  })
);

export type CurrentForecastReferenceRow = typeof currentForecastReferences.$inferSelect;
export type InsertCurrentForecastReferenceRow = typeof currentForecastReferences.$inferInsert;
