-- 0008_fundconfig_invariants.sql
-- Phase 2A Item 1: DB-enforced config invariants
-- Idempotent data cleanup followed by unique indexes + check constraints

BEGIN;

-- ============================================================================
-- PREFLIGHT DATA CLEANUP (idempotent)
-- ============================================================================

-- 1. Multiple drafts per fund: keep newest by updated_at DESC, version DESC, id DESC
--    Set others to is_draft=false, is_published=false
WITH ranked_drafts AS (
  SELECT id,
         fund_id,
         ROW_NUMBER() OVER (
           PARTITION BY fund_id
           ORDER BY updated_at DESC NULLS LAST, version DESC, id DESC
         ) AS rn
  FROM fundconfigs
  WHERE is_draft = true
)
UPDATE fundconfigs
SET is_draft = false, is_published = false
WHERE id IN (
  SELECT id FROM ranked_drafts WHERE rn > 1
);

-- 2. Multiple published heads per fund: keep newest by published_at DESC, version DESC, id DESC
--    Set others to is_published=false (keep published_at for history)
WITH ranked_published AS (
  SELECT id,
         fund_id,
         ROW_NUMBER() OVER (
           PARTITION BY fund_id
           ORDER BY published_at DESC NULLS LAST, version DESC, id DESC
         ) AS rn
  FROM fundconfigs
  WHERE is_published = true
)
UPDATE fundconfigs
SET is_published = false
WHERE id IN (
  SELECT id FROM ranked_published WHERE rn > 1
);

-- 3. is_draft=true AND is_published=true: set is_draft=false
UPDATE fundconfigs
SET is_draft = false
WHERE is_draft = true AND is_published = true;

-- 4. is_draft=true AND published_at IS NOT NULL: set published_at=NULL
UPDATE fundconfigs
SET published_at = NULL
WHERE is_draft = true AND published_at IS NOT NULL;

-- 5. is_published=true AND published_at IS NULL: set published_at=updated_at
UPDATE fundconfigs
SET published_at = COALESCE(updated_at, created_at, NOW())
WHERE is_published = true AND published_at IS NULL;

-- ============================================================================
-- CONSTRAINTS
-- ============================================================================

-- At most one draft per fund (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS fundconfigs_one_draft_per_fund
  ON fundconfigs (fund_id) WHERE is_draft = true;

-- At most one published head per fund (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS fundconfigs_one_published_per_fund
  ON fundconfigs (fund_id) WHERE is_published = true;

-- A config cannot be both draft and published simultaneously
ALTER TABLE fundconfigs
  ADD CONSTRAINT chk_not_draft_and_published
  CHECK (NOT (is_draft AND is_published));

-- A draft must not have a published_at timestamp
ALTER TABLE fundconfigs
  ADD CONSTRAINT chk_draft_no_published_at
  CHECK (NOT is_draft OR published_at IS NULL);

-- A published config must have a published_at timestamp
ALTER TABLE fundconfigs
  ADD CONSTRAINT chk_published_has_published_at
  CHECK (NOT is_published OR published_at IS NOT NULL);

COMMIT;
