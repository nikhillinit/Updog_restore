import { pgTable, serial, text, integer, boolean, decimal, timestamp, jsonb } from "drizzle-orm/pg-core";
import { funds } from './tables';

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

// Type exports
export type DealOpportunity = typeof dealOpportunities.$inferSelect;
export type NewDealOpportunity = typeof dealOpportunities.$inferInsert;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type NewPipelineStage = typeof pipelineStages.$inferInsert;
export type DueDiligenceItem = typeof dueDiligenceItems.$inferSelect;
export type NewDueDiligenceItem = typeof dueDiligenceItems.$inferInsert;
export type ScoringModel = typeof scoringModels.$inferSelect;
export type NewScoringModel = typeof scoringModels.$inferInsert;
export type PipelineActivity = typeof pipelineActivities.$inferSelect;
export type NewPipelineActivity = typeof pipelineActivities.$inferInsert;
export type MarketResearch = typeof marketResearch.$inferSelect;
export type NewMarketResearch = typeof marketResearch.$inferInsert;
export type FinancialProjection = typeof financialProjections.$inferSelect;
export type NewFinancialProjection = typeof financialProjections.$inferInsert;