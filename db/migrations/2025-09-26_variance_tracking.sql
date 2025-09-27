-- Variance Tracking Migration
-- Created: 2025-09-26
-- Description: Add comprehensive variance tracking infrastructure for fund performance monitoring

BEGIN;

-- Create fund_baselines table for storing baseline performance metrics
CREATE TABLE IF NOT EXISTS fund_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id),

  -- Baseline identification
  name TEXT NOT NULL,
  description TEXT,
  baseline_type TEXT NOT NULL CHECK (baseline_type IN ('initial', 'quarterly', 'annual', 'milestone', 'custom')),

  -- Baseline period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  snapshot_date TIMESTAMPTZ NOT NULL,

  -- Core baseline metrics
  total_value DECIMAL(15,2) NOT NULL,
  deployed_capital DECIMAL(15,2) NOT NULL,
  irr DECIMAL(5,4),
  multiple DECIMAL(5,2),
  dpi DECIMAL(5,2),
  tvpi DECIMAL(5,2),

  -- Portfolio composition baseline
  portfolio_count INTEGER NOT NULL DEFAULT 0,
  average_investment DECIMAL(15,2),
  top_performers JSONB,
  sector_distribution JSONB,
  stage_distribution JSONB,

  -- Reserve and pacing baselines
  reserve_allocation JSONB,
  pacing_metrics JSONB,

  -- Baseline status and metadata
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  confidence DECIMAL(3,2) DEFAULT 1.00,

  -- Version and lineage
  version TEXT NOT NULL DEFAULT '1.0.0',
  parent_baseline_id UUID REFERENCES fund_baselines(id),
  source_snapshot_id UUID REFERENCES fund_state_snapshots(id),

  -- User context
  created_by INTEGER NOT NULL REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  tags TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_period CHECK (period_end > period_start),
  CONSTRAINT valid_confidence CHECK (confidence >= 0.00 AND confidence <= 1.00)
);

-- Create indexes for fund_baselines
CREATE INDEX IF NOT EXISTS fund_baselines_fund_idx ON fund_baselines(fund_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fund_baselines_period_idx ON fund_baselines(period_start, period_end);
CREATE INDEX IF NOT EXISTS fund_baselines_type_idx ON fund_baselines(baseline_type, is_active);
CREATE INDEX IF NOT EXISTS fund_baselines_default_idx ON fund_baselines(fund_id, is_default, is_active);
CREATE INDEX IF NOT EXISTS fund_baselines_snapshot_idx ON fund_baselines(source_snapshot_id);
CREATE INDEX IF NOT EXISTS fund_baselines_tags_gin_idx ON fund_baselines USING gin(tags);

-- Create variance_reports table for tracking performance variance from baselines
CREATE TABLE IF NOT EXISTS variance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  baseline_id UUID NOT NULL REFERENCES fund_baselines(id),

  -- Report identification
  report_name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('periodic', 'milestone', 'ad_hoc', 'alert_triggered')),
  report_period TEXT,

  -- Analysis period
  analysis_start TIMESTAMPTZ NOT NULL,
  analysis_end TIMESTAMPTZ NOT NULL,
  as_of_date TIMESTAMPTZ NOT NULL,

  -- Current metrics (for comparison)
  current_metrics JSONB NOT NULL,
  baseline_metrics JSONB NOT NULL,

  -- Variance calculations
  total_value_variance DECIMAL(15,2),
  total_value_variance_pct DECIMAL(5,4),
  irr_variance DECIMAL(5,4),
  multiple_variance DECIMAL(5,2),
  dpi_variance DECIMAL(5,2),
  tvpi_variance DECIMAL(5,2),

  -- Portfolio variance analysis
  portfolio_variances JSONB,
  sector_variances JSONB,
  stage_variances JSONB,

  -- Reserve and pacing variance
  reserve_variances JSONB,
  pacing_variances JSONB,

  -- Variance summary and insights
  overall_variance_score DECIMAL(5,2),
  significant_variances JSONB,
  variance_factors JSONB,

  -- Alert and threshold information
  alerts_triggered JSONB,
  threshold_breaches JSONB,
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),

  -- Report metadata
  calculation_engine TEXT NOT NULL DEFAULT 'variance-v1',
  calculation_duration_ms INTEGER,
  data_quality_score DECIMAL(3,2),

  -- User context and workflow
  generated_by INTEGER REFERENCES users(id),
  reviewed_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'archived')),

  -- Sharing and access
  is_public BOOLEAN DEFAULT false,
  shared_with TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_analysis_period CHECK (analysis_end >= analysis_start),
  CONSTRAINT valid_data_quality CHECK (data_quality_score IS NULL OR (data_quality_score >= 0.00 AND data_quality_score <= 1.00))
);

-- Create indexes for variance_reports
CREATE INDEX IF NOT EXISTS variance_reports_fund_idx ON variance_reports(fund_id, created_at DESC);
CREATE INDEX IF NOT EXISTS variance_reports_baseline_idx ON variance_reports(baseline_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS variance_reports_period_idx ON variance_reports(analysis_start, analysis_end);
CREATE INDEX IF NOT EXISTS variance_reports_type_idx ON variance_reports(report_type, status);
CREATE INDEX IF NOT EXISTS variance_reports_risk_idx ON variance_reports(risk_level, created_at DESC);
CREATE INDEX IF NOT EXISTS variance_reports_status_idx ON variance_reports(status, updated_at DESC);

-- Create performance_alerts table for tracking and managing variance-based alerts
CREATE TABLE IF NOT EXISTS performance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  baseline_id UUID REFERENCES fund_baselines(id),
  variance_report_id UUID REFERENCES variance_reports(id),

  -- Alert identification and classification
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical', 'urgent')),
  category TEXT NOT NULL CHECK (category IN ('performance', 'risk', 'operational', 'compliance')),

  -- Alert content
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  recommendations JSONB,

  -- Threshold and trigger information
  metric_name TEXT NOT NULL,
  threshold_value DECIMAL(15,4),
  actual_value DECIMAL(15,4),
  variance_amount DECIMAL(15,4),
  variance_percentage DECIMAL(5,4),

  -- Alert timing and frequency
  triggered_at TIMESTAMPTZ NOT NULL,
  first_occurrence TIMESTAMPTZ,
  last_occurrence TIMESTAMPTZ,
  occurrence_count INTEGER DEFAULT 1,

  -- Alert lifecycle management
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'investigating', 'resolved', 'dismissed')),
  acknowledged_by INTEGER REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  -- Related entities and context
  affected_entities JSONB,
  context_data JSONB,

  -- Notification and escalation
  notifications_sent JSONB,
  escalation_level INTEGER DEFAULT 0,
  escalated_at TIMESTAMPTZ,
  escalated_to TEXT[],

  -- Alert configuration reference
  rule_id UUID,
  rule_version TEXT,

  -- Performance and metadata
  detection_latency_ms INTEGER,
  processing_time_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_occurrence_count CHECK (occurrence_count >= 1),
  CONSTRAINT valid_escalation_level CHECK (escalation_level >= 0)
);

-- Create indexes for performance_alerts
CREATE INDEX IF NOT EXISTS performance_alerts_fund_idx ON performance_alerts(fund_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS performance_alerts_severity_idx ON performance_alerts(severity, status, triggered_at DESC);
CREATE INDEX IF NOT EXISTS performance_alerts_status_idx ON performance_alerts(status, triggered_at DESC);
CREATE INDEX IF NOT EXISTS performance_alerts_metric_idx ON performance_alerts(metric_name, triggered_at DESC);
CREATE INDEX IF NOT EXISTS performance_alerts_baseline_idx ON performance_alerts(baseline_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS performance_alerts_report_idx ON performance_alerts(variance_report_id);
CREATE INDEX IF NOT EXISTS performance_alerts_escalation_idx ON performance_alerts(escalation_level, escalated_at DESC);

-- Create alert_rules table for configuration of automated alert generation
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER REFERENCES funds(id),

  -- Rule identification
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('threshold', 'trend', 'deviation', 'pattern')),

  -- Rule configuration
  metric_name TEXT NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('gt', 'lt', 'eq', 'gte', 'lte', 'between')),
  threshold_value DECIMAL(15,4),
  secondary_threshold DECIMAL(15,4),

  -- Alert settings
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical', 'urgent')),
  category TEXT NOT NULL DEFAULT 'performance' CHECK (category IN ('performance', 'risk', 'operational', 'compliance')),
  is_enabled BOOLEAN DEFAULT true,

  -- Frequency and timing
  check_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (check_frequency IN ('realtime', 'hourly', 'daily', 'weekly')),
  suppression_period_minutes INTEGER DEFAULT 60,

  -- Escalation configuration
  escalation_rules JSONB,
  notification_channels TEXT[] DEFAULT '{email}',

  -- Rule conditions and filters
  conditions JSONB,
  filters JSONB,

  -- User management
  created_by INTEGER NOT NULL REFERENCES users(id),
  last_modified_by INTEGER REFERENCES users(id),

  -- Audit and versioning
  version TEXT NOT NULL DEFAULT '1.0.0',
  last_triggered TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_suppression_period CHECK (suppression_period_minutes >= 1),
  CONSTRAINT valid_trigger_count CHECK (trigger_count >= 0),
  CONSTRAINT secondary_threshold_required CHECK (
    operator != 'between' OR secondary_threshold IS NOT NULL
  )
);

-- Create indexes for alert_rules
CREATE INDEX IF NOT EXISTS alert_rules_fund_idx ON alert_rules(fund_id, is_enabled);
CREATE INDEX IF NOT EXISTS alert_rules_metric_idx ON alert_rules(metric_name, is_enabled);
CREATE INDEX IF NOT EXISTS alert_rules_enabled_idx ON alert_rules(is_enabled, check_frequency);
CREATE INDEX IF NOT EXISTS alert_rules_last_triggered_idx ON alert_rules(last_triggered DESC);

-- Add constraint to ensure only one default baseline per fund
CREATE UNIQUE INDEX IF NOT EXISTS fund_baselines_default_unique
ON fund_baselines(fund_id)
WHERE is_default = true AND is_active = true;

-- Add updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Add updated_at triggers for all variance tracking tables
CREATE TRIGGER update_fund_baselines_updated_at
  BEFORE UPDATE ON fund_baselines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_variance_reports_updated_at
  BEFORE UPDATE ON variance_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_performance_alerts_updated_at
  BEFORE UPDATE ON performance_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alert_rules_updated_at
  BEFORE UPDATE ON alert_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for common variance tracking queries
CREATE OR REPLACE VIEW active_baselines AS
SELECT
  b.*,
  f.name as fund_name,
  u.username as created_by_name
FROM fund_baselines b
JOIN funds f ON b.fund_id = f.id
JOIN users u ON b.created_by = u.id
WHERE b.is_active = true
ORDER BY b.fund_id, b.created_at DESC;

CREATE OR REPLACE VIEW critical_alerts AS
SELECT
  a.*,
  f.name as fund_name,
  b.name as baseline_name
FROM performance_alerts a
JOIN funds f ON a.fund_id = f.id
LEFT JOIN fund_baselines b ON a.baseline_id = b.id
WHERE a.status IN ('active', 'acknowledged')
  AND a.severity IN ('critical', 'urgent')
ORDER BY a.triggered_at DESC;

CREATE OR REPLACE VIEW variance_summary AS
SELECT
  r.id,
  r.fund_id,
  f.name as fund_name,
  r.report_name,
  r.risk_level,
  r.overall_variance_score,
  r.status,
  r.as_of_date,
  r.created_at,
  b.name as baseline_name,
  (SELECT COUNT(*) FROM performance_alerts pa WHERE pa.variance_report_id = r.id) as alert_count
FROM variance_reports r
JOIN funds f ON r.fund_id = f.id
JOIN fund_baselines b ON r.baseline_id = b.id
ORDER BY r.created_at DESC;

-- Insert sample alert rules for demonstration (optional)
-- These can be removed in production
/*
INSERT INTO alert_rules (
  name,
  description,
  rule_type,
  metric_name,
  operator,
  threshold_value,
  severity,
  category,
  created_by
) VALUES
(
  'Total Value Variance Alert',
  'Alert when total value variance exceeds 20%',
  'threshold',
  'totalValue',
  'gt',
  0.20,
  'warning',
  'performance',
  1
),
(
  'IRR Decline Alert',
  'Alert when IRR drops by more than 5%',
  'threshold',
  'irr',
  'lt',
  -0.05,
  'critical',
  'performance',
  1
);
*/

COMMIT;

-- Add comment with migration information
COMMENT ON TABLE fund_baselines IS 'Stores baseline performance metrics for variance comparison and tracking';
COMMENT ON TABLE variance_reports IS 'Contains variance analysis reports comparing current performance to baselines';
COMMENT ON TABLE performance_alerts IS 'Tracks performance alerts triggered by variance threshold breaches';
COMMENT ON TABLE alert_rules IS 'Configuration for automated alert generation based on variance thresholds';

-- Migration completed successfully
-- Tables created: fund_baselines, variance_reports, performance_alerts, alert_rules
-- Indexes created: 15 indexes for optimal query performance
-- Views created: active_baselines, critical_alerts, variance_summary
-- Triggers created: updated_at triggers for all tables