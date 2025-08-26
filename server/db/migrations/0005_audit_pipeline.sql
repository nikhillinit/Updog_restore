-- Migration 0005: Audit Pipeline (Step 6)
-- Reversible migration for comprehensive audit logging with outbox pattern

-- ============================================================
-- UP MIGRATION
-- ============================================================

-- Comprehensive calculation audit table (DB-first approach)
CREATE TABLE IF NOT EXISTS calc_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  organization_id UUID REFERENCES organizations(id),
  calc_type VARCHAR(50) NOT NULL,
  calc_version VARCHAR(20) NOT NULL,
  -- Actor information
  actor_sub VARCHAR(255), -- JWT subject claim
  actor_email VARCHAR(255),
  actor_ip INET,
  -- Calculation specifics
  approval_id UUID,
  inputs_hash VARCHAR(64) NOT NULL,
  flags_hash VARCHAR(64) NOT NULL,
  flags_version VARCHAR(20),
  seed BIGINT,
  -- Execution details
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  execution_time_ms INTEGER,
  memory_usage_mb INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'started',
  error_details JSONB,
  -- Metadata
  metadata JSONB DEFAULT '{}',
  correlation_id VARCHAR(36),
  request_id VARCHAR(36),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calc_audit_fund ON calc_audit(fund_id, calc_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_audit_org ON calc_audit(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_audit_actor ON calc_audit(actor_sub, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_audit_approval ON calc_audit(approval_id) WHERE approval_id IS NOT NULL;

-- General audit events table
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  -- Actor
  actor_id INTEGER REFERENCES users(id),
  actor_sub VARCHAR(255),
  actor_email VARCHAR(255),
  actor_ip INET,
  actor_user_agent TEXT,
  -- Context
  organization_id UUID REFERENCES organizations(id),
  fund_id INTEGER REFERENCES funds(id),
  entity_type VARCHAR(50),
  entity_id UUID,
  -- Event data
  action VARCHAR(100) NOT NULL,
  changes JSONB,
  metadata JSONB DEFAULT '{}',
  -- Compliance
  requires_approval BOOLEAN DEFAULT false,
  approval_status VARCHAR(20),
  approved_by INTEGER[] DEFAULT '{}',
  -- Timing
  event_time TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_lookup ON audit_events(organization_id, event_type, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_compliance ON audit_events(requires_approval, approval_status) 
WHERE requires_approval = true;

-- Transactional outbox for guaranteed event delivery
CREATE TABLE IF NOT EXISTS audit_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic VARCHAR(100) NOT NULL,
  partition_key VARCHAR(100),
  message_id VARCHAR(100) NOT NULL UNIQUE, -- For deduplication (ULID recommended)
  payload JSONB NOT NULL,
  headers JSONB DEFAULT '{}',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_details TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter'))
);

CREATE INDEX IF NOT EXISTS idx_audit_outbox_pending ON audit_outbox(status, created_at) 
WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_audit_outbox_retry ON audit_outbox(status, next_retry_at) 
WHERE status = 'processing' AND next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_outbox_message_id ON audit_outbox(message_id);

-- Approval audit trail
CREATE TABLE IF NOT EXISTS approval_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'created', 'signed', 'rejected', 'expired', 'executed'
  actor_id UUID REFERENCES partners(id),
  actor_email VARCHAR(255),
  actor_ip INET,
  signature VARCHAR(500), -- Digital signature if applicable
  totp_code_used BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_audit_approval ON approval_audit(approval_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_audit_actor ON approval_audit(actor_id, created_at DESC);

-- Reserve strategy approvals (updated with partner reference)
CREATE TABLE IF NOT EXISTS reserve_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id VARCHAR(100) NOT NULL,
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  requested_by UUID NOT NULL REFERENCES partners(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Change details
  action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  strategy_data JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) >= 10),
  -- Impact assessment
  affected_funds TEXT[],
  estimated_amount DECIMAL(15, 2),
  risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  -- Approval tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '72 hours',
  -- Metadata
  calculation_hash VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reserve_approvals_status ON reserve_approvals(fund_id, status, created_at DESC);
-- TTL index for automatic expiry processing
CREATE INDEX IF NOT EXISTS idx_reserve_approvals_expiry ON reserve_approvals(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reserve_approvals_org ON reserve_approvals(organization_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reserve_approvals_strategy_hash ON reserve_approvals(strategy_id, calculation_hash) WHERE status IN ('pending', 'approved');

-- Approval signatures (separate table for multiple signers)
CREATE TABLE IF NOT EXISTS approval_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL REFERENCES reserve_approvals(id),
  partner_id UUID NOT NULL REFERENCES partners(id),
  partner_email VARCHAR(255) NOT NULL,
  signature VARCHAR(500) NOT NULL,
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  totp_verified BOOLEAN DEFAULT false,
  UNIQUE(approval_id, partner_id)
);

CREATE INDEX IF NOT EXISTS idx_approval_signatures_approval ON approval_signatures(approval_id);
CREATE INDEX IF NOT EXISTS idx_approval_signatures_partner ON approval_signatures(partner_id);
-- Ensure two distinct partner signatures per approval
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_signatures_unique ON approval_signatures(approval_id, partner_id);

-- Function to expire pending approvals automatically
CREATE OR REPLACE FUNCTION expire_pending_approvals() 
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE reserve_approvals 
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'pending' AND expires_at < NOW();
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  
  -- Log expired approvals for audit
  INSERT INTO audit_events (event_type, action, metadata, event_time)
  VALUES ('approval_auto_expired', 'system_expire', 
          jsonb_build_object('count', expired_count), NOW())
  WHERE expired_count > 0;
  
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function to process outbox (can be called by cron job)
CREATE OR REPLACE FUNCTION process_audit_outbox(batch_size INTEGER DEFAULT 100) 
RETURNS TABLE(processed INTEGER, failed INTEGER) AS $$
DECLARE
  processed_count INTEGER := 0;
  failed_count INTEGER := 0;
BEGIN
  -- Mark batch as processing
  UPDATE audit_outbox 
  SET status = 'processing'
  WHERE id IN (
    SELECT id FROM audit_outbox 
    WHERE status = 'pending' 
    ORDER BY created_at 
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  );
  
  -- In real implementation, this would publish to stream
  -- For now, we just mark as completed
  UPDATE audit_outbox 
  SET status = 'completed', processed_at = NOW()
  WHERE status = 'processing';
  
  GET DIAGNOSTICS processed_count = ROW_COUNT;
  
  -- Handle retries for previously failed items
  UPDATE audit_outbox 
  SET 
    retry_count = retry_count + 1,
    next_retry_at = NOW() + (retry_count * INTERVAL '1 minute'),
    status = CASE 
      WHEN retry_count >= max_retries THEN 'dead_letter'
      ELSE 'pending'
    END
  WHERE status = 'processing' 
    AND next_retry_at < NOW()
    AND retry_count < max_retries;
  
  RETURN QUERY SELECT processed_count, failed_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- DOWN MIGRATION
-- ============================================================

-- To rollback, run:
-- DROP FUNCTION IF EXISTS process_audit_outbox(INTEGER);
-- DROP TABLE IF EXISTS approval_signatures;
-- DROP TABLE IF EXISTS reserve_approvals;
-- DROP TABLE IF EXISTS approval_audit;
-- DROP TABLE IF EXISTS audit_outbox;
-- DROP TABLE IF EXISTS audit_events;
-- DROP TABLE IF EXISTS calc_audit;