-- Simple Manual LP Test Data Seed
-- Creates: 1 fund, 3 LPs with commitments and activities
-- Usage: PGPASSWORD=postgres "/c/Program Files/PostgreSQL/17/bin/psql.exe" -U postgres -h localhost -d povc_dev < .claude/testing/manual-lp-seed-simple.sql

-- Clean existing test data
DELETE FROM capital_activities WHERE commitment_id IN (
  SELECT id FROM lp_fund_commitments WHERE fund_id IN (
    SELECT id FROM funds WHERE name = 'Test Venture Fund I'
  )
);
DELETE FROM lp_fund_commitments WHERE fund_id IN (SELECT id FROM funds WHERE name = 'Test Venture Fund I');
DELETE FROM limited_partners WHERE email LIKE '%@test.com';
DELETE FROM funds WHERE name = 'Test Venture Fund I';

-- Create test fund
INSERT INTO funds (name, size, vintage_year, status, management_fee, carry_percentage, created_at)
VALUES ('Test Venture Fund I', '100000000', 2023, 'active', '0.02', '0.20', NOW());

-- Create LP 1
INSERT INTO limited_partners (name, email, entity_type, created_at, updated_at)
VALUES ('Institutional LP 1', 'lp1@test.com', 'institution', NOW(), NOW());

INSERT INTO lp_fund_commitments (lp_id, fund_id, commitment_amount_cents, commitment_date, commitment_percentage, status, created_at, updated_at)
SELECT
  (SELECT id FROM limited_partners WHERE email = 'lp1@test.com'),
  (SELECT id FROM funds WHERE name = 'Test Venture Fund I'),
  1000000000,
  '2023-01-01',
  '10.0000',
  'active',
  NOW(),
  NOW();

INSERT INTO capital_activities (commitment_id, fund_id, activity_type, amount_cents, activity_date, effective_date, created_at, updated_at)
SELECT
  (SELECT id FROM lp_fund_commitments WHERE lp_id = (SELECT id FROM limited_partners WHERE email = 'lp1@test.com')),
  (SELECT id FROM funds WHERE name = 'Test Venture Fund I'),
  'capital_call',
  500000000,
  '2023-02-01',
  '2023-02-01',
  NOW(),
  NOW();

INSERT INTO capital_activities (commitment_id, fund_id, activity_type, amount_cents, activity_date, effective_date, created_at, updated_at)
SELECT
  (SELECT id FROM lp_fund_commitments WHERE lp_id = (SELECT id FROM limited_partners WHERE email = 'lp1@test.com')),
  (SELECT id FROM funds WHERE name = 'Test Venture Fund I'),
  'distribution',
  200000000,
  '2023-12-15',
  '2023-12-15',
  NOW(),
  NOW();

-- Create LP 2
INSERT INTO limited_partners (name, email, entity_type, created_at, updated_at)
VALUES ('Institutional LP 2', 'lp2@test.com', 'institution', NOW(), NOW());

INSERT INTO lp_fund_commitments (lp_id, fund_id, commitment_amount_cents, commitment_date, commitment_percentage, status, created_at, updated_at)
SELECT
  (SELECT id FROM limited_partners WHERE email = 'lp2@test.com'),
  (SELECT id FROM funds WHERE name = 'Test Venture Fund I'),
  2000000000,
  '2023-01-01',
  '20.0000',
  'active',
  NOW(),
  NOW();

INSERT INTO capital_activities (commitment_id, fund_id, activity_type, amount_cents, activity_date, effective_date, created_at, updated_at)
SELECT
  (SELECT id FROM lp_fund_commitments WHERE lp_id = (SELECT id FROM limited_partners WHERE email = 'lp2@test.com')),
  (SELECT id FROM funds WHERE name = 'Test Venture Fund I'),
  'capital_call',
  1000000000,
  '2023-02-01',
  '2023-02-01',
  NOW(),
  NOW();

INSERT INTO capital_activities (commitment_id, fund_id, activity_type, amount_cents, activity_date, effective_date, created_at, updated_at)
SELECT
  (SELECT id FROM lp_fund_commitments WHERE lp_id = (SELECT id FROM limited_partners WHERE email = 'lp2@test.com')),
  (SELECT id FROM funds WHERE name = 'Test Venture Fund I'),
  'distribution',
  400000000,
  '2023-12-15',
  '2023-12-15',
  NOW(),
  NOW();

-- Create LP 3
INSERT INTO limited_partners (name, email, entity_type, created_at, updated_at)
VALUES ('Family Office LP', 'lp3@test.com', 'institution', NOW(), NOW());

INSERT INTO lp_fund_commitments (lp_id, fund_id, commitment_amount_cents, commitment_date, commitment_percentage, status, created_at, updated_at)
SELECT
  (SELECT id FROM limited_partners WHERE email = 'lp3@test.com'),
  (SELECT id FROM funds WHERE name = 'Test Venture Fund I'),
  500000000,
  '2023-01-01',
  '5.0000',
  'active',
  NOW(),
  NOW();

INSERT INTO capital_activities (commitment_id, fund_id, activity_type, amount_cents, activity_date, effective_date, created_at, updated_at)
SELECT
  (SELECT id FROM lp_fund_commitments WHERE lp_id = (SELECT id FROM limited_partners WHERE email = 'lp3@test.com')),
  (SELECT id FROM funds WHERE name = 'Test Venture Fund I'),
  'capital_call',
  250000000,
  '2023-02-01',
  '2023-02-01',
  NOW(),
  NOW();

INSERT INTO capital_activities (commitment_id, fund_id, activity_type, amount_cents, activity_date, effective_date, created_at, updated_at)
SELECT
  (SELECT id FROM lp_fund_commitments WHERE lp_id = (SELECT id FROM limited_partners WHERE email = 'lp3@test.com')),
  (SELECT id FROM funds WHERE name = 'Test Venture Fund I'),
  'distribution',
  100000000,
  '2023-12-15',
  '2023-12-15',
  NOW(),
  NOW();

-- Verify
SELECT 'Test Fund' as item, COUNT(*) as count FROM funds WHERE name = 'Test Venture Fund I'
UNION ALL
SELECT 'LPs', COUNT(*) FROM limited_partners WHERE email LIKE '%@test.com'
UNION ALL
SELECT 'Commitments', COUNT(*) FROM lp_fund_commitments WHERE fund_id = (SELECT id FROM funds WHERE name = 'Test Venture Fund I')
UNION ALL
SELECT 'Activities', COUNT(*) FROM capital_activities WHERE fund_id = (SELECT id FROM funds WHERE name = 'Test Venture Fund I');
