# POVC Fund Model - Database Schema Documentation

## Overview

The POVC Fund Model uses PostgreSQL with Drizzle ORM for type-safe database operations. This document outlines the complete database schema, relationships, and design patterns implemented as part of Epic G1 (Platform Hardening).

## Schema Design Principles

### 1. Event Sourcing & CQRS Pattern
- **Fund Events**: All fund changes are recorded as events for audit trails
- **Fund Snapshots**: Calculation results stored separately from configuration
- **Correlation IDs**: Link related events and calculations

### 2. Type Safety
- **Drizzle ORM**: Compile-time type safety for all database operations
- **Zod Validation**: Runtime validation with schema inference
- **TypeScript Types**: Auto-generated types from schema definitions

### 3. Performance Optimization
- **Strategic Indexes**: Performance-optimized query paths
- **JSONB Storage**: Flexible configuration and metadata storage
- **Connection Pooling**: Neon serverless connection management

## Core Tables

### funds
```sql
CREATE TABLE funds (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  size DECIMAL(15,2) NOT NULL,
  deployed_capital DECIMAL(15,2) DEFAULT 0,
  management_fee DECIMAL(5,4) NOT NULL,
  carry_percentage DECIMAL(5,4) NOT NULL,
  vintage_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Purpose**: Core fund entities with basic financial parameters
**Key Fields**:
- `size`: Total fund size in USD
- `management_fee`: Annual management fee (0.02 = 2%)
- `carry_percentage`: Carried interest percentage (0.20 = 20%)

### fund_configs
```sql
CREATE TABLE fund_configs (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER REFERENCES funds(id) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  config JSONB NOT NULL,
  is_draft BOOLEAN DEFAULT true,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(fund_id, version)
);
```

**Purpose**: Versioned fund configuration storage
**Key Features**:
- Version control for fund configurations
- Draft/published states for workflow management
- JSONB storage for flexible configuration schemas

### fund_snapshots
```sql
CREATE TABLE fund_snapshots (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER REFERENCES funds(id) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'RESERVE', 'PACING', 'COHORT'
  payload JSONB NOT NULL,
  calc_version VARCHAR(20) NOT NULL,
  correlation_id VARCHAR(36) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Purpose**: Store calculation results separately from configuration
**Calculation Types**:
- `RESERVE`: Reserve allocation calculations
- `PACING`: Deployment pacing analysis
- `COHORT`: Vintage cohort performance analysis

### fund_events
```sql
CREATE TABLE fund_events (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER REFERENCES funds(id) NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- 'DRAFT_SAVED', 'PUBLISHED', 'CALC_TRIGGERED'
  payload JSONB,
  user_id INTEGER REFERENCES users(id),
  correlation_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Purpose**: Audit trail for all fund modifications
**Event Types**:
- `DRAFT_SAVED`: Configuration saved as draft
- `PUBLISHED`: Configuration published to production
- `CALC_TRIGGERED`: Background calculation initiated

## Portfolio Management Tables

### portfolio_companies
```sql
CREATE TABLE portfolio_companies (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER REFERENCES funds(id),
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  stage TEXT NOT NULL,
  investment_amount DECIMAL(15,2) NOT NULL,
  current_valuation DECIMAL(15,2),
  founded_year INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  description TEXT,
  deal_tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Purpose**: Portfolio company master data
**Key Features**:
- Sector and stage classification
- Current valuation tracking  
- Flexible tagging system

### investments
```sql
CREATE TABLE investments (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER REFERENCES funds(id),
  company_id INTEGER REFERENCES portfolio_companies(id),
  investment_date TIMESTAMP NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  round TEXT NOT NULL,
  ownership_percentage DECIMAL(5,4),
  valuation_at_investment DECIMAL(15,2),
  deal_tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Purpose**: Individual investment rounds and amounts
**Relationships**: Many-to-many between funds and companies via investments

## Deal Pipeline Tables

### deal_opportunities
Primary pipeline tracking table with comprehensive deal information including financial projections and market research.

### pipeline_stages
Configurable workflow stages (Lead → Qualified → Pitch → DD → Committee → Term Sheet → Closed/Passed).

### due_diligence_items
Checklist management for DD processes with status tracking and document references.

### scoring_models
Quantitative investment scoring framework with weighted criteria.

## Analytics & Reporting Tables

### fund_metrics
```sql
CREATE TABLE fund_metrics (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER REFERENCES funds(id),
  metric_date TIMESTAMP NOT NULL,
  total_value DECIMAL(15,2) NOT NULL,
  irr DECIMAL(5,4),
  multiple DECIMAL(5,2),
  dpi DECIMAL(5,2),
  tvpi DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Key Metrics**:
- `irr`: Internal Rate of Return
- `multiple`: Total Value Multiple  
- `dpi`: Distributions to Paid-in Capital
- `tvpi`: Total Value to Paid-in Capital

### reserve_strategies & pacing_history
Engine-specific tables for reserve allocation and pacing analysis results.

## Custom Fields System

### custom_fields & custom_field_values
Flexible metadata system allowing funds to define custom data fields for investments with type validation and option management.

## Performance Indexes

```sql
-- Core performance indexes
CREATE INDEX idx_portfolio_companies_fund_id ON portfolio_companies(fund_id);
CREATE INDEX idx_investments_fund_id ON investments(fund_id);
CREATE INDEX fund_snapshots_lookup_idx ON fund_snapshots(fund_id, type, created_at DESC);
CREATE INDEX fund_events_fund_idx ON fund_events(fund_id, created_at DESC);
```

## Data Validation

### Zod Schemas
All tables have corresponding Zod schemas for runtime validation:

```typescript
export const insertFundSchema = createInsertSchema(funds).omit({
  id: true,
  createdAt: true,
}).extend({
  size: z.number().positive(),
  managementFee: z.number().min(0).max(1),
  carryPercentage: z.number().min(0).max(1),
});
```

### Type Exports
```typescript
export type Fund = typeof funds.$inferSelect;
export type InsertFund = z.infer<typeof insertFundSchema>;
```

## Migration Strategy

### Drizzle Kit Configuration
```typescript
export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts", 
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
```

### Migration Commands
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Run pending migrations
- `npm run db:studio` - Open Drizzle Studio for database management

## Connection Management

### Neon Serverless Integration
```typescript
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

neonConfig.webSocketConstructor = ws;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });
```

## Epic G1 Compliance

This schema implementation satisfies all Epic G1 (Platform Hardening) requirements:

✅ **Database Schema**: Complete Drizzle ORM schema with migrations
✅ **Type Safety**: Full TypeScript integration with runtime validation  
✅ **Performance**: Strategic indexing for query optimization
✅ **Audit Trail**: Event sourcing pattern for full change tracking
✅ **Flexibility**: JSONB configuration storage for evolving requirements

## Future Considerations

### Sharding Strategy
Current single-database design supports growth to 1000+ funds. Future sharding by fund_id available if needed.

### Read Replicas
Neon provides automatic read replica support for analytics workloads.

### Data Retention
Event and snapshot tables will implement automated archival policies for long-term storage optimization.