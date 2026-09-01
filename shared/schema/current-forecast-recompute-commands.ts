import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  pgTable,
  serial,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

import { funds } from './fund';
import { substrateShadowReconciliations } from './substrate-shadow-reconciliations';
import { users } from './user';

export const CURRENT_FORECAST_RECOMPUTE_STATUSES = [
  'pending',
  'completed',
  'failed',
  'skipped',
] as const;
export type CurrentForecastRecomputeStatus = (typeof CURRENT_FORECAST_RECOMPUTE_STATUSES)[number];

export const CURRENT_FORECAST_RECOMPUTE_FAILURE_CODES = [
  'execution_timeout',
  'execution_error',
  'mode_ineligible',
  'stale_pending',
] as const;
export type CurrentForecastRecomputeFailureCode =
  (typeof CURRENT_FORECAST_RECOMPUTE_FAILURE_CODES)[number];

export const currentForecastRecomputeCommands = pgTable(
  'current_forecast_recompute_commands',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 16 })
      .notNull()
      .default('pending')
      .$type<CurrentForecastRecomputeStatus>(),
    failureCode: varchar('failure_code', {
      length: 64,
    }).$type<CurrentForecastRecomputeFailureCode>(),
    shadowReconciliationId: integer('shadow_reconciliation_id'),
    createdReconciliation: boolean('created_reconciliation').notNull().default(false),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdBy: integer('created_by'),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'current_forecast_recompute_commands_fund_fk',
    }).onDelete('cascade'),
    reconciliationFk: foreignKey({
      columns: [table.shadowReconciliationId],
      foreignColumns: [substrateShadowReconciliations.id],
      name: 'current_forecast_recompute_commands_reconciliation_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'current_forecast_recompute_commands_created_by_fk',
    }),
    fundIdempotencyUnique: unique('current_forecast_recompute_commands_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    statusCheck: check(
      'current_forecast_recompute_commands_status_check',
      sql`${table.status} IN ('pending', 'completed', 'failed', 'skipped')`
    ),
    requestHashCheck: check(
      'current_forecast_recompute_commands_request_hash_check',
      sql`${table.requestHash} ~ '^[a-f0-9]{64}$'`
    ),
    failureCodeCheck: check(
      'current_forecast_recompute_commands_failure_code_check',
      sql`
        ${table.failureCode} IS NULL
        OR ${table.failureCode} IN (
          'execution_timeout',
          'execution_error',
          'mode_ineligible',
          'stale_pending'
        )
      `
    ),
    terminalCouplingCheck: check(
      'current_forecast_recompute_commands_terminal_coupling_check',
      sql`
        (
          ${table.status} = 'completed'
          AND ${table.shadowReconciliationId} IS NOT NULL
          AND ${table.failureCode} IS NULL
        )
        OR (
          ${table.status} = 'failed'
          AND ${table.failureCode} IS NOT NULL
          AND ${table.shadowReconciliationId} IS NULL
        )
        OR (
          ${table.status} IN ('pending', 'skipped')
          AND ${table.shadowReconciliationId} IS NULL
          AND ${table.failureCode} IS NULL
        )
      `
    ),
    finalizedAtCheck: check(
      'current_forecast_recompute_commands_finalized_at_check',
      sql`
        (${table.status} = 'pending' AND ${table.finalizedAt} IS NULL)
        OR (${table.status} <> 'pending' AND ${table.finalizedAt} IS NOT NULL)
      `
    ),
    createdReconciliationCheck: check(
      'current_forecast_recompute_commands_created_recon_check',
      sql`
        NOT ${table.createdReconciliation}
        OR (
          ${table.status} = 'completed'
          AND ${table.shadowReconciliationId} IS NOT NULL
        )
      `
    ),
  })
);

export type CurrentForecastRecomputeCommand = typeof currentForecastRecomputeCommands.$inferSelect;
export type InsertCurrentForecastRecomputeCommand =
  typeof currentForecastRecomputeCommands.$inferInsert;
