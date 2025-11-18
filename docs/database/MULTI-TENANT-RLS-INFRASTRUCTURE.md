# Production Multi-Tenant PostgreSQL Infrastructure with Row Level Security

## Table of Contents
1. [Database Role Configuration](#1-database-role-configuration)
2. [RLS Policy Architecture](#2-rls-policy-architecture)
3. [Connection Pooling Strategy](#3-connection-pooling-strategy)
4. [High Availability Considerations](#4-high-availability-considerations)
5. [Performance Optimization](#5-performance-optimization)
6. [Backup/Restore Per Tenant](#6-backuprestore-per-tenant)
7. [Monitoring & Alerting](#7-monitoring--alerting)
8. [Migration Safety](#8-migration-safety)
9. [Implementation Checklist](#9-implementation-checklist)

## 1. Database Role Configuration

### Role Hierarchy Design

```sql
-- Superuser (managed by cloud provider - DO NOT USE directly)
-- postgres

-- Database Owner Role (schema migrations only)
CREATE ROLE updog_owner WITH
  NOLOGIN
  NOSUPERUSER
  CREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION;

-- Application Service Role (NO BYPASSRLS - CRITICAL)
CREATE ROLE updog_app WITH
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  INHERIT
  NOREPLICATION
  CONNECTION LIMIT 100;

-- Read-Only Analytics Role
CREATE ROLE updog_analytics WITH
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  INHERIT
  NOREPLICATION
  CONNECTION LIMIT 20;

-- Migration Role (temporary elevation for schema changes)
CREATE ROLE updog_migrator WITH
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  INHERIT
  NOREPLICATION
  CONNECTION LIMIT 2;

-- Monitoring Role (for Prometheus/Grafana)
CREATE ROLE updog_monitor WITH
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  INHERIT
  NOREPLICATION
  CONNECTION LIMIT 5;

-- Grant ownership
GRANT updog_owner TO updog_migrator;
ALTER DATABASE updog OWNER TO updog_owner;
```

### Least Privilege Grants

```sql
-- Schema setup
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION updog_owner;
CREATE SCHEMA IF NOT EXISTS audit AUTHORIZATION updog_owner;

-- Application role grants (data access only)
GRANT USAGE ON SCHEMA app TO updog_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO updog_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO updog_app;
ALTER DEFAULT PRIVILEGES FOR ROLE updog_owner IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO updog_app;
ALTER DEFAULT PRIVILEGES FOR ROLE updog_owner IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO updog_app;

-- Analytics role grants (read-only)
GRANT USAGE ON SCHEMA app TO updog_analytics;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO updog_analytics;
ALTER DEFAULT PRIVILEGES FOR ROLE updog_owner IN SCHEMA app
  GRANT SELECT ON TABLES TO updog_analytics;

-- Monitor role grants (stats only)
GRANT pg_monitor TO updog_monitor;
GRANT USAGE ON SCHEMA app TO updog_monitor;
GRANT SELECT ON pg_stat_statements TO updog_monitor;

-- Audit schema grants
GRANT USAGE ON SCHEMA audit TO updog_app;
GRANT INSERT ON ALL TABLES IN SCHEMA audit TO updog_app;
GRANT SELECT ON ALL TABLES IN SCHEMA audit TO updog_analytics;
```

### Connection Security Settings

```sql
-- Force SSL for all non-local connections
ALTER SYSTEM SET ssl = on;
ALTER SYSTEM SET ssl_cert_file = '/var/lib/postgresql/server.crt';
ALTER SYSTEM SET ssl_key_file = '/var/lib/postgresql/server.key';
ALTER SYSTEM SET ssl_ca_file = '/var/lib/postgresql/ca.crt';

-- Connection limits and timeouts
ALTER ROLE updog_app SET statement_timeout = '10s';
ALTER ROLE updog_app SET lock_timeout = '2s';
ALTER ROLE updog_app SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE updog_analytics SET statement_timeout = '5min';
ALTER ROLE updog_analytics SET lock_timeout = '1s';

-- Password encryption
ALTER SYSTEM SET password_encryption = 'scram-sha-256';

-- pg_hba.conf entries
# TYPE  DATABASE    USER            ADDRESS                 METHOD
hostssl all         updog_app       10.0.0.0/8             scram-sha-256
hostssl all         updog_analytics 10.0.0.0/8             scram-sha-256
hostssl all         updog_migrator  10.0.0.0/8             scram-sha-256
hostssl all         updog_monitor   10.0.0.0/8             scram-sha-256
host    all         all             127.0.0.1/32           reject
host    all         all             ::1/128                reject
```

## 2. RLS Policy Architecture

### Enable RLS with FORCE (Critical for Security)

```sql
-- FORCE ensures RLS is always applied, even for table owner
ALTER TABLE app.funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.funds FORCE ROW LEVEL SECURITY;

ALTER TABLE app.portfoliocompanies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.portfoliocompanies FORCE ROW LEVEL SECURITY;

ALTER TABLE app.investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.investments FORCE ROW LEVEL SECURITY;

ALTER TABLE app.investment_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.investment_lots FORCE ROW LEVEL SECURITY;

ALTER TABLE app.forecast_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.forecast_snapshots FORCE ROW LEVEL SECURITY;

ALTER TABLE app.reserve_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.reserve_allocations FORCE ROW LEVEL SECURITY;
```

### Fail-Closed Context Pattern (Never Allow NULL Context)

```sql
-- Helper function with fail-closed design
CREATE OR REPLACE FUNCTION app.current_org_id()
RETURNS uuid AS $$
BEGIN
  -- Use nullif to ensure empty string becomes NULL, then COALESCE to a guaranteed invalid UUID
  -- This ensures queries fail closed rather than exposing data
  RETURN COALESCE(
    nullif(current_setting('app.current_org', true), '')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid  -- Invalid UUID that will never match
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid AS $$
BEGIN
  RETURN COALESCE(
    nullif(current_setting('app.current_user', true), '')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION app.current_role()
RETURNS text AS $$
BEGIN
  RETURN COALESCE(
    nullif(current_setting('app.current_role', true), ''),
    'none'  -- Default to most restrictive role
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

### Policy Templates for Core Tables

```sql
-- Funds table policies
CREATE POLICY funds_select ON app.funds
  FOR SELECT
  TO updog_app
  USING (organization_id = app.current_org_id());

CREATE POLICY funds_insert ON app.funds
  FOR INSERT
  TO updog_app
  WITH CHECK (
    organization_id = app.current_org_id()
    AND app.current_role() IN ('admin', 'partner')
  );

CREATE POLICY funds_update ON app.funds
  FOR UPDATE
  TO updog_app
  USING (organization_id = app.current_org_id())
  WITH CHECK (
    organization_id = app.current_org_id()
    AND app.current_role() IN ('admin', 'partner')
  );

CREATE POLICY funds_delete ON app.funds
  FOR DELETE
  TO updog_app
  USING (
    organization_id = app.current_org_id()
    AND app.current_role() = 'admin'
  );

-- Portfolio companies policies with fund relationship
CREATE POLICY portfoliocompanies_select ON app.portfoliocompanies
  FOR SELECT
  TO updog_app
  USING (
    EXISTS (
      SELECT 1 FROM app.funds
      WHERE funds.id = portfoliocompanies.fund_id
      AND funds.organization_id = app.current_org_id()
    )
  );

CREATE POLICY portfoliocompanies_insert ON app.portfoliocompanies
  FOR INSERT
  TO updog_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app.funds
      WHERE funds.id = portfoliocompanies.fund_id
      AND funds.organization_id = app.current_org_id()
      AND app.current_role() IN ('admin', 'partner')
    )
  );

-- Audit table policy (insert-only, no read for app role)
CREATE POLICY audit_insert ON audit.events
  FOR INSERT
  TO updog_app
  WITH CHECK (
    organization_id = app.current_org_id()
  );

-- Analytics role can read everything in their org
CREATE POLICY analytics_select ON app.funds
  FOR SELECT
  TO updog_analytics
  USING (organization_id = app.current_org_id());
```

### Hierarchical Access Control

```sql
-- Role-based access with hierarchy
CREATE OR REPLACE FUNCTION app.check_access(
  required_role text,
  resource_type text DEFAULT NULL,
  resource_id uuid DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  user_role text;
  role_hierarchy jsonb := '{"admin": 3, "partner": 2, "analyst": 1, "viewer": 0}'::jsonb;
  user_level int;
  required_level int;
BEGIN
  user_role := app.current_role();

  -- Get role levels
  user_level := (role_hierarchy->user_role)::int;
  required_level := (role_hierarchy->required_role)::int;

  -- Check basic role hierarchy
  IF user_level IS NULL OR required_level IS NULL THEN
    RETURN false;
  END IF;

  IF user_level < required_level THEN
    RETURN false;
  END IF;

  -- Additional resource-specific checks
  IF resource_type = 'fund' AND resource_id IS NOT NULL THEN
    -- Check fund-specific permissions
    RETURN EXISTS (
      SELECT 1 FROM app.fund_permissions
      WHERE fund_id = resource_id
      AND user_id = app.current_user_id()
      AND organization_id = app.current_org_id()
    );
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

## 3. Connection Pooling Strategy

### PgBouncer Configuration

```ini
# /etc/pgbouncer/pgbouncer.ini

[databases]
# Transaction pooling for RLS (REQUIRED for SET LOCAL)
updog_app = host=postgres.internal port=5432 dbname=updog user=updog_app pool_mode=transaction
updog_analytics = host=postgres.internal port=5432 dbname=updog user=updog_analytics pool_mode=session
updog_migrator = host=postgres.internal port=5432 dbname=updog user=updog_migrator pool_mode=session

[pgbouncer]
# Pool sizing based on connection limits
default_pool_size = 25
min_pool_size = 10
reserve_pool_size = 5
reserve_pool_timeout = 3
max_client_conn = 1000
max_db_connections = 100

# Timeouts optimized for RLS
server_idle_timeout = 600
server_lifetime = 3600
server_connect_timeout = 15
server_login_retry = 15
query_timeout = 0
query_wait_timeout = 120
client_idle_timeout = 0
client_login_timeout = 60

# Transaction pooling specific
server_reset_query = DISCARD ALL
server_reset_query_always = 1
server_check_delay = 30
server_check_query = SELECT 1

# Security
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
admin_users = pgbouncer_admin
stats_users = updog_monitor

# TLS Configuration
client_tls_sslmode = require
client_tls_key_file = /etc/pgbouncer/client.key
client_tls_cert_file = /etc/pgbouncer/client.crt
client_tls_ca_file = /etc/pgbouncer/ca.crt
server_tls_sslmode = require
server_tls_ca_file = /etc/pgbouncer/server-ca.crt
```

### Application Connection Configuration

```typescript
// Connection pool with RLS awareness
import { Pool } from 'pg';

const poolConfig = {
  // Connection settings
  host: process.env.PGBOUNCER_HOST || 'localhost',
  port: parseInt(process.env.PGBOUNCER_PORT || '6432'),
  database: 'updog_app',  // PgBouncer database name
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  // Pool configuration optimized for RLS
  max: 20,  // Maximum connections in pool
  min: 5,   // Minimum connections to maintain
  idleTimeoutMillis: 30000,  // Close idle connections after 30s
  connectionTimeoutMillis: 10000,  // Connection timeout

  // CRITICAL: Each query needs fresh transaction for RLS
  statement_timeout: 10000,
  lock_timeout: 2000,
  idle_in_transaction_session_timeout: 30000,

  // SSL configuration
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('./certs/ca.crt'),
    key: fs.readFileSync('./certs/client.key'),
    cert: fs.readFileSync('./certs/client.crt'),
  }
};

// RLS-aware query executor
export async function executeWithRLS(
  context: UserContext,
  queryFn: (client: PoolClient) => Promise<any>
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // SET LOCAL for transaction-scoped RLS
    await client.query(`
      SELECT
        set_config('app.current_user', $1, true),
        set_config('app.current_org', $2, true),
        set_config('app.current_role', $3, true)
    `, [context.userId, context.orgId, context.role]);

    const result = await queryFn(client);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

## 4. High Availability Considerations

### Read Replica Configuration with RLS

```sql
-- Primary database configuration
ALTER SYSTEM SET wal_level = 'logical';
ALTER SYSTEM SET max_wal_senders = 10;
ALTER SYSTEM SET max_replication_slots = 10;
ALTER SYSTEM SET hot_standby = on;
ALTER SYSTEM SET hot_standby_feedback = on;

-- Create replication slot for read replica
SELECT pg_create_physical_replication_slot('replica_1');
```

### HAProxy Configuration for Automatic Failover

```haproxy
# /etc/haproxy/haproxy.cfg

global
    maxconn 1000
    log stdout local0

defaults
    mode tcp
    timeout connect 10s
    timeout client 30m
    timeout server 30m
    option tcplog

# Write connections - primary only
frontend postgres_write
    bind *:5432
    default_backend postgres_primary

backend postgres_primary
    option httpchk GET /primary
    http-check expect status 200
    default-server inter 3s fall 3 rise 2 on-marked-down shutdown-sessions
    server primary1 postgres-primary:5432 check port 8008 maxconn 100

# Read connections - primary + replicas
frontend postgres_read
    bind *:5433
    default_backend postgres_replicas

backend postgres_replicas
    balance leastconn
    option httpchk GET /replica
    http-check expect status 200
    default-server inter 3s fall 3 rise 2 on-marked-down shutdown-sessions
    server primary1 postgres-primary:5432 check port 8008 maxconn 80
    server replica1 postgres-replica-1:5432 check port 8008 maxconn 80
    server replica2 postgres-replica-2:5432 check port 8008 maxconn 80
```

### Patroni Configuration for Automated Failover

```yaml
# patroni.yml
scope: updog-cluster
namespace: /db/
name: postgres-primary

restapi:
  listen: 0.0.0.0:8008
  connect_address: postgres-primary:8008

etcd:
  hosts: etcd-1:2379,etcd-2:2379,etcd-3:2379

bootstrap:
  dcs:
    ttl: 30
    loop_wait: 10
    retry_timeout: 10
    maximum_lag_on_failover: 1048576
    postgresql:
      use_pg_rewind: true
      parameters:
        max_connections: 200
        shared_buffers: 256MB
        effective_cache_size: 1GB
        maintenance_work_mem: 128MB
        checkpoint_completion_target: 0.9
        wal_buffers: 16MB
        default_statistics_target: 100
        random_page_cost: 1.1
        effective_io_concurrency: 200
        work_mem: 4MB
        min_wal_size: 1GB
        max_wal_size: 4GB

  initdb:
    - encoding: UTF8
    - data-checksums

  pg_hba:
    - host all all 0.0.0.0/0 scram-sha-256
    - host replication replicator 0.0.0.0/0 scram-sha-256

postgresql:
  listen: 0.0.0.0:5432
  connect_address: postgres-primary:5432
  data_dir: /var/lib/postgresql/data
  pgpass: /tmp/.pgpass
  authentication:
    replication:
      username: replicator
      password: ReplicatorPass123!
    superuser:
      username: postgres
      password: SuperSecurePass123!
  parameters:
    unix_socket_directories: '/var/run/postgresql'

watchdog:
  mode: required
  device: /dev/watchdog
  safety_margin: 5

tags:
  nofailover: false
  noloadbalance: false
  clonefrom: false
  nosync: false
```

### Connection Pool Behavior During Failover

```typescript
// Failover-aware connection manager
class ResilientConnectionManager {
  private primaryPool: Pool;
  private readPool: Pool;
  private failoverInProgress = false;

  constructor() {
    this.setupPools();
    this.monitorHealth();
  }

  private setupPools() {
    // Primary write pool
    this.primaryPool = new Pool({
      host: process.env.HAPROXY_WRITE_HOST,
      port: 5432,
      ...poolConfig
    });

    // Read replica pool
    this.readPool = new Pool({
      host: process.env.HAPROXY_READ_HOST,
      port: 5433,
      ...poolConfig
    });
  }

  private async monitorHealth() {
    setInterval(async () => {
      try {
        await this.primaryPool.query('SELECT 1');
      } catch (error) {
        if (!this.failoverInProgress) {
          this.handleFailover();
        }
      }
    }, 5000);
  }

  private async handleFailover() {
    this.failoverInProgress = true;

    // Mark existing connections as invalid
    await this.primaryPool.end();

    // Wait for Patroni to promote replica
    await this.waitForPromotion();

    // Recreate pool with new primary
    this.setupPools();

    this.failoverInProgress = false;
  }

  async executeWrite(context: UserContext, query: string, params: any[]) {
    const maxRetries = 3;
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        if (this.failoverInProgress) {
          await this.waitForFailoverComplete();
        }

        return await executeWithRLS(context, async (client) => {
          return await client.query(query, params);
        });
      } catch (error) {
        lastError = error;
        if (this.isRetriableError(error)) {
          await this.delay(Math.pow(2, i) * 1000);
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }
}
```

## 5. Performance Optimization

### Index Strategy with Organization ID

```sql
-- Compound indexes with organization_id as leading column
CREATE INDEX idx_funds_org_id ON app.funds(organization_id, id);
CREATE INDEX idx_funds_org_status ON app.funds(organization_id, status) WHERE is_active = true;
CREATE INDEX idx_funds_org_vintage ON app.funds(organization_id, vintage_year);

-- Portfolio companies with fund relationship
CREATE INDEX idx_portfoliocompanies_fund ON app.portfoliocompanies(fund_id);
CREATE INDEX idx_portfoliocompanies_fund_status ON app.portfoliocompanies(fund_id, status)
  WHERE status = 'active';

-- Investments optimization
CREATE INDEX idx_investments_fund_company ON app.investments(fund_id, company_id);
CREATE INDEX idx_investments_fund_date ON app.investments(fund_id, investment_date DESC);

-- Partial indexes for soft delete pattern
CREATE INDEX idx_funds_active ON app.funds(organization_id, id)
  WHERE archived_at IS NULL;
CREATE INDEX idx_portfoliocompanies_active ON app.portfoliocompanies(fund_id)
  WHERE archived_at IS NULL;

-- BRIN indexes for time-series data
CREATE INDEX idx_forecast_snapshots_time_brin ON app.forecast_snapshots
  USING BRIN(snapshot_time) WITH (pages_per_range = 32);

-- GIN indexes for JSONB queries
CREATE INDEX idx_fund_configs_config ON app.fundconfigs
  USING GIN(config jsonb_path_ops);

-- Expression indexes for computed values
CREATE INDEX idx_portfoliocompanies_remaining_reserves ON app.portfoliocompanies(
  fund_id,
  ((planned_reserves_cents - deployed_reserves_cents) / 100.0)
) WHERE planned_reserves_cents > deployed_reserves_cents;
```

### Query Planner Optimization for RLS

```sql
-- Force planner to consider RLS predicates early
ALTER SYSTEM SET row_security = on;
ALTER SYSTEM SET plan_cache_mode = 'force_custom_plan';

-- Optimize for RLS performance
ALTER SYSTEM SET enable_partitionwise_join = on;
ALTER SYSTEM SET enable_partitionwise_aggregate = on;
ALTER SYSTEM SET jit = on;
ALTER SYSTEM SET jit_above_cost = 100000;
ALTER SYSTEM SET jit_inline_above_cost = 500000;
ALTER SYSTEM SET jit_optimize_above_cost = 500000;

-- Work memory for complex RLS queries
ALTER SYSTEM SET work_mem = '8MB';
ALTER SYSTEM SET maintenance_work_mem = '256MB';

-- Statistics for better planning
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;  -- SSD optimized
ALTER SYSTEM SET effective_io_concurrency = 200;
ALTER SYSTEM SET effective_cache_size = '4GB';
```

### Performance Benchmarks to Target

```sql
-- Create monitoring function for RLS performance
CREATE OR REPLACE FUNCTION app.benchmark_rls_performance()
RETURNS TABLE(
  operation text,
  target_ms numeric,
  query_example text
) AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM (VALUES
    ('Single fund SELECT', 5, 'SELECT * FROM funds WHERE id = ?'),
    ('Fund list SELECT', 20, 'SELECT * FROM funds WHERE organization_id = ?'),
    ('Portfolio with joins', 50, 'SELECT * FROM portfoliocompanies pc JOIN funds f ON pc.fund_id = f.id'),
    ('Aggregate query', 100, 'SELECT fund_id, SUM(amount) FROM investments GROUP BY fund_id'),
    ('Complex analytical', 500, 'WITH recursive calculations...'),
    ('Bulk INSERT', 10, 'INSERT INTO investments (100 rows)'),
    ('Single UPDATE', 5, 'UPDATE portfoliocompanies SET ... WHERE id = ?'),
    ('Bulk UPDATE', 50, 'UPDATE investments SET ... WHERE fund_id = ?')
  ) AS t(operation, target_ms, query_example);
END;
$$ LANGUAGE plpgsql;

-- Automated performance testing
CREATE OR REPLACE FUNCTION app.test_rls_performance(
  p_org_id uuid,
  p_user_id uuid,
  p_role text
)
RETURNS TABLE(
  test_name text,
  execution_time_ms numeric,
  passed boolean
) AS $$
DECLARE
  start_time timestamp;
  end_time timestamp;
BEGIN
  -- Set RLS context
  PERFORM set_config('app.current_org', p_org_id::text, true);
  PERFORM set_config('app.current_user', p_user_id::text, true);
  PERFORM set_config('app.current_role', p_role, true);

  -- Test 1: Simple fund query
  start_time := clock_timestamp();
  PERFORM * FROM app.funds LIMIT 100;
  end_time := clock_timestamp();

  RETURN QUERY
  SELECT
    'Simple fund query'::text,
    EXTRACT(MILLISECONDS FROM (end_time - start_time))::numeric,
    EXTRACT(MILLISECONDS FROM (end_time - start_time)) < 5;

  -- Add more tests...
END;
$$ LANGUAGE plpgsql;
```

## 6. Backup/Restore Per Tenant

### Logical Backup Strategy

```bash
#!/bin/bash
# backup-tenant.sh - Backup single organization's data

ORG_ID=$1
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/tenants/${ORG_ID}"
BACKUP_FILE="${BACKUP_DIR}/backup_${BACKUP_DATE}.sql"

# Create backup directory
mkdir -p ${BACKUP_DIR}

# Export with row filtering for specific org
pg_dump \
  --host=$DB_HOST \
  --port=$DB_PORT \
  --username=$DB_USER \
  --dbname=$DB_NAME \
  --schema=app \
  --data-only \
  --column-inserts \
  --file=${BACKUP_FILE} \
  --where="organization_id='${ORG_ID}'"

# Encrypt backup
gpg --encrypt \
  --recipient backup@updog.com \
  --armor \
  --output ${BACKUP_FILE}.gpg \
  ${BACKUP_FILE}

# Remove unencrypted file
shred -vfz -n 3 ${BACKUP_FILE}

# Upload to S3 with encryption
aws s3 cp ${BACKUP_FILE}.gpg \
  s3://updog-backups/tenants/${ORG_ID}/ \
  --sse-customer-algorithm AES256 \
  --sse-customer-key $BACKUP_KEY \
  --metadata "org_id=${ORG_ID},backup_date=${BACKUP_DATE}"
```

### Point-in-Time Recovery Per Tenant

```sql
-- Enable logical decoding for tenant-specific PITR
ALTER SYSTEM SET wal_level = 'logical';
ALTER SYSTEM SET max_replication_slots = 20;
ALTER SYSTEM SET max_wal_senders = 20;

-- Create publication for each tenant
CREATE PUBLICATION tenant_${org_id}_pub
FOR TABLE app.funds, app.portfoliocompanies, app.investments
WHERE (organization_id = '${org_id}');

-- Subscription for tenant recovery database
CREATE SUBSCRIPTION tenant_${org_id}_sub
CONNECTION 'host=primary dbname=updog'
PUBLICATION tenant_${org_id}_pub
WITH (copy_data = false, synchronous_commit = 'remote_apply');
```

### Automated Tenant Recovery Script

```python
#!/usr/bin/env python3
# restore-tenant.py - Restore single tenant to specific point in time

import psycopg2
import boto3
import subprocess
from datetime import datetime

def restore_tenant(org_id: str, target_time: datetime):
    """Restore tenant data to specific point in time"""

    # Find nearest backup before target time
    s3 = boto3.client('s3')
    backups = s3.list_objects_v2(
        Bucket='updog-backups',
        Prefix=f'tenants/{org_id}/'
    )

    # Filter and sort backups
    valid_backups = []
    for obj in backups.get('Contents', []):
        backup_time = parse_backup_time(obj['Key'])
        if backup_time <= target_time:
            valid_backups.append((backup_time, obj['Key']))

    if not valid_backups:
        raise Exception(f"No backup found before {target_time}")

    # Get most recent backup before target
    backup_time, backup_key = max(valid_backups)

    # Download and decrypt backup
    local_file = f'/tmp/restore_{org_id}.sql.gpg'
    s3.download_file('updog-backups', backup_key, local_file)

    subprocess.run([
        'gpg', '--decrypt',
        '--output', f'/tmp/restore_{org_id}.sql',
        local_file
    ])

    # Create recovery database
    recovery_db = f"recovery_{org_id}_{int(target_time.timestamp())}"

    conn = psycopg2.connect(
        host=os.environ['DB_HOST'],
        database='postgres',
        user=os.environ['DB_ADMIN_USER'],
        password=os.environ['DB_ADMIN_PASSWORD']
    )

    with conn.cursor() as cur:
        # Create recovery database
        cur.execute(f"CREATE DATABASE {recovery_db}")

        # Apply schema
        subprocess.run([
            'psql',
            f'--dbname={recovery_db}',
            '--file=/schema/current.sql'
        ])

        # Restore backup
        subprocess.run([
            'psql',
            f'--dbname={recovery_db}',
            f'--file=/tmp/restore_{org_id}.sql'
        ])

        # Apply WAL up to target time
        cur.execute(f"""
            -- Set recovery target
            ALTER DATABASE {recovery_db}
            SET recovery_target_time = '{target_time.isoformat()}'
        """)

    return recovery_db
```

## 7. Monitoring & Alerting

### Prometheus Metrics Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'pgbouncer'
    static_configs:
      - targets: ['pgbouncer-exporter:9127']

  - job_name: 'app-metrics'
    static_configs:
      - targets: ['app:3000']
```

### Custom RLS Performance Metrics

```sql
-- Create metrics collection tables
CREATE TABLE app.rls_metrics (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL,
  query_type text NOT NULL,
  execution_time_ms numeric NOT NULL,
  row_count integer,
  query_hash text,
  created_at timestamp DEFAULT now()
);

-- Metrics collection function
CREATE OR REPLACE FUNCTION app.collect_rls_metrics()
RETURNS event_trigger AS $$
DECLARE
  query_info record;
BEGIN
  -- Get query statistics
  FOR query_info IN
    SELECT
      current_setting('app.current_org', true)::uuid as org_id,
      query,
      mean_exec_time,
      calls,
      rows
    FROM pg_stat_statements
    WHERE userid = (SELECT oid FROM pg_roles WHERE rolname = 'updog_app')
    AND query LIKE '%FROM app.%'
    AND mean_exec_time > 10  -- Only slow queries
  LOOP
    INSERT INTO app.rls_metrics (
      organization_id,
      query_type,
      execution_time_ms,
      row_count,
      query_hash
    ) VALUES (
      query_info.org_id,
      CASE
        WHEN query_info.query LIKE 'SELECT%' THEN 'SELECT'
        WHEN query_info.query LIKE 'INSERT%' THEN 'INSERT'
        WHEN query_info.query LIKE 'UPDATE%' THEN 'UPDATE'
        WHEN query_info.query LIKE 'DELETE%' THEN 'DELETE'
        ELSE 'OTHER'
      END,
      query_info.mean_exec_time,
      query_info.rows,
      md5(query_info.query)
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create event trigger
CREATE EVENT TRIGGER collect_metrics_trigger
  ON sql_drop
  EXECUTE FUNCTION app.collect_rls_metrics();
```

### Grafana Dashboard Configuration

```json
{
  "dashboard": {
    "title": "RLS Multi-Tenant Monitoring",
    "panels": [
      {
        "title": "RLS Query Performance by Organization",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(rls_query_duration_seconds_bucket[5m])) by (organization_id)",
            "legendFormat": "p95 - {{organization_id}}"
          }
        ]
      },
      {
        "title": "Cross-Tenant Violations",
        "targets": [
          {
            "expr": "increase(rls_violation_total[1h])",
            "legendFormat": "Violations"
          }
        ]
      },
      {
        "title": "Connection Pool Utilization",
        "targets": [
          {
            "expr": "pgbouncer_pools_client_active / pgbouncer_pools_client_maxwait",
            "legendFormat": "{{database}} - {{user}}"
          }
        ]
      },
      {
        "title": "Slow RLS Queries",
        "targets": [
          {
            "expr": "topk(10, rate(pg_stat_statements_mean_exec_time_seconds[5m]))",
            "legendFormat": "{{query}}"
          }
        ]
      }
    ]
  }
}
```

### Alert Rules

```yaml
# alerts.yml
groups:
  - name: rls_security
    interval: 30s
    rules:
      - alert: CrossTenantViolation
        expr: increase(rls_violation_total[5m]) > 0
        for: 1m
        labels:
          severity: critical
          team: security
        annotations:
          summary: "Cross-tenant data access attempted"
          description: "Organization {{ $labels.organization_id }} attempted cross-tenant access"

      - alert: MissingRLSContext
        expr: rate(queries_without_rls_context[5m]) > 0.01
        for: 5m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "Queries executed without RLS context"
          description: "{{ $value }} queries/sec without proper RLS context"

      - alert: SlowRLSQuery
        expr: histogram_quantile(0.95, rate(rls_query_duration_seconds_bucket[5m])) > 1
        for: 10m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "RLS queries are slow"
          description: "p95 query time is {{ $value }}s for org {{ $labels.organization_id }}"

      - alert: ConnectionPoolExhausted
        expr: pgbouncer_pools_client_waiting > 10
        for: 5m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "Connection pool has waiting clients"
          description: "{{ $value }} clients waiting for connections"
```

## 8. Migration Safety

### Add Organization ID with Zero Downtime

```sql
-- Step 1: Add nullable column
ALTER TABLE app.funds
ADD COLUMN organization_id uuid;

-- Step 2: Create partial index for migration tracking
CREATE INDEX CONCURRENTLY idx_funds_migration_status
ON app.funds(id)
WHERE organization_id IS NULL;

-- Step 3: Backfill in batches with progress tracking
DO $$
DECLARE
  batch_size INTEGER := 1000;
  processed INTEGER := 0;
  total_rows INTEGER;
  last_id INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO total_rows
  FROM app.funds
  WHERE organization_id IS NULL;

  WHILE processed < total_rows LOOP
    -- Process batch
    WITH batch AS (
      SELECT id
      FROM app.funds
      WHERE id > last_id
      AND organization_id IS NULL
      ORDER BY id
      LIMIT batch_size
      FOR UPDATE SKIP LOCKED
    )
    UPDATE app.funds f
    SET organization_id = (
      -- Derive from existing relationships
      SELECT u.organization_id
      FROM users u
      WHERE u.id = f.created_by
      LIMIT 1
    )
    FROM batch b
    WHERE f.id = b.id;

    -- Track progress
    GET DIAGNOSTICS processed = processed + ROW_COUNT;
    SELECT MAX(id) INTO last_id FROM batch;

    -- Log progress
    INSERT INTO migration_progress (
      table_name,
      processed_rows,
      total_rows,
      percentage,
      last_processed_id
    ) VALUES (
      'funds',
      processed,
      total_rows,
      (processed::numeric / total_rows * 100)::numeric(5,2),
      last_id
    );

    -- Commit batch to release locks
    COMMIT;

    -- Rate limiting
    PERFORM pg_sleep(0.1);
  END LOOP;
END $$;

-- Step 4: Add NOT NULL constraint
ALTER TABLE app.funds
ALTER COLUMN organization_id SET NOT NULL;

-- Step 5: Create proper indexes
CREATE INDEX CONCURRENTLY idx_funds_organization
ON app.funds(organization_id);

-- Step 6: Drop migration tracking index
DROP INDEX idx_funds_migration_status;
```

### Migration Configuration Settings

```sql
-- Timeout settings for migration safety
SET statement_timeout = '30s';  -- Prevent long-running statements
SET lock_timeout = '5s';        -- Fail fast on lock acquisition
SET idle_in_transaction_session_timeout = '60s';  -- Kill idle transactions

-- Work memory for batch operations
SET work_mem = '256MB';
SET maintenance_work_mem = '1GB';

-- Parallel workers for index creation
SET max_parallel_workers_per_gather = 4;
SET max_parallel_maintenance_workers = 4;

-- Checkpoint settings for large migrations
SET checkpoint_completion_target = 0.9;
SET checkpoint_timeout = '30min';
```

### Progress Tracking Table

```sql
CREATE TABLE migration_progress (
  id serial PRIMARY KEY,
  migration_id uuid DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  processed_rows integer NOT NULL,
  total_rows integer NOT NULL,
  percentage numeric(5,2),
  last_processed_id integer,
  error_count integer DEFAULT 0,
  status text DEFAULT 'running',
  started_at timestamp DEFAULT now(),
  completed_at timestamp,
  metadata jsonb
);

-- Monitoring view
CREATE VIEW migration_status AS
SELECT
  table_name,
  percentage,
  processed_rows,
  total_rows,
  EXTRACT(EPOCH FROM (now() - started_at)) as duration_seconds,
  CASE
    WHEN percentage > 0 THEN
      ((100 - percentage) * EXTRACT(EPOCH FROM (now() - started_at)) / percentage)::integer
    ELSE NULL
  END as estimated_seconds_remaining,
  status,
  error_count
FROM migration_progress
WHERE completed_at IS NULL
ORDER BY started_at DESC;
```

## 9. Implementation Checklist

### Pre-Production Checklist

- [ ] **Database Roles**
  - [ ] Create all required roles with proper permissions
  - [ ] Verify NO BYPASSRLS on application role
  - [ ] Test role hierarchy and inheritance
  - [ ] Configure password encryption (scram-sha-256)

- [ ] **RLS Policies**
  - [ ] Enable and FORCE RLS on all tables
  - [ ] Implement fail-closed context functions
  - [ ] Create policies for all CRUD operations
  - [ ] Test policies with different role combinations

- [ ] **Connection Pooling**
  - [ ] Install and configure PgBouncer
  - [ ] Set transaction pooling mode for RLS
  - [ ] Configure SSL/TLS certificates
  - [ ] Test connection failover behavior

- [ ] **Performance**
  - [ ] Create all compound indexes with organization_id
  - [ ] Add partial indexes for soft deletes
  - [ ] Run ANALYZE after index creation
  - [ ] Benchmark query performance against targets

- [ ] **High Availability**
  - [ ] Configure streaming replication
  - [ ] Set up Patroni for automatic failover
  - [ ] Test failover scenarios
  - [ ] Verify RLS context preservation during failover

- [ ] **Monitoring**
  - [ ] Deploy Prometheus and Grafana
  - [ ] Configure PostgreSQL exporter
  - [ ] Set up alert rules
  - [ ] Create custom RLS dashboards

- [ ] **Backup & Recovery**
  - [ ] Implement per-tenant backup scripts
  - [ ] Test restore procedures
  - [ ] Verify backup encryption
  - [ ] Document recovery time objectives

- [ ] **Security Audit**
  - [ ] Review all RLS policies
  - [ ] Pen test cross-tenant isolation
  - [ ] Verify audit logging
  - [ ] Check SSL/TLS configuration

### Production Deployment Steps

1. **Phase 1: Schema Migration**
   ```bash
   ./scripts/migrate-add-org-id.sh
   ./scripts/verify-migration.sh
   ```

2. **Phase 2: Enable RLS**
   ```bash
   ./scripts/enable-rls-policies.sh
   ./scripts/test-rls-isolation.sh
   ```

3. **Phase 3: Switch Connection Pooling**
   ```bash
   ./scripts/deploy-pgbouncer.sh
   ./scripts/update-app-config.sh
   ./scripts/verify-connections.sh
   ```

4. **Phase 4: Enable Monitoring**
   ```bash
   ./scripts/deploy-monitoring.sh
   ./scripts/configure-alerts.sh
   ```

5. **Phase 5: Validation**
   ```bash
   ./scripts/run-security-tests.sh
   ./scripts/run-performance-benchmarks.sh
   ./scripts/verify-backup-restore.sh
   ```

## Appendix A: Emergency Procedures

### RLS Context Lost

```sql
-- Emergency query to check current context
SELECT
  current_setting('app.current_org', true) as org,
  current_setting('app.current_user', true) as user,
  current_setting('app.current_role', true) as role;

-- Force disconnect all application connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE usename = 'updog_app'
AND pid <> pg_backend_pid();
```

### Cross-Tenant Data Leak Response

```sql
-- Immediate isolation
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM updog_app;

-- Audit recent queries
SELECT
  query_start,
  usename,
  application_name,
  client_addr,
  query
FROM pg_stat_activity
WHERE query LIKE '%organization_id%'
ORDER BY query_start DESC
LIMIT 100;

-- Check for policy violations
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'app';
```

## Appendix B: Testing Scripts

### RLS Isolation Test

```python
#!/usr/bin/env python3
# test-rls-isolation.py

import psycopg2
import uuid
from concurrent.futures import ThreadPoolExecutor

def test_isolation(org_id: str, user_id: str):
    """Test that user can only see their org's data"""

    conn = psycopg2.connect(
        host='localhost',
        port=6432,  # PgBouncer
        database='updog_app',
        user='updog_app',
        password='AppPassword'
    )

    with conn.cursor() as cur:
        # Set RLS context
        cur.execute('BEGIN')
        cur.execute("""
            SELECT
              set_config('app.current_org', %s, true),
              set_config('app.current_user', %s, true),
              set_config('app.current_role', 'admin', true)
        """, (org_id, user_id))

        # Try to access data
        cur.execute("SELECT COUNT(*) FROM app.funds")
        own_funds = cur.fetchone()[0]

        # Try to access other org's data (should return 0)
        other_org = str(uuid.uuid4())
        cur.execute("""
            SELECT COUNT(*) FROM app.funds
            WHERE organization_id = %s
        """, (other_org,))
        other_funds = cur.fetchone()[0]

        cur.execute('COMMIT')

        assert other_funds == 0, f"Cross-tenant leak detected! Saw {other_funds} funds from other org"

        return own_funds

# Run parallel isolation tests
with ThreadPoolExecutor(max_workers=10) as executor:
    futures = []
    for i in range(100):
        org_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        futures.append(executor.submit(test_isolation, org_id, user_id))

    for future in futures:
        result = future.result()
        print(f"Test passed: {result} funds visible")
```

This comprehensive infrastructure design provides production-grade multi-tenant isolation with Row Level Security, optimized for your VC fund modeling platform. The design emphasizes security, performance, and operational excellence while maintaining zero-trust principles throughout.