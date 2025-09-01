import { pgTable, text, serial, integer, boolean, decimal, timestamp, jsonb, varchar, index, unique, uuid } from "drizzle-orm/pg-core";

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

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

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

// Type exports
export type Fund = typeof funds.$inferSelect;
export type NewFund = typeof funds.$inferInsert;
export type PortfolioCompany = typeof portfolioCompanies.$inferSelect;
export type NewPortfolioCompany = typeof portfolioCompanies.$inferInsert;
export type Investment = typeof investments.$inferSelect;
export type NewInvestment = typeof investments.$inferInsert;
export type FundMetrics = typeof fundMetrics.$inferSelect;
export type NewFundMetrics = typeof fundMetrics.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;