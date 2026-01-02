-- LP Portal Sprint 3 Migration
-- Capital Calls, Distributions with Waterfall/Tax breakdown, Documents, Notifications
--
-- Tables:
--   - lp_capital_calls: Capital call tracking with wire instructions
--   - lp_payment_submissions: Payment submission workflow
--   - lp_distribution_details: Enhanced distributions with waterfall/tax breakdown
--   - lp_documents: Document management
--   - lp_notifications: In-app notifications
--   - lp_notification_preferences: Notification preferences

BEGIN;

-- ============================================================================
-- CAPITAL CALLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS lp_capital_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lp_id INTEGER NOT NULL REFERENCES limited_partners(id) ON DELETE CASCADE,
    fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
    commitment_id INTEGER NOT NULL REFERENCES lp_fund_commitments(id) ON DELETE CASCADE,

    -- Call details
    call_number INTEGER NOT NULL,
    call_amount_cents BIGINT NOT NULL,
    due_date DATE NOT NULL,
    call_date DATE NOT NULL,
    purpose TEXT,

    -- Status tracking: pending -> due -> overdue -> paid (or partial)
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Payment tracking
    paid_amount_cents BIGINT DEFAULT 0,
    paid_date DATE,

    -- Wire instructions (JSON)
    wire_instructions JSONB NOT NULL,

    -- Idempotency and versioning
    idempotency_key VARCHAR(128),
    version BIGINT NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT lp_capital_calls_status_check
        CHECK (status IN ('pending', 'due', 'overdue', 'paid', 'partial')),
    CONSTRAINT lp_capital_calls_amount_check
        CHECK (call_amount_cents > 0),
    CONSTRAINT lp_capital_calls_lp_fund_call_unique
        UNIQUE (lp_id, fund_id, call_number),
    CONSTRAINT lp_capital_calls_idempotency_unique
        UNIQUE (idempotency_key)
);

-- Indexes for capital calls
CREATE INDEX IF NOT EXISTS lp_capital_calls_lp_status_idx ON lp_capital_calls(lp_id, status);
CREATE INDEX IF NOT EXISTS lp_capital_calls_due_date_idx ON lp_capital_calls(due_date);
CREATE INDEX IF NOT EXISTS lp_capital_calls_cursor_idx ON lp_capital_calls(lp_id, call_date DESC, id DESC);

-- ============================================================================
-- PAYMENT SUBMISSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS lp_payment_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES lp_capital_calls(id) ON DELETE CASCADE,

    -- Payment details
    amount_cents BIGINT NOT NULL,
    payment_date DATE NOT NULL,
    reference_number VARCHAR(100) NOT NULL,
    receipt_url VARCHAR(500),

    -- Status workflow: pending -> confirmed/rejected
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,

    -- Audit trail
    submitted_by INTEGER,
    confirmed_by INTEGER,
    confirmed_at TIMESTAMPTZ,
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT lp_payment_submissions_status_check
        CHECK (status IN ('pending', 'confirmed', 'rejected'))
);

CREATE INDEX IF NOT EXISTS lp_payment_submissions_call_id_idx ON lp_payment_submissions(call_id);
CREATE INDEX IF NOT EXISTS lp_payment_submissions_status_idx ON lp_payment_submissions(status);

-- ============================================================================
-- DISTRIBUTION DETAILS
-- ============================================================================

CREATE TABLE IF NOT EXISTS lp_distribution_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lp_id INTEGER NOT NULL REFERENCES limited_partners(id) ON DELETE CASCADE,
    fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
    commitment_id INTEGER NOT NULL REFERENCES lp_fund_commitments(id) ON DELETE CASCADE,

    -- Distribution identification
    distribution_number INTEGER NOT NULL,
    total_amount_cents BIGINT NOT NULL,
    distribution_date DATE NOT NULL,
    distribution_type VARCHAR(30) NOT NULL,

    -- Waterfall breakdown (stored in cents)
    return_of_capital_cents BIGINT NOT NULL DEFAULT 0,
    preferred_return_cents BIGINT NOT NULL DEFAULT 0,
    carried_interest_cents BIGINT NOT NULL DEFAULT 0,
    catch_up_cents BIGINT NOT NULL DEFAULT 0,

    -- Tax breakdown (stored in cents)
    non_taxable_cents BIGINT NOT NULL DEFAULT 0,
    ordinary_income_cents BIGINT NOT NULL DEFAULT 0,
    long_term_gains_cents BIGINT NOT NULL DEFAULT 0,
    qualified_dividends_cents BIGINT NOT NULL DEFAULT 0,

    -- Status and tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    wire_date DATE,
    wire_reference VARCHAR(100),
    notes TEXT,

    -- Idempotency and versioning
    idempotency_key VARCHAR(128),
    version BIGINT NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT lp_distribution_details_status_check
        CHECK (status IN ('pending', 'processing', 'completed')),
    CONSTRAINT lp_distribution_details_type_check
        CHECK (distribution_type IN ('return_of_capital', 'capital_gains', 'dividend', 'mixed')),
    CONSTRAINT lp_distribution_details_lp_fund_dist_unique
        UNIQUE (lp_id, fund_id, distribution_number),
    CONSTRAINT lp_distribution_details_idempotency_unique
        UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS lp_distribution_details_lp_date_idx ON lp_distribution_details(lp_id, distribution_date DESC);
CREATE INDEX IF NOT EXISTS lp_distribution_details_year_idx ON lp_distribution_details(EXTRACT(YEAR FROM distribution_date));
CREATE INDEX IF NOT EXISTS lp_distribution_details_cursor_idx ON lp_distribution_details(lp_id, distribution_date DESC, id DESC);

-- ============================================================================
-- LP DOCUMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS lp_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lp_id INTEGER NOT NULL REFERENCES limited_partners(id) ON DELETE CASCADE,
    fund_id INTEGER REFERENCES funds(id) ON DELETE CASCADE,

    -- Document metadata
    document_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- File info
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    storage_key VARCHAR(500) NOT NULL,

    -- Dates
    document_date DATE,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Access control
    access_level VARCHAR(20) NOT NULL DEFAULT 'standard',
    status VARCHAR(20) NOT NULL DEFAULT 'available',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT lp_documents_type_check
        CHECK (document_type IN ('quarterly_report', 'annual_report', 'k1', 'lpa', 'side_letter', 'fund_overview', 'other')),
    CONSTRAINT lp_documents_access_level_check
        CHECK (access_level IN ('standard', 'sensitive')),
    CONSTRAINT lp_documents_status_check
        CHECK (status IN ('available', 'archived'))
);

CREATE INDEX IF NOT EXISTS lp_documents_lp_id_idx ON lp_documents(lp_id);
CREATE INDEX IF NOT EXISTS lp_documents_type_idx ON lp_documents(document_type);
CREATE INDEX IF NOT EXISTS lp_documents_fund_id_idx ON lp_documents(fund_id);
CREATE INDEX IF NOT EXISTS lp_documents_published_idx ON lp_documents(published_at DESC);

-- Full-text search index for document search
CREATE INDEX IF NOT EXISTS lp_documents_search_idx ON lp_documents
    USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- ============================================================================
-- LP NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS lp_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lp_id INTEGER NOT NULL REFERENCES limited_partners(id) ON DELETE CASCADE,

    -- Notification content
    type VARCHAR(30) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,

    -- Link to related entity
    related_entity_type VARCHAR(30),
    related_entity_id UUID,
    action_url VARCHAR(500),

    -- Status
    read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,

    -- Lifecycle
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT lp_notifications_type_check
        CHECK (type IN ('capital_call', 'distribution', 'report_ready', 'document', 'system')),
    CONSTRAINT lp_notifications_entity_type_check
        CHECK (related_entity_type IS NULL OR related_entity_type IN ('capital_call', 'distribution', 'report', 'document'))
);

-- Optimized index for unread notifications badge
CREATE INDEX IF NOT EXISTS lp_notifications_lp_unread_idx ON lp_notifications(lp_id, read)
    WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS lp_notifications_created_idx ON lp_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS lp_notifications_expires_idx ON lp_notifications(expires_at);

-- ============================================================================
-- LP NOTIFICATION PREFERENCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS lp_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lp_id INTEGER NOT NULL REFERENCES limited_partners(id) ON DELETE CASCADE,

    -- Email preferences
    email_capital_calls BOOLEAN NOT NULL DEFAULT TRUE,
    email_distributions BOOLEAN NOT NULL DEFAULT TRUE,
    email_quarterly_reports BOOLEAN NOT NULL DEFAULT TRUE,
    email_annual_reports BOOLEAN NOT NULL DEFAULT TRUE,
    email_market_updates BOOLEAN NOT NULL DEFAULT FALSE,

    -- In-app preferences
    in_app_capital_calls BOOLEAN NOT NULL DEFAULT TRUE,
    in_app_distributions BOOLEAN NOT NULL DEFAULT TRUE,
    in_app_reports BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT lp_notification_preferences_lp_unique UNIQUE (lp_id)
);

-- ============================================================================
-- TRIGGER: Updated at timestamps
-- ============================================================================

-- Create or replace function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for all Sprint 3 tables
DROP TRIGGER IF EXISTS update_lp_capital_calls_updated_at ON lp_capital_calls;
CREATE TRIGGER update_lp_capital_calls_updated_at
    BEFORE UPDATE ON lp_capital_calls
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_lp_payment_submissions_updated_at ON lp_payment_submissions;
CREATE TRIGGER update_lp_payment_submissions_updated_at
    BEFORE UPDATE ON lp_payment_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_lp_distribution_details_updated_at ON lp_distribution_details;
CREATE TRIGGER update_lp_distribution_details_updated_at
    BEFORE UPDATE ON lp_distribution_details
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_lp_documents_updated_at ON lp_documents;
CREATE TRIGGER update_lp_documents_updated_at
    BEFORE UPDATE ON lp_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_lp_notification_preferences_updated_at ON lp_notification_preferences;
CREATE TRIGGER update_lp_notification_preferences_updated_at
    BEFORE UPDATE ON lp_notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
--
-- Sprint 3 LP Portal Tables:
-- 1. lp_capital_calls - Track capital calls with wire instructions, payment status
-- 2. lp_payment_submissions - LP-submitted payment confirmations for GP review
-- 3. lp_distribution_details - Distributions with waterfall and tax breakdown
-- 4. lp_documents - Document management (K-1s, LPA, reports)
-- 5. lp_notifications - In-app notification system
-- 6. lp_notification_preferences - Per-LP notification settings
--
-- Key Features:
-- - Idempotency keys for safe retries
-- - Optimistic locking via version columns
-- - Cursor-based pagination indexes
-- - Full-text search for documents
-- - Partial index for unread notifications (performance)
--
-- To run: psql $DATABASE_URL -f migrations/004_lp_sprint3_tables.sql
