import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import { funds } from './fund';
import { users } from './user';

export const reconciliationRuns = pgTable(
  'reconciliation_runs',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    requestHash: text('request_hash').notNull(),
    requestedBy: integer('requested_by').references(() => users.id),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    status: varchar('status', { length: 16 }).notNull().default('completed'),
    legacyInputHash: text('legacy_input_hash').notNull(),
    candidateInputHash: text('candidate_input_hash').notNull(),
    evidenceInputHash: text('evidence_input_hash').notNull(),
    assumptionsHash: text('assumptions_hash').notNull(),
    legacyOutputHash: text('legacy_output_hash').notNull(),
    candidateOutputHash: text('candidate_output_hash').notNull(),
    candidateMaterial: boolean('candidate_material').notNull().default(false),
    materialityEpsilon: doublePrecision('materiality_epsilon').notNull(),
    diffSummary: jsonb('diff_summary').notNull(),
    roundEvidenceSummary: jsonb('round_evidence_summary').notNull(),
  },
  (table) => ({
    statusCheck: check(
      'reconciliation_runs_status_check',
      sql`${table.status} IN ('pending','completed','failed')`
    ),
    fundRequestedIdx: index('idx_reconciliation_runs_fund_requested').on(
      table.fundId,
      table.requestedAt.desc()
    ),
  })
);

export type ReconciliationRun = typeof reconciliationRuns.$inferSelect;
export type InsertReconciliationRun = typeof reconciliationRuns.$inferInsert;
