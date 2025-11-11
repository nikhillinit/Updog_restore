#!/bin/bash
# setup-rls-infrastructure.sh - Complete RLS infrastructure setup
# Run this script to set up production-grade multi-tenant PostgreSQL with RLS

set -euo pipefail

# Color output for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration from environment
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-updog}"
DB_ADMIN_USER="${DB_ADMIN_USER:-postgres}"
PGBOUNCER_PORT="${PGBOUNCER_PORT:-6432}"

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

# Log function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    # Check PostgreSQL client
    if ! command -v psql &> /dev/null; then
        error "psql command not found. Please install PostgreSQL client."
        exit 1
    fi

    # Check connection
    if ! PGPASSWORD="${DB_ADMIN_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_ADMIN_USER}" -d postgres -c "SELECT 1" &> /dev/null; then
        error "Cannot connect to PostgreSQL. Check your connection settings."
        exit 1
    fi

    success "Prerequisites check passed"
}

# Create database roles
create_roles() {
    log "Creating database roles..."

    PGPASSWORD="${DB_ADMIN_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_ADMIN_USER}" -d "${DB_NAME}" <<EOF
-- Drop existing roles if they exist (for idempotency)
DROP ROLE IF EXISTS updog_owner;
DROP ROLE IF EXISTS updog_app;
DROP ROLE IF EXISTS updog_analytics;
DROP ROLE IF EXISTS updog_migrator;
DROP ROLE IF EXISTS updog_monitor;

-- Database Owner Role
CREATE ROLE updog_owner WITH
  NOLOGIN
  NOSUPERUSER
  CREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION;

-- Application Service Role (NO BYPASSRLS)
CREATE ROLE updog_app WITH
  LOGIN
  PASSWORD '${APP_DB_PASSWORD}'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  INHERIT
  NOREPLICATION
  CONNECTION LIMIT 100;

-- Analytics Role
CREATE ROLE updog_analytics WITH
  LOGIN
  PASSWORD '${ANALYTICS_DB_PASSWORD}'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  INHERIT
  NOREPLICATION
  CONNECTION LIMIT 20;

-- Migration Role
CREATE ROLE updog_migrator WITH
  LOGIN
  PASSWORD '${MIGRATOR_DB_PASSWORD}'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  INHERIT
  NOREPLICATION
  CONNECTION LIMIT 2;

-- Monitoring Role
CREATE ROLE updog_monitor WITH
  LOGIN
  PASSWORD '${MONITOR_DB_PASSWORD}'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  INHERIT
  NOREPLICATION
  CONNECTION LIMIT 5;

-- Grant ownership
GRANT updog_owner TO updog_migrator;
ALTER DATABASE ${DB_NAME} OWNER TO updog_owner;

-- Grant monitoring permissions
GRANT pg_monitor TO updog_monitor;

-- Configure role settings
ALTER ROLE updog_app SET statement_timeout = '10s';
ALTER ROLE updog_app SET lock_timeout = '2s';
ALTER ROLE updog_app SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE updog_analytics SET statement_timeout = '5min';
ALTER ROLE updog_analytics SET lock_timeout = '1s';
EOF

    success "Database roles created"
}

# Grant permissions
grant_permissions() {
    log "Granting role permissions..."

    PGPASSWORD="${DB_ADMIN_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_ADMIN_USER}" -d "${DB_NAME}" <<EOF
-- Create schemas if they don't exist
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION updog_owner;
CREATE SCHEMA IF NOT EXISTS audit AUTHORIZATION updog_owner;

-- Application role grants
GRANT USAGE ON SCHEMA public TO updog_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO updog_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO updog_app;
ALTER DEFAULT PRIVILEGES FOR ROLE updog_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO updog_app;
ALTER DEFAULT PRIVILEGES FOR ROLE updog_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO updog_app;

-- Analytics role grants
GRANT USAGE ON SCHEMA public TO updog_analytics;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO updog_analytics;
ALTER DEFAULT PRIVILEGES FOR ROLE updog_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO updog_analytics;

-- Monitor role grants
GRANT USAGE ON SCHEMA public TO updog_monitor;
GRANT SELECT ON pg_stat_statements TO updog_monitor;
EOF

    success "Permissions granted"
}

# Run RLS migration
run_migration() {
    log "Running RLS migration..."

    # Check if migration already applied
    MIGRATION_EXISTS=$(PGPASSWORD="${MIGRATOR_DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U updog_migrator -d "${DB_NAME}" -t -c "
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_name = 'funds'
        AND column_name = 'organization_id'
    " | tr -d ' ')

    if [ "$MIGRATION_EXISTS" -gt 0 ]; then
        warning "Migration already applied (organization_id column exists)"
        return 0
    fi

    # Run migration
    PGPASSWORD="${MIGRATOR_DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U updog_migrator -d "${DB_NAME}" \
        -f "${PROJECT_ROOT}/migrations/0002_multi_tenant_rls_setup.sql"

    success "RLS migration completed"
}

# Configure PgBouncer
configure_pgbouncer() {
    log "Configuring PgBouncer..."

    # Create PgBouncer config directory
    mkdir -p "${PROJECT_ROOT}/config/pgbouncer"

    # Generate PgBouncer configuration
    cat > "${PROJECT_ROOT}/config/pgbouncer/pgbouncer.ini" <<EOF
[databases]
# Transaction pooling for RLS
updog_app = host=${DB_HOST} port=${DB_PORT} dbname=${DB_NAME} user=updog_app pool_mode=transaction
updog_analytics = host=${DB_HOST} port=${DB_PORT} dbname=${DB_NAME} user=updog_analytics pool_mode=session
updog_migrator = host=${DB_HOST} port=${DB_PORT} dbname=${DB_NAME} user=updog_migrator pool_mode=session

[pgbouncer]
listen_addr = *
listen_port = ${PGBOUNCER_PORT}
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

# Pool configuration
default_pool_size = 25
min_pool_size = 10
reserve_pool_size = 5
max_client_conn = 1000
max_db_connections = 100

# Timeouts
server_idle_timeout = 600
server_lifetime = 3600
query_timeout = 0
query_wait_timeout = 120

# Transaction pooling settings
server_reset_query = DISCARD ALL
server_reset_query_always = 1

# Logging
log_connections = 1
log_disconnections = 1
log_pooler_errors = 1
EOF

    # Generate userlist
    cat > "${PROJECT_ROOT}/config/pgbouncer/userlist.txt" <<EOF
"updog_app" "SCRAM-SHA-256\$4096:$(echo -n "${APP_DB_PASSWORD}" | openssl dgst -sha256 -binary | base64)"
"updog_analytics" "SCRAM-SHA-256\$4096:$(echo -n "${ANALYTICS_DB_PASSWORD}" | openssl dgst -sha256 -binary | base64)"
"updog_migrator" "SCRAM-SHA-256\$4096:$(echo -n "${MIGRATOR_DB_PASSWORD}" | openssl dgst -sha256 -binary | base64)"
EOF

    success "PgBouncer configured"
}

# Test RLS isolation
test_rls_isolation() {
    log "Testing RLS isolation..."

    # Create test script
    cat > /tmp/test_rls.sql <<'EOF'
-- Set context for org 1
BEGIN;
SELECT set_config('app.current_org', 'a1111111-1111-1111-1111-111111111111', true);
SELECT set_config('app.current_user', 'user1', true);
SELECT set_config('app.current_role', 'admin', true);

-- This should return data
SELECT COUNT(*) as org1_funds FROM funds;

-- Try to access different org (should return 0)
SELECT COUNT(*) as other_org_funds
FROM funds
WHERE organization_id = 'b2222222-2222-2222-2222-222222222222';

ROLLBACK;
EOF

    # Run test
    PGPASSWORD="${APP_DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U updog_app -d "${DB_NAME}" \
        -f /tmp/test_rls.sql

    success "RLS isolation test completed"
}

# Generate monitoring queries
generate_monitoring() {
    log "Generating monitoring configuration..."

    mkdir -p "${PROJECT_ROOT}/monitoring/queries"

    # RLS performance query
    cat > "${PROJECT_ROOT}/monitoring/queries/rls_performance.sql" <<'EOF'
-- RLS Performance Monitoring
SELECT
  schemaname,
  tablename,
  n_tup_ins,
  n_tup_upd,
  n_tup_del,
  n_live_tup,
  n_dead_tup,
  last_vacuum,
  last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- Slow queries with RLS
SELECT
  query,
  mean_exec_time,
  calls,
  total_exec_time,
  rows
FROM pg_stat_statements
WHERE query LIKE '%current_org_id()%'
ORDER BY mean_exec_time DESC
LIMIT 10;
EOF

    # Connection pool monitoring
    cat > "${PROJECT_ROOT}/monitoring/queries/pool_monitoring.sql" <<'EOF'
-- PgBouncer pool statistics
SHOW POOLS;
SHOW STATS;
SHOW SERVERS;
SHOW CLIENTS;
EOF

    success "Monitoring configuration generated"
}

# Main execution
main() {
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  RLS Infrastructure Setup Script${NC}"
    echo -e "${GREEN}========================================${NC}"

    # Check for required environment variables
    if [ -z "${DB_ADMIN_PASSWORD:-}" ]; then
        error "DB_ADMIN_PASSWORD environment variable is required"
        exit 1
    fi

    if [ -z "${APP_DB_PASSWORD:-}" ]; then
        error "APP_DB_PASSWORD environment variable is required"
        exit 1
    fi

    if [ -z "${ANALYTICS_DB_PASSWORD:-}" ]; then
        error "ANALYTICS_DB_PASSWORD environment variable is required"
        exit 1
    fi

    if [ -z "${MIGRATOR_DB_PASSWORD:-}" ]; then
        error "MIGRATOR_DB_PASSWORD environment variable is required"
        exit 1
    fi

    if [ -z "${MONITOR_DB_PASSWORD:-}" ]; then
        error "MONITOR_DB_PASSWORD environment variable is required"
        exit 1
    fi

    # Run setup steps
    check_prerequisites
    create_roles
    grant_permissions
    run_migration
    configure_pgbouncer
    test_rls_isolation
    generate_monitoring

    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Setup Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"

    echo ""
    echo "Next steps:"
    echo "1. Start PgBouncer with: docker-compose up pgbouncer"
    echo "2. Update application to use PgBouncer on port ${PGBOUNCER_PORT}"
    echo "3. Deploy monitoring with: ./deploy-monitoring.sh"
    echo "4. Run security audit with: ./audit-rls-security.sh"
    echo ""
    echo "Connection strings:"
    echo "  App: postgresql://updog_app@localhost:${PGBOUNCER_PORT}/${DB_NAME}"
    echo "  Analytics: postgresql://updog_analytics@localhost:${PGBOUNCER_PORT}/${DB_NAME}"
}

# Run main function
main "$@"