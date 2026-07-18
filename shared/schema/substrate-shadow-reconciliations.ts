import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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

import { funds } from './fund';

/**
 * Append-only audit ledger for constrained-reserve substrate SHADOW
 * reconciliation observations (Tranche 9, ADR-050).
 *
 * Each row is one value-producing (`available`/`indicative`) run of the
 * mode-gated shadow inside `POST /api/v1/reserves/calculate`: it records the
 * parity outcome (`reconciliation_status`) against the legacy engine output for
 * the SAME request, plus the calc identity hashes and mode/state, so a future
 * promotion decision ("has fund N's substrate ever diverged, and when?") can
 * rest on a durable trust record instead of scraped logs.
 *
 * Deliberately mirrors the `reconciliation_runs` (MOIC/rounds) conventions -
 * serial pk, fund-scoped FK with cascade delete, CHECK-constrained enum columns,
 * dedicated typed scalar columns (never a JSONB blob for known-domain fields),
 * a fund-scoped idempotency unique, and a `(fund_id, observed_at desc)` lookup
 * index - but is a SEPARATE table: it is the substrate-shadow domain, not the
 * MOIC reconciliation domain, and reuses none of that table's columns.
 *
 * Written best-effort and OFF the response path: the HTTP response is
 * byte-identical with or without persistence, and an insert failure is swallowed
 * (never surfaces to the caller, never throws). No reads/queries/endpoints yet.
 */
export const substrateShadowReconciliations = pgTable(
  'substrate_shadow_reconciliations',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    calculationKey: text('calculation_key').notNull(),
    configuredMode: varchar('configured_mode', { length: 8 }).notNull(),
    effectiveMode: varchar('effective_mode', { length: 8 }).notNull(),
    killSwitchActive: boolean('kill_switch_active').notNull(),
    substrateState: varchar('substrate_state', { length: 16 }).notNull(),
    reconciliationStatus: varchar('reconciliation_status', { length: 16 }).notNull(),
    inputHash: text('input_hash').notNull(),
    resultHash: text('result_hash').notNull(),
    assumptionsHash: text('assumptions_hash').notNull(),
    mismatches: jsonb('mismatches').notNull().$type<string[]>(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    configuredModeCheck: check(
      'substrate_shadow_reconciliations_configured_mode_check',
      sql`${table.configuredMode} IN ('off','shadow','on')`
    ),
    effectiveModeCheck: check(
      'substrate_shadow_reconciliations_effective_mode_check',
      sql`${table.effectiveMode} IN ('off','shadow','on')`
    ),
    substrateStateCheck: check(
      'substrate_shadow_reconciliations_substrate_state_check',
      sql`${table.substrateState} IN ('available','indicative')`
    ),
    reconciliationStatusCheck: check(
      'substrate_shadow_reconciliations_reconciliation_status_check',
      sql`${table.reconciliationStatus} IN ('match','mismatch')`
    ),
    fundObservedIdx: index('idx_substrate_shadow_reconciliations_fund_observed').on(
      table.fundId,
      table.observedAt.desc()
    ),
    fundKeyInputResultUnique: unique(
      'substrate_shadow_reconciliations_fund_key_input_result_unique'
    ).on(table.fundId, table.calculationKey, table.inputHash, table.resultHash),
  })
);

export type SubstrateShadowReconciliation = typeof substrateShadowReconciliations.$inferSelect;
export type InsertSubstrateShadowReconciliation =
  typeof substrateShadowReconciliations.$inferInsert;
