-- Manual migration for fund_configs, fund_snapshots, and fund_events tables

-- Create fund_configs table
CREATE TABLE IF NOT EXISTS fund_configs (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  version INTEGER NOT NULL DEFAULT 1,
  config JSONB NOT NULL,
  is_draft BOOLEAN DEFAULT true,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fund_id, version)
);

-- Create index for fund_configs
CREATE INDEX IF NOT EXISTS fund_configs_fund_version_idx ON fund_configs(fund_id, version);

-- Create fund_snapshots table
CREATE TABLE IF NOT EXISTS fund_snapshots (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  calc_version VARCHAR(20) NOT NULL,
  correlation_id VARCHAR(36) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for fund_snapshots
CREATE INDEX IF NOT EXISTS fund_snapshots_lookup_idx ON fund_snapshots(fund_id, type, created_at DESC);

-- Create fund_events table
CREATE TABLE IF NOT EXISTS fund_events (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  event_type VARCHAR(50) NOT NULL,
  payload JSONB,
  user_id INTEGER REFERENCES users(id),
  correlation_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for fund_events
CREATE INDEX IF NOT EXISTS fund_events_fund_idx ON fund_events(fund_id, created_at DESC);

-- Verify tables were created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('fund_configs', 'fund_snapshots', 'fund_events');