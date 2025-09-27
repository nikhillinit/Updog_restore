import { pgTable, text, serial, integer, boolean, decimal, timestamp, jsonb, varchar, index, unique, uuid, date, pgEnum, uniqueIndex, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const funds = pgTable("funds", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  size: decimal("size", { precision: 15, scale: 2 }).notNull(),
  deployedCapital: decimal("deployed_capital", { precision: 15, scale: 2 }).default("0"),
  managementFee: decimal("management_fee", { precision: 5, scale: 4 }).notNull(),
  carryPercentage: decimal("carry_percentage", { precision: 5, scale: 4 }).notNull(),
  vintageYear: integer("vintage_year").notNull(),
  status: text("status").notNull().default("active"),
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
}, (table) => ({
  fundVersionUnique: unique().on(table.fundId, table.version),
  fundVersionIdx: index("fundconfigs_fund_version_idx").on(table.fundId, table.version),
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
}, (table) => ({
  lookupIdx: index("fund_snapshots_lookup_idx").on(table.fundId, table.type, table.createdAt.desc()),
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
}, (table) => ({
  fundEventIdx: index("fund_events_fund_idx").on(table.fundId, table.createdAt.desc()),
}));

export const portfolioCompanies = pgTable("portfoliocompanies", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id),
  name: text("name").notNull(),
  sector: text("sector").notNull(),
  stage: text("stage").notNull(),
  investmentAmount: decimal("investment_amount", { precision: 15, scale: 2 }).notNull(),
  currentValuation: decimal("current_valuation", { precision: 15, scale: 2 }),
  foundedYear: integer("founded_year"),
  status: text("status").notNull().default("active"),
  description: text("description"),
  dealTags: text("deal_tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const fundMetrics = pgTable("fund_metrics", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id),
  metricDate: timestamp("metric_date").notNull(),
  totalValue: decimal("totalvalue", { precision: 15, scale: 2 }).notNull(),
  irr: decimal("irr", { precision: 5, scale: 4 }),
  multiple: decimal("multiple", { precision: 5, scale: 2 }),
  dpi: decimal("dpi", { precision: 5, scale: 2 }),
  tvpi: decimal("tvpi", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
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
}, (table) => ({
  fundCompanyIdx: index("idx_reserve_strategies_fund_company").on(table.fundId, table.companyId)
}));

export const pacingHistory = pgTable("pacing_history", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").notNull().references(() => funds.id),
  quarter: varchar("quarter", { length: 8 }).notNull(),
  deploymentAmount: decimal("deployment_amount", { precision: 15, scale: 2 }).notNull(),
  marketCondition: varchar("market_condition", { length: 16 }),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => ({
  fundQuarterUnique: unique("unique_fund_quarter").on(table.fundId, table.quarter)
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
}, (table) => ({
  retentionIdx: index("idx_audit_retention").on(table.createdAt), // Index on created_at for retention queries
  correlationIdx: index("idx_audit_correlation").on(table.correlationId),
  userActionIdx: index("idx_audit_user_action").on(table.userId, table.action, table.createdAt.desc()),
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
  fundId: uuid('fund_id').notNull(),
  companyId: uuid('company_id').notNull(),
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
}, (table) => ({
  uniqueDecision: uniqueIndex('ux_reserve_unique').on(
    table.companyId,
    table.periodStart,
    table.periodEnd,
    table.engineType,
    table.engineVersion
  ),
  fundCompanyIdx: index('idx_reserve_fund_company').on(table.fundId, table.companyId),
  periodIdx: index('idx_reserve_period').on(table.periodStart, table.periodEnd),
  engineIdx: index('idx_reserve_engine').on(table.engineType, table.engineVersion),
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
}, (table) => ({
  fundTimeIdx: index("fund_state_snapshots_fund_time_idx").on(table.fundId, table.snapshotTime.desc()),
  nameIdx: index("fund_state_snapshots_name_idx").on(table.fundId, table.snapshotName),
  hashIdx: index("fund_state_snapshots_hash_idx").on(table.stateHash),
  tagsGinIdx: index("fund_state_snapshots_tags_gin_idx").using("gin", table.tags),
  bookmarkedIdx: index("fund_state_snapshots_bookmarked_idx").on(table.fundId, table.isBookmarked),
  expirationIdx: index("fund_state_snapshots_expiration_idx").on(table.expiresAt),
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
}, (table) => ({
  snapshotIdx: index("snapshot_metadata_snapshot_idx").on(table.snapshotId),
  parentIdx: index("snapshot_metadata_parent_idx").on(table.parentSnapshotId),
  schemaVersionIdx: index("snapshot_metadata_schema_version_idx").on(table.schemaVersion),
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
}, (table) => ({
  fundOperationIdx: index("restoration_history_fund_operation_idx").on(table.fundId, table.operationId),
  sourceSnapshotIdx: index("restoration_history_source_idx").on(table.sourceSnapshotId),
  timeRangeIdx: index("restoration_history_time_range_idx").on(table.startTime, table.endTime),
  statusIdx: index("restoration_history_status_idx").on(table.status, table.createdAt.desc()),
  userIdx: index("restoration_history_user_idx").on(table.restoredBy, table.createdAt.desc()),
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
}, (table) => ({
  fundComparisonIdx: index("snapshot_comparisons_fund_idx").on(table.fundId, table.createdAt.desc()),
  snapshotsIdx: index("snapshot_comparisons_snapshots_idx").on(table.baseSnapshotId, table.compareSnapshotId),
  uniqueComparison: unique("snapshot_comparisons_unique").on(table.baseSnapshotId, table.compareSnapshotId, table.comparisonType),
  cacheIdx: index("snapshot_comparisons_cache_idx").on(table.cacheStatus, table.lastUsed),
  userIdx: index("snapshot_comparisons_user_idx").on(table.requestedBy, table.createdAt.desc()),
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
}, (table) => ({
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
}, (table) => ({
  fundReportIdx: index("variance_reports_fund_idx").on(table.fundId, table.createdAt.desc()),
  baselineIdx: index("variance_reports_baseline_idx").on(table.baselineId, table.asOfDate.desc()),
  periodIdx: index("variance_reports_period_idx").on(table.analysisStart, table.analysisEnd),
  typeIdx: index("variance_reports_type_idx").on(table.reportType, table.status),
  riskIdx: index("variance_reports_risk_idx").on(table.riskLevel, table.createdAt.desc()),
  statusIdx: index("variance_reports_status_idx").on(table.status, table.updatedAt.desc()),
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
}, (table) => ({
  fundAlertIdx: index("performance_alerts_fund_idx").on(table.fundId, table.triggeredAt.desc()),
  severityIdx: index("performance_alerts_severity_idx").on(table.severity, table.status, table.triggeredAt.desc()),
  statusIdx: index("performance_alerts_status_idx").on(table.status, table.triggeredAt.desc()),
  metricIdx: index("performance_alerts_metric_idx").on(table.metricName, table.triggeredAt.desc()),
  baselineIdx: index("performance_alerts_baseline_idx").on(table.baselineId, table.triggeredAt.desc()),
  reportIdx: index("performance_alerts_report_idx").on(table.varianceReportId),
  escalationIdx: index("performance_alerts_escalation_idx").on(table.escalationLevel, table.escalatedAt.desc()),
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
}, (table) => ({
  fundRuleIdx: index("alert_rules_fund_idx").on(table.fundId, table.isEnabled),
  metricIdx: index("alert_rules_metric_idx").on(table.metricName, table.isEnabled),
  enabledIdx: index("alert_rules_enabled_idx").on(table.isEnabled, table.checkFrequency),
  lastTriggeredIdx: index("alert_rules_last_triggered_idx").on(table.lastTriggered.desc()),
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

