import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

import type {
  KpiBasis,
  KpiMetric,
  KpiReviewStatus,
  KpiSource,
  KpiValueKind,
} from '../contracts/kpi/kpi-observation-v1.contract';
import { funds } from './fund';
import { portfolioCompanies } from './portfolio';
import { users } from './user';

/**
 * Internal KPI collection (issue #1300, ruling GR2-4a).
 *
 * One row is one metric, for one company, over one period. Every field the
 * ruling requires is a dedicated column -- metric, period, actual/projected
 * basis, value, source, submission date, reviewer status, comment -- and nothing
 * is nested into a JSONB blob.
 *
 * The typed value triple (`value_amount`, `value_date`, `value_text`) plus the
 * metric/value-kind CHECK pair makes a wrong-typed KPI unrepresentable rather
 * than merely rejected at the edge: a text runway or a money headcount cannot be
 * stored even by a direct SQL write.
 *
 * Fund scoping follows the Wave C/D ledger convention: `fund_id` cascades from
 * `funds`, a sibling `UNIQUE (id, fund_id)` is available for future composite
 * child FKs (the quarterly review trail, #1301), and FK names are declared
 * explicitly so migration 0049 and a Drizzle push produce byte-identical catalog
 * constraint names. `portfoliocompanies` carries no `(id, fund_id)` sibling key
 * and a nullable `fund_id`, so that FK is plain and same-fund ownership is
 * enforced in code via `assertOwnedByFund({ kind: 'portfolio_company' })`.
 */
export const kpiObservations = pgTable(
  'kpi_observations',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    portfolioCompanyId: integer('portfolio_company_id').notNull(),
    metric: varchar('metric', { length: 32 }).notNull().$type<KpiMetric>(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    basis: varchar('basis', { length: 16 }).notNull().$type<KpiBasis>(),
    valueKind: varchar('value_kind', { length: 8 }).notNull().$type<KpiValueKind>(),
    /** Money and non-money numerics alike; read and written as a decimal string. */
    valueAmount: numeric('value_amount', { precision: 20, scale: 6 }),
    valueDate: date('value_date'),
    valueText: text('value_text'),
    companyKpiLabel: varchar('company_kpi_label', { length: 120 }),
    source: varchar('source', { length: 16 }).notNull().$type<KpiSource>(),
    sourceLabel: varchar('source_label', { length: 200 }),
    comment: text('comment'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    reviewStatus: varchar('review_status', { length: 16 })
      .notNull()
      .default('pending')
      .$type<KpiReviewStatus>(),
    reviewComment: text('review_comment'),
    reviewedBy: integer('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** Monotonic; backs the ETag. A review bumps it. */
    version: integer('version').notNull().default(1),
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
      name: 'kpi_observations_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    portfolioCompanyFk: foreignKey({
      columns: [table.portfolioCompanyId],
      foreignColumns: [portfolioCompanies.id],
      name: 'kpi_observations_portfolio_company_id_fk',
    }).onDelete('restrict'),
    reviewedByFk: foreignKey({
      columns: [table.reviewedBy],
      foreignColumns: [users.id],
      name: 'kpi_observations_reviewed_by_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'kpi_observations_created_by_fk',
    }),
    idFundUnique: unique('kpi_observations_id_fund_unique').on(table.id, table.fundId),
    fundIdempotencyUnique: unique('kpi_observations_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    metricCheck: check(
      'kpi_observations_metric_check',
      sql`${table.metric} IN (
        'revenue_arr','cash_balance','monthly_burn','runway_months','headcount',
        'next_financing_target','next_financing_date','company_specific','qualitative_update'
      )`
    ),
    basisCheck: check(
      'kpi_observations_basis_check',
      sql`${table.basis} IN ('actual','projected')`
    ),
    sourceCheck: check(
      'kpi_observations_source_check',
      sql`${table.source} IN ('manual','csv_import')`
    ),
    reviewStatusCheck: check(
      'kpi_observations_review_status_check',
      sql`${table.reviewStatus} IN ('pending','accepted','rejected')`
    ),
    valueKindCheck: check(
      'kpi_observations_value_kind_check',
      sql`${table.valueKind} IN ('money','number','date','text')`
    ),
    /** Exactly one of the three value columns is populated, per value kind. */
    valueCouplingCheck: check(
      'kpi_observations_value_coupling_check',
      sql`(
        (${table.valueKind} IN ('money','number')
          AND ${table.valueAmount} IS NOT NULL
          AND ${table.valueDate} IS NULL
          AND ${table.valueText} IS NULL)
        OR (${table.valueKind} = 'date'
          AND ${table.valueDate} IS NOT NULL
          AND ${table.valueAmount} IS NULL
          AND ${table.valueText} IS NULL)
        OR (${table.valueKind} = 'text'
          AND ${table.valueText} IS NOT NULL
          AND ${table.valueAmount} IS NULL
          AND ${table.valueDate} IS NULL)
      )`
    ),
    /** The contract's metric -> value-kind map, enforced by the catalog. */
    metricValueKindCheck: check(
      'kpi_observations_metric_value_kind_check',
      sql`${table.valueKind} = CASE ${table.metric}
        WHEN 'revenue_arr' THEN 'money'
        WHEN 'cash_balance' THEN 'money'
        WHEN 'monthly_burn' THEN 'money'
        WHEN 'next_financing_target' THEN 'money'
        WHEN 'runway_months' THEN 'number'
        WHEN 'headcount' THEN 'number'
        WHEN 'company_specific' THEN 'number'
        WHEN 'next_financing_date' THEN 'date'
        WHEN 'qualitative_update' THEN 'text'
      END`
    ),
    /** Magnitude metrics can never be negative. */
    nonNegativeValueCheck: check(
      'kpi_observations_non_negative_value_check',
      sql`${table.metric} NOT IN (
        'revenue_arr','cash_balance','monthly_burn','runway_months','headcount','next_financing_target'
      ) OR ${table.valueAmount} >= 0`
    ),
    /** The company-specific KPI carries its label; nothing else may. */
    companyKpiLabelCheck: check(
      'kpi_observations_company_kpi_label_check',
      sql`(${table.metric} = 'company_specific') = (${table.companyKpiLabel} IS NOT NULL)`
    ),
    periodOrderCheck: check(
      'kpi_observations_period_order_check',
      sql`${table.periodEnd} >= ${table.periodStart}`
    ),
    versionCheck: check('kpi_observations_version_check', sql`${table.version} >= 1`),
    /** A reviewed row records who and when; a pending row records neither. */
    reviewCouplingCheck: check(
      'kpi_observations_review_coupling_check',
      sql`(${table.reviewStatus} = 'pending')
        = (${table.reviewedAt} IS NULL AND ${table.reviewComment} IS NULL)`
    ),
    fundCompanyPeriodIdx: index('idx_kpi_observations_fund_company_period').on(
      table.fundId,
      table.portfolioCompanyId,
      table.periodStart,
      table.id
    ),
  })
);

export type KpiObservationRow = typeof kpiObservations.$inferSelect;
export type InsertKpiObservation = typeof kpiObservations.$inferInsert;
