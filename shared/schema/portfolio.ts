/**
 * Portfolio and Company database schemas
 *
 * Contains: portfolioCompanies, investments, investmentLots
 *
 * @module shared/schema/portfolio
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  decimal,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Import funds for FK references
import { funds } from './fund';

// ============================================================================
// PORTFOLIO COMPANIES TABLE
// ============================================================================

export const portfolioCompanies = pgTable('portfoliocompanies', {
  id: serial('id').primaryKey(),
  fundId: integer('fund_id').references(() => funds.id),
  name: text('name').notNull(),
  sector: text('sector').notNull(),
  stage: text('stage').notNull(),
  currentStage: text('current_stage'),
  investmentAmount: decimal('investment_amount', { precision: 15, scale: 2 }).notNull(),
  investmentDate: timestamp('investment_date'),
  currentValuation: decimal('current_valuation', { precision: 15, scale: 2 }),
  foundedYear: integer('founded_year'),
  status: text('status').notNull().default('active'),
  description: text('description'),
  dealTags: text('deal_tags').array(),
  createdAt: timestamp('created_at').defaultNow(),
  // Fund Allocation Management (Phase 1a) fields
  deployedReservesCents: bigint('deployed_reserves_cents', { mode: 'number' }).default(0).notNull(),
  plannedReservesCents: bigint('planned_reserves_cents', { mode: 'number' }).default(0).notNull(),
  exitMoicBps: integer('exit_moic_bps'),
  ownershipCurrentPct: decimal('ownership_current_pct', { precision: 7, scale: 4 }),
  allocationCapCents: bigint('allocation_cap_cents', { mode: 'number' }),
  allocationReason: text('allocation_reason'),
  allocationIteration: integer('allocation_iteration').default(0).notNull(),
  lastAllocationAt: timestamp('last_allocation_at', { withTimezone: true }),
  allocationVersion: integer('allocation_version').default(1).notNull(),
});

// ============================================================================
// INVESTMENTS TABLE
// ============================================================================

export const investments = pgTable(
  'investments',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').references(() => funds.id),
    companyId: integer('company_id').references(() => portfolioCompanies.id),
    investmentDate: timestamp('investment_date').notNull(),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
    round: text('round').notNull(),
    ownershipPercentage: decimal('ownership_percentage', { precision: 5, scale: 4 }),
    valuationAtInvestment: decimal('valuation_at_investment', { precision: 15, scale: 2 }),
    dealTags: text('deal_tags').array(),

    // LOT TRACKING EXTENSIONS (Phase 1 - Portfolio Route)
    // All nullable for backward compatibility with legacy data
    // NOTE: Using mode "bigint" for true precision (no Number.MAX_SAFE_INTEGER limit)
    sharePriceCents: bigint('share_price_cents', { mode: 'bigint' }),
    sharesAcquired: decimal('shares_acquired', { precision: 18, scale: 8 }),
    costBasisCents: bigint('cost_basis_cents', { mode: 'bigint' }),
    pricingConfidence: text('pricing_confidence').default('calculated'),
    version: integer('version').notNull().default(1),

    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    pricingConfidenceCheck: check(
      'investments_pricing_confidence_check',
      sql`${table.pricingConfidence} IN ('calculated', 'verified')`
    ),
  })
);

// ============================================================================
// INVESTMENT LOTS TABLE - Lot-level tracking for granular MOIC calculations
// ============================================================================

export const investmentLots = pgTable(
  'investment_lots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    investmentId: integer('investment_id')
      .notNull()
      .references(() => investments.id, { onDelete: 'cascade' }),

    lotType: text('lot_type').notNull(),
    sharePriceCents: bigint('share_price_cents', { mode: 'bigint' }).notNull(),
    sharesAcquired: decimal('shares_acquired', { precision: 18, scale: 8 }).notNull(),
    costBasisCents: bigint('cost_basis_cents', { mode: 'bigint' }).notNull(),

    version: bigint('version', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    idempotencyKey: text('idempotency_key'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    investmentLotTypeIdx: index('investment_lots_investment_lot_type_idx').on(
      table.investmentId,
      table.lotType
    ),
    idempotencyUniqueIdx: uniqueIndex('investment_lots_investment_idem_key_idx')
      .on(table.investmentId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    cursorIdx: index('investment_lots_investment_cursor_idx').on(
      table.investmentId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    lotTypeCheck: check(
      'investment_lots_lot_type_check',
      sql`${table.lotType} IN ('initial', 'follow_on', 'secondary')`
    ),
    idempotencyKeyLenCheck: check(
      'investment_lots_idem_key_len_check',
      sql`${table.idempotencyKey} IS NULL OR (length(${table.idempotencyKey}) >= 1 AND length(${table.idempotencyKey}) <= 128)`
    ),
  })
);

// ============================================================================
// TYPES
// ============================================================================

export type PortfolioCompany = typeof portfolioCompanies.$inferSelect;
export type NewPortfolioCompany = typeof portfolioCompanies.$inferInsert;
export type Investment = typeof investments.$inferSelect;
export type NewInvestment = typeof investments.$inferInsert;
export type InvestmentLot = typeof investmentLots.$inferSelect;
export type InsertInvestmentLot = typeof investmentLots.$inferInsert;
