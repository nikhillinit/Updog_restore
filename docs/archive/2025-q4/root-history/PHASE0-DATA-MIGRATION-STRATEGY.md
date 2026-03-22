---
status: ACTIVE
last_updated: 2026-01-19
---

# Phase 0.1: Data Migration Strategy for share_price_cents

**Status:** Analysis Complete **Created:** 2025-01-08 **Priority:** P0 -
CRITICAL BUSINESS BLOCKER

---

## Executive Summary

The missing `share_price_cents` field in the investments table blocks 6 out of 7
MOIC calculation lenses, preventing critical VC fund workflows:

- Reserve optimization (Follow-On MOIC ranking)
- IRR-neutral partial sales (NPV → Minimum Valuation)
- Return-the-Fund analysis (ownership/dilution modeling)

This document outlines the strategy for backfilling existing investment data and
establishing the new lot-level pricing structure.

---

## Current State Analysis

### Existing Investments Table Schema

```typescript
export const investments = pgTable('investments', {
  id: serial('id').primaryKey(),
  fundId: integer('fund_id').references(() => funds.id),
  companyId: integer('company_id').references(() => portfolioCompanies.id),
  investmentDate: timestamp('investment_date').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(), // Total dollars invested
  round: text('round').notNull(), // "Series A", "Seed", etc.
  ownershipPercentage: decimal('ownership_percentage', {
    precision: 5,
    scale: 4,
  }),
  valuationAtInvestment: decimal('valuation_at_investment', {
    precision: 15,
    scale: 2,
  }),
  dealTags: text('deal_tags').array(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### Sample Seed Data (from server/seed-db.ts)

```typescript
{
  fundId: 1,
  companyId: 1,
  investmentDate: new Date("2021-03-15"),
  amount: "2500000", // $2.5M invested
  round: "Series A",
  ownershipPercentage: "0.15", // 15% ownership
  valuationAtInvestment: "16666667" // $16.67M post-money valuation
}
```

### Missing Per-Share Data

- ❌ **share_price_cents**: Price per share at investment
- ❌ **shares_acquired**: Number of shares purchased
- ❌ **cost_basis_cents**: Total cost in cents (for precision)

---

## Migration Strategy Options

### Option 1: Calculate from Ownership & Valuation (RECOMMENDED)

**Formula:**

```
shares_acquired = (ownership_percentage × total_shares)
share_price_cents = (post_money_valuation / total_shares) × 100
cost_basis_cents = amount × 100
```

**Pros:**

- ✅ Can derive share price from post-money valuation
- ✅ Preserves existing data relationships
- ✅ Mathematically consistent

**Cons:**

- ⚠️ Requires assuming total shares outstanding (need company cap table)
- ⚠️ Precision loss if total shares unknown

**Implementation:**

```sql
-- Step 1: Calculate shares_acquired from ownership %
-- Assumes 10,000,000 fully diluted shares (standard seed/series A)
UPDATE investments
SET shares_acquired = CAST(ownership_percentage * 10000000 AS DECIMAL(18, 8))
WHERE shares_acquired IS NULL;

-- Step 2: Calculate share_price_cents from valuation
UPDATE investments
SET share_price_cents = CAST((valuation_at_investment / 10000000) * 100 AS BIGINT)
WHERE share_price_cents IS NULL AND valuation_at_investment IS NOT NULL;

-- Step 3: Calculate cost_basis_cents from amount
UPDATE investments
SET cost_basis_cents = CAST(amount * 100 AS BIGINT)
WHERE cost_basis_cents IS NULL;
```

---

### Option 2: Mark Legacy Data as "Needs Pricing" (FALLBACK)

**Approach:** Flag legacy investments without per-share data

**Pros:**

- ✅ Honest about data quality
- ✅ Allows new investments to use proper lot tracking
- ✅ No assumptions required

**Cons:**

- ❌ MOIC calculations remain blocked for legacy data
- ❌ Requires manual data entry for historical deals
- ❌ Partial feature availability

**Implementation:**

```sql
ALTER TABLE investments ADD COLUMN pricing_status TEXT DEFAULT 'complete';

UPDATE investments
SET pricing_status = 'needs_manual_pricing'
WHERE share_price_cents IS NULL;
```

---

## RECOMMENDED APPROACH: Hybrid Strategy

### Phase 1: Automated Backfill (Best-Effort)

1. **Calculate shares_acquired** from `ownershipPercentage` (assumes 10M fully
   diluted shares)
2. **Calculate share_price_cents** from `valuationAtInvestment` / assumed shares
3. **Flag uncertainty** with metadata column `pricing_confidence: 'calculated'`

### Phase 2: Manual Validation (High-Priority Funds)

1. Export calculated values to CSV
2. Fund managers review and correct with actual cap table data
3. Update with `pricing_confidence: 'verified'`

### Phase 3: New Investments (Going Forward)

1. **Require** `share_price_cents` for all new investments
2. **Validate** at API boundary with Zod schema
3. **Store** lot-level data in `investment_lots` table

---

## Migration Script Structure

### Up Migration (`001_add_lot_tracking.up.sql`)

```sql
-- 1. Add new columns to investments table
ALTER TABLE investments
  ADD COLUMN share_price_cents BIGINT,
  ADD COLUMN shares_acquired DECIMAL(18, 8),
  ADD COLUMN cost_basis_cents BIGINT,
  ADD COLUMN pricing_confidence TEXT DEFAULT 'calculated',
  ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;

-- 2. Backfill cost_basis_cents (always accurate from amount)
UPDATE investments
SET cost_basis_cents = CAST(amount * 100 AS BIGINT);

-- 3. Backfill shares_acquired (best-effort, assumes 10M shares)
UPDATE investments
SET shares_acquired = CAST(ownership_percentage * 10000000 AS DECIMAL(18, 8))
WHERE ownership_percentage IS NOT NULL;

-- 4. Backfill share_price_cents (best-effort from valuation)
UPDATE investments
SET share_price_cents = CAST((valuation_at_investment / 10000000) * 100 AS BIGINT)
WHERE valuation_at_investment IS NOT NULL
  AND share_price_cents IS NULL;

-- 5. Mark high-confidence calculations
UPDATE investments
SET pricing_confidence = 'verified'
WHERE share_price_cents IS NOT NULL
  AND ownership_percentage IS NOT NULL
  AND valuation_at_investment IS NOT NULL;

-- 6. Create investment_lots table (new normalized structure)
CREATE TABLE investment_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  lot_type TEXT NOT NULL CHECK (lot_type IN ('initial', 'follow_on', 'secondary')),
  share_price_cents BIGINT NOT NULL,
  shares_acquired DECIMAL(18, 8) NOT NULL,
  cost_basis_cents BIGINT NOT NULL,
  version INTEGER DEFAULT 1 NOT NULL,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_investment_lots_investment_id ON investment_lots(investment_id);
CREATE INDEX idx_investment_lots_lot_type ON investment_lots(investment_id, lot_type);
CREATE UNIQUE INDEX idx_investment_lots_idempotency ON investment_lots(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 7. Migrate existing investments to lots (one-time backfill)
INSERT INTO investment_lots (
  investment_id,
  lot_type,
  share_price_cents,
  shares_acquired,
  cost_basis_cents
)
SELECT
  id,
  'initial' AS lot_type,
  share_price_cents,
  shares_acquired,
  cost_basis_cents
FROM investments
WHERE share_price_cents IS NOT NULL;
```

### Down Migration (`001_add_lot_tracking.down.sql`)

```sql
-- Reverse migration (for testing rollback)
DROP TABLE IF EXISTS investment_lots CASCADE;

ALTER TABLE investments
  DROP COLUMN IF EXISTS share_price_cents,
  DROP COLUMN IF EXISTS shares_acquired,
  DROP COLUMN IF EXISTS cost_basis_cents,
  DROP COLUMN IF EXISTS pricing_confidence,
  DROP COLUMN IF EXISTS version;
```

---

## Data Quality Assessment

### Assumption: 10M Fully Diluted Shares

**Rationale:**

- Standard for seed/Series A rounds
- Allows for 10% option pool (9M shares to investors, 1M for employees)
- Pre-money valuation ÷ 10M = price per share

**Risk:**

- ⚠️ Actual share counts vary (5M - 20M typical range)
- ⚠️ Later rounds (Series B+) may have 20M+ shares
- ⚠️ Error compounds in follow-on MOIC calculations

**Mitigation:**

- Flag all backfilled data with `pricing_confidence: 'calculated'`
- Provide UI to edit share price per investment
- Export validation report for fund managers

---

## Validation Queries

### Check Backfill Coverage

```sql
SELECT
  COUNT(*) AS total_investments,
  COUNT(share_price_cents) AS with_share_price,
  COUNT(share_price_cents) * 100.0 / COUNT(*) AS coverage_pct,
  COUNT(CASE WHEN pricing_confidence = 'calculated' THEN 1 END) AS calculated,
  COUNT(CASE WHEN pricing_confidence = 'verified' THEN 1 END) AS verified
FROM investments;
```

### Identify High-Value Investments Needing Validation

```sql
SELECT
  i.id,
  f.name AS fund_name,
  pc.name AS company_name,
  i.amount,
  i.round,
  i.share_price_cents,
  i.pricing_confidence
FROM investments i
JOIN funds f ON i.fund_id = f.id
JOIN portfolio_companies pc ON i.company_id = pc.id
WHERE i.amount > 1000000 -- > $1M investments
  AND i.pricing_confidence = 'calculated'
ORDER BY i.amount DESC
LIMIT 20;
```

### Verify Lot Migration Completeness

```sql
SELECT
  i.id AS investment_id,
  i.amount,
  il.lot_type,
  il.cost_basis_cents,
  (il.cost_basis_cents / 100.0) AS cost_basis_dollars,
  ABS((il.cost_basis_cents / 100.0) - CAST(i.amount AS NUMERIC)) AS delta
FROM investments i
LEFT JOIN investment_lots il ON i.id = il.investment_id
WHERE ABS((il.cost_basis_cents / 100.0) - CAST(i.amount AS NUMERIC)) > 0.01 -- Penny difference
  OR il.id IS NULL;
```

---

## Timeline & Execution Plan

### Pre-Migration (1 hour)

- [x] Analyze existing investments schema
- [x] Review seed data patterns
- [x] Document migration strategy
- [ ] Test migration on dev database snapshot
- [ ] Export validation report for stakeholders

### Migration Execution (30 minutes)

- [ ] Create backup of production `investments` table
- [ ] Run `001_add_lot_tracking.up.sql`
- [ ] Validate backfill coverage >95%
- [ ] Create `investment_lots` from existing investments
- [ ] Test rollback with `down.sql` in dev

### Post-Migration (1 hour)

- [ ] Generate validation report
- [ ] Flag high-value investments for manual review ($1M+ deals)
- [ ] Update API to accept `share_price_cents` on new investments
- [ ] Add UI validation for lot-level data entry
- [ ] Document new investment creation workflow

---

## Success Criteria

✅ All existing investments have `cost_basis_cents` (100% coverage) ✅ >90% of
investments have `share_price_cents` (calculated or verified) ✅
`investment_lots` table contains one lot per existing investment ✅ Migration
reversible (down.sql tested and working) ✅ High-value investments ($1M+)
flagged for manual validation ✅ New investment API enforces `share_price_cents`
requirement

---

## Risks & Mitigation

| Risk                          | Probability | Impact   | Mitigation                                                       |
| ----------------------------- | ----------- | -------- | ---------------------------------------------------------------- |
| Share count assumption wrong  | HIGH        | Medium   | Flag with `pricing_confidence: 'calculated'`, allow manual edits |
| Precision loss in conversion  | LOW         | High     | Use BIGINT for cents, DECIMAL(18,8) for shares                   |
| Migration fails mid-execution | LOW         | Critical | Transaction wrapper, test in dev first                           |
| Rollback data loss            | LOW         | Critical | Backup table before migration                                    |

---

## Next Steps

1. **Test migration on dev database** with actual seed data
2. **Execute Phase 0.1 complete** → Mark todo as done
3. **Move to Phase 0.2:** Create feature flag `enable_lot_level_moic`
4. **Begin Phase 1:** Database schema implementation with TDD

**Ready to execute migration in dev environment for testing.**
