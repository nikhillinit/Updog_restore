---
status: ACTIVE
last_updated: 2026-01-19
---

# LP Reporting Dashboard Deployment Checklist

This guide provides step-by-step instructions for deploying the LP Reporting Dashboard feature to production environments.

## Table of Contents

1. [Pre-Deployment](#pre-deployment)
2. [Deployment](#deployment)
3. [Post-Deployment Verification](#post-deployment-verification)
4. [Rollback Procedures](#rollback-procedures)
5. [Monitoring and Troubleshooting](#monitoring-and-troubleshooting)

---

## Pre-Deployment

Complete these steps before initiating deployment to any environment.

### 1. Database Configuration

[ ] Verify database connectivity from all deployment targets
```bash
# Test connection from application environment
psql "$DATABASE_URL" -c "SELECT version();"
```

[ ] Ensure required core tables exist (dependency check)
```bash
# Verify funds table exists - required by LP migrations
psql "$DATABASE_URL" -c "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='funds');"
```

[ ] Create report storage directory
```bash
# Create directory if it doesn't exist
mkdir -p "${LP_REPORT_STORAGE_PATH:-/tmp/reports}"
chmod 755 "${LP_REPORT_STORAGE_PATH:-/tmp/reports}"
```

[ ] Verify directory permissions
```bash
# Check read/write access
test -w "${LP_REPORT_STORAGE_PATH:-/tmp/reports}" && echo "PASS: Directory writable" || echo "FAIL: Directory not writable"
```

### 2. Environment Variables

[ ] Copy and update `.env` with LP-specific configuration
```bash
cp .env.example .env
```

[ ] Configure LP environment variables in deployment system
```
LP_REPORT_STORAGE_PATH=/var/lib/app/lp-reports
LP_REPORT_MAX_SIZE_MB=50
LP_CACHE_TTL_SECONDS=300
LP_RATE_LIMIT_MAX=100
LP_RATE_LIMIT_WINDOW_MS=60000
```

[ ] Verify Redis connectivity (if enabled for caching)
```bash
redis-cli -u "$REDIS_URL" ping
# Should return: PONG
```

[ ] Test database connectivity with configured URL
```bash
node -e "const {db} = require('./server/db'); db.execute('SELECT 1').catch(e => console.error(e));"
```

### 3. Backup and Safety

[ ] Create full database backup before deployment
```bash
pg_dump "$DATABASE_URL" > db-backup-$(date +%Y%m%d-%H%M%S).sql
# Verify backup integrity
pg_restore -N -l db-backup-*.sql | head -20
```

[ ] Document current deployment state
```bash
# Capture migration status
psql "$DATABASE_URL" -c "SELECT id, name, applied_at FROM lp_reporting_migrations ORDER BY applied_at;"
```

[ ] Establish communication channel for deployment support
- Slack/Teams channel: [specify]
- Incident commander: [specify]
- Rollback decision maker: [specify]

### 4. Pre-Deployment Testing (Staging)

[ ] Run migration with --dry-run in staging first
```bash
npm run migrate:lp -- --dry-run
# Review SQL output for correctness
```

[ ] Verify migration script handles idempotency
```bash
# Run migration twice - should be safe on second run
npm run migrate:lp
npm run migrate:lp
# Both should succeed without errors
```

[ ] Test LP endpoints in staging environment
```bash
curl -X GET "http://staging-api/api/lp/health" \
  -H "Authorization: Bearer $TEST_TOKEN"
```

[ ] Verify health check responds correctly
```bash
curl -X GET "http://staging-api/api/lp/health" | jq .
# Should return { "status": "healthy", "checks": {...} }
```

---

## Deployment

Follow these steps during the actual deployment window.

### 1. Pre-Deployment Checks (5 minutes before)

[ ] Verify no conflicting deployments in progress
```bash
# Check deployment history
git log --oneline -n 20
```

[ ] Confirm database is accessible from deployment environment
```bash
psql "$DATABASE_URL" -c "SELECT 1;" && echo "Database OK"
```

[ ] Verify report storage directory exists and is writable
```bash
touch "${LP_REPORT_STORAGE_PATH:-/tmp/reports}/.test" && \
  rm "${LP_REPORT_STORAGE_PATH:-/tmp/reports}/.test" && \
  echo "Storage OK"
```

[ ] Alert monitoring systems of planned maintenance
```bash
# Example: Slack notification
curl -X POST $SLACK_WEBHOOK \
  -H 'Content-type: application/json' \
  -d '{"text": "Starting LP Reporting deployment"}'
```

### 2. Database Migrations

[ ] Run LP migrations to create tables
```bash
# Standard deployment
npm run migrate:lp

# Output should show:
# LP schema tables: limited_partners, lp_fund_commitments, ...
# Applying migration 001-lp-base: Create LP base tables
# - Enable pgcrypto extension
# - Create limited_partners table
# ...
# Migration 001-lp-base complete.
```

[ ] Verify migrations applied successfully
```bash
psql "$DATABASE_URL" -c "SELECT * FROM lp_reporting_migrations;"
# Should show 3 rows: 001-lp-base, 002-lp-commitments, 003-lp-reports
```

[ ] Confirm all LP tables were created
```bash
psql "$DATABASE_URL" -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name LIKE 'lp_%'
  ORDER BY table_name;"
```

### 3. Application Deployment

[ ] Deploy application code (includes new LP routes)
```bash
# Standard deployment process
npm run build
# ... deployment steps per your process ...
```

[ ] Restart application services
```bash
# Restart API server
systemctl restart app-api

# Verify service is running
systemctl status app-api
```

[ ] Enable LP Dashboard feature flag
```bash
# Update feature flags in database/environment
curl -X PUT "http://api.example.com/api/flags/LP_DASHBOARD_ENABLED" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"enabled": true}'
```

### 4. Health Checks

[ ] Wait 30 seconds for services to stabilize
```bash
sleep 30
```

[ ] Test LP health endpoint
```bash
curl -X GET "http://api.example.com/api/lp/health" | jq .
# Expected response:
# {
#   "status": "healthy",
#   "checks": {
#     "database": { "status": "healthy", ... },
#     "redis": { "status": "healthy", ... },
#     "reportStorage": { "status": "healthy", ... }
#   }
# }
```

[ ] Verify LP API endpoints are accessible
```bash
# Test profile endpoint
curl -X GET "http://api.example.com/api/lp/profile" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "X-LP-ID: 1" | jq .

# Verify response status is not 500
```

[ ] Confirm no errors in application logs
```bash
# Check recent logs for errors
tail -100 /var/log/app/api.log | grep -i error
# Should show zero errors related to LP tables
```

---

## Post-Deployment Verification

Complete these checks within 1 hour of deployment to production.

### 1. Database Integrity

[ ] Verify migration table shows all 3 migrations
```bash
psql "$DATABASE_URL" -c "
  SELECT id, name, applied_at FROM lp_reporting_migrations
  ORDER BY applied_at;"
# Should output 3 rows
```

[ ] Check table row counts (should be empty initially)
```bash
psql "$DATABASE_URL" -c "
  SELECT 'limited_partners' as table_name, count(*) FROM limited_partners
  UNION ALL
  SELECT 'lp_fund_commitments', count(*) FROM lp_fund_commitments
  UNION ALL
  SELECT 'lp_reports', count(*) FROM lp_reports
  ORDER BY table_name;"
```

[ ] Verify indexes were created
```bash
psql "$DATABASE_URL" -c "
  SELECT indexname FROM pg_indexes
  WHERE tablename IN ('lp_fund_commitments', 'capital_activities', 'lp_capital_accounts', 'lp_performance_snapshots', 'lp_reports')
  ORDER BY indexname;"
```

[ ] Test database constraints
```bash
# Verify unique constraint on limited_partners email
psql "$DATABASE_URL" -c "
  INSERT INTO limited_partners (name, email, entity_type)
  VALUES ('Test 1', 'test@example.com', 'individual');
  INSERT INTO limited_partners (name, email, entity_type)
  VALUES ('Test 2', 'test@example.com', 'individual');" 2>&1 | grep -i unique
# Should show constraint violation error
```

### 2. Application Functionality

[ ] Test LP profile endpoint with valid LP
```bash
curl -X GET "http://api.example.com/api/lp/profile" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "X-LP-ID: 1" | jq .
# Should return 200 OK
```

[ ] Test capital account query endpoint
```bash
curl -X GET "http://api.example.com/api/lp/capital-account?limit=10&offset=0" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "X-LP-ID: 1" | jq .
# Should return 200 OK (empty list is acceptable)
```

[ ] Test report generation endpoint
```bash
curl -X POST "http://api.example.com/api/lp/reports/generate" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "X-LP-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"reportType": "quarterly", "format": "pdf"}' | jq .
# Should return 200-201 OK
```

[ ] Verify rate limiting is applied
```bash
# Send 150 requests (limit is 100/minute)
for i in {1..150}; do
  curl -X GET "http://api.example.com/api/lp/health" \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -H "X-Forwarded-For: 192.168.1.1"
done 2>&1 | grep -c "429\|TOO_MANY"
# Should show some 429 Too Many Requests responses
```

### 3. Monitoring and Alerts

[ ] Confirm health endpoint metrics are being collected
```bash
curl -X GET "http://api.example.com/metrics" | grep lp_health
# Should show Prometheus metrics
```

[ ] Verify no spike in error rates
```bash
# Check error rate in monitoring system (Datadog, Prometheus, etc.)
# Should remain under 0.1% for normal operations
```

[ ] Confirm logs are being ingested
```bash
# Check logs in log aggregation system
# Should see "Applying migration 001-lp-base" entries
```

[ ] Set up alerts for LP health check failures
```bash
# Example for Prometheus
# - Alert if /api/lp/health returns status != healthy
# - Alert if response latency > 1000ms
```

### 4. Performance Baseline

[ ] Measure API response times
```bash
# Test profile endpoint response time
time curl -X GET "http://api.example.com/api/lp/profile" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "X-LP-ID: 1" > /dev/null
# Should complete in < 200ms
```

[ ] Verify report storage directory usage
```bash
du -sh "${LP_REPORT_STORAGE_PATH:-/tmp/reports}"
# Should show minimal size on initial deployment
```

[ ] Confirm Redis caching is working
```bash
# Make same request twice
curl -X GET "http://api.example.com/api/lp/summary" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "X-LP-ID: 1" \
  -w "\nTime: %{time_total}s\n" > /dev/null

# Second request should be faster (cached)
curl -X GET "http://api.example.com/api/lp/summary" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "X-LP-ID: 1" \
  -w "\nTime: %{time_total}s\n" > /dev/null
```

---

## Rollback Procedures

Follow these steps if deployment fails or critical issues are discovered.

### Trigger Criteria for Rollback

Rollback should be executed if any of these conditions are met:

- Database migration fails and cannot be recovered
- API returns 500+ errors for LP endpoints (>5 in 5 minutes)
- Health check endpoint returns unhealthy status for >10 minutes
- Performance degradation (response times > 5000ms)
- Data corruption detected in LP tables
- Unable to restore connectivity after 30 minutes

### Step 1: Pause Services (5 minutes)

[ ] Stop accepting new requests to LP endpoints
```bash
# Option 1: Update feature flag to disable LP endpoints
curl -X PUT "http://api.example.com/api/flags/LP_DASHBOARD_ENABLED" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"enabled": false}'

# Option 2: Update load balancer to stop routing to LP endpoints
# (Modify your load balancer configuration)
```

[ ] Notify stakeholders of rollback attempt
```bash
curl -X POST $SLACK_WEBHOOK \
  -d '{"text": "LP Reporting rollback initiated - pausing services"}'
```

[ ] Gather diagnostic information
```bash
# Capture current state for post-mortem
psql "$DATABASE_URL" -c "SELECT * FROM lp_reporting_migrations;" > migration-status.log
tail -1000 /var/log/app/api.log > api-logs.log
curl "http://api.example.com/api/lp/health" > health-status.json 2>&1
```

### Step 2: Database Rollback

[ ] Identify which migrations to roll back
```bash
# Check which migrations are applied
psql "$DATABASE_URL" -c "SELECT id FROM lp_reporting_migrations ORDER BY applied_at;"

# Decide: rollback all migrations or to specific point?
# For complete rollback: use --rollback with no --to flag
# For partial rollback: use --rollback --to=001-lp-base
```

[ ] Execute rollback with dry-run first
```bash
npm run migrate:lp -- --rollback --dry-run
# Review SQL output to confirm correctness
```

[ ] Execute actual rollback
```bash
npm run migrate:lp -- --rollback
# Example output:
# Rolling back LP migrations: 003-lp-reports, 002-lp-commitments, 001-lp-base
#
# Rolling back migration 003-lp-reports: Create LP reports table
# - Drop lp_reports table
# Rollback 003-lp-reports complete.
# ...
```

[ ] Verify tables were dropped
```bash
psql "$DATABASE_URL" -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name LIKE 'lp_%'
  ORDER BY table_name;"
# Should return no results
```

[ ] Verify migration tracking table was cleaned
```bash
psql "$DATABASE_URL" -c "SELECT * FROM lp_reporting_migrations;"
# Should return no rows
```

### Step 3: Code Rollback

[ ] Revert to previous application version
```bash
# Option 1: Redeploy previous version
git revert HEAD~1
npm run build
# ... deployment steps ...

# Option 2: Restore from previous snapshot/container
# ... your process ...
```

[ ] Verify application is running without errors
```bash
systemctl status app-api
tail -50 /var/log/app/api.log | grep -i error
```

### Step 4: Report Storage Cleanup

[ ] Remove any LP report files created during failed deployment
```bash
# List files created in LP storage
find "${LP_REPORT_STORAGE_PATH:-/tmp/reports}" -type f -mtime -0

# Remove if needed (be cautious)
# rm -f "${LP_REPORT_STORAGE_PATH:-/tmp/reports}"/*
```

[ ] Verify storage directory is clean
```bash
ls -la "${LP_REPORT_STORAGE_PATH:-/tmp/reports}"
```

### Step 5: Verification and Recovery

[ ] Confirm LP endpoints are no longer accessible
```bash
curl -X GET "http://api.example.com/api/lp/profile" \
  -H "Authorization: Bearer $TEST_TOKEN" | jq .
# Should return 404 Not Found or feature disabled response
```

[ ] Verify non-LP functionality still works
```bash
# Test core fund endpoints
curl -X GET "http://api.example.com/api/funds" \
  -H "Authorization: Bearer $TEST_TOKEN" | jq .
# Should work normally
```

[ ] Check error rates return to baseline
```bash
# Monitor error rate in Prometheus/Datadog
# Should drop below 0.1% within 5 minutes
```

[ ] Notify stakeholders of successful rollback
```bash
curl -X POST $SLACK_WEBHOOK \
  -d '{"text": "LP Reporting rollback completed successfully"}'
```

### Step 6: Root Cause Analysis

[ ] Schedule post-mortem within 24 hours
- Invite: Engineering lead, DevOps, Product, Stakeholders
- Duration: 1 hour
- Outcome: Written summary of what happened and prevention steps

[ ] Document findings
- What went wrong?
- Why wasn't it caught in staging?
- What should change?

[ ] Create tickets for improvements
- Pre-deployment validation enhancements
- Testing coverage gaps
- Infrastructure improvements
- Process changes

---

## Monitoring and Troubleshooting

### Common Issues and Solutions

**Issue: Migration fails with "Required table funds is missing"**

Cause: Core database migrations have not been applied.

Solution:
```bash
# Apply core migrations first
npm run db:push

# Then retry LP migrations
npm run migrate:lp
```

**Issue: Health check returns "degraded" for database**

Cause: One or more LP tables are missing or inaccessible.

Solution:
```bash
# Check which tables are missing
psql "$DATABASE_URL" -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_name LIKE 'lp_%' ORDER BY table_name;"

# Retry migration
npm run migrate:lp

# Or manually create missing tables
# Consult migration script for CREATE TABLE statements
```

**Issue: Report storage directory is not writable**

Cause: Incorrect permissions or disk full.

Solution:
```bash
# Check permissions
ls -la "${LP_REPORT_STORAGE_PATH:-/tmp/reports}"

# Fix permissions if needed
chmod 755 "${LP_REPORT_STORAGE_PATH:-/tmp/reports}"

# Check disk space
df -h "${LP_REPORT_STORAGE_PATH:-/tmp/reports}"

# If disk full, clean old reports
find "${LP_REPORT_STORAGE_PATH:-/tmp/reports}" -type f -mtime +30 -delete
```

**Issue: Rate limiting is too aggressive**

Cause: Rate limit settings are too low for legitimate traffic.

Solution:
```bash
# Update environment variables
LP_RATE_LIMIT_MAX=200  # Increase from 100
LP_RATE_LIMIT_WINDOW_MS=60000  # Keep window same

# Restart application
systemctl restart app-api
```

**Issue: LP endpoints return 401 Unauthorized**

Cause: LP access middleware is not configured correctly.

Solution:
```bash
# Verify authentication is enabled
echo $REQUIRE_AUTH  # Should be 1

# Check authorization header
curl -X GET "http://api.example.com/api/lp/profile" \
  -H "Authorization: Bearer YOUR_VALID_TOKEN"

# Verify LP_ID header is present
curl -X GET "http://api.example.com/api/lp/profile" \
  -H "Authorization: Bearer YOUR_VALID_TOKEN" \
  -H "X-LP-ID: 1"
```

### Health Check Interpretation

The `/api/lp/health` endpoint returns detailed status for each component:

**Database Status**
- `healthy`: All LP tables accessible and responding normally
- `degraded`: Some LP tables are missing or slow (< 200ms)
- `unhealthy`: Cannot connect to database

**Redis Status**
- `healthy`: Redis connection successful and ping < 100ms
- `degraded`: Redis connection slow (> 100ms) or disabled
- `unhealthy`: Redis connection failed (if enabled)

**Report Storage Status**
- `healthy`: Directory exists and is writable
- `degraded`: Directory exists but not writable
- `unhealthy`: Directory does not exist

**Overall Status**
- `healthy`: All checks are healthy
- `degraded`: One or more checks are degraded but functional
- `unhealthy`: One or more checks are unhealthy - feature may not work

### Monitoring Queries

Monitor LP feature health with these database queries:

**Table size and growth**
```sql
SELECT
  schemaname, tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE 'lp_%' OR tablename LIKE 'capital_%' OR tablename = 'report_templates'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**Migration status**
```sql
SELECT
  id, name,
  age(now(), applied_at) as applied_duration
FROM lp_reporting_migrations
ORDER BY applied_at DESC;
```

**Report generation queue**
```sql
SELECT
  status,
  count(*) as count,
  max(created_at) as latest
FROM lp_reports
GROUP BY status
ORDER BY count DESC;
```

**LP commitments by fund**
```sql
SELECT
  f.name, count(lc.id) as num_lps,
  sum(lc.commitment_amount_cents) / 100.0 as total_committed_usd
FROM lp_fund_commitments lc
JOIN funds f ON f.id = lc.fund_id
GROUP BY f.id, f.name
ORDER BY total_committed_usd DESC;
```

### Alert Thresholds

Recommended alert thresholds for monitoring systems:

| Metric | Warning | Critical |
|--------|---------|----------|
| Health check latency | > 500ms | > 1000ms |
| Database response time | > 200ms | > 500ms |
| LP endpoint errors | > 1% | > 5% |
| Report generation failures | > 10% | > 25% |
| Storage usage | > 80% | > 95% |
| Redis latency (if enabled) | > 100ms | > 500ms |

---

## Support and Escalation

**Primary Contact**: [Engineering Lead Name]
**Backup Contact**: [DevOps Lead Name]
**On-Call Escalation**: [Pagerduty/Slack channel]

For deployment issues:
1. Check health endpoint: `GET /api/lp/health`
2. Review logs: `/var/log/app/api.log`
3. Check database migrations: `SELECT * FROM lp_reporting_migrations;`
4. Contact primary contact for immediate assistance

Last updated: 2025-01-01
Revision: 1.0
