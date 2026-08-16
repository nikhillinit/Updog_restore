import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './user';

export const RELEASE_CANARY_RUN_STATUSES = [
  'created',
  'running',
  'completed',
  'failed',
  'expired',
  'purged',
] as const;
export type ReleaseCanaryRunStatus = (typeof RELEASE_CANARY_RUN_STATUSES)[number];

export const releaseCanaryRuns = pgTable(
  'release_canary_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseVersion: varchar('release_version', { length: 64 }).notNull(),
    releaseSha: varchar('release_sha', { length: 64 }).notNull(),
    deploymentId: varchar('deployment_id', { length: 128 }).notNull(),
    workerDeploymentId: varchar('worker_deployment_id', { length: 128 }).notNull(),
    correlationId: varchar('correlation_id', { length: 128 }).notNull(),
    workflowRunId: varchar('workflow_run_id', { length: 32 }),
    workflowRunAttempt: integer('workflow_run_attempt'),
    principalUserId: integer('principal_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 16 })
      .notNull()
      .default('created')
      .$type<ReleaseCanaryRunStatus>(),
    version: integer('version').notNull().default(1),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    portfolioCompanyResidueCount: integer('portfolio_company_residue_count').notNull().default(0),
    fundResidueCount: integer('fund_residue_count').notNull().default(0),
    fundConfigResidueCount: integer('fund_config_residue_count').notNull().default(0),
    fundEventResidueCount: integer('fund_event_residue_count').notNull().default(0),
    notificationResidueCount: integer('notification_residue_count').notNull().default(0),
    grantResidueCount: integer('grant_residue_count').notNull().default(0),
    calculationResidueCount: integer('calculation_residue_count').notNull().default(0),
    mutationReceiptResidueCount: integer('mutation_receipt_residue_count').notNull().default(0),
    scenarioResidueCount: integer('scenario_residue_count').notNull().default(0),
    reportingResidueCount: integer('reporting_residue_count').notNull().default(0),
    totalResidueCount: integer('total_residue_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      'release_canary_runs_status_check',
      sql`${table.status} IN ('created', 'running', 'completed', 'failed', 'expired', 'purged')`
    ),
    versionCheck: check('release_canary_runs_version_check', sql`${table.version} >= 1`),
    workflowIdentityCheck: check(
      'release_canary_runs_workflow_identity_check',
      sql`
        (
          ${table.workflowRunId} IS NULL
          AND ${table.workflowRunAttempt} IS NULL
        )
        OR (
          ${table.workflowRunId} IS NOT NULL
          AND ${table.workflowRunAttempt} IS NOT NULL
          AND ${table.workflowRunId} ~ '^[1-9][0-9]{0,31}$'
          AND ${table.workflowRunAttempt} >= 1
        )
      `
    ),
    residueCountCheck: check(
      'release_canary_runs_residue_count_check',
      sql`
        ${table.portfolioCompanyResidueCount} >= 0
        AND ${table.fundResidueCount} >= 0
        AND ${table.fundConfigResidueCount} >= 0
        AND ${table.fundEventResidueCount} >= 0
        AND ${table.notificationResidueCount} >= 0
        AND ${table.grantResidueCount} >= 0
        AND ${table.calculationResidueCount} >= 0
        AND ${table.mutationReceiptResidueCount} >= 0
        AND ${table.scenarioResidueCount} >= 0
        AND ${table.reportingResidueCount} >= 0
        AND ${table.totalResidueCount} = (
          ${table.portfolioCompanyResidueCount}
          + ${table.fundResidueCount}
          + ${table.fundConfigResidueCount}
          + ${table.fundEventResidueCount}
          + ${table.notificationResidueCount}
          + ${table.grantResidueCount}
          + ${table.calculationResidueCount}
          + ${table.mutationReceiptResidueCount}
          + ${table.scenarioResidueCount}
          + ${table.reportingResidueCount}
        )
      `
    ),
    workflowIdentityUnique: uniqueIndex('release_canary_runs_workflow_identity_unique')
      .on(table.workflowRunId, table.workflowRunAttempt)
      .where(sql`${table.workflowRunId} IS NOT NULL`),
    statusIdx: index('release_canary_runs_status_idx').on(table.status, table.expiresAt),
    principalIdx: index('release_canary_runs_principal_idx').on(table.principalUserId),
  })
);

export type ReleaseCanaryRun = typeof releaseCanaryRuns.$inferSelect;
export type InsertReleaseCanaryRun = typeof releaseCanaryRuns.$inferInsert;
