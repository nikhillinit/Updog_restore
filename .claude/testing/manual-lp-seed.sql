-- Manual LP Test Data Seed
-- Purpose: Quick workaround to enable LP security testing
-- Created: 2024-12-24
-- Usage: psql $DATABASE_URL < .claude/testing/manual-lp-seed.sql

-- Clean up existing test data (if any)
DELETE FROM capital_activities WHERE fund_id IN (SELECT id FROM funds WHERE name = 'Test Venture Fund I');
DELETE FROM lp_fund_commitments WHERE fund_id IN (SELECT id FROM funds WHERE name = 'Test Venture Fund I');
DELETE FROM limited_partners WHERE email LIKE '%@test.com';
DELETE FROM funds WHERE name = 'Test Venture Fund I';

-- Create test fund
INSERT INTO funds (name, size, vintage_year, status, management_fee, carry_percentage, created_at)
VALUES ('Test Venture Fund I', '100000000', 2023, 'active', '0.02', '0.20', NOW())
RETURNING id;

-- Get fund ID (you'll need to replace FUND_ID_HERE with actual ID from above)
-- Or use this in a transaction:

DO $$
DECLARE
  fund_id INTEGER;
  lp1_id INTEGER;
  lp2_id INTEGER;
  lp3_id INTEGER;
BEGIN
  -- Insert fund and get ID
  INSERT INTO funds (name, size, vintage_year, status, management_fee, carry_percentage, created_at)
  VALUES ('Test Venture Fund I', '100000000', 2023, 'active', '0.02', '0.20', NOW())
  RETURNING id INTO fund_id;

  RAISE NOTICE 'Created fund with ID: %', fund_id;

  -- Create LP 1: Institutional LP 1
  DECLARE
    lp1_commitment_id INTEGER;
  BEGIN
    INSERT INTO limited_partners (name, email, entity_type, created_at, updated_at)
    VALUES ('Institutional LP 1', 'lp1@test.com', 'institution', NOW(), NOW())
    RETURNING id INTO lp1_id;

    INSERT INTO lp_fund_commitments (lp_id, fund_id, commitment_amount_cents, commitment_date, commitment_percentage, status, created_at, updated_at)
    VALUES (lp1_id, fund_id, 1000000000, '2023-01-01', '10.0000', 'active', NOW(), NOW())
    RETURNING id INTO lp1_commitment_id; -- $10M commitment (10%)

    INSERT INTO capital_activities (commitment_id, fund_id, activity_type, amount_cents, activity_date, effective_date, created_at, updated_at)
    VALUES (lp1_commitment_id, fund_id, 'capital_call', 500000000, '2023-02-01', '2023-02-01', NOW(), NOW()); -- $5M capital call

    INSERT INTO capital_activities (commitment_id, fund_id, activity_type, amount_cents, activity_date, effective_date, created_at, updated_at)
    VALUES (lp1_commitment_id, fund_id, 'distribution', 200000000, '2023-12-15', '2023-12-15', NOW(), NOW()); -- $2M distribution

    RAISE NOTICE 'Created LP1: % (ID: %)', 'lp1@test.com', lp1_id;
  END;

  -- Create LP 2: Institutional LP 2
  INSERT INTO limited_partners (name, email, entity_type, created_at, updated_at)
  VALUES ('Institutional LP 2', 'lp2@test.com', 'institution', NOW(), NOW())
  RETURNING id INTO lp2_id;

  INSERT INTO lp_fund_commitments (lp_id, fund_id, commitment_amount_cents, commitment_date, commitment_percentage, status, created_at, updated_at)
  VALUES (lp2_id, fund_id, 2000000000, '2023-01-01', '20.0000', 'active', NOW(), NOW()); -- $20M commitment (20%)

  INSERT INTO capital_activities (lp_id, fund_id, activity_type, amount_cents, activity_date, created_at, updated_at)
  VALUES (lp2_id, fund_id, 'capital_call', 1000000000, '2023-02-01', NOW(), NOW()); -- $10M capital call

  INSERT INTO capital_activities (lp_id, fund_id, activity_type, amount_cents, activity_date, distribution_type, created_at, updated_at)
  VALUES (lp2_id, fund_id, 'distribution', 400000000, '2023-12-15', 'return_of_capital', NOW(), NOW()); -- $4M distribution

  RAISE NOTICE 'Created LP2: % (ID: %)', 'lp2@test.com', lp2_id;

  -- Create LP 3: Family Office LP
  INSERT INTO limited_partners (name, email, entity_type, created_at, updated_at)
  VALUES ('Family Office LP', 'lp3@test.com', 'institution', NOW(), NOW())
  RETURNING id INTO lp3_id;

  INSERT INTO lp_fund_commitments (lp_id, fund_id, commitment_amount_cents, commitment_date, commitment_percentage, status, created_at, updated_at)
  VALUES (lp3_id, fund_id, 500000000, '2023-01-01', '5.0000', 'active', NOW(), NOW()); -- $5M commitment (5%)

  INSERT INTO capital_activities (lp_id, fund_id, activity_type, amount_cents, activity_date, created_at, updated_at)
  VALUES (lp3_id, fund_id, 'capital_call', 250000000, '2023-02-01', NOW(), NOW()); -- $2.5M capital call

  INSERT INTO capital_activities (lp_id, fund_id, activity_type, amount_cents, activity_date, distribution_type, created_at, updated_at)
  VALUES (lp3_id, fund_id, 'distribution', 100000000, '2023-12-15', 'return_of_capital', NOW(), NOW()); -- $1M distribution

  RAISE NOTICE 'Created LP3: % (ID: %)', 'lp3@test.com', lp3_id;

  RAISE NOTICE 'LP test data created successfully!';
  RAISE NOTICE 'Fund ID: %, LPs: %, %, %', fund_id, lp1_id, lp2_id, lp3_id;
END $$;

-- Verify data
SELECT 'Fund Created:' as status, id, name, size, vintage_year FROM funds WHERE name = 'Test Venture Fund I';
SELECT 'LPs Created:' as status, COUNT(*) as lp_count FROM limited_partners WHERE email LIKE '%@test.com';
SELECT 'Commitments Created:' as status, COUNT(*) as commitment_count FROM lp_fund_commitments WHERE fund_id IN (SELECT id FROM funds WHERE name = 'Test Venture Fund I');
SELECT 'Capital Activities Created:' as status, COUNT(*) as activity_count FROM capital_activities WHERE fund_id IN (SELECT id FROM funds WHERE name = 'Test Venture Fund I');
