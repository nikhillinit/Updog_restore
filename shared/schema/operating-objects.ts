/**
 * Operating Objects -- Foundation Schema
 *
 * Drizzle bindings for the operating-object program (backend-first per
 * docs/design/audits/server-object-readiness.md). First object: `tasks`
 * (fund-scoped work items, minimal create/list). assumption/comment follow in
 * later PRs and slot in beside `tasks` here.
 *
 * Mirrors migrations/0020_operating_tasks_drift.sql. Use the
 * exported $inferSelect / $inferInsert types in services/contracts; never
 * hand-declare a column type in a consumer.
 *
 * @module shared/schema/operating-objects
 * @see docs/design/audits/server-object-readiness.md
 */

import { sql } from 'drizzle-orm';
import {
  check,
  date,
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

import { funds } from './fund';
import { internalAnalysisReferences } from './internal-analysis';
import { internalLpEconomicsRuns } from './internal-economics';
import { users } from './user';

// ============================================================================
// TASKS (fund-scoped work items)
// ============================================================================

export const tasks = pgTable(
  'tasks',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('open'),
    ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
    dueDate: date('due_date'),
    description: text('description'),
    createdBy: integer('created_by').references(() => users.id),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    requestHash: varchar('request_hash', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      'tasks_status_check',
      sql`${table.status} IN ('open', 'in_progress', 'done')`
    ),
    titleNonEmptyCheck: check('tasks_title_nonempty_check', sql`length(btrim(${table.title})) > 0`),
    idFundUnique: unique('tasks_id_fund_unique').on(table.id, table.fundId),
    fundIdempotencyUnique: uniqueIndex('tasks_fund_idempotency_unique')
      .on(table.fundId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    fundCreatedIdx: index('idx_tasks_fund_created').on(table.fundId, table.createdAt.desc()),
  })
);

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

export type TaskEvidenceTargetKind = 'analysis_reference' | 'internal_economics_run';
export type DecisionEvidenceTargetKind = TaskEvidenceTargetKind;

// ============================================================================
// OPERATING DECISIONS (fund-scoped recommendation and outcome spine)
// ============================================================================

export type OperatingDecisionStatus = 'proposed' | 'accepted' | 'rejected' | 'deferred';

export const operatingDecisions = pgTable(
  'operating_decisions',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    recommendation: text('recommendation').notNull(),
    status: varchar('status', { length: 16 })
      .notNull()
      .default('proposed')
      .$type<OperatingDecisionStatus>(),
    supersedesDecisionId: integer('supersedes_decision_id'),
    outcome: text('outcome'),
    outcomeRecordedAt: timestamp('outcome_recorded_at', { withTimezone: true }),
    outcomeRecordedBy: integer('outcome_recorded_by'),
    followUpOwnerId: integer('follow_up_owner_id'),
    followUpDate: date('follow_up_date'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'operating_decisions_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    supersedesDecisionFundFk: foreignKey({
      columns: [table.supersedesDecisionId, table.fundId],
      foreignColumns: [table.id, table.fundId],
      name: 'operating_decisions_supersedes_decision_fund_fk',
    }).onDelete('restrict'),
    outcomeRecordedByFk: foreignKey({
      columns: [table.outcomeRecordedBy],
      foreignColumns: [users.id],
      name: 'operating_decisions_outcome_recorded_by_fk',
    }),
    followUpOwnerFk: foreignKey({
      columns: [table.followUpOwnerId],
      foreignColumns: [users.id],
      name: 'operating_decisions_follow_up_owner_id_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'operating_decisions_created_by_fk',
    }),
    idFundUnique: unique('operating_decisions_id_fund_unique').on(table.id, table.fundId),
    fundIdempotencyUnique: unique('operating_decisions_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    supersedesDecisionUnique: uniqueIndex('operating_decisions_supersedes_decision_unique')
      .on(table.fundId, table.supersedesDecisionId)
      .where(sql`${table.supersedesDecisionId} IS NOT NULL`),
    statusCheck: check(
      'operating_decisions_status_check',
      sql`${table.status} IN ('proposed', 'accepted', 'rejected', 'deferred')`
    ),
    titleNonEmptyCheck: check(
      'operating_decisions_title_nonempty_check',
      sql`length(btrim(${table.title})) > 0`
    ),
    outcomeCouplingCheck: check(
      'operating_decisions_outcome_coupling_check',
      sql`(
        (${table.outcome} IS NULL AND ${table.outcomeRecordedAt} IS NULL AND ${table.outcomeRecordedBy} IS NULL)
        OR (${table.outcome} IS NOT NULL AND ${table.outcomeRecordedAt} IS NOT NULL AND ${table.outcomeRecordedBy} IS NOT NULL)
      )`
    ),
    outcomeStatusCheck: check(
      'operating_decisions_outcome_status_check',
      sql`${table.outcome} IS NULL OR ${table.status} IN ('accepted', 'rejected')`
    ),
    deferredFollowUpCheck: check(
      'operating_decisions_deferred_follow_up_check',
      sql`${table.status} <> 'deferred' OR (${table.followUpOwnerId} IS NOT NULL AND ${table.followUpDate} IS NOT NULL)`
    ),
  })
);

export type OperatingDecision = typeof operatingDecisions.$inferSelect;
export type InsertOperatingDecision = typeof operatingDecisions.$inferInsert;

// ============================================================================
// DECISION EVIDENCE LINKS (immutable, decision-sourced relational proof)
// ============================================================================

export const decisionEvidenceLinks = pgTable(
  'decision_evidence_links',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    decisionId: integer('decision_id').notNull(),
    targetKind: varchar('target_kind')
      .notNull()
      .$type<DecisionEvidenceTargetKind>(),
    analysisReferenceId: integer('analysis_reference_id'),
    economicsRunId: integer('economics_run_id'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'decision_evidence_links_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    decisionFundFk: foreignKey({
      columns: [table.decisionId, table.fundId],
      foreignColumns: [operatingDecisions.id, operatingDecisions.fundId],
      name: 'decision_evidence_links_decision_fund_fk',
    }).onDelete('cascade'),
    analysisReferenceFundFk: foreignKey({
      columns: [table.analysisReferenceId, table.fundId],
      foreignColumns: [internalAnalysisReferences.id, internalAnalysisReferences.fundId],
      name: 'decision_evidence_links_analysis_reference_fund_fk',
    }).onDelete('restrict'),
    economicsRunFundFk: foreignKey({
      columns: [table.economicsRunId, table.fundId],
      foreignColumns: [internalLpEconomicsRuns.id, internalLpEconomicsRuns.fundId],
      name: 'decision_evidence_links_economics_run_fund_fk',
    }).onDelete('restrict'),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'decision_evidence_links_created_by_fk',
    }),
    fundDecisionIdempotencyUnique: unique(
      'decision_evidence_links_fund_decision_idempotency_unique'
    ).on(table.fundId, table.decisionId, table.idempotencyKey),
    targetKindCheck: check(
      'decision_evidence_links_target_kind_check',
      sql`${table.targetKind} IN ('analysis_reference', 'internal_economics_run')`
    ),
    targetCouplingCheck: check(
      'decision_evidence_links_target_coupling_check',
      sql`(
        (${table.targetKind} = 'analysis_reference'
          AND ${table.analysisReferenceId} IS NOT NULL
          AND ${table.economicsRunId} IS NULL)
        OR (${table.targetKind} = 'internal_economics_run'
          AND ${table.economicsRunId} IS NOT NULL
          AND ${table.analysisReferenceId} IS NULL)
      )`
    ),
    fundDecisionIdIdx: index('idx_decision_evidence_links_fund_decision_id').on(
      table.fundId,
      table.decisionId,
      table.id
    ),
  })
);

export type DecisionEvidenceLink = typeof decisionEvidenceLinks.$inferSelect;
export type InsertDecisionEvidenceLink = typeof decisionEvidenceLinks.$inferInsert;

// ============================================================================
// TASK EVIDENCE LINKS (immutable typed relational proof)
// ============================================================================

/**
 * Immutable, fund-scoped evidence attached to a task. The typed target pair
 * makes zero, two, mismatched, and cross-fund evidence targets unrepresentable
 * in the database. `internal_economics_run` deliberately accepts failed runs:
 * this is provenance storage, not a completion assertion.
 */
export const taskEvidenceLinks = pgTable(
  'task_evidence_links',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    taskId: integer('task_id').notNull(),
    targetKind: varchar('target_kind').notNull().$type<TaskEvidenceTargetKind>(),
    analysisReferenceId: integer('analysis_reference_id'),
    economicsRunId: integer('economics_run_id'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'task_evidence_links_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    taskFundFk: foreignKey({
      columns: [table.taskId, table.fundId],
      foreignColumns: [tasks.id, tasks.fundId],
      name: 'task_evidence_links_task_fund_fk',
    }).onDelete('cascade'),
    analysisReferenceFundFk: foreignKey({
      columns: [table.analysisReferenceId, table.fundId],
      foreignColumns: [internalAnalysisReferences.id, internalAnalysisReferences.fundId],
      name: 'task_evidence_links_analysis_reference_fund_fk',
    }).onDelete('restrict'),
    economicsRunFundFk: foreignKey({
      columns: [table.economicsRunId, table.fundId],
      foreignColumns: [internalLpEconomicsRuns.id, internalLpEconomicsRuns.fundId],
      name: 'task_evidence_links_economics_run_fund_fk',
    }).onDelete('restrict'),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'task_evidence_links_created_by_fk',
    }),
    fundTaskIdempotencyUnique: unique('task_evidence_links_fund_task_idempotency_unique').on(
      table.fundId,
      table.taskId,
      table.idempotencyKey
    ),
    targetKindCheck: check(
      'task_evidence_links_target_kind_check',
      sql`${table.targetKind} IN ('analysis_reference','internal_economics_run')`
    ),
    targetCouplingCheck: check(
      'task_evidence_links_target_coupling_check',
      sql`(
        (${table.targetKind} = 'analysis_reference'
          AND ${table.analysisReferenceId} IS NOT NULL
          AND ${table.economicsRunId} IS NULL)
        OR (${table.targetKind} = 'internal_economics_run'
          AND ${table.economicsRunId} IS NOT NULL
          AND ${table.analysisReferenceId} IS NULL)
      )`
    ),
    fundTaskIdIdx: index('idx_task_evidence_links_fund_task_id').on(
      table.fundId,
      table.taskId,
      table.id
    ),
  })
);

export type TaskEvidenceLink = typeof taskEvidenceLinks.$inferSelect;
export type InsertTaskEvidenceLink = typeof taskEvidenceLinks.$inferInsert;
