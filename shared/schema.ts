import { pgTable, text, serial, integer, boolean, decimal, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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

export const portfolioCompanies = pgTable("portfolio_companies", {
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
  totalValue: decimal("total_value", { precision: 15, scale: 2 }).notNull(),
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
  createdAt: true,
});

export const insertPortfolioCompanySchema = createInsertSchema(portfolioCompanies).omit({
  id: true,
  createdAt: true,
});

export const insertInvestmentSchema = createInsertSchema(investments).omit({
  id: true,
  createdAt: true,
});

export const insertFundMetricsSchema = createInsertSchema(fundMetrics).omit({
  id: true,
  createdAt: true,
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true,
});

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// Pipeline Insert Schemas
export const insertDealOpportunitySchema = createInsertSchema(dealOpportunities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPipelineStageSchema = createInsertSchema(pipelineStages).omit({
  id: true,
  createdAt: true,
});

export const insertDueDiligenceItemSchema = createInsertSchema(dueDiligenceItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertScoringModelSchema = createInsertSchema(scoringModels).omit({
  id: true,
  createdAt: true,
  scoredAt: true,
});

export const insertPipelineActivitySchema = createInsertSchema(pipelineActivities).omit({
  id: true,
  createdAt: true,
});

export const insertMarketResearchSchema = createInsertSchema(marketResearch).omit({
  id: true,
  createdAt: true,
  researchDate: true,
});

export const insertFinancialProjectionSchema = createInsertSchema(financialProjections).omit({
  id: true,
  createdAt: true,
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

export const customFieldValues = pgTable("custom_field_values", {
  id: serial("id").primaryKey(),
  fieldId: integer("field_id").references(() => customFields.id),
  investmentId: integer("investment_id").references(() => portfolioCompanies.id),
  value: text("value"), // JSON string for complex values
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomFieldSchema = createInsertSchema(customFields).omit({
  id: true,
  createdAt: true,
});

export const insertCustomFieldValueSchema = createInsertSchema(customFieldValues).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Core Type Exports
export type Fund = typeof funds.$inferSelect;
export type InsertFund = z.infer<typeof insertFundSchema>;
export type PortfolioCompany = typeof portfolioCompanies.$inferSelect;
export type InsertPortfolioCompany = z.infer<typeof insertPortfolioCompanySchema>;
export type Investment = typeof investments.$inferSelect;
export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;
export type FundMetrics = typeof fundMetrics.$inferSelect;
export type InsertFundMetrics = z.infer<typeof insertFundMetricsSchema>;
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type CustomField = typeof customFields.$inferSelect;
export type InsertCustomField = z.infer<typeof insertCustomFieldSchema>;
export type CustomFieldValue = typeof customFieldValues.$inferSelect;
export type InsertCustomFieldValue = z.infer<typeof insertCustomFieldValueSchema>;

// Pipeline Type Exports
export type DealOpportunity = typeof dealOpportunities.$inferSelect;
export type InsertDealOpportunity = z.infer<typeof insertDealOpportunitySchema>;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type InsertPipelineStage = z.infer<typeof insertPipelineStageSchema>;
export type DueDiligenceItem = typeof dueDiligenceItems.$inferSelect;
export type InsertDueDiligenceItem = z.infer<typeof insertDueDiligenceItemSchema>;
export type ScoringModel = typeof scoringModels.$inferSelect;
export type InsertScoringModel = z.infer<typeof insertScoringModelSchema>;
export type PipelineActivity = typeof pipelineActivities.$inferSelect;
export type InsertPipelineActivity = z.infer<typeof insertPipelineActivitySchema>;
export type MarketResearch = typeof marketResearch.$inferSelect;
export type InsertMarketResearch = z.infer<typeof insertMarketResearchSchema>;
export type FinancialProjection = typeof financialProjections.$inferSelect;
export type InsertFinancialProjection = z.infer<typeof insertFinancialProjectionSchema>;
