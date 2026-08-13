import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { fundScenarioCalculationRuns, fundScenarioSets, funds } from './fund';
import { users } from './user';

export const fundScenarioCalculationCommands = pgTable(
  'fund_scenario_calculation_commands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    scenarioSetId: uuid('scenario_set_id')
      .notNull()
      .references(() => fundScenarioSets.id, { onDelete: 'cascade' }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 16 })
      .notNull()
      .default('pending')
      .$type<'pending' | 'completed' | 'failed'>(),
    runId: uuid('run_id').references(() => fundScenarioCalculationRuns.id, {
      onDelete: 'cascade',
    }),
    correlationId: varchar('correlation_id', { length: 36 }),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>(),
    attemptCount: integer('attempt_count').notNull().default(1),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    failureCode: varchar('failure_code', { length: 80 }),
    createdByUserId: integer('created_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    createdByLabel: text('created_by_label').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scopeUnique: unique('fund_scenario_calc_commands_scope_unique').on(
      table.fundId,
      table.scenarioSetId,
      table.idempotencyKey
    ),
    statusCheck: check(
      'fund_scenario_calc_commands_status_check',
      sql`${table.status} IN ('pending', 'completed', 'failed')`
    ),
    hashCheck: check(
      'fund_scenario_calc_commands_hash_check',
      sql`${table.requestHash} ~ '^[a-f0-9]{64}$'`
    ),
    responseCheck: check(
      'fund_scenario_calc_commands_response_check',
      sql`
        (
          ${table.status} = 'completed'
          AND ${table.runId} IS NOT NULL
          AND ${table.correlationId} IS NOT NULL
          AND ${table.responseStatus} = 202
          AND ${table.responseBody} IS NOT NULL
          AND jsonb_typeof(${table.responseBody}) = 'object'
          AND ${table.responseBody} ?& ARRAY[
            'fundId', 'scenarioSetId', 'calculationMode', 'status', 'jobId', 'correlationId'
          ]
          AND ${table.responseBody}->>'calculationMode' = 'async_reserve_allocation'
          AND ${table.responseBody}->>'status' = 'queued'
          AND ${table.failureCode} IS NULL
          AND ${table.leaseToken} IS NULL
          AND ${table.leaseExpiresAt} IS NULL
        )
        OR (
          ${table.status} = 'pending'
          AND ${table.responseStatus} IS NULL
          AND ${table.responseBody} IS NULL
          AND ${table.failureCode} IS NULL
          AND (
            (${table.runId} IS NULL AND ${table.correlationId} IS NULL)
            OR (${table.runId} IS NOT NULL AND ${table.correlationId} IS NOT NULL)
          )
        )
        OR (
          ${table.status} = 'failed'
          AND ${table.responseStatus} IS NULL
          AND ${table.responseBody} IS NULL
          AND ${table.failureCode} IS NOT NULL
          AND (
            (${table.runId} IS NULL AND ${table.correlationId} IS NULL)
            OR (${table.runId} IS NOT NULL AND ${table.correlationId} IS NOT NULL)
          )
          AND ${table.leaseToken} IS NULL
          AND ${table.leaseExpiresAt} IS NULL
        )
      `
    ),
    leaseCheck: check(
      'fund_scenario_calc_commands_lease_check',
      sql`
        (${table.leaseToken} IS NULL AND ${table.leaseExpiresAt} IS NULL)
        OR (${table.leaseToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL)
      `
    ),
    attemptCheck: check(
      'fund_scenario_calc_commands_attempt_check',
      sql`${table.attemptCount} >= 1`
    ),
    versionCheck: check(
      'fund_scenario_calc_commands_version_check',
      sql`${table.version} >= 1`
    ),
    statusIdx: index('fund_scenario_calc_commands_status_idx').on(
      table.status,
      table.leaseExpiresAt
    ),
  })
);

export type FundScenarioCalculationCommand = typeof fundScenarioCalculationCommands.$inferSelect;
export type NewFundScenarioCalculationCommand =
  typeof fundScenarioCalculationCommands.$inferInsert;
