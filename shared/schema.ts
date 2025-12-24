import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, decimal, index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const funds = pgTable("funds", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  size: decimal("size", { precision: 15, scale: 2 }).notNull(),
  deployedCapital: decimal("deployed_capital", { precision: 15, scale: 2 }).default("0"),
  managementFee: decimal("management_fee", { precision: 5, scale: 4 }).notNull(),
  carryPercentage: decimal("carry_percentage", { precision: 5, scale: 4 }).notNull(),
  vintageYear: integer("vintage_year").notNull(),
  establishmentDate: date("establishment_date"),
  status: text("status").notNull().default("active"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Fund configuration storage (hybrid approach)
export const fundConfigs = pgTable("fundconfigs", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id).notNull(),
  version: integer("version").notNull().default(1),
  config: jsonb("config").notNull(), // Stores full fund configuration
  isDraft: boolean("is_draft").default(true),
  isPublished: boolean("is_published").default(false),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table: any) => ({
  fundVersionUnique: unique()['on'](table.fundId, table.version),
  fundVersionIdx: index("fundconfigs_fund_version_idx")['on'](table.fundId, table.version),
}));

// Fund snapshots for CQRS pattern
export const fundSnapshots = pgTable("fund_snapshots", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'RESERVE', 'PACING', 'COHORT'
  payload: jsonb("payload").notNull(), // Calculation results
  calcVersion: varchar("calc_version", { length: 20 }).notNull(),
  correlationId: varchar("correlation_id", { length: 36 }).notNull(),
  metadata: jsonb("metadata"), // Additional calculation metadata
  snapshotTime: timestamp("snapshot_time").notNull(),
  eventCount: integer("event_count").default(0),
  stateHash: varchar("state_hash", { length: 64 }),
  state: jsonb("state"), // Snapshot state data
  createdAt: timestamp("created_at").defaultNow(),
}, (table: any) => ({
  lookupIdx: index("fund_snapshots_lookup_idx")['on'](table.fundId, table.type, table.createdAt.desc()),
}));

// Fund events for audit trail
export const fundEvents = pgTable("fund_events", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id).notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(), // 'DRAFT_SAVED', 'PUBLISHED', 'CALC_TRIGGERED'
  payload: jsonb("payload"), // Event data
  userId: integer("user_id").references(() => users.id),
  correlationId: varchar("correlation_id", { length: 36 }),
  eventTime: timestamp("event_time").notNull(),
  operation: varchar("operation", { length: 50 }),
  entityType: varchar("entity_type", { length: 50 }),
  metadata: jsonb("metadata"), // Additional event metadata
  createdAt: timestamp("created_at").defaultNow(),
}, (table: any) => ({
  fundEventIdx: index("fund_events_fund_idx")['on'](table.fundId, table.createdAt.desc()),
}));

export const portfolioCompanies = pgTable("portfoliocompanies", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id),
  name: text("name").notNull(),
  sector: text("sector").notNull(),
  stage: text("stage").notNull(),
  currentStage: text("current_stage"),
  investmentAmount: decimal("investment_amount", { precision: 15, scale: 2 }).notNull(),
  investmentDate: timestamp("investment_date"),
  currentValuation: decimal("current_valuation", { precision: 15, scale: 2 }),
  foundedYear: integer("founded_year"),
  status: text("status").notNull().default("active"),
  description: text("description"),
  dealTags: text("deal_tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
  // Fund Allocation Management (Phase 1a) fields
  deployedReservesCents: bigint("deployed_reserves_cents", { mode: "number" }).default(0).notNull(),
  plannedReservesCents: bigint("planned_reserves_cents", { mode: "number" }).default(0).notNull(),
  exitMoicBps: integer("exit_moic_bps"),
  ownershipCurrentPct: decimal("ownership_current_pct", { precision: 7, scale: 4 }),
  allocationCapCents: bigint("allocation_cap_cents", { mode: "number" }),
  allocationReason: text("allocation_reason"),
  allocationIteration: integer("allocation_iteration").default(0).notNull(),
  lastAllocationAt: timestamp("last_allocation_at", { withTimezone: true }),
  allocationVersion: integer("allocation_version").default(1).notNull(),
});

export const investments = pgTable("investments", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id),
  companyId: integer("company_id").references(() => portfolioCompanies.id),
  investmentDate: timestamp("investment_date").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  round: text("round").notNull(),
  ownershipPercentage: decimal("ownership_percentage", { precision: 5, scale: 4 }),
  valuationAtInvestment: decimal("valuation_at_investment", { precision: 15, scale: 2 }),
  dealTags: text("deal_tags").array(),

  // LOT TRACKING EXTENSIONS (Phase 1 - Portfolio Route)
  // All nullable for backward compatibility with legacy data
  // NOTE: Using mode "bigint" for true precision (no Number.MAX_SAFE_INTEGER limit)
  sharePriceCents: bigint("share_price_cents", { mode: "bigint" }),
  sharesAcquired: decimal("shares_acquired", { precision: 18, scale: 8 }),
  costBasisCents: bigint("cost_basis_cents", { mode: "bigint" }),
  pricingConfidence: text("pricing_confidence").default("calculated"),
  version: integer("version").notNull().default(1),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  pricingConfidenceCheck: check("investments_pricing_confidence_check", sql`${table.pricingConfidence} IN ('calculated', 'verified')`),
}));

// ============================================================================
// INVESTMENT LOTS - Lot-level tracking for granular MOIC calculations
// ============================================================================
export const investmentLots = pgTable("investment_lots", {
  id: uuid("id").defaultRandom().primaryKey(),
  investmentId: integer("investment_id").notNull().references(() => investments.id, { onDelete: "cascade" }),

  lotType: text("lot_type").notNull(),
  sharePriceCents: bigint("share_price_cents", { mode: "bigint" }).notNull(),
  sharesAcquired: decimal("shares_acquired", { precision: 18, scale: 8 }).notNull(),
  costBasisCents: bigint("cost_basis_cents", { mode: "bigint" }).notNull(),

  version: bigint("version", { mode: "bigint" }).notNull().default(sql`0`),
  idempotencyKey: text("idempotency_key"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  investmentLotTypeIdx: index("investment_lots_investment_lot_type_idx").on(table.investmentId, table.lotType),
  idempotencyUniqueIdx: uniqueIndex("investment_lots_investment_idem_key_idx").on(table.investmentId, table.idempotencyKey).where(sql`${table.idempotencyKey} IS NOT NULL`),
  cursorIdx: index("investment_lots_investment_cursor_idx").on(table.investmentId, table.createdAt.desc(), table.id.desc()),
  lotTypeCheck: check("investment_lots_lot_type_check", sql`${table.lotType} IN ('initial', 'follow_on', 'secondary')`),
  idempotencyKeyLenCheck: check("investment_lots_idem_key_len_check", sql`${table.idempotencyKey} IS NULL OR (length(${table.idempotencyKey}) >= 1 AND length(${table.idempotencyKey}) <= 128)`),
}));

export type InvestmentLot = typeof investmentLots.$inferSelect;
export type InsertInvestmentLot = typeof investmentLots.$inferInsert;

// ============================================================================
// FORECAST SNAPSHOTS - Point-in-time snapshots with async calculation
// ============================================================================
export const forecastSnapshots = pgTable("forecast_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").notNull().references(() => funds.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  status: text("status").notNull().default("pending"),
  sourceHash: text("source_hash"),
  calculatedMetrics: jsonb("calculated_metrics"),

  fundState: jsonb("fund_state"),
  portfolioState: jsonb("portfolio_state"),
  metricsState: jsonb("metrics_state"),

  snapshotTime: timestamp("snapshot_time", { withTimezone: true }).notNull(),
  version: bigint("version", { mode: "bigint" }).notNull().default(sql`0`),
  idempotencyKey: text("idempotency_key"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  fundTimeIdx: index("forecast_snapshots_fund_time_idx").on(table.fundId, table.snapshotTime.desc()),
  sourceHashIdx: index("forecast_snapshots_source_hash_idx").on(table.sourceHash),
  idempotencyUniqueIdx: uniqueIndex("forecast_snapshots_fund_idem_key_idx").on(table.fundId, table.idempotencyKey).where(sql`${table.idempotencyKey} IS NOT NULL`),
  cursorIdx: index("forecast_snapshots_fund_cursor_idx").on(table.fundId, table.snapshotTime.desc(), table.id.desc()),
  sourceHashUniqueIdx: uniqueIndex("forecast_snapshots_source_hash_unique_idx").on(table.sourceHash, table.fundId).where(sql`${table.sourceHash} IS NOT NULL`),
  statusCheck: check("forecast_snapshots_status_check", sql`${table.status} IN ('pending', 'calculating', 'complete', 'error')`),
  idempotencyKeyLenCheck: check("forecast_snapshots_idem_key_len_check", sql`${table.idempotencyKey} IS NULL OR (length(${table.idempotencyKey}) >= 1 AND length(${table.idempotencyKey}) <= 128)`),
}));

export type ForecastSnapshot = typeof forecastSnapshots.$inferSelect;
export type InsertForecastSnapshot = typeof forecastSnapshots.$inferInsert;

// ============================================================================
// RESERVE ALLOCATIONS - Links reserve decisions to snapshots
// ============================================================================
export const reserveAllocations = pgTable("reserve_allocations", {
  id: uuid("id").defaultRandom().primaryKey(),
  snapshotId: uuid("snapshot_id").notNull().references(() => forecastSnapshots.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => portfolioCompanies.id, { onDelete: "cascade" }),

  plannedReserveCents: bigint("planned_reserve_cents", { mode: "bigint" }).notNull(),
  allocationScore: decimal("allocation_score", { precision: 10, scale: 6 }),
  priority: integer("priority"),
  rationale: text("rationale"),

  version: bigint("version", { mode: "bigint" }).notNull().default(sql`0`),
  idempotencyKey: text("idempotency_key"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  snapshotCompanyIdx: index("reserve_allocations_snapshot_company_idx").on(table.snapshotId, table.companyId),
  companyIdx: index("reserve_allocations_company_idx").on(table.companyId),
  priorityIdx: index("reserve_allocations_priority_idx").on(table.snapshotId, table.priority),
  idempotencyUniqueIdx: uniqueIndex("reserve_allocations_snapshot_idem_key_idx").on(table.snapshotId, table.idempotencyKey).where(sql`${table.idempotencyKey} IS NOT NULL`),
  cursorIdx: index("reserve_allocations_snapshot_cursor_idx").on(table.snapshotId, table.createdAt.desc(), table.id.desc()),
  idempotencyKeyLenCheck: check("reserve_allocations_idem_key_len_check", sql`${table.idempotencyKey} IS NULL OR (length(${table.idempotencyKey}) >= 1 AND length(${table.idempotencyKey}) <= 128)`),
}));

export type ReserveAllocation = typeof reserveAllocations.$inferSelect;
export type InsertReserveAllocation = typeof reserveAllocations.$inferInsert;

// Scenario Analysis Tables
export const scenarios = pgTable("scenarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: integer("company_id").notNull().references(() => portfolioCompanies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  version: integer("version").notNull().default(1),
  isDefault: boolean("is_default").notNull().default(false),
  lockedAt: timestamp("locked_at"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  companyIdIdx: index("idx_scenarios_company_id")['on'](table.companyId),
  createdByIdx: index("idx_scenarios_created_by")['on'](table.createdBy),
  createdAtIdx: index("idx_scenarios_created_at")['on'](table.createdAt.desc()),
}));

export const scenarioCases = pgTable("scenario_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  scenarioId: uuid("scenario_id").notNull().references(() => scenarios.id, { onDelete: "cascade" }),
  caseName: varchar("case_name", { length: 255 }).notNull(),
  description: text("description"),
  probability: decimal("probability", { precision: 10, scale: 8 }).notNull(),
  investment: decimal("investment", { precision: 15, scale: 2 }).notNull().default("0"),
  followOns: decimal("follow_ons", { precision: 15, scale: 2 }).notNull().default("0"),
  exitProceeds: decimal("exit_proceeds", { precision: 15, scale: 2 }).notNull().default("0"),
  exitValuation: decimal("exit_valuation", { precision: 15, scale: 2 }).notNull().default("0"),
  monthsToExit: integer("months_to_exit"),
  ownershipAtExit: decimal("ownership_at_exit", { precision: 5, scale: 4 }),
  fmv: decimal("fmv", { precision: 15, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  scenarioIdIdx: index("idx_scenario_cases_scenario_id")['on'](table.scenarioId),
  createdAtIdx: index("idx_scenario_cases_created_at")['on'](table.createdAt.desc()),
}));

export const scenarioAuditLogs = pgTable("scenario_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  diff: jsonb("diff"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  entityIdIdx: index("idx_audit_logs_entity_id")['on'](table.entityId),
  userIdIdx: index("idx_audit_logs_user_id")['on'](table.userId),
  timestampIdx: index("idx_audit_logs_timestamp")['on'](table.timestamp.desc()),
  entityTypeIdx: index("idx_audit_logs_entity_type")['on'](table.entityType),
}));

export const fundMetrics = pgTable("fund_metrics", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id),
  metricDate: timestamp("metric_date").notNull(),
  asOfDate: timestamp("as_of_date").notNull(),
  totalValue: decimal("totalvalue", { precision: 15, scale: 2 }).notNull(),
  irr: decimal("irr", { precision: 5, scale: 4 }),
  multiple: decimal("multiple", { precision: 5, scale: 2 }),
  dpi: decimal("dpi", { precision: 5, scale: 2 }),
  tvpi: decimal("tvpi", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Fund Distributions - Cash distributions to LPs for IRR/DPI calculations
export const fundDistributions = pgTable("fund_distributions", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id).notNull(),
  companyId: integer("company_id").references(() => portfolioCompanies.id),
  distributionDate: timestamp("distribution_date").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  distributionType: text("distribution_type").notNull().default("exit"), // 'exit', 'dividend', 'partial_sale', 'recapitalization'
  description: text("description"),
  isRecycled: boolean("is_recycled").default(false), // Whether proceeds were recycled into new investments
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
});

export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id),
  companyId: integer("company_id").references(() => portfolioCompanies.id),
  type: text("type").notNull(), // 'investment', 'exit', 'update', 'milestone'
  title: text("title").notNull(),
  description: text("description"),
  amount: decimal("amount", { precision: 15, scale: 2 }),
  activityDate: timestamp("activity_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Deal Pipeline Tables
export const dealOpportunities = pgTable("deal_opportunities", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id),
  companyName: text("company_name").notNull(),
  sector: text("sector").notNull(),
  stage: text("stage").notNull(), // 'Pre-seed', 'Seed', 'Series A', etc.
  sourceType: text("source_type").notNull(), // 'Referral', 'Cold outreach', 'Inbound', 'Event'
  dealSize: decimal("deal_size", { precision: 15, scale: 2 }),
  valuation: decimal("valuation", { precision: 15, scale: 2 }),
  status: text("status").notNull().default("lead"), // 'lead', 'qualified', 'pitch', 'dd', 'committee', 'term_sheet', 'closed', 'passed'
  priority: text("priority").notNull().default("medium"), // 'high', 'medium', 'low'
  foundedYear: integer("founded_year"),
  employeeCount: integer("employee_count"),
  revenue: decimal("revenue", { precision: 15, scale: 2 }),
  description: text("description"),
  website: text("website"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  sourceNotes: text("source_notes"),
  nextAction: text("next_action"),
  nextActionDate: timestamp("next_action_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const pipelineStages = pgTable("pipeline_stages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  orderIndex: integer("order_index").notNull(),
  color: text("color").default("#6b7280"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dueDiligenceItems = pgTable("due_diligence_items", {
  id: serial("id").primaryKey(),
  opportunityId: integer("opportunity_id").references(() => dealOpportunities.id),
  category: text("category").notNull(), // 'Financial', 'Legal', 'Technical', 'Market', 'Team'
  item: text("item").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"), // 'pending', 'in_progress', 'completed', 'not_applicable'
  priority: text("priority").notNull().default("medium"),
  assignedTo: text("assigned_to"),
  dueDate: timestamp("due_date"),
  completedDate: timestamp("completed_date"),
  notes: text("notes"),
  documents: jsonb("documents"), // Array of document references
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const scoringModels = pgTable("scoring_models", {
  id: serial("id").primaryKey(),
  opportunityId: integer("opportunity_id").references(() => dealOpportunities.id),
  criteriaName: text("criteria_name").notNull(), // 'Team', 'Market', 'Product', 'Traction', 'Financials'
  score: integer("score").notNull(), // 1-10 scale
  weight: decimal("weight", { precision: 3, scale: 2 }).notNull(), // 0.1-1.0
  notes: text("notes"),
  scoredBy: text("scored_by"),
  scoredAt: timestamp("scored_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pipelineActivities = pgTable("pipeline_activities", {
  id: serial("id").primaryKey(),
  opportunityId: integer("opportunity_id").references(() => dealOpportunities.id),
  type: text("type").notNull(), // 'meeting', 'email', 'call', 'document_review', 'stage_change'
  title: text("title").notNull(),
  description: text("description"),
  outcome: text("outcome"),
  participants: jsonb("participants"), // Array of participant details
  scheduledDate: timestamp("scheduled_date"),
  completedDate: timestamp("completed_date"),
  followUpRequired: boolean("follow_up_required").default(false),
  followUpDate: timestamp("follow_up_date"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const marketResearch = pgTable("market_research", {
  id: serial("id").primaryKey(),
  opportunityId: integer("opportunity_id").references(() => dealOpportunities.id),
  sector: text("sector").notNull(),
  marketSize: decimal("market_size", { precision: 15, scale: 2 }),
  growthRate: decimal("growth_rate", { precision: 5, scale: 2 }),
  competitorAnalysis: jsonb("competitor_analysis"),
  marketTrends: text("market_trends"),
  riskFactors: text("risk_factors"),
  opportunities: text("opportunities"),
  researchDate: timestamp("research_date").defaultNow(),
  researchedBy: text("researched_by"),
  sources: jsonb("sources"), // Array of research sources
  createdAt: timestamp("created_at").defaultNow(),
});

export const financialProjections = pgTable("financial_projections", {
  id: serial("id").primaryKey(),
  opportunityId: integer("opportunity_id").references(() => dealOpportunities.id),
  year: integer("year").notNull(),
  revenue: decimal("revenue", { precision: 15, scale: 2 }),
  revenueGrowth: decimal("revenue_growth", { precision: 5, scale: 2 }),
  grossMargin: decimal("gross_margin", { precision: 5, scale: 2 }),
  burnRate: decimal("burn_rate", { precision: 15, scale: 2 }),
  runwayMonths: integer("runway_months"),
  customerCount: integer("customer_count"),
  arr: decimal("arr", { precision: 15, scale: 2 }),
  ltv: decimal("ltv", { precision: 15, scale: 2 }),
  cac: decimal("cac", { precision: 15, scale: 2 }),
  projectionType: text("projection_type").notNull().default("management"), // 'management', 'adjusted', 'conservative'
  assumptions: text("assumptions"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertFundSchema = createInsertSchema(funds).omit({
  id: true,
  createdAt: true
});

export const insertPortfolioCompanySchema = createInsertSchema(portfolioCompanies).omit({
  id: true,
  createdAt: true
});

export const insertInvestmentSchema = createInsertSchema(investments).omit({
  id: true,
  createdAt: true
});

export const insertFundMetricsSchema = createInsertSchema(fundMetrics).omit({
  id: true,
  createdAt: true
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true
});

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true
});

// Pipeline Insert Schemas
export const insertDealOpportunitySchema = createInsertSchema(dealOpportunities).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertPipelineStageSchema = createInsertSchema(pipelineStages).omit({
  id: true,
  createdAt: true
});

export const insertDueDiligenceItemSchema = createInsertSchema(dueDiligenceItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertScoringModelSchema = createInsertSchema(scoringModels).omit({
  id: true,
  createdAt: true,
  scoredAt: true
});

export const insertPipelineActivitySchema = createInsertSchema(pipelineActivities).omit({
  id: true,
  createdAt: true
});

export const insertMarketResearchSchema = createInsertSchema(marketResearch).omit({
  id: true,
  createdAt: true,
  researchDate: true
});
export const insertFinancialProjectionSchema = createInsertSchema(financialProjections).omit({
  id: true,
  createdAt: true
});

// Custom fields schema
export const customFields = pgTable("custom_fields", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'number', 'tags', 'text', 'color', 'date'
  required: boolean("required").default(false),
  options: text("options").array(), // For tags and color options
  createdAt: timestamp("created_at").defaultNow(),
});

export const customFieldValues = pgTable("custom_fieldvalues", {
  id: serial("id").primaryKey(),
  fieldId: integer("field_id").references(() => customFields.id),
  investmentId: integer("investment_id").references(() => portfolioCompanies.id),
  value: text("value"), // JSON string for complex values
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomFieldSchema = createInsertSchema(customFields).omit({
  id: true,
  createdAt: true
});
export const insertCustomFieldValueSchema = createInsertSchema(customFieldValues).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export const insertFundConfigSchema = createInsertSchema(fundConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export const insertFundSnapshotSchema = createInsertSchema(fundSnapshots).omit({
  id: true,
  createdAt: true
});
export const insertFundEventSchema = createInsertSchema(fundEvents).omit({
  id: true,
  createdAt: true
});

// Core Type Exports
export type Fund = typeof funds.$inferSelect;
export type InsertFund = typeof funds.$inferInsert;
export type PortfolioCompany = typeof portfolioCompanies.$inferSelect;
export type InsertPortfolioCompany = typeof portfolioCompanies.$inferInsert;
export type Investment = typeof investments.$inferSelect;
export type InsertInvestment = typeof investments.$inferInsert;
export type FundMetrics = typeof fundMetrics.$inferSelect;
export type InsertFundMetrics = typeof fundMetrics.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = typeof activities.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type CustomField = typeof customFields.$inferSelect;
export type InsertCustomField = typeof customFields.$inferInsert;
export type CustomFieldValue = typeof customFieldValues.$inferSelect;
export type InsertCustomFieldValue = typeof customFieldValues.$inferInsert;
export type FundConfig = typeof fundConfigs.$inferSelect;
export type InsertFundConfig = typeof fundConfigs.$inferInsert;
export type FundSnapshot = typeof fundSnapshots.$inferSelect;
export type InsertFundSnapshot = typeof fundSnapshots.$inferInsert;
export type FundEvent = typeof fundEvents.$inferSelect;
export type InsertFundEvent = typeof fundEvents.$inferInsert;

// Pipeline Type Exports
export type DealOpportunity = typeof dealOpportunities.$inferSelect;
export type InsertDealOpportunity = typeof dealOpportunities.$inferInsert;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type InsertPipelineStage = typeof pipelineStages.$inferInsert;
export type DueDiligenceItem = typeof dueDiligenceItems.$inferSelect;
export type InsertDueDiligenceItem = typeof dueDiligenceItems.$inferInsert;
export type ScoringModel = typeof scoringModels.$inferSelect;
export type InsertScoringModel = typeof scoringModels.$inferInsert;
export type PipelineActivity = typeof pipelineActivities.$inferSelect;
export type InsertPipelineActivity = typeof pipelineActivities.$inferInsert;
export type MarketResearch = typeof marketResearch.$inferSelect;
export type InsertMarketResearch = typeof marketResearch.$inferInsert;
export type FinancialProjection = typeof financialProjections.$inferSelect;
export type InsertFinancialProjection = typeof financialProjections.$inferInsert;

// Time-Travel Analytics Type Exports
export type FundStateSnapshot = typeof fundStateSnapshots.$inferSelect;
export type InsertFundStateSnapshot = typeof fundStateSnapshots.$inferInsert;
export type SnapshotMetadata = typeof snapshotMetadata.$inferSelect;
export type InsertSnapshotMetadata = typeof snapshotMetadata.$inferInsert;
export type RestorationHistory = typeof restorationHistory.$inferSelect;
export type InsertRestorationHistory = typeof restorationHistory.$inferInsert;
export type SnapshotComparison = typeof snapshotComparisons.$inferSelect;
export type InsertSnapshotComparison = typeof snapshotComparisons.$inferInsert;

export const reserveStrategies = pgTable("reserve_strategies", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").notNull().references(() => funds.id),
  companyId: integer("company_id").notNull().references(() => portfolioCompanies.id),
  allocation: decimal("allocation", { precision: 15, scale: 2 }).notNull(),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow()
}, (table: any) => ({
  fundCompanyIdx: index("idx_reserve_strategies_fund_company")['on'](table.fundId, table.companyId)
}));

export const pacingHistory = pgTable("pacing_history", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").notNull().references(() => funds.id),
  quarter: varchar("quarter", { length: 8 }).notNull(),
  deploymentAmount: decimal("deployment_amount", { precision: 15, scale: 2 }).notNull(),
  marketCondition: varchar("market_condition", { length: 16 }),
  createdAt: timestamp("created_at").defaultNow()
}, (table: any) => ({
  fundQuarterUnique: unique("unique_fund_quarter")['on'](table.fundId, table.quarter)
}));

// Timeline-specific types for better TypeScript inference
export interface TimelineRecord {
  id: number;
  fundId: number;
  eventTime: Date;
  snapshotTime?: Date;
  operation?: string;
  entityType?: string;
  eventType?: string;
  type?: string;
  metadata?: any;
  payload?: any;
  state?: any;
  eventCount?: number;
  stateHash?: string;
  createdAt: Date;
}

export interface TimelineEvent extends FundEvent {
  eventTime: Date;
  operation: string | null;
  entityType: string | null;
}

export interface TimelineSnapshot extends FundSnapshot {
  snapshotTime: Date;
  state: any;
  eventCount: number | null;
  stateHash: string | null;
}

// Audit log table for comprehensive activity tracking with 7-year retention
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: uuid("entity_id"),
  changes: jsonb("changes"),
  ipAddress: text("ip_address"), // INET type handled as text in TypeScript
  userAgent: text("user_agent"),
  correlationId: varchar("correlation_id", { length: 36 }),
  sessionId: varchar("session_id", { length: 64 }),
  requestPath: text("request_path"),
  httpMethod: varchar("http_method", { length: 10 }),
  statusCode: integer("status_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  // retention_until is a generated column, not managed by Drizzle directly
}, (table: any) => ({
  retentionIdx: index("idx_audit_retention")['on'](table.createdAt), // Index on created_at for retention queries
  correlationIdx: index("idx_audit_correlation")['on'](table.correlationId),
  userActionIdx: index("idx_audit_user_action")['on'](table.userId, table.action, table.createdAt.desc()),
}));

// Insert schema for audit log
export const insertAuditLogSchema = createInsertSchema(auditLog).omit({
  id: true,
  createdAt: true
});

// Types
export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;

// Reserve Decision Tables
export const reserveEngineType = pgEnum('reserve_engine_type', ['rules', 'ml', 'hybrid']);

export const reserveDecisions = pgTable('reserve_decisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  fundId: integer('fund_id').notNull().references(() => funds.id),
  companyId: integer('company_id').notNull().references(() => portfolioCompanies.id),
  decisionTs: timestamp('decision_ts', { withTimezone: true }).notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  engineType: reserveEngineType('engine_type').notNull(),
  engineVersion: text('engine_version').notNull(),
  requestId: text('request_id'),
  featureFlags: jsonb('feature_flags').notNull().default({}),
  inputs: jsonb('inputs').notNull(),
  prediction: jsonb('prediction').notNull(),
  explanation: jsonb('explanation'),
  latencyMs: integer('latency_ms'),
  userId: uuid('user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table: any) => ({
  uniqueDecision: uniqueIndex('ux_reserve_unique')['on'](
    table.companyId,
    table.periodStart,
    table.periodEnd,
    table.engineType,
    table.engineVersion
  ),
  fundCompanyIdx: index('idx_reserve_fund_company')['on'](table.fundId, table.companyId),
  periodIdx: index('idx_reserve_period')['on'](table.periodStart, table.periodEnd),
  engineIdx: index('idx_reserve_engine')['on'](table.engineType, table.engineVersion),
  inputsGinIdx: index('idx_reserve_inputs_gin').using('gin', table.inputs),
  predictionGinIdx: index('idx_reserve_prediction_gin').using('gin', table.prediction),
}));

export type ReserveDecision = typeof reserveDecisions.$inferSelect;
export type NewReserveDecision = typeof reserveDecisions.$inferInsert;

// Time-Travel Analytics Schema Extensions
// Fund State Snapshots - Comprehensive state storage for time-travel analytics
export const fundStateSnapshots = pgTable("fund_state_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").references(() => funds.id).notNull(),
  snapshotName: text("snapshot_name").notNull(),
  description: text("description"),
  snapshotTime: timestamp("snapshot_time", { withTimezone: true }).notNull(),

  // Complete fund state as JSON
  fundState: jsonb("fund_state").notNull(), // Full fund configuration and data
  portfolioState: jsonb("portfolio_state").notNull(), // All portfolio companies and investments
  metricsState: jsonb("metrics_state"), // Fund metrics and calculations
  reserveState: jsonb("reserve_state"), // Reserve strategies and decisions
  pacingState: jsonb("pacing_state"), // Pacing history and projections

  // State metadata
  stateVersion: text("state_version").notNull().default("1.0.0"),
  stateHash: text("state_hash").notNull(), // SHA-256 hash for integrity
  dataSize: bigint("data_size", { mode: "number" }), // Size in bytes
  compressionType: text("compression_type").default("gzip"), // Future compression support

  // Snapshot metadata
  isAutomatic: boolean("is_automatic").default(false), // User-created vs automatic
  tags: text("tags").array().default([]), // User-defined tags for organization
  isBookmarked: boolean("is_bookmarked").default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // Optional expiration

  // Creation context
  createdBy: integer("created_by").references(() => users.id),
  triggerEvent: text("trigger_event"), // What triggered this snapshot
  correlationId: uuid("correlation_id"), // Link to related events

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table: any) => ({
  fundTimeIdx: index("fund_state_snapshots_fund_time_idx")['on'](table.fundId, table.snapshotTime.desc()),
  nameIdx: index("fund_state_snapshots_name_idx")['on'](table.fundId, table.snapshotName),
  hashIdx: index("fund_state_snapshots_hash_idx")['on'](table.stateHash),
  tagsGinIdx: index("fund_state_snapshots_tags_gin_idx").using("gin", table.tags),
  bookmarkedIdx: index("fund_state_snapshots_bookmarked_idx")['on'](table.fundId, table.isBookmarked),
  expirationIdx: index("fund_state_snapshots_expiration_idx")['on'](table.expiresAt),
}));

// Snapshot Metadata for versioning and comparison
export const snapshotMetadata = pgTable("snapshot_metadata", {
  id: uuid("id").defaultRandom().primaryKey(),
  snapshotId: uuid("snapshot_id").references(() => fundStateSnapshots.id, { onDelete: "cascade" }).notNull(),

  // Version information
  schemaVersion: text("schema_version").notNull().default("1.0.0"),
  apiVersion: text("api_version").notNull(),
  migrationVersion: text("migration_version"),

  // Data lineage
  parentSnapshotId: uuid("parent_snapshot_id").references(() => fundStateSnapshots.id),
  derivedFrom: text("derived_from"), // Source of data transformation

  // Performance metrics
  snapshotDurationMs: integer("snapshot_duration_ms"), // Time to create snapshot
  verificationDurationMs: integer("verification_duration_ms"), // Time to verify integrity

  // Quality metrics
  recordCount: integer("record_count"), // Total records in snapshot
  entityCounts: jsonb("entity_counts"), // Count per entity type
  validationResults: jsonb("validation_results"), // Data quality checks

  // Comparison metadata
  diffFromParent: jsonb("diff_from_parent"), // Changes from parent snapshot
  changesSummary: text("changes_summary"), // Human-readable summary
  significantChanges: boolean("significant_changes").default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table: any) => ({
  snapshotIdx: index("snapshot_metadata_snapshot_idx")['on'](table.snapshotId),
  parentIdx: index("snapshot_metadata_parent_idx")['on'](table.parentSnapshotId),
  schemaVersionIdx: index("snapshot_metadata_schema_version_idx")['on'](table.schemaVersion),
}));

// Restoration History for audit trail and rollback tracking
export const restorationHistory = pgTable("restoration_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").references(() => funds.id).notNull(),
  sourceSnapshotId: uuid("source_snapshot_id").references(() => fundStateSnapshots.id).notNull(),
  targetSnapshotId: uuid("target_snapshot_id").references(() => fundStateSnapshots.id), // If restoring to new snapshot

  // Restoration details
  restorationType: text("restoration_type").notNull(), // 'full', 'partial', 'preview', 'comparison'
  restoredEntities: text("restored_entities").array(), // Which entities were restored
  exclusions: text("exclusions").array(), // What was excluded from restoration

  // Operation metadata
  operationId: uuid("operation_id").notNull(), // Unique ID for this restoration operation
  batchId: uuid("batch_id"), // If part of larger batch operation

  // State changes
  preRestoreState: jsonb("pre_restore_state"), // State before restoration
  postRestoreState: jsonb("post_restore_state"), // State after restoration
  stateChanges: jsonb("state_changes"), // Detailed changes made

  // Validation and verification
  validationPassed: boolean("validation_passed").default(false),
  validationErrors: jsonb("validation_errors"),
  verificationHash: text("verification_hash"), // Hash to verify restoration integrity

  // Performance tracking
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  recordsProcessed: integer("records_processed"),

  // User context
  restoredBy: integer("restored_by").references(() => users.id).notNull(),
  reason: text("reason"), // User-provided reason for restoration
  approvedBy: integer("approved_by").references(() => users.id), // For approval workflows

  // Status tracking
  status: text("status").notNull().default("initiated"), // 'initiated', 'in_progress', 'completed', 'failed', 'rolled_back'
  errorMessage: text("error_message"),
  rollbackSnapshotId: uuid("rollback_snapshot_id").references(() => fundStateSnapshots.id), // If rolled back

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table: any) => ({
  fundOperationIdx: index("restoration_history_fund_operation_idx")['on'](table.fundId, table.operationId),
  sourceSnapshotIdx: index("restoration_history_source_idx")['on'](table.sourceSnapshotId),
  timeRangeIdx: index("restoration_history_time_range_idx")['on'](table.startTime, table.endTime),
  statusIdx: index("restoration_history_status_idx")['on'](table.status, table.createdAt.desc()),
  userIdx: index("restoration_history_user_idx")['on'](table.restoredBy, table.createdAt.desc()),
}));

// Snapshot Comparisons - For tracking and caching comparison operations
export const snapshotComparisons = pgTable("snapshot_comparisons", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").references(() => funds.id).notNull(),

  // Snapshots being compared
  baseSnapshotId: uuid("base_snapshot_id").references(() => fundStateSnapshots.id).notNull(),
  compareSnapshotId: uuid("compare_snapshot_id").references(() => fundStateSnapshots.id).notNull(),

  // Comparison configuration
  comparisonType: text("comparison_type").notNull(), // 'full', 'metrics_only', 'portfolio_only', 'custom'
  includeFields: text("include_fields").array(), // Specific fields to compare
  excludeFields: text("exclude_fields").array(), // Fields to exclude from comparison

  // Comparison results (cached for performance)
  differences: jsonb("differences").notNull(), // Detailed differences
  summary: jsonb("summary").notNull(), // High-level summary of changes
  metricsComparison: jsonb("metrics_comparison"), // Performance metrics comparison
  portfolioChanges: jsonb("portfolio_changes"), // Portfolio-specific changes

  // Comparison metadata
  totalChanges: integer("total_changes").notNull(),
  significantChanges: integer("significant_changes").notNull(),
  changeCategories: text("change_categories").array(), // Categories of changes

  // Performance tracking
  comparisonDurationMs: integer("comparison_duration_ms"),
  cacheStatus: text("cache_status").default("fresh"), // 'fresh', 'stale', 'expired'
  lastUsed: timestamp("last_used", { withTimezone: true }).defaultNow(),

  // User context
  requestedBy: integer("requested_by").references(() => users.id),
  shared: boolean("shared").default(false), // Can other users see this comparison

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table: any) => ({
  fundComparisonIdx: index("snapshot_comparisons_fund_idx")['on'](table.fundId, table.createdAt.desc()),
  snapshotsIdx: index("snapshot_comparisons_snapshots_idx")['on'](table.baseSnapshotId, table.compareSnapshotId),
  uniqueComparison: unique("snapshot_comparisons_unique")['on'](table.baseSnapshotId, table.compareSnapshotId, table.comparisonType),
  cacheIdx: index("snapshot_comparisons_cache_idx")['on'](table.cacheStatus, table.lastUsed),
  userIdx: index("snapshot_comparisons_user_idx")['on'](table.requestedBy, table.createdAt.desc()),
}));

// Variance Tracking Schema
// Fund Baselines - Store baseline performance metrics for comparison
export const fundBaselines = pgTable("fund_baselines", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").references(() => funds.id).notNull(),

  // Baseline identification
  name: text("name").notNull(), // User-defined baseline name
  description: text("description"),
  baselineType: text("baseline_type").notNull(), // 'initial', 'quarterly', 'annual', 'milestone', 'custom'

  // Baseline period
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  snapshotDate: timestamp("snapshot_date", { withTimezone: true }).notNull(),

  // Core baseline metrics
  totalValue: decimal("total_value", { precision: 15, scale: 2 }).notNull(),
  deployedCapital: decimal("deployed_capital", { precision: 15, scale: 2 }).notNull(),
  irr: decimal("irr", { precision: 5, scale: 4 }),
  multiple: decimal("multiple", { precision: 5, scale: 2 }),
  dpi: decimal("dpi", { precision: 5, scale: 2 }),
  tvpi: decimal("tvpi", { precision: 5, scale: 2 }),

  // Portfolio composition baseline
  portfolioCount: integer("portfolio_count").notNull().default(0),
  averageInvestment: decimal("average_investment", { precision: 15, scale: 2 }),
  topPerformers: jsonb("top_performers"), // Array of top performing companies
  sectorDistribution: jsonb("sector_distribution"), // Sector allocation breakdown
  stageDistribution: jsonb("stage_distribution"), // Stage allocation breakdown

  // Reserve and pacing baselines
  reserveAllocation: jsonb("reserve_allocation"), // Reserve strategy snapshot
  pacingMetrics: jsonb("pacing_metrics"), // Pacing performance metrics

  // Baseline status and metadata
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false), // Default baseline for comparisons
  confidence: decimal("confidence", { precision: 3, scale: 2 }).default("1.00"), // 0.00-1.00

  // Version and lineage
  version: text("version").notNull().default("1.0.0"),
  parentBaselineId: uuid("parent_baseline_id"),
  sourceSnapshotId: uuid("source_snapshot_id").references(() => fundStateSnapshots.id),

  // User context
  createdBy: integer("created_by").references(() => users.id).notNull(),
  approvedBy: integer("approved_by").references(() => users.id),
  tags: text("tags").array().default([]),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table: any) => ({
  fundBaselineIdx: index("fund_baselines_fund_idx").on(table.fundId, table.createdAt.desc()),
  periodIdx: index("fund_baselines_period_idx").on(table.periodStart, table.periodEnd),
  typeIdx: index("fund_baselines_type_idx").on(table.baselineType, table.isActive),
  defaultIdx: index("fund_baselines_default_idx").on(table.fundId, table.isDefault, table.isActive),
  snapshotIdx: index("fund_baselines_snapshot_idx").on(table.sourceSnapshotId),
  tagsGinIdx: index("fund_baselines_tags_gin_idx").using("gin", table.tags),
}));

// Variance Reports - Track performance variance from baselines
export const varianceReports = pgTable("variance_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").references(() => funds.id).notNull(),
  baselineId: uuid("baseline_id").notNull(),

  // Report identification
  reportName: text("report_name").notNull(),
  reportType: text("report_type").notNull(), // 'periodic', 'milestone', 'ad_hoc', 'alert_triggered'
  reportPeriod: text("report_period"), // 'monthly', 'quarterly', 'annual'

  // Analysis period
  analysisStart: timestamp("analysis_start", { withTimezone: true }).notNull(),
  analysisEnd: timestamp("analysis_end", { withTimezone: true }).notNull(),
  asOfDate: timestamp("as_of_date", { withTimezone: true }).notNull(),

  // Current metrics (for comparison)
  currentMetrics: jsonb("current_metrics").notNull(), // Current fund metrics
  baselineMetrics: jsonb("baseline_metrics").notNull(), // Baseline metrics for reference

  // Variance calculations
  totalValueVariance: decimal("total_value_variance", { precision: 15, scale: 2 }),
  totalValueVariancePct: decimal("total_value_variance_pct", { precision: 5, scale: 4 }),
  irrVariance: decimal("irr_variance", { precision: 5, scale: 4 }),
  multipleVariance: decimal("multiple_variance", { precision: 5, scale: 2 }),
  dpiVariance: decimal("dpi_variance", { precision: 5, scale: 2 }),
  tvpiVariance: decimal("tvpi_variance", { precision: 5, scale: 2 }),

  // Portfolio variance analysis
  portfolioVariances: jsonb("portfolio_variances"), // Company-level variance details
  sectorVariances: jsonb("sector_variances"), // Sector-level performance variance
  stageVariances: jsonb("stage_variances"), // Stage-level performance variance

  // Reserve and pacing variance
  reserveVariances: jsonb("reserve_variances"), // Reserve allocation variance
  pacingVariances: jsonb("pacing_variances"), // Pacing performance variance

  // Variance summary and insights
  overallVarianceScore: decimal("overall_variance_score", { precision: 5, scale: 2 }), // Composite score
  significantVariances: jsonb("significant_variances"), // Key variance drivers
  varianceFactors: jsonb("variance_factors"), // Contributing factors analysis

  // Alert and threshold information
  alertsTriggered: jsonb("alerts_triggered"), // Which alerts were triggered
  thresholdBreaches: jsonb("threshold_breaches"), // Threshold violations
  riskLevel: text("risk_level").default("low"), // 'low', 'medium', 'high', 'critical'

  // Report metadata
  calculationEngine: text("calculation_engine").notNull().default("variance-v1"),
  calculationDurationMs: integer("calculation_duration_ms"),
  dataQualityScore: decimal("data_quality_score", { precision: 3, scale: 2 }),

  // User context and workflow
  generatedBy: integer("generated_by").references(() => users.id),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  status: text("status").notNull().default("draft"), // 'draft', 'pending_review', 'approved', 'archived'

  // Sharing and access
  isPublic: boolean("is_public").default(false),
  sharedWith: text("shared_with").array().default([]), // User IDs or groups

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table: any) => ({
  fundReportIdx: index("variance_reports_fund_idx")['on'](table.fundId, table.createdAt.desc()),
  baselineIdx: index("variance_reports_baseline_idx")['on'](table.baselineId, table.asOfDate.desc()),
  periodIdx: index("variance_reports_period_idx")['on'](table.analysisStart, table.analysisEnd),
  typeIdx: index("variance_reports_type_idx")['on'](table.reportType, table.status),
  riskIdx: index("variance_reports_risk_idx")['on'](table.riskLevel, table.createdAt.desc()),
  statusIdx: index("variance_reports_status_idx")['on'](table.status, table.updatedAt.desc()),
}));

// Performance Alerts - Track and manage variance-based alerts
export const performanceAlerts = pgTable("performance_alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").references(() => funds.id).notNull(),
  baselineId: uuid("baseline_id").references(() => fundBaselines.id),
  varianceReportId: uuid("variance_report_id").references(() => varianceReports.id),

  // Alert identification and classification
  alertType: text("alert_type").notNull(), // 'variance_threshold', 'performance_decline', 'sector_risk', 'company_risk'
  severity: text("severity").notNull(), // 'info', 'warning', 'critical', 'urgent'
  category: text("category").notNull(), // 'performance', 'risk', 'operational', 'compliance'

  // Alert content
  title: text("title").notNull(),
  description: text("description").notNull(),
  recommendations: jsonb("recommendations"), // Suggested actions

  // Threshold and trigger information
  metricName: text("metric_name").notNull(), // Which metric triggered the alert
  thresholdValue: decimal("threshold_value", { precision: 15, scale: 4 }),
  actualValue: decimal("actual_value", { precision: 15, scale: 4 }),
  varianceAmount: decimal("variance_amount", { precision: 15, scale: 4 }),
  variancePercentage: decimal("variance_percentage", { precision: 5, scale: 4 }),

  // Alert timing and frequency
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull(),
  firstOccurrence: timestamp("first_occurrence", { withTimezone: true }),
  lastOccurrence: timestamp("last_occurrence", { withTimezone: true }),
  occurrenceCount: integer("occurrence_count").default(1),

  // Alert lifecycle management
  status: text("status").notNull().default("active"), // 'active', 'acknowledged', 'investigating', 'resolved', 'dismissed'
  acknowledgedBy: integer("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  resolvedBy: integer("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionNotes: text("resolution_notes"),

  // Related entities and context
  affectedEntities: jsonb("affected_entities"), // Companies, sectors, or metrics affected
  contextData: jsonb("context_data"), // Additional context for the alert

  // Notification and escalation
  notificationsSent: jsonb("notifications_sent"), // Record of notifications sent
  escalationLevel: integer("escalation_level").default(0), // 0=initial, 1=first escalation, etc.
  escalatedAt: timestamp("escalated_at", { withTimezone: true }),
  escalatedTo: text("escalated_to").array(), // User IDs or groups

  // Alert configuration reference
  ruleId: uuid("rule_id"), // Reference to the alert rule that triggered this
  ruleVersion: text("rule_version"),

  // Performance and metadata
  detectionLatency: integer("detection_latency_ms"), // Time from data to alert
  processingTime: integer("processing_time_ms"), // Alert processing time

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table: any) => ({
  fundAlertIdx: index("performance_alerts_fund_idx")['on'](table.fundId, table.triggeredAt.desc()),
  severityIdx: index("performance_alerts_severity_idx")['on'](table.severity, table.status, table.triggeredAt.desc()),
  statusIdx: index("performance_alerts_status_idx")['on'](table.status, table.triggeredAt.desc()),
  metricIdx: index("performance_alerts_metric_idx")['on'](table.metricName, table.triggeredAt.desc()),
  baselineIdx: index("performance_alerts_baseline_idx")['on'](table.baselineId, table.triggeredAt.desc()),
  reportIdx: index("performance_alerts_report_idx")['on'](table.varianceReportId),
  escalationIdx: index("performance_alerts_escalation_idx")['on'](table.escalationLevel, table.escalatedAt.desc()),
}));

// Alert Rules - Configuration for automated alert generation
export const alertRules = pgTable("alert_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").references(() => funds.id),

  // Rule identification
  name: text("name").notNull(),
  description: text("description"),
  ruleType: text("rule_type").notNull(), // 'threshold', 'trend', 'deviation', 'pattern'

  // Rule configuration
  metricName: text("metric_name").notNull(), // Which metric to monitor
  operator: text("operator").notNull(), // 'gt', 'lt', 'eq', 'gte', 'lte', 'between'
  thresholdValue: decimal("threshold_value", { precision: 15, scale: 4 }),
  secondaryThreshold: decimal("secondary_threshold", { precision: 15, scale: 4 }), // For 'between' operator

  // Alert settings
  severity: text("severity").notNull().default("warning"),
  category: text("category").notNull().default("performance"),
  isEnabled: boolean("is_enabled").default(true),

  // Frequency and timing
  checkFrequency: text("check_frequency").notNull().default("daily"), // 'realtime', 'hourly', 'daily', 'weekly'
  suppressionPeriod: integer("suppression_period_minutes").default(60), // Prevent alert spam

  // Escalation configuration
  escalationRules: jsonb("escalation_rules"), // Complex escalation logic
  notificationChannels: text("notification_channels").array().default(["email"]), // 'email', 'slack', 'webhook'

  // Rule conditions and filters
  conditions: jsonb("conditions"), // Complex conditions logic
  filters: jsonb("filters"), // Data filtering criteria

  // User management
  createdBy: integer("created_by").references(() => users.id).notNull(),
  lastModifiedBy: integer("last_modified_by").references(() => users.id),

  // Audit and versioning
  version: text("version").notNull().default("1.0.0"),
  lastTriggered: timestamp("last_triggered", { withTimezone: true }),
  triggerCount: integer("trigger_count").default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table: any) => ({
  fundRuleIdx: index("alert_rules_fund_idx")['on'](table.fundId, table.isEnabled),
  metricIdx: index("alert_rules_metric_idx")['on'](table.metricName, table.isEnabled),
  enabledIdx: index("alert_rules_enabled_idx")['on'](table.isEnabled, table.checkFrequency),
  lastTriggeredIdx: index("alert_rules_last_triggered_idx")['on'](table.lastTriggered.desc()),
}));

// Time-Travel Analytics Insert Schemas
export const insertFundStateSnapshotSchema = createInsertSchema(fundStateSnapshots).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertSnapshotMetadataSchema = createInsertSchema(snapshotMetadata).omit({
  id: true,
  createdAt: true
});

export const insertRestorationHistorySchema = createInsertSchema(restorationHistory).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertSnapshotComparisonSchema = createInsertSchema(snapshotComparisons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUsed: true
});

// Variance Tracking Insert Schemas
export const insertFundBaselineSchema = createInsertSchema(fundBaselines).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertVarianceReportSchema = createInsertSchema(varianceReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertPerformanceAlertSchema = createInsertSchema(performanceAlerts).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertAlertRuleSchema = createInsertSchema(alertRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Variance Tracking Type Exports
export type FundBaseline = typeof fundBaselines.$inferSelect;
export type InsertFundBaseline = typeof fundBaselines.$inferInsert;
export type VarianceReport = typeof varianceReports.$inferSelect;
export type InsertVarianceReport = typeof varianceReports.$inferInsert;
export type PerformanceAlert = typeof performanceAlerts.$inferSelect;
export type InsertPerformanceAlert = typeof performanceAlerts.$inferInsert;
export type AlertRule = typeof alertRules.$inferSelect;
export type InsertAlertRule = typeof alertRules.$inferInsert;

// ============================================================================
// PORTFOLIO CONSTRUCTION MODELING SCHEMA EXTENSIONS
// Comprehensive portfolio construction modeling for scenario planning
// ============================================================================

// Fund Strategy Models - Forward-looking fund construction with allocation strategies
export const fundStrategyModels = pgTable("fund_strategy_models", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").notNull().references(() => funds.id),

  // Model identification
  name: text("name").notNull(),
  description: text("description"),
  modelType: text("model_type").notNull(), // 'strategic', 'tactical', 'opportunistic', 'defensive', 'balanced'

  // Strategy parameters
  targetPortfolioSize: integer("target_portfolio_size").notNull().default(25),
  maxPortfolioSize: integer("max_portfolio_size").notNull().default(30),
  targetDeploymentPeriodMonths: integer("target_deployment_period_months").notNull().default(36),

  // Investment allocation strategy
  checkSizeRange: jsonb("check_size_range").notNull(), // {min: 500000, max: 2000000, target: 1000000}
  sectorAllocation: jsonb("sector_allocation").notNull(), // {fintech: 0.3, healthtech: 0.2, ...}
  stageAllocation: jsonb("stage_allocation").notNull(), // {seed: 0.4, seriesA: 0.6}
  geographicAllocation: jsonb("geographic_allocation"), // {us: 0.8, europe: 0.2}

  // Reserve strategy
  initialReservePercentage: decimal("initial_reserve_percentage", { precision: 5, scale: 4 }).notNull().default("0.50"),
  followOnStrategy: jsonb("follow_on_strategy").notNull(), // Complex follow-on rules
  reserveDeploymentTimeline: jsonb("reserve_deployment_timeline"), // Planned reserve deployment over time

  // Risk parameters
  concentrationLimits: jsonb("concentration_limits").notNull(), // Max % per company, sector, etc.
  diversificationRules: jsonb("diversification_rules"), // Minimum diversification requirements
  riskTolerance: text("risk_tolerance").notNull().default("moderate"), // 'conservative', 'moderate', 'aggressive'

  // Performance targets
  targetIrr: decimal("target_irr", { precision: 5, scale: 4 }), // Target IRR %
  targetMultiple: decimal("target_multiple", { precision: 5, scale: 2 }), // Target multiple of invested capital
  targetDpi: decimal("target_dpi", { precision: 5, scale: 2 }), // Target DPI
  targetPortfolioBeta: decimal("target_portfolio_beta", { precision: 5, scale: 2 }), // Portfolio risk relative to market

  // Model metadata
  modelVersion: text("model_version").notNull().default("1.0.0"),
  isActive: boolean("is_active").default(true),
  isTemplate: boolean("is_template").default(false), // Can be used as template for other funds
  confidenceLevel: decimal("confidence_level", { precision: 3, scale: 2 }).default("0.75"), // 0.00-1.00

  // Scenario planning
  marketAssumptions: jsonb("market_assumptions"), // Economic/market assumptions
  validationCriteria: jsonb("validation_criteria"), // Criteria for model validation
  stressTestScenarios: jsonb("stress_test_scenarios"), // Stress testing parameters

  // User context
  createdBy: integer("created_by").notNull().references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  tags: text("tags").array().default([]),

  // Timestamps
  effectiveDate: timestamp("effective_date", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table: any) => ({
  fundIdx: index("fund_strategy_models_fund_idx")['on'](table.fundId, table.createdAt.desc()),
  typeIdx: index("fund_strategy_models_type_idx")['on'](table.modelType, table.isActive),
  activeIdx: index("fund_strategy_models_active_idx")['on'](table.isActive, table.effectiveDate.desc()),
  templateIdx: index("fund_strategy_models_template_idx")['on'](table.isTemplate, table.isActive),
  tagsGinIdx: index("fund_strategy_models_tags_gin_idx").using("gin", table.tags),
  activeUnique: unique("fund_strategy_models_active_unique")['on'](table.fundId),
}));

// Portfolio Construction Scenarios - Multiple "what-if" scenarios for fund building
export const portfolioScenarios = pgTable("portfolio_scenarios", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").notNull().references(() => funds.id),
  strategyModelId: uuid("strategy_model_id").notNull().references(() => fundStrategyModels.id),

  // Scenario identification
  name: text("name").notNull(),
  description: text("description"),
  scenarioType: text("scenario_type").notNull(), // 'base_case', 'optimistic', 'pessimistic', 'stress_test', 'custom'

  // Scenario parameters
  marketEnvironment: text("market_environment").notNull().default("normal"), // 'bull', 'normal', 'bear', 'recession'
  dealFlowAssumption: decimal("deal_flow_assumption", { precision: 5, scale: 2 }).notNull().default("1.00"), // Multiplier vs normal deal flow
  valuationEnvironment: decimal("valuation_environment", { precision: 5, scale: 2 }).notNull().default("1.00"), // Valuation multiplier vs normal
  exitEnvironment: decimal("exit_environment", { precision: 5, scale: 2 }).notNull().default("1.00"), // Exit opportunity multiplier

  // Portfolio construction parameters
  plannedInvestments: jsonb("planned_investments").notNull(), // Array of planned investment details
  deploymentSchedule: jsonb("deployment_schedule").notNull(), // Timeline of when investments are made
  followOnAssumptions: jsonb("follow_on_assumptions"), // Follow-on investment assumptions

  // Performance projections
  projectedFundMetrics: jsonb("projected_fund_metrics").notNull(), // Expected fund-level metrics
  projectedPortfolioOutcomes: jsonb("projected_portfolio_outcomes"), // Company-level outcome projections
  monteCarloResults: jsonb("monte_carlo_results"), // Statistical simulation results

  // Risk analysis
  riskFactors: jsonb("risk_factors"), // Identified risk factors and mitigations
  sensitivityAnalysis: jsonb("sensitivity_analysis"), // Sensitivity to key variables
  correlationAssumptions: jsonb("correlation_assumptions"), // Cross-portfolio correlations

  // Comparison and benchmarking
  baselineScenarioId: uuid("baseline_scenario_id"), // What this is compared against
  varianceFromBaseline: jsonb("variance_from_baseline"), // Key differences from baseline
  benchmarkComparison: jsonb("benchmark_comparison"), // Comparison to industry benchmarks

  // Simulation metadata
  simulationEngine: text("simulation_engine").notNull().default("monte-carlo-v1"),
  simulationRuns: integer("simulation_runs").default(10000),
  simulationDurationMs: integer("simulation_duration_ms"),
  lastSimulationAt: timestamp("last_simulation_at", { withTimezone: true }),

  // Status and workflow
  status: text("status").notNull().default("draft"), // 'draft', 'modeling', 'complete', 'approved', 'archived'
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }), // Overall confidence in scenario
  validationResults: jsonb("validation_results"), // Validation check results

  // User context
  createdBy: integer("created_by").notNull().references(() => users.id),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),

  // Sharing and collaboration
  isShared: boolean("is_shared").default(false),
  sharedWith: text("shared_with").array().default([]), // User IDs with access

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table: any) => ({
  fundIdx: index("portfolio_scenarios_fund_idx")['on'](table.fundId, table.createdAt.desc()),
  strategyIdx: index("portfolio_scenarios_strategy_idx")['on'](table.strategyModelId, table.status),
  typeIdx: index("portfolio_scenarios_type_idx")['on'](table.scenarioType, table.status),
  statusIdx: index("portfolio_scenarios_status_idx")['on'](table.status, table.updatedAt.desc()),
  sharedIdx: index("portfolio_scenarios_shared_idx")['on'](table.isShared, table.createdAt.desc()),
  baselineIdx: index("portfolio_scenarios_baseline_idx")['on'](table.baselineScenarioId),
}));

// Reserve Allocation Strategies - Dynamic reserve deployment strategies with optimization data
export const reserveAllocationStrategies = pgTable("reserve_allocation_strategies", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").notNull().references(() => funds.id),
  scenarioId: uuid("scenario_id").references(() => portfolioScenarios.id),

  // Strategy identification
  name: text("name").notNull(),
  description: text("description"),
  strategyType: text("strategy_type").notNull(), // 'proportional', 'milestone_based', 'performance_based', 'opportunistic', 'hybrid'

  // Allocation rules
  allocationRules: jsonb("allocation_rules").notNull(), // Complex rules for reserve allocation
  triggerConditions: jsonb("trigger_conditions").notNull(), // When to deploy reserves
  companyScoringCriteria: jsonb("company_scoring_criteria"), // How to score companies for reserves

  // Reserve pools and tranches
  totalReserveAmount: decimal("total_reserve_amount", { precision: 15, scale: 2 }).notNull(),
  reserveTranches: jsonb("reserve_tranches").notNull(), // {tranche1: {amount: 5000000, criteria: {...}}}
  emergencyReservePct: decimal("emergency_reserve_pct", { precision: 5, scale: 4 }).default("0.10"), // Emergency reserve %

  // Deployment parameters
  maxPerCompanyPct: decimal("max_per_company_pct", { precision: 5, scale: 4 }).notNull().default("0.20"), // Max % of reserves per company
  minDeploymentAmount: decimal("min_deployment_amount", { precision: 15, scale: 2 }).default("100000"),
  maxDeploymentAmount: decimal("max_deployment_amount", { precision: 15, scale: 2 }),

  // Performance tracking
  performanceThresholds: jsonb("performance_thresholds"), // Performance gates for reserve deployment
  milestoneTracking: jsonb("milestone_tracking"), // Milestone-based deployment tracking
  riskAdjustedScoring: jsonb("risk_adjusted_scoring"), // Risk-adjusted allocation criteria

  // Optimization parameters
  optimizationObjective: text("optimization_objective").notNull().default("risk_adjusted_return"), // 'irr_maximization', 'risk_minimization', 'risk_adjusted_return', 'portfolio_balance'
  optimizationConstraints: jsonb("optimization_constraints"), // Mathematical constraints for optimization
  rebalancingFrequency: text("rebalancing_frequency").default("quarterly"), // 'monthly', 'quarterly', 'semi_annual', 'annual'

  // Simulation and modeling
  monteCarloIterations: integer("monte_carlo_iterations").default(5000),
  scenarioWeights: jsonb("scenario_weights"), // Probability weights for different scenarios
  sensitivityParameters: jsonb("sensitivity_parameters"), // Variables for sensitivity analysis

  // Strategy effectiveness
  backtestResults: jsonb("backtest_results"), // Historical backtesting results
  performanceAttribution: jsonb("performance_attribution"), // Performance attribution analysis
  benchmarkComparison: jsonb("benchmark_comparison"), // Comparison to benchmark strategies

  // Decision support
  recommendationEngine: jsonb("recommendation_engine"), // AI/ML recommendations
  decisionHistory: jsonb("decision_history"), // History of reserve allocation decisions
  overrideReasons: jsonb("override_reasons"), // Reasons for manual overrides

  // Status and metadata
  isActive: boolean("is_active").default(true),
  lastOptimizedAt: timestamp("last_optimized_at", { withTimezone: true }),
  optimizationFrequencyDays: integer("optimization_frequency_days").default(30),

  // User context
  createdBy: integer("created_by").notNull().references(() => users.id),
  lastModifiedBy: integer("last_modified_by").references(() => users.id),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table: any) => ({
  fundIdx: index("reserve_allocation_strategies_fund_idx")['on'](table.fundId, table.createdAt.desc()),
  scenarioIdx: index("reserve_allocation_strategies_scenario_idx")['on'](table.scenarioId, table.isActive),
  typeIdx: index("reserve_allocation_strategies_type_idx")['on'](table.strategyType, table.isActive),
  activeIdx: index("reserve_allocation_strategies_active_idx")['on'](table.isActive, table.lastOptimizedAt.desc()),
  optimizationIdx: index("reserve_allocation_strategies_optimization_idx")['on'](table.optimizationObjective, table.isActive),
}));

// Performance Forecasts - Predictive models linking to variance tracking
export const performanceForecasts = pgTable("performance_forecasts", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").notNull().references(() => funds.id),
  scenarioId: uuid("scenario_id").references(() => portfolioScenarios.id),
  baselineId: uuid("baseline_id").references(() => fundBaselines.id), // Link to variance tracking

  // Forecast identification
  forecastName: text("forecast_name").notNull(),
  forecastType: text("forecast_type").notNull(), // 'fund_level', 'portfolio_level', 'company_level', 'sector_level'
  forecastHorizonYears: integer("forecast_horizon_years").notNull().default(10),

  // Time series forecasting
  forecastPeriods: jsonb("forecast_periods").notNull(), // Quarterly/annual forecast data
  confidenceIntervals: jsonb("confidence_intervals"), // Statistical confidence intervals
  predictionVariance: jsonb("prediction_variance"), // Variance estimates for predictions

  // Fund-level forecasts
  irrForecast: jsonb("irr_forecast"), // IRR projections over time
  multipleForecast: jsonb("multiple_forecast"), // Multiple projections
  tvpiForecast: jsonb("tvpi_forecast"), // TVPI progression
  dpiForecast: jsonb("dpi_forecast"), // DPI progression
  navForecast: jsonb("nav_forecast"), // NAV evolution

  // Portfolio forecasts
  companyLevelForecasts: jsonb("company_level_forecasts"), // Individual company projections
  sectorPerformanceForecasts: jsonb("sector_performance_forecasts"), // Sector-level performance
  stagePerformanceForecasts: jsonb("stage_performance_forecasts"), // Stage-level performance
  correlationMatrix: jsonb("correlation_matrix"), // Portfolio correlation assumptions

  // Economic scenario modeling
  baseCaseForecast: jsonb("base_case_forecast"), // Base case economic scenario
  stressScenarios: jsonb("stress_scenarios"), // Economic stress test scenarios
  macroSensitivity: jsonb("macro_sensitivity"), // Sensitivity to macro factors

  // Forecast methodology
  methodology: text("methodology").notNull(), // 'historical_extrapolation', 'monte_carlo', 'machine_learning', 'hybrid', 'expert_judgment'
  modelParameters: jsonb("model_parameters"), // Parameters used in forecasting model
  dataSources: jsonb("data_sources"), // Sources of data for forecasting
  assumptions: jsonb("assumptions"), // Key assumptions underlying forecast

  // Model performance
  accuracyMetrics: jsonb("accuracy_metrics"), // Historical accuracy of model
  calibrationResults: jsonb("calibration_results"), // Model calibration statistics
  validationResults: jsonb("validation_results"), // Out-of-sample validation
  modelVersion: text("model_version").notNull().default("1.0.0"),

  // Comparison to actuals (for learning)
  actualVsForecast: jsonb("actual_vs_forecast"), // Comparison when actuals become available
  forecastErrors: jsonb("forecast_errors"), // Systematic forecast errors
  modelDriftMetrics: jsonb("model_drift_metrics"), // Model performance drift over time

  // Risk and uncertainty
  uncertaintyQuantification: jsonb("uncertainty_quantification"), // Model uncertainty estimates
  riskFactors: jsonb("risk_factors"), // Key risk factors affecting forecast
  scenarioProbabilities: jsonb("scenario_probabilities"), // Probability weights for scenarios

  // Forecast updates and versioning
  parentForecastId: uuid("parent_forecast_id"),
  updateReason: text("update_reason"), // Why forecast was updated
  updateFrequencyDays: integer("update_frequency_days").default(90),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }),

  // User context and workflow
  createdBy: integer("created_by").notNull().references(() => users.id),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  status: text("status").notNull().default("draft"), // 'draft', 'modeling', 'review', 'approved', 'archived'

  // Quality and governance
  qualityScore: decimal("quality_score", { precision: 3, scale: 2 }), // Overall forecast quality score
  peerReviewScores: jsonb("peer_review_scores"), // Peer review feedback
  governanceNotes: text("governance_notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table: any) => ({
  fundIdx: index("performance_forecasts_fund_idx")['on'](table.fundId, table.createdAt.desc()),
  scenarioIdx: index("performance_forecasts_scenario_idx")['on'](table.scenarioId, table.status),
  baselineIdx: index("performance_forecasts_baseline_idx")['on'](table.baselineId, table.createdAt.desc()),
  typeIdx: index("performance_forecasts_type_idx")['on'](table.forecastType, table.status),
  methodologyIdx: index("performance_forecasts_methodology_idx")['on'](table.methodology, table.modelVersion),
  horizonIdx: index("performance_forecasts_horizon_idx")['on'](table.forecastHorizonYears, table.status),
}));

// Scenario Comparisons - Comparing different portfolio construction approaches
export const scenarioComparisons = pgTable("scenario_comparisons", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").notNull().references(() => funds.id),

  // Comparison identification
  comparisonName: text("comparison_name").notNull(),
  description: text("description"),
  comparisonType: text("comparison_type").notNull(), // 'strategy_comparison', 'scenario_analysis', 'sensitivity_test', 'optimization_study'

  // Scenarios being compared
  baseScenarioId: uuid("base_scenario_id").notNull().references(() => portfolioScenarios.id),
  comparisonScenarios: jsonb("comparison_scenarios").notNull(), // Array of scenario IDs with metadata

  // Comparison dimensions
  comparisonMetrics: jsonb("comparison_metrics").notNull(), // Which metrics to compare
  weightScheme: jsonb("weight_scheme"), // Relative importance of different metrics
  normalizationMethod: text("normalization_method").default("z_score"), // 'raw', 'percentage', 'z_score', 'ranking'

  // Comparison results
  metricComparisons: jsonb("metric_comparisons").notNull(), // Detailed metric-by-metric comparison
  rankingResults: jsonb("ranking_results"), // Scenario rankings by different criteria
  paretoAnalysis: jsonb("pareto_analysis"), // Pareto frontier analysis
  tradeOffAnalysis: jsonb("trade_off_analysis"), // Risk-return trade-off analysis

  // Statistical analysis
  significanceTests: jsonb("significance_tests"), // Statistical significance of differences
  confidenceIntervals: jsonb("confidence_intervals"), // Confidence intervals for differences
  correlationAnalysis: jsonb("correlation_analysis"), // Correlation between scenarios
  varianceDecomposition: jsonb("variance_decomposition"), // Sources of variance between scenarios

  // Decision support
  recommendationSummary: text("recommendation_summary"), // Summary recommendations
  keyInsights: jsonb("key_insights"), // Key insights from comparison
  decisionCriteria: jsonb("decision_criteria"), // Criteria for choosing between scenarios
  riskConsiderations: jsonb("risk_considerations"), // Risk factors to consider

  // Sensitivity analysis
  sensitivityResults: jsonb("sensitivity_results"), // How robust are the comparisons
  parameterImportance: jsonb("parameter_importance"), // Which parameters drive differences
  thresholdAnalysis: jsonb("threshold_analysis"), // At what thresholds do preferences change

  // Visualization data
  chartConfigurations: jsonb("chart_configurations"), // Chart configs for visualization
  dashboardLayout: jsonb("dashboard_layout"), // Dashboard layout preferences
  exportFormats: jsonb("export_formats"), // Preferred export formats

  // Comparison metadata
  comparisonEngine: text("comparison_engine").notNull().default("scenario-compare-v1"),
  computationTimeMs: integer("computation_time_ms"),
  dataFreshnessHours: integer("data_freshness_hours"), // How old is the underlying data

  // User interaction
  userPreferences: jsonb("user_preferences"), // User-specific comparison preferences
  bookmarkSettings: jsonb("bookmark_settings"), // User bookmarks and favorites
  sharingSettings: jsonb("sharing_settings"), // How comparison is shared

  // Status and workflow
  status: text("status").notNull().default("computing"), // 'computing', 'ready', 'stale', 'error'
  errorDetails: jsonb("error_details"), // Error information if status is error
  cacheExpiresAt: timestamp("cache_expires_at", { withTimezone: true }), // When cached results expire

  // User context
  createdBy: integer("created_by").notNull().references(() => users.id),
  sharedWith: text("shared_with").array().default([]),
  isPublic: boolean("is_public").default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  lastAccessed: timestamp("last_accessed", { withTimezone: true }).defaultNow(),
}, (table: any) => ({
  fundIdx: index("scenario_comparisons_fund_idx")['on'](table.fundId, table.createdAt.desc()),
  baseIdx: index("scenario_comparisons_base_idx")['on'](table.baseScenarioId, table.status),
  typeIdx: index("scenario_comparisons_type_idx")['on'](table.comparisonType, table.status),
  statusIdx: index("scenario_comparisons_status_idx")['on'](table.status, table.lastAccessed.desc()),
  publicIdx: index("scenario_comparisons_public_idx")['on'](table.isPublic, table.createdAt.desc()),
}));

// Monte Carlo Simulation Results - Detailed simulation results for scenario modeling
export const monteCarloSimulations = pgTable("monte_carlo_simulations", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").notNull().references(() => funds.id),
  scenarioId: uuid("scenario_id").references(() => portfolioScenarios.id),
  forecastId: uuid("forecast_id").references(() => performanceForecasts.id),

  // Simulation identification
  simulationName: text("simulation_name").notNull(),
  simulationType: text("simulation_type").notNull(), // 'portfolio_construction', 'performance_forecast', 'risk_analysis', 'optimization'

  // Simulation parameters
  numberOfRuns: integer("number_of_runs").notNull().default(10000),
  randomSeed: integer("random_seed"), // For reproducibility
  simulationEngine: text("simulation_engine").notNull().default("monte-carlo-v2"),

  // Input parameters
  inputDistributions: jsonb("input_distributions").notNull(), // Probability distributions for inputs
  correlationMatrix: jsonb("correlation_matrix"), // Input correlations
  scenarioWeights: jsonb("scenario_weights"), // Probability weights for scenarios
  constraints: jsonb("constraints"), // Simulation constraints

  // Output results
  summaryStatistics: jsonb("summary_statistics").notNull(), // Mean, std, percentiles, etc.
  percentileResults: jsonb("percentile_results").notNull(), // Key percentiles (5th, 25th, 50th, 75th, 95th)
  distributionData: jsonb("distribution_data"), // Full distribution data (if stored)
  confidenceIntervals: jsonb("confidence_intervals"), // Confidence intervals for key metrics

  // Risk metrics
  varCalculations: jsonb("var_calculations"), // Value at Risk calculations
  cvarCalculations: jsonb("cvar_calculations"), // Conditional VaR calculations
  downsideRisk: jsonb("downside_risk"), // Downside risk metrics
  tailRiskAnalysis: jsonb("tail_risk_analysis"), // Tail risk analysis

  // Convergence and quality
  convergenceMetrics: jsonb("convergence_metrics"), // Simulation convergence statistics
  qualityMetrics: jsonb("quality_metrics"), // Quality of simulation results
  stabilityAnalysis: jsonb("stability_analysis"), // Result stability across runs

  // Performance attribution
  factorContributions: jsonb("factor_contributions"), // Contribution of different factors
  sensitivityIndices: jsonb("sensitivity_indices"), // Sobol indices or similar
  interactionEffects: jsonb("interaction_effects"), // Factor interaction effects

  // Simulation metadata
  computationTimeMs: integer("computation_time_ms"),
  memoryUsageMb: integer("memory_usage_mb"),
  cpuCoresUsed: integer("cpu_cores_used"),
  simulationDate: timestamp("simulation_date", { withTimezone: true }).notNull().defaultNow(),

  // Results storage
  detailedResultsPath: text("detailed_results_path"), // Path to detailed results file
  resultsCompressed: boolean("results_compressed").default(false),
  resultsFormat: text("results_format").default("json"), // 'json', 'parquet', 'csv'

  // Validation
  validationTests: jsonb("validation_tests"), // Statistical validation tests
  benchmarkComparison: jsonb("benchmark_comparison"), // Comparison to benchmark results
  historicalValidation: jsonb("historical_validation"), // Validation against historical data

  // User context
  createdBy: integer("created_by").notNull().references(() => users.id),
  tags: text("tags").array().default([]),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // When to cleanup detailed results
}, (table: any) => ({
  fundIdx: index("monte_carlo_simulations_fund_idx")['on'](table.fundId, table.simulationDate.desc()),
  scenarioIdx: index("monte_carlo_simulations_scenario_idx")['on'](table.scenarioId, table.simulationDate.desc()),
  forecastIdx: index("monte_carlo_simulations_forecast_idx")['on'](table.forecastId, table.simulationDate.desc()),
  typeIdx: index("monte_carlo_simulations_type_idx")['on'](table.simulationType, table.simulationDate.desc()),
  expiryIdx: index("monte_carlo_simulations_expiry_idx")['on'](table.expiresAt),
  tagsGinIdx: index("monte_carlo_simulations_tags_gin_idx").using("gin", table.tags),
}));

// ============================================================================
// INSERT SCHEMAS FOR PORTFOLIO CONSTRUCTION MODELING
// ============================================================================

export const insertFundStrategyModelSchema = createInsertSchema(fundStrategyModels).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertPortfolioScenarioSchema = createInsertSchema(portfolioScenarios).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertReserveAllocationStrategySchema = createInsertSchema(reserveAllocationStrategies).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertPerformanceForecastSchema = createInsertSchema(performanceForecasts).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertScenarioComparisonSchema = createInsertSchema(scenarioComparisons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastAccessed: true
});

export const insertMonteCarloSimulationSchema = createInsertSchema(monteCarloSimulations).omit({
  id: true,
  createdAt: true
});

// ============================================================================
// TYPE EXPORTS FOR PORTFOLIO CONSTRUCTION MODELING
// ============================================================================

export type FundStrategyModel = typeof fundStrategyModels.$inferSelect;
export type InsertFundStrategyModel = typeof fundStrategyModels.$inferInsert;
export type PortfolioScenario = typeof portfolioScenarios.$inferSelect;
export type InsertPortfolioScenario = typeof portfolioScenarios.$inferInsert;
export type ReserveAllocationStrategy = typeof reserveAllocationStrategies.$inferSelect;
export type InsertReserveAllocationStrategy = typeof reserveAllocationStrategies.$inferInsert;
export type PerformanceForecast = typeof performanceForecasts.$inferSelect;
export type InsertPerformanceForecast = typeof performanceForecasts.$inferInsert;
export type ScenarioComparison = typeof scenarioComparisons.$inferSelect;
export type InsertScenarioComparison = typeof scenarioComparisons.$inferInsert;
export type MonteCarloSimulation = typeof monteCarloSimulations.$inferSelect;
export type InsertMonteCarloSimulation = typeof monteCarloSimulations.$inferInsert;

// ============================================================================
// TYPE EXPORTS FOR SCENARIO ANALYSIS
// ============================================================================

export type Scenario = typeof scenarios.$inferSelect;
export type InsertScenario = typeof scenarios.$inferInsert;
export type ScenarioCase = typeof scenarioCases.$inferSelect;
export type InsertScenarioCase = typeof scenarioCases.$inferInsert;
export type ScenarioAuditLog = typeof scenarioAuditLogs.$inferSelect;
export type InsertScenarioAuditLog = typeof scenarioAuditLogs.$inferInsert;

// ============================================================================
// FUND ALLOCATION MANAGEMENT (Phase 1b)
// ============================================================================

// Reallocation audit trail for tracking allocation changes
export const reallocationAudit = pgTable("reallocation_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  fundId: integer("fund_id").notNull().references(() => funds.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id),
  baselineVersion: integer("baseline_version").notNull(),
  newVersion: integer("new_version").notNull(),
  changesJson: jsonb("changes_json").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table: any) => ({
  fundIdx: index("idx_reallocation_audit_fund")['on'](table.fundId, table.createdAt.desc()),
  userIdx: index("idx_reallocation_audit_user")['on'](table.userId, table.createdAt.desc()),
  versionsIdx: index("idx_reallocation_audit_versions")['on'](table.fundId, table.baselineVersion, table.newVersion),
  changesGinIdx: index("idx_reallocation_audit_changes_gin").using("gin", table.changesJson),
}));

export const insertReallocationAuditSchema = createInsertSchema(reallocationAudit).omit({
  id: true,
  createdAt: true
});

export type ReallocationAudit = typeof reallocationAudit.$inferSelect;
export type InsertReallocationAudit = typeof reallocationAudit.$inferInsert;

// ============================================================================
// NOTION INTEGRATION TABLES
// ============================================================================

// Notion workspace connections - stores OAuth tokens and workspace info
export const notionConnections = pgTable("notion_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: text("workspace_id").notNull().unique(),
  workspaceName: text("workspace_name").notNull(),
  accessToken: text("access_token").notNull(), // Encrypted
  tokenType: text("token_type").notNull().default("bearer"),
  botId: text("bot_id"),
  ownerType: text("owner_type"), // 'user' or 'workspace'
  ownerId: text("owner_id"),
  duplicatedTemplateId: text("duplicated_template_id"),
  status: text("status").notNull().default("active"), // 'active', 'revoked', 'expired'
  scopes: jsonb("scopes").$type<string[]>(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table: any) => ({
  workspaceIdx: index("idx_notion_connections_workspace")['on'](table.workspaceId),
  statusIdx: index("idx_notion_connections_status")['on'](table.status),
}));

// Notion sync jobs - tracks data synchronization operations
export const notionSyncJobs = pgTable("notion_sync_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id").references(() => notionConnections.id).notNull(),
  fundId: integer("fund_id").references(() => funds.id),
  syncType: text("sync_type").notNull(), // 'full', 'incremental', 'manual'
  direction: text("direction").notNull().default("inbound"), // 'inbound', 'outbound', 'bidirectional'
  status: text("status").notNull().default("pending"), // 'pending', 'running', 'completed', 'failed'
  progress: integer("progress").default(0), // 0-100
  itemsProcessed: integer("items_processed").default(0),
  itemsCreated: integer("items_created").default(0),
  itemsUpdated: integer("items_updated").default(0),
  itemsFailed: integer("items_failed").default(0),
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table: any) => ({
  connectionIdx: index("idx_notion_sync_jobs_connection")['on'](table.connectionId),
  statusIdx: index("idx_notion_sync_jobs_status")['on'](table.status),
  fundIdx: index("idx_notion_sync_jobs_fund")['on'](table.fundId),
}));

// Notion portfolio company configurations - integration settings per company
export const notionPortfolioConfigs = pgTable("notion_portfolio_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: integer("company_id").references(() => portfolioCompanies.id).notNull(),
  companyName: text("company_name").notNull(),
  connectionId: uuid("connection_id").references(() => notionConnections.id),
  integrationStatus: text("integration_status").notNull().default("pending_approval"), // 'pending_approval', 'active', 'suspended', 'disconnected'
  sharedDatabases: jsonb("shared_databases").$type<Array<{
    databaseId: string;
    databaseName: string;
    purpose: string;
    accessLevel: string;
  }>>(),
  automationRules: jsonb("automation_rules").$type<Array<{
    id: string;
    trigger: string;
    action: string;
    isActive: boolean;
  }>>(),
  communicationSettings: jsonb("communication_settings").$type<{
    allowNotifications: boolean;
    notificationChannels: string[];
    reportingSchedule: string;
  }>(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table: any) => ({
  companyIdx: index("idx_notion_portfolio_configs_company")['on'](table.companyId),
  connectionIdx: index("idx_notion_portfolio_configs_connection")['on'](table.connectionId),
  statusIdx: index("idx_notion_portfolio_configs_status")['on'](table.integrationStatus),
}));

// Notion database mappings - field-level mapping configuration
export const notionDatabaseMappings = pgTable("notion_database_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id").references(() => notionConnections.id).notNull(),
  notionDatabaseId: text("notion_database_id").notNull(),
  notionDatabaseName: text("notion_database_name"),
  mappingType: text("mapping_type").notNull(), // 'portfolio_company', 'investment', 'kpi', 'board_report'
  fieldMappings: jsonb("field_mappings").$type<Array<{
    notionField: string;
    localField: string;
    transform?: string;
  }>>(),
  syncEnabled: boolean("sync_enabled").default(true),
  syncDirection: text("sync_direction").default("inbound"), // 'inbound', 'outbound', 'bidirectional'
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table: any) => ({
  connectionIdx: index("idx_notion_database_mappings_connection")['on'](table.connectionId),
  databaseIdx: index("idx_notion_database_mappings_database")['on'](table.notionDatabaseId),
  typeIdx: index("idx_notion_database_mappings_type")['on'](table.mappingType),
}));

// Insert schemas for Notion tables
export const insertNotionConnectionSchema = createInsertSchema(notionConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertNotionSyncJobSchema = createInsertSchema(notionSyncJobs).omit({
  id: true,
  createdAt: true
});

export const insertNotionPortfolioConfigSchema = createInsertSchema(notionPortfolioConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertNotionDatabaseMappingSchema = createInsertSchema(notionDatabaseMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Type exports for Notion tables
export type NotionConnection = typeof notionConnections.$inferSelect;
export type InsertNotionConnection = typeof notionConnections.$inferInsert;
export type NotionSyncJob = typeof notionSyncJobs.$inferSelect;
export type InsertNotionSyncJob = typeof notionSyncJobs.$inferInsert;
export type NotionPortfolioConfig = typeof notionPortfolioConfigs.$inferSelect;
export type InsertNotionPortfolioConfig = typeof notionPortfolioConfigs.$inferInsert;
export type NotionDatabaseMapping = typeof notionDatabaseMappings.$inferSelect;
export type InsertNotionDatabaseMapping = typeof notionDatabaseMappings.$inferInsert;

// ============================================================================
// SCENARIO COMPARISON TOOL TABLES
// ============================================================================

/**
 * Saved comparison configurations for reuse
 * Allows users to save "templates" for comparison layouts (2-6 scenarios)
 */
export const comparisonConfigurations = pgTable("comparison_configurations", {
  id: uuid("id").defaultRandom().primaryKey(),
  fundId: integer("fund_id").notNull().references(() => funds.id),

  // Configuration identity
  configName: text("config_name").notNull(),
  description: text("description"),

  // Scenario selection (2-6 scenarios, mix of deal + portfolio)
  scenarioIds: text("scenario_ids").array().notNull(),
  scenarioTypes: jsonb("scenario_types").notNull(), // {"uuid1": "deal", "uuid2": "portfolio", ...}

  // Display preferences
  displayLayout: text("display_layout").notNull().default("side_by_side"), // 'side_by_side', 'stacked', 'grid'
  metricsToCompare: text("metrics_to_compare").array().notNull(),
  sortOrder: text("sort_order").default("tvpi_desc"),

  // Delta visualization preferences
  showDeltas: boolean("show_deltas").default(true),
  deltaMode: text("delta_mode").default("percentage"), // 'absolute', 'percentage', 'both'
  baselineScenarioId: uuid("baseline_scenario_id"),
  highlightThreshold: decimal("highlight_threshold", { precision: 5, scale: 4 }).default("0.1"), // 10%

  // Color coding preferences
  colorScheme: text("color_scheme").default("traffic_light"), // 'traffic_light', 'heatmap', 'grayscale'
  betterWorseIndicators: boolean("better_worse_indicators").default(true),

  // Usage tracking
  useCount: integer("use_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),

  // Sharing and permissions
  isPublic: boolean("is_public").default(false),
  createdBy: integer("created_by").notNull().references(() => users.id),
  sharedWith: text("shared_with").array().default([]),

  // Versioning for optimistic locking
  version: integer("version").notNull().default(1),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table: any) => ({
  fundCreatorIdx: index("comparison_configs_fund_creator_idx")['on'](
    table.fundId,
    table.createdBy,
    table.lastUsedAt.desc()
  ),
  publicIdx: index("comparison_configs_public_idx")['on'](
    table.isPublic,
    table.useCount.desc()
  ),
  usageIdx: index("comparison_configs_usage_idx")['on'](
    table.useCount.desc(),
    table.lastUsedAt.desc()
  ),
  nameSearchIdx: index("comparison_configs_name_search_idx")['on'](
    table.fundId,
    table.configName
  ),
  uniqueConfigName: unique("comparison_configs_unique_name")['on'](
    table.fundId,
    table.createdBy,
    table.configName
  ),
}));

/**
 * Tracks comparison access patterns for:
 * - User behavior analytics
 * - Cache warming decisions
 * - Popular comparison patterns
 * - Audit trail
 */
export const comparisonAccessHistory = pgTable("comparison_access_history", {
  id: uuid("id").defaultRandom().primaryKey(),

  // What was accessed
  comparisonId: uuid("comparison_id").references(() => scenarioComparisons.id, { onDelete: "cascade" }),
  configurationId: uuid("configuration_id").references(() => comparisonConfigurations.id, { onDelete: "set null" }),
  fundId: integer("fund_id").notNull().references(() => funds.id),

  // Access details
  accessType: text("access_type").notNull(), // 'view', 'refresh', 'export', 'share'
  scenariosCompared: text("scenarios_compared").array().notNull(),
  metricsViewed: text("metrics_viewed").array(),

  // User context
  userId: integer("user_id").references(() => users.id),
  sessionId: text("session_id"),

  // Performance metrics
  loadTimingMs: integer("load_timing_ms"),
  cacheHit: boolean("cache_hit").default(false),
  dataFreshnessHours: integer("data_freshness_hours"),

  // Access metadata
  accessSource: text("access_source").default("web_ui"), // 'web_ui', 'api', 'scheduled_report'
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),

  accessedAt: timestamp("accessed_at", { withTimezone: true }).defaultNow(),
}, (table: any) => ({
  comparisonTimeIdx: index("comparison_access_comparison_time_idx")['on'](
    table.comparisonId,
    table.accessedAt.desc()
  ),
  userFundIdx: index("comparison_access_user_fund_idx")['on'](
    table.userId,
    table.fundId,
    table.accessedAt.desc()
  ),
  fundAccessIdx: index("comparison_access_fund_idx")['on'](
    table.fundId,
    table.accessType,
    table.accessedAt.desc()
  ),
  cacheAnalysisIdx: index("comparison_access_cache_idx")['on'](
    table.cacheHit,
    table.loadTimingMs
  ),
}));

// Insert schemas for comparison tool tables
export const insertComparisonConfigurationSchema = createInsertSchema(comparisonConfigurations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertComparisonAccessHistorySchema = createInsertSchema(comparisonAccessHistory).omit({
  id: true,
  accessedAt: true,
});

// Type exports for comparison tool tables
export type ComparisonConfiguration = typeof comparisonConfigurations.$inferSelect;
export type InsertComparisonConfiguration = typeof comparisonConfigurations.$inferInsert;
export type ComparisonAccessHistory = typeof comparisonAccessHistory.$inferSelect;
export type InsertComparisonAccessHistory = typeof comparisonAccessHistory.$inferInsert;
