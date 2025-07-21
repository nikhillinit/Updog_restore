-- Deal Pipeline Migration
-- Created: 2025-01-19
-- Purpose: Add comprehensive deal pipeline tracking tables

-- Deal Opportunities - Core pipeline tracking
CREATE TABLE IF NOT EXISTS "deal_opportunities" (
  "id" SERIAL PRIMARY KEY,
  "fund_id" INTEGER REFERENCES "funds"("id"),
  "company_name" TEXT NOT NULL,
  "sector" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "deal_size" DECIMAL(15,2),
  "valuation" DECIMAL(15,2),
  "status" TEXT NOT NULL DEFAULT 'lead',
  "priority" TEXT NOT NULL DEFAULT 'medium',
  "founded_year" INTEGER,
  "employee_count" INTEGER,
  "revenue" DECIMAL(15,2),
  "description" TEXT,
  "website" TEXT,
  "contact_name" TEXT,
  "contact_email" TEXT,
  "contact_phone" TEXT,
  "source_notes" TEXT,
  "next_action" TEXT,
  "next_action_date" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- Pipeline Stages - Workflow configuration
CREATE TABLE IF NOT EXISTS "pipeline_stages" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "order_index" INTEGER NOT NULL,
  "color" TEXT DEFAULT '#6b7280',
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- Due Diligence Items - DD checklist tracking
CREATE TABLE IF NOT EXISTS "due_diligence_items" (
  "id" SERIAL PRIMARY KEY,
  "opportunity_id" INTEGER REFERENCES "deal_opportunities"("id"),
  "category" TEXT NOT NULL,
  "item" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "priority" TEXT NOT NULL DEFAULT 'medium',
  "assigned_to" TEXT,
  "due_date" TIMESTAMP,
  "completed_date" TIMESTAMP,
  "notes" TEXT,
  "documents" JSONB,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- Scoring Models - Investment scoring framework
CREATE TABLE IF NOT EXISTS "scoring_models" (
  "id" SERIAL PRIMARY KEY,
  "opportunity_id" INTEGER REFERENCES "deal_opportunities"("id"),
  "criteria_name" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "weight" DECIMAL(3,2) NOT NULL,
  "notes" TEXT,
  "scored_by" TEXT,
  "scored_at" TIMESTAMP DEFAULT NOW(),
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- Pipeline Activities - Activity tracking
CREATE TABLE IF NOT EXISTS "pipeline_activities" (
  "id" SERIAL PRIMARY KEY,
  "opportunity_id" INTEGER REFERENCES "deal_opportunities"("id"),
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "outcome" TEXT,
  "participants" JSONB,
  "scheduled_date" TIMESTAMP,
  "completed_date" TIMESTAMP,
  "follow_up_required" BOOLEAN DEFAULT false,
  "follow_up_date" TIMESTAMP,
  "created_by" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- Market Research - Sector analysis
CREATE TABLE IF NOT EXISTS "market_research" (
  "id" SERIAL PRIMARY KEY,
  "opportunity_id" INTEGER REFERENCES "deal_opportunities"("id"),
  "sector" TEXT NOT NULL,
  "market_size" DECIMAL(15,2),
  "growth_rate" DECIMAL(5,2),
  "competitor_analysis" JSONB,
  "market_trends" TEXT,
  "risk_factors" TEXT,
  "opportunities" TEXT,
  "research_date" TIMESTAMP DEFAULT NOW(),
  "researched_by" TEXT,
  "sources" JSONB,
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- Financial Projections - Deal-specific forecasting
CREATE TABLE IF NOT EXISTS "financial_projections" (
  "id" SERIAL PRIMARY KEY,
  "opportunity_id" INTEGER REFERENCES "deal_opportunities"("id"),
  "year" INTEGER NOT NULL,
  "revenue" DECIMAL(15,2),
  "revenue_growth" DECIMAL(5,2),
  "gross_margin" DECIMAL(5,2),
  "burn_rate" DECIMAL(15,2),
  "runway_months" INTEGER,
  "customer_count" INTEGER,
  "arr" DECIMAL(15,2),
  "ltv" DECIMAL(15,2),
  "cac" DECIMAL(15,2),
  "projection_type" TEXT NOT NULL DEFAULT 'management',
  "assumptions" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- Insert default pipeline stages
INSERT INTO "pipeline_stages" ("name", "description", "order_index", "color") VALUES
  ('Lead', 'Initial contact or sourced opportunity', 1, '#6b7280'),
  ('Qualified', 'Qualified lead meeting criteria', 2, '#3b82f6'),
  ('Pitch', 'Company presentation scheduled/completed', 3, '#8b5cf6'),
  ('Due Diligence', 'Active due diligence process', 4, '#f59e0b'),
  ('Committee', 'Investment committee review', 5, '#ef4444'),
  ('Term Sheet', 'Term sheet negotiation', 6, '#10b981'),
  ('Closed', 'Investment completed', 7, '#059669'),
  ('Passed', 'Opportunity declined', 8, '#6b7280')
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_deal_opportunities_fund_id" ON "deal_opportunities"("fund_id");
CREATE INDEX IF NOT EXISTS "idx_deal_opportunities_status" ON "deal_opportunities"("status");
CREATE INDEX IF NOT EXISTS "idx_deal_opportunities_priority" ON "deal_opportunities"("priority");
CREATE INDEX IF NOT EXISTS "idx_due_diligence_opportunity_id" ON "due_diligence_items"("opportunity_id");
CREATE INDEX IF NOT EXISTS "idx_scoring_models_opportunity_id" ON "scoring_models"("opportunity_id");
CREATE INDEX IF NOT EXISTS "idx_pipeline_activities_opportunity_id" ON "pipeline_activities"("opportunity_id");
CREATE INDEX IF NOT EXISTS "idx_financial_projections_opportunity_id" ON "financial_projections"("opportunity_id");